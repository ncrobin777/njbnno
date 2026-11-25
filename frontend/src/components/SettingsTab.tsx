import React, { useState } from 'react';
import { Key, Eye, EyeOff, CheckCircle2, Trash2 } from 'lucide-react';

interface SettingsTabProps {
  apiKey: string;
  model: string;
  onSave: (apiKey: string, model: string) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ apiKey, model, onSave }) => {
  const [draftKey, setDraftKey] = useState(apiKey);
  const [draftModel, setDraftModel] = useState(model);
  const [showKey, setShowKey] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(draftKey.trim(), draftModel);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleClear = () => {
    setDraftKey('');
    onSave('', draftModel);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2.5">
          <Key className="h-5 w-5 text-indigo-500" />
          <div>
            <h2 className="text-base font-semibold">Google Gemini AI Settings</h2>
            <p className="text-xs text-slate-500">
              Add your Gemini API key to enable AI-powered sprint synthesis and the floating board
              analyst chatbox.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Google Gemini API Key
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="AIzaSy..."
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 pr-10 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-3 text-slate-400 hover:text-slate-600"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Stored locally in your browser&apos;s <code>localStorage</code>.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Gemini Model
            </label>
            <select
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="gemini-3.8-flash">gemini-3.8-flash (Fast &amp; Recommended)</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash</option>
              <option value="gemini-2.5-pro">gemini-2.5-pro</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Save Gemini Key
              </button>
              {apiKey && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove Key
                </button>
              )}
            </div>

            {savedNotice && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Saved! Floating AI Chatbox is active.
              </span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
};
