/**
 * NexusAI Tools 130 tools across 13 categories
 * Ordered by likely usage frequency within each category.
 * Every tool is callable from any chat page via the NexusTools engine.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  Sparkles, Search, RefreshCw, Copy, Check, ChevronRight, ChevronDown,
  Play, Terminal, Zap, Brain, Cpu, Shield, Radio, Activity, Mic,
  Eye, Hand, Settings, Rocket, Database, FlaskConical, Lock,
  X, ArrowRight, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { NEXUS_TOOLS, executeTool, TOOL_CATEGORIES, type NexusTool } from '../services/nexusTools';
import { askOllama } from '../services/api';

// Category meta 
const CAT_META: Record<string, { icon: React.ElementType; color: string; border: string; glow: string }> = {
  'Core System':          { icon: Brain,        color: 'text-indigo-400',  border: 'border-indigo-500/30', glow: 'shadow-indigo-500/10' },
  'Gesture & Input':      { icon: Hand,         color: 'text-amber-400',   border: 'border-amber-500/30',  glow: 'shadow-amber-500/10'  },
  'Control Systems':      { icon: Cpu,          color: 'text-red-400',     border: 'border-red-500/30',    glow: 'shadow-red-500/10'    },
  'Vision & Perception':  { icon: Eye,          color: 'text-cyan-400',    border: 'border-cyan-500/30',   glow: 'shadow-cyan-500/10'   },
  'Data & Logging':       { icon: Database,     color: 'text-emerald-400', border: 'border-emerald-500/30',glow: 'shadow-emerald-500/10'},
  'Audio & Voice':        { icon: Mic,          color: 'text-pink-400',    border: 'border-pink-500/30',   glow: 'shadow-pink-500/10'   },
  'Physiology & Biometrics':{ icon: Activity,   color: 'text-rose-400',    border: 'border-rose-500/30',   glow: 'shadow-rose-500/10'   },
  'AI Intelligence':      { icon: Sparkles,     color: 'text-violet-400',  border: 'border-violet-500/30', glow: 'shadow-violet-500/10' },
  'Communication':        { icon: Radio,        color: 'text-sky-400',     border: 'border-sky-500/30',    glow: 'shadow-sky-500/10'    },
  'System Optimisation':  { icon: Settings,     color: 'text-slate-300',   border: 'border-slate-500/30',  glow: 'shadow-slate-500/10'  },
  'Testing & Dev':        { icon: FlaskConical, color: 'text-lime-400',    border: 'border-lime-500/30',   glow: 'shadow-lime-500/10'   },
  'Safety & Control':     { icon: Lock,         color: 'text-orange-400',  border: 'border-orange-500/30', glow: 'shadow-orange-500/10' },
  'Advanced':             { icon: Rocket,       color: 'text-purple-400',  border: 'border-purple-500/30', glow: 'shadow-purple-500/10' },
};

// Group tools by category 
const GROUPED = TOOL_CATEGORIES.reduce((acc, cat) => {
  acc[cat] = NEXUS_TOOLS.filter(t => t.category === cat);
  return acc;
}, {} as Record<string, NexusTool[]>);

// Param input form 
function ParamForm({
  tool, values, onChange
}: { tool: NexusTool; values: Record<string,string>; onChange: (k: string, v: string) => void }) {
  if (!tool.params.length) return (
    <p className="text-[11px] text-slate-600 italic">This tool takes no parameters -- click Run to execute.</p>
  );
  return (
    <div className="space-y-2">
      {tool.params.map(p => (
        <div key={p}>
          <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block mb-1">{p.replace(/_/g, ' ')}</label>
          <input
            value={values[p] || ''}
            onChange={e => onChange(p, e.target.value)}
            placeholder={`Enter ${p.replace(/_/g, ' ')}...`}
            className="w-full bg-slate-900/60 border border-white/8 rounded-lg px-3 py-2 text-[12px] text-white font-mono focus:outline-none focus:border-indigo-500/40 placeholder-slate-700"
          />
        </div>
      ))}
    </div>
  );
}

// Main component 
export default function NexusAITools() {
  const [activeTool, setActiveTool]   = useState<NexusTool>(NEXUS_TOOLS[0]);
  const [params, setParams]           = useState<Record<string,string>>({});
  const [result, setResult]           = useState('');
  const [running, setRunning]         = useState(false);
  const [copied, setCopied]           = useState(false);
  const [search, setSearch]           = useState('');
  const [openCats, setOpenCats]       = useState<Record<string,boolean>>(
    Object.fromEntries(Object.keys(CAT_META).map((c, i) => [c, i < 3]))
  );
  const [aiMode, setAiMode]           = useState(false);
  const [aiInput, setAiInput]         = useState('');
  const [aiLoading, setAiLoading]     = useState(false);
  const [showInfo, setShowInfo]       = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const filteredGroups = search.trim()
    ? Object.fromEntries(
        Object.entries(GROUPED).map(([cat, tools]) => [
          cat, tools.filter(t =>
            t.name.toLowerCase().includes(search.toLowerCase()) ||
            t.desc.toLowerCase().includes(search.toLowerCase()) ||
            t.id.toLowerCase().includes(search.toLowerCase())
          )
        ]).filter(([, tools]) => tools.length > 0)
      )
    : GROUPED;

  const toggleCat = (cat: string) => setOpenCats(p => ({ ...p, [cat]: !p[cat] }));

  const selectTool = (tool: NexusTool) => {
    setActiveTool(tool);
    setParams({});
    setResult('');
    // Auto-open the category
    setOpenCats(p => ({ ...p, [tool.category]: true }));
  };

  const runTool = async () => {
    setRunning(true);
    setResult('');
    try {
      const res = await executeTool({ toolId: activeTool.id, params, raw: '' });
      setResult(res);
    } catch (e: any) {
      setResult(`⚠ Error: ${e.message}`);
    }
    setRunning(false);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  };

  const runWithAI = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setResult('');
    try {
      const systemPrompt = `You are an expert at using the ${activeTool.name} tool.
Tool description: ${activeTool.desc}
Tool params: ${activeTool.params.join(', ') || 'none'}

The user will describe what they want. Extract the parameters from their request and generate a helpful response as if the tool executed successfully. Format the output as a realistic tool result.`;
      const res = await askOllama(aiInput, systemPrompt);
      setResult(res);
    } catch (e: any) {
      setResult(`⚠ ${e.message}`);
    }
    setAiLoading(false);
  };

  const catMeta = CAT_META[activeTool.category] || CAT_META['Core System'];
  const CatIcon = catMeta.icon;

  const totalVisible = Object.values(filteredGroups).reduce((a, t) => a + t.length, 0);

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">

      {/* Sidebar: tool tree */}
      <div className="w-64 flex-shrink-0 border-r border-white/5 flex flex-col bg-black/30 overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white"/>
            </div>
            <div>
              <p className="text-sm font-bold text-white">NexusAI Tools</p>
              <p className="text-[9px] text-slate-500">{NEXUS_TOOLS.length} tools . 13 categories</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-white/5 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600"/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tools..."
              className="w-full bg-slate-900/60 border border-white/8 rounded-lg pl-7 pr-7 py-1.5 text-[11px] font-mono text-white focus:outline-none focus:border-indigo-500/40 placeholder-slate-700"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white">
                <X className="w-3 h-3"/>
              </button>
            )}
          </div>
          {search && (
            <p className="text-[9px] text-slate-600 mt-1 text-center">{totalVisible} results</p>
          )}
        </div>

        {/* Category tree */}
        <div className="flex-1 overflow-y-auto py-1">
          {Object.entries(filteredGroups).map(([cat, tools]) => {
            const meta  = CAT_META[cat] || CAT_META['Core System'];
            const Icon  = meta.icon;
            const open  = openCats[cat] ?? false;
            return (
              <div key={cat} className="border-b border-white/3 last:border-0">
                {/* Category header */}
                <button
                  onClick={() => toggleCat(cat)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/3 transition-colors text-left"
                >
                  <Icon className={cn('w-3 h-3 flex-shrink-0', meta.color)}/>
                  <span className="text-[10px] font-semibold text-slate-400 flex-1 truncate">{cat}</span>
                  <span className="text-[9px] text-slate-700 font-mono">{tools.length}</span>
                  {open
                    ? <ChevronDown  className="w-2.5 h-2.5 text-slate-700 flex-shrink-0"/>
                    : <ChevronRight className="w-2.5 h-2.5 text-slate-700 flex-shrink-0"/>}
                </button>
                {/* Tool list */}
                {open && tools.map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => selectTool(tool)}
                    className={cn(
                      'w-full flex items-center gap-2 pl-7 pr-3 py-2 text-left transition-all border-l-2',
                      activeTool.id === tool.id
                        ? `bg-indigo-500/10 border-l-indigo-400 ${meta.color}`
                        : 'text-slate-500 border-l-transparent hover:text-slate-300 hover:bg-white/3'
                    )}
                  >
                    <span className="text-sm flex-shrink-0">{tool.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium truncate">{tool.name}</p>
                      <p className="text-[9px] text-slate-600 truncate">{tool.desc.slice(0, 45)}</p>
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Total */}
        <div className="px-3 py-2 border-t border-white/5 flex-shrink-0">
          <p className="text-[9px] text-slate-700 font-mono text-center">{NEXUS_TOOLS.length} tools available . all chats can call these</p>
        </div>
      </div>

      {/* Main: tool panel */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Tool header */}
        <div className={cn('flex items-center gap-4 px-6 py-4 border-b border-white/5 flex-shrink-0 bg-black/20')}>
          <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center text-2xl border', catMeta.border, `shadow-lg ${catMeta.glow}`)}>
            {activeTool.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-white">{activeTool.name}</h2>
              <span className={cn('text-[9px] font-mono px-2 py-0.5 rounded border', catMeta.color, catMeta.border)}>
                {activeTool.category}
              </span>
              {activeTool.serverSide && (
                <span className="text-[9px] font-mono px-2 py-0.5 rounded border border-amber-500/30 text-amber-400 bg-amber-500/5">
                  server-side
                </span>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5">{activeTool.desc}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInfo(p => !p)}
              className="p-2 text-slate-600 hover:text-white transition-colors"
            >
              <Info className="w-4 h-4"/>
            </button>
            <button
              onClick={() => setAiMode(p => !p)}
              className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all',
                aiMode
                  ? 'bg-violet-500/20 border-violet-500/30 text-violet-300'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white')}
            >
              <Brain className="w-3.5 h-3.5"/>AI Mode
            </button>
          </div>
        </div>

        {/* Tool info panel */}
        {showInfo && (
          <div className="mx-6 mt-3 px-4 py-3 bg-slate-900/50 border border-white/8 rounded-xl text-[11px] flex-shrink-0">
            <p className="text-slate-500 font-mono mb-1"><span className="text-slate-400">ID:</span> {activeTool.id}</p>
            <p className="text-slate-500 font-mono mb-1"><span className="text-slate-400">Params:</span> {activeTool.params.join(', ') || 'none'}</p>
            <p className="text-slate-500 font-mono"><span className="text-slate-400">Execution:</span> {activeTool.serverSide ? 'server-side (POST /api/tools/' + activeTool.id + ')' : 'client-side simulation'}</p>
            <p className="text-slate-400 mt-2 leading-relaxed">Any chat page with tool-calling enabled will use this tool when the AI decides it's needed. The AI emits <code className="bg-black/40 px-1 rounded text-emerald-400">&lt;nexus_tool name="{activeTool.id}"&gt;</code> and the engine executes it.</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* AI Mode */}
          {aiMode ? (
            <div className="space-y-3">
              <p className="text-[11px] text-violet-400/70 uppercase font-mono tracking-widest">AI-assisted mode -- describe what you want</p>
              <textarea
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runWithAI(); } }}
                placeholder={`Describe what you want to do with ${activeTool.name}...`}
                rows={3}
                className="w-full bg-slate-900/60 border border-violet-500/20 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500/40 resize-none placeholder-slate-700"
              />
              <button
                onClick={runWithAI}
                disabled={!aiInput.trim() || aiLoading}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-all"
              >
                {aiLoading ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Brain className="w-4 h-4"/>}
                {aiLoading ? 'Thinking...' : 'Run with AI'}
              </button>
            </div>
          ) : (
            // Manual mode
            <div className="space-y-4">
              <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4">
                <h3 className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-3">Parameters</h3>
                <ParamForm
                  tool={activeTool}
                  values={params}
                  onChange={(k, v) => setParams(p => ({ ...p, [k]: v }))}
                />
              </div>
              <button
                onClick={runTool}
                disabled={running}
                className={cn(
                  'flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-all',
                  'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white'
                )}
              >
                {running
                  ? <RefreshCw className="w-4 h-4 animate-spin"/>
                  : <Play className="w-4 h-4"/>}
                {running ? 'Running...' : `Run ${activeTool.name}`}
              </button>
            </div>
          )}

          {/* Result */}
          {result && (
            <div ref={resultRef} className="bg-slate-900/60 border border-white/8 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Output</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-white transition-colors"
                >
                  {copied ? <><Check className="w-3 h-3 text-emerald-400"/>Copied</> : <><Copy className="w-3 h-3"/>Copy</>}
                </button>
              </div>
              <pre className="px-4 py-4 text-[12px] text-emerald-300 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">{result}</pre>
            </div>
          )}

          {/* Quick examples */}
          {!result && activeTool.params.length > 0 && (
            <div className="text-[11px] text-slate-700 space-y-1">
              <p className="font-mono uppercase tracking-widest text-[9px]">Quick fill</p>
              <button
                onClick={() => {
                  const examples: Record<string, Record<string, string>> = {
                    task_planner: { goal: 'Launch a drone photography business', context: 'Budget £500, 3 months timeline' },
                    gesture_recogniser: { sensor_data: 'R1=0.55, R2=0.09, pitch=0.02', hand: 'right' },
                    drone_commander: { command_type: 'SET_POSITION_TARGET_LOCAL_NED', values: 'Vx=2, Vy=0, Vz=-1' },
                    object_detection: { image_url: 'http://localhost:3000/api/camera/frame', confidence: '0.6' },
                    voice_recognition: { audio_data: 'live_microphone' },
                    hr_processor: { ppg_data: 'live_sensor', sample_rate: '100' },
                    decision_engine: { options: 'fly_now, wait_for_wind, cancel', criteria: 'safety, quality, time' },
                  };
                  if (examples[activeTool.id]) {
                    setParams(examples[activeTool.id]);
                  } else {
                    // Generate generic example values
                    const fill: Record<string, string> = {};
                    activeTool.params.forEach(p => { fill[p] = `example_${p}`; });
                    setParams(fill);
                  }
                }}
                className="px-3 py-1.5 bg-white/3 hover:bg-white/6 border border-white/8 rounded-lg text-[10px] text-slate-600 hover:text-white transition-all"
              >
                Fill example values
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
