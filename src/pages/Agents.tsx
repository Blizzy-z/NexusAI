/**
 * Nexus Agent Swarm Real multi-agent orchestration
 * Each agent actually calls AI, executes code, and passes results forward
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  Search, Brain, Code, Zap, Play, Square, RefreshCw,
  ChevronRight, Activity, Users, Terminal, Globe,
  FileText, Database, Cpu, CheckCircle2, AlertCircle,
  MessageSquare, Layers, BarChart3, Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { getGeminiResponse, getOllamaChatResponse } from '../services/api';

interface AgentLog { id: string; agent: string; type: 'think'|'action'|'result'|'pass'|'error'|'done'; content: string; ts: number; }
interface SwarmConfig { objective: string; model: string; maxSteps: number; enableExec: boolean; }

type AgentRole = 'researcher'|'strategist'|'coder'|'executor'|'critic'|'summarizer';

const AGENT_CONFIGS: Record<AgentRole, { name: string; icon: React.ElementType; color: string; bg: string; system: string }> = {
  researcher: {
    name: 'Researcher', icon: Search, color: 'text-blue-400', bg: 'bg-blue-500/10',
    system: 'You are the Researcher agent. Your job: gather and analyze all relevant information about the objective. Break it down into facts, unknowns, and key questions. Be thorough and specific. Output structured findings.'
  },
  strategist: {
    name: 'Strategist', icon: Brain, color: 'text-purple-400', bg: 'bg-purple-500/10',
    system: 'You are the Strategist agent. Based on research findings, create a detailed step-by-step action plan. Be specific about what needs to be built, written, or executed. Number each step clearly.'
  },
  coder: {
    name: 'Coder', icon: Code, color: 'text-emerald-400', bg: 'bg-emerald-500/10',
    system: 'You are the Coder agent. Implement the strategy. Write complete, runnable code. If Python, wrap in ```python. If shell commands, wrap in ```bash. Be thorough -- write production-quality code, not pseudocode.'
  },
  executor: {
    name: 'Executor', icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10',
    system: 'You are the Executor agent. Review the code/plan and determine what to actually execute. Extract runnable commands and describe the execution results. Be practical and specific.'
  },
  critic: {
    name: 'Critic', icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10',
    system: 'You are the Critic agent. Critically review all work done so far. Find flaws, gaps, risks, and improvements. Be harsh but constructive. List specific issues and fixes.'
  },
  summarizer: {
    name: 'Summarizer', icon: FileText, color: 'text-cyan-400', bg: 'bg-cyan-500/10',
    system: 'You are the Summarizer agent. Synthesize all work into a clear, actionable final report. Include: what was accomplished, key outputs/code, next steps, and any remaining issues. Be comprehensive.'
  }
};

const PRESETS = [
  { label: '🐍 Python App', objective: 'Build a Python web scraper that fetches the top 10 Hacker News stories, formats them nicely, and saves to a JSON file' },
  { label: '💼 Business Plan', objective: 'Create a detailed business plan for an AI automation agency targeting small businesses, including services, pricing, and marketing strategy' },
  { label: '🔒 Security Audit', objective: 'Design a comprehensive security audit checklist for a Windows PC running a Node.js server, including network, file system, and application security' },
  { label: '📊 Data Analysis', objective: 'Write a Python script to analyze and visualize CSV data -- load it, clean it, generate statistics, and create charts with matplotlib' },
  { label: '🚀 API Server', objective: 'Build a complete REST API server in Python (FastAPI) with endpoints for CRUD operations, authentication, and documentation' },
  { label: '🤖 AI Pipeline', objective: 'Design an automated AI content pipeline that takes a topic, researches it, writes an article, generates a summary, and formats for publishing' },
];

export default function Agents() {
  const [config, setConfig] = useState<SwarmConfig>({
    objective: '',
    model: 'mdq100/Gemma3-Instruct-Abliterated:12b',
    maxSteps: 6,
    enableExec: true,
  });
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [running, setRunning] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentRole | null>(null);
  const [finalReport, setFinalReport] = useState('');
  const [progress, setProgress] = useState(0);
  const [selectedAgents, setSelectedAgents] = useState<AgentRole[]>(['researcher','strategist','coder','executor','summarizer']);
  const abortRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((agent: string, type: AgentLog['type'], content: string) => {
    const entry: AgentLog = { id: Math.random().toString(36).slice(2), agent, type, content, ts: Date.now() };
    setLogs(prev => [...prev, entry]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  const callAgent = async (role: AgentRole, input: string, objective: string): Promise<string> => {
    const cfg = AGENT_CONFIGS[role];
    setActiveAgent(role);
    addLog(cfg.name, 'think', `Processing objective with ${config.model}...`);

    const prompt = `OBJECTIVE: ${objective}\n\nCONTEXT FROM PREVIOUS AGENTS:\n${input}\n\nYour task as ${cfg.name}: ${cfg.system.split('Your job:')[1]?.split('.')[0] || 'Complete your assigned role.'}`;

    try {
      let reply = '';
      if (config.model.startsWith('gemma') || config.model.startsWith('llama') || config.model.startsWith('dolphin') || config.model.startsWith('mistral') || config.model.startsWith('qwen') || config.model.startsWith('phi') || config.model.startsWith('deepseek')) {
        reply = await getOllamaChatResponse(
          [{ role: 'user', content: prompt }],
          config.model,
          cfg.system
        );
      } else {
        const r = await getGeminiResponse(prompt, cfg.system, config.model);
        reply = (r as any).text || String(r);
      }

      addLog(cfg.name, 'result', reply.slice(0, 400) + (reply.length > 400 ? '...' : ''));

      // If exec enabled and coder produced code, actually run it
      if (config.enableExec && role === 'coder') {
        const pythonMatch = reply.match(/```python\n([\s\S]*?)```/);
        const bashMatch = reply.match(/```bash\n([\s\S]*?)```/);
        if (pythonMatch || bashMatch) {
          addLog('Executor', 'action', 'Detected runnable code -- executing on PC...');
          try {
            const code = pythonMatch?.[1] || bashMatch?.[1] || '';
            const endpoint = pythonMatch ? '/api/agent/exec' : '/api/agent/exec';
            const cmd = pythonMatch
              ? `py -c "${code.replace(/"/g, "'").replace(/\n/g, '; ')}"`.slice(0, 500)
              : code.split('\n')[0]; // just first bash command for safety
            const res = await fetch(endpoint, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ command: cmd, timeout: 15000 })
            });
            if (res.ok) {
              const reader = res.body?.getReader();
              let out = '';
              if (reader) {
                const dec = new TextDecoder();
                while (true) {
                  const { value, done } = await reader.read();
                  if (done) break;
                  out += dec.decode(value, { stream: true });
                }
              }
              if (out.trim()) {
                addLog('Executor', 'result', `Execution output:\n${out.slice(0, 300)}`);
                reply += `\n\nEXECUTION OUTPUT:\n${out}`;
              }
            }
          } catch (e: any) {
            addLog('Executor', 'error', `Exec failed: ${e.message}`);
          }
        }
      }

      return reply;
    } catch (e: any) {
      addLog(cfg.name, 'error', e.message);
      return `[${cfg.name} error: ${e.message}]`;
    }
  };

  const runSwarm = async () => {
    if (!config.objective.trim()) return;
    setRunning(true);
    setLogs([]);
    setFinalReport('');
    setProgress(0);
    abortRef.current = false;

    addLog('Swarm', 'think', `Initializing ${selectedAgents.length}-agent swarm for: "${config.objective.slice(0, 80)}..."`);
    addLog('Swarm', 'action', `Model: ${config.model} | Agents: ${selectedAgents.map(a => AGENT_CONFIGS[a].name).join(' -> ')}`);

    let context = '';
    const total = selectedAgents.length;

    for (let i = 0; i < selectedAgents.length; i++) {
      if (abortRef.current) { addLog('Swarm', 'error', 'Terminated by user'); break; }
      const role = selectedAgents[i];
      setProgress(Math.round((i / total) * 100));
      addLog('Swarm', 'pass', `Passing to ${AGENT_CONFIGS[role].name} (${i + 1}/${total})`);
      const result = await callAgent(role, context, config.objective);
      context += `\n\n=== ${AGENT_CONFIGS[role].name.toUpperCase()} OUTPUT ===\n${result}`;

      if (role === 'summarizer') setFinalReport(result);
    }

    setProgress(100);
    setActiveAgent(null);
    setRunning(false);
    addLog('Swarm', 'done', 'All agents complete OK');
  };

  const stop = () => { abortRef.current = true; setRunning(false); setActiveAgent(null); };

  const toggleAgent = (role: AgentRole) => {
    setSelectedAgents(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const logColors: Record<AgentLog['type'], string> = {
    think: 'text-slate-400', action: 'text-blue-400', result: 'text-emerald-400',
    pass: 'text-purple-400', error: 'text-red-400', done: 'text-cyan-400'
  };

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">

      {/* Left: Config */}
      <div className="w-72 flex-shrink-0 border-r border-white/5 flex flex-col overflow-hidden bg-black/30">
        <div className="px-5 py-4 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-purple-400" />
            <h2 className="font-bold text-white">Agent Swarm</h2>
            <div className={cn('ml-auto px-2 py-0.5 rounded text-[9px] font-mono uppercase border', running ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse' : 'bg-slate-900 text-slate-500 border-white/5')}>
              {running ? 'ACTIVE' : 'STANDBY'}
            </div>
          </div>
          <p className="text-[10px] text-slate-500">Multi-agent AI that thinks, codes, and executes</p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-5">
          {/* Presets */}
          <div>
            <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-2">Quick Start</label>
            <div className="space-y-1">
              {PRESETS.map(p => (
                <button key={p.label} onClick={() => setConfig(c => ({ ...c, objective: p.objective }))}
                  className="w-full text-left px-3 py-2 rounded-xl bg-white/3 hover:bg-white/5 border border-white/5 text-[11px] text-slate-400 hover:text-white transition-all">
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Objective */}
          <div>
            <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-2">Objective</label>
            <textarea value={config.objective} onChange={e => setConfig(c => ({ ...c, objective: e.target.value }))}
              placeholder="Describe the complex task for the swarm to solve..."
              className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-purple-500/40 resize-none h-28" />
          </div>

          {/* Model */}
          <div>
            <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-2">AI Model</label>
            <select value={config.model} onChange={e => setConfig(c => ({ ...c, model: e.target.value }))}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none">
              <option value="mdq100/Gemma3-Instruct-Abliterated:12b">🔥 Gemma 3 12B Abliterated (recommended)</option>
              <option value="gemma3:12b">💎 Gemma 3 12B</option>
              <option value="gemma3:4b">💎 Gemma 3 4B (faster)</option>
              <option value="mdq100/Gemma3-Instruct-Abliterated:12b">* Gemini 3 Flash</option>
              <option value="mdq100/Gemma3-Instruct-Abliterated:12b">* Gemini 3.1 Pro (best)</option>
              <option value="dolphin-llama3:8b">🐬 Dolphin LLaMA3 8B</option>
              <option value="deepseek-r1:7b">🧠 DeepSeek R1 7B</option>
              <option value="qwq:32b">🧠 QwQ 32B</option>
            </select>
          </div>

          {/* Agent selection */}
          <div>
            <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-2">Active Agents</label>
            <div className="space-y-1.5">
              {(Object.keys(AGENT_CONFIGS) as AgentRole[]).map(role => {
                const cfg = AGENT_CONFIGS[role];
                const isSelected = selectedAgents.includes(role);
                const isActive = activeAgent === role && running;
                return (
                  <button key={role} onClick={() => !running && toggleAgent(role)}
                    className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all',
                      isActive ? 'bg-emerald-500/15 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]' :
                      isSelected ? 'bg-white/5 border-white/10' : 'bg-transparent border-white/5 opacity-40')}>
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', cfg.bg)}>
                      <cfg.icon className={cn('w-3.5 h-3.5', cfg.color)} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className={cn('text-xs font-semibold', isSelected ? 'text-white' : 'text-slate-500')}>{cfg.name}</p>
                    </div>
                    {isActive && (
                      <div className="flex gap-0.5">
                        {[0,1,2].map(i => <div key={i} className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: `${i*0.12}s` }} />)}
                      </div>
                    )}
                    {!isActive && isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-slate-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Options */}
          <div>
            <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block mb-2">Options</label>
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white/3 rounded-lg transition-all">
              <div onClick={() => setConfig(c => ({ ...c, enableExec: !c.enableExec }))}
                className={cn('w-7 h-4 rounded-full relative transition-colors flex-shrink-0', config.enableExec ? 'bg-emerald-500' : 'bg-slate-700')}>
                <div className={cn('absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all', config.enableExec ? 'left-3.5' : 'left-0.5')} />
              </div>
              <span className="text-[10px] text-slate-400">Execute code on PC</span>
            </label>
          </div>
        </div>

        {/* Run button */}
        <div className="p-4 border-t border-white/5 flex-shrink-0">
          {progress > 0 && progress < 100 && (
            <div className="mb-3">
              <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1">
                <span>Swarm progress</span><span>{progress}%</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <button onClick={running ? stop : runSwarm} disabled={!running && !config.objective.trim()} className={cn('w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all', running ? 'bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25' : 'bg-purple-600 text-white hover:bg-purple-500 shadow-[0_0_20px_rgba(147,51,234,0.3)] disabled:opacity-40')}>
            {running ? <><Square className="w-4 h-4 fill-current" />Stop Swarm</> : <><Play className="w-4 h-4 fill-current" />Launch Swarm</>}
          </button>
        </div>
      </div>

      {/* Right: Logs + Report */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Agent pipeline visualizer */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-white/5 flex-shrink-0 overflow-x-auto bg-black/20">
          {selectedAgents.map((role, i) => {
            const cfg = AGENT_CONFIGS[role];
            const isActive = activeAgent === role && running;
            const isDone = running && selectedAgents.indexOf(activeAgent!) > i;
            return (
              <React.Fragment key={role}>
                <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-medium transition-all flex-shrink-0', isActive ? `${cfg.bg} ${cfg.color} border-current shadow-md` : isDone ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/3 text-slate-600 border-white/5')}>
                  <cfg.icon className="w-3 h-3" />
                  {cfg.name}
                  {isActive && <RefreshCw className="w-2.5 h-2.5 animate-spin ml-0.5" />}
                  {isDone && <CheckCircle2 className="w-2.5 h-2.5 ml-0.5" />}
                </div>
                {i < selectedAgents.length - 1 && <ChevronRight className="w-3 h-3 text-slate-700 flex-shrink-0 mx-0.5" />}
              </React.Fragment>
            );
          })}
          {logs.length > 0 && (
            <button onClick={() => { setLogs([]); setFinalReport(''); setProgress(0); }}
              className="ml-auto text-[10px] text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0">
              Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Mission log */}
          <div className={cn('flex flex-col overflow-hidden border-r border-white/5', finalReport ? 'w-1/2' : 'flex-1')}>
            <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2 flex-shrink-0">
              <Terminal className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Mission Log</span>
              <span className="ml-auto text-[9px] text-slate-700">{logs.length} entries</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs custom-scrollbar">
              {logs.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-4">
                  <Users className="w-10 h-10 opacity-30" />
                  <div className="text-center">
                    <p className="uppercase tracking-widest text-[10px] mb-1">Swarm Standby</p>
                    <p className="text-[10px]">Configure objective and launch</p>
                  </div>
                  {PRESETS.slice(0,3).map(p => (
                    <button key={p.label} onClick={() => { setConfig(c => ({...c, objective: p.objective})); }}
                      className="px-4 py-2 bg-white/3 hover:bg-white/5 border border-white/5 rounded-xl text-[10px] text-slate-500 hover:text-white transition-all">
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
              {logs.map(l => {
                const cfg = l.agent !== 'Swarm' ? AGENT_CONFIGS[l.agent.toLowerCase() as AgentRole] : null;
                return (
                  <div key={l.id} className="flex gap-3 animate-in fade-in slide-in-from-left-1 duration-200">
                    <span className="text-slate-700 shrink-0 text-[9px] mt-0.5">
                      {new Date(l.ts).toLocaleTimeString([], { hour12: false })}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className={cn('font-bold mr-2', cfg?.color || 'text-slate-400')}>
                        [{l.agent}]
                      </span>
                      <span className={cn('text-[11px] leading-relaxed break-words', logColors[l.type])}>
                        {l.content}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>

          {/* Final report */}
          {finalReport && (
            <div className="w-1/2 flex flex-col overflow-hidden">
              <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2 flex-shrink-0">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">Final Report</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap custom-scrollbar">
                {finalReport}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
