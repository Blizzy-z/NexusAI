/**
 * NexusClaw Dual-agent interface
 *
 * Tab A: "OpenClaw" routes through openclaw CLI (supports tools, Qwen models)
 * Tab B: "Direct Chat" Ollama direct (works with Gemma, no tool prompt)
 * Shared workspace memory with OpenClaw
 * AI Collab mode: Gemma plans OpenClaw executes, loop
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield, WifiOff, RefreshCw, Send, Brain, Trash2, Copy, Check,
  ChevronDown, AlertTriangle, Search, X, Zap, BookOpen, Activity,
  Settings2
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getOllamaChatResponse, stripThinkingTags } from '../services/api';

// Types 
interface Msg { ts: number; role: string; text: string; model?: string; agent?: 'claw'|'direct'; }
interface CollabMsg { ts: number; role: 'gemma'|'openclaw'|'system'; text: string; }
interface ClawStatus { connected: boolean; host: string; port: string; messageCount: number; }

interface ClawModel {
  id: string;
  label: string;
  icon: string;
  supportsTools: boolean;
  vramGb: number;
  openclaw?: boolean;
}

const MODELS: ClawModel[] = [
  // No-tools models (use Direct Chat tab) 
  { id: 'ollama/mdq100/Gemma3-Instruct-Abliterated:12b', label: 'Gemma3 Abliterated 12B', icon: '🔥', supportsTools: false, vramGb: 8  },
  { id: 'ollama/gemma3:12b',                             label: 'Gemma3 12B',              icon: '💎', supportsTools: false, vramGb: 8  },
  { id: 'ollama/gemma3:4b',                              label: 'Gemma3 4B',               icon: '💎', supportsTools: false, vramGb: 3  },
  { id: 'ollama/dolphin-llama3:8b',                      label: 'Dolphin LLaMA3 8B',       icon: '🐬', supportsTools: false, vramGb: 5  },
  { id: 'ollama/dolphin-mistral:latest',                 label: 'Dolphin Mistral',          icon: '🐬', supportsTools: false, vramGb: 5  },
  { id: 'ollama/llava:7b',                               label: 'LLaVA 7B (vision)',        icon: '👁', supportsTools: false, vramGb: 5  },
  // Tool-capable models (use OpenClaw tab) 
  { id: 'ollama/hf.co/mradermacher/Qwen3.5-9B-Claude-4.6-HighIQ-THINKING-HERETIC-UNCENSORED-i1-GGUF:Q4_K_M', label: 'Qwen3.5 HERETIC 9B Q4', icon: '⚡', supportsTools: true,  vramGb: 6, openclaw: true },
  { id: 'ollama/qwen3:8b',                               label: 'Qwen3 8B',                icon: '🧠', supportsTools: true,  vramGb: 5  },
  { id: 'ollama/qwen2.5:7b',                             label: 'Qwen2.5 7B',              icon: '🧠', supportsTools: true,  vramGb: 5  },
  { id: 'ollama/qwen2.5-coder:7b',                       label: 'Qwen2.5 Coder 7B',        icon: '💻', supportsTools: true,  vramGb: 5  },
  { id: 'ollama/glm-4.7-flash',                          label: 'GLM 4.7 Flash',            icon: '✨', supportsTools: true,  vramGb: 5  },
];

async function readWorkspaceMemory(): Promise<string> {
  try {
    const r = await fetch('/api/openclaw/workspace/read', { signal: AbortSignal.timeout(3000) });
    if (r.ok) { const d = await r.json(); return d.content || ''; }
  } catch {}
  return '';
}

async function writeWorkspaceMemory(summary: string): Promise<void> {
  try {
    await fetch('/api/openclaw/workspace/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
    });
  } catch {}
}

// Scan tab 
function ScanTab() {
  const [target, setTarget] = useState('192.168.1.1');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState('');
  const run = async () => {
    setScanning(true); setResult('');
    try {
      const r = await fetch('/api/agent/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: `ping -n 2 -w 1000 ${target}` }) });
      const d = await r.json();
      setResult((d.stdout || '') + (d.stderr || '') || 'No output');
    } catch (e: any) { setResult('Error: ' + e.message); }
    setScanning(false);
  };
  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      <div className="flex gap-3">
        <input value={target} onChange={e => setTarget(e.target.value)} onKeyDown={e => e.key === 'Enter' && run()}
          placeholder="IP or domain" className="flex-1 bg-slate-900/60 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-red-500/40 placeholder-slate-700"/>
        <button onClick={run} disabled={scanning} className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all">
          {scanning ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4"/>}{scanning ? 'Scanning' : 'Scan'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {['192.168.1.1','127.0.0.1','8.8.8.8','1.1.1.1'].map(ip => (
          <button key={ip} onClick={() => setTarget(ip)} className="px-3 py-1.5 bg-white/3 hover:bg-white/6 border border-white/8 rounded-lg text-[10px] font-mono text-slate-500 hover:text-white transition-all">{ip}</button>
        ))}
      </div>
      {result && <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-4"><pre className="text-[12px] text-emerald-300 font-mono whitespace-pre-wrap">{result}</pre></div>}
    </div>
  );
}

// Terminal tab 
function TerminalTab() {
  const [input, setInput] = useState('');
  const [lines, setLines] = useState<{t:'in'|'out'|'err';v:string}[]>([{ t:'out', v:'NexusClaw terminal' }]);
  const [running, setRunning] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);
  const exec = async () => {
    if (!input.trim() || running) return;
    const cmd = input.trim(); setInput('');
    setLines(p => [...p, { t:'in', v:`> ${cmd}` }]);
    setRunning(true);
    try {
      const r = await fetch('/api/agent/exec', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ command: cmd }) });
      const d = await r.json();
      if (d.stdout) setLines(p => [...p, { t:'out', v:d.stdout }]);
      if (d.stderr) setLines(p => [...p, { t:'err', v:d.stderr }]);
    } catch (e: any) { setLines(p => [...p, { t:'err', v:e.message }]); }
    setRunning(false);
  };
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#050505]">
      <div className="flex-1 overflow-y-auto p-4 font-mono text-[12px] space-y-0.5">
        {lines.map((l, i) => <pre key={i} className={cn('whitespace-pre-wrap break-all leading-relaxed', l.t==='in'?'text-cyan-400':l.t==='err'?'text-red-400':'text-emerald-300')}>{l.v}</pre>)}
        {running && <p className="text-amber-400 animate-pulse">executing...</p>}
        <div ref={endRef}/>
      </div>
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/6 bg-black/40 flex-shrink-0">
        <span className="text-red-500 font-mono text-sm select-none">❯</span>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==='Enter' && exec()}
          placeholder="Enter command..." className="flex-1 bg-transparent text-white font-mono text-[12px] focus:outline-none placeholder-slate-700"/>
      </div>
    </div>
  );
}

// Message bubble 
function MsgBubble({ msg, idx, agent, onCopy, copied }: {
  msg: Msg; idx: number; agent: 'claw'|'direct';
  onCopy: (text: string, key: string) => void; copied: string;
}) {
  const isUser  = msg.role === 'user';
  const isAssist= msg.role === 'assistant';
  const isSys   = msg.role === 'system';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      {isSys && <div className="mx-auto px-3 py-1.5 bg-slate-900/60 border border-white/5 rounded-xl text-[10px] text-slate-500 italic max-w-lg text-center">{msg.text}</div>}
      {(isUser || isAssist) && (
        <div className={cn('max-w-2xl group relative')}>
          {isAssist && (
            <div className="flex items-center gap-1.5 mb-1 ml-1">
              <div className={cn('w-4 h-4 rounded-md flex items-center justify-center', agent==='direct'?'bg-purple-500/20':'bg-red-500/20')}>
                {agent==='direct' ? <Brain className="w-2.5 h-2.5 text-purple-400"/> : <Shield className="w-2.5 h-2.5 text-red-400"/>}
              </div>
              <span className={cn('text-[9px] uppercase tracking-widest', agent==='direct'?'text-purple-400':'text-red-400')}>
                {agent==='direct' ? (msg.model?.split(':')[0] || 'Direct') : 'OpenClaw'}
              </span>
              <span className="text-[8px] text-slate-700">{new Date(msg.ts).toLocaleTimeString()}</span>
            </div>
          )}
          <div className={cn('px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words', isUser ? (agent==='direct' ? 'bg-purple-600 text-white rounded-tr-sm' : 'bg-red-600 text-white rounded-tr-sm') : 'bg-slate-900 text-slate-200 border border-white/5 rounded-tl-sm' )}>
            {msg.text}
          </div>
          {isUser && <p className="text-[8px] text-slate-700 text-right mt-0.5 mr-1">{new Date(msg.ts).toLocaleTimeString()}</p>}
          <button onClick={() => onCopy(msg.text, `msg-${idx}`)}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 bg-black/40 rounded text-slate-500 hover:text-white transition-all">
            {copied === `msg-${idx}` ? <Check className="w-3 h-3 text-emerald-400"/> : <Copy className="w-3 h-3"/>}
          </button>
        </div>
      )}
    </div>
  );
}

// Main component 
export default function NexusClaw() {
  const debugLog = (runId: string, hypothesisId: string, location: string, message: string, data: Record<string, unknown>) => {
    // #region agent log
    fetch('http://127.0.0.1:7260/ingest/5f56a8b4-730a-4b8c-8889-3fdd43644d03',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'037707'},body:JSON.stringify({sessionId:'037707',runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  };
  const [mainTab,       setMainTab]       = useState<'openclaw'|'direct'|'scan'|'terminal'|'status'>('openclaw');
  const [clawMsgs,      setClawMsgs]      = useState<Msg[]>([]);
  const [clawStatus,    setClawStatus]    = useState<ClawStatus>({ connected:false, host:'127.0.0.1', port:'18789', messageCount:0 });
  const [clawInput,     setClawInput]     = useState('');
  const [clawSending,   setClawSending]   = useState(false);
  const [directMsgs,    setDirectMsgs]    = useState<Msg[]>([]);
  const [directInput,   setDirectInput]   = useState('');
  const [directSending, setDirectSending] = useState(false);
  const [workspaceMem,  setWorkspaceMem]  = useState('');
  const [selectedModel, setSelectedModel] = useState('ollama/hf.co/mradermacher/Qwen3.5-9B-Claude-4.6-HighIQ-THINKING-HERETIC-UNCENSORED-i1-GGUF:Q4_K_M');
  const [modelDropdown, setModelDropdown] = useState(false);
  const [modelSwitching,setModelSwitching]= useState(false);
  const [reconnecting,  setReconnecting]  = useState(false);
  const [copied,        setCopied]        = useState('');
  const [pollFailures,  setPollFailures]  = useState(0);
  const pollFailuresRef = useRef(0);
  const [collabMode,    setCollabMode]    = useState(false);
  const [collabRunning, setCollabRunning] = useState(false);
  const [collabTurns,   setCollabTurns]   = useState(6);
  const [collabInput,   setCollabInput]   = useState('');
  const [collabMsgs,    setCollabMsgs]    = useState<CollabMsg[]>([]);
  const [loadedModels,  setLoadedModels]  = useState<string[]>([]);  // models in VRAM
  const [unloading,     setUnloading]     = useState(false);

  const clawEndRef   = useRef<HTMLDivElement>(null);
  const directEndRef = useRef<HTMLDivElement>(null);
  const collabEndRef = useRef<HTMLDivElement>(null);
  const pollRef      = useRef<ReturnType<typeof setInterval>>();
  const collabStop   = useRef(false);

  const currentModel  = MODELS.find(m => m.id === selectedModel);
  const modelForDirect = selectedModel.replace('ollama/', '');

  useEffect(() => { clawEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [clawMsgs, clawSending]);
  useEffect(() => { directEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [directMsgs, directSending]);
  useEffect(() => { collabEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [collabMsgs, collabRunning]);

  useEffect(() => {
    // #region agent log
    debugLog('pre-fix','H3','NexusClaw.tsx:mount','NexusClaw mounted',{
      initialTab: mainTab,
      selectedModel,
    });
    // #endregion
    try {
      const saved = localStorage.getItem('nexusclaw_direct');
      if (saved) setDirectMsgs(JSON.parse(saved).slice(-100));
    } catch {}
    readWorkspaceMemory().then(m => setWorkspaceMem(m));
    // Load VRAM status on mount
    fetch('/api/ollama/loaded').then(r=>r.json()).then(d=>setLoadedModels((d.models||[]).map((m:any)=>m.name))).catch(()=>{});
  }, []);

  // Poll VRAM status every 10s
  useEffect(() => {
    const t = setInterval(() => {
      fetch('/api/ollama/loaded').then(r=>r.json()).then(d=>setLoadedModels((d.models||[]).map((m:any)=>m.name))).catch(()=>{});
    }, 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (directMsgs.length) localStorage.setItem('nexusclaw_direct', JSON.stringify(directMsgs.slice(-100)));
  }, [directMsgs]);

  const poll = useCallback(async () => {
    try {
      const [mRes, sRes] = await Promise.all([
        fetch('/api/openclaw/messages', { signal: AbortSignal.timeout(2000) }),
        fetch('/api/openclaw/status',   { signal: AbortSignal.timeout(2000) }),
      ]);
      // #region agent log
      debugLog('pre-fix','H4','NexusClaw.tsx:poll','OpenClaw poll response statuses',{ messagesOk: mRes.ok, messagesStatus: mRes.status, statusOk: sRes.ok, statusStatus: sRes.status });
      // #endregion
      if (mRes.ok) { const d = await mRes.json(); setClawMsgs(d.messages || []); }
      if (sRes.ok) { const d = await sRes.json(); setClawStatus(d); }

      // success -> reset failures
      pollFailuresRef.current = 0;
      setPollFailures(0);
    } catch (e: any) {
      // #region agent log
      debugLog('pre-fix','H4','NexusClaw.tsx:poll:catch','OpenClaw poll threw error',{ error: e?.message || 'unknown' });
      // #endregion
      pollFailuresRef.current = (pollFailuresRef.current || 0) + 1;
      setPollFailures(pollFailuresRef.current);
      if (pollFailuresRef.current >= 3) setClawStatus({ connected: false, host: clawStatus.host, port: clawStatus.port, messageCount: 0 });
    }
  }, [clawStatus.host, clawStatus.port]);

  useEffect(() => {
    // #region agent log
    debugLog('pre-fix','H5','NexusClaw.tsx:tab-change','NexusClaw tab changed',{
      mainTab,
    });
    // #endregion
  }, [mainTab]);

  useEffect(() => {
    const onErr = (e: ErrorEvent) => {
      // #region agent log
      debugLog('pre-fix','H9','NexusClaw.tsx:window-error','Renderer window error observed',{
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
      });
      // #endregion
    };
    const onRej = (e: PromiseRejectionEvent) => {
      const reason = (e.reason && typeof e.reason === 'object') ? (e.reason.message || String(e.reason)) : String(e.reason);
      // #region agent log
      debugLog('pre-fix','H9','NexusClaw.tsx:unhandledrejection','Renderer unhandled rejection observed',{
        reason,
      });
      // #endregion
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);

  useEffect(() => {
    // adaptive polling loop using timeout/backoff
    let mounted = true;
    const loop = async () => {
      if (!mounted) return;
      await poll();
      if (!mounted) return;
      const failures = pollFailuresRef.current || 0;
      const interval = failures === 0 ? 1500 : Math.min(1500 * Math.pow(2, Math.min(failures, 5)), 30000);
      pollRef.current = setTimeout(loop, interval) as any;
    };
    loop();
    return () => { mounted = false; if (pollRef.current) clearTimeout(pollRef.current); };
  }, [poll]);

  // Unload Ollama model from VRAM before OpenClaw fires 
  const unloadModel = async (ollamaModelId: string) => {
    setUnloading(true);
    try {
      await fetch('/api/ollama/unload', {
        method: 'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ model: ollamaModelId }),
      });
      setLoadedModels(p => p.filter(m => !m.includes(ollamaModelId.split(':')[0])));
    } catch {}
    setUnloading(false);
  };

  // OpenClaw send reads reply DIRECTLY from CLI response 
  // Server shells out: openclaw agent -m "text" --local
  // This BLOCKS until openclaw returns the full reply as stdout.
  // We read d.reply from the response immediately no polling needed.
  // VRAM guard: unload any loaded Ollama model first so OpenClaw's Qwen model
  // doesn't compete for VRAM with a locally-loaded Gemma/Direct Chat model.
  const sendClaw = async () => {
    const text = clawInput.trim();
    if (!text || clawSending) return;
    setClawMsgs(p => [...p, { ts:Date.now(), role:'user', text }]);
    setClawInput('');
    setClawSending(true);

    // VRAM guard: evict any locally-loaded model before OpenClaw loads its model
    if (loadedModels.length > 0) {
      setClawMsgs(p => [...p, { ts:Date.now(), role:'system', text:`⚡ Freeing VRAM (${loadedModels.map(m=>m.split(':')[0]).join(', ')})...` }]);
      for (const m of loadedModels) {
        await unloadModel(m);
      }
      await new Promise(r => setTimeout(r, 600));
    }

    try {
      const res = await fetch('/api/openclaw/chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ text }),
      });
      const d = await res.json();

      if (d.reply) {
        // Reply came back directly from CLI stdout
        setClawMsgs(p => [...p, { ts:Date.now(), role:'assistant', text: d.reply }]);
      } else if (!d.ok) {
        setClawMsgs(p => [...p, { ts:Date.now(), role:'system',
          text: `⚠ ${d.hint || d.error || 'No response -- is the OpenClaw gateway running?'}` }]);
      }
      // Refresh server message store in background
      poll();
    } catch (e: any) {
      setClawMsgs(p => [...p, { ts:Date.now(), role:'system', text:'⚠ '+e.message }]);
    }
    setClawSending(false);
  };

  // Direct Ollama send 
  const sendDirect = async () => {
    const text = directInput.trim();
    if (!text || directSending) return;
    setDirectMsgs(p => [...p, { ts:Date.now(), role:'user', text, agent:'direct' }]);
    setDirectInput(''); setDirectSending(true);
    try {
      const memCtx = workspaceMem ? `\n\n[OpenClaw Workspace Memory]\n${workspaceMem.slice(0,2000)}` : '';
      const sys = `You are a direct AI assistant in the NexusAI system. You share a workspace with OpenClaw.${memCtx}\n\nBe direct and concise. For complex execution tasks, suggest the user use the OpenClaw tab or AI Collab mode.`;
      const history = directMsgs.slice(-20).map(m => ({ role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.text }));
      history.push({ role:'user', content: text });
      const reply = stripThinkingTags(await getOllamaChatResponse(history, modelForDirect, sys));
      setDirectMsgs(p => [...p, { ts:Date.now(), role:'assistant', text:reply, model:modelForDirect, agent:'direct' }]);
      if ((directMsgs.length + 1) % 10 === 0) writeWorkspaceMemory(`[Direct Chat ${new Date().toLocaleDateString()}] Last topic: ${text.slice(0,80)}`);
    } catch (e: any) {
      setDirectMsgs(p => [...p, { ts:Date.now(), role:'system', text:'⚠ '+e.message, agent:'direct' }]);
    }
    setDirectSending(false);
  };

  // AI-to-AI Collab 
  const runCollab = async () => {
    const task = collabInput.trim();
    if (!task || collabRunning) return;
    collabStop.current = false;
    setCollabRunning(true);
    setCollabMsgs([{ role:'system', text:`🚀 Task: "${task}"`, ts:Date.now() }]);
    const history: string[] = [];
    const memCtx = workspaceMem ? `\nWorkspace memory:\n${workspaceMem.slice(0,1000)}` : '';

    for (let turn = 0; turn < collabTurns; turn++) {
      if (collabStop.current) break;

      // Gemma plans
      const gemmaSys = `You are the AI Planner. Your partner OpenClaw can search the web, write files, run code and use tools.
${memCtx}
Previous turns: ${history.slice(-4).join('\n')}

Rules:
- Send a task to OpenClaw by writing: [TO_OPENCLAW]: your instruction
- When fully done, write: [TASK_COMPLETE]: summary
- Be concise -- one clear instruction per turn
- Turn ${turn+1} of ${collabTurns}`;

      let gemmaReply = '';
      try {
        const prompt = turn === 0 ? `Task: ${task}\n\nWhat should OpenClaw do first?` : `OpenClaw replied: ${history[history.length-1]?.replace('OpenClaw: ','') || ''}\n\nWhat next?`;
        gemmaReply = stripThinkingTags(await getOllamaChatResponse([{ role:'user', content: prompt }], modelForDirect, gemmaSys));
      } catch (e: any) {
        setCollabMsgs(p => [...p, { role:'system', text:`⚠ Gemma error: ${e.message}`, ts:Date.now() }]);
        break;
      }

      setCollabMsgs(p => [...p, { role:'gemma', text:gemmaReply, ts:Date.now() }]);
      history.push(`Gemma: ${gemmaReply}`);

      if (gemmaReply.includes('[TASK_COMPLETE]')) {
        setCollabMsgs(p => [...p, { role:'system', text:'✅ Task complete!', ts:Date.now() }]);
        break;
      }

      if (collabStop.current) break;

      // Extract OpenClaw instruction
      const match = gemmaReply.match(/\[TO_OPENCLAW\]:\s*(.+?)(?:\n|$)/is);
      const instruction = match ? match[1].trim() : gemmaReply.slice(0,300);
      setCollabMsgs(p => [...p, { role:'system', text:`-> Sending to OpenClaw: "${instruction.slice(0,80)}..."`, ts:Date.now() }]);

      // Send to OpenClaw and wait for reply
      let clawReply = '(no response)';
      try {
        const sentAt = Date.now();
        await fetch('/api/openclaw/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: `[PLANNER TURN ${turn+1}]\n${instruction}` }) });
        for (let w = 0; w < 30; w++) {
          if (collabStop.current) break;
          await new Promise(r => setTimeout(r, 1000));
          await poll();
          // Get the response by re-fetching messages
          try {
            const mr = await fetch('/api/openclaw/messages', { signal: AbortSignal.timeout(2000) });
            if (mr.ok) {
              const md = await mr.json();
              const msgs: Msg[] = md.messages || [];
              const newAssist = msgs.filter(m => m.role === 'assistant' && m.ts > sentAt);
              if (newAssist.length > 0) { clawReply = newAssist[newAssist.length-1].text; break; }
            }
          } catch {}
        }
      } catch (e: any) { clawReply = `[error: ${e.message}]`; }

      setCollabMsgs(p => [...p, { role:'openclaw', text:clawReply, ts:Date.now() }]);
      history.push(`OpenClaw: ${clawReply}`);
      await new Promise(r => setTimeout(r, 500));
    }

    if (!collabStop.current) {
      const done = collabMsgs.some(m => m.text.includes('Task complete'));
      if (!done) setCollabMsgs(p => [...p, { role:'system', text:`Max ${collabTurns} turns reached.`, ts:Date.now() }]);
    }
    setCollabRunning(false);
  };

  const stopCollab = () => {
    collabStop.current = true;
    setCollabRunning(false);
    setCollabMsgs(p => [...p, { role:'system', text:'⏹ Stopped.', ts:Date.now() }]);
  };

  // Helpers 
  const switchModel = async (id: string) => {
    setModelDropdown(false); setModelSwitching(true);
    await fetch('/api/openclaw/model', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ model:id }) }).catch(()=>{});
    setSelectedModel(id); setModelSwitching(false);
  };

  const reconnect = async () => {
    setReconnecting(true);
    await fetch('/api/openclaw/reconnect', { method:'POST' }).catch(()=>{});
    setTimeout(() => { poll(); setReconnecting(false); }, 2000);
  };

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text).catch(()=>{});
    setCopied(key); setTimeout(() => setCopied(''), 1500);
  };

  const TABS = [
    { id:'openclaw', label:'🦞 OpenClaw'  },
    { id:'direct',   label:'🧠 Direct Chat'},
    { id:'scan',     label:'📡 Net Scan'  },
    { id:'terminal', label:'⬛ Terminal'   },
    { id:'status',   label:'📊 Status'    },
  ];

  const CLAW_CHIPS  = ['What can you do?','Check memory status','List your skills','Search the web for AI news','List workspace files'];
  const DIRECT_CHIPS= ['Explain OpenClaw to me','Brainstorm ideas with me','What should I build next?','Summarise my project'];
  const COLLAB_CHIPS= [
    'Research latest AI news and save a summary to my workspace',
    'Check my workspace files and organise them by type',
    'Search for the best Ollama models and write a comparison',
    'Look up Python async patterns and write an example file',
  ];

  // Typing indicator 
  const TypingDots = ({ color = 'bg-red-400' }: { color?: string }) => (
    <div className="flex gap-2 px-4 py-3 bg-slate-900 border border-white/5 rounded-2xl w-fit">
      {[0,1,2].map(i => <div key={i} className={cn('w-1.5 h-1.5 rounded-full animate-bounce', color)} style={{ animationDelay:`${i*0.12}s` }}/>)}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-black/30 flex-shrink-0">
        <Shield className="w-4 h-4 text-red-400 flex-shrink-0"/>
        <div>
          <h1 className="text-sm font-bold text-white leading-none">NexusClaw</h1>
          <p className="text-[9px] text-slate-600 mt-0.5">OpenClaw . Direct Ollama . AI Collab</p>
        </div>

        <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold ml-2', clawStatus.connected ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400')}>
          {clawStatus.connected ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>Connected</> : <><WifiOff className="w-3 h-3"/>Offline</>}
        </div>

        {/* VRAM indicator */}
        {loadedModels.length > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[10px] text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"/>
            <span className="font-mono">VRAM: {loadedModels.map(m => m.split(':')[0].split('/').pop()).join(', ')}</span>
            {unloading && <RefreshCw className="w-3 h-3 animate-spin"/>}
          </div>
        )}

        {/* Model picker */}
        <div className="relative ml-auto">
          <button onClick={() => setModelDropdown(p => !p)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-white/10 rounded-xl text-[10px] font-bold text-white hover:border-white/20 transition-all">
            {modelSwitching
              ? <><RefreshCw className="w-3 h-3 animate-spin text-slate-500"/>Switching...</>
              : <>{currentModel?.icon || '🤖'}<span className="max-w-[130px] truncate">{currentModel?.label || selectedModel}</span>
                {!currentModel?.supportsTools && <span className="text-[8px] text-amber-400/70 ml-1">no tools</span>}
                <ChevronDown className="w-3 h-3 text-slate-500"/></>}
          </button>
          {modelDropdown && (
            <div className="absolute right-0 top-full mt-1.5 w-64 bg-[#0d1117] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/5">
                <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold">Model</p>
                <p className="text-[9px] text-amber-400/60 mt-0.5">Models without tools  /  use Direct Chat</p>
              </div>
              <div className="max-h-72 overflow-y-auto">
                <div className="px-3 py-1.5 border-b border-white/5">
                  <p className="text-[9px] text-slate-600 uppercase font-mono">For OpenClaw tab -- tool-capable models</p>
                </div>
                {MODELS.filter(m => m.supportsTools).map(m => (
                  <button key={m.id} onClick={() => switchModel(m.id)}
                    className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[11px] transition-all hover:bg-white/5',
                      selectedModel === m.id ? 'bg-red-500/10 text-red-300' : 'text-slate-400')}>
                    <span>{m.icon}</span>
                    <span className="flex-1 truncate">{m.label}</span>
                    <span className="text-[8px] text-slate-600 flex-shrink-0">{m.vramGb}GB</span>
                    {m.openclaw && <span className="text-[8px] text-emerald-400/70 flex-shrink-0">★ OClaw</span>}
                    {selectedModel === m.id && <Check className="w-3 h-3 text-red-400 flex-shrink-0"/>}
                  </button>
                ))}
                <div className="px-3 py-1.5 border-t border-b border-white/5">
                  <p className="text-[9px] text-slate-600 uppercase font-mono">For Direct Chat tab -- no tools needed</p>
                </div>
                {MODELS.filter(m => !m.supportsTools).map(m => (
                  <button key={m.id} onClick={() => switchModel(m.id)}
                    className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[11px] transition-all hover:bg-white/5',
                      selectedModel === m.id ? 'bg-purple-500/10 text-purple-300' : 'text-slate-400')}>
                    <span>{m.icon}</span>
                    <span className="flex-1 truncate">{m.label}</span>
                    <span className="text-[8px] text-slate-600 flex-shrink-0">{m.vramGb}GB</span>
                    {selectedModel === m.id && <Check className="w-3 h-3 text-purple-400 flex-shrink-0"/>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button onClick={reconnect} disabled={reconnecting} className="p-1.5 bg-white/5 hover:bg-white/8 border border-white/8 rounded-lg text-slate-500 hover:text-white transition-all">
          <RefreshCw className={cn('w-3.5 h-3.5', reconnecting && 'animate-spin')}/>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 bg-black/20 flex-shrink-0">
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => setMainTab(id as any)}
            className={cn('px-4 py-2 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2',
              mainTab === id ? 'text-white border-red-500 bg-white/3' : 'text-slate-600 border-transparent hover:text-slate-300')}>
            {label}
          </button>
        ))}
      </div>

      {/* Poll failure banner (adaptive backoff) */}
      {pollFailures > 0 && (
        <div className="mx-4 mt-3 px-4 py-3 bg-amber-500/6 border border-amber-500/20 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400"/>
          <div className="flex-1">
            <p className="text-[11px] text-amber-300 font-bold">Connection intermittent</p>
            <p className="text-[10px] text-slate-600 mt-0.5">Lost contact with OpenClaw {pollFailures} time{pollFailures>1? 's':''}. Retrying with backoff.</p>
          </div>
          <button onClick={reconnect} className="px-3 py-1.5 bg-amber-500/15 border border-amber-500/25 text-amber-400 rounded-lg text-[10px] font-bold hover:bg-amber-500/25">Retry</button>
        </div>
      )}

      {/* */}
      {/* OPENCLAW TAB */}
      {/* */}
      {mainTab === 'openclaw' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {!clawStatus.connected && (
            <div className="mx-4 mt-3 px-4 py-3 bg-amber-500/8 border border-amber-500/20 rounded-xl flex items-center gap-3 flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0"/>
              <div className="flex-1">
                <p className="text-[11px] text-amber-300 font-bold">OpenClaw gateway offline</p>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  Auto-starts with NexusAI. Or run: <code className="text-slate-400">openclaw gateway</code>
                  {' '}. Gemma models {'->'} use{' '}
                  <button onClick={() => setMainTab('direct')} className="text-purple-400 hover:underline">Direct Chat</button>
                </p>
              </div>
              <button onClick={reconnect} className="px-3 py-1.5 bg-amber-500/15 border border-amber-500/25 text-amber-400 rounded-lg text-[10px] font-bold hover:bg-amber-500/25 transition-all flex-shrink-0">Retry</button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {clawMsgs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-700">
                <Shield className="w-12 h-12 opacity-20"/>
                <p className="text-xs uppercase tracking-widest">OpenClaw Gateway Chat</p>
                <p className="text-[10px] text-center max-w-xs leading-relaxed">Routes through openclaw CLI. Best with Qwen or tool-capable models.</p>
                <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                  {CLAW_CHIPS.map(s => <button key={s} onClick={() => setClawInput(s)} className="px-3 py-2 bg-slate-900/50 border border-white/5 rounded-xl text-[10px] text-left text-slate-600 hover:text-white hover:border-white/10 transition-all">{s}</button>)}
                </div>
              </div>
            )}
            {clawMsgs.map((msg, i) => <MsgBubble key={i} msg={msg} idx={i} agent="claw" onCopy={copyText} copied={copied}/>)}
            {clawSending && <TypingDots color="bg-red-400"/>}
            <div ref={clawEndRef}/>
          </div>
          <div className="flex items-end gap-2 px-4 py-3 border-t border-white/5 bg-black/10 flex-shrink-0">
            <button onClick={() => fetch('/api/openclaw/messages', { method:'DELETE' }).then(() => setClawMsgs([]))} className="p-2 text-slate-700 hover:text-red-400 transition-colors flex-shrink-0 mb-0.5"><Trash2 className="w-4 h-4"/></button>
            <textarea value={clawInput} onChange={e => setClawInput(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendClaw();} }}
              onInput={e => { const t=e.target as HTMLTextAreaElement; t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,128)+'px'; }}
              placeholder={clawStatus.connected ? 'Message OpenClaw...' : 'OpenClaw offline -- messages will queue'}
              rows={1} className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500/40 resize-none max-h-32"/>
            <button onClick={sendClaw} disabled={clawSending||!clawInput.trim()} className="px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-bold transition-all disabled:opacity-40 flex-shrink-0">
              {clawSending ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
            </button>
          </div>
        </div>
      )}

      {/* */}
      {/* DIRECT CHAT TAB (normal + collab mode toggled by button) */}
      {/* */}
      {mainTab === 'direct' && (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Banner + collab toggle */}
          <div className="mx-4 mt-3 px-4 py-2.5 bg-purple-500/8 border border-purple-500/20 rounded-xl flex items-center gap-3 flex-shrink-0">
            <Brain className="w-4 h-4 text-purple-400 flex-shrink-0"/>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-purple-300 font-bold">Direct Ollama . Shared Workspace</p>
              <p className="text-[10px] text-slate-600 mt-0.5 truncate">
                No tools -- works with Gemma. Reads OpenClaw memory. Toggle 🤝 to make the AIs collaborate.
              </p>
            </div>
            <button onClick={() => setCollabMode(p => !p)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all flex-shrink-0',
                collabMode ? 'bg-purple-500/20 border-purple-500/30 text-purple-300' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white')}>
              🤝 AI Collab {collabMode ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* COLLAB MODE */}
          {collabMode && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Config bar */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 flex-shrink-0 bg-black/20">
                <span className="text-[10px] text-slate-600 font-mono">Max turns:</span>
                {[2,4,6,8,10].map(n => (
                  <button key={n} onClick={() => setCollabTurns(n)}
                    className={cn('w-7 h-7 rounded-lg text-[10px] font-bold border transition-all',
                      collabTurns===n ? 'bg-purple-500/20 border-purple-500/30 text-purple-300' : 'bg-white/3 border-white/8 text-slate-600 hover:text-white')}>
                    {n}
                  </button>
                ))}
                <span className="text-[10px] text-slate-600 ml-1">🧠 Gemma plans  /  🦞 OpenClaw executes</span>
                {collabRunning && (
                  <button onClick={stopCollab} className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl text-[10px] font-bold hover:bg-red-500/30 transition-all">
                    <X className="w-3 h-3"/>Stop
                  </button>
                )}
              </div>

              {/* Collab messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {collabMsgs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-700">
                    <div className="text-4xl">🧠 {"<->"} 🦞</div>
                    <p className="text-xs uppercase tracking-widest">AI-to-AI Collaboration</p>
                    <p className="text-[10px] text-center max-w-xs leading-relaxed">Gemma plans, OpenClaw executes. They loop until the task is done.</p>
                    <div className="space-y-2 w-full max-w-sm">
                      {COLLAB_CHIPS.map(s => (
                        <button key={s} onClick={() => setCollabInput(s)} className="w-full px-3 py-2 bg-slate-900/50 border border-white/5 rounded-xl text-[10px] text-left text-slate-600 hover:text-white hover:border-white/10 transition-all">{s}</button>
                      ))}
                    </div>
                  </div>
                )}
                {collabMsgs.map((msg, i) => {
                  if (msg.role === 'system') return (
                    <div key={i} className="mx-auto px-3 py-1.5 bg-slate-900/60 border border-white/5 rounded-xl text-[10px] text-slate-500 italic w-fit">{msg.text}</div>
                  );
                  const isGemma = msg.role === 'gemma';
                  return (
                    <div key={i} className={cn('flex', isGemma ? 'justify-end' : 'justify-start')}>
                      <div className="max-w-2xl">
                        <div className="flex items-center gap-1.5 mb-1 ml-1">
                          <span className="text-base">{isGemma ? '🧠' : '🦞'}</span>
                          <span className={cn('text-[9px] uppercase tracking-widest font-bold', isGemma ? 'text-purple-400' : 'text-red-400')}>
                            {isGemma ? (currentModel?.label?.split(' ')[0] || 'Gemma') : 'OpenClaw'}
                          </span>
                          <span className="text-[8px] text-slate-700">{new Date(msg.ts).toLocaleTimeString()}</span>
                        </div>
                        <div className={cn('px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words', isGemma ? 'bg-purple-900/40 text-purple-100 border border-purple-500/20' : 'bg-red-900/30 text-red-100 border border-red-500/20')}>
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {collabRunning && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-600">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400"/>
                    <span className="text-purple-400/70">AIs collaborating...</span>
                  </div>
                )}
                <div ref={collabEndRef}/>
              </div>

              {/* Collab input */}
              <div className="flex items-end gap-2 px-4 py-3 border-t border-white/5 bg-black/10 flex-shrink-0">
                <button onClick={() => setCollabMsgs([])} className="p-2 text-slate-700 hover:text-red-400 transition-colors flex-shrink-0 mb-0.5"><Trash2 className="w-4 h-4"/></button>
                <textarea value={collabInput} onChange={e => setCollabInput(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!collabRunning)runCollab();} }}
                  onInput={e => { const t=e.target as HTMLTextAreaElement; t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,128)+'px'; }}
                  placeholder="Give the AIs a task... Gemma plans, OpenClaw executes"
                  rows={1} disabled={collabRunning}
                  className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/40 resize-none max-h-32 disabled:opacity-50"/>
                <button onClick={collabRunning ? stopCollab : runCollab} disabled={!collabInput.trim() && !collabRunning} className={cn('px-4 py-3 text-white rounded-2xl font-bold transition-all disabled:opacity-40 flex-shrink-0', collabRunning ? 'bg-red-600 hover:bg-red-500' : 'bg-purple-600 hover:bg-purple-500')}>
                  {collabRunning ? <X className="w-4 h-4"/> : <Zap className="w-4 h-4"/>}
                </button>
              </div>
            </div>
          )}

          {/* NORMAL DIRECT CHAT */}
          {!collabMode && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {directMsgs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-700">
                    <Brain className="w-12 h-12 opacity-20"/>
                    <p className="text-xs uppercase tracking-widest">Direct Chat</p>
                    <p className="text-[10px] text-center max-w-xs leading-relaxed">
                      {currentModel?.label} . No tools . Reads OpenClaw workspace memory
                    </p>
                    <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                      {DIRECT_CHIPS.map(s => <button key={s} onClick={() => setDirectInput(s)} className="px-3 py-2 bg-slate-900/50 border border-white/5 rounded-xl text-[10px] text-left text-slate-600 hover:text-white hover:border-white/10 transition-all">{s}</button>)}
                    </div>
                  </div>
                )}
                {directMsgs.map((msg, i) => <MsgBubble key={i} msg={msg} idx={1000+i} agent="direct" onCopy={copyText} copied={copied}/>)}
                {directSending && <TypingDots color="bg-purple-400"/>}
                <div ref={directEndRef}/>
              </div>
              <div className="flex items-end gap-2 px-4 py-3 border-t border-white/5 bg-black/10 flex-shrink-0">
                <button onClick={() => setDirectMsgs([])} className="p-2 text-slate-700 hover:text-red-400 transition-colors flex-shrink-0 mb-0.5"><Trash2 className="w-4 h-4"/></button>
                <textarea value={directInput} onChange={e => setDirectInput(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendDirect();} }}
                  onInput={e => { const t=e.target as HTMLTextAreaElement; t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,128)+'px'; }}
                  placeholder={`Message ${currentModel?.label || 'Ollama'}...`}
                  rows={1} className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/40 resize-none max-h-32"/>
                <button onClick={sendDirect} disabled={directSending||!directInput.trim()} className="px-4 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-bold transition-all disabled:opacity-40 flex-shrink-0">
                  {directSending ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Send className="w-4 h-4"/>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SCAN / TERMINAL */}
      {mainTab === 'scan'     && <ScanTab/>}
      {mainTab === 'terminal' && <TerminalTab/>}

      {/* STATUS TAB */}
      {mainTab === 'status' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 space-y-3">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">OpenClaw Gateway</h3>
              {[['Host',clawStatus.host],['Port',clawStatus.port],['Status',clawStatus.connected?'Connected':'Offline'],['Messages',String(clawStatus.messageCount)]].map(([l,v]) => (
                <div key={l} className="flex justify-between text-[11px]">
                  <span className="text-slate-600">{l}</span>
                  <span className={cn('font-mono', l==='Status'&&!clawStatus.connected?'text-red-400':'text-slate-300')}>{v}</span>
                </div>
              ))}
              <button onClick={reconnect} disabled={reconnecting} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-[11px] font-bold transition-all">
                {reconnecting ? 'Reconnecting...' : 'Reconnect'}
              </button>
            </div>
            <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 space-y-3">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Model</h3>
              <div className="p-3 bg-red-500/8 border border-red-500/15 rounded-xl text-center">
                <p className="text-3xl">{currentModel?.icon||'🤖'}</p>
                <p className="text-[11px] font-bold text-white mt-1">{currentModel?.label||selectedModel}</p>
                <p className={cn('text-[9px] mt-1', currentModel?.supportsTools?'text-emerald-400':'text-amber-400')}>
                  {currentModel?.supportsTools ? 'OK Supports tools -> use OpenClaw tab' : '⚠ No tools -> use Direct Chat tab'}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 space-y-3">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Workspace Memory</h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Direct Chat reads <code className="text-slate-400">~/.openclaw/workspace/MEMORY.md</code> + today's daily notes.
              Summaries are written back every 10 messages so both AIs stay in sync.
            </p>
            {workspaceMem
              ? <pre className="text-[10px] text-slate-500 font-mono bg-black/30 rounded-xl p-3 max-h-32 overflow-y-auto">{workspaceMem.slice(0,400)}{workspaceMem.length>400?'...':''}</pre>
              : <p className="text-[10px] text-slate-700 italic">No memory loaded -- connect OpenClaw gateway first</p>}
            <button onClick={() => readWorkspaceMemory().then(m => setWorkspaceMem(m))} className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/8 border border-white/8 rounded-xl text-[10px] text-slate-400 hover:text-white transition-all">
              <RefreshCw className="w-3 h-3"/>Refresh memory
            </button>
          </div>
          <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-4">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label:'🧠 Memory status', cmd:'openclaw memory status --deep' },
                { label:'📋 List skills',    cmd:'openclaw skill list' },
                { label:'🩺 Run doctor',     cmd:'openclaw doctor' },
                { label:'📜 Recent logs',    cmd:'openclaw logs --tail 30' },
              ].map(a => (
                <button key={a.label} onClick={() => setMainTab('terminal')}
                  className="px-3 py-2.5 bg-white/3 hover:bg-white/6 border border-white/8 rounded-xl text-[10px] text-slate-500 hover:text-white transition-all text-left">
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {modelDropdown && <div className="fixed inset-0 z-40" onClick={() => setModelDropdown(false)}/>}
    </div>
  );
}
