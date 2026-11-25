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
  created: string; // ISO date string
  resolved: string | null; // ISO date string or null
  updated: string; // ISO date string
  sprints: string[];
  labels: string[];
  flagged: boolean;
  originalEstimateHours: number;
  timeSpentHours: number;
  description: string;
  comments: string[];
  issueLinks: string[]; // e.g. ["is blocked by PROJ-102", "blocks PROJ-105"]
}

export interface SprintMetadata {
  id?: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  source: 'csv' | 'jira_api';
  lastSyncedAt: string;
}

export interface BurndownPoint {
  day: string; // YYYY-MM-DD
  dayLabel: string; // e.g., "Day 1"
  idealRemaining: number;
  actualRemaining: number | null; // null for future days
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
  id: 'burndown_pace' | 'scope_creep' | 'blocker_load' | 'stale_wip' | 'late_high_priority';
  label: string;
  value: string;
  status: 'healthy' | 'warning' | 'critical';
  detail: string;
}

export type RagStatus = 'Green' | 'Amber' | 'Red';

export interface SprintHealth {
  ragStatus: RagStatus;
  score: number; // 0-100
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

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface AiConfig {
  provider: 'openai' | 'gemini' | 'ollama' | 'none';
  apiKey?: string;
  model?: string;
  ollamaUrl?: string;
}
