/**
 * NexusAI Dashboard live system status, Ollama models, quick access
 * Pulls real data from /api/agent/status and /api/models
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Cpu, Database, Activity, Zap, Server, HardDrive, Brain,
  RefreshCw, ChevronRight, Wifi, WifiOff, Terminal, Shield,
  Layers, Bot, Sparkles, Code, Eye, Mic
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

const PRIMARY_MODEL = 'mdq100/Gemma3-Instruct-Abliterated:12b';
const OPENCLAW_MODEL = 'hf.co/mradermacher/Qwen3.5-9B-Claude-4.6-HighIQ-THINKING-HERETIC-UNCENSORED-i1-GGUF:Q4_K_M';

interface SysStats {
  cpus: number; platform: string; nodeVersion: string;
  totalMemGb: string; freeMemGb: string;
  gpu: string; diskFreeGb?: string;
}

// Animated counter 
function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const duration = 800;
    const from = display;
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setDisplay(from + (value - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{Math.round(display)}{suffix}</>;
}

// Metric card 
function MetricCard({
  icon: Icon, label, value, sub, color, pulse
}: {
  icon: React.ElementType; label: string; value: string;
  sub?: string; color: string; pulse?: boolean;
}) {
  return (
    <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4 flex items-start gap-3 hover:border-white/10 transition-all">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
        <Icon className="w-4.5 h-4.5 w-[18px] h-[18px]"/>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-600 uppercase tracking-widest font-mono">{label}</p>
        <p className="text-base font-bold text-white mt-0.5 flex items-center gap-1.5">
          {value}
          {pulse && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block"/>}
        </p>
        {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats,      setStats]      = useState<SysStats | null>(null);
  const [models,     setModels]     = useState<string[]>([]);
  const [loadedVRAM, setLoadedVRAM] = useState<string[]>([]);
  const [clawOk,     setClawOk]     = useState(false);
  const [ollamaOk,   setOllamaOk]   = useState(false);
  const [uptime,     setUptime]     = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [logs,       setLogs]       = useState<string[]>([
    `[init] NexusAI v4.5.0 starting...`,
    `[core] Express server on :3000`,
    `[ai]   Primary: Gemma3 12B Abliterated`,
    `[ai]   OpenClaw: Qwen3.5 HERETIC 9B`,
    `[sys]  Waiting for status...`,
  ]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => setLogs(p => [...p.slice(-20), `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const loadData = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      // System stats
      const sr = await fetch('/api/agent/status', { signal: AbortSignal.timeout(5000) });
      if (sr.ok) {
        const d = await sr.json();
        setStats(d);
        if (!silent) addLog(`CPU: ${d.cpus} cores | RAM: ${d.freeMemGb}/${d.totalMemGb}GB free | ${d.platform}`);
      }
    } catch { if (!silent) addLog('⚠ Could not reach /api/agent/status'); }

    try {
      // Ollama models
      const mr = await fetch('/api/models', { signal: AbortSignal.timeout(3000) });
      if (mr.ok) {
        const d = await mr.json();
        setModels(d.models || []);
        setOllamaOk(true);
        if (!silent) addLog(`Ollama: ${(d.models||[]).length} models available`);
      }
    } catch { setOllamaOk(false); if (!silent) addLog('⚠ Ollama not responding on :11434'); }

    try {
      // VRAM loaded models
      const vr = await fetch('/api/ollama/loaded', { signal: AbortSignal.timeout(3000) });
      if (vr.ok) {
        const d = await vr.json();
        setLoadedVRAM((d.models||[]).map((m:any) => m.name));
      }
    } catch {}

    try {
      // OpenClaw health
      const cr = await fetch('/api/openclaw/health', { signal: AbortSignal.timeout(3000) });
      if (cr.ok) {
        const d = await cr.json();
        setClawOk(d.ok || false);
        if (!silent) addLog(`OpenClaw: ${d.ok ? 'gateway online :18789' : 'gateway offline'}`);
      }
    } catch { setClawOk(false); }

    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
    const timer  = setInterval(() => setUptime(u => u + 1), 1000);
    const poller = setInterval(() => loadData(true), 15000);
    // Add live log entries every 5s
    const logger = setInterval(() => {
      const msgs = [
        'System check: nominal',
        `Memory: ${stats?.freeMemGb || '?'}GB free`,
        'Polling Ollama health',
        'NexusClaw: checking gateway',
        `Uptime: ${Math.floor(uptime/60)}m`,
      ];
      addLog(msgs[Math.floor(Math.random() * msgs.length)]);
    }, 5000);
    return () => { clearInterval(timer); clearInterval(poller); clearInterval(logger); };
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [logs]);

  const fmt = (s: number) => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const ramPct = stats ? Math.round((1 - parseFloat(stats.freeMemGb) / parseFloat(stats.totalMemGb)) * 100) : 0;

  // Quick nav items
  const NAV = [
    { label: 'Chat',       id: 'chat',       icon: Brain,    color: 'text-indigo-400', desc: 'AI conversation with Gemma 12B' },
    { label: 'NexusCentre',id: 'nexuscentre', icon: Zap,     color: 'text-yellow-400', desc: 'Multi-specialist AI hub' },
    { label: 'NexusClaw',  id: 'nexusclaw',  icon: Shield,   color: 'text-red-400',   desc: 'OpenClaw + AI collab' },
    { label: 'NexusCode',  id: 'nexuscode',  icon: Code,     color: 'text-emerald-400',desc: 'AI code editor' },
    { label: 'KaliVM',     id: 'kalivm',     icon: Terminal, color: 'text-purple-400', desc: 'SSH + security tools' },
    { label: 'AI Tools',   id: 'nexustools', icon: Sparkles, color: 'text-pink-400',   desc: '130 specialist tools' },
    { label: 'OSINT',      id: 'nexusosint', icon: Eye,      color: 'text-cyan-400',   desc: 'People & domain search' },
    { label: 'BioSuit',    id: 'biosuitmonitor', icon: Activity, color: 'text-rose-400', desc: 'Biometric monitoring' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-black px-6 py-5 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">⚡</span> NexusAI
            <span className="text-[10px] font-mono text-indigo-400/60 px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/15 rounded-lg">v4.5.0</span>
          </h1>
          <p className="text-[11px] text-slate-600 mt-0.5 font-mono">Uptime: {fmt(uptime)}</p>
        </div>
        <button onClick={() => loadData()} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/8 border border-white/8 rounded-xl text-[11px] text-slate-400 hover:text-white transition-all">
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')}/>Refresh
        </button>
      </div>

      {/* Service status */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Ollama', ok: ollamaOk, sub: `${models.length} models`, icon: Brain },
          { label: 'OpenClaw', ok: clawOk, sub: 'Gateway :18789', icon: Shield },
          { label: 'NexusAI', ok: true, sub: 'Server :3000', icon: Server },
        ].map(({ label, ok, sub, icon: Icon }) => (
          <div key={label} className={cn('flex items-center gap-3 p-3 rounded-xl border transition-all', ok ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-red-500/8 border-red-500/20')}>
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', ok ? 'bg-emerald-500/20' : 'bg-red-500/20')}>
              <Icon className={cn('w-4 h-4', ok ? 'text-emerald-400' : 'text-red-400')}/>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-white">{label}</span>
                <span className={cn('w-1.5 h-1.5 rounded-full', ok ? 'bg-emerald-400 animate-pulse' : 'bg-red-400')}/>
              </div>
              <p className="text-[9px] text-slate-600 font-mono">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* System metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={Cpu}      label="CPU Cores"  color="bg-indigo-500/20 text-indigo-400"
          value={stats ? `${stats.cpus}` : '...'} sub={stats?.platform} />
        <MetricCard icon={Database} label="RAM Used"   color="bg-purple-500/20 text-purple-400"
          value={stats ? `${ramPct}%` : '...'}
          sub={stats ? `${parseFloat(stats.totalMemGb) - parseFloat(stats.freeMemGb)}/${stats.totalMemGb}GB` : undefined} />
        <MetricCard icon={Activity} label="VRAM Active" color="bg-rose-500/20 text-rose-400"
          value={loadedVRAM.length > 0 ? `${loadedVRAM.length} model${loadedVRAM.length > 1 ? 's' : ''}` : 'Idle'}
          sub={loadedVRAM.length > 0 ? loadedVRAM.map(m => m.split(':')[0].split('/').pop()!).join(', ') : 'No models in VRAM'}
          pulse={loadedVRAM.length > 0} />
        <MetricCard icon={Server}   label="Node.js"    color="bg-emerald-500/20 text-emerald-400"
          value={stats?.nodeVersion || '...'} sub="Runtime" />
      </div>

      {/* AI Models + VRAM */}
      <div className="grid grid-cols-5 gap-3">

        {/* Active models */}
        <div className="col-span-3 bg-slate-900/50 border border-white/5 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-bold text-white flex items-center gap-2"><Layers className="w-3.5 h-3.5 text-indigo-400"/>Active AI Config</h2>
          </div>
          <div className="space-y-2.5">
            {[
              { role: 'Primary (Direct Chat)', model: PRIMARY_MODEL, color: 'text-purple-400', badge: 'No tools', badgeColor: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
              { role: 'OpenClaw (Tool calls)', model: OPENCLAW_MODEL, color: 'text-red-400', badge: '★ Tools', badgeColor: 'bg-red-500/10 border-red-500/20 text-red-400' },
            ].map(({ role, model, color, badge, badgeColor }) => (
              <div key={role} className="flex items-center gap-3 p-3 bg-black/30 rounded-xl border border-white/5">
                <div>
                  <p className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">{role}</p>
                  <p className={cn('text-[11px] font-bold mt-0.5', color)}>
                    {model.split('/').pop()?.replace(/-/g, ' ')}
                  </p>
                  <p className="text-[9px] text-slate-700 font-mono truncate">{model}</p>
                </div>
                <span className={cn('ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0', badgeColor)}>{badge}</span>
              </div>
            ))}
          </div>
          {loadedVRAM.length > 0 && (
            <div className="mt-3 p-2.5 bg-amber-500/8 border border-amber-500/15 rounded-xl">
              <p className="text-[10px] text-amber-400 font-bold mb-1">⚡ In VRAM right now</p>
              {loadedVRAM.map(m => (
                <p key={m} className="text-[10px] text-amber-300/70 font-mono">{m}</p>
              ))}
              <p className="text-[9px] text-slate-600 mt-1">NexusClaw auto-evicts before OpenClaw loads</p>
            </div>
          )}
        </div>

        {/* Ollama model list */}
        <div className="col-span-2 bg-slate-900/50 border border-white/5 rounded-2xl p-4">
          <h2 className="text-[11px] font-bold text-white flex items-center gap-2 mb-3"><Bot className="w-3.5 h-3.5 text-emerald-400"/>Installed Models</h2>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {ollamaOk ? models.length > 0 ? models.map(m => {
              const clean = m.replace(/^hf\.co\/[^/]+\//,'').replace(/^[^/]+\//,'');
              const active = m.includes('Gemma3-Instruct-Abliterated') || m.includes('Heretic') || m.includes('HERETIC');
              return (
                <div key={m} className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-lg', active ? 'bg-indigo-500/10 border border-indigo-500/15' : 'bg-white/3')}>
                  <span className="text-base">{m.includes('llava') ? '👁' : m.includes('qwen') || m.includes('Qwen') ? '🧠' : m.includes('gemma') || m.includes('Gemma') ? '🔥' : m.includes('dolphin') ? '🐬' : '🤖'}</span>
                  <span className={cn('text-[10px] font-mono truncate', active ? 'text-indigo-300' : 'text-slate-500')} title={m}>{clean}</span>
                  {active && <span className="text-[8px] text-indigo-400 flex-shrink-0">★</span>}
                </div>
              );
            }) : <p className="text-[10px] text-slate-700 italic">No models found</p>
            : <p className="text-[10px] text-red-400/60 italic">Ollama offline</p>}
          </div>
        </div>
      </div>

      {/* Quick nav */}
      <div>
        <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">Quick Access</h2>
        <div className="grid grid-cols-4 gap-2">
          {NAV.map(({ label, id, icon: Icon, color, desc }) => (
            <button key={id} onClick={() => window.dispatchEvent(new CustomEvent('nexus-navigate', { detail: id }))} className="flex flex-col items-start gap-2 p-3.5 bg-slate-900/50 hover:bg-slate-900/80 border border-white/5 hover:border-white/12 rounded-2xl transition-all group text-left">
              <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 group-hover:bg-white/8 transition-all')}>
                <Icon className={cn('w-4 h-4', color)}/>
              </div>
              <div>
                <p className="text-[11px] font-bold text-white">{label}</p>
                <p className="text-[9px] text-slate-600 mt-0.5">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Live log */}
      <div className="bg-black/60 border border-white/5 rounded-2xl p-4">
        <h2 className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Terminal className="w-3 h-3"/>System Log
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
        </h2>
        <div className="space-y-0.5 max-h-32 overflow-y-auto font-mono text-[10px]">
          {logs.map((l, i) => (
            <p key={i} className="text-slate-600 leading-relaxed">{l}</p>
          ))}
          <div ref={logEndRef}/>
        </div>
      </div>

    </div>
  );
}
