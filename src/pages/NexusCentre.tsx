/**
 * NexusCentre v2 AI command hub with real tools: web search, OSINT, PC agent, memory
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap, Bot, Sparkles, RefreshCw, Search, Terminal, Globe,
  Code, Brain, PenTool, ExternalLink, Eye, Activity, Cpu
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { getGeminiResponse, getGeminiResponseWithHistory, getOllamaChatResponse, GEMINI_TOOLS } from '../services/api';

// Types 
interface Msg { id: string; role: 'user'|'ai'|'tool'|'result'; content: string; spec?: string; tool?: string; ts: number; sources?: string[]; }

// Specialists 
const DEFAULT_SPECS: Record<string,{name:string;emoji:string;color:string;bg:string;system:string}> = {
  general:    { name:'General',  emoji:'⚡', color:'text-indigo-400',  bg:'bg-indigo-500/10',  system:'You are Nexus, a highly capable AI. Be direct, thorough, genuinely useful. Use tools when helpful.' },
  coder:      { name:'Coder',    emoji:'💻', color:'text-emerald-400', bg:'bg-emerald-500/10', system:'Expert software engineer. Write clean production-ready code with explanations.' },
  reasoner:   { name:'Reasoner', emoji:'🧠', color:'text-purple-400',  bg:'bg-purple-500/10',  system:'Rigorous analytical thinker. Break down problems methodically, show all reasoning.' },
  writer:     { name:'Writer',   emoji:'✍️',  color:'text-yellow-400',  bg:'bg-amber-500/10',   system:'Professional writer. Produce engaging well-structured content.' },
  researcher: { name:'Research', emoji:'🔍', color:'text-blue-400',    bg:'bg-blue-500/10',    system:'Thorough researcher. Search web for current info. Provide accurate results with sources.' },
  agent:      { name:'Agent',    emoji:'🤖', color:'text-cyan-400',    bg:'bg-cyan-500/10',    system:'Autonomous agent. Think step by step. Execute commands on PC. Report results clearly.\n\nWhen running PC commands output: <exec>command</exec>\nWhen done output: <done>summary</done>' },
  osint:      { name:'OSINT',    emoji:'🕵️', color:'text-red-400',     bg:'bg-red-500/10',     system:'OSINT analyst. Search web for publicly available info. Provide comprehensive intelligence reports. All public sources. Search for people, usernames, emails -- use web search tools.' },
  tutor:      { name:'Tutor',    emoji:'🎓', color:'text-pink-400',    bg:'bg-pink-500/10',    system:'Patient thorough tutor. Explain with examples, analogies and step-by-step breakdowns.' },
};

// Load editable specialist prompts from localStorage
function getSpecs() {
  try {
    const saved = JSON.parse(localStorage.getItem('nexus_spec_prompts') || '{}');
    const result: typeof DEFAULT_SPECS = {} as any;
    for (const [k, v] of Object.entries(DEFAULT_SPECS)) {
      result[k] = { ...v, system: saved[k] || v.system };
    }
    return result;
  } catch { return DEFAULT_SPECS; }
}
const SPECS = getSpecs();
// Keep SPECS reactive refresh per render handled inline

function detectSpec(text: string): string {
  const t = text.toLowerCase();
  if (/search for|find info|who is|look up|osint|on all platforms|sherlock|accounts on/.test(t)) return 'osint';
  if (/\bcode\b|function|script|python|javascript|debug|import|class|def |npm|pip|fix.*bug|fix.*error/.test(t)) return 'coder';
  if (/why|how does|step by step|prove|logic|math|calculate|analyze|reasoning/.test(t)) return 'reasoner';
  if (/write|essay|email|blog|story|article|draft|summarize|rewrite/.test(t)) return 'writer';
  if (/research|latest|current|news|what happened|find out|facts about/.test(t)) return 'researcher';
  if (/run|execute|install|create file|open|terminal|pc|computer|my machine|check my pc|my system/.test(t)) return 'agent';
  if (/teach|explain like|what is|how to|learn|understand|tutorial/.test(t)) return 'tutor';
  return 'general';
}

// Memory 
const MK = 'nexus_agent_memory';
const getMem = (): Record<string,string> => { try { return JSON.parse(localStorage.getItem(MK)||'{}')||'{}'; } catch { return {}; } };
const setMem = (k:string,v:string) => { const m=getMem(); m[k]=v; localStorage.setItem(MK,JSON.stringify(m)); };
const delMem = (k:string) => { const m=getMem(); delete m[k]; localStorage.setItem(MK,JSON.stringify(m)); };

// PC helpers 
async function pcFetch(path: string, body?: any): Promise<any> {
  const r = await fetch(path, { method: body?'POST':'GET', headers:{'Content-Type':'application/json'}, body: body?JSON.stringify(body):undefined, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
}

async function execOnPc(command: string): Promise<string> {
  const r = await fetch('/api/agent/exec', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({command, timeout:20000}), signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`exec HTTP ${r.status}`);
  const reader = r.body?.getReader();
  if (!reader) return r.text();
  const dec = new TextDecoder();
  let out = '';
  while(true){ const {value,done}=await reader.read(); if(done)break; out+=dec.decode(value,{stream:true}); }
  return out;
}

// OSINT platforms 
const PLATFORMS = [
  {name:'GitHub',   url:(q:string)=>`https://github.com/${q}`},
  {name:'X/Twitter',url:(q:string)=>`https://x.com/${q}`},
  {name:'Instagram',url:(q:string)=>`https://www.instagram.com/${q}`},
  {name:'TikTok',   url:(q:string)=>`https://www.tiktok.com/@${q}`},
  {name:'YouTube',  url:(q:string)=>`https://www.youtube.com/@${q}`},
  {name:'Reddit',   url:(q:string)=>`https://www.reddit.com/user/${q}`},
  {name:'LinkedIn', url:(q:string)=>`https://www.linkedin.com/in/${q}`},
  {name:'Telegram', url:(q:string)=>`https://t.me/${q}`},
  {name:'Steam',    url:(q:string)=>`https://steamcommunity.com/id/${q}`},
  {name:'Twitch',   url:(q:string)=>`https://www.twitch.tv/${q}`},
  {name:'Facebook', url:(q:string)=>`https://www.facebook.com/${q}`},
  {name:'Snapchat', url:(q:string)=>`https://www.snapchat.com/add/${q}`},
  {name:'Pinterest',url:(q:string)=>`https://www.pinterest.com/${q}`},
  {name:'Medium',   url:(q:string)=>`https://medium.com/@${q}`},
  {name:'Dev.to',   url:(q:string)=>`https://dev.to/${q}`},
  {name:'Behance',  url:(q:string)=>`https://www.behance.net/${q}`},
  {name:'Dribbble', url:(q:string)=>`https://dribbble.com/${q}`},
  {name:'Keybase',  url:(q:string)=>`https://keybase.io/${q}`},
  {name:'SoundCloud',url:(q:string)=>`https://soundcloud.com/${q}`},
  {name:'Substack', url:(q:string)=>`https://${q}.substack.com`},
];

const IMPROVE_TARGETS = [
  {value:'public/app.html',label:'📱 Phone App'},{value:'src/pages/Chat.tsx',label:'💬 Chat'},
  {value:'src/components/AISidebar.tsx',label:'🤖 Sidebar'},{value:'src/pages/LifeHub.tsx',label:'🧠 LifeHub'},
  {value:'src/pages/Agents.tsx',label:'👥 Agents'},{value:'src/pages/NexusClaw.tsx',label:'⚔️ Claw'},
  {value:'src/pages/NexusCentre.tsx',label:'⚡ Centre'},{value:'src/pages/NexusOSINT.tsx',label:'🕵️ OSINT'},
  {value:'server.ts',label:'🖥 Server'},
];

export default function NexusCentre() {
  const debugLog = (runId: string, hypothesisId: string, location: string, message: string, data: Record<string, unknown>) => {
    // #region agent log
    fetch('http://127.0.0.1:7260/ingest/5f56a8b4-730a-4b8c-8889-3fdd43644d03',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'037707'},body:JSON.stringify({sessionId:'037707',runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  };
  const [msgs,setMsgs]               = useState<Msg[]>(() => {
    try { return JSON.parse(localStorage.getItem('nexus_centre_msgs') || '[]'); } catch { return []; }
  });
  const [input,setInput]             = useState('');
  const [loading,setLoading]         = useState(false);
  const [model,setModel]             = useState('mdq100/Gemma3-Instruct-Abliterated:12b');
  const [autoRoute,setAutoRoute]     = useState(true);
  const [lockedSpec,setLockedSpec]   = useState('general');
  const [ollamaModels,setOllamaModels] = useState<string[]>([]);
  const [webSearch,setWebSearch]     = useState(false);
  const [codeExec,setCodeExec]       = useState(false);
  const [agentMode,setAgentMode]     = useState(false);
  const [panel,setPanel]             = useState<'chat'|'improve'|'memory'|'status'|'osint'>('chat');
  const [improveTarget,setImproveTarget] = useState(IMPROVE_TARGETS[0].value);
  const [improveInstr,setImproveInstr]   = useState('');
  const [improveLog,setImproveLog]       = useState('');
  const [improving,setImproving]         = useState(false);
  const [memory,setMemState]         = useState<Record<string,string>>(getMem());
  const [memK,setMemK]               = useState('');
  const [memV,setMemV]               = useState('');
  const [pcStatus,setPcStatus]       = useState<any>(null);
  const [pcLoading,setPcLoading]     = useState(false);
  const [osintQ,setOsintQ]           = useState('');
  const [osintRes,setOsintRes]       = useState<any>(null);
  const [osintLoading,setOsintLoading] = useState(false);
  const [editingSpec, setEditingSpec] = React.useState<string|null>(null);
  const [editSpecText, setEditSpecText] = React.useState('');
  React.useEffect(()=>{ if(editingSpec) setEditSpecText(getSpecs()[editingSpec]?.system||''); },[editingSpec]);
  const endRef   = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:'smooth'}); },[msgs]);
  useEffect(()=>{ try { localStorage.setItem('nexus_centre_msgs', JSON.stringify(msgs.slice(-100))); } catch {} },[msgs]);
  useEffect(()=>{
    fetch('/api/models').then(r=>r.json()).then(d=>{ if(d.models?.length) setOllamaModels(d.models); }).catch(()=>{});
  },[]);
  useEffect(()=>{ if(panel==='status') loadStatus(); },[panel]);

  const addMsg = useCallback((m: Omit<Msg,'id'>) => {
    setMsgs(prev=>[...prev,{...m,id:Date.now().toString()+Math.random()}]);
  },[]);

  // Auto-selects tools based on the task no manual toggles needed
  const autoSelectTools = (text: string, sk: string): any[] => {
    const t = text.toLowerCase();
    const tools: any[] = [];
    // Always add web search for: research, OSINT, news, current events, finding people
    const needsSearch = sk === 'researcher' || sk === 'osint' ||
      /latest|current|news|today|this week|search|find|who is|what is|look up|price of|how much|when did|recent|2024|2025|2026/.test(t);
    if (needsSearch) tools.push(GEMINI_TOOLS.googleSearch);
    // Add code execution for: coding tasks, math, data processing
    const needsExec = sk === 'coder' ||
      /run|execute|calculate|compute|test (this|the|my)|does this work|what does.*output|result of/.test(t);
    if (needsExec) tools.push(GEMINI_TOOLS.codeExecution);
    return tools;
  };

  const getAI = async (text:string,sys:string,mdl:string,sk='general'): Promise<{text:string;sources?:string[]}> => {
    const history = msgs.slice(-8).filter(m=>m.role==='user'||m.role==='ai').map(m=>({role:m.role==='user'?'user':'model',content:m.content}));
    if(mdl.startsWith('gemini')){
      // #region agent log
      debugLog('pre-fix', 'H6', 'NexusCentre.tsx:getAI:gemini', 'Centre using gemini branch', {
        model: mdl,
        specialist: sk,
      });
      // #endregion
      const tools = autoSelectTools(text, sk);
      return await getGeminiResponseWithHistory(text, sys, mdl, tools, history);
    }
    // #region agent log
    debugLog('pre-fix', 'H6', 'NexusCentre.tsx:getAI:ollama', 'Centre using local ollama branch', {
      model: mdl,
      specialist: sk,
    });
    // #endregion
    const msgs2 = [...history.map((h:any)=>({role:h.role==='model'?'assistant':'user' as const,content:h.content})),{role:'user' as const,content:text}];
    const reply = await getOllamaChatResponse(msgs2,mdl,sys);
    return {text:reply};
  };

  const runAgent = async (task:string,sys:string,mdl:string) => {
    const agSys = sys+'\n\nYou have PC access. To run a command output: <exec>command</exec>\nWhen finished output: <done>summary</done>';
    let ctx = 'Task: '+task;
    for(let i=0;i<12;i++){
      addMsg({role:'tool',tool:'step'+(i+1),content:'Thinking...',ts:Date.now()});
      const {text} = await getAI(ctx,agSys,mdl);
      const execM  = text.match(/<exec>([\s\S]*?)<\/exec>/);
      const doneM  = text.match(/<done>([\s\S]*?)<\/done>/);
      const think  = text.replace(/<exec>[\s\S]*?<\/exec>/g,'').replace(/<done>[\s\S]*?<\/done>/g,'').trim();
      if(think) addMsg({role:'ai',content:think,spec:'Agent',ts:Date.now()});
      if(doneM){ addMsg({role:'result',tool:'✅ Done',content:doneM[1],ts:Date.now()}); break; }
      if(execM){
        const cmd=execM[1].trim();
        addMsg({role:'tool',tool:'exec',content:cmd,ts:Date.now()});
        try{ const out=await execOnPc(cmd); addMsg({role:'result',tool:'output',content:out.slice(0,2000),ts:Date.now()}); ctx=text+'\n\nOutput:\n'+out+'\n\nContinue.'; }
        catch(e:any){ addMsg({role:'result',tool:'error',content:e.message,ts:Date.now()}); ctx='Command failed: '+e.message+'. Try differently.'; }
      } else break;
    }
  };

  const send = async () => {
    const text=input.trim(); if(!text||loading) return;
    setInput(''); setLoading(true);
    addMsg({role:'user',content:text,ts:Date.now()});
    const sk = autoRoute?detectSpec(text):lockedSpec;
    const specs = getSpecs();
    const spec = specs[sk]||specs.general;
    const mems = getMem();
    const memCtx = Object.keys(mems).length?'\n\nKnown facts:\n'+Object.entries(mems).map(([k,v])=>`- ${k}: ${v}`).join('\n'):'';
    const sys = spec.system+memCtx;
    try{
      if(agentMode||sk==='agent'){ await runAgent(text,sys,model); }
      else if(sk==='osint'){ addMsg({role:'tool',tool:'osint',content:'Searching: '+text,ts:Date.now()}); const {text:r,sources}=await getAI('OSINT task: '+text+'\n\nSearch the web extensively. Find social media profiles, digital footprint, contact info, usernames. Report everything found. Be comprehensive.',sys,model,'osint'); addMsg({role:'ai',content:r,spec:'OSINT',sources,ts:Date.now()}); const qm=text.match(/for\s+([\w.-]+)/i)||text.match(/"([^"]+)"/); if(qm?.[1]) addMsg({role:'result',tool:'platforms',content:qm[1],ts:Date.now()}); }
      else{ const {text:r,sources}=await getAI(text,sys,model); addMsg({role:'ai',content:r,spec:spec.name,sources,ts:Date.now()}); }
    }catch(e:any){ addMsg({role:'ai',content:`⚠ ${e.message}`,ts:Date.now()}); }
    setLoading(false);
  };

  const loadStatus = async () => {
    setPcLoading(true);
    try{ const d=await pcFetch('/api/agent/status'); setPcStatus(d); }catch{}
    setPcLoading(false);
  };

  const runImprove = async () => {
    setImproving(true); setImproveLog('📖 Reading...\n');
    try{
      const {content:fc}=await pcFetch('/api/agent/read',{filePath:improveTarget});
      setImproveLog(p=>p+`✅ ${fc.split('\n').length} lines\n🧠 Improving with ${model}...\n`);
      const instr=improveInstr||'Make 2-3 meaningful improvements: fix bugs, improve UX, add useful features.';
      const {text:improved}=await getAI(`Improve NexusAI file.\nFILE: ${improveTarget}\nINSTRUCTION: ${instr}\n\nCONTENT:\n${fc.slice(0,14000)}\n\nReturn COMPLETE improved file. No markdown.`,'Expert software engineer. Return only complete working file content.',model,'coder');
      setImproveLog(p=>p+`✅ ${improved.split('\n').length} lines\n💾 Writing...\n`);
      await pcFetch('/api/agent/write',{filePath:improveTarget,content:improved});
      setImproveLog(p=>p+'✅ Done! Reload to see changes.');
    }catch(e:any){ setImproveLog(p=>p+`❌ ${e.message}`); }
    setImproving(false);
  };

  const runOsint = async () => {
    if(!osintQ.trim()) return;
    setOsintLoading(true); setOsintRes(null);
    try{
      const {text,sources}=await getAI(`OSINT investigation: "${osintQ}"\n\nSearch web and provide:\n1. Social media presence (which platforms likely have this account)\n2. Digital footprint analysis\n3. Key findings\n4. Recommended investigation steps\n\nAll public sources only.`,SPECS.osint.system,model,'osint');
      setOsintRes({text,sources,q:osintQ});
    }catch(e:any){ setOsintRes({text:`⚠ ${e.message}`,sources:[],q:osintQ}); }
    setOsintLoading(false);
  };

  const quickSend = async (p:string,sk:string) => {
    setInput(p); setLoading(true);
    addMsg({role:'user',content:p,ts:Date.now()});
    try{
      const spec=SPECS[sk]||SPECS.general;
      if(sk==='agent'){ await runAgent(p,spec.system,model); }
      else{ const {text,sources}=await getAI(p,spec.system,model); addMsg({role:'ai',content:text,spec:spec.name,sources,ts:Date.now()}); }
    }catch(e:any){ addMsg({role:'ai',content:`⚠ ${e.message}`,ts:Date.now()}); }
    setInput(''); setLoading(false);
  };

  const QUICK = [
    {l:'💻 PC Status',p:'Show my PC specs: CPU, RAM, GPU, disk, and running Ollama models. Run the commands to get real data.',s:'agent'},
    {l:'✨ Self Improve',fn:()=>setPanel('improve')},
    {l:'🔐 Security',p:'Scan my open ports and running processes. Identify any security concerns.',s:'agent'},
    {l:'🦙 Ollama Test',p:'List my Ollama models and test gemma3:12b with a complex reasoning question.',s:'agent'},
    {l:'🕵️ OSINT',fn:()=>setPanel('osint')},
    {l:'🔨 Build API',p:'Create a Python Flask REST API with 3 CRUD endpoints, save to api_server.py',s:'coder'},
  ];

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">
      {/* Left panel */}
      <div className="w-60 flex-shrink-0 border-r border-white/5 flex flex-col bg-black/30 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center"><Zap className="w-4 h-4 text-indigo-400" /></div>
          <span className="font-bold text-white text-sm">The Centre</span>
          <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <div className="flex border-b border-white/5 flex-shrink-0">
          {(['chat','improve','memory','status','osint'] as const).map(p=>(
            <button key={p} onClick={()=>setPanel(p)} className={cn('flex-1 py-2 text-[10px] transition-all',panel===p?'text-indigo-400 border-b-2 border-indigo-500':'text-slate-700 hover:text-slate-500')}>
              {p==='chat'?'💬':p==='improve'?'✨':p==='memory'?'🧠':p==='status'?'📊':'🕵️'}
            </button>
          ))}
        </div>

        {panel==='chat' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
            <div>
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest mb-1.5">Model</p>
              <select value={model} onChange={e=>setModel(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl px-2 py-1.5 text-[11px] text-white focus:outline-none [&>option]:bg-slate-900 [&>optgroup]:bg-slate-900">
                <optgroup label="⭐ Recommended">
                  {ollamaModels.some(m=>m.includes('Gemma3-Instruct-Abliterated')) && <option value={ollamaModels.find(m=>m.includes('Gemma3-Instruct-Abliterated'))||'mdq100/Gemma3-Instruct-Abliterated:12b'}>🔥 Gemma 3 12B Abliterated ⭐</option>}
                  {ollamaModels.some(m=>m.includes('gemma3:12b')||m==='gemma3:12b') && <option value="gemma3:12b">💎 Gemma 3 12B ⭐</option>}
                  {ollamaModels.some(m=>m.includes('gemma3:4b')||m==='gemma3:4b') && <option value="gemma3:4b">💎 Gemma 3 4B</option>}
                  {ollamaModels.some(m=>m.includes('gemma3:27b')||m==='gemma3:27b') && <option value="gemma3:27b">💎 Gemma 3 27B</option>}
                </optgroup>
                {ollamaModels.length>0 && (
                  <optgroup label="🦙 All Ollama Models">
                    {ollamaModels.map(m=><option key={m} value={m}>{m.replace(/^hf\.co\/[^/]+\//,'').replace(/^[^/]+\//,'')}</option>)}
                  </optgroup>
                )}
                <optgroup label="☁ Gemini Cloud">
                  <option value="mdq100/Gemma3-Instruct-Abliterated:12b">Gemini 2.0 Flash</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash (stable)</option>
                  <option value="gemini-2.5-pro-preview-06-05">Gemini 2.5 Pro</option>
                  <option value="gemini-2.5-flash-preview-05-20">Gemini 2.5 Flash</option>
                  <option value="mdq100/Gemma3-Instruct-Abliterated:12b">Gemini 3 Flash</option>
                  <option value="mdq100/Gemma3-Instruct-Abliterated:12b">Gemini 3.1 Pro</option>
                </optgroup>
              </select>
            </div>
            <div>
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest mb-1.5">Tools (Auto)</p>
              <div className="space-y-1 text-[10px] text-slate-600 bg-white/3 rounded-xl p-2.5 border border-white/5">
                <p className="text-slate-400 font-medium">Tools activate automatically:</p>
                <p>🌐 Web search -- for news, research, OSINT, "find X", "latest Y"</p>
                <p>💻 Code exec -- for coding tasks, calculations, tests</p>
                <p>🤖 Agent mode -- for "run", "execute", "check my PC"</p>
                <p className="text-slate-700 pt-1">Uses Gemini when available (Gemini has native tool support)</p>
              </div>
              <button onClick={()=>setAgentMode(!agentMode)} className={cn('w-full flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[11px] mt-2 transition-all',agentMode?'bg-cyan-500/10 border-cyan-500/20 text-cyan-400':'bg-white/3 border-white/5 text-slate-600 hover:text-slate-300')}>
                🤖 Force Agent Mode<span className={cn('ml-auto text-[9px]',agentMode?'text-cyan-400':'text-slate-700')}>{agentMode?'ON':'OFF'}</span>
              </button>
            </div>
            <div>
              <button onClick={()=>setAutoRoute(!autoRoute)} className={cn('w-full flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[11px] transition-all',autoRoute?'bg-indigo-500/10 border-indigo-500/20 text-indigo-400':'bg-white/3 border-white/5 text-slate-500')}>
                <Zap className="w-3 h-3"/>Auto-route<span className={cn('ml-auto text-[9px]',autoRoute?'text-indigo-400':'text-slate-700')}>{autoRoute?'ON':'OFF'}</span>
              </button>
            </div>
            {!autoRoute&&<div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">Specialist</p>
                <button onClick={()=>setEditingSpec(editingSpec?null:lockedSpec)} className="text-[9px] text-indigo-400 hover:text-indigo-300 transition-all">
                  {editingSpec?'OK Done':'✏ Edit Prompt'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(getSpecs()).map(([k,s])=>(
                  <button key={k} onClick={()=>{setLockedSpec(k);setEditingSpec(null);}} className={cn('flex flex-col items-center gap-0.5 py-2 rounded-xl border text-[10px] transition-all',lockedSpec===k?`${s.bg} ${s.color} border-current/30`:'bg-white/3 border-white/5 text-slate-600 hover:text-slate-300')}>
                    <span>{s.emoji}</span><span className="font-semibold">{s.name}</span>
                  </button>
                ))}
              </div>
              {editingSpec && (
                <div className="mt-2">
                  <p className="text-[9px] text-slate-500 mb-1">System prompt for {getSpecs()[editingSpec]?.emoji} {getSpecs()[editingSpec]?.name}:</p>
                  <textarea
                    value={editSpecText}
                    onChange={e=>setEditSpecText(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl px-2.5 py-2 text-[10px] text-slate-300 resize-none h-24 focus:outline-none focus:border-indigo-500/50"
                    placeholder="Custom system prompt..."
                  />
                  <div className="flex gap-1.5 mt-1.5">
                    <button onClick={()=>{ try { const saved = JSON.parse(localStorage.getItem('nexus_spec_prompts')||'{}'); saved[editingSpec] = editSpecText; localStorage.setItem('nexus_spec_prompts', JSON.stringify(saved)); } catch {} setEditingSpec(null); }} className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[10px] text-white font-bold transition-all">Save</button>
                    <button onClick={()=>{ try { const saved = JSON.parse(localStorage.getItem('nexus_spec_prompts')||'{}'); delete saved[editingSpec]; localStorage.setItem('nexus_spec_prompts', JSON.stringify(saved)); setEditSpecText(DEFAULT_SPECS[editingSpec]?.system || ''); } catch {} }} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] text-slate-400 hover:text-red-400 transition-all">Reset</button>
                  </div>
                </div>
              )}
            </div>}
            <div>
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest mb-1.5">Quick</p>
              {QUICK.map(q=><button key={q.l} onClick={()=>(q as any).fn?(q as any).fn():quickSend((q as any).p,(q as any).s)} className="w-full text-left px-2.5 py-2 rounded-xl bg-white/3 hover:bg-white/5 border border-white/5 text-[11px] text-slate-500 hover:text-white transition-all mb-1">{q.l}</button>)}
            </div>
          </div>
        )}

        {panel==='improve'&&<div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
          <p className="text-[10px] font-bold text-white">✨ Self-Improve</p>
          <select value={improveTarget} onChange={e=>setImproveTarget(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl px-2.5 py-2 text-[11px] text-white focus:outline-none">
            {IMPROVE_TARGETS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <textarea value={improveInstr} onChange={e=>setImproveInstr(e.target.value)} placeholder="Instruction (blank = AI decides)" className="w-full bg-slate-900 border border-white/10 rounded-xl px-2.5 py-2 text-[11px] text-white focus:outline-none resize-none h-20"/>
          <button onClick={runImprove} disabled={improving} className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {improving?<><RefreshCw className="w-3 h-3 animate-spin"/>Working...</>:<><Sparkles className="w-3 h-3"/>Improve</>}
          </button>
          {improveLog&&<div className="bg-black/40 border border-white/5 rounded-xl p-2 text-[10px] font-mono whitespace-pre-wrap text-slate-400 max-h-48 overflow-y-auto">{improveLog}</div>}
        </div>}

        {panel==='memory'&&<div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
          <p className="text-[10px] font-bold text-white">🧠 Memory</p>
          <div className="flex gap-1.5">
            <input value={memK} onChange={e=>setMemK(e.target.value)} placeholder="Key" className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none"/>
            <input value={memV} onChange={e=>setMemV(e.target.value)} placeholder="Value" className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none"/>
            <button onClick={()=>{if(memK&&memV){setMem(memK,memV);setMemState(getMem());setMemK('');setMemV('');}}} className="px-2 py-1.5 bg-indigo-600 text-white rounded-lg text-[11px]">+</button>
          </div>
          {Object.keys(memory).length===0?<p className="text-[10px] text-slate-700 italic text-center py-4">No memories yet</p>:Object.entries(memory).map(([k,v])=>(
            <div key={k} className="flex items-start gap-1.5 py-1 border-b border-white/5">
              <div className="flex-1 min-w-0"><p className="text-[10px] font-semibold text-indigo-400 truncate">{k}</p><p className="text-[10px] text-slate-500 truncate">{v}</p></div>
              <button onClick={()=>{delMem(k);setMemState(getMem());}} className="text-slate-700 hover:text-red-400 text-sm">x</button>
            </div>
          ))}
        </div>}

        {panel==='status'&&<div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
          <div className="flex items-center justify-between"><p className="text-[10px] font-bold text-white">📊 PC Status</p><button onClick={loadStatus}><RefreshCw className={cn('w-3 h-3 text-slate-600',pcLoading&&'animate-spin')}/></button></div>
          {pcStatus?<>
            {[['CPU',`${pcStatus.cpus} cores`],['RAM',`${pcStatus.freeMemGb}/${pcStatus.totalMemGb} GB`],['GPU',(pcStatus.gpu||'?').replace(/Name=/gi,'').trim().slice(0,28)],['OS',pcStatus.platform],['Node',pcStatus.nodeVersion]].map(([k,v])=>(
              <div key={k} className="flex justify-between text-[11px] py-1 border-b border-white/5"><span className="text-slate-600 font-mono">{k}</span><span className="text-slate-300 font-mono truncate max-w-[130px]">{v}</span></div>
            ))}
          </>:<p className="text-[10px] text-slate-700 italic text-center py-4">{pcLoading?'Loading...':'Click refresh'}</p>}
        </div>}

        {panel==='osint'&&<div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
          <p className="text-[10px] font-bold text-white">🕵️ OSINT Quick</p>
          <input value={osintQ} onChange={e=>setOsintQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&runOsint()} placeholder="Username, email, IP..." className="w-full bg-slate-900 border border-white/10 rounded-xl px-2.5 py-2 text-[11px] text-white focus:outline-none"/>
          <button onClick={runOsint} disabled={osintLoading} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {osintLoading?<><RefreshCw className="w-3 h-3 animate-spin"/>Searching...</>:<><Search className="w-3 h-3"/>Search</>}
          </button>
          {osintRes&&<div className="text-[10px] text-slate-400 space-y-2"><p className="whitespace-pre-wrap">{osintRes.text.slice(0,600)}</p><div className="grid grid-cols-2 gap-1">{PLATFORMS.slice(0,10).map(p=><a key={p.name} href={p.url(osintRes.q)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-1.5 py-1 bg-white/3 rounded text-[9px] text-slate-500 hover:text-white"><ExternalLink className="w-2 h-2"/>{p.name}</a>)}</div></div>}
        </div>}
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 flex-shrink-0 bg-black/10 flex-wrap">
          {QUICK.map(q=><button key={q.l} onClick={()=>(q as any).fn?(q as any).fn():quickSend((q as any).p,(q as any).s)} className="px-2 py-1 bg-white/5 hover:bg-white/8 border border-white/5 rounded-lg text-[10px] text-slate-400 hover:text-white transition-all whitespace-nowrap">{q.l}</button>)}
          <div className="ml-auto flex items-center gap-1.5">
            {agentMode&&<span className="px-1.5 py-0.5 bg-cyan-500/15 border border-cyan-500/20 text-cyan-400 rounded-full text-[9px] font-bold">🤖 Agent</span>}
            <span className="text-[9px] font-mono text-slate-700 bg-white/5 px-1.5 py-0.5 rounded">{model.split(':')[0]}</span>
            <span className="text-[9px] text-slate-700">Auto-tools</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {msgs.length===0&&(
            <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-700">
              <Zap className="w-10 h-10 opacity-20"/>
              <p className="text-xs uppercase tracking-widest">Ask anything -- {[webSearch&&'web search',codeExec&&'code exec',agentMode&&'agent'].filter(Boolean).join(', ')||'tools ready to enable'}</p>
              <div className="grid grid-cols-2 gap-2 max-w-sm w-full">
                {[{t:'Search for Harrizboy69 on all platforms',s:'osint'},{t:'Write a RAM monitoring Python script',s:'coder'},{t:'Latest AI releases this week?',s:'researcher'},{t:'Check my PC security -- open ports',s:'agent'}].map(q=>(
                  <button key={q.t} onClick={()=>setInput(q.t)} className="p-2.5 bg-slate-900/50 border border-white/5 rounded-xl text-[11px] text-left text-slate-500 hover:text-white hover:border-white/10 transition-all leading-relaxed">{q.t}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map(m=>(
            <div key={m.id} className={cn('flex',m.role==='user'?'justify-end':'justify-start')}>
              {m.role==='tool'&&<div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/5 border border-emerald-500/15 rounded-xl text-[11px] text-emerald-400 font-mono"><Terminal className="w-3 h-3"/><span className="text-slate-500">[{m.tool}]</span><span className="truncate max-w-xs">{m.content}</span></div>}
              {m.role==='result'&&<div className="max-w-3xl bg-black/40 border border-white/5 rounded-xl p-3 font-mono text-[11px] text-emerald-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                <p className="text-[9px] text-slate-600 mb-1">[{m.tool}]</p>
                {m.tool==='platforms'?<div className="grid grid-cols-3 gap-1">{PLATFORMS.map(p=><a key={p.name} href={p.url(m.content)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 bg-white/3 rounded text-[9px] text-slate-400 hover:text-white font-sans transition-all"><ExternalLink className="w-2 h-2"/>{p.name}</a>)}</div>:m.content}
              </div>}
              {(m.role==='user'||m.role==='ai')&&<div className={cn('max-w-3xl px-4 py-3 rounded-2xl text-sm leading-relaxed',m.role==='user'?'bg-indigo-600 text-white rounded-tr-sm':'bg-slate-900 text-slate-200 border border-white/5 rounded-tl-sm')}>
                {m.spec&&m.role==='ai'&&<p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{m.spec}</p>}
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.sources?.length>0&&<div className="mt-2 pt-2 border-t border-white/10">{m.sources.slice(0,3).map((s,i)=><a key={i} href={s} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-indigo-400 hover:underline truncate">{s}</a>)}</div>}
              </div>}
            </div>
          ))}
          {loading&&<div className="flex gap-2 px-4 py-3 bg-slate-900 border border-white/5 rounded-2xl w-fit">{[0,1,2].map(i=><div key={i} className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{animationDelay:`${i*0.12}s`}}/>)}</div>}
          <div ref={endRef}/>
        </div>

        <div className="px-4 py-3 border-t border-white/5 flex-shrink-0 bg-black/10">
          {autoRoute&&input&&<div className="text-[10px] text-slate-600 mb-1.5 px-1">Routing  /  <span className={SPECS[detectSpec(input)]?.color}>{SPECS[detectSpec(input)]?.emoji} {SPECS[detectSpec(input)]?.name}</span></div>}
          <div className="flex gap-2">
            <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} placeholder={`Ask anything -- auto-routes to best AI${webSearch?' . 🌐 Web search ON':''}`} rows={1} className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/40 resize-none max-h-28" onInput={(e)=>{const t=e.target as HTMLTextAreaElement;t.style.height='auto';t.style.height=Math.min(t.scrollHeight,112)+'px';}}/>
            <button onClick={send} disabled={loading||!input.trim()} className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all disabled:opacity-40 flex-shrink-0">
              {loading?<RefreshCw className="w-4 h-4 animate-spin"/>:<Zap className="w-4 h-4"/>}
            </button>
          </div>
          <p className="text-[9px] text-slate-700 mt-1.5 px-1">Enter to send . Shift+Enter for newline</p>
        </div>
      </div>
    </div>
  );
}
