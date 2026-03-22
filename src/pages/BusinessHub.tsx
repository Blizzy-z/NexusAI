import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Phone, Globe, TrendingUp, DollarSign, Bot, Mic, MicOff,
  PhoneOff, PhoneCall, Search, Building2, CheckCircle, Star,
  Loader2, Send, Sparkles, Copy, ChevronRight, Wand2, Mail,
  BarChart3, Users, FileText, MapPin, Clock, AlertCircle,
  ChevronDown, RefreshCw, Download, Edit3, X, ArrowLeft,
  Zap, Shield, Brain, Settings, Radio, MessageSquare, ExternalLink,
  Navigation, Filter, SlidersHorizontal, Flame, TrendingDown,
  CheckSquare, Circle, Hash, Volume2, Globe2, Wifi, Save,
  PlusCircle, Trash2, Eye, Play, Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { getGeminiResponse } from '../services/api';
import { speak } from '../services/elevenlabs';

// Types
interface Lead {
  id: string;
  name: string;
  type: string;
  address: string;
  distance: string;
  phone?: string;
  website?: string;
  rating: number;
  reviews: number;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Hot' | 'Warm' | 'Cold' | 'Contacted' | 'Contracted' | 'Not Interested';
  revenueMin: number;
  revenueMax: number;
  hasWebsite: boolean;
  owner?: string;
  ownerTitle?: string;
  manager?: string;
  salesAngle?: string;
  analysis?: string;
  googleReviews?: { author: string; rating: number; text: string; ago: string }[];
}

// Helpers
const STATUS_COLORS: Record<string, string> = {
  Hot: 'bg-red-500/20 text-red-300 border-red-500/30',
  Warm: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Cold: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Contacted: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Contracted: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Not Interested': 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const PRIORITY_COLORS: Record<string, string> = {
  High: 'bg-red-500/20 text-red-300',
  Medium: 'bg-yellow-500/20 text-yellow-300',
  Low: 'bg-slate-500/20 text-slate-400',
};

const fmt$ = (n: number) => '$' + n.toLocaleString();

