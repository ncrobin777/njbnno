import React, { useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { AssigneeAllocation, KpiSummary } from '../types';

interface CompletionAndAllocationChartsProps {
  sprintName: string;
  kpis: KpiSummary;
  allocations: AssigneeAllocation[];
}

export const CompletionAndAllocationCharts: React.FC<CompletionAndAllocationChartsProps> = ({
  sprintName,
  kpis,
  allocations,
}) => {
  const [allocMode, setAllocMode] = useState<'tasks' | 'bandwidth' | 'capacity'>('tasks');

  const capacityChartData = React.useMemo(() => {
    let baselineHours = 70;
    let hoursPerLeaveDay = 7;
    const daysOffMap = new Map<string, number>();

    try {
      const raw = localStorage.getItem(`team_bandwidth_${sprintName}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        baselineHours = parsed.baselineHours ?? 70;
        hoursPerLeaveDay = parsed.hoursPerLeaveDay ?? 7;
        for (const m of parsed.members || []) {
          const calSum = Object.values(m.dayLeaves || {}).reduce<number>(
            (s, v) => s + Number(v || 0),
            0
          );
          const totalOff = Math.max(0, calSum + Number(m.manualDaysOffOffset || 0));
          daysOffMap.set(m.name, totalOff);
        }
      }
    } catch {
      // fallback to 70h baseline
    }

    return allocations.map((a) => {
      const daysOff = daysOffMap.get(a.assignee) || 0;
      const plannedCapacityHours = Number(
        Math.max(0, baselineHours - daysOff * hoursPerLeaveDay).toFixed(1)
      );
      return {
        assignee: a.assignee,
        plannedCapacityHours,
        actualWorkDoneHours: a.timeSpentHours,
      };
    });
  }, [allocations, sprintName]);

  const pieData = [
    { name: 'Done', value: kpis.completed, color: '#10b981' },
    { name: 'In Progress', value: kpis.inProgress, color: '#6366f1' },
    { name: 'To Do', value: kpis.todo, color: '#94a3b8' },
  ].filter((d) => d.value > 0);

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Completion Rate Pie Chart */}
      <div className="print-break-inside-avoid rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-semibold">Completion Rate</h3>
        <p className="mb-3 text-xs text-slate-500">
          {kpis.completionPct}% completed ({kpis.completed} of {kpis.totalItems} items)
        </p>
        <div className="w-full" style={{ height: 256 }}>
          <ResponsiveContainer width="100%" height={256}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={80}
                paddingAngle={3}
                isAnimationActive={false}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Allocation & Bandwidth per Person */}
      <div className="print-break-inside-avoid rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">Team Allocation & Bandwidth</h3>
            <p className="text-xs text-slate-500">
              {allocMode === 'tasks' && 'Task distribution per team member'}
              {allocMode === 'bandwidth' &&
                'Original Estimate vs. Time Logged (hours) per person — sub-tasks only'}
              {allocMode === 'capacity' &&
                'Planned Capacity (from Team Bandwidth) vs. Actual Work Done (hours logged)'}
            </p>
          </div>
          <div className="no-print flex rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
            <button
              onClick={() => setAllocMode('tasks')}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                allocMode === 'tasks'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              Tasks per Person
            </button>
            <button
              onClick={() => setAllocMode('bandwidth')}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                allocMode === 'bandwidth'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              Bandwidth (Hours)
            </button>
            <button
              onClick={() => setAllocMode('capacity')}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                allocMode === 'capacity'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              Capacity vs. Actual
            </button>
          </div>
        </div>

        <div className="w-full" style={{ height: 256 }}>
          <ResponsiveContainer width="100%" height={256}>
            <BarChart
              data={allocMode === 'capacity' ? capacityChartData : allocations}
              margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="assignee" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={allocMode !== 'tasks'} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {allocMode === 'tasks' && (
                <Bar dataKey="doneTasks" name="Done" stackId="a" fill="#10b981" isAnimationActive={false} />
              )}
              {allocMode === 'tasks' && (
                <Bar dataKey="inProgressTasks" name="In Progress" stackId="a" fill="#6366f1" isAnimationActive={false} />
              )}
              {allocMode === 'tasks' && (
                <Bar dataKey="todoTasks" name="To Do" stackId="a" fill="#94a3b8" isAnimationActive={false} />
              )}
              {allocMode === 'bandwidth' && (
                <Bar dataKey="originalEstimateHours" name="Original Estimate (hrs)" fill="#6366f1" isAnimationActive={false} />
              )}
              {allocMode === 'bandwidth' && (
                <Bar dataKey="timeSpentHours" name="Time Logged (hrs)" fill="#f59e0b" isAnimationActive={false} />
              )}
              {allocMode === 'capacity' && (
                <Bar dataKey="plannedCapacityHours" name="Planned Capacity (hrs)" fill="#10b981" isAnimationActive={false} />
              )}
              {allocMode === 'capacity' && (
                <Bar dataKey="actualWorkDoneHours" name="Actual Work Done (hrs)" fill="#4f46e5" isAnimationActive={false} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
};
