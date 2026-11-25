import { parse } from 'csv-parse/sync';
import { NormalizedIssue, StatusCategory } from '../types.js';

export interface CsvParseResult {
  issues: NormalizedIssue[];
  availableSprints: string[];
  detectedStartDate: string;
  detectedEndDate: string;
}

function normalizeStatusCategory(status: string, rawCategory?: string): StatusCategory {
  const s = status.trim().toLowerCase();
  if (['done', 'closed', 'resolved', 'complete', 'completed', 'released', 'qa', 'in qa', 'ready for qa', 'qa passed'].includes(s)) {
    return 'Done';
  }

  const cat = (rawCategory || '').trim().toLowerCase();
  if (cat === 'done') return 'Done';
  if (cat === 'in progress' || cat === 'indeterminate') return 'In Progress';
  if (cat === 'to do' || cat === 'new') return 'To Do';

  if (
    ['in progress', 'in review', 'code review', 'testing', 'review', 'doing', 'blocked'].includes(s)
  ) {
    return 'In Progress';
  }
  return 'To Do';
}

function parseJiraDate(raw: string | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  return null;
}

function parseSecondsToHours(raw: string | undefined): number {
  if (!raw || !raw.trim()) return 0;
  const num = Number(raw.trim());
  if (Number.isNaN(num) || num <= 0) return 0;
  return Number((num / 3600).toFixed(2));
}

