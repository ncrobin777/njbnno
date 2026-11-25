import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { BurndownPoint } from '../types';

interface BurndownChartProps {
  data: BurndownPoint[];
  includeSubtasks: boolean;
  onToggleSubtasks: (val: boolean) => void;
}

type BurndownMode = 'items' | 'estimate' | 'logged';

export const BurndownChart: React.FC<BurndownChartProps> = ({
  data,
  includeSubtasks,
  onToggleSubtasks,
}) => {
  const [mode, setMode] = useState<BurndownMode>('items');

  return (
    <section className="print-break-inside-avoid rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Sprint Burndown</h3>
          <p className="text-xs text-slate-500">
            {mode === 'items' && 'Item count remaining, items done, and ideal linear decline'}
            {mode === 'estimate' && 'Original estimate hours remaining vs. ideal decline'}
            {mode === 'logged' && 'Cumulative hours logged across the sprint'}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
            {[
              { id: 'items', label: 'Item Count & Done' },
              { id: 'estimate', label: 'Original Est. (hrs)' },
              { id: 'logged', label: 'Time Logged (hrs)' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMode(tab.id as BurndownMode)}
                className={`rounded-md px-2.5 py-1 font-medium transition ${
                  mode === tab.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium dark:border-slate-700">
            <input
              type="checkbox"
              checked={includeSubtasks}
              onChange={(e) => onToggleSubtasks(e.target.checked)}
              className="rounded text-indigo-600"
            />
            Include Sub-tasks
          </label>
        </div>
      </div>

      <div className="w-full" style={{ height: 288 }}>
        <ResponsiveContainer width="100%" height={288}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="dayLabel" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={mode !== 'items'} tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                borderRadius: '0.75rem',
                border: '1px solid #e2e8f0',
                fontSize: '12px',
              }}
            />
            <Legend />
            {mode === 'items' && (
              <Line
                type="monotone"
                dataKey="idealRemaining"
                name="Ideal Remaining"
                stroke="#94a3b8"
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {mode === 'items' && (
              <Line
                type="monotone"
                dataKey="actualRemaining"
                name="Actual Remaining"
                stroke="#4f46e5"
                strokeWidth={3}
                dot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            {mode === 'items' && (
              <Line
                type="monotone"
                dataKey="itemsDone"
                name="Items Done"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            {mode === 'estimate' && (
              <Line
                type="monotone"
                dataKey="idealHoursRemaining"
                name="Ideal Est. Hours Remaining"
                stroke="#94a3b8"
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {mode === 'estimate' && (
              <Line
                type="monotone"
                dataKey="actualHoursRemaining"
                name="Actual Est. Hours Remaining"
                stroke="#6366f1"
                strokeWidth={3}
                dot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            {mode === 'logged' && (
              <Line
                type="monotone"
                dataKey="hoursLoggedCumulative"
                name="Cumulative Time Logged (hrs)"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};