// Revenue Calculator
function RevenueCenter() {
  const [clientPrice, setClientPrice] = useState(335);
  const [usage, setUsage] = useState(350);
  const cost = usage * 0.027;
  const profit = clientPrice - cost;
  const margin = clientPrice > 0 ? Math.round((profit / clientPrice) * 100) : 0;
  const [products, setProducts] = useState([
    { id: 'receptionist', label: 'AI Receptionist', icon: '🤖', price: clientPrice, profit: Math.round(profit) },
  ]);

  return (
    <div className="h-full overflow-y-auto p-6 custom-scrollbar space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <BarChart3 className="w-5 h-5 text-emerald-400" />
        <h2 className="text-lg font-bold text-white">Revenue Command Center</h2>
      </div>

      {/* Profit Donut */}
      <div className="bg-slate-900 border border-white/5 rounded-2xl p-6 flex items-center gap-8">
        <div className="relative w-28 h-28 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#1e293b" strokeWidth="12"/>
            <circle cx="50" cy="50" r="40" fill="none" stroke="#10b981" strokeWidth="12"
              strokeDasharray={`${Math.min(margin, 100) * 2.51} 251`} strokeLinecap="round"/>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black text-emerald-400">{margin}%</span>
            <span className="text-[9px] text-slate-500 uppercase">margin</span>
          </div>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Your Monthly Profit</p>
          <p className="text-4xl font-black text-white">{fmt$(Math.round(profit))}<span className="text-lg text-slate-500">/mo</span></p>
          <p className="text-xs text-slate-500 mt-1">from {fmt$(clientPrice)} revenue - {fmt$(Math.round(cost))} costs</p>
        </div>
      </div>

      {/* Product sliders */}
      <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-5">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-3.5 h-3.5 text-purple-400"/>
          <span className="text-xs font-bold text-white uppercase tracking-widest">Products & Revenue</span>
        </div>

        <div className="border border-white/5 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-purple-500/30 flex items-center justify-center text-sm">🤖</div>
            <span className="text-sm font-bold text-white">AI Receptionist</span>
            <span className="ml-auto text-xs text-emerald-400 font-bold">{fmt$(clientPrice)}/mo . +{fmt$(Math.round(profit))} profit</span>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-[10px] text-slate-500 uppercase tracking-widest">Client Price</label>
                <span className="text-[10px] text-white font-bold">{fmt$(clientPrice)}/mo</span>
              </div>
              <input type="range" min={100} max={1000} value={clientPrice} onChange={e=>setClientPrice(+e.target.value)}
                className="w-full accent-purple-500 h-1.5 rounded-full"/>
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-[10px] text-slate-500 uppercase tracking-widest">Est. Monthly Minutes</label>
                <span className="text-[10px] text-white font-bold">{usage} min</span>
              </div>
              <input type="range" min={50} max={2000} value={usage} onChange={e=>setUsage(+e.target.value)}
                className="w-full accent-purple-500 h-1.5 rounded-full"/>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {['Chatbot Studio','Website Builder','SEO Package'].map(p => (
            <button key={p} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] text-slate-400 hover:text-white hover:border-white/20 transition-all">
              <PlusCircle className="w-3 h-3"/>{p}
            </button>
          ))}
        </div>
      </div>

      {/* Scale projections */}
      <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
        <h4 className="text-xs font-bold text-white mb-4 uppercase tracking-widest">Scale Projections</h4>
        <div className="grid grid-cols-4 gap-3">
          {[1,5,10,20].map(clients => (
            <div key={clients} className="bg-black/20 rounded-xl p-3 text-center">
              <p className="text-[10px] text-slate-500">{clients} client{clients>1?'s':''}</p>
              <p className="text-lg font-black text-emerald-400">{fmt$(Math.round(profit * clients))}</p>
              <p className="text-[9px] text-slate-600">/month</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Lead Card
function LeadCard({ lead, onClick, onStatusChange }: { lead: Lead; onClick: () => void; onStatusChange: (id:string,s:Lead['status'])=>void }) {
  const [showStatus, setShowStatus] = useState(false);
  return (
    <div className="bg-slate-900 border border-white/5 hover:border-white/15 rounded-2xl overflow-hidden cursor-pointer transition-all hover:scale-[1.01] group"
      onClick={onClick}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-bold text-white leading-tight">{lead.name}</h3>
          <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0", PRIORITY_COLORS[lead.priority])}>
            ⚡ {lead.priority}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mb-2">
          <div className="flex text-yellow-400">
            {[...Array(5)].map((_,i) => <Star key={i} className={cn("w-3 h-3", i < Math.floor(lead.rating) ? "fill-current" : "opacity-20")}/>)}
          </div>
          <span className="text-[10px] text-slate-400">{lead.rating} . {lead.reviews} reviews</span>
          <span className="text-[10px] text-slate-600 ml-auto flex items-center gap-1"><MapPin className="w-2.5 h-2.5"/>{lead.distance}</span>
        </div>
        <p className="text-[10px] text-slate-500 mb-3 truncate"><MapPin className="w-2.5 h-2.5 inline mr-1"/>{lead.address}</p>
        <div className="flex flex-wrap gap-1 mb-3">
          <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded border", STATUS_COLORS[lead.status])}>{lead.status}</span>
          {lead.hasWebsite === false && <span className="text-[9px] px-2 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/20">No Website</span>}
          <span className="text-[9px] px-2 py-0.5 rounded border bg-white/5 text-slate-400 border-white/10">{lead.type}</span>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5 flex items-center justify-between">
          <span className="text-[9px] text-slate-500 uppercase tracking-widest">Est. Revenue</span>
          <span className="text-xs font-black text-emerald-400">{fmt$(lead.revenueMin)}-{fmt$(lead.revenueMax)}/yr</span>
        </div>
      </div>
      <div className="px-4 pb-3 flex gap-2" onClick={e=>e.stopPropagation()}>
        <button className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] text-slate-400 hover:text-white transition-all flex items-center justify-center gap-1" onClick={onClick}>
          <Eye className="w-3 h-3"/>View
        </button>
        <div className="relative">
          <button className={cn("py-1.5 px-2.5 rounded-lg text-[10px] font-bold border transition-all", STATUS_COLORS[lead.status])}
            onClick={()=>setShowStatus(!showStatus)}>
            {lead.status} <ChevronDown className="w-2.5 h-2.5 inline"/>
          </button>
          {showStatus && (
            <div className="absolute bottom-full mb-1 right-0 bg-slate-800 border border-white/10 rounded-xl overflow-hidden z-20 min-w-[130px]">
              {(Object.keys(STATUS_COLORS) as Lead['status'][]).map(s => (
                <button key={s} className="w-full text-left px-3 py-2 text-[11px] text-slate-300 hover:bg-white/10 transition-all"
                  onClick={()=>{onStatusChange(lead.id,s);setShowStatus(false);}}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// AI Receptionist Config
function ReceptionistConfig({ lead, onBack }: { lead: Lead; onBack: () => void }) {
  const [tab, setTab] = useState<'voice'|'brain'|'golive'|'tools'>('brain');
  const [greeting, setGreeting] = useState(`Hello! Thank you for calling ${lead.name}. How can I sweeten your day?`);
  const [behavior, setBehavior] = useState(`You are an AI receptionist for ${lead.name}, a ${lead.type} located at ${lead.address}. You provide excellent customer service, answer common questions about products, ordering, and store information, and assist in a warm, casual, and helpful manner.`);
  const [voice, setVoice] = useState('Sarah');
  const [bgNoise, setBgNoise] = useState('Café');
  const [noiseLevel, setNoiseLevel] = useState(50);
  const [langs, setLangs] = useState(['English']);
  const [callActive, setCallActive] = useState(false);
  const [callLog, setCallLog] = useState<{role:string,text:string}[]>([]);
  const [callStatus, setCallStatus] = useState('');
  const [callTime, setCallTime] = useState(0);
  const [routeDestinations, setRouteDestinations] = useState([{name:'',phone:''}]);
  const streamRef = useRef<MediaStream|null>(null);
  const activeRef = useRef(false);
  const timerRef = useRef<any>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({behavior:'smooth'}); }, [callLog]);
  useEffect(() => {
    if (callActive) { timerRef.current = setInterval(()=>setCallTime(t=>t+1),1000); }
    else { clearInterval(timerRef.current); setCallTime(0); }
    return ()=>clearInterval(timerRef.current);
  }, [callActive]);

  const fmtT = (s:number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  const addLog = (role:string, text:string) => setCallLog(l=>[...l,{role,text}]);

  const processLoop = (stream: MediaStream) => {
    if (!activeRef.current) return;

    const SpeechRecognitionCls = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCls) {
      setCallStatus('Web Speech API not supported');
      return;
    }

    const rec = new SpeechRecognitionCls();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = false;

    setCallStatus('Listening...');

    rec.onresult = async (e: any) => {
      const text = e.results[0]?.[0]?.transcript?.trim();
      if (!text || !activeRef.current) return;
      if (/^(the|a|\.+)$/i.test(text)) { if (activeRef.current) processLoop(stream); return; }

      addLog('caller', text);
      setCallStatus('Thinking...');
      try {
        const reply = await getGeminiResponse(text, `${behavior}\n\nGreeting was: "${greeting}"\nBe concise, 1-3 sentences max.`, 'mdq100/Gemma3-Instruct-Abliterated:12b') as any;
        const replyText = reply?.text || String(reply);
        addLog('ai', replyText);
        setCallStatus('Speaking...');
        await speak(replyText);
      } catch {}
      if (activeRef.current) processLoop(stream);
    };

    rec.onerror = (e: any) => {
      if (!activeRef.current) return;
      if (e.error === 'no-speech' || e.error === 'aborted') { setTimeout(() => processLoop(stream), 300); return; }
      setCallStatus(`Error: ${e.error}`);
      setTimeout(() => processLoop(stream), 1500);
    };

    rec.onend = () => {
      if (activeRef.current) setTimeout(() => processLoop(stream), 200);
    };

    try { rec.start(); } catch { if (activeRef.current) setTimeout(() => processLoop(stream), 500); }
  };

  const startCall = async () => {
    setCallLog([]);
    setCallActive(true);
    activeRef.current = true;
    setCallStatus('Connecting...');
    // Web Speech API handles mic access internally no getUserMedia needed
    addLog('ai', greeting);
    setCallStatus('Speaking...');
    try { await speak(greeting); } catch {}
    setCallStatus('Listening...');
    processLoop(null as any); // stream param unused with Web Speech API
  };

  const endCall = () => {
    activeRef.current = false;
    streamRef.current?.getTracks().forEach(t=>t.stop());
    streamRef.current = null;
    setCallActive(false);
    setCallStatus('Call ended');
    addLog('system', `── Call ended ${fmtT(callTime)} ──`);
  };

  const TABS = [
    {id:'voice',label:'Voice',icon:Volume2},
    {id:'brain',label:'Brain',icon:Brain},
    {id:'golive',label:'Go Live',icon:Radio},
    {id:'tools',label:'Tools',icon:Settings},
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-white/5 bg-slate-900/30">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-1.5 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white">
            <ArrowLeft className="w-4 h-4"/>
          </button>
          <div>
            <h2 className="text-sm font-bold text-white">Customize AI Receptionist</h2>
            <p className="text-[10px] text-slate-500">Configure every aspect of your AI receptionist</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400">{lead.name}</span>
          </div>
        </div>
        <div className="flex gap-1">
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id as any)}
              className={cn("flex items-center gap-2 px-4 py-2.5 text-xs font-bold transition-all border-b-2",
                tab===t.id ? "border-purple-500 text-purple-300" : "border-transparent text-slate-500 hover:text-white")}>
              <t.icon className="w-3.5 h-3.5"/>{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {tab==='voice' && (
          <div className="space-y-5 max-w-2xl">
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1"><Sparkles className="w-4 h-4 text-purple-400"/><h3 className="text-sm font-bold text-white">Auto-Build from Website</h3></div>
              <div className="flex gap-2">
                <input placeholder="Paste URL to auto-configure voice, greeting, knowledge base, and routing"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50"/>
                <button className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all">Import</button>
              </div>
            </div>

            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2"><Volume2 className="w-4 h-4 text-blue-400"/><h3 className="text-sm font-bold text-white">Select Voice</h3></div>
              {['Sarah','James','Emma','Marcus'].map(v=>(
                <button key={v} onClick={()=>setVoice(v)}
                  className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all",
                    voice===v ? "bg-purple-500/10 border-purple-500/30" : "bg-white/3 border-white/5 hover:border-white/15")}>
                  <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                    voice===v ? "bg-purple-500" : "bg-slate-700")}>
                    {v[0]}
                  </div>
                  <div className="text-left">
                    <p className={cn("text-sm font-bold", voice===v ? "text-purple-200" : "text-white")}>{v}</p>
                    <p className="text-[10px] text-slate-500">{v==='Sarah'||v==='Emma' ? 'Female' : 'Male'} . Warm, professional, versatile</p>
                  </div>
                  {voice===v && <Play className="w-4 h-4 text-purple-400 ml-auto"/>}
                </button>
              ))}
            </div>

            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Settings className="w-4 h-4 text-slate-400"/>Advanced Settings</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-white">Background Noise</p>
                  <p className="text-[10px] text-slate-500">Adds ambient sound to feel more natural</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-5 bg-purple-500 rounded-full relative cursor-pointer">
                    <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full"/>
                  </div>
                  <select value={bgNoise} onChange={e=>setBgNoise(e.target.value)}
                    className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-white [&>option]:bg-slate-800 [&>option]:text-white">
                    {['Café','Office','Restaurant','None'].map(n=><option key={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1.5">
                  <p className="text-xs font-medium text-white">Noise Tolerance</p>
                  <span className="text-[10px] text-slate-400">{noiseLevel}% Normal</span>
                </div>
                <input type="range" min={0} max={100} value={noiseLevel} onChange={e=>setNoiseLevel(+e.target.value)}
                  className="w-full accent-purple-500 h-1.5"/>
              </div>
              <div>
                <p className="text-xs font-medium text-white mb-2">Languages</p>
                <div className="flex flex-wrap gap-2">
                  {['English','French','Spanish','Arabic'].map(l=>(
                    <button key={l} onClick={()=>setLangs(prev=>prev.includes(l)?prev.filter(x=>x!==l):[...prev,l])}
                      className={cn("px-3 py-1 rounded-full text-[11px] border transition-all",
                        langs.includes(l) ? "bg-purple-500/20 border-purple-500/30 text-purple-300" : "bg-white/5 border-white/10 text-slate-400 hover:text-white")}>
                      {l} {langs.includes(l) && 'x'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab==='brain' && (
          <div className="space-y-5 max-w-2xl">
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-purple-400"/><h3 className="text-sm font-bold text-white">AI Greeting</h3></div>
              <textarea value={greeting} onChange={e=>setGreeting(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white h-20 resize-none focus:outline-none focus:border-purple-500/50"/>
            </div>
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2"><Brain className="w-4 h-4 text-blue-400"/><h3 className="text-sm font-bold text-white">Behavior</h3></div>
              <textarea value={behavior} onChange={e=>setBehavior(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white h-32 resize-none focus:outline-none focus:border-blue-500/50"/>
              <button className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2">
                <Save className="w-3.5 h-3.5"/>Save Changes
              </button>
            </div>
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-400"/><h3 className="text-sm font-bold text-white">Knowledge Base</h3></div>
                <span className="text-[10px] text-slate-500">Voice search enabled</span>
              </div>
              <button className="w-full border-2 border-dashed border-white/10 rounded-xl p-4 text-xs text-slate-500 hover:border-white/20 hover:text-slate-300 transition-all text-center">
                + Import from Website URL . Upload PDF . Paste Text
              </button>
            </div>
          </div>
        )}

        {tab==='golive' && (
          <div className="space-y-5 max-w-2xl">
            <div className="bg-slate-900 border border-white/5 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
                <Radio className="w-4 h-4 text-purple-400"/>
                <span className="text-sm font-bold text-white">Test your AI receptionist with voice or chat</span>
              </div>
              <div className="flex border-b border-white/5">
                <div className="px-5 py-2.5 text-xs font-bold text-white border-b-2 border-purple-500">Voice Test</div>
                <div className="px-5 py-2.5 text-xs text-slate-500">Chat Test</div>
              </div>

              {/* Call interface */}
              <div className="p-6">
                <div className="flex items-center justify-center gap-12 mb-6">
                  <div className="flex flex-col items-center gap-2">
                    <div className={cn("w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all",
                      callActive && callStatus.includes('Transcrib') ? "border-blue-500 bg-blue-500/20 scale-110" : "border-slate-700 bg-slate-800")}>
                      <Users className="w-6 h-6 text-slate-400"/>
                    </div>
                    <span className="text-[10px] text-slate-500">You</span>
                  </div>
                  <div className="flex gap-1">
                    {[...Array(4)].map((_,i)=>(
                      <div key={i} className={cn("w-1 rounded-full transition-all",
                        callActive && callStatus.includes('Speaking') ? "bg-purple-400 animate-bounce" : "bg-slate-700")}
                        style={{height: callActive && callStatus.includes('Speaking') ? `${12+i*6}px` : '8px', animationDelay: `${i*100}ms`}}/>
                    ))}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className={cn("w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all",
                      callActive && callStatus.includes('Speak') ? "border-purple-500 bg-purple-500/30 scale-110 animate-pulse" : "border-slate-700 bg-slate-800")}>
                      <Bot className="w-6 h-6 text-purple-400"/>
                    </div>
                    <span className="text-[10px] text-slate-500">{callStatus.includes('Speak') ? 'Speaking...' : 'AI'}</span>
                  </div>
                </div>

                {/* Transcript */}
                <div className="bg-black/20 rounded-xl p-4 min-h-24 max-h-48 overflow-y-auto space-y-2 mb-4 custom-scrollbar">
                  {callLog.length===0 && <p className="text-[11px] text-slate-600 italic text-center">Start the call to see transcript here</p>}
                  {callLog.map((m,i)=>(
                    <motion.div key={i} initial={{opacity:0,y:5}} animate={{opacity:1,y:0}}
                      className={cn("text-xs px-3 py-2 rounded-xl max-w-[85%]",
                        m.role==='ai' ? "bg-purple-500/20 text-purple-100" : m.role==='caller' ? "ml-auto bg-white/10 text-white" : "mx-auto text-slate-500 text-[10px] italic")}>
                      {m.text}
                    </motion.div>
                  ))}
                  <div ref={logEndRef}/>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {callActive && <>
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs"><div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>Live</div>
                      <span className="text-sm font-mono text-white">{fmtT(callTime)}</span>
                    </>}
                    <span className="text-xs text-slate-500">{callStatus}</span>
                  </div>
                  {!callActive ? (
                    <button onClick={startCall} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-all">
                      <PhoneCall className="w-4 h-4"/>Start Call
                    </button>
                  ) : (
                    <button onClick={endCall} className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm transition-all">
                      <PhoneOff className="w-4 h-4"/>End Call
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab==='tools' && (
          <div className="space-y-5 max-w-2xl">
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2"><Settings className="w-4 h-4 text-purple-400"/>AI Tools & Abilities</h3>
              <p className="text-[10px] text-slate-500 mb-4">Configure optional features for your AI receptionist</p>
              <div className="flex gap-2 mb-5 border-b border-white/5 pb-4">
                {['Routing','SMS','Email','Outbound','Live Transfer'].map(t=>(
                  <button key={t} className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all">
                    {t}
                  </button>
                ))}
              </div>
              <div>
                <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-2"><ChevronRight className="w-3.5 h-3.5 text-purple-400"/>Call Routing & Transfer Destinations</h4>
                <p className="text-[10px] text-slate-500 mb-3">Configure where the AI can transfer calls and when to route them</p>
                {routeDestinations.map((dest,i)=>(
                  <div key={i} className="grid grid-cols-2 gap-2 mb-2">
                    <input placeholder="e.g., Sales, Support" value={dest.name} onChange={e=>{const d=[...routeDestinations];d[i].name=e.target.value;setRouteDestinations(d);}}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50"/>
                    <input placeholder="+1 (555) 123-4567" value={dest.phone} onChange={e=>{const d=[...routeDestinations];d[i].phone=e.target.value;setRouteDestinations(d);}}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50"/>
                  </div>
                ))}
                <button onClick={()=>setRouteDestinations([...routeDestinations,{name:'',phone:''}])}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all">
                  <PlusCircle className="w-3.5 h-3.5"/>Add Destination
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Proposal Generator
function ProposalView({ lead, onBack }: { lead: Lead; onBack: () => void }) {
  const [proposal, setProposal] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState('');

  useEffect(() => { generateProposal(); }, []);

  const generateProposal = async () => {
    setLoading(true);
    const prompt = `Write a professional sales proposal for selling an AI Receptionist service ($335/mo) to "${lead.name}", a ${lead.type}.

Format it exactly like this (use markdown):
# [Creative Proposal Title About Their Business]
*Prepared by NexusAI*

## Executive Summary
[2-3 sentences about their specific situation and opportunity]

## Current Challenges
- **The [Problem] Dilemma:** [Specific issue]
- **Order/Inquiry Friction:** [How they lose business]
- **Invisible Revenue Leak:** Roughly $[amount] in potential sales lost every time the phone rings unanswered

## Our Solution
[2-3 sentences about the AI receptionist specifically tailored to ${lead.type}]

## ROI Analysis
Your AI suite at $335/mo is projected to deliver a **27x return** on investment by capturing missed opportunities worth an estimated $[amount]/month.

## Next Steps
1. [Specific action 1]
2. [Specific action 2]  
3. Go-Live: Zero setup fees -- start capturing calls by this Friday.

*NexusAI . Powered by AI*`;

    const res = await getGeminiResponse(prompt, 'Write only the proposal, exact format as specified.', 'mdq100/Gemma3-Instruct-Abliterated:12b') as any;
    setProposal(res?.text || String(res));
    setLoading(false);
  };

  const editProposal = async (instruction: string) => {
    setLoading(true);
    const res = await getGeminiResponse(`${instruction}\n\nProposal:\n${proposal}`, 'Rewrite the entire proposal with this change applied. Keep the same structure.', 'mdq100/Gemma3-Instruct-Abliterated:12b') as any;
    setProposal(res?.text || String(res));
    setLoading(false);
    setEditing('');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-6 py-4 border-b border-white/5 bg-slate-900/30 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4"/>
        </button>
        <div>
          <h2 className="text-sm font-bold text-white">Proposal for {lead.name}</h2>
          <p className="text-[10px] text-slate-500">AI Receptionist . $335/mo</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={()=>navigator.clipboard.writeText(proposal)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white hover:bg-white/10 transition-all"><Copy className="w-3.5 h-3.5"/>Copy</button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white hover:bg-white/10 transition-all"><Download className="w-3.5 h-3.5"/>Download</button>
          <button onClick={generateProposal} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white hover:bg-white/10 transition-all"><RefreshCw className="w-3.5 h-3.5"/>Regenerate</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin"/>
            <p className="text-sm text-slate-400">Generating proposal for {lead.name}...</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <div className="bg-slate-900 border border-white/5 rounded-2xl p-8">
              <div className="prose prose-invert prose-sm max-w-none">
                {proposal.split('\n').map((line,i) => {
                  if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-black text-white mb-1">{line.slice(2)}</h1>;
                  if (line.startsWith('## ')) return <h2 key={i} className="text-base font-bold text-purple-300 mt-6 mb-2 flex items-center gap-2"><ChevronRight className="w-4 h-4"/>{line.slice(3)}</h2>;
                  if (line.startsWith('- **')) {
                    const [bold, rest] = line.slice(2).split(':**');
                    return <p key={i} className="text-sm text-slate-300 mb-1.5 flex gap-2"><span className="text-purple-400 font-bold">-</span><span><strong className="text-white">{bold.replace('**','')}:</strong>{rest}</span></p>;
                  }
                  if (line.match(/^\d+\./)) return <p key={i} className="text-sm text-slate-300 mb-1 flex gap-2"><span className="text-purple-400 font-bold">{line[0]}.</span>{line.slice(2)}</p>;
                  if (line.startsWith('*') && line.endsWith('*')) return <p key={i} className="text-[10px] text-slate-600 italic mt-4">{line.replace(/\*/g,'')}</p>;
                  if (line.includes('**27x**') || line.includes('**27x return**')) return <p key={i} className="text-sm text-slate-300 mb-2" dangerouslySetInnerHTML={{__html:line.replace(/\*\*(.*?)\*\*/g,'<strong class="text-emerald-400">$1</strong>')}}/>
                  if (line.includes('**')) return <p key={i} className="text-sm text-slate-300 mb-2" dangerouslySetInnerHTML={{__html:line.replace(/\*\*(.*?)\*\*/g,'<strong class="text-white">$1</strong>')}}/>;
                  return line ? <p key={i} className="text-sm text-slate-300 mb-2">{line}</p> : <div key={i} className="h-2"/>;
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit bar */}
      <div className="flex-shrink-0 border-t border-white/5 px-6 py-3 bg-slate-900/50">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2 mb-2">
            {['Make it shorter','More persuasive','Add urgency','Friendlier','Add discount'].map(action=>(
              <button key={action} onClick={()=>editProposal(action)}
                className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] text-slate-400 hover:text-white hover:border-white/20 transition-all">
                {action}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={editing} onChange={e=>setEditing(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&editing.trim()&&editProposal(editing)}
              placeholder='Edit proposal with AI... e.g. "Make it more urgent"'
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50"/>
            <button onClick={()=>editing.trim()&&editProposal(editing)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white transition-all">
              <Send className="w-4 h-4"/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Lead Detail
function LeadDetail({ lead, onBack, onBuildReceptionist, onProposal, onBuildWebsite }: {
  lead: Lead; onBack: ()=>void;
  onBuildReceptionist: ()=>void; onProposal: ()=>void; onBuildWebsite: ()=>void;
}) {
  const [genEmail, setGenEmail] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const generateEmail = async () => {
    setGenLoading(true); setShowEmail(true);
    const prompt = `Write a short cold outreach email to the owner of "${lead.name}" (a ${lead.type}) offering to build them a professional website for $500-1500. 
Be casual, friendly, mention they currently have no online presence. Under 100 words. Sign off as "Alex from NexusWeb".`;
    const res = await getGeminiResponse(prompt,'Write only the email, no subject line needed.','mdq100/Gemma3-Instruct-Abliterated:12b') as any;
    setGenEmail(res?.text||String(res)); setGenLoading(false);
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="sticky top-0 z-10 px-6 py-3 border-b border-white/5 bg-slate-950/90 backdrop-blur flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 hover:bg-white/5 rounded-lg transition-all text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4"/>
        </button>
        <span className="text-sm font-bold text-white">{lead.name}</span>
        <span className="text-[10px] text-slate-500">{lead.type} . {lead.distance}</span>
        <div className="ml-auto flex gap-2">
          <span className={cn("text-xs font-bold px-3 py-1 rounded-full border", STATUS_COLORS[lead.status])}>{lead.status}</span>
        </div>
      </div>

      <div className="p-6 space-y-5 max-w-3xl">
        {/* Analysis */}
        {lead.analysis && (
          <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
            <p className="text-sm text-slate-300 leading-relaxed">{lead.analysis}</p>
          </div>
        )}

        {/* Decision Makers */}
        <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
          <h3 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Users className="w-3.5 h-3.5"/>Decision Makers
          </h3>
          <div className="space-y-2">
            {lead.owner && (
              <div className="border border-white/10 rounded-xl px-4 py-3">
                <p className="text-sm font-bold text-white">{lead.owner}</p>
                <p className="text-[10px] text-slate-500">{lead.ownerTitle || 'Owner/Operator'}</p>
              </div>
            )}
            {lead.manager && (
              <div className="border border-white/10 rounded-xl px-4 py-3">
                <p className="text-sm font-bold text-white">{lead.manager}</p>
                <p className="text-[10px] text-slate-500">General Manager / Store Manager</p>
              </div>
            )}
          </div>
        </div>

        {/* Sales Angle */}
        {lead.salesAngle && (
          <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
            <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3">Sales Angle</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{lead.salesAngle}</p>
          </div>
        )}

        {/* Google Reviews */}
        {lead.googleReviews && lead.googleReviews.length > 0 && (
          <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
            <h3 className="text-[10px] font-bold text-yellow-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Star className="w-3.5 h-3.5"/>Google Reviews ({lead.rating} ⭐ . {lead.reviews})
            </h3>
            <div className="space-y-3">
              {lead.googleReviews.map((r,i)=>(
                <div key={i} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white">{r.author[0]}</div>
                      <span className="text-xs font-bold text-white">{r.author}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex text-yellow-400">{[...Array(r.rating)].map((_,j)=><Star key={j} className="w-2.5 h-2.5 fill-current"/>)}</div>
                      <span className="text-[10px] text-slate-500">{r.ago}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generated Email */}
        {showEmail && (
          <div className="bg-slate-900 border border-white/5 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2"><Mail className="w-3.5 h-3.5"/>Generated Outreach Email</h3>
              {!genLoading && <button onClick={()=>navigator.clipboard.writeText(genEmail)} className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-white"><Copy className="w-3 h-3"/>Copy</button>}
            </div>
            {genLoading ? <div className="flex items-center gap-2 text-slate-400 text-xs"><Loader2 className="w-4 h-4 animate-spin"/>Writing email...</div>
              : <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{genEmail}</p>}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <button onClick={onBack} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white hover:bg-white/10 transition-all">
            <Save className="w-3.5 h-3.5"/>Save Lead
          </button>
          <button onClick={onProposal} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white hover:bg-white/10 transition-all">
            <FileText className="w-3.5 h-3.5"/>Generate Report
          </button>
          <button onClick={generateEmail} className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white hover:bg-white/10 transition-all">
            <Mail className="w-3.5 h-3.5"/>Generate Email
          </button>
          <button onClick={onBuildWebsite} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs text-white font-bold transition-all">
            <Globe className="w-3.5 h-3.5"/>Build Website
          </button>
          <button onClick={onBuildReceptionist} className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-xs text-white font-bold transition-all">
            <Bot className="w-3.5 h-3.5"/>Build AI Receptionist
          </button>
        </div>
      </div>
    </div>
  );
}

// Lead Generator
function LeadGenerator() {
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState('50 mi');
  const [industry, setIndustry] = useState('Restaurants');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searching, setSearching] = useState(false);
  const [view, setView] = useState<'grid'|'pipeline'>('grid');
  const [selectedLead, setSelectedLead] = useState<Lead|null>(null);
  const [detailView, setDetailView] = useState<'detail'|'receptionist'|'proposal'|'website'>('detail');
  const [websiteCode, setWebsiteCode] = useState('');
  const [websiteLoading, setWebsiteLoading] = useState(false);
  const [stats, setStats] = useState({ revenue: 0, addresses: 0, hot: 0, closeRate: 0, callVol: 0 });
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const searchLeads = async (append = false) => {
    const q = keyword || industry;
    if (!location.trim() || !q.trim()) return;
    setSearching(true);
    if (!append) { setLeads([]); setPage(0); }

    try {
      const prompt = `You are a lead generation AI. Search for real-style ${q} businesses in ${location} within ${radius} that likely have NO professional website (small, family-owned, older businesses).

Generate ${append ? 8 : 12} MORE leads (different from any previous ones). Return ONLY valid JSON array, no markdown.

Each object MUST have ALL these fields:
{
  "id": "unique-string-${Date.now()}-INDEX",
  "name": "Real sounding business name",
  "type": "${q}",
  "address": "Street address in ${location}",
  "distance": "0.X mi",
  "phone": "555-XXX-XXXX",
  "rating": 4.2,
  "reviews": 47,
  "priority": "High",
  "status": "Hot",
  "revenueMin": 4000,
  "revenueMax": 8000,
  "hasWebsite": false,
  "owner": "First Last",
  "ownerTitle": "Owner/Operator",
  "manager": "First Last",
  "analysis": "2-sentence paragraph about why this business is a good lead and what they're missing digitally. Mention their location or type specifically.",
  "salesAngle": "Focus on [specific angle for this type of business]. Since they currently [problem], they are likely losing [specific business outcome]. Pitch to provide [solution] and capture [specific opportunity].",
  "googleReviews": [
    {"author": "Name", "rating": 5, "text": "Detailed realistic review 2-3 sentences", "ago": "2 months ago"},
    {"author": "Name", "rating": 4, "text": "Another realistic review", "ago": "4 months ago"},
    {"author": "Name", "rating": 5, "text": "Another review", "ago": "6 months ago"}
  ]
}

Vary the priorities (60% High, 30% Medium, 10% Low), statuses (40% Hot, 30% Warm, 20% Cold, 10% Contacted), ratings (3.8-4.9), reviews (20-400), revenue ranges realistically.`;

      const res = await getGeminiResponse(prompt, 'Return ONLY a valid JSON array. No markdown fences, no explanation, no text before or after the array. Start with [ and end with ].', 'mdq100/Gemma3-Instruct-Abliterated:12b') as any;
      let text = (res?.text || String(res)).trim();
      // Strip markdown fences
      text = text.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
      // Extract JSON array if buried in text
      const arrStart = text.indexOf('[');
      const arrEnd = text.lastIndexOf(']');
      if (arrStart === -1 || arrEnd === -1) throw new Error('No JSON array found in response');
      text = text.slice(arrStart, arrEnd + 1);
      const parsed: Lead[] = JSON.parse(text);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty response');

      const newLeads = parsed.map((l,i) => ({...l, id: `${Date.now()}-${i}`}));
      const allLeads = append ? [...leads, ...newLeads] : newLeads;
      setLeads(allLeads);
      setHasMore(true);

      const hot = allLeads.filter(l=>l.status==='Hot').length;
      const totalRev = allLeads.reduce((s,l)=>s+l.revenueMin,0);
      setStats({
        revenue: totalRev,
        addresses: allLeads.length * 3,
        hot,
        closeRate: 24.6,
        callVol: allLeads.length * 180,
      });
    } catch(e:any) {
      console.error('Lead gen error:', e);
    }
    setSearching(false);
  };

  const updateLeadStatus = (id: string, s: Lead['status']) => {
    setLeads(ls => ls.map(l => l.id===id ? {...l, status:s} : l));
  };

  const filteredLeads = filterStatus === 'All' ? leads : leads.filter(l => l.status === filterStatus);

  const openDetail = (lead: Lead) => { setSelectedLead(lead); setDetailView('detail'); };

  const buildWebsite = async () => {
    if (!selectedLead) return;
    setDetailView('website');
    setWebsiteLoading(true);
    const prompt = `Create a complete, beautiful single-page HTML website for "${selectedLead.name}", a ${selectedLead.type} in ${selectedLead.address}.
- Modern dark/light design, fully mobile responsive
- Hero with business name, tagline, "Call Now" floating button
- Services section (4-6 realistic services for a ${selectedLead.type})
- About section, Contact section with address and phone
- All CSS inline in <style> tag, Google Fonts OK
- Professional color scheme matching ${selectedLead.type} industry
Return ONLY the complete HTML document.`;
    const res = await getGeminiResponse(prompt,'Return complete HTML only, no explanation.','mdq100/Gemma3-Instruct-Abliterated:12b') as any;
    setWebsiteCode(res?.text||String(res));
    setWebsiteLoading(false);
  };

  if (selectedLead) {
    if (detailView === 'receptionist') return <ReceptionistConfig lead={selectedLead} onBack={()=>setDetailView('detail')}/>;
    if (detailView === 'proposal') return <ProposalView lead={selectedLead} onBack={()=>setDetailView('detail')}/>;
    if (detailView === 'website') return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 px-6 py-3 border-b border-white/5 bg-slate-900/30 flex items-center gap-3">
          <button onClick={()=>setDetailView('detail')} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all"><ArrowLeft className="w-4 h-4"/></button>
          <span className="text-sm font-bold text-white">Website for {selectedLead.name}</span>
          <div className="ml-auto flex gap-2">
            {!websiteLoading && <>
              <button onClick={()=>{const b=new Blob([websiteCode],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`${selectedLead.name.replace(/\s+/g,'-')}.html`;a.click();}}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs text-white font-bold transition-all"><Download className="w-3.5 h-3.5"/>Download</button>
              <button onClick={()=>navigator.clipboard.writeText(websiteCode)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white hover:bg-white/10 transition-all"><Copy className="w-3.5 h-3.5"/>Copy</button>
              <button onClick={buildWebsite} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white hover:bg-white/10 transition-all"><RefreshCw className="w-3.5 h-3.5"/>Regenerate</button>
            </>}
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {websiteLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin"/>
              <p className="text-sm text-slate-400">Building website for {selectedLead.name}...</p>
            </div>
          ) : <iframe srcDoc={websiteCode} className="w-full h-full border-0 bg-white" title="Website Preview" sandbox="allow-scripts"/>}
        </div>
      </div>
    );
    return <LeadDetail lead={selectedLead} onBack={()=>setSelectedLead(null)}
      onBuildReceptionist={()=>setDetailView('receptionist')}
      onProposal={()=>setDetailView('proposal')}
      onBuildWebsite={buildWebsite}/>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="flex-shrink-0 p-4 border-b border-white/5 bg-slate-900/20">
        <div className="flex gap-2 items-center">
          <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-slate-500 flex-shrink-0"/>
            <input value={keyword} onChange={e=>setKeyword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchLeads()}
              placeholder="Keyword, e.g. 'roofing', 'HVAC', 'bakery'..."
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 focus:outline-none min-w-0"/>
            <div className="flex items-center gap-1 text-slate-500 text-xs border-l border-white/10 pl-3 flex-shrink-0">
              <MapPin className="w-3.5 h-3.5"/>
              <input value={location} onChange={e=>setLocation(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchLeads()}
                placeholder="City, e.g. Toronto"
                className="bg-transparent text-sm text-white placeholder-slate-600 focus:outline-none w-28"/>
            </div>
          </div>
          <select value={industry} onChange={e=>setIndustry(e.target.value)}
            className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none [&>option]:bg-slate-900 [&>option]:text-white">
            {['Restaurants','HVAC','Plumbers','Electricians','Hair Salons','Dentists','Auto Repair','Gyms','Bakeries','Law Firms','Real Estate','Contractors','Cleaners','Nail Salons','Florists','Landscaping','Catering','Tutors','Pet Grooming','Accountants'].map(i=>(
              <option key={i}>{i}</option>
            ))}
          </select>
          <select value={radius} onChange={e=>setRadius(e.target.value)}
            className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none w-24 [&>option]:bg-slate-900 [&>option]:text-white">
            {['5 mi','10 mi','25 mi','50 mi','100 mi'].map(r=><option key={r}>{r}</option>)}
          </select>
          <button onClick={()=>searchLeads()} disabled={!location.trim()||(searching&&!leads.length)}
            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2">
            {searching&&!leads.length ? <Loader2 className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4"/>}
            {searching&&!leads.length ? 'Searching...' : 'Find Leads'}
          </button>
        </div>
      </div>

      {leads.length > 0 && (
        <>
          {/* Stats bar */}
          <div className="flex-shrink-0 border-b border-white/5 px-4 py-2 flex items-center gap-4 bg-slate-900/10">
            <span className="text-[10px] text-slate-500">{leads.length} leads near <strong className="text-white">{location}</strong></span>
            <div className="ml-auto flex gap-4">
              {[
                {label:'Expected Rev.',value:fmt$(Math.round(stats.revenue/1000))+'k+',color:'text-emerald-400'},
                {label:'Total Addresses',value:stats.addresses.toString(),color:'text-blue-400'},
                {label:'Hot Leads',value:stats.hot.toString(),color:'text-red-400'},
                {label:'Avg Close Rate',value:stats.closeRate+'%',color:'text-yellow-400'},
                {label:'Total Call Vol.',value:'-'+stats.callVol,color:'text-slate-400'},
              ].map(s=>(
                <div key={s.label} className="text-center">
                  <p className={cn("text-sm font-black", s.color)}>{s.value}</p>
                  <p className="text-[9px] text-slate-600 uppercase">{s.label}</p>
                </div>
              ))}
            </div>
            {/* Status filter */}
            <div className="flex gap-1 border-l border-white/5 pl-4">
              {['All',...Object.keys(STATUS_COLORS)].map(s=>(
                <button key={s} onClick={()=>setFilterStatus(s)}
                  className={cn("px-2 py-1 rounded-lg text-[9px] font-bold transition-all",
                    filterStatus===s ? "bg-white/10 text-white" : "text-slate-600 hover:text-slate-400")}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Lead Grid */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {filteredLeads.map((lead,idx)=>(
                // @ts-ignore
                <LeadCard key={String(lead.id||idx)} lead={lead as Lead} onClick={()=>openDetail(lead as Lead)} onStatusChange={updateLeadStatus}/>
              ))}
            </div>
            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center mt-6">
                <button onClick={()=>searchLeads(true)} disabled={searching}
                  className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white hover:bg-white/10 transition-all disabled:opacity-40">
                  {searching ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>}
                  Load More Leads
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {leads.length === 0 && !searching && (
        <div className="flex-1 flex flex-col items-center justify-center opacity-20">
          <Search className="w-12 h-12 mb-3"/>
          <p className="text-sm font-mono">Enter a location and search to find leads</p>
          <p className="text-xs text-slate-500 mt-1">AI will find local businesses without websites</p>
        </div>
      )}
    </div>
  );
}

// Money Methods
const METHODS = [
  { id:'receptionist', icon:'🤖', color:'from-purple-600 to-pink-600', title:'AI Receptionist Agency', earning:'$2k-$15k/mo',
    desc:'Find businesses, set up AI receptionists, charge monthly retainer. $335/mo per client.',
    steps:['Use Lead Generator to find 10 targets','Generate AI proposal for each','Set up receptionist in 20 min','Charge $335-500/mo recurring'],
    prompt:'Give me a detailed 30-day plan to sign my first 5 AI receptionist clients. Include scripts, pricing, and objection handling.' },
  { id:'websites', icon:'🌐', color:'from-emerald-600 to-teal-600', title:'AI Website Agency', earning:'$500-$3k/project',
    desc:'Use Website Hunter to find businesses with no website. Build with AI in 10 min. Charge $500-$1,500.',
    steps:['Hunt no-website businesses','Build site in 10 min with AI','Charge $500-1500 upfront','Add $50/mo maintenance retainer'],
    prompt:'Write me a 7-day action plan to close my first 3 website clients this week. Include cold outreach scripts and pricing.' },
  { id:'seo', icon:'📈', color:'from-orange-500 to-yellow-500', title:'AI SEO Agency', earning:'$300-$1k/mo per client',
    desc:'Run SEO campaigns for local businesses entirely with AI. Content, backlinks, reporting.',
    steps:['Audit their Google ranking','Generate optimised content','Build local citations','Monthly reports with AI'],
    prompt:'How do I start an AI SEO agency with zero experience? Give me a complete setup guide and my first client pitch.' },
  { id:'content', icon:'✍️', color:'from-blue-500 to-violet-500', title:'AI Content Mill', earning:'$1k-$5k/mo',
    desc:'Monthly content packages for businesses. AI writes everything. You deliver.',
    steps:['Offer 20 posts/mo retainer','AI generates all content','Edit and deliver weekly','Scale to 10+ clients'],
    prompt:'Build me a content agency offer that I can close businesses on. Include packages, pricing and what deliverables look like.' },
  { id:'ads', icon:'🎯', color:'from-red-500 to-orange-500', title:'AI Ads Agency', earning:'$500-$2k/mo per client',
    desc:'Run Google and Meta ads for local businesses. AI writes all copy and analyzes performance.',
    steps:['Charge 10% of ad spend or flat fee','AI writes all ad copy','Weekly AI performance reports','Start with $500 test budgets'],
    prompt:'How do I run a local business ads agency using AI? What tools do I need, how do I price it, and what does the workflow look like?' },
  { id:'nexus', icon:'⚡', color:'from-purple-700 to-pink-700', title:'Your Custom NexusAI Method', earning:'Unlimited 🔥',
    desc:'Tell Nexus your situation -- she builds a personalized money plan just for you based on your skills and budget.',
    steps:['Tell Nexus your skills + budget','She builds your exact plan','Automated outreach setup','Scale with AI doing the work'],
    prompt:'I want to make money online with AI. Ask me 3 questions about my skills, experience, and budget, then give me a custom 30-day plan to my first $1000.' },
];

function MoneyMethods() {
  const [active, setActive] = useState<typeof METHODS[0]|null>(null);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMsgs, setChatMsgs] = useState<{role:string,text:string}[]>([]);
  const [chatting, setChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{ chatEndRef.current?.scrollIntoView({behavior:'smooth'}); },[chatMsgs]);

  const run = async (method: typeof METHODS[0]) => {
    setActive(method); setOutput(''); setLoading(true); setChatMsgs([]);
    const res = await getGeminiResponse(method.prompt,
      'You are Nexus, an expert at making money with AI businesses. Be specific, actionable, conversational. No fluff.',
      'mdq100/Gemma3-Instruct-Abliterated:12b') as any;
    setOutput(res?.text||String(res)); setLoading(false);
  };

  const chat = async () => {
    if (!chatInput.trim()||chatting||!active) return;
    const msg = chatInput.trim(); setChatInput('');
    setChatMsgs(m=>[...m,{role:'user',text:msg}]); setChatting(true);
    const res = await getGeminiResponse(msg,
      `You are Nexus. Context: helping with "${active.title}" business method. Previous plan: ${output.slice(0,600)}`,
      'mdq100/Gemma3-Instruct-Abliterated:12b') as any;
    setChatMsgs(m=>[...m,{role:'ai',text:res?.text||String(res)}]); setChatting(false);
  };

  return (
    <div className="flex h-full p-4 gap-4">
      <div className="w-72 flex-shrink-0 overflow-y-auto custom-scrollbar space-y-2 pr-1">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest px-1 mb-3">Click any method  /  get your AI action plan</p>
        {METHODS.map(m=>(
          <button key={m.id} onClick={()=>run(m)}
            className={cn("w-full text-left bg-slate-900 border rounded-2xl p-4 transition-all hover:scale-[1.01]",
              active?.id===m.id ? "border-white/20" : "border-white/5 hover:border-white/10")}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{m.icon}</span>
              <div>
                <h4 className="text-xs font-bold text-white">{m.title}</h4>
                <span className="text-[9px] text-emerald-400 font-bold">{m.earning}</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">{m.desc}</p>
            <div className="mt-2 space-y-0.5">
              {m.steps.slice(0,2).map((s,i)=><p key={i} className="text-[9px] text-slate-600 flex items-center gap-1"><ChevronRight className="w-2.5 h-2.5"/>{s}</p>)}
            </div>
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col gap-3 overflow-hidden min-w-0">
        {!active ? (
          <div className="flex-1 bg-slate-900 border border-white/5 rounded-2xl flex items-center justify-center opacity-20">
            <div className="text-center"><DollarSign className="w-10 h-10 mx-auto mb-2"/><p className="text-sm font-mono">Pick a method to get your Nexus action plan</p></div>
          </div>
        ) : (
          <>
            <div className={cn("flex-shrink-0 flex items-center gap-3 px-5 py-3 rounded-2xl bg-gradient-to-r text-white", active.color)}>
              <span className="text-2xl">{active.icon}</span>
              <div><h3 className="text-sm font-bold">{active.title}</h3><p className="text-[10px] opacity-80">{active.earning}</p></div>
            </div>
            <div className="flex-1 bg-slate-900 border border-white/5 rounded-2xl overflow-y-auto p-5 custom-scrollbar">
              {loading ? <div className="flex items-center gap-3 text-slate-400"><Loader2 className="w-5 h-5 animate-spin"/><span className="text-sm">Nexus is building your plan...</span></div>
                : <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{output}</p>}
            </div>
            <div className="flex-shrink-0 bg-slate-900 border border-white/5 rounded-2xl overflow-hidden" style={{height:'200px'}}>
              <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-purple-400"/>
                <span className="text-xs font-bold text-white">Ask Nexus anything about this method</span>
              </div>
              <div className="h-28 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {chatMsgs.length===0&&<p className="text-[10px] text-slate-600 italic">"How do I find my first client?" . "Write me the cold email" . "What tools do I need?"</p>}
                {chatMsgs.map((m,i)=>(
                  <div key={i} className={cn("text-xs px-3 py-2 rounded-xl max-w-[85%]", m.role==='user'?"ml-auto bg-purple-500/20 text-purple-100":"bg-white/5 text-slate-300")}>{m.text}</div>
                ))}
                {chatting&&<div className="bg-white/5 text-slate-500 text-xs px-3 py-2 rounded-xl w-12 animate-pulse">...</div>}
                <div ref={chatEndRef}/>
              </div>
              <div className="px-3 py-2 border-t border-white/5 flex gap-2">
                <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&chat()}
                  placeholder="Ask Nexus..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50"/>
                <button onClick={chat} disabled={!chatInput.trim()||chatting} className="p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded-lg transition-all">
                  <Send className="w-3.5 h-3.5 text-white"/>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Main
const LEFT_TABS = [
  { id:'leads',       label:'Lead Generator',       icon:Search,       color:'from-purple-600 to-pink-600',   desc:'Find businesses to close' },
  { id:'receptionist',label:'AI Receptionist',      icon:Phone,        color:'from-blue-600 to-cyan-600',     desc:'Build & sell receptionists' },
  { id:'websites',    label:'Website Builder',      icon:Globe,        color:'from-emerald-600 to-teal-600',  desc:'Build sites for businesses' },
  { id:'revenue',     label:'Revenue Calculator',   icon:BarChart3,    color:'from-orange-500 to-yellow-500', desc:'Track your monthly profits' },
  { id:'methods',     label:'Money Methods',        icon:TrendingUp,   color:'from-indigo-600 to-purple-600', desc:'More AI income streams' },
  { id:'invoice',     label:'Invoice Generator',    icon:FileText,     color:'from-emerald-500 to-blue-500',  desc:'Create professional invoices' },
];

// Standalone Receptionist launcher (not tied to a lead)
function StandaloneReceptionist() {
  const dummyLead: Lead = {
    id:'standalone', name:'My Business', type:'Business', address:'Your Address',
    distance:'', rating:4.5, reviews:0, priority:'High', status:'Hot',
    revenueMin:3000, revenueMax:8000, hasWebsite:false,
    owner:'Owner', ownerTitle:'Owner', manager:'Manager',
    analysis:'Configure your AI receptionist below.',
    salesAngle:'', googleReviews:[],
  };
  return <ReceptionistConfig lead={dummyLead} onBack={()=>{}}/>;
}

// Standalone Website Builder
function StandaloneWebsiteBuilder() {
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('Restaurant');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');

  const build = async () => {
    if (!businessName.trim()) return;
    setLoading(true); setCode('');
    const dummyLead: Lead = {id:'wb',name:businessName,type:businessType,address:location,distance:'',rating:4.5,reviews:0,priority:'High',status:'Hot',revenueMin:0,revenueMax:0,hasWebsite:false};
    const prompt = `Create a complete, beautiful single-page HTML website for "${businessName}", a ${businessType}${location ? ' in '+location : ''}.
- Modern dark/light design, fully mobile responsive  
- Hero with business name, tagline, floating "Call Now" button
- Services section (4-6 realistic services for a ${businessType})
- About section, Contact section
- All CSS inline in <style> tag, Google Fonts OK
- Professional color scheme for ${businessType} industry
Return ONLY the complete HTML document.`;
    const res = await getGeminiResponse(prompt,'Return complete HTML only.','mdq100/Gemma3-Instruct-Abliterated:12b') as any;
    setCode(res?.text||String(res)); setLoading(false);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 p-5 border-b border-white/5 space-y-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2"><Globe className="w-4 h-4 text-emerald-400"/>AI Website Builder</h2>
        <div className="flex gap-2">
          <input value={businessName} onChange={e=>setBusinessName(e.target.value)}
            placeholder="Business name"
            className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"/>
          <select value={businessType} onChange={e=>setBusinessType(e.target.value)}
            className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none [&>option]:bg-slate-900 [&>option]:text-white">
            {['Restaurant','Bakery','Hair Salon','Dentist','Plumber','Electrician','Auto Repair','Gym','Law Firm','Real Estate','Contractor','Cleaner'].map(t=>(
              <option key={t}>{t}</option>
            ))}
          </select>
          <input value={location} onChange={e=>setLocation(e.target.value)}
            placeholder="Location (optional)"
            className="w-40 bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50"/>
          <button onClick={build} disabled={!businessName.trim()||loading}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl font-bold text-sm transition-all flex items-center gap-2">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin"/>Building...</> : <><Wand2 className="w-4 h-4"/>Build Site</>}
          </button>
          {code && <>
            <button onClick={()=>{const b=new Blob([code],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`${businessName.replace(/\s+/g,'-')}.html`;a.click();}}
              className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white hover:bg-white/10 transition-all flex items-center gap-2"><Download className="w-4 h-4"/>Download</button>
            <button onClick={()=>navigator.clipboard.writeText(code)}
              className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white hover:bg-white/10 transition-all flex items-center gap-2"><Copy className="w-4 h-4"/>Copy</button>
          </>}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 opacity-40">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-400"/>
            <p className="text-sm text-slate-400">Building website for {businessName}...</p>
          </div>
        ) : code ? (
          <iframe srcDoc={code} className="w-full h-full border-0 bg-white" title="Preview" sandbox="allow-scripts"/>
        ) : (
          <div className="h-full flex flex-col items-center justify-center opacity-20">
            <Globe className="w-12 h-12 mb-3"/>
            <p className="text-sm font-mono">Enter a business name and click Build Site</p>
          </div>
        )}
      </div>
    </div>
  );
}


// Invoice Generator
function InvoiceGenerator() {
  const [form, setForm] = useState({
    invoiceNumber: 'INV-001',
    date: new Date().toLocaleDateString('en-GB'),
    dueDate: '',
    fromName: '', fromAddress: '', fromEmail: '', fromPhone: '', fromVat: '',
    toName: '', toAddress: '', toEmail: '',
    vatRate: '0',
    currency: '£',
    notes: '',
    accentColor: '2563EB',
    paid: false,
  });
  const [items, setItems] = useState([{ description: '', qty: '1', unitPrice: '' }]);
  const [generating, setGenerating] = useState(false);
  const [aiPrompt, setAiPrompt]     = useState('');
  const [aiLoading, setAiLoading]   = useState(false);
  const geminiKey = localStorage.getItem('gemini_api_key') || '';

  const updateForm = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const updateItem = (i: number, k: string, v: string) => setItems(p => p.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const addItem    = () => setItems(p => [...p, { description: '', qty: '1', unitPrice: '' }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((s, i) => s + (parseFloat(i.qty)||1) * (parseFloat(i.unitPrice)||0), 0);
  const vat      = subtotal * (parseFloat(form.vatRate)||0) / 100;
  const total    = subtotal + vat;
  const fmt      = (n: number) => form.currency + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const generate = async () => {
    setGenerating(true);
    try {
      const body = {
        invoiceNumber: form.invoiceNumber,
        date: form.date,
        dueDate: form.dueDate,
        from: { name: form.fromName, address: form.fromAddress, email: form.fromEmail, phone: form.fromPhone, vatNumber: form.fromVat },
        to:   { name: form.toName, address: form.toAddress, email: form.toEmail },
        items: items.filter(i => i.description.trim()),
        notes: form.notes,
        currency: form.currency,
        vatRate: parseFloat(form.vatRate)||0,
        accentColor: form.accentColor,
        paid: form.paid,
      };
      const r = await fetch('/api/invoice/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `Invoice_${form.invoiceNumber}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch(e: any) { alert('Error: ' + e.message); }
    setGenerating(false);
  };

  const aiFillInvoice = async () => {
    if (!aiPrompt.trim() || !geminiKey) return;
    setAiLoading(true);
    try {
      const prompt = `Extract invoice details from this description and return ONLY valid JSON (no markdown):
"${aiPrompt}"

Return JSON with these exact keys (use empty string "" for missing values):
{
  "invoiceNumber": "INV-001",
  "fromName": "business/person name",
  "fromAddress": "address with newlines as \\n",
  "fromEmail": "",
  "fromPhone": "",
  "toName": "",
  "toAddress": "",
  "toEmail": "",
  "vatRate": "0",
  "currency": "£",
  "notes": "payment details or bank info",
  "items": [{"description":"","qty":"1","unitPrice":""}]
}`;
      const url2 = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`;
      const res = await fetch(url2, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1024 } }),
      });
      const data = await res.json() as any;
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setForm(p => ({ ...p,
        invoiceNumber: parsed.invoiceNumber || p.invoiceNumber,
        fromName: parsed.fromName || p.fromName,
        fromAddress: parsed.fromAddress || p.fromAddress,
        fromEmail: parsed.fromEmail || p.fromEmail,
        fromPhone: parsed.fromPhone || p.fromPhone,
        toName: parsed.toName || p.toName,
        toAddress: parsed.toAddress || p.toAddress,
        toEmail: parsed.toEmail || p.toEmail,
        vatRate: parsed.vatRate || p.vatRate,
        currency: parsed.currency || p.currency,
        notes: parsed.notes || p.notes,
      }));
      if (parsed.items?.length) setItems(parsed.items);
    } catch(e: any) { alert('AI error: ' + e.message); }
    setAiLoading(false);
  };

  const inputCls = "w-full bg-slate-900/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/40";
  const labelCls = "block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1";

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">📄 Invoice Generator</h2>
            <p className="text-sm text-slate-500">Creates a professional Word (.docx) invoice</p>
          </div>
          <div className="flex items-center gap-3">
            <label className={labelCls + " mb-0"}>Accent</label>
            <input type="color" value={"#"+form.accentColor} onChange={e=>updateForm('accentColor',e.target.value.replace('#',''))} className="w-8 h-8 rounded cursor-pointer border border-white/10 bg-transparent"/>
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input type="checkbox" checked={form.paid} onChange={e=>updateForm('paid',e.target.checked)} className="rounded"/>
              Mark as Paid
            </label>
          </div>
        </div>

        {/* AI Fill */}
        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4">
          <p className={labelCls}>✨ AI Auto-Fill</p>
          <div className="flex gap-2">
            <textarea value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} rows={2}
              placeholder='Describe the invoice e.g. "Invoice from Abdul Design to Acme Corp for 3 hours logo design at £75/hr, VAT 20%, pay to bank Barclays sort 12-34-56 acc 12345678"'
              className={inputCls + " resize-none"}/>
            <button onClick={aiFillInvoice} disabled={aiLoading||!geminiKey} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold disabled:opacity-40 flex-shrink-0 flex items-center gap-2">
              {aiLoading ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/>Filling...</> : <>✨ Fill</>}
            </button>
          </div>
          {!geminiKey && <p className="text-[10px] text-amber-400 mt-1">Add Gemini API key in Settings to use AI fill</p>}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* From */}
          <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-white text-sm">From (Your Details)</h3>
            {[['fromName','Your name / business'],['fromEmail','Email'],['fromPhone','Phone'],['fromVat','VAT number (optional)']].map(([k,ph])=>(
              <div key={k}><label className={labelCls}>{(ph as string).split(' ')[0]}</label><input value={(form as any)[k]} onChange={e=>updateForm(k,e.target.value)} placeholder={ph as string} className={inputCls}/></div>
            ))}
            <div><label className={labelCls}>Address</label><textarea value={form.fromAddress} onChange={e=>updateForm('fromAddress',e.target.value)} rows={3} placeholder={"123 Street\nCity, Postcode\nCountry"} className={inputCls+" resize-none"}/></div>
          </div>

          {/* To + Meta */}
          <div className="space-y-4">
            <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4 space-y-3">
              <h3 className="font-bold text-white text-sm">Bill To</h3>
              {[['toName','Client name'],['toEmail','Client email']].map(([k,ph])=>(
                <div key={k}><label className={labelCls}>{(ph as string).split(' ')[0]}</label><input value={(form as any)[k]} onChange={e=>updateForm(k,e.target.value)} placeholder={ph as string} className={inputCls}/></div>
              ))}
              <div><label className={labelCls}>Address</label><textarea value={form.toAddress} onChange={e=>updateForm('toAddress',e.target.value)} rows={2} placeholder={"Client address"} className={inputCls+" resize-none"}/></div>
            </div>
            <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4 space-y-3">
              <h3 className="font-bold text-white text-sm">Invoice Details</h3>
              <div className="grid grid-cols-2 gap-2">
                {[['invoiceNumber','Invoice #'],['date','Date'],['dueDate','Due Date']].map(([k,l])=>(
                  <div key={k}><label className={labelCls}>{l}</label><input value={(form as any)[k]} onChange={e=>updateForm(k,e.target.value)} placeholder={l as string} className={inputCls}/></div>
                ))}
                <div>
                  <label className={labelCls}>Currency</label>
                  <select value={form.currency} onChange={e=>updateForm('currency',e.target.value)} className={inputCls}>
                    {['£','$','€','¥','₹','AED'].map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-white text-sm">Line Items</h3>
            <button onClick={addItem} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold">+ Add Row</button>
          </div>
          <div className="grid grid-cols-12 gap-2 mb-2">
            {['Description','Qty','Unit Price','Total',''].map(h=><div key={h} className={labelCls + (h==='Description'?' col-span-6':h===''?' col-span-1':' col-span-2')}>{h}</div>)}
          </div>
          {items.map((item,i)=>(
            <div key={i} className="grid grid-cols-12 gap-2 mb-2">
              <input value={item.description} onChange={e=>updateItem(i,'description',e.target.value)} placeholder="Service / Product" className={inputCls+" col-span-6"}/>
              <input value={item.qty} onChange={e=>updateItem(i,'qty',e.target.value)} placeholder="1" type="number" min="0" step="0.01" className={inputCls+" col-span-2 text-center"}/>
              <input value={item.unitPrice} onChange={e=>updateItem(i,'unitPrice',e.target.value)} placeholder="0.00" type="number" min="0" step="0.01" className={inputCls+" col-span-2 text-right"}/>
              <div className="col-span-2 flex items-center justify-between px-1">
                <span className="text-sm text-slate-300">{fmt((parseFloat(item.qty)||1)*(parseFloat(item.unitPrice)||0))}</span>
                {items.length>1&&<button onClick={()=>removeItem(i)} className="text-slate-600 hover:text-red-400 text-lg ml-1">x</button>}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/5 justify-end">
            <div className="flex items-center gap-2">
              <label className={labelCls+" mb-0"}>VAT %</label>
              <input value={form.vatRate} onChange={e=>updateForm('vatRate',e.target.value)} type="number" min="0" max="100" className="w-20 bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none"/>
            </div>
            <div className="text-right space-y-1">
              <div className="text-sm text-slate-400">Subtotal: <span className="text-white font-mono">{fmt(subtotal)}</span></div>
              {parseFloat(form.vatRate)>0&&<div className="text-sm text-slate-400">VAT ({form.vatRate}%): <span className="text-white font-mono">{fmt(vat)}</span></div>}
              <div className="text-base font-bold text-white">Total: <span className="font-mono">{fmt(total)}</span></div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-4">
          <label className={labelCls}>Notes & Payment Details</label>
          <textarea value={form.notes} onChange={e=>updateForm('notes',e.target.value)} rows={3}
            placeholder={"Payment terms, bank details:\nBank: Barclays\nSort code: 12-34-56\nAccount: 12345678\nReference: INV-001"}
            className={inputCls+" resize-none"}/>
        </div>

        {/* Generate */}
        <button onClick={generate} disabled={generating}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-base font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-3">
          {generating
            ? <><RefreshCw className="w-5 h-5 animate-spin"/>Generating Word Document...</>
            : <>📄 Download Invoice (.docx)</>}
        </button>
      </div>
    </div>
  );
}


export default function BusinessHub({ tab: initialTab = 'leads' }: { tab?: string }) {
  const [tab, setTab] = useState(initialTab);
  // sync if parent changes
  React.useEffect(() => { setTab(initialTab); }, [initialTab]);

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">
      {/* Left sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-white/5 bg-slate-900/40 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-4 h-4 text-white"/>
            </div>
            <div>
              <h1 className="text-sm font-black text-white">Business Hub</h1>
              <p className="text-[9px] text-slate-500">AI money machines</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {LEFT_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                tab === t.id
                  ? "bg-white/10 border border-white/10"
                  : "hover:bg-white/5 border border-transparent"
              )}>
              <div className={cn("w-7 h-7 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0", t.color)}>
                <t.icon className="w-3.5 h-3.5 text-white"/>
              </div>
              <div className="min-w-0">
                <p className={cn("text-xs font-bold truncate", tab===t.id ? "text-white" : "text-slate-300")}>{t.label}</p>
                <p className="text-[9px] text-slate-500 truncate">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden min-w-0">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{opacity:0,x:8}} animate={{opacity:1,x:0}} exit={{opacity:0}} transition={{duration:0.1}} className="h-full">
            {tab==='leads'        && <LeadGenerator/>}
            {tab==='receptionist' && <StandaloneReceptionist/>}
            {tab==='websites'     && <StandaloneWebsiteBuilder/>}
            {tab==='revenue'      && <RevenueCenter/>}
            {tab==='methods'      && <MoneyMethods/>}
            {tab==='invoice'      && <InvoiceGenerator/>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
