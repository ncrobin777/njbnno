import { describe, it, expect } from 'vitest';
import { parseJiraCsv } from './csvParser.js';
import { calculateBurndown, calculateKpis, calculateSprintHealth } from './analytics.js';

describe('parseJiraCsv', () => {
  it('aggregates duplicate Jira CSV headers into arrays without overwriting', () => {
    const csv = [
      'Issue key,Summary,Issue Type,Status,Priority,Assignee,Created,Resolved,Updated,Sprint,Sprint,Labels,Labels,Comment,Comment,Inward issue link (Blocks),Outward issue link (Depends on),Flagged',
      'PROJ-101,Build auth API,Story,Done,High,Alice,2026-11-10T10:00:00Z,2026-11-12T15:00:00Z,2026-11-12T15:00:00Z,Sprint 1,Sprint 2,backend,security,Initial spec,Reviewed by QA,PROJ-99,,',
      'PROJ-102,Fix SSO redirect,Bug,In Progress,Highest,Bob,2026-11-11T09:00:00Z,,2026-11-11T09:00:00Z,Sprint 2,,auth,,Waiting on IdP,,,PROJ-101,Impediment',
    ].join('\n');

    const result = parseJiraCsv(csv);
    expect(result.issues).toHaveLength(2);
    expect(result.availableSprints).toEqual(['Sprint 1', 'Sprint 2']);

    const first = result.issues[0];
    expect(first.sprints).toEqual(['Sprint 1', 'Sprint 2']);
    expect(first.labels).toEqual(['backend', 'security']);
    expect(first.comments).toEqual(['Initial spec', 'Reviewed by QA']);
    expect(first.issueLinks).toEqual(['is blocked by: PROJ-99']);
    expect(first.statusCategory).toBe('Done');

    const second = result.issues[1];
    expect(second.flagged).toBe(true);
    expect(second.issueLinks).toEqual(['Depends on: PROJ-101']);
  });
});

describe('analytics engine', () => {
  it('calculates item-count burndown and deterministic sprint health', () => {
    const csv = [
      'Issue key,Summary,Issue Type,Status,Priority,Assignee,Created,Resolved,Updated,Sprint,Flagged',
      'PROJ-1,Story 1,Story,Done,Medium,Alice,2026-11-01T10:00:00Z,2026-11-02T12:00:00Z,2026-11-02T12:00:00Z,Sprint 1,',
      'PROJ-2,Subtask 1,Sub-task,Done,Low,Alice,2026-11-01T10:00:00Z,2026-11-02T12:00:00Z,2026-11-02T12:00:00Z,Sprint 1,',
      'PROJ-3,Story 2,Story,In Progress,High,Bob,2026-11-01T10:00:00Z,,2026-11-02T12:00:00Z,Sprint 1,Impediment',
    ].join('\n');

    const { issues } = parseJiraCsv(csv);
    const kpisNoSub = calculateKpis(issues, false);
    expect(kpisNoSub.totalItems).toBe(2);
    expect(kpisNoSub.completed).toBe(1);
    expect(kpisNoSub.blockedOrFlagged).toBe(1);

    const burndown = calculateBurndown(issues, '2026-11-01', '2026-11-05', false, '2026-11-03');
    expect(burndown[0].actualRemaining).toBe(2); // Day 1: 0 done
    expect(burndown[1].actualRemaining).toBe(1); // Day 2: 1 done
    expect(burndown[3].actualRemaining).toBeNull(); // Future day

    const health = calculateSprintHealth(issues, '2026-11-01', '2026-11-05', false, '2026-11-03');
    expect(health.score).toBeLessThan(100);
    expect(health.subMetrics).toHaveLength(5);
  });
});
