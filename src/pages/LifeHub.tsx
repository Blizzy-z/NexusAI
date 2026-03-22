import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen, StickyNote, CheckSquare, Calendar, Clock, Target, Brain,
  Plus, Trash2, Edit3, Save, X, Search, Tag, Star, StarOff,
  ChevronDown, ChevronRight, RotateCcw, Check, Zap, Mic, MicOff,
  Timer, Play, Pause, SkipForward, Coffee, TrendingUp, AlertCircle,
  ShoppingCart, Dumbbell, Pill, DollarSign, Sun, Moon, Wind
} from 'lucide-react';
import { getGeminiResponse } from '../services/api'
import { askOllama } from '../services/api';;
import { cn } from '@/src/lib/utils';

// Types
interface Flashcard { id: string; front: string; back: string; deck: string; due: number; interval: number; ease: number; reps: number; }
interface Note { id: string; title: string; content: string; tags: string[]; pinned: boolean; created: number; updated: number; }
interface Task { id: string; text: string; done: boolean; priority: 'low'|'medium'|'high'; due?: string; category: string; created: number; }
interface HabitEntry { date: string; done: boolean; }
interface Habit { id: string; name: string; icon: string; color: string; entries: HabitEntry[]; streak: number; }
interface BudgetEntry { id: string; label: string; amount: number; type: 'income'|'expense'; category: string; date: string; }

// Helpers
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const load = <T,>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const save = (key: string, val: unknown) => localStorage.setItem(key, JSON.stringify(val));

function geminiKey() {
  return localStorage.getItem('gemini_api_key') ||
    (() => { try { return JSON.parse(localStorage.getItem('nexus_settings') || '{}')?.providers?.gemini || ''; } catch { return ''; } })();
}

// AI helper
async function ai(prompt: string, sys = 'You are a helpful AI assistant. Be concise.'): Promise<string> {
  if (!geminiKey()) return '⚠ No Gemini API key. Add it in Settings -> API Providers.';
  try {
    const r = await (async () => { try { const text = await (await import('../services/api')).askOllama(prompt, sys, 'mdq100/Gemma3-Instruct-Abliterated:12b'); return {text, reasoning:''}; } catch(e:any) { return {text:'⚠ ' + e.message, reasoning:''}; } })();
    return (r as any)?.text || String(r);
  } catch (e: any) { return `⚠ ${e.message}`; }
}

