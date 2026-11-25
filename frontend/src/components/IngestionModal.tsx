import React, { useState } from 'react';
import { Upload, Cloud, RefreshCw, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { NormalizedIssue } from '../types';

interface IngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadSprint: (params: {
    issues: NormalizedIssue[];
    sprintName: string;
    startDate: string;
    endDate: string;
    source: 'csv' | 'jira_api';
    lastSyncedAt: string;
  }) => void;
}

export const IngestionModal: React.FC<IngestionModalProps> = ({
  isOpen,
  onClose,
  onLoadSprint,
}) => {
  const [tab, setTab] = useState<'csv' | 'jira'>('csv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CSV state
  const [csvIssues, setCsvIssues] = useState<NormalizedIssue[]>([]);
  const [availableSprints, setAvailableSprints] = useState<string[]>([]);
  const [selectedSprint, setSelectedSprint] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('2026-11-10');
  const [endDate, setEndDate] = useState<string>('2026-11-24');

  // Jira API state (persisted in localStorage until Log Out)
  const [baseUrl, setBaseUrl] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('jira_auth') || '{}').baseUrl || '';
    } catch {
      return '';
    }
  });
  const [email, setEmail] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('jira_auth') || '{}').email || '';
    } catch {
      return '';
    }
  });
  const [apiToken, setApiToken] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('jira_auth') || '{}').apiToken || '';
    } catch {
      return '';
    }
  });
  const [boards, setBoards] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | ''>('');
  const [jiraSprints, setJiraSprints] = useState<
    Array<{ id: number; name: string; state: string; startDate?: string; endDate?: string }>
  >([]);
  const [selectedJiraSprintId, setSelectedJiraSprintId] = useState<number | ''>('');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/csv/parse', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'CSV parse failed');
      setCsvIssues(data.issues);
      setAvailableSprints(data.availableSprints || []);
      if (data.availableSprints?.length > 0) {
        setSelectedSprint(data.availableSprints[data.availableSprints.length - 1]);
      }
      if (data.detectedStartDate) setStartDate(data.detectedStartDate);
      if (data.detectedEndDate) setEndDate(data.detectedEndDate);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCsv = () => {
    const filtered =
      selectedSprint === 'ALL'
        ? csvIssues
        : csvIssues.filter((i) => i.sprints.includes(selectedSprint));
    onLoadSprint({
      issues: filtered,
      sprintName: selectedSprint === 'ALL' ? 'CSV Imported Sprint' : selectedSprint,
      startDate,
      endDate,
      source: 'csv',
      lastSyncedAt: new Date().toISOString(),
    });
    onClose();
  };

  const handleConnectJira = async (forceSync = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/jira/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, email, apiToken, forceSync }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to connect to Jira');
      localStorage.setItem('jira_auth', JSON.stringify({ baseUrl, email, apiToken }));
      setBoards(data.boards || []);
      setLastSyncedAt(data.cachedAt);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBoard = async (boardId: number) => {
    setSelectedBoardId(boardId);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/jira/sprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, email, apiToken, boardId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load sprints');
      setJiraSprints(data.sprints || []);
      setLastSyncedAt(data.cachedAt);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadJiraSprint = async (forceSync = false) => {
    if (!selectedJiraSprintId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/jira/sprint-issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl,
          email,
          apiToken,
          sprintId: Number(selectedJiraSprintId),
          forceSync,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load sprint issues');
      localStorage.setItem('last_jira_sprint_id', String(selectedJiraSprintId));
      const sprintObj = jiraSprints.find((s) => s.id === Number(selectedJiraSprintId));
      onLoadSprint({
        issues: data.issues,
        sprintName: sprintObj?.name || `Sprint ${selectedJiraSprintId}`,
        startDate: sprintObj?.startDate ? sprintObj.startDate.slice(0, 10) : startDate,
        endDate: sprintObj?.endDate ? sprintObj.endDate.slice(0, 10) : endDate,
        source: 'jira_api',
        lastSyncedAt: data.cachedAt,
      });
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Ingest Jira Sprint Data</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 flex gap-2 border-b border-slate-200 pb-3 dark:border-slate-700">
          <button
            onClick={() => setTab('csv')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === 'csv'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <Upload className="h-4 w-4" />
            Jira "All Fields" CSV
          </button>
          <button
            onClick={() => setTab('jira')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === 'jira'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <Cloud className="h-4 w-4" />
            Jira Cloud REST API
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {tab === 'csv' ? (
          <div className="space-y-4">
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFileUpload(f);
              }}
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-8 text-center transition hover:border-indigo-500 dark:border-slate-700"
            >
              <Upload className="mb-2 h-8 w-8 text-indigo-500" />
              <span className="text-sm font-medium">
                Drop Jira "Export Excel CSV (all fields)" here, or click to browse
              </span>
              <span className="mt-1 text-xs text-slate-500">
                Safely aggregates duplicate Sprint, Comment, Labels & Issue Link columns
              </span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />
            </label>

            {csvIssues.length > 0 && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/60">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Parsed {csvIssues.length} issues
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Sprint</label>
                    <select
                      value={selectedSprint}
                      onChange={(e) => setSelectedSprint(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                    >
                      <option value="ALL">All Issues ({csvIssues.length})</option>
                      {availableSprints.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                    />
                  </div>
                </div>
                <button
                  onClick={handleApplyCsv}
                  disabled={loading}
                  className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Generate Executive Dashboard
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="url"
                placeholder="https://your-domain.atlassian.net"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
              <input
                type="email"
                placeholder="Jira User Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
              <input
                type="password"
                placeholder="Atlassian API Token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleConnectJira(false)}
                  disabled={loading || !baseUrl || !email || !apiToken}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? 'Connecting...' : 'Fetch Boards'}
                </button>
                {(baseUrl || email || apiToken) && (
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem('jira_auth');
                      setBaseUrl('');
                      setEmail('');
                      setApiToken('');
                      setBoards([]);
                      setJiraSprints([]);
                      setSelectedBoardId('');
                      setSelectedJiraSprintId('');
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-950/40"
                  >
                    Log Out
                  </button>
                )}
              </div>
              {lastSyncedAt && (
                <span className="text-xs text-slate-500">
                  Cached at: {new Date(lastSyncedAt).toLocaleTimeString()}
                </span>
              )}
            </div>

            {boards.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select
                  value={selectedBoardId}
                  onChange={(e) => handleSelectBoard(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">Select Board...</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>

                {jiraSprints.length > 0 && (
                  <select
                    value={selectedJiraSprintId}
                    onChange={(e) => setSelectedJiraSprintId(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="">Select Sprint...</option>
                    {jiraSprints.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.state})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {selectedJiraSprintId && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleLoadJiraSprint(false)}
                  disabled={loading}
                  className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Load Sprint (Use Cache)
                </button>
                <button
                  onClick={() => handleLoadJiraSprint(true)}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <RefreshCw className="h-4 w-4" />
                  Force Sync
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
