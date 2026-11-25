import {
  AssigneeAllocation,
  BurndownPoint,
  HealthSubMetric,
  KpiSummary,
  NormalizedIssue,
  RagStatus,
  SprintHealth,
} from '../types.js';

function toYmd(dateStr: string): string {
  return dateStr.slice(0, 10);
}

function enumerateDays(startYmd: string, endYmd: string): string[] {
  const start = new Date(`${startYmd}T00:00:00Z`);
  const end = new Date(`${endYmd}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [startYmd];
  }

  const days: string[] = [];
  const cur = new Date(start);
  while (cur <= end && days.length < 60) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export function isBlockedIssue(issue: NormalizedIssue): boolean {
  if (issue.flagged) return true;
  const s = issue.status.toLowerCase();
  if (s.includes('blocked') || s.includes('impediment') || s.includes('on hold')) return true;
  if (issue.labels.some((l) => ['blocked', 'impediment'].includes(l.toLowerCase()))) return true;
  return issue.issueLinks.some((l) => {
    const lower = l.toLowerCase();
    return lower.includes('blocked by') || lower.includes('inward:');
  });
}

export function calculateKpis(issues: NormalizedIssue[], includeSubtasks: boolean): KpiSummary {
  const filtered = includeSubtasks ? issues : issues.filter((i) => !i.isSubtask);
  const totalItems = filtered.length;
  const completed = filtered.filter((i) => i.statusCategory === 'Done').length;
  const inProgress = filtered.filter((i) => i.statusCategory === 'In Progress').length;
  const todo = filtered.filter((i) => i.statusCategory === 'To Do').length;
  const blockedOrFlagged = filtered.filter((i) => i.statusCategory !== 'Done' && isBlockedIssue(i)).length;
  const completionPct = totalItems > 0 ? Math.round((completed / totalItems) * 100) : 0;

  return {
    totalItems,
    completed,
    inProgress,
    todo,
    blockedOrFlagged,
    completionPct,
  };
}

export function calculateBurndown(
  issues: NormalizedIssue[],
  startDate: string,
  endDate: string,
  includeSubtasks: boolean,
  referenceDateYmd?: string
): BurndownPoint[] {
  const filtered = includeSubtasks ? issues : issues.filter((i) => !i.isSubtask);
  const total = filtered.length;
  const totalEstHours = filtered.reduce((sum, i) => sum + (i.originalEstimateHours || 0), 0);
  const days = enumerateDays(startDate, endDate);
  const todayYmd = referenceDateYmd || new Date().toISOString().slice(0, 10);
  const effectiveToday = todayYmd < startDate ? endDate : todayYmd;

  return days.map((day, idx) => {
    const idealRemaining =
      days.length > 1
        ? Number((total - (total * idx) / (days.length - 1)).toFixed(1))
        : 0;
    const idealHoursRemaining =
      days.length > 1
        ? Number((totalEstHours - (totalEstHours * idx) / (days.length - 1)).toFixed(1))
        : 0;

    if (day > effectiveToday) {
      return {
        day,
        dayLabel: `Day ${idx + 1}`,
        idealRemaining,
        actualRemaining: null,
        itemsDone: null,
        idealHoursRemaining,
        actualHoursRemaining: null,
        hoursLoggedCumulative: null,
      };
    }

    const doneByDayIssues = filtered.filter((issue) => {
      if (issue.statusCategory !== 'Done') return false;
      const resolvedYmd = issue.resolved ? toYmd(issue.resolved) : toYmd(issue.updated);
      return resolvedYmd <= day;
    });

    const doneByDay = doneByDayIssues.length;
    const doneHoursByDay = doneByDayIssues.reduce(
      (sum, i) => sum + (i.originalEstimateHours || 0),
      0
    );
    const loggedByDay = filtered
      .filter((i) => toYmd(i.updated) <= day)
      .reduce((sum, i) => sum + (i.timeSpentHours || 0), 0);

    return {
      day,
      dayLabel: `Day ${idx + 1}`,
      idealRemaining,
      actualRemaining: Math.max(0, total - doneByDay),
      itemsDone: doneByDay,
      idealHoursRemaining,
      actualHoursRemaining: Number(Math.max(0, totalEstHours - doneHoursByDay).toFixed(1)),
      hoursLoggedCumulative: Number(loggedByDay.toFixed(1)),
    };
  });
}

export function calculateAssigneeAllocations(
  issues: NormalizedIssue[],
  includeSubtasks: boolean
): AssigneeAllocation[] {
  const map = new Map<string, AssigneeAllocation>();

  for (const issue of issues) {
    const name = issue.assignee || 'Unassigned';
    const cur = map.get(name) || {
      assignee: name,
      totalTasks: 0,
      doneTasks: 0,
      inProgressTasks: 0,
      todoTasks: 0,
      originalEstimateHours: 0,
      timeSpentHours: 0,
    };

    if (includeSubtasks || !issue.isSubtask) {
      cur.totalTasks += 1;
      if (issue.statusCategory === 'Done') cur.doneTasks += 1;
      else if (issue.statusCategory === 'In Progress') cur.inProgressTasks += 1;
      else cur.todoTasks += 1;
    }

    if (issue.isSubtask) {
      cur.originalEstimateHours = Number(
        (cur.originalEstimateHours + (issue.originalEstimateHours || 0)).toFixed(1)
      );
      cur.timeSpentHours = Number((cur.timeSpentHours + (issue.timeSpentHours || 0)).toFixed(1));
    }
    map.set(name, cur);
  }

  const result = Array.from(map.values()).sort((a, b) => b.totalTasks - a.totalTasks);
  const hasSubtaskHours = result.some((r) => r.originalEstimateHours > 0 || r.timeSpentHours > 0);
  if (!hasSubtaskHours) {
    for (const r of result) {
      const personIssues = issues.filter((i) => (i.assignee || 'Unassigned') === r.assignee);
      r.originalEstimateHours = Number(
        personIssues.reduce((s, i) => s + (i.originalEstimateHours || 0), 0).toFixed(1)
      );
      r.timeSpentHours = Number(
        personIssues.reduce((s, i) => s + (i.timeSpentHours || 0), 0).toFixed(1)
      );
    }
  }

  return result;
}

export function calculateSprintHealth(
  issues: NormalizedIssue[],
  startDate: string,
  endDate: string,
  includeSubtasks: boolean,
  referenceDateYmd?: string
): SprintHealth {
  const filtered = includeSubtasks ? issues : issues.filter((i) => !i.isSubtask);
  const total = filtered.length;
  const todayYmd = referenceDateYmd || new Date().toISOString().slice(0, 10);

  const burndown = calculateBurndown(filtered, startDate, endDate, true, todayYmd);
  const currentPoint =
    [...burndown].reverse().find((p) => p.actualRemaining !== null) || burndown[0];

  // 1. Burndown Pace Variance
  let paceVariancePct = 0;
  if (total > 0 && currentPoint && currentPoint.actualRemaining !== null) {
    paceVariancePct = Math.round(
      ((currentPoint.actualRemaining - currentPoint.idealRemaining) / total) * 100
    );
  }
  const paceStatus: HealthSubMetric['status'] =
    paceVariancePct <= 10 ? 'healthy' : paceVariancePct <= 25 ? 'warning' : 'critical';

  // 2. Scope Creep (Created > Sprint Start Date)
  const scopeCreepCount = filtered.filter((i) => toYmd(i.created) > startDate).length;
  const scopeCreepPct = total > 0 ? Math.round((scopeCreepCount / total) * 100) : 0;
  const scopeStatus: HealthSubMetric['status'] =
    scopeCreepPct <= 10 ? 'healthy' : scopeCreepPct <= 20 ? 'warning' : 'critical';

  // 3. Blocker Load
  const activeIssues = filtered.filter((i) => i.statusCategory !== 'Done');
  const blockedCount = activeIssues.filter(isBlockedIssue).length;
  const blockerPct =
    activeIssues.length > 0 ? Math.round((blockedCount / activeIssues.length) * 100) : 0;
  const blockerStatus: HealthSubMetric['status'] =
    blockerPct === 0 ? 'healthy' : blockerPct <= 15 ? 'warning' : 'critical';

  // 4. Stale WIP (In Progress with no Updated in 3+ days)
  const refMs = new Date(`${todayYmd}T23:59:59Z`).getTime();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const staleWipCount = filtered.filter((i) => {
    if (i.statusCategory !== 'In Progress') return false;
    const updatedMs = new Date(i.updated).getTime();
    return !Number.isNaN(updatedMs) && refMs - updatedMs >= threeDaysMs;
  }).length;
  const staleStatus: HealthSubMetric['status'] =
    staleWipCount === 0 ? 'healthy' : staleWipCount <= 2 ? 'warning' : 'critical';

  // 5. Late High-Priority Risk (High/Highest in To Do past midpoint)
  const days = enumerateDays(startDate, endDate);
  const midpointYmd = days[Math.floor(days.length / 2)] || startDate;
  const pastMidpoint = todayYmd >= midpointYmd;
  const lateHighPriCount = pastMidpoint
    ? filtered.filter(
        (i) =>
          i.statusCategory === 'To Do' &&
          ['high', 'highest', 'critical', 'blocker'].includes(i.priority.toLowerCase())
      ).length
    : 0;
  const latePriStatus: HealthSubMetric['status'] =
    lateHighPriCount === 0 ? 'healthy' : lateHighPriCount <= 1 ? 'warning' : 'critical';

  // Deterministic Score (0-100)
  let score = 100;
  if (paceStatus === 'warning') score -= 15;
  if (paceStatus === 'critical') score -= 30;
  if (scopeStatus === 'warning') score -= 10;
  if (scopeStatus === 'critical') score -= 20;
  if (blockerStatus === 'warning') score -= 10;
  if (blockerStatus === 'critical') score -= 25;
  if (staleStatus === 'warning') score -= 8;
  if (staleStatus === 'critical') score -= 15;
  if (latePriStatus === 'warning') score -= 7;
  if (latePriStatus === 'critical') score -= 15;
  score = Math.max(0, Math.min(100, score));

  const ragStatus: RagStatus = score >= 80 ? 'Green' : score >= 55 ? 'Amber' : 'Red';

  const subMetrics: HealthSubMetric[] = [
    {
      id: 'burndown_pace',
      label: 'Burndown Pace',
      value: paceVariancePct <= 0 ? 'On Pace' : `${paceVariancePct}% behind`,
      status: paceStatus,
      detail: `Actual remaining vs. ideal linear target`,
    },
    {
      id: 'scope_creep',
      label: 'Scope Creep',
      value: `${scopeCreepCount} (${scopeCreepPct}%)`,
      status: scopeStatus,
      detail: `Items created after ${startDate}`,
    },
    {
      id: 'blocker_load',
      label: 'Blocker Load',
      value: `${blockedCount} (${blockerPct}%)`,
      status: blockerStatus,
      detail: `Active items flagged or blocked`,
    },
    {
      id: 'stale_wip',
      label: 'Stale WIP',
      value: `${staleWipCount} items`,
      status: staleStatus,
      detail: `In Progress with no update in 3+ days`,
    },
    {
      id: 'late_high_priority',
      label: 'Late High-Pri',
      value: `${lateHighPriCount} items`,
      status: latePriStatus,
      detail: pastMidpoint ? 'High/Highest in To Do past midpoint' : 'Before sprint midpoint',
    },
  ];

  const executiveSummary =
    ragStatus === 'Green'
      ? `Sprint is on track with a health score of ${score}/100 and steady execution against the ideal burndown.`
      : `Sprint is ${ragStatus === 'Amber' ? 'at risk' : 'off track'} (${score}/100) driven by ${
          subMetrics
            .filter((m) => m.status !== 'healthy')
            .map((m) => m.label.toLowerCase())
            .join(', ') || 'delivery variance'
        }. Recommended action: unblock flagged items and swarm on stale WIP.`;

  return {
    ragStatus,
    score,
    subMetrics,
    executiveSummary,
  };
}