//
// FLASHCARDS
//
function Flashcards() {
  const [cards, setCards] = useState<Flashcard[]>(() => load('nexus_flashcards', []));
  const [deck, setDeck] = useState('General');
  const [decks, setDecks] = useState<string[]>(() => load('nexus_decks', ['General']));
  const [mode, setMode] = useState<'browse'|'study'|'add'|'generate'>('browse');
  const [studyIdx, setStudyIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [genTopic, setGenTopic] = useState('');
  const [genCount, setGenCount] = useState('10');
  const [loading, setLoading] = useState(false);
  const [newDeck, setNewDeck] = useState('');

  const persist = (c: Flashcard[]) => { setCards(c); save('nexus_flashcards', c); };
  const persistDecks = (d: string[]) => { setDecks(d); save('nexus_decks', d); };

  const deckCards = cards.filter(c => c.deck === deck);
  const dueCards = deckCards.filter(c => c.due <= Date.now());
  const studyCards = dueCards.length > 0 ? dueCards : deckCards;
  const current = studyCards[studyIdx % Math.max(1, studyCards.length)];

  const addCard = () => {
    if (!front.trim() || !back.trim()) return;
    persist([...cards, { id: uid(), front, back, deck, due: Date.now(), interval: 1, ease: 2.5, reps: 0 }]);
    setFront(''); setBack('');
  };

  const rate = (q: number) => {
    if (!current) return;
    const c = { ...current };
    if (q < 3) { c.interval = 1; c.ease = Math.max(1.3, c.ease - 0.2); }
    else { c.interval = c.reps === 0 ? 1 : c.reps === 1 ? 6 : Math.round(c.interval * c.ease); c.ease = c.ease + (0.1 - (5-q)*(0.08+(5-q)*0.02)); }
    c.reps++; c.due = Date.now() + c.interval * 86400000;
    persist(cards.map(x => x.id === c.id ? c : x));
    setFlipped(false);
    setStudyIdx(i => i + 1);
  };

  const generate = async () => {
    if (!genTopic.trim()) return;
    setLoading(true);
    const n = parseInt(genCount) || 10;
    const res = await ai(
      `Generate ${n} flashcards about "${genTopic}". Return ONLY a JSON array like: [{"front":"Q?","back":"A"},...]. No markdown, no explanation.`,
      'You are a flashcard generator. Return only valid JSON arrays.'
    );
    try {
      const clean = res.replace(/```json|```/g, '').trim();
      const parsed: {front:string;back:string}[] = JSON.parse(clean);
      const newCards = parsed.map(p => ({ id: uid(), front: p.front, back: p.back, deck, due: Date.now(), interval: 1, ease: 2.5, reps: 0 }));
      persist([...cards, ...newCards]);
      setMode('browse');
    } catch { alert('AI returned unexpected format. Try again.'); }
    setLoading(false);
  };

  const deleteCard = (id: string) => persist(cards.filter(c => c.id !== id));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-purple-400" />
          <h2 className="font-bold text-white">Flashcards</h2>
          <span className="text-xs text-slate-500">{dueCards.length} due . {deckCards.length} total</span>
        </div>
        <div className="flex items-center gap-2">
          {(['browse','study','add','generate'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setStudyIdx(0); setFlipped(false); }}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
                mode === m ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-slate-500 hover:text-white')}>
              {m === 'generate' ? '✨ AI Generate' : m}
            </button>
          ))}
        </div>
      </div>

      {/* Deck selector */}
      <div className="flex items-center gap-2 px-6 py-2 border-b border-white/5 flex-shrink-0 overflow-x-auto">
        {decks.map(d => (
          <button key={d} onClick={() => setDeck(d)}
            className={cn('px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
              deck === d ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300')}>
            {d} ({cards.filter(c => c.deck === d).length})
          </button>
        ))}
        <div className="flex items-center gap-1 ml-2">
          <input value={newDeck} onChange={e => setNewDeck(e.target.value)} onKeyDown={e => { if (e.key==='Enter'&&newDeck.trim()) { persistDecks([...decks,newDeck.trim()]); setDeck(newDeck.trim()); setNewDeck(''); }}}
            placeholder="+ New deck" className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white w-24 focus:outline-none focus:border-purple-500/40" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

        {/* STUDY MODE */}
        {mode === 'study' && (
          <div className="flex flex-col items-center gap-6 max-w-xl mx-auto">
            {studyCards.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No cards in this deck yet</p>
                <p className="text-sm mt-1">Add cards or use AI Generate</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500">{(studyIdx % studyCards.length) + 1} / {studyCards.length} {dueCards.length > 0 ? `(${dueCards.length} due)` : '(review)'}</p>
                <div onClick={() => setFlipped(!flipped)} className="w-full cursor-pointer"
                  style={{ perspective: '1000px' }}>
                  <div className="relative w-full transition-all duration-500" style={{ transformStyle:'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)', minHeight: '200px' }}>
                    <div className="absolute inset-0 flex items-center justify-center p-8 bg-slate-900 border border-white/10 rounded-2xl text-center" style={{backfaceVisibility:'hidden'}}>
                      <p className="text-lg font-medium text-white">{current?.front}</p>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center p-8 bg-purple-900/20 border border-purple-500/20 rounded-2xl text-center" style={{backfaceVisibility:'hidden', transform:'rotateY(180deg)'}}>
                      <p className="text-base text-slate-200">{current?.back}</p>
                    </div>
                  </div>
                </div>
                {!flipped ? (
                  <button onClick={() => setFlipped(true)} className="px-8 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/10 transition-all">
                    Reveal Answer
                  </button>
                ) : (
                  <div className="flex gap-3">
                    {[{q:1,label:'Again',c:'bg-red-500/20 border-red-500/30 text-red-300'},{q:3,label:'Hard',c:'bg-orange-500/20 border-orange-500/30 text-orange-300'},{q:4,label:'Good',c:'bg-blue-500/20 border-blue-500/30 text-blue-300'},{q:5,label:'Easy',c:'bg-green-500/20 border-green-500/30 text-green-300'}].map(({q,label,c}) => (
                      <button key={q} onClick={() => rate(q)} className={cn('px-5 py-2.5 rounded-xl text-sm font-bold border transition-all', c)}>{label}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ADD MODE */}
        {mode === 'add' && (
          <div className="max-w-xl mx-auto space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase tracking-widest">Front (Question)</label>
              <textarea value={front} onChange={e => setFront(e.target.value)} rows={3} placeholder="What is..."
                className="w-full bg-slate-900 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-purple-500/40 resize-none" />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase tracking-widest">Back (Answer)</label>
              <textarea value={back} onChange={e => setBack(e.target.value)} rows={3} placeholder="Answer..."
                className="w-full bg-slate-900 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-purple-500/40 resize-none" />
            </div>
            <button onClick={addCard} disabled={!front.trim()||!back.trim()} className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium text-sm disabled:opacity-40 transition-all">
              <Plus className="w-4 h-4" /> Add Card
            </button>
          </div>
        )}

        {/* AI GENERATE */}
        {mode === 'generate' && (
          <div className="max-w-xl mx-auto space-y-4">
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl text-sm text-purple-300">
              ✨ AI will generate flashcards on any topic and add them to the selected deck.
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase tracking-widest">Topic</label>
              <input value={genTopic} onChange={e => setGenTopic(e.target.value)} placeholder="e.g. Photosynthesis, WW2, Python basics, French vocab..."
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/40" />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 uppercase tracking-widest">Number of cards</label>
              <select value={genCount} onChange={e => setGenCount(e.target.value)}
                className="bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none w-full">
                {['5','10','15','20','30'].map(n => <option key={n} value={n}>{n} cards</option>)}
              </select>
            </div>
            <button onClick={generate} disabled={loading||!genTopic.trim()} className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium text-sm disabled:opacity-50 transition-all w-full justify-center">
              {loading ? <><RotateCcw className="w-4 h-4 animate-spin" /> Generating...</> : <><Zap className="w-4 h-4" /> Generate {genCount} Cards</>}
            </button>
          </div>
        )}

        {/* BROWSE */}
        {mode === 'browse' && (
          <div className="space-y-2 max-w-2xl">
            {deckCards.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No cards yet. Add some or use AI Generate.</p>
              </div>
            ) : deckCards.map(c => (
              <div key={c.id} className="flex items-start justify-between gap-4 p-4 bg-slate-900/50 border border-white/5 rounded-xl group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{c.front}</p>
                  <p className="text-xs text-slate-400 mt-1">{c.back}</p>
                  <p className="text-[10px] text-slate-600 mt-1">Due: {new Date(c.due).toLocaleDateString()} . Reps: {c.reps}</p>
                </div>
                <button onClick={() => deleteCard(c.id)} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"><Trash2 className="w-4 h-4"/></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

//
// NOTES
//
function Notes() {
  const [notes, setNotes] = useState<Note[]>(() => load('nexus_notes', []));
  const [active, setActive] = useState<string|null>(null);
  const [search, setSearch] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const persist = (n: Note[]) => { setNotes(n); save('nexus_notes', n); };

  const newNote = () => {
    const n: Note = { id: uid(), title: 'Untitled', content: '', tags: [], pinned: false, created: Date.now(), updated: Date.now() };
    persist([n, ...notes]);
    setActive(n.id);
  };

  const update = (id: string, patch: Partial<Note>) => {
    persist(notes.map(n => n.id === id ? { ...n, ...patch, updated: Date.now() } : n));
  };

  const del = (id: string) => {
    persist(notes.filter(n => n.id !== id));
    if (active === id) setActive(null);
  };

  const current = notes.find(n => n.id === active);

  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.content.toLowerCase().includes(search.toLowerCase()) ||
    n.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );
  const sorted = [...filtered.filter(n => n.pinned), ...filtered.filter(n => !n.pinned)];

  const aiAction = async (action: string) => {
    if (!current) return;
    setAiLoading(true);
    let prompt = '';
    if (action === 'summarise') prompt = `Summarise this note in 3-5 bullet points:\n\n${current.content}`;
    else if (action === 'improve') prompt = `Improve the writing of this note. Fix grammar, clarity, flow. Return only the improved text:\n\n${current.content}`;
    else if (action === 'expand') prompt = `Expand this note with more detail and examples:\n\n${current.content}`;
    else if (action === 'custom') prompt = `${aiPrompt}\n\nNote content:\n${current.content}`;
    const res = await ai(prompt);
    update(active!, { content: current.content + '\n\n---\n✨ AI:\n' + res });
    setAiLoading(false);
    setAiPrompt('');
  };

  return (
    <div className="flex h-full">
      {/* Note list */}
      <div className="w-64 flex-shrink-0 border-r border-white/5 flex flex-col bg-slate-950/30">
        <div className="p-3 border-b border-white/5 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              className="bg-transparent text-xs text-white flex-1 focus:outline-none" />
          </div>
          <button onClick={newNote} className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30 transition-all"><Plus className="w-3.5 h-3.5"/></button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {sorted.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-600 mt-8">No notes yet.<br />Click + to create one.</div>
          ) : sorted.map(n => (
            <button key={n.id} onClick={() => setActive(n.id)}
              className={cn('w-full text-left px-4 py-3 border-b border-white/5 transition-all group hover:bg-white/3',
                active === n.id ? 'bg-white/5' : '')}>
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <p className="text-xs font-semibold text-white truncate flex-1">{n.pinned && '📌 '}{n.title || 'Untitled'}</p>
                <button onClick={e => { e.stopPropagation(); del(n.id); }} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"><Trash2 className="w-3 h-3"/></button>
              </div>
              <p className="text-[10px] text-slate-500 truncate">{n.content.slice(0, 60) || 'Empty note'}</p>
              <p className="text-[9px] text-slate-700 mt-0.5">{new Date(n.updated).toLocaleDateString()}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      {current ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-3 px-6 py-3 border-b border-white/5 flex-shrink-0">
            <input value={current.title} onChange={e => update(active!, { title: e.target.value })}
              className="flex-1 bg-transparent text-base font-semibold text-white focus:outline-none" />
            <button onClick={() => update(active!, { pinned: !current.pinned })} className="text-slate-500 hover:text-yellow-400 transition-colors">
              {current.pinned ? <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /> : <StarOff className="w-4 h-4" />}
            </button>
            <p className="text-[10px] text-slate-600">Saved {new Date(current.updated).toLocaleTimeString()}</p>
          </div>
          <textarea value={current.content} onChange={e => update(active!, { content: e.target.value })}
            placeholder="Start writing... Markdown supported."
            className="flex-1 bg-transparent p-6 text-sm text-slate-200 focus:outline-none resize-none leading-relaxed custom-scrollbar" />
          {/* AI toolbar */}
          <div className="border-t border-white/5 px-4 py-3 flex items-center gap-2 flex-wrap flex-shrink-0 bg-black/30">
            {['summarise','improve','expand'].map(a => (
              <button key={a} onClick={() => aiAction(a)} disabled={aiLoading || !current.content}
                className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-500/20 transition-all disabled:opacity-40 capitalize">
                {aiLoading ? '...' : `✨ ${a}`}
              </button>
            ))}
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => { if (e.key==='Enter'&&aiPrompt.trim()) aiAction('custom'); }}
                placeholder="Ask AI about this note..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/40" />
              <button onClick={() => aiAction('custom')} disabled={!aiPrompt.trim()||aiLoading}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-500 disabled:opacity-40 transition-all">
                {aiLoading ? '...' : 'Ask'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-600 flex-col gap-3">
          <StickyNote className="w-10 h-10 opacity-30" />
          <p className="text-sm">Select or create a note</p>
          <button onClick={newNote} className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl text-sm hover:bg-indigo-500/20 transition-all">
            <Plus className="w-4 h-4 inline mr-1" /> New Note
          </button>
        </div>
      )}
    </div>
  );
}

//
// TASKS
//
function Tasks() {
  const [tasks, setTasks] = useState<Task[]>(() => load('nexus_tasks', []));
  const [input, setInput] = useState('');
  const [priority, setPriority] = useState<'low'|'medium'|'high'>('medium');
  const [category, setCategory] = useState('Personal');
  const [filter, setFilter] = useState<'all'|'today'|'done'|'pending'>('pending');
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const categories = ['Personal', 'Work', 'Health', 'Learning', 'Shopping', 'Finance'];

  const persist = (t: Task[]) => { setTasks(t); save('nexus_tasks', t); };

  const add = () => {
    if (!input.trim()) return;
    persist([...tasks, { id: uid(), text: input.trim(), done: false, priority, category, created: Date.now() }]);
    setInput('');
  };

  const toggle = (id: string) => persist(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const del = (id: string) => persist(tasks.filter(t => t.id !== id));

  const aiBreakdown = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    const res = await ai(
      `Break this goal into 5-8 specific actionable tasks: "${aiInput}". Return only a JSON array of strings: ["task1","task2",...]. No markdown.`,
      'Task breakdown assistant. Return only JSON arrays.'
    );
    try {
      const parsed: string[] = JSON.parse(res.replace(/```json|```/g, '').trim());
      const newTasks = parsed.map(t => ({ id: uid(), text: t, done: false, priority: 'medium' as const, category, created: Date.now() }));
      persist([...tasks, ...newTasks]);
      setAiInput('');
    } catch { alert('Try again'); }
    setAiLoading(false);
  };

  const filtered = tasks.filter(t => {
    if (filter === 'done') return t.done;
    if (filter === 'pending') return !t.done;
    return true;
  });

  const priorityColor = { low: 'text-slate-500', medium: 'text-yellow-400', high: 'text-red-400' };
  const priorityDot = { low: 'bg-slate-500', medium: 'bg-yellow-400', high: 'bg-red-400' };

  const grouped = categories.reduce((acc, cat) => {
    const items = filtered.filter(t => t.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {} as Record<string, Task[]>);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-white/5 flex-shrink-0 space-y-3">
        {/* Add task */}
        <div className="flex items-center gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==='Enter' && add()}
            placeholder="Add a task..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/40" />
          <select value={priority} onChange={e => setPriority(e.target.value as any)}
            className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none">
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={add} className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all"><Plus className="w-4 h-4"/></button>
        </div>
        {/* AI breakdown */}
        <div className="flex items-center gap-2">
          <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key==='Enter' && aiBreakdown()}
            placeholder="✨ AI breakdown: e.g. 'Launch my freelance business'"
            className="flex-1 bg-indigo-500/5 border border-indigo-500/20 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/40" />
          <button onClick={aiBreakdown} disabled={aiLoading||!aiInput.trim()} className="px-4 py-2 bg-indigo-600/70 text-white rounded-xl text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 transition-all whitespace-nowrap">
            {aiLoading ? '...' : '✨ Break it down'}
          </button>
        </div>
        {/* Filter tabs */}
        <div className="flex gap-2">
          {(['pending','all','done'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all',
                filter === f ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white')}>
              {f} ({f==='pending'?tasks.filter(t=>!t.done).length:f==='done'?tasks.filter(t=>t.done).length:tasks.length})
            </button>
          ))}
          {tasks.filter(t=>t.done).length > 0 && (
            <button onClick={() => persist(tasks.filter(t=>!t.done))}
              className="px-3 py-1 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-all ml-auto">
              Clear done
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <CheckSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>{filter === 'done' ? 'No completed tasks' : 'All clear!'}</p>
          </div>
        ) : Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{cat}</p>
            <div className="space-y-1.5">
              {items.map(t => (
                <div key={t.id} className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border transition-all group', t.done ? 'bg-white/2 border-white/5 opacity-50' : 'bg-slate-900/50 border-white/8 hover:border-white/15')}>
                  <button onClick={() => toggle(t.id)}
                    className={cn('w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all',
                      t.done ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600 hover:border-indigo-400')}>
                    {t.done && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', priorityDot[t.priority])} />
                  <span className={cn('flex-1 text-sm', t.done ? 'line-through text-slate-500' : 'text-white')}>{t.text}</span>
                  <button onClick={() => del(t.id)} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

//
// HABITS
//
const HABIT_PRESETS = [
  {name:'Morning workout',icon:'💪',color:'text-red-400'},
  {name:'Read 20 mins',icon:'📖',color:'text-blue-400'},
  {name:'Drink 2L water',icon:'💧',color:'text-cyan-400'},
  {name:'No social media',icon:'📵',color:'text-orange-400'},
  {name:'Sleep by midnight',icon:'🌙',color:'text-purple-400'},
  {name:'Meditate',icon:'🧘',color:'text-emerald-400'},
  {name:'Journal',icon:'✍️',color:'text-yellow-400'},
  {name:'Cold shower',icon:'🚿',color:'text-sky-400'},
];

function Habits() {
  const [habits, setHabits] = useState<Habit[]>(() => load('nexus_habits', []));
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('⭐');

  const persist = (h: Habit[]) => { setHabits(h); save('nexus_habits', h); };

  const addHabit = (name: string, icon: string, color = 'text-indigo-400') => {
    persist([...habits, { id: uid(), name, icon, color, entries: [], streak: 0 }]);
    setNewName(''); setNewIcon('⭐');
  };

  const toggleToday = (id: string) => {
    const td = today();
    persist(habits.map(h => {
      if (h.id !== id) return h;
      const has = h.entries.some(e => e.date === td && e.done);
      const entries = has
        ? h.entries.map(e => e.date === td ? { ...e, done: false } : e)
        : [...h.entries.filter(e => e.date !== td), { date: td, done: true }];
      // recalculate streak
      let streak = 0;
      const d = new Date(); 
      while (true) {
        const ds = d.toISOString().slice(0,10);
        if (entries.some(e => e.date === ds && e.done)) { streak++; d.setDate(d.getDate()-1); }
        else break;
      }
      return { ...h, entries, streak };
    }));
  };

  const del = (id: string) => persist(habits.filter(h => h.id !== id));

  // Last 7 days
  const days = Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate()-6+i);
    return d.toISOString().slice(0,10);
  });
  const dayLabels = days.map(d => new Date(d).toLocaleDateString('en',{weekday:'short'}));

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key==='Enter'&&newName.trim()&&addHabit(newName,newIcon)}
            placeholder="New habit name..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/40" />
          <input value={newIcon} onChange={e => setNewIcon(e.target.value)} maxLength={2}
            className="w-14 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white text-center focus:outline-none" />
          <button onClick={() => newName.trim()&&addHabit(newName,newIcon)} className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-all"><Plus className="w-4 h-4"/></button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {HABIT_PRESETS.map(p => (
            <button key={p.name} onClick={() => !habits.some(h=>h.name===p.name) && addHabit(p.name,p.icon,p.color)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-all',
                habits.some(h=>h.name===p.name)
                  ? 'bg-white/5 border-white/10 text-slate-500 cursor-default'
                  : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5')}>
              {p.icon} {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {habits.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No habits yet. Add one above or pick a preset.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Header row */}
            <div className="flex items-center gap-2 pl-4 pr-10">
              <div className="flex-1" />
              {dayLabels.map((d,i) => (
                <div key={i} className={cn('w-8 text-center text-[10px] font-bold uppercase', days[i]===today() ? 'text-emerald-400' : 'text-slate-600')}>{d}</div>
              ))}
              <div className="w-12 text-[10px] text-slate-600 text-center">Streak</div>
            </div>
            {habits.map(h => {
              const td = today();
              const doneToday = h.entries.some(e => e.date === td && e.done);
              return (
                <div key={h.id} className="flex items-center gap-2 px-4 py-3 bg-slate-900/50 border border-white/5 rounded-xl group">
                  <span className="text-lg w-6 text-center flex-shrink-0">{h.icon}</span>
                  <span className="flex-1 text-sm font-medium text-white truncate">{h.name}</span>
                  {days.map(d => {
                    const done = h.entries.some(e => e.date === d && e.done);
                    const isToday = d === td;
                    return (
                      <button key={d} onClick={() => isToday && toggleToday(h.id)}
                        className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-base transition-all',
                          done ? 'bg-emerald-500/20 text-emerald-400' : isToday ? 'bg-white/5 hover:bg-emerald-500/10 text-slate-600 hover:text-emerald-400 cursor-pointer' : 'opacity-20 cursor-default',
                          isToday && !done && 'ring-1 ring-slate-600')}>
                        {done ? 'OK' : isToday ? '○' : '.'}
                      </button>
                    );
                  })}
                  <div className={cn('w-12 text-center text-sm font-bold', h.streak > 0 ? 'text-orange-400' : 'text-slate-600')}>
                    {h.streak > 0 ? `🔥${h.streak}` : '--'}
                  </div>
                  <button onClick={() => del(h.id)} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 ml-1 transition-all"><Trash2 className="w-3.5 h-3.5"/></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

//
// FOCUS TIMER (Pomodoro)
//
function FocusTimer() {
  const [mode, setMode] = useState<'focus'|'short'|'long'>('focus');
  const DURATIONS = { focus: 25*60, short: 5*60, long: 15*60 };
  const [seconds, setSeconds] = useState(DURATIONS.focus);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [task, setTask] = useState('');
  const [log, setLog] = useState<{task:string;mins:number;ts:number}[]>(() => load('nexus_focus_log', []));
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    setSeconds(DURATIONS[mode]);
    setRunning(false);
  }, [mode]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            if (mode === 'focus') {
              const newSessions = sessions + 1;
              setSessions(newSessions);
              const entry = { task: task || 'Focus session', mins: 25, ts: Date.now() };
              const newLog = [entry, ...log].slice(0, 50);
              setLog(newLog);
              save('nexus_focus_log', newLog);
              // Auto-suggest break
              setMode(newSessions % 4 === 0 ? 'long' : 'short');
            } else {
              setMode('focus');
            }
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [running, mode, sessions, task, log]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progress = 1 - seconds / DURATIONS[mode];
  const circumference = 2 * Math.PI * 90;

  return (
    <div className="flex flex-col h-full items-center justify-start p-6 gap-6 overflow-y-auto custom-scrollbar">
      {/* Mode tabs */}
      <div className="flex gap-2 p-1 bg-white/5 border border-white/5 rounded-2xl">
        {([['focus','Focus','25 min'],['short','Short Break','5 min'],['long','Long Break','15 min']] as const).map(([id,label,dur]) => (
          <button key={id} onClick={() => setMode(id)}
            className={cn('px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              mode === id ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-white')}>
            {label} <span className="text-xs opacity-50 ml-1">{dur}</span>
          </button>
        ))}
      </div>

      {/* Task */}
      <input value={task} onChange={e => setTask(e.target.value)} placeholder="What are you working on?"
        className="w-full max-w-sm bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white text-center focus:outline-none focus:border-indigo-500/40" />

      {/* Timer ring */}
      <div className="relative flex items-center justify-center">
        <svg width="220" height="220" className="-rotate-90">
          <circle cx="110" cy="110" r="90" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8"/>
          <circle cx="110" cy="110" r="90" fill="none"
            stroke={mode==='focus'?'#6366f1':mode==='short'?'#10b981':'#f59e0b'}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            style={{transition:'stroke-dashoffset 1s linear'}}/>
        </svg>
        <div className="absolute text-center">
          <p className="text-5xl font-bold font-mono text-white tracking-tight">
            {String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}
          </p>
          <p className="text-xs text-slate-500 mt-1 capitalize">{mode === 'focus' ? 'Focus' : 'Break'}</p>
          <p className="text-xs text-indigo-400 mt-0.5">{sessions} sessions today</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button onClick={() => { setSeconds(DURATIONS[mode]); setRunning(false); }}
          className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all">
          <RotateCcw className="w-5 h-5"/>
        </button>
        <button onClick={() => setRunning(!running)}
          className={cn('flex items-center gap-2 px-8 py-3.5 rounded-2xl text-base font-bold transition-all',
            running ? 'bg-red-500/20 border border-red-500/30 text-red-300' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20')}>
          {running ? <><Pause className="w-5 h-5"/>Pause</> : <><Play className="w-5 h-5"/>Start</>}
        </button>
        <button onClick={() => setMode(mode==='focus'?'short':'focus')}
          className="p-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all">
          <SkipForward className="w-5 h-5"/>
        </button>
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div className="w-full max-w-md">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Today's Sessions</p>
          <div className="space-y-1.5">
            {log.slice(0,8).map((l,i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border border-white/5 rounded-xl">
                <span className="text-sm text-white">{l.task}</span>
                <span className="text-xs text-slate-500">{l.mins}min . {new Date(l.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

//
// BUDGET TRACKER
//
function Budget() {
  const [entries, setEntries] = useState<BudgetEntry[]>(() => load('nexus_budget', []));
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'income'|'expense'>('expense');
  const [category, setCategory] = useState('Food');
  const [aiQ, setAiQ] = useState('');
  const [aiA, setAiA] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const expenseCategories = ['Food','Transport','Entertainment','Shopping','Health','Bills','Other'];

  const persist = (e: BudgetEntry[]) => { setEntries(e); save('nexus_budget', e); };
  const add = () => {
    if (!label.trim() || !amount) return;
    persist([{ id: uid(), label, amount: parseFloat(amount), type, category, date: today() }, ...entries]);
    setLabel(''); setAmount('');
  };

  const income = entries.filter(e=>e.type==='income').reduce((s,e)=>s+e.amount, 0);
  const expense = entries.filter(e=>e.type==='expense').reduce((s,e)=>s+e.amount, 0);
  const balance = income - expense;

  const byCategory = expenseCategories.reduce((acc, cat) => {
    const total = entries.filter(e => e.type==='expense' && e.category===cat).reduce((s,e)=>s+e.amount,0);
    if (total > 0) acc[cat] = total;
    return acc;
  }, {} as Record<string,number>);

  const askAi = async () => {
    if (!aiQ.trim()) return;
    setAiLoading(true);
    const summary = `Income: £${income.toFixed(2)}, Expenses: £${expense.toFixed(2)}, Balance: £${balance.toFixed(2)}. Top categories: ${Object.entries(byCategory).map(([k,v])=>`${k} £${v.toFixed(2)}`).join(', ')}`;
    setAiA(await ai(`Budget summary: ${summary}\n\nUser question: ${aiQ}`, 'You are a personal finance advisor. Be concise and practical.'));
    setAiLoading(false);
    setAiQ('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-white/5 flex-shrink-0 space-y-3">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          {[{label:'Income',val:income,c:'text-emerald-400'},{label:'Expenses',val:expense,c:'text-red-400'},{label:'Balance',val:balance,c:balance>=0?'text-emerald-400':'text-red-400'}].map(s => (
            <div key={s.label} className="bg-slate-900/50 border border-white/5 rounded-xl p-3 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">{s.label}</p>
              <p className={cn('text-lg font-bold mt-1', s.c)}>£{Math.abs(s.val).toFixed(2)}</p>
            </div>
          ))}
        </div>
        {/* Add entry */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-white/10 overflow-hidden">
            {(['expense','income'] as const).map(t => (
              <button key={t} onClick={() => setType(t)}
                className={cn('px-3 py-2 text-xs font-semibold capitalize transition-all',
                  type===t ? (t==='expense'?'bg-red-500/20 text-red-300':'bg-emerald-500/20 text-emerald-300') : 'text-slate-500 hover:text-white')}>
                {t}
              </button>
            ))}
          </div>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none" />
          <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="£0.00"
            className="w-24 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none" />
          {type === 'expense' && (
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="bg-slate-900 border border-white/10 rounded-xl px-2 py-2 text-xs text-white focus:outline-none">
              {expenseCategories.map(c => <option key={c}>{c}</option>)}
            </select>
          )}
          <button onClick={add} className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all"><Plus className="w-4 h-4"/></button>
        </div>
        {/* AI Finance */}
        <div className="flex items-center gap-2">
          <input value={aiQ} onChange={e => setAiQ(e.target.value)} onKeyDown={e => e.key==='Enter'&&askAi()}
            placeholder="✨ Ask AI about your budget..."
            className="flex-1 bg-indigo-500/5 border border-indigo-500/20 rounded-xl px-4 py-2 text-sm text-white focus:outline-none" />
          <button onClick={askAi} disabled={aiLoading||!aiQ.trim()} className="px-4 py-2 bg-indigo-600/70 text-white rounded-xl text-sm disabled:opacity-40 transition-all">
            {aiLoading?'...':'Ask'}
          </button>
        </div>
        {aiA && <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-sm text-slate-300">{aiA}</div>}
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-2">
        {entries.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No transactions yet</p>
          </div>
        ) : entries.map(e => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-3 bg-slate-900/50 border border-white/5 rounded-xl group">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0', e.type==='income'?'bg-emerald-500/15':'bg-red-500/15')}>
              {e.type==='income'?'↑':'↓'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{e.label}</p>
              <p className="text-[10px] text-slate-500">{e.category} . {e.date}</p>
            </div>
            <p className={cn('text-sm font-bold', e.type==='income'?'text-emerald-400':'text-red-400')}>
              {e.type==='income'?'+':'-'}£{e.amount.toFixed(2)}
            </p>
            <button onClick={() => persist(entries.filter(x=>x.id!==e.id))} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"><Trash2 className="w-3.5 h-3.5"/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

//
// AI STUDY ASSISTANT
//
function StudyAI() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'explain'|'quiz'|'essay'|'summarise'|'mindmap'>('explain');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState<'beginner'|'intermediate'|'advanced'>('intermediate');

  const prompts: Record<string, string> = {
    explain: `Explain "${input}" at a ${level} level. Use clear language, examples, and analogies. Structure it well.`,
    quiz: `Create 5 quiz questions about "${input}" at ${level} level. Include answers. Format: Q1: ... A1: ...`,
    essay: `Write a well-structured essay outline about "${input}" with introduction, 3 main points with evidence, and conclusion.`,
    summarise: `Summarise this text in clear bullet points, keeping only the most important information:\n\n${input}`,
    mindmap: `Create a text-based mind map for "${input}". Use indentation to show hierarchy. Start with the central topic, then branches, then sub-branches.`,
  };

  const run = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setResult(await ai(prompts[mode], 'You are a study assistant. Be educational, clear, and structured.'));
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(['explain','quiz','essay','summarise','mindmap'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
              mode===m ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-slate-500 hover:text-white border border-transparent')}>
            {m === 'mindmap' ? '🗺 Mind Map' : m === 'explain' ? '💡 Explain' : m === 'quiz' ? '❓ Quiz Me' : m === 'essay' ? '📝 Essay Outline' : '📋 Summarise'}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          {(['beginner','intermediate','advanced'] as const).map(l => (
            <button key={l} onClick={() => setLevel(l)}
              className={cn('px-2 py-1 rounded text-[10px] font-semibold capitalize transition-all',
                level===l ? 'bg-blue-500/20 text-blue-300' : 'text-slate-600 hover:text-slate-400')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-2">
        <textarea value={input} onChange={e => setInput(e.target.value)} rows={3}
          placeholder={mode === 'summarise' ? 'Paste the text you want summarised...' : `Enter a topic, concept, or question...`}
          className="flex-1 bg-slate-900 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-purple-500/40 resize-none" />
        <button onClick={run} disabled={loading||!input.trim()} className="px-5 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium text-sm disabled:opacity-40 transition-all h-fit">
          {loading ? <RotateCcw className="w-4 h-4 animate-spin"/> : <Zap className="w-4 h-4"/>}
        </button>
      </div>

      {result && (
        <div className="flex-1 overflow-y-auto bg-slate-900/50 border border-white/5 rounded-2xl p-6 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap custom-scrollbar">
          {result}
        </div>
      )}
    </div>
  );
}

//
// MAIN LIFE HUB
//
const TABS = [
  { id: 'flashcards', label: 'Flashcards', icon: Brain,       color: 'text-purple-400' },
  { id: 'notes',      label: 'Notes',      icon: StickyNote,  color: 'text-yellow-400' },
  { id: 'tasks',      label: 'Tasks',      icon: CheckSquare, color: 'text-blue-400'   },
  { id: 'habits',     label: 'Habits',     icon: Target,      color: 'text-emerald-400'},
  { id: 'focus',      label: 'Focus',      icon: Timer,       color: 'text-red-400'    },
  { id: 'budget',     label: 'Budget',     icon: DollarSign,  color: 'text-green-400'  },
  { id: 'study',      label: 'Study AI',   icon: BookOpen,    color: 'text-indigo-400' },
];

export default function LifeHub({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState(initialTab || 'flashcards');
  // Sync if parent changes tab (clicking sidebar items)
  React.useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  const active = TABS.find(t => t.id === tab)!;

  return (
    <div className="flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-3 border-b border-white/5 flex-shrink-0 overflow-x-auto bg-black/40">
        <div className="flex items-center gap-2 mr-4 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
            <Zap className="w-4 h-4 text-indigo-400" />
          </div>
          <span className="font-bold text-white text-sm">Life Hub</span>
        </div>
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0',
                tab === t.id
                  ? `bg-white/8 text-white border border-white/10`
                  : 'text-slate-500 hover:text-slate-300 border border-transparent')}>
              <Icon className={cn('w-3.5 h-3.5', tab === t.id ? t.color : '')} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Page */}
      <div className="flex-1 overflow-hidden">
        {tab === 'flashcards' && <Flashcards />}
        {tab === 'notes'      && <Notes />}
        {tab === 'tasks'      && <Tasks />}
        {tab === 'habits'     && <Habits />}
        {tab === 'focus'      && <FocusTimer />}
        {tab === 'budget'     && <Budget />}
        {tab === 'study'      && <StudyAI />}
      </div>
    </div>
  );
}
