import React, { useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { DashboardPayload } from '../types';

interface FloatingAiChatProps {
  apiKey: string;
  model: string;
  dashboard: DashboardPayload;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export const FloatingAiChat: React.FC<FloatingAiChatProps> = ({
  apiKey,
  model,
  dashboard,
}) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  if (!apiKey) return null;

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextHistory: ChatMessage[] = [...messages, { role: 'user', text: trimmed }];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    try {
      const compactContext = {
        sprint: dashboard.sprint,
        kpis: dashboard.kpis,
        health: dashboard.health,
        assigneeAllocations: dashboard.assigneeAllocations,
        raid: dashboard.raid,
        achievements: dashboard.achievements,
        increments: dashboard.increments,
        issues: dashboard.issues.slice(0, 80).map((i) => ({
          key: i.key,
          summary: i.summary,
          type: i.issueType,
          status: i.status,
          category: i.statusCategory,
          priority: i.priority,
          assignee: i.assignee,
          flagged: i.flagged,
          links: i.issueLinks,
          estHrs: i.originalEstimateHours,
          spentHrs: i.timeSpentHours,
        })),
      };

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          model,
          message: trimmed,
          history: messages,
          dashboardContext: compactContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gemini request failed');
      setMessages([...nextHistory, { role: 'model', text: data.reply }]);
    } catch (err: any) {
      setMessages([
        ...nextHistory,
        { role: 'model', text: `Error: ${err.message || 'Could not reach Gemini.'}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="no-print fixed right-5 bottom-5 z-50">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-indigo-700"
        >
          Ask Gemini AI
        </button>
      ) : (
        <div className="flex h-[480px] w-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:w-[400px]">
          {/* Header */}
          <div className="flex items-center justify-between bg-indigo-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Gemini Sprint Analyst</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 hover:bg-indigo-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
            {messages.length === 0 && (
              <div className="space-y-2 text-slate-500">
                <p>Ask anything about {dashboard.sprint.name}:</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Summarize top sprint risks',
                    'Who is overloaded?',
                    'Give an executive status update',
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-left text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`rounded-xl px-3 py-2 whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'ml-8 bg-indigo-600 text-white'
                    : 'mr-6 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                }`}
              >
                {m.text}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyzing board...
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
          >
            <input
              type="text"
              placeholder="Ask about blockers, burndown, team..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none dark:border-slate-700"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-xl bg-indigo-600 p-2 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
