import React from 'react';
import { ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';
import { RagStatus, SprintHealth } from '../types';

interface SprintHealthBannerProps {
  health: SprintHealth;
  onUpdateRag: (rag: RagStatus) => void;
  onUpdateSummary: (summary: string) => void;
}

export const SprintHealthBanner: React.FC<SprintHealthBannerProps> = ({
  health,
  onUpdateRag,
  onUpdateSummary,
}) => {
  const ragStyles: Record<RagStatus, { bg: string; badge: string; icon: React.ReactNode }> = {
    Green: {
      bg: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/30',
      badge: 'bg-emerald-600 text-white',
      icon: <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
    },
    Amber: {
      bg: 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30',
      badge: 'bg-amber-500 text-white',
      icon: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
    },
    Red: {
      bg: 'border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/30',
      badge: 'bg-rose-600 text-white',
      icon: <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-400" />,
    },
  };

  const pillColor = (status: 'healthy' | 'warning' | 'critical') => {
    if (status === 'healthy') {
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300';
    }
    if (status === 'warning') {
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300';
    }
    return 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300';
  };

  const style = ragStyles[health.ragStatus];

  return (
    <section className={`print-break-inside-avoid rounded-2xl border p-5 ${style.bg}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          {style.icon}
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Sprint Health
              </span>
              <select
                value={health.ragStatus}
                onChange={(e) => onUpdateRag(e.target.value as RagStatus)}
                className={`rounded-full px-3 py-0.5 text-xs font-bold outline-none ${style.badge}`}
                title="Override RAG Status"
              >
                <option value="Green">On Track (Green)</option>
                <option value="Amber">At Risk (Amber)</option>
                <option value="Red">Off Track (Red)</option>
              </select>
              <span className="rounded-full bg-slate-900/10 px-2.5 py-0.5 text-xs font-bold dark:bg-white/10">
                Score: {health.score}/100
              </span>
            </div>
            <textarea
              value={health.executiveSummary}
              onChange={(e) => onUpdateSummary(e.target.value)}
              rows={2}
              className="mt-2 w-full min-w-[300px] resize-none rounded-lg border border-transparent bg-transparent p-1 text-sm font-medium text-slate-800 focus:border-slate-300 focus:bg-white/80 focus:outline-none dark:text-slate-100 dark:focus:border-slate-700 dark:focus:bg-slate-900/80 md:w-[640px]"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {health.subMetrics.map((m) => (
          <div
            key={m.id}
            title={m.detail}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${pillColor(m.status)}`}
          >
            <span className="font-semibold">{m.label}:</span>
            <span>{m.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
};
