import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Plus, Trash2, Users } from 'lucide-react';
import { AssigneeAllocation, NormalizedIssue, SprintMetadata } from '../types';

interface TeamBandwidthTabProps {
  sprint: SprintMetadata;
  issues: NormalizedIssue[];
  allocations: AssigneeAllocation[];
}

type DayLeaveState = 0 | 1 | 0.5;

interface MemberLeaveRecord {
  name: string;
  isManual?: boolean;
  dayLeaves: Record<string, DayLeaveState>; // YYYY-MM-DD -> 0 | 0.5 | 1
  manualDaysOffOffset: number; // used if user edits Days Off directly
  note: string;
}

interface PersistedBandwidthState {
  baselineHours: number;
  hoursPerLeaveDay: number;
  members: MemberLeaveRecord[];
}

function getWorkingDays(startYmd: string, endYmd: string): string[] {
  const start = new Date(`${startYmd}T00:00:00Z`);
  const end = new Date(`${endYmd}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }
  const days: string[] = [];
  const cur = new Date(start);
  while (cur <= end && days.length < 45) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      days.push(cur.toISOString().slice(0, 10));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

function formatShortDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export const TeamBandwidthTab: React.FC<TeamBandwidthTabProps> = ({
  sprint,
  issues,
  allocations,
}) => {
  const storageKey = `team_bandwidth_${sprint.name}`;
  const workingDays = useMemo(
    () => getWorkingDays(sprint.startDate, sprint.endDate),
    [sprint.startDate, sprint.endDate]
  );

  const issueAssignees = useMemo(() => {
    const set = new Set<string>();
    for (const i of issues) {
      if (i.assignee && i.assignee !== 'Unassigned') {
        set.add(i.assignee);
      }
    }
    return Array.from(set).sort();
  }, [issues]);

  const [baselineHours, setBaselineHours] = useState<number>(70);
  const [hoursPerLeaveDay, setHoursPerLeaveDay] = useState<number>(7);
  const [members, setMembers] = useState<MemberLeaveRecord[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [holidayDate, setHolidayDate] = useState<string>(workingDays[0] || '');

  // Load from localStorage & merge with sprint assignees
  useEffect(() => {
    let saved: PersistedBandwidthState | null = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) saved = JSON.parse(raw) as PersistedBandwidthState;
    } catch {
      saved = null;
    }

    if (saved) {
      setBaselineHours(saved.baselineHours ?? 70);
      setHoursPerLeaveDay(saved.hoursPerLeaveDay ?? 7);
      const existingNames = new Set(saved.members.map((m) => m.name));
      const merged = [...saved.members];
      for (const name of issueAssignees) {
        if (!existingNames.has(name)) {
          merged.push({ name, dayLeaves: {}, manualDaysOffOffset: 0, note: '' });
        }
      }
      setMembers(merged);
    } else {
      setMembers(
        issueAssignees.map((name) => ({
          name,
          dayLeaves: {},
          manualDaysOffOffset: 0,
          note: '',
        }))
      );
    }
  }, [storageKey, issueAssignees]);

  // Persist to localStorage
  useEffect(() => {
    if (members.length === 0) return;
    const payload: PersistedBandwidthState = {
      baselineHours,
      hoursPerLeaveDay,
      members,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // ignore storage quota errors
    }
  }, [storageKey, baselineHours, hoursPerLeaveDay, members]);

  const workloadMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of allocations) {
      map.set(a.assignee, a.originalEstimateHours);
    }
    return map;
  }, [allocations]);

  const getMemberDaysOff = (m: MemberLeaveRecord): number => {
    const calSum = Object.values(m.dayLeaves).reduce<number>((s, v) => s + v, 0);
    return Math.max(0, Number((calSum + m.manualDaysOffOffset).toFixed(1)));
  };

  const cycleDayLeave = (memberIdx: number, day: string) => {
    setMembers((prev) =>
      prev.map((m, idx) => {
        if (idx !== memberIdx) return m;
        const cur = m.dayLeaves[day] || 0;
        const next: DayLeaveState = cur === 0 ? 1 : cur === 1 ? 0.5 : 0;
        const nextLeaves = { ...m.dayLeaves };
        if (next === 0) delete nextLeaves[day];
        else nextLeaves[day] = next;
        return { ...m, dayLeaves: nextLeaves };
      })
    );
  };

  const handleManualDaysOffChange = (memberIdx: number, targetTotal: number) => {
    const clamped = Math.max(0, targetTotal);
    setMembers((prev) =>
      prev.map((m, idx) => {
        if (idx !== memberIdx) return m;
        const calSum = Object.values(m.dayLeaves).reduce<number>((s, v) => s + v, 0);
        return { ...m, manualDaysOffOffset: Number((clamped - calSum).toFixed(1)) };
      })
    );
  };

  const handleMarkTeamHoliday = () => {
    if (!holidayDate) return;
    setMembers((prev) =>
      prev.map((m) => ({
        ...m,
        dayLeaves: { ...m.dayLeaves, [holidayDate]: 1 },
        note: m.note || 'Public holiday',
      }))
    );
  };

  const handleAddMember = () => {
    const trimmed = newMemberName.trim();
    if (!trimmed || members.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) return;
    setMembers((prev) => [
      ...prev,
      { name: trimmed, isManual: true, dayLeaves: {}, manualDaysOffOffset: 0, note: '' },
    ]);
    setNewMemberName('');
  };

  const handleRemoveMember = (idx: number) => {
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  };

  // Summary KPIs
  const summary = useMemo(() => {
    let totalNetBandwidth = 0;
    let totalLeaveDays = 0;
    let totalAssigned = 0;

    for (const m of members) {
      const daysOff = getMemberDaysOff(m);
      const net = Math.max(0, baselineHours - daysOff * hoursPerLeaveDay);
      totalNetBandwidth += net;
      totalLeaveDays += daysOff;
      totalAssigned += workloadMap.get(m.name) || 0;
    }

    const overallUtil =
      totalNetBandwidth > 0 ? Math.round((totalAssigned / totalNetBandwidth) * 100) : 0;

    return {
      totalNetBandwidth: Number(totalNetBandwidth.toFixed(1)),
      totalLeaveDays: Number(totalLeaveDays.toFixed(1)),
      totalAssigned: Number(totalAssigned.toFixed(1)),
      overallUtil,
    };
  }, [members, baselineHours, hoursPerLeaveDay, workloadMap]);

  return (
    <div className="space-y-6">
      {/* Top Summary Bar */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500">Total Team Net Bandwidth</div>
          <div className="mt-1 text-2xl font-bold">{summary.totalNetBandwidth} hrs</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500">Total Leave Days</div>
          <div className="mt-1 text-2xl font-bold">{summary.totalLeaveDays} days</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500">Total Assigned Hours</div>
          <div className="mt-1 text-2xl font-bold">{summary.totalAssigned} hrs</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500">Overall Team Utilization</div>
          <div
            className={`mt-1 text-2xl font-bold ${
              summary.overallUtil > 100
                ? 'text-rose-600'
                : summary.overallUtil >= 85
                  ? 'text-amber-500'
                  : 'text-emerald-600'
            }`}
          >
            {summary.overallUtil}%
          </div>
        </div>
      </section>

      {/* Controls & Config Bar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-medium">
              <span className="text-slate-500">Baseline (hrs):</span>
              <input
                type="number"
                min={0}
                value={baselineHours}
                onChange={(e) => setBaselineHours(Math.max(0, Number(e.target.value)))}
                className="w-20 rounded-lg border border-slate-300 px-2.5 py-1 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
              />
            </label>

            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="text-slate-500">Leave Deduction / Day:</span>
              <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
                {[7, 8].map((h) => (
                  <button
                    key={h}
                    onClick={() => setHoursPerLeaveDay(h)}
                    className={`rounded-md px-2.5 py-1 font-semibold transition ${
                      hoursPerLeaveDay === h
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {workingDays.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  {workingDays.map((d) => (
                    <option key={d} value={d}>
                      {formatShortDate(d)}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleMarkTeamHoliday}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                >
                  Mark Team Holiday
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Add member..."
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
                className="w-36 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
              />
              <button
                onClick={handleAddMember}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Roster & Leave Table */}
      <section className="space-y-3">
        {members.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            <Users className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            No team members found. Add a member above to start tracking bandwidth.
          </div>
        ) : (
          members.map((m, idx) => {
            const daysOff = getMemberDaysOff(m);
            const deducted = Number((daysOff * hoursPerLeaveDay).toFixed(1));
            const netBandwidth = Number(Math.max(0, baselineHours - deducted).toFixed(1));
            const assigned = workloadMap.get(m.name) || 0;
            const utilPct = netBandwidth > 0 ? Math.round((assigned / netBandwidth) * 100) : 0;
            const utilColor =
              utilPct > 100
                ? 'bg-rose-500'
                : utilPct >= 85
                  ? 'bg-amber-500'
                  : 'bg-emerald-500';

            return (
              <div
                key={m.name}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  {/* Member Info */}
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {m.name
                        .split(' ')
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{m.name}</div>
                      <input
                        type="text"
                        placeholder="Leave note (e.g. Sick leave)..."
                        value={m.note}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMembers((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, note: val } : item))
                          );
                        }}
                        className="mt-0.5 w-full bg-transparent text-xs text-slate-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Interactive Sprint Calendar Strip */}
                  {workingDays.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <Calendar className="mr-1 h-3.5 w-3.5 text-slate-400" />
                      {workingDays.map((day) => {
                        const state = m.dayLeaves[day] || 0;
                        const btnStyle =
                          state === 1
                            ? 'bg-rose-500 text-white border-rose-500'
                            : state === 0.5
                              ? 'bg-amber-400 text-slate-900 border-amber-400'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';

                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => cycleDayLeave(idx, day)}
                            title={`${day}: ${
                              state === 1 ? 'Full Day Off' : state === 0.5 ? 'Half Day Off' : 'Available'
                            } (click to cycle)`}
                            className={`rounded-md border px-1.5 py-1 text-[10px] font-medium transition ${btnStyle}`}
                          >
                            {formatShortDate(day)}
                            {state === 0.5 ? ' ½' : ''}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Days Off & Bandwidth Metrics */}
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500">Days Off:</span>
                      <input
                        type="number"
                        step={0.5}
                        min={0}
                        value={daysOff}
                        onChange={(e) => handleManualDaysOffChange(idx, Number(e.target.value))}
                        className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800"
                      />
                    </label>

                    <div className="text-xs">
                      <div className="text-slate-500">Net Bandwidth</div>
                      <div className="font-bold">
                        {netBandwidth}h{' '}
                        <span className="font-normal text-slate-400">(-{deducted}h)</span>
                      </div>
                    </div>

                    <div className="w-36 text-xs">
                      <div className="mb-1 flex justify-between">
                        <span className="text-slate-500">Assigned: {assigned}h</span>
                        <span className="font-bold">{utilPct}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-full ${utilColor}`}
                          style={{ width: `${Math.min(100, utilPct)}%` }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveMember(idx)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50"
                      title="Remove member"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
};
