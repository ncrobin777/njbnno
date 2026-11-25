import { DashboardPayload } from '../types';

export function exportAsMarkdown(data: DashboardPayload): void {
  const lines: string[] = [
    `# Executive Sprint Report: ${data.sprint.name}`,
    `**Dates:** ${data.sprint.startDate} to ${data.sprint.endDate} | **Source:** ${data.sprint.source === 'csv' ? 'Jira CSV' : 'Jira Cloud API'}`,
    '',
    `## Sprint Health: ${data.health.ragStatus} (${data.health.score}/100)`,
    data.health.executiveSummary,
    '',
    '### Health Sub-Metrics',
    ...data.health.subMetrics.map((m) => `- **${m.label}:** ${m.value} (${m.status})`),
    '',
    '## Key Metrics',
    `- **Total Items:** ${data.kpis.totalItems}`,
    `- **Completed:** ${data.kpis.completed} (${data.kpis.completionPct}%)`,
    `- **In Progress:** ${data.kpis.inProgress}`,
    `- **Blocked / Flagged:** ${data.kpis.blockedOrFlagged}`,
    '',
    '## Key Achievements',
    ...data.achievements.map(
      (a) => `- ${a.text}${a.issueKeys.length ? ` (${a.issueKeys.join(', ')})` : ''}`
    ),
    '',
    '## Key Increments',
    ...data.increments.map(
      (inc) =>
        `- **${inc.title}**: ${inc.businessImpact}${inc.issueKeys.length ? ` [${inc.issueKeys.join(', ')}]` : ''}`
    ),
    '',
    '## Sprint RAID Log',
    ...data.raid.map(
      (r) =>
        `- **[${r.category} | ${r.severity}] ${r.title}**: ${r.description} (${r.issueKeys.join(', ')})`
    ),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.sprint.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_executive_report.md`;
  a.click();
  URL.revokeObjectURL(url);
}
