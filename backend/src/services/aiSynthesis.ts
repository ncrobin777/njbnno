import {
  AchievementItem,
  AiConfig,
  IncrementItem,
  NormalizedIssue,
  RaidItem,
  SprintHealth,
} from '../types.js';
import { isBlockedIssue } from './analytics.js';

export interface SynthesisResult {
  executiveSummary: string;
  raid: RaidItem[];
  achievements: AchievementItem[];
  increments: IncrementItem[];
}

function buildDeterministicFallback(
  issues: NormalizedIssue[],
  health: SprintHealth
): SynthesisResult {
  const doneIssues = issues.filter((i) => i.statusCategory === 'Done');
  const activeIssues = issues.filter((i) => i.statusCategory !== 'Done');
  const blocked = activeIssues.filter(isBlockedIssue);
  const highPriTodo = activeIssues.filter(
    (i) =>
      i.statusCategory === 'To Do' &&
      ['high', 'highest', 'critical'].includes(i.priority.toLowerCase())
  );
  const linkedDeps = issues.filter((i) => i.issueLinks.length > 0);

  const raid: RaidItem[] = [];
  blocked.slice(0, 4).forEach((i, idx) => {
    raid.push({
      id: `issue-${idx}`,
      category: 'Issue',
      title: `Blocked / Flagged: ${i.summary}`,
      description: `Ticket ${i.key} is currently ${i.flagged ? 'flagged' : 'blocked'} (${i.status}).`,
      issueKeys: [i.key],
      severity: 'High',
    });
  });

  highPriTodo.slice(0, 3).forEach((i, idx) => {
    raid.push({
      id: `risk-${idx}`,
      category: 'Risk',
      title: `Unstarted High-Priority Item: ${i.summary}`,
      description: `${i.priority} priority ticket ${i.key} remains in ${i.status}.`,
      issueKeys: [i.key],
      severity: 'Medium',
    });
  });

  linkedDeps.slice(0, 3).forEach((i, idx) => {
    raid.push({
      id: `dep-${idx}`,
      category: 'Dependency',
      title: `Linked Dependency on ${i.key}`,
      description: `${i.key} (${i.summary}) has links: ${i.issueLinks.slice(0, 2).join(', ')}.`,
      issueKeys: [i.key],
      severity: 'Medium',
    });
  });

  if (raid.length === 0) {
    raid.push({
      id: 'assumption-0',
      category: 'Assumption',
      title: 'Standard Sprint Capacity & Scope',
      description: 'No active blockers or critical cross-team dependencies detected in current ticket metadata.',
      issueKeys: issues.slice(0, 1).map((i) => i.key),
      severity: 'Low',
    });
  }

  const achievements: AchievementItem[] = doneIssues.slice(0, 5).map((i, idx) => ({
    id: `ach-${idx}`,
    text: `Completed ${i.issueType.toLowerCase()}: ${i.summary}`,
    issueKeys: [i.key],
  }));

  if (achievements.length === 0) {
    achievements.push({
      id: 'ach-empty',
      text: 'Sprint execution underway; no items marked Done yet.',
      issueKeys: [],
    });
  }

  const incrementCandidates = doneIssues.filter(
    (i) =>
      !i.isSubtask &&
      ['story', 'feature', 'enhancement', 'bug', 'new feature'].includes(i.issueType.toLowerCase())
  );

  const increments: IncrementItem[] = incrementCandidates.slice(0, 4).map((i, idx) => ({
    id: `inc-${idx}`,
    title: i.summary,
    businessImpact: `Delivered ${i.issueType} (${i.priority} priority) by ${i.assignee}.`,
    issueKeys: [i.key],
  }));

  return {
    executiveSummary: health.executiveSummary,
    raid,
    achievements,
    increments,
  };
}

function buildPrompt(issues: NormalizedIssue[], health: SprintHealth): string {
  const compact = issues.slice(0, 60).map((i) => ({
    key: i.key,
    summary: i.summary,
    type: i.issueType,
    status: i.status,
    category: i.statusCategory,
    priority: i.priority,
    flagged: i.flagged,
    links: i.issueLinks,
    comments: i.comments.slice(0, 2),
  }));

  return `You are an Agile Delivery Architect preparing an Executive Sprint Dashboard.
Sprint Health: ${health.ragStatus} (${health.score}/100).
Metrics: ${health.subMetrics.map((m) => `${m.label}: ${m.value} (${m.status})`).join('; ')}.

Issues JSON:
${JSON.stringify(compact)}

Return ONLY valid JSON matching this exact schema (no markdown fences):
{
  "executiveSummary": "1-2 crisp sentences explaining health status and #1 recommended action if Amber/Red.",
  "raid": [
    { "id": "r1", "category": "Risk|Assumption|Issue|Dependency", "title": "...", "description": "...", "issueKeys": ["PROJ-1"], "severity": "High|Medium|Low" }
  ],
  "achievements": [
    { "id": "a1", "text": "Business-focused outcome...", "issueKeys": ["PROJ-1", "PROJ-2"] }
  ],
  "increments": [
    { "id": "i1", "title": "Shippable Increment", "businessImpact": "...", "issueKeys": ["PROJ-1"] }
  ]
}`;
}

export async function synthesizeExecutiveNarrative(
  issues: NormalizedIssue[],
  health: SprintHealth,
  aiConfig: AiConfig
): Promise<SynthesisResult> {
  if (aiConfig.provider === 'none' || (!aiConfig.apiKey && aiConfig.provider !== 'ollama')) {
    return buildDeterministicFallback(issues, health);
  }

  const prompt = buildPrompt(issues, health);

  try {
    let rawText = '';

    if (aiConfig.provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: aiConfig.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
      const data = (await res.json()) as any;
      rawText = data.choices?.[0]?.message?.content || '';
    } else if (aiConfig.provider === 'gemini') {
      const model = aiConfig.model || 'gemini-3.8-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini error ${res.status}`);
      const data = (await res.json()) as any;
      rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (aiConfig.provider === 'ollama') {
      const base = (aiConfig.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
      const res = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: aiConfig.model || 'llama3.1',
          prompt,
          format: 'json',
          stream: false,
        }),
      });
      if (!res.ok) throw new Error(`Ollama error ${res.status}`);
      const data = (await res.json()) as any;
      rawText = data.response || '';
    }

    const parsed = JSON.parse(rawText) as Partial<SynthesisResult>;
    const fallback = buildDeterministicFallback(issues, health);
    return {
      executiveSummary: parsed.executiveSummary || fallback.executiveSummary,
      raid: Array.isArray(parsed.raid) && parsed.raid.length > 0 ? parsed.raid : fallback.raid,
      achievements:
        Array.isArray(parsed.achievements) && parsed.achievements.length > 0
          ? parsed.achievements
          : fallback.achievements,
      increments:
        Array.isArray(parsed.increments) && parsed.increments.length > 0
          ? parsed.increments
          : fallback.increments,
    };
  } catch {
    return buildDeterministicFallback(issues, health);
  }
}
