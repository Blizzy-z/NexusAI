/**
 * NotesTab -- Notes & reminders for NexusAI Settings
 * AI can save/read notes via save_note and read_notes tools.
 * You can also add/delete notes manually here.
 * Notes persist in the server's in-memory store for the session.
 * Labels: general, todo, tomorrow, idea, remind, project
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Trash2, RefreshCw, Check, FileText, Tag,
  Calendar, Lightbulb, AlertCircle, Star, BookOpen, ChevronDown
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface Note {
  id: string;
  ts: number;
  label: string;
  text: string;
}

const LABEL_META: Record<string, { icon: React.ElementType; color: string; bg: string; border: string }> = {
  general:  { icon: FileText,   color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/20'  },
  todo:     { icon: Check,      color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  tomorrow: { icon: Calendar,   color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20' },
  idea:     { icon: Lightbulb,  color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20' },
  remind:   { icon: AlertCircle,color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20'   },
  project:  { icon: BookOpen,   color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20'   },
  devlog:   { icon: Star,       color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20'},
};

const ALL_LABELS = Object.keys(LABEL_META);

export default function NotesTab() {
  const [notes,       setNotes]       = useState<Note[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [newText,     setNewText]     = useState('');
  const [newLabel,    setNewLabel]    = useState('todo');
  const [filterLabel, setFilterLabel] = useState('all');
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/notes', { signal: AbortSignal.timeout(5000) });
      if (r.ok) { const d = await r.json(); setNotes(d.notes || []); }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addNote = async () => {
    const text = newText.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const r = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, label: newLabel }),
      });
      if (r.ok) {
        setNewText('');
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        await load();
      }
    } catch {}
    setSaving(false);
  };

  const deleteNote = async (id: string) => {
    await fetch(`/api/notes?id=${id}`, { method: 'DELETE' });
    setNotes(p => p.filter(n => n.id !== id));
  };

  const clearLabel = async (label: string) => {
    if (!confirm(`Delete all "${label}" notes?`)) return;
    await fetch(`/api/notes?label=${label}`, { method: 'DELETE' });
    await load();
  };

  const filtered = filterLabel === 'all' ? notes : notes.filter(n => n.label === filterLabel);
  const countByLabel = (l: string) => notes.filter(n => n.label === l).length;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-sm font-bold text-white mb-0.5">Notes & Reminders</h2>
        <p className="text-[11px] text-slate-600">
          Save notes manually or tell the AI to remember something.
          The AI reads these automatically when you ask "what did I need to do?" or "show my reminders".
        </p>
      </div>

      {/* Add note */}
      <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex-1">New Note</p>
          {/* Label selector */}
          <div className="flex gap-1 flex-wrap justify-end">
            {ALL_LABELS.map(l => {
              const meta = LABEL_META[l];
              const Icon = meta.icon;
              return (
                <button key={l} onClick={() => setNewLabel(l)}
                  className={cn('flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[9px] font-bold uppercase transition-all',
                    newLabel === l ? `${meta.bg} ${meta.border} ${meta.color}` : 'bg-white/3 border-white/8 text-slate-600 hover:text-white')}>
                  <Icon className="w-2.5 h-2.5"/>
                  {l}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-2">
          <textarea
            ref={textRef}
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } }}
            placeholder={`Add a ${newLabel} note... (Enter to save)`}
            rows={2}
            className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/40 resize-none"
          />
          <button onClick={addNote} disabled={saving || !newText.trim()} className="px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl font-bold transition-all flex-shrink-0 flex items-center gap-1.5 text-[11px]">
            {saved ? <><Check className="w-4 h-4 text-emerald-400"/>Saved</> : saving ? <RefreshCw className="w-4 h-4 animate-spin"/> : <><Plus className="w-4 h-4"/>Save</>}
          </button>
        </div>
        <p className="text-[9px] text-slate-700">
          Or just tell the AI: "remind me to test the BioMesh firmware tomorrow" and it will save it automatically.
        </p>
      </div>

      {/* Filter + refresh */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap flex-1">
          <button onClick={() => setFilterLabel('all')}
            className={cn('px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all',
              filterLabel === 'all' ? 'bg-indigo-500/15 border-indigo-500/25 text-indigo-400' : 'bg-white/3 border-white/8 text-slate-600 hover:text-white')}>
            All ({notes.length})
          </button>
          {ALL_LABELS.filter(l => countByLabel(l) > 0).map(l => {
            const meta = LABEL_META[l];
            const Icon = meta.icon;
            return (
              <button key={l} onClick={() => setFilterLabel(l)}
                className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all',
                  filterLabel === l ? `${meta.bg} ${meta.border} ${meta.color}` : 'bg-white/3 border-white/8 text-slate-600 hover:text-white')}>
                <Icon className="w-2.5 h-2.5"/>
                {l} ({countByLabel(l)})
              </button>
            );
          })}
        </div>
        <button onClick={load} disabled={loading} className="p-1.5 text-slate-600 hover:text-white transition-colors">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')}/>
        </button>
      </div>

      {/* Notes list */}
      <div className="space-y-2">
        {loading && notes.length === 0 && (
          <p className="text-[11px] text-slate-700 italic text-center py-6">Loading...</p>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-10 space-y-2">
            <FileText className="w-8 h-8 text-slate-800 mx-auto"/>
            <p className="text-[11px] text-slate-700 italic">
              {filterLabel === 'all' ? 'No notes yet.' : `No ${filterLabel} notes.`}
            </p>
            <p className="text-[10px] text-slate-700">
              Try: "remind me to check the drone battery tomorrow"
            </p>
          </div>
        )}
        {filtered.map(note => {
          const meta = LABEL_META[note.label] || LABEL_META.general;
          const Icon = meta.icon;
          const date = new Date(note.ts);
          const isToday = date.toDateString() === new Date().toDateString();
          return (
            <div key={note.id} className={cn('flex items-start gap-3 px-4 py-3 rounded-xl border transition-all group hover:border-white/12', meta.bg, meta.border)}>
              <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', meta.bg, meta.border, 'border')}>
                <Icon className={cn('w-3.5 h-3.5', meta.color)}/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-200 leading-relaxed whitespace-pre-wrap">{note.text}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn('text-[9px] font-bold uppercase', meta.color)}>{note.label}</span>
                  <span className="text-[9px] text-slate-700">
                    {isToday ? `Today ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              </div>
              <button onClick={() => deleteNote(note.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-400 transition-all flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5"/>
              </button>
            </div>
          );
        })}
      </div>

      {/* Clear by label */}
      {filtered.length > 0 && filterLabel !== 'all' && (
        <button onClick={() => clearLabel(filterLabel)}
          className="flex items-center gap-1.5 text-[10px] text-slate-700 hover:text-red-400 transition-colors">
          <Trash2 className="w-3 h-3"/>Clear all {filterLabel} notes
        </button>
      )}

      {/* AI instruction reminder */}
      <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4 space-y-1.5">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Say to the AI...</p>
        {[
          ['"Remind me to test the ESP32 firmware tomorrow"', 'Saves a remind note'],
          ['"Note down that we fixed the sendClaw bug"',      'Saves a devlog note'],
          ['"Add a todo: check the drone battery"',           'Saves a todo note'],
          ['"What are my notes for tomorrow?"',               'AI reads your notes back'],
          ['"What do I need to do?"',                         'AI lists your todos'],
          ['"Save this idea: add voice control to NexusClaw"','Saves an idea note'],
          ['"Log that we added the notes system to NexusAI"', 'Saves a dev log entry'],
          ['"What did we work on recently?"',                 'AI reads the dev log'],
        ].map(([phrase, what]) => (
          <div key={phrase as string} className="flex gap-3 text-[10px]">
            <code className="text-indigo-400 flex-shrink-0 w-64">{phrase as string}</code>
            <span className="text-slate-600">{what as string}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
