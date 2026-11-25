import { JiraConfig, NormalizedIssue, StatusCategory } from '../types.js';
import { getCached, setCached } from './cache.js';

const JIRA_FIELDS = [
  'summary',
  'status',
  'issuetype',
  'priority',
  'assignee',
  'created',
  'resolutiondate',
  'updated',
  'labels',
  'comment',
  'issuelinks',
  'flagged',
  'timeoriginalestimate',
  'timespent',
  'parent',
  'description',
].join(',');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Rate-limit & hourly points budget guard (Jira Free/Standard Plan: 100 req/sec, 65,000 pts/hr)
const MIN_REQUEST_INTERVAL_MS = 100; // max 10 req/sec (well below 100 req/sec)
const HOURLY_POINTS_CAP = 60000; // 5,000-pt safety buffer under 65,000 pts/hr
let lastRequestAt = 0;
let currentUtcHour = new Date().getUTCHours();
let hourlyPointsUsed = 0;

async function acquireRateLimitSlot(estimatedPoints = 100): Promise<void> {
  const nowHour = new Date().getUTCHours();
  if (nowHour !== currentUtcHour) {
    currentUtcHour = nowHour;
    hourlyPointsUsed = 0;
  }

  if (hourlyPointsUsed + estimatedPoints > HOURLY_POINTS_CAP) {
    throw new Error(
      `Jira hourly points budget (${HOURLY_POINTS_CAP} pts/hr) reached. Please wait until the next UTC hour or use cached data.`
    );
  }

  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }
  lastRequestAt = Date.now();
  hourlyPointsUsed += estimatedPoints;
}

function buildAuthHeader(config: JiraConfig): string {
  const token = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  return `Basic ${token}`;
}

export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProto);
  } catch {
    throw new Error('Invalid Jira Base URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Jira Base URL must use HTTPS.');
  }

  const host = parsed.hostname.toLowerCase();
  // Block IP literals, localhost, and internal hostnames (SSRF protection)
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(':')
  ) {
    throw new Error('Blocked internal or IP-based Jira URL.');
  }

  const extraHosts = (process.env.ALLOWED_JIRA_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (!host.endsWith('.atlassian.net') && !extraHosts.includes(host)) {
    throw new Error('Jira Base URL must be an *.atlassian.net domain.');
  }

  return `${parsed.protocol}//${parsed.host}`;
}

/**
 * Standard-Plan-safe fetch wrapper:
 * - Honors 429 Too Many Requests + Retry-After header
 * - Exponential backoff with jitter up to 4 retries
 */
async function fetchWithBackoff(url: string, headers: Record<string, string>, maxRetries = 4): Promise<Response> {
  let attempt = 0;
  while (true) {
    await acquireRateLimitSlot(100);
    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (err: any) {
      const cause = err?.cause?.message || err?.cause?.code || err?.message || 'Network error';
      throw new Error(`Cannot reach ${url}: ${cause}`);
    }
    if (res.status !== 429 && res.status < 500) {
      return res;
    }

    if (attempt >= maxRetries) {
      return res;
    }

    const retryAfterHeader = res.headers.get('Retry-After');
    let waitMs = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
    if (retryAfterHeader) {
      const seconds = Number(retryAfterHeader);
      if (!Number.isNaN(seconds) && seconds > 0) {
        waitMs = seconds * 1000 + 250;
      }
    }

    attempt += 1;
    await sleep(waitMs);
  }
}

export interface JiraBoard {
  id: number;
  name: string;
  type: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
}

export async function fetchJiraBoards(config: JiraConfig, forceSync = false): Promise<{ boards: JiraBoard[]; cachedAt: string }> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const cacheKey = `boards_${baseUrl}`;
  if (!forceSync) {
    const cached = getCached<JiraBoard[]>(cacheKey);
    if (cached) return { boards: cached.data, cachedAt: cached.cachedAt };
  }

  const headers = {
    Authorization: buildAuthHeader(config),
    Accept: 'application/json',
  };

  const res = await fetchWithBackoff(`${baseUrl}/rest/agile/1.0/board?maxResults=50`, headers);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API error (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { values?: JiraBoard[] };
  const boards = (json.values || []).map((b) => ({ id: b.id, name: b.name, type: b.type }));
  const ttl = Number(process.env.CACHE_TTL_MINUTES || 20);
  const cachedAt = setCached(cacheKey, boards, ttl);
  return { boards, cachedAt };
}

