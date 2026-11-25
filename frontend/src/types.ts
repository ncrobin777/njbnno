export type StatusCategory = 'To Do' | 'In Progress' | 'Done';

export interface NormalizedIssue {
  key: string;
  summary: string;
  issueType: string;
  isSubtask: boolean;
  parentKey?: string;
  status: string;
  statusCategory: StatusCategory;
  priority: string;
  assignee: string;
  created: string;
  resolved: string | null;
  updated: string;
  sprints: string[];
  labels: string[];
  flagged: boolean;
  originalEstimateHours: number;
  timeSpentHours: number;
  description: string;
  comments: string[];
  issueLinks: string[];
}

export interface SprintMetadata {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  source: 'csv' | 'jira_api';
  lastSyncedAt: string;
}

export interface BurndownPoint {
  day: string;
  dayLabel: string;
  idealRemaining: number;
  actualRemaining: number | null;
  itemsDone: number | null;
  idealHoursRemaining: number;
  actualHoursRemaining: number | null;
  hoursLoggedCumulative: number | null;
}

export interface AssigneeAllocation {
  assignee: string;
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  originalEstimateHours: number;
  timeSpentHours: number;
}

export interface HealthSubMetric {
  id: string;
  label: string;
  value: string;
  status: 'healthy' | 'warning' | 'critical';
  detail: string;
}

export type RagStatus = 'Green' | 'Amber' | 'Red';

export interface SprintHealth {
  ragStatus: RagStatus;
  score: number;
  subMetrics: HealthSubMetric[];
  executiveSummary: string;
}

export interface KpiSummary {
  totalItems: number;
  completed: number;
  inProgress: number;
  todo: number;
  blockedOrFlagged: number;
  completionPct: number;
}

export interface RaidItem {
  id: string;
  category: 'Risk' | 'Assumption' | 'Issue' | 'Dependency';
  title: string;
  description: string;
  issueKeys: string[];
  severity: 'High' | 'Medium' | 'Low';
}

export interface AchievementItem {
  id: string;
  text: string;
  issueKeys: string[];
}

export interface IncrementItem {
  id: string;
  title: string;
  businessImpact: string;
  issueKeys: string[];
}

export interface DashboardPayload {
  sprint: SprintMetadata;
  issues: NormalizedIssue[];
  kpis: KpiSummary;
  health: SprintHealth;
  burndown: BurndownPoint[];
  assigneeAllocations: AssigneeAllocation[];
  raid: RaidItem[];
  achievements: AchievementItem[];
  increments: IncrementItem[];
}
