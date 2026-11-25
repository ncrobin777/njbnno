import { useState, useEffect } from 'react';
import {
  Upload,
  Moon,
  Sun,
  FileText,
  Printer,
  ChevronDown,
  ChevronUp,
  Award,
  Rocket,
  AlertOctagon,
  Database,
  RefreshCw,
} from 'lucide-react';
import { DashboardPayload, NormalizedIssue, RagStatus } from './types';
import { IngestionModal } from './components/IngestionModal';
import { SprintHealthBanner } from './components/SprintHealthBanner';
import { BurndownChart } from './components/BurndownChart';
import { CompletionAndAllocationCharts } from './components/CompletionAndAllocationCharts';
import { TeamBandwidthTab } from './components/TeamBandwidthTab';
import { SettingsTab } from './components/SettingsTab';
import { FloatingAiChat } from './components/FloatingAiChat';
import { exportAsMarkdown } from './utils/exportReport';

export function App() {
  const [dark, setDark] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'bandwidth' | 'settings'>('overview');
  const [geminiKey, setGeminiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [geminiModel, setGeminiModel] = useState<string>(() => {
    const saved = localStorage.getItem('gemini_model');
    if (!saved || saved === 'gemini-2.0-flash') return 'gemini-3.8-flash';
    return saved;
  });
  const [includeSubtasks, setIncludeSubtasks] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(() => {
    try {
      const raw = localStorage.getItem('last_dashboard_payload');
      return raw ? (JSON.parse(raw) as DashboardPayload) : null;
    } catch {
      return null;
    }
  });
  const [rawParams, setRawParams] = useState<{
    issues: NormalizedIssue[];
    sprintName: string;
    startDate: string;
    endDate: string;
    source: 'csv' | 'jira_api';
    lastSyncedAt: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem('last_raw_params');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (dashboard) {
      try {
        localStorage.setItem('last_dashboard_payload', JSON.stringify(dashboard));
      } catch {
        // ignore quota errors
      }
    }
  }, [dashboard]);

  useEffect(() => {
    if (rawParams) {
      try {
        localStorage.setItem('last_raw_params', JSON.stringify(rawParams));
      } catch {
        // ignore quota errors
      }
    }
  }, [rawParams]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const buildDashboard = async (
    params: NonNullable<typeof rawParams>,
    subtasksFlag: boolean
  ) => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          includeSubtasks: subtasksFlag,
          aiConfig: geminiKey
            ? { provider: 'gemini', apiKey: geminiKey, model: geminiModel }
            : undefined,
        }),
      });
      const data = (await res.json()) as DashboardPayload;
      if (res.ok) {
        setDashboard(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSprint = (params: NonNullable<typeof rawParams>) => {
    setRawParams(params);
    buildDashboard(params, includeSubtasks);
  };

  const handleToggleSubtasks = (val: boolean) => {
    setIncludeSubtasks(val);
    if (rawParams) {
      buildDashboard(rawParams, val);
    }
  };

  const handleLiveSync = async () => {
    try {
      const auth = JSON.parse(localStorage.getItem('jira_auth') || '{}');
      const sprintId = Number(localStorage.getItem('last_jira_sprint_id') || 0);
      if (!auth.baseUrl || !auth.email || !auth.apiToken || !sprintId || !dashboard) {
        setModalOpen(true);
        return;
      }
      setLoading(true);
      const res = await fetch('/api/jira/sprint-issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: auth.baseUrl,
          email: auth.email,
          apiToken: auth.apiToken,
          sprintId,
          forceSync: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Live sync failed');
      const nextParams = {
        issues: data.issues,
        sprintName: dashboard.sprint.name,
        startDate: dashboard.sprint.startDate,
        endDate: dashboard.sprint.endDate,
        source: 'jira_api' as const,
        lastSyncedAt: data.cachedAt,
      };
      setRawParams(nextParams);
      await buildDashboard(nextParams, includeSubtasks);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      {/* Header */}
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-base font-bold leading-tight">
                {dashboard ? dashboard.sprint.name : 'Executive Sprint Dashboard'}
              </h1>
              <p className="text-xs text-slate-500">
                {dashboard
                  ? `${dashboard.sprint.startDate} → ${dashboard.sprint.endDate} • Synced ${new Date(
                      dashboard.sprint.lastSyncedAt
                    ).toLocaleTimeString()}`
                  : 'Local-first Jira Sprint Analytics & AI Synthesis'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {dashboard?.sprint.source === 'jira_api' && (
              <button
                onClick={handleLiveSync}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                title="Force sync latest issues from Jira"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Live Sync
              </button>
            )}
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              <Upload className="h-3.5 w-3.5" />
              Ingest Data
            </button>

            {dashboard && (
              <>
                <button
                  onClick={() => exportAsMarkdown(dashboard)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  title="Export Markdown"
                >
                  <FileText className="h-3.5 w-3.5" />
                  MD
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  title="Export PDF"
                >
                  <Printer className="h-3.5 w-3.5" />
                  PDF
                </button>
              </>
            )}

            <button
              onClick={() => setDark((d) => !d)}
              className="rounded-lg border border-slate-200 p-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {!dashboard ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white py-24 text-center dark:border-slate-800 dark:bg-slate-900">
            <Database className="mb-4 h-12 w-12 text-indigo-500" />
            <h2 className="text-xl font-bold">No Sprint Loaded</h2>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Upload a Jira "All Fields" CSV or connect directly to your Jira Cloud Standard Plan
              instance to generate your Executive Sprint Dashboard.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="mt-6 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Ingest Jira Data
            </button>
          </div>
        ) : (
          <>
            {loading && (
              <div className="rounded-xl bg-indigo-50 px-4 py-2 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                Recalculating sprint metrics...
              </div>
            )}

            {/* Dashboard Tab Switcher */}
            <div className="no-print flex gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
              <button
                onClick={() => setActiveTab('overview')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'overview'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                Executive Overview
              </button>
              <button
                onClick={() => setActiveTab('bandwidth')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'bandwidth'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                Team Bandwidth
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  activeTab === 'settings'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                Settings
              </button>
            </div>

            {activeTab === 'settings' ? (
              <SettingsTab
                apiKey={geminiKey}
                model={geminiModel}
                onSave={(key, model) => {
                  setGeminiKey(key);
                  setGeminiModel(model);
                  if (key) localStorage.setItem('gemini_api_key', key);
                  else localStorage.removeItem('gemini_api_key');
                  localStorage.setItem('gemini_model', model);
                }}
              />
            ) : activeTab === 'bandwidth' ? (
              <TeamBandwidthTab
                sprint={dashboard.sprint}
                issues={dashboard.issues}
                allocations={dashboard.assigneeAllocations || []}
              />
            ) : (
              <>

            {/* Sprint Health Banner */}
            <SprintHealthBanner
              health={dashboard.health}
              onUpdateRag={(rag: RagStatus) =>
                setDashboard({ ...dashboard, health: { ...dashboard.health, ragStatus: rag } })
              }
              onUpdateSummary={(summary: string) =>
                setDashboard({
                  ...dashboard,
                  health: { ...dashboard.health, executiveSummary: summary },
                })
              }
            />

            {/* KPI Cards */}
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {[
                { label: 'Total Items', value: dashboard.kpis.totalItems },
                { label: 'Completed', value: dashboard.kpis.completed },
                { label: 'In Progress', value: dashboard.kpis.inProgress },
                { label: 'Blocked / Flagged', value: dashboard.kpis.blockedOrFlagged },
                { label: 'Completion', value: `${dashboard.kpis.completionPct}%` },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="text-xs font-medium text-slate-500">{kpi.label}</div>
                  <div className="mt-1 text-2xl font-bold">{kpi.value}</div>
                </div>
              ))}
            </section>

            {/* Burndown Chart */}
            <BurndownChart
              data={dashboard.burndown}
              includeSubtasks={includeSubtasks}
              onToggleSubtasks={handleToggleSubtasks}
            />

            {/* Completion Rate Pie & Team Allocation / Bandwidth */}
            <CompletionAndAllocationCharts
              sprintName={dashboard.sprint.name}
              kpis={dashboard.kpis}
              allocations={dashboard.assigneeAllocations || []}
            />

            {/* Achievements & Increments */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="print-break-inside-avoid rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center gap-2">
                  <Award className="h-5 w-5 text-indigo-500" />
                  <h3 className="text-base font-semibold">Key Achievements</h3>
                </div>
                <ul className="space-y-2.5">
                  {dashboard.achievements.map((ach, idx) => (
                    <li key={ach.id} className="flex items-start justify-between gap-2 text-sm">
                      <input
                        value={ach.text}
                        onChange={(e) => {
                          const next = [...dashboard.achievements];
                          next[idx] = { ...ach, text: e.target.value };
                          setDashboard({ ...dashboard, achievements: next });
                        }}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 focus:border-slate-300 focus:outline-none dark:focus:border-slate-700"
                      />
                      <div className="flex shrink-0 gap-1">
                        {ach.issueKeys.map((k) => (
                          <span
                            key={k}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="print-break-inside-avoid rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center gap-2">
                  <Rocket className="h-5 w-5 text-emerald-500" />
                  <h3 className="text-base font-semibold">Key Increments</h3>
                </div>
                <div className="space-y-3">
                  {dashboard.increments.map((inc, idx) => (
                    <div
                      key={inc.id}
                      className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          value={inc.title}
                          onChange={(e) => {
                            const next = [...dashboard.increments];
                            next[idx] = { ...inc, title: e.target.value };
                            setDashboard({ ...dashboard, increments: next });
                          }}
                          className="w-full bg-transparent text-sm font-semibold focus:outline-none"
                        />
                        <div className="flex shrink-0 gap-1">
                          {inc.issueKeys.map((k) => (
                            <span
                              key={k}
                              className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-mono font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                            >
                              {k}
                            </span>
                          ))}
                        </div>
                      </div>
                      <input
                        value={inc.businessImpact}
                        onChange={(e) => {
                          const next = [...dashboard.increments];
                          next[idx] = { ...inc, businessImpact: e.target.value };
                          setDashboard({ ...dashboard, increments: next });
                        }}
                        className="mt-1 w-full bg-transparent text-xs text-slate-600 focus:outline-none dark:text-slate-400"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* RAID Log */}
            <section className="print-break-inside-avoid rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-center gap-2">
                <AlertOctagon className="h-5 w-5 text-amber-500" />
                <h3 className="text-base font-semibold">Automated Sprint RAID Log</h3>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {dashboard.raid.map((item, idx) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800"
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold dark:bg-slate-800">
                        {item.category} • {item.severity}
                      </span>
                      <div className="flex gap-1">
                        {item.issueKeys.map((k) => (
                          <span
                            key={k}
                            className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-mono font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                    <input
                      value={item.title}
                      onChange={(e) => {
                        const next = [...dashboard.raid];
                        next[idx] = { ...item, title: e.target.value };
                        setDashboard({ ...dashboard, raid: next });
                      }}
                      className="w-full bg-transparent text-sm font-semibold focus:outline-none"
                    />
                    <textarea
                      value={item.description}
                      rows={2}
                      onChange={(e) => {
                        const next = [...dashboard.raid];
                        next[idx] = { ...item, description: e.target.value };
                        setDashboard({ ...dashboard, raid: next });
                      }}
                      className="mt-1 w-full resize-none bg-transparent text-xs text-slate-600 focus:outline-none dark:text-slate-400"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Collapsible Drill-Down Drawer */}
            <section className="no-print rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <button
                onClick={() => setDrawerOpen((o) => !o)}
                className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-semibold"
              >
                <span>Raw Ticket Drill-Down ({dashboard.issues.length} issues)</span>
                {drawerOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {drawerOpen && (
                <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/60">
                      <tr>
                        <th className="px-4 py-2.5">Key</th>
                        <th className="px-4 py-2.5">Parent</th>
                        <th className="px-4 py-2.5">Summary</th>
                        <th className="px-4 py-2.5">Type</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Priority</th>
                        <th className="px-4 py-2.5">Assignee</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {dashboard.issues.map((i) => (
                        <tr key={i.key}>
                          <td className="px-4 py-2 font-mono font-medium">{i.key}</td>
                          <td className="px-4 py-2 font-mono text-slate-500">{i.parentKey || '—'}</td>
                          <td className="px-4 py-2">{i.summary}</td>
                          <td className="px-4 py-2">{i.issueType}</td>
                          <td className="px-4 py-2">{i.status}</td>
                          <td className="px-4 py-2">{i.priority}</td>
                          <td className="px-4 py-2">{i.assignee}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
              </>
            )}
          </>
        )}
      </main>

      <IngestionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onLoadSprint={handleLoadSprint}
      />

      {dashboard && (
        <FloatingAiChat apiKey={geminiKey} model={geminiModel} dashboard={dashboard} />
      )}
    </div>
  );
}

export default App;