export async function fetchJiraSprints(
  config: JiraConfig,
  boardId: number,
  forceSync = false
): Promise<{ sprints: JiraSprint[]; cachedAt: string }> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const cacheKey = `sprints_${baseUrl}_${boardId}`;
  if (!forceSync) {
    const cached = getCached<JiraSprint[]>(cacheKey);
    if (cached) return { sprints: cached.data, cachedAt: cached.cachedAt };
  }

  const headers = {
    Authorization: buildAuthHeader(config),
    Accept: 'application/json',
  };

  const res = await fetchWithBackoff(
    `${baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active,closed,future&maxResults=50`,
    headers
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API error (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { values?: JiraSprint[] };
  const sprints = (json.values || []).map((s) => ({
    id: s.id,
    name: s.name,
    state: s.state,
    startDate: s.startDate,
    endDate: s.endDate,
  }));
  const ttl = Number(process.env.CACHE_TTL_MINUTES || 20);
  const cachedAt = setCached(cacheKey, sprints, ttl);
  return { sprints, cachedAt };
}

function mapJiraStatusCategory(catKey?: string): StatusCategory {
  if (catKey === 'done') return 'Done';
  if (catKey === 'indeterminate') return 'In Progress';
  return 'To Do';
}

function extractPlainText(adfOrString: unknown): string {
  if (!adfOrString) return '';
  if (typeof adfOrString === 'string') return adfOrString;
  if (typeof adfOrString === 'object') {
    try {
      return JSON.stringify(adfOrString).slice(0, 500);
    } catch {
      return '';
    }
  }
  return '';
}

export async function fetchSprintIssues(
  config: JiraConfig,
  sprintId: number,
  forceSync = false
): Promise<{ issues: NormalizedIssue[]; cachedAt: string }> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const cacheKey = `sprint_issues_${baseUrl}_${sprintId}`;
  if (!forceSync) {
    const cached = getCached<NormalizedIssue[]>(cacheKey);
    if (cached) return { issues: cached.data, cachedAt: cached.cachedAt };
  }

  const headers = {
    Authorization: buildAuthHeader(config),
    Accept: 'application/json',
  };

  const allIssues: NormalizedIssue[] = [];
  let startAt = 0;
  const maxResults = 100;
  let total = Infinity;

  // Sequential pagination (no parallel bursts)
  while (startAt < total) {
    const url = `${baseUrl}/rest/agile/1.0/sprint/${sprintId}/issue?startAt=${startAt}&maxResults=${maxResults}&fields=${encodeURIComponent(JIRA_FIELDS)}`;
    const res = await fetchWithBackoff(url, headers);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      total: number;
      issues: Array<{
        key: string;
        fields: Record<string, any>;
      }>;
    };

    total = data.total ?? 0;
    const batch = data.issues || [];
    if (batch.length === 0) break;

    for (const item of batch) {
      const f = item.fields || {};
      const issueTypeName = f.issuetype?.name || 'Task';
      const isSubtask = Boolean(f.issuetype?.subtask) || issueTypeName.toLowerCase().includes('sub-task');
      const statusName = f.status?.name || 'To Do';
      const statusCategory = mapJiraStatusCategory(f.status?.statusCategory?.key);

      const comments: string[] = (f.comment?.comments || [])
        .map((c: any) => extractPlainText(c.body))
        .filter(Boolean);

      const issueLinks: string[] = (f.issuelinks || []).map((link: any) => {
        if (link.inwardIssue) {
          return `${link.type?.inward || 'inward'}: ${link.inwardIssue.key}`;
        }
        if (link.outwardIssue) {
          return `${link.type?.outward || 'outward'}: ${link.outwardIssue.key}`;
        }
        return '';
      }).filter(Boolean);

      const flagged = Array.isArray(f.flagged) ? f.flagged.length > 0 : Boolean(f.flagged);

      allIssues.push({
        key: item.key,
        summary: f.summary || '',
        issueType: issueTypeName,
        isSubtask,
        parentKey: f.parent?.key || undefined,
        status: statusName,
        statusCategory,
        priority: f.priority?.name || 'Medium',
        assignee: f.assignee?.displayName || 'Unassigned',
        created: f.created || new Date().toISOString(),
        resolved: f.resolutiondate || null,
        updated: f.updated || f.created || new Date().toISOString(),
        sprints: [],
        labels: Array.isArray(f.labels) ? f.labels : [],
        flagged,
        originalEstimateHours: f.timeoriginalestimate ? Number((f.timeoriginalestimate / 3600).toFixed(2)) : 0,
        timeSpentHours: f.timespent ? Number((f.timespent / 3600).toFixed(2)) : 0,
        description: extractPlainText(f.description),
        comments,
        issueLinks,
      });
    }

    startAt += batch.length;
  }

  // Also fetch any child sub-tasks of the sprint's parent issues (since Jira Agile sprint endpoint omits sub-tasks)
  if (allIssues.length > 0) {
    const existingKeys = new Set(allIssues.map((i) => i.key));
    const parentKeys = allIssues.map((i) => i.key).slice(0, 100);
    const jql = `parent in (${parentKeys.join(',')})`;
    const subUrl = `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=${encodeURIComponent(JIRA_FIELDS)}`;
    const subRes = await fetchWithBackoff(subUrl, headers);
    if (subRes.ok) {
      const subData = (await subRes.json()) as {
        issues?: Array<{ key: string; fields: Record<string, any> }>;
      };
      for (const item of subData.issues || []) {
        if (existingKeys.has(item.key)) continue;
        const f = item.fields || {};
        const issueTypeName = f.issuetype?.name || 'Sub-task';
        const statusName = f.status?.name || 'To Do';
        const statusCategory = mapJiraStatusCategory(f.status?.statusCategory?.key);
        const comments: string[] = (f.comment?.comments || [])
          .map((c: any) => extractPlainText(c.body))
          .filter(Boolean);
        const issueLinks: string[] = (f.issuelinks || [])
          .map((link: any) => {
            if (link.inwardIssue) return `${link.type?.inward || 'inward'}: ${link.inwardIssue.key}`;
            if (link.outwardIssue) return `${link.type?.outward || 'outward'}: ${link.outwardIssue.key}`;
            return '';
          })
          .filter(Boolean);
        const flagged = Array.isArray(f.flagged) ? f.flagged.length > 0 : Boolean(f.flagged);

        allIssues.push({
          key: item.key,
          summary: f.summary || '',
          issueType: issueTypeName,
          isSubtask: true,
          parentKey: f.parent?.key || undefined,
          status: statusName,
          statusCategory,
          priority: f.priority?.name || 'Medium',
          assignee: f.assignee?.displayName || 'Unassigned',
          created: f.created || new Date().toISOString(),
          resolved: f.resolutiondate || null,
          updated: f.updated || f.created || new Date().toISOString(),
          sprints: [],
          labels: Array.isArray(f.labels) ? f.labels : [],
          flagged,
          originalEstimateHours: f.timeoriginalestimate
            ? Number((f.timeoriginalestimate / 3600).toFixed(2))
            : 0,
          timeSpentHours: f.timespent ? Number((f.timespent / 3600).toFixed(2)) : 0,
          description: extractPlainText(f.description),
          comments,
          issueLinks,
        });
      }
    }
  }

  const ttl = Number(process.env.CACHE_TTL_MINUTES || 20);
  const cachedAt = setCached(cacheKey, allIssues, ttl);
  return { issues: allIssues, cachedAt };
}