function toYmd(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Parses Jira "Export Excel CSV (all fields)" by column index so duplicate
 * headers (Sprint, Comment, Labels, Inward/Outward issue link) are aggregated
 * into arrays rather than overwritten.
 */
export function parseJiraCsv(csvBuffer: Buffer | string): CsvParseResult {
  const content = typeof csvBuffer === 'string' ? csvBuffer : csvBuffer.toString('utf-8');
  const rows = parse(content, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  }) as string[][];

  if (rows.length < 2) {
    throw new Error('CSV file must contain a header row and at least one issue row.');
  }

  const headers = rows[0].map((h) => h.trim());
  const headerLower = headers.map((h) => h.toLowerCase());

  const findIndices = (predicate: (h: string) => boolean): number[] =>
    headerLower.reduce<number[]>((acc, h, idx) => {
      if (predicate(h)) acc.push(idx);
      return acc;
    }, []);

  const firstIdx = (names: string[]): number => {
    for (const n of names) {
      const idx = headerLower.indexOf(n.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idxKey = firstIdx(['issue key', 'key']);
  const idxSummary = firstIdx(['summary']);
  const idxIssueType = firstIdx(['issue type', 'issuetype', 'type']);
  const idxStatus = firstIdx(['status']);
  const idxStatusCat = firstIdx(['status category']);
  const idxPriority = firstIdx(['priority']);
  const idxAssignee = firstIdx(['assignee']);
  const idxCreated = firstIdx(['created']);
  const idxResolved = firstIdx(['resolved', 'resolution date']);
  const idxUpdated = firstIdx(['updated']);
  const idxDescription = firstIdx(['description']);
  const idxParentKey = firstIdx(['parent key', 'parent']);
  const idxFlagged = firstIdx(['flagged', 'custom field (flagged)']);
  const idxOriginalEstimate = firstIdx(['original estimate', 'σ original estimate', 'timeoriginalestimate']);
  const idxTimeSpent = firstIdx(['time spent', 'σ time spent', 'timespent', 'time logged']);

  const sprintIndices = findIndices((h) => h === 'sprint' || h.startsWith('sprint '));
  const labelIndices = findIndices((h) => h === 'labels' || h === 'label');
  const commentIndices = findIndices((h) => h === 'comment' || h === 'comments');
  const inwardLinkIndices = findIndices((h) => h.startsWith('inward issue link'));
  const outwardLinkIndices = findIndices((h) => h.startsWith('outward issue link'));

  if (idxKey === -1 || idxSummary === -1) {
    throw new Error('Invalid Jira CSV: missing required "Issue key" or "Summary" column.');
  }

  const sprintSet = new Set<string>();
  const issues: NormalizedIssue[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const key = (row[idxKey] || '').trim();
    if (!key) continue;

    const summary = (row[idxSummary] || '').trim();
    const issueType = idxIssueType !== -1 ? (row[idxIssueType] || 'Task').trim() : 'Task';
    const isSubtask = issueType.toLowerCase().includes('sub-task') || issueType.toLowerCase().includes('subtask');
    const status = idxStatus !== -1 ? (row[idxStatus] || 'To Do').trim() : 'To Do';
    const statusCatRaw = idxStatusCat !== -1 ? row[idxStatusCat] : undefined;
    const statusCategory = normalizeStatusCategory(status, statusCatRaw);
    const priority = idxPriority !== -1 ? (row[idxPriority] || 'Medium').trim() : 'Medium';
    const assignee = idxAssignee !== -1 ? (row[idxAssignee] || 'Unassigned').trim() || 'Unassigned' : 'Unassigned';

    const created = (idxCreated !== -1 ? parseJiraDate(row[idxCreated]) : null) || new Date().toISOString();
    const resolved = idxResolved !== -1 ? parseJiraDate(row[idxResolved]) : null;
    const updated = (idxUpdated !== -1 ? parseJiraDate(row[idxUpdated]) : null) || created;
    const description = idxDescription !== -1 ? (row[idxDescription] || '').trim() : '';

    const flaggedRaw = idxFlagged !== -1 ? (row[idxFlagged] || '').trim().toLowerCase() : '';
    const flagged =
      flaggedRaw !== '' && !['false', 'no', '0', 'none'].includes(flaggedRaw);
    const originalEstimateHours =
      idxOriginalEstimate !== -1 ? parseSecondsToHours(row[idxOriginalEstimate]) : 0;
    const timeSpentHours =
      idxTimeSpent !== -1 ? parseSecondsToHours(row[idxTimeSpent]) : 0;

    const sprints: string[] = [];
    for (const idx of sprintIndices) {
      const val = (row[idx] || '').trim();
      if (val) {
        sprints.push(val);
        sprintSet.add(val);
      }
    }

    const labels: string[] = [];
    for (const idx of labelIndices) {
      const val = (row[idx] || '').trim();
      if (val) {
        for (const part of val.split(/[\s,]+/)) {
          if (part.trim()) labels.push(part.trim());
        }
      }
    }

    const comments: string[] = [];
    for (const idx of commentIndices) {
      const val = (row[idx] || '').trim();
      if (val) comments.push(val);
    }

    const issueLinks: string[] = [];
    for (const idx of inwardLinkIndices) {
      const val = (row[idx] || '').trim();
      if (val) {
        const headerLabel = headers[idx].replace(/^Inward issue link\s*\((.+)\)$/i, '$1').trim();
        if (headerLabel.toLowerCase() === 'blocks') {
          issueLinks.push(`is blocked by: ${val}`);
        } else {
          issueLinks.push(headerLabel ? `${headerLabel}: ${val}` : `inward: ${val}`);
        }
      }
    }
    for (const idx of outwardLinkIndices) {
      const val = (row[idx] || '').trim();
      if (val) {
        const headerLabel = headers[idx].replace(/^Outward issue link\s*\((.+)\)$/i, '$1').trim();
        issueLinks.push(headerLabel ? `${headerLabel}: ${val}` : `outward: ${val}`);
      }
    }

    issues.push({
      key,
      summary,
      issueType,
      isSubtask,
      parentKey: idxParentKey !== -1 ? (row[idxParentKey] || '').trim() || undefined : undefined,
      status,
      statusCategory,
      priority,
      assignee,
      created,
      resolved,
      updated,
      sprints,
      labels,
      flagged,
      originalEstimateHours,
      timeSpentHours,
      description,
      comments,
      issueLinks,
    });
  }

  // Auto-detect sprint date range (default 14-day window ending at latest updated/resolved or today)
  const now = new Date();
  const defaultEnd = toYmd(now.toISOString());
  const twoWeeksAgo = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000);
  const defaultStart = toYmd(twoWeeksAgo.toISOString());

  return {
    issues,
    availableSprints: Array.from(sprintSet),
    detectedStartDate: defaultStart,
    detectedEndDate: defaultEnd,
  };
}
