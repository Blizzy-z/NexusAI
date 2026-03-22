/**
 * Settings Full settings page
 * Tabs: General AI Models Voice Appearance Development Logs
 * Ollama / gemma3:12b is the primary AI Gemini is optional cloud fallback
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings, Cpu, Mic, Palette, Terminal, Eye, EyeOff,
  Save, RefreshCw, Check, AlertTriangle, ChevronRight,
  Zap, Globe, Key, Volume2, Monitor, Moon, Sun,
  GitCommit, Package, Bug, Star, Wrench, Clock,
  ArrowUpCircle, Info, Database, Shield, Bot, Link,
  Wifi, WifiOff, Copy, ExternalLink, Download, Puzzle,
  Radio, Layers, Cpu as CpuIcon, Cloud, Server, HardDrive,
  Play, Square, ChevronDown, FileText, Trash2, Plus,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import AddonsTab from '../components/AddonsTab';
import NotesTab from '../components/NotesTab';

// Types 
interface AppSettings {
  geminiApiKey: string;
  elevenLabsKey: string;
  ollamaUrl: string;
  defaultModel: string;
  fallbackModel: string;
  preferOllama: boolean;
  aiName: string;
  aiPersona: string;
  ttsVoice: string;
  ttsProvider: 'browser' | 'elevenlabs';
  theme: 'dark' | 'darker' | 'midnight';
  accentColor: string;
  fontSize: 'sm' | 'base' | 'lg';
  sidebarCompact: boolean;
  enableAnimations: boolean;
  autoSearch: boolean;
  maxTokens: number;
  // OpenClaw
  openClawHost: string;
  openClawPort: string;
  openClawAuthToken: string;
  openClawMessenger: 'telegram' | 'whatsapp' | 'slack';
  openClawBotToken: string;
  openClawChatId: string;
  openClawSchedule: string;
  openClawBurnerMode: boolean;
}

interface DevLogEntry {
  ts: number;
  version: string;
  type: 'feat' | 'fix' | 'perf' | 'refactor' | 'misc';
  msg: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: '',
  elevenLabsKey: '',
  ollamaUrl: 'http://127.0.0.1:11434',
  defaultModel: 'mdq100/Gemma3-Instruct-Abliterated:12b',
  fallbackModel: 'gemma3:4b',
  preferOllama: true,
  aiName: 'Nexus',
  aiPersona: 'You are Nexus, a highly capable AI assistant running locally on this machine. You are helpful, direct, and technically precise.',
  ttsVoice: 'Google UK English Male',
  ttsProvider: 'browser',
  theme: 'darker',
  accentColor: '#6366f1',
  fontSize: 'base',
  sidebarCompact: false,
  enableAnimations: true,
  autoSearch: true,
  maxTokens: 8192,
  // OpenClaw
  openClawHost: '127.0.0.1',
  openClawPort: '18789',
  openClawAuthToken: '',
  openClawMessenger: 'telegram',
  openClawBotToken: '',
  openClawChatId: '',
  openClawSchedule: '0 9 * * *',
  openClawBurnerMode: false,
};

const TYPE_META: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  feat:     { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',  label: 'Feature',   icon: <Star className="w-2.5 h-2.5"/> },
  fix:      { color: 'text-red-400 bg-red-500/10 border-red-500/20',              label: 'Fix',       icon: <Bug className="w-2.5 h-2.5"/> },
  perf:     { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',        label: 'Perf',      icon: <Zap className="w-2.5 h-2.5"/> },
  refactor: { color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',           label: 'Refactor',  icon: <Wrench className="w-2.5 h-2.5"/> },
  misc:     { color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',        label: 'Misc',      icon: <GitCommit className="w-2.5 h-2.5"/> },
};

const TABS = [
  { id: 'general',    label: '⚙ General',      icon: Settings },
  { id: 'ai',         label: '🤖 AI Models',    icon: Cpu },
  { id: 'apikeys',    label: '🔑 API Keys',      icon: Key },
  { id: 'voice',      label: '🎙 Voice',         icon: Mic },
  { id: 'appearance', label: '🎨 Appearance',    icon: Palette },
  { id: 'notes',      label: '🗒 Notes',         icon: FileText },
  { id: 'addons',     label: '🧩 Addons',        icon: Puzzle },
  { id: 'devlog',     label: '📋 Dev Logs',      icon: Terminal },
] as const;

type TabId = typeof TABS[number]['id'];

// Reusable field components 
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-[11px] font-semibold text-slate-400 mb-1">{label}</label>
    {hint && <p className="text-[10px] text-slate-600 mb-1.5">{hint}</p>}
    {children}
  </div>
);

const inputCls = "w-full bg-slate-800/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 placeholder-slate-700";
const selectCls = "w-full bg-slate-800/60 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50";

// Main component 
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('nexus_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });
  const [saved, setSaved] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [devLog, setDevLog] = useState<DevLogEntry[]>([]);
  const [devLogLoading, setDevLogLoading] = useState(false);
  const [newLogMsg, setNewLogMsg] = useState('');
  const [newLogType, setNewLogType] = useState<DevLogEntry['type']>('misc');
  const [filterVer, setFilterVer] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [clawTestStatus, setClawTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [clawTestMsg, setClawTestMsg] = useState('');
  const [copiedField, setCopiedField] = useState('');

  // Load Ollama models 
  const loadOllamaModels = useCallback(async () => {
    setOllamaLoading(true);
    try {
      const r = await fetch('/api/nexuslink/ollama-models', { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = await r.json();
        setOllamaModels(d.models || []);
      }
    } catch {}
    setOllamaLoading(false);
  }, []);

  // Load dev log 
  const loadDevLog = useCallback(async () => {
    setDevLogLoading(true);
    try {
      const r = await fetch('/api/dev-log', { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = await r.json();
        setDevLog(d.entries || []);
      }
    } catch {}
    setDevLogLoading(false);
  }, []);

  useEffect(() => {
    loadOllamaModels();
    loadDevLog();
  }, []);

  const set = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) =>
    setSettings(prev => ({ ...prev, [key]: val }));

  const testClawConnection = async () => {
    setClawTestStatus('testing');
    setClawTestMsg('');
    try {
      // Save config to server first so the proxy uses the latest host/port/token
      await fetch('/api/openclaw/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: settings.openClawHost,
          port: settings.openClawPort,
          authToken: settings.openClawAuthToken,
        }),
      });
      // Test via server-side proxy avoids CORS block from browser OpenClaw direct
      const r = await fetch('/api/openclaw/health', { signal: AbortSignal.timeout(6000) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        setClawTestStatus('ok');
        setClawTestMsg(`Connected . ${d.version || d.model || d.endpoint || 'OpenClaw online'}`);
      } else {
        setClawTestStatus('fail');
        setClawTestMsg(d.error || `HTTP ${r.status} -- gateway unreachable`);
      }
    } catch (e: any) {
      setClawTestStatus('fail');
      setClawTestMsg('Server proxy error -- is NexusAI server running?');
    }
  };

  const copyField = async (val: string, key: string) => {
    await navigator.clipboard.writeText(val).catch(() => {});
    setCopiedField(key);
    setTimeout(() => setCopiedField(''), 1500);
  };

  const saveSettings = async () => {
    localStorage.setItem('nexus_settings', JSON.stringify(settings));
    // Push model config to server
    try {
      await fetch('/api/model-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultModel: settings.defaultModel,
          fallbackModel: settings.fallbackModel,
          preferOllama: settings.preferOllama,
        }),
      });
    } catch {}
    // Push OpenClaw config to server
    try {
      await fetch('/api/openclaw/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: settings.openClawHost,
          port: settings.openClawPort,
          authToken: settings.openClawAuthToken,
          messenger: settings.openClawMessenger,
          botToken: settings.openClawBotToken,
          chatId: settings.openClawChatId,
          schedule: settings.openClawSchedule,
          burnerMode: settings.openClawBurnerMode,
        }),
      });
    } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addDevLogEntry = async () => {
    if (!newLogMsg.trim()) return;
    try {
      await fetch('/api/dev-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newLogType, msg: newLogMsg.trim(), version: '4.5.0' }),
      });
      setNewLogMsg('');
      loadDevLog();
    } catch {}
  };

  const toggleKey = (k: string) => setShowKeys(prev => ({ ...prev, [k]: !prev[k] }));

  // Derived dev log 
  const versions = ['all', ...Array.from(new Set(devLog.map(e => e.version)))];
  const filteredLog = devLog.filter(e =>
    (filterVer === 'all' || e.version === filterVer) &&
    (filterType === 'all' || e.type === filterType)
  );

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5 bg-black/20 flex-shrink-0">
        <Settings className="w-4.5 h-4.5 text-indigo-400"/>
        <h1 className="text-sm font-bold text-white">Settings</h1>
        <button onClick={saveSettings} className={cn( 'ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold transition-all', saved ? 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400' : 'bg-indigo-600 hover:bg-indigo-500 text-white', )}>
          {saved ? <><Check className="w-3.5 h-3.5"/>Saved</> : <><Save className="w-3.5 h-3.5"/>Save Changes</>}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar tabs */}
        <div className="w-48 flex-shrink-0 bg-black/20 border-r border-white/5 flex flex-col py-3 gap-0.5 px-2">
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[11px] font-semibold transition-all text-left',
                activeTab === id
                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20'
                  : 'text-slate-500 hover:text-white hover:bg-white/4',
              )}>
              {label}
            </button>
          ))}
          <div className="mt-auto px-2 pb-2">
            <div className="p-2.5 bg-white/2 border border-white/5 rounded-xl">
              <p className="text-[9px] text-slate-700 font-mono">NexusAI v4.5.0</p>
              <p className="text-[9px] text-slate-700">Primary: Ollama</p>
              <p className="text-[9px] text-indigo-400 font-mono">{settings.defaultModel}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* General */}
          {activeTab === 'general' && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-sm font-bold text-white mb-0.5">General Settings</h2>
                <p className="text-[11px] text-slate-600">Core NexusAI configuration</p>
              </div>
              <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 space-y-4">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">AI Identity</h3>
                <Field label="AI Name" hint="What the assistant calls itself">
                  <input value={settings.aiName} onChange={e => set('aiName', e.target.value)}
                    placeholder="Nexus" className={inputCls}/>
                </Field>
                <Field label="System Persona" hint="Injected as system prompt into every conversation">
                  <textarea value={settings.aiPersona} onChange={e => set('aiPersona', e.target.value)}
                    rows={4} className={inputCls + ' resize-none'}/>
                </Field>
              </div>

              <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 space-y-4">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Behaviour</h3>
                <Field label="Max output tokens" hint="Maximum tokens per AI response (8192 recommended)">
                  <input type="number" value={settings.maxTokens} onChange={e => set('maxTokens', +e.target.value)}
                    min={512} max={32768} step={512} className={inputCls}/>
                </Field>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400">Auto web search</p>
                    <p className="text-[10px] text-slate-600">Automatically trigger search for research queries</p>
                  </div>
                  <div onClick={() => set('autoSearch', !settings.autoSearch)}
                    className={cn('w-9 h-5 rounded-full transition-colors relative',
                      settings.autoSearch ? 'bg-indigo-600' : 'bg-slate-700')}>
                    <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', settings.autoSearch ? 'translate-x-4' : 'translate-x-0.5')}/>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* AI Models */}
          {activeTab === 'ai' && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-sm font-bold text-white mb-0.5">AI Model Configuration</h2>
                <p className="text-[11px] text-slate-600">Ollama is the primary AI. Gemini is an optional cloud fallback.</p>
              </div>

              {/* Ollama section */}
              <div className="bg-slate-900/60 border border-emerald-500/15 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Cpu className="w-3 h-3"/>Ollama (Primary -- Local)
                  </h3>
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
                    <span className="text-[9px] text-emerald-400 font-bold">PREFERRED</span>
                  </div>
                </div>
                <Field label="Ollama server URL">
                  <input value={settings.ollamaUrl} onChange={e => set('ollamaUrl', e.target.value)}
                    placeholder="http://127.0.0.1:11434" className={inputCls}/>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Default model" hint="Used by all pages (Centre, NexusCode, etc.)">
                    <div className="relative">
                      <select value={settings.defaultModel} onChange={e => set('defaultModel', e.target.value)}
                        className={selectCls}>
                        {['mdq100/Gemma3-Instruct-Abliterated:12b', 'gemma3:12b', 'gemma3:4b', 'gemma3:27b', 'deepseek-r1:7b', 'hf.co/mradermacher/Qwen3.5-9B-Claude-4.6-HighIQ-THINKING-HERETIC-UNCENSORED-i1-GGUF:Q4_K_M',
                          'deepseek-coder-v2:16b', 'codellama:13b', 'mistral:7b', 'llama3.2:3b',
                          ...ollamaModels.filter(m => !['mdq100/Gemma3-Instruct-Abliterated:12b','gemma3:12b','gemma3:4b','gemma3:27b','deepseek-r1:7b','hf.co/mradermacher/Qwen3.5-9B-Claude-4.6-HighIQ-THINKING-HERETIC-UNCENSORED-i1-GGUF:Q4_K_M'].includes(m))
                        ].map(m => <option key={m} value={m}>{m.replace(/^hf\.co\/[^/]+\//,'').replace(/^[^/]+\//,'')}</option>)}
                      </select>
                    </div>
                  </Field>
                  <Field label="Fallback model" hint="Used when default is unavailable">
                    <select value={settings.fallbackModel} onChange={e => set('fallbackModel', e.target.value)}
                      className={selectCls}>
                      {['gemma3:4b', 'gemma3:12b', 'llama3.2:3b', 'mistral:7b'].map(m =>
                        <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="flex items-center justify-between">
                  <button onClick={loadOllamaModels} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl text-[10px] text-slate-400 hover:text-white transition-all">
                    <RefreshCw className={cn('w-3 h-3', ollamaLoading && 'animate-spin')}/>
                    {ollamaLoading ? 'Checking...' : `Refresh models (${ollamaModels.length} found)`}
                  </button>
                  {ollamaModels.length === 0 && (
                    <p className="text-[10px] text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3"/>Ollama not running
                    </p>
                  )}
                </div>

                {ollamaModels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ollamaModels.map(m => (
                      <button key={m} onClick={() => set('defaultModel', m)}
                        className={cn('px-2.5 py-1 rounded-lg text-[10px] border transition-all',
                          settings.defaultModel === m
                            ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400'
                            : 'bg-white/3 border-white/8 text-slate-500 hover:text-white')}>
                        {m}
                      </button>
                    ))}
                  </div>
                )}

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400">Always prefer Ollama</p>
                    <p className="text-[10px] text-slate-600">Use local models even when Gemini key is set</p>
                  </div>
                  <div onClick={() => set('preferOllama', !settings.preferOllama)}
                    className={cn('w-9 h-5 rounded-full transition-colors relative cursor-pointer',
                      settings.preferOllama ? 'bg-emerald-600' : 'bg-slate-700')}>
                    <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', settings.preferOllama ? 'translate-x-4' : 'translate-x-0.5')}/>
                  </div>
                </label>
              </div>

              {/* Note: Gemini and ElevenLabs API keys moved to API Keys tab */}
            </div>
          )}

          {/* API Keys */}
          {activeTab === 'apikeys' && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-sm font-bold text-white mb-0.5">API Keys &amp; Connections</h2>
                <p className="text-[11px] text-slate-600">External service credentials. All stored locally in your browser.</p>
              </div>

              {/* Gemini */}
              <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-blue-400"/>Google Gemini
                  </h3>
                  <span className="text-[9px] text-slate-600 px-2 py-0.5 bg-white/3 border border-white/8 rounded">OPTIONAL</span>
                </div>
                <Field label="Gemini API key" hint="Only needed for web search grounding and cloud code execution. Core AI uses Ollama.">
                  <div className="relative">
                    <input type={showKeys['gemini'] ? 'text' : 'password'} value={settings.geminiApiKey} onChange={e => set('geminiApiKey', e.target.value)} placeholder="AIza..." className={inputCls + ' pr-16'}/>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                      <button onClick={() => copyField(settings.geminiApiKey, 'gemini')} className="p-1 text-slate-600 hover:text-slate-400">
                        {copiedField === 'gemini' ? <Check className="w-3 h-3 text-emerald-400"/> : <Copy className="w-3 h-3"/>}
                      </button>
                      <button onClick={() => toggleKey('gemini')} className="p-1 text-slate-600 hover:text-slate-400">
                        {showKeys['gemini'] ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
                      </button>
                    </div>
                  </div>
                </Field>
              </div>

              {/* ElevenLabs */}
              <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Volume2 className="w-3 h-3 text-purple-400"/>ElevenLabs TTS
                  </h3>
                  <span className="text-[9px] text-slate-600 px-2 py-0.5 bg-white/3 border border-white/8 rounded">OPTIONAL</span>
                </div>
                <Field label="ElevenLabs API key" hint="Premium voice synthesis. Browser TTS is used if empty.">
                  <div className="relative">
                    <input type={showKeys['eleven'] ? 'text' : 'password'} value={settings.elevenLabsKey} onChange={e => set('elevenLabsKey', e.target.value)} placeholder="sk_..." className={inputCls + ' pr-16'}/>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                      <button onClick={() => copyField(settings.elevenLabsKey, 'eleven')} className="p-1 text-slate-600 hover:text-slate-400">
                        {copiedField === 'eleven' ? <Check className="w-3 h-3 text-emerald-400"/> : <Copy className="w-3 h-3"/>}
                      </button>
                      <button onClick={() => toggleKey('eleven')} className="p-1 text-slate-600 hover:text-slate-400">
                        {showKeys['eleven'] ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
                      </button>
                    </div>
                  </div>
                </Field>
              </div>

              {/* OpenClaw */}
              <div className="bg-slate-900/60 border border-red-500/15 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Bot className="w-3 h-3"/>OpenClaw -- Autonomous Agent
                  </h3>
                  <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-bold', clawTestStatus === 'ok'      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : clawTestStatus === 'fail'    ? 'bg-red-500/10 border-red-500/20 text-red-400' : clawTestStatus === 'testing' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-white/3 border-white/8 text-slate-600')}>
                    {clawTestStatus === 'ok'      && <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>Online</>}
                    {clawTestStatus === 'fail'    && <><span className="w-1.5 h-1.5 rounded-full bg-red-500"/>Offline</>}
                    {clawTestStatus === 'testing' && <><RefreshCw className="w-2.5 h-2.5 animate-spin"/>Testing</>}
                    {clawTestStatus === 'idle'    && <><span className="w-1.5 h-1.5 rounded-full bg-slate-600"/>Not tested</>}
                  </div>
                </div>

                {clawTestMsg && (
                  <p className={cn('text-[10px] px-3 py-2 rounded-lg border', clawTestStatus === 'ok' ? 'bg-emerald-500/8 border-emerald-500/15 text-emerald-400' : 'bg-red-500/8 border-red-500/15 text-red-400')}>
                    {clawTestMsg}
                  </p>
                )}

                {/* Host + Port */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Field label="OpenClaw host" hint="IP or hostname only -- no http:// and no port (e.g. 127.0.0.1 or myclaw.local)">
                      <input
                        value={settings.openClawHost}
                        onChange={e => {
                          // Strip accidental http:// prefix and :port suffix
                          let v = e.target.value.replace(/^https?:\/\//i, '').replace(/:\d+$/, '');
                          set('openClawHost', v);
                        }}
                        placeholder="127.0.0.1"
                        className={inputCls}/>
                    </Field>
                  </div>
                  <Field label="Port" hint="Default: 18789">
                    <input value={settings.openClawPort} onChange={e => set('openClawPort', e.target.value)}
                      placeholder="8765" className={inputCls}/>
                  </Field>
                </div>

                {/* Auth token */}
                <Field label="Auth token" hint="Set in your OpenClaw config.yaml as api_token. Leave empty if auth is disabled.">
                  <div className="relative">
                    <input type={showKeys['claw_auth'] ? 'text' : 'password'} value={settings.openClawAuthToken} onChange={e => set('openClawAuthToken', e.target.value)} placeholder="your-secret-token" className={inputCls + ' pr-16'}/>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                      <button onClick={() => copyField(settings.openClawAuthToken, 'claw_auth')} className="p-1 text-slate-600 hover:text-slate-400">
                        {copiedField === 'claw_auth' ? <Check className="w-3 h-3 text-emerald-400"/> : <Copy className="w-3 h-3"/>}
                      </button>
                      <button onClick={() => toggleKey('claw_auth')} className="p-1 text-slate-600 hover:text-slate-400">
                        {showKeys['claw_auth'] ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
                      </button>
                    </div>
                  </div>
                </Field>

                {/* Messenger */}
                <Field label="Messenger bridge" hint="How OpenClaw sends you messages and receives commands">
                  <div className="grid grid-cols-3 gap-2">
                    {(['telegram', 'whatsapp', 'slack'] as const).map(m => (
                      <button key={m} onClick={() => set('openClawMessenger', m)}
                        className={cn('py-2 rounded-xl border text-[10px] font-bold capitalize transition-all',
                          settings.openClawMessenger === m
                            ? 'bg-red-500/15 border-red-500/25 text-red-400'
                            : 'bg-white/3 border-white/8 text-slate-600 hover:text-white')}>
                        {m === 'telegram' ? '✈ Telegram' : m === 'whatsapp' ? '📱 WhatsApp' : '💬 Slack'}
                      </button>
                    ))}
                  </div>
                </Field>

                {/* Bot token */}
                <Field
                  label={settings.openClawMessenger === 'telegram' ? 'Telegram bot token' : settings.openClawMessenger === 'whatsapp' ? 'WhatsApp API token' : 'Slack bot token'}
                  hint={settings.openClawMessenger === 'telegram' ? 'Get from @BotFather on Telegram' : settings.openClawMessenger === 'whatsapp' ? 'From your WhatsApp Business API provider' : 'From api.slack.com/apps -- Bot User OAuth Token'}>
                  <div className="relative">
                    <input type={showKeys['claw_bot'] ? 'text' : 'password'} value={settings.openClawBotToken} onChange={e => set('openClawBotToken', e.target.value)} placeholder={settings.openClawMessenger === 'telegram' ? '123456789:AAF...' : settings.openClawMessenger === 'slack' ? 'xoxb-...' : 'Bearer token...'} className={inputCls + ' pr-16'}/>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                      <button onClick={() => copyField(settings.openClawBotToken, 'claw_bot')} className="p-1 text-slate-600 hover:text-slate-400">
                        {copiedField === 'claw_bot' ? <Check className="w-3 h-3 text-emerald-400"/> : <Copy className="w-3 h-3"/>}
                      </button>
                      <button onClick={() => toggleKey('claw_bot')} className="p-1 text-slate-600 hover:text-slate-400">
                        {showKeys['claw_bot'] ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
                      </button>
                    </div>
                  </div>
                </Field>

                {/* Chat ID */}
                <Field
                  label={settings.openClawMessenger === 'telegram' ? 'Telegram chat ID' : settings.openClawMessenger === 'slack' ? 'Slack channel ID' : 'WhatsApp number'}
                  hint={settings.openClawMessenger === 'telegram' ? 'Your personal Telegram chat ID -- message @userinfobot to get it' : settings.openClawMessenger === 'slack' ? 'Right-click channel -> View channel details -> Copy ID' : 'Your WhatsApp number with country code e.g. +447...'}>
                  <div className="relative">
                    <input value={settings.openClawChatId} onChange={e => set('openClawChatId', e.target.value)}
                      placeholder={settings.openClawMessenger === 'telegram' ? '123456789' : settings.openClawMessenger === 'slack' ? 'C0123456789' : '+447700900000'}
                      className={inputCls + ' pr-9'}/>
                    <button onClick={() => copyField(settings.openClawChatId, 'claw_chat')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-600 hover:text-slate-400">
                      {copiedField === 'claw_chat' ? <Check className="w-3 h-3 text-emerald-400"/> : <Copy className="w-3 h-3"/>}
                    </button>
                  </div>
                </Field>

                {/* Cron schedule */}
                <Field label="Autonomous wake schedule (cron)" hint="When OpenClaw wakes up on its own to check tasks, emails, etc. Leave empty to disable.">
                  <input value={settings.openClawSchedule} onChange={e => set('openClawSchedule', e.target.value)}
                    placeholder="0 9 * * *  (every day at 9am)" className={inputCls + ' font-mono'}/>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[
                      { label: 'Every 9am', val: '0 9 * * *' },
                      { label: 'Hourly',    val: '0 * * * *' },
                      { label: 'Every 30m', val: '*/30 * * * *' },
                      { label: 'Disabled',  val: '' },
                    ].map(p => (
                      <button key={p.label} onClick={() => set('openClawSchedule', p.val)}
                        className="px-2 py-0.5 bg-white/3 hover:bg-white/6 border border-white/8 rounded text-[9px] text-slate-600 hover:text-white transition-all">
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Field>

                {/* Burner mode warning */}
                <label className="flex items-start justify-between cursor-pointer gap-4">
                  <div>
                    <p className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
                      <Shield className="w-3 h-3"/>Burner/isolated machine mode
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5 leading-relaxed">
                      Mark this machine as a dedicated OpenClaw host. Reminds you not to store sensitive personal data here.
                      OpenClaw has deep system access -- ideally runs on a separate PC or VPS.
                    </p>
                  </div>
                  <div onClick={() => set('openClawBurnerMode', !settings.openClawBurnerMode)}
                    className={cn('flex-shrink-0 w-9 h-5 rounded-full transition-colors relative cursor-pointer mt-0.5',
                      settings.openClawBurnerMode ? 'bg-amber-500' : 'bg-slate-700')}>
                    <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', settings.openClawBurnerMode ? 'translate-x-4' : 'translate-x-0.5')}/>
                  </div>
                </label>

                {/* Test + Docs */}
                <div className="flex gap-2 pt-1">
                  <button onClick={testClawConnection} disabled={clawTestStatus === 'testing'} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-[11px] font-bold transition-all">
                    {clawTestStatus === 'testing'
                      ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/>Testing...</>
                      : <><Wifi className="w-3.5 h-3.5"/>Test Connection</>}
                  </button>
                  <a href="https://github.com/steipete/OpenClaw" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/8 border border-white/10 text-slate-400 hover:text-white rounded-xl text-[11px] font-bold transition-all">
                    <ExternalLink className="w-3.5 h-3.5"/>OpenClaw Docs
                  </a>
                </div>

                <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                  <p className="text-[9px] text-amber-400 flex items-start gap-1.5 leading-relaxed">
                    <Shield className="w-3 h-3 flex-shrink-0 mt-0.5"/>
                    OpenClaw has full system access to this machine -- it can execute code, manage files, and read your screen.
                    Only run it on a dedicated or isolated machine. Never expose the port to the public internet without auth token set.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Voice */}
          {activeTab === 'voice' && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-sm font-bold text-white mb-0.5">Voice Settings</h2>
                <p className="text-[11px] text-slate-600">STT uses Web Speech API (browser). TTS can use browser or ElevenLabs.</p>
              </div>
              <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 space-y-4">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Text-to-Speech</h3>
                <Field label="TTS provider">
                  <div className="grid grid-cols-2 gap-2">
                    {(['browser', 'elevenlabs'] as const).map(p => (
                      <button key={p} onClick={() => set('ttsProvider', p)}
                        className={cn('py-2.5 rounded-xl border text-[11px] font-bold capitalize transition-all',
                          settings.ttsProvider === p
                            ? 'bg-indigo-500/15 border-indigo-500/25 text-indigo-400'
                            : 'bg-white/3 border-white/8 text-slate-500 hover:text-white')}>
                        {p === 'browser' ? '🔊 Browser TTS' : '✨ ElevenLabs'}
                      </button>
                    ))}
                  </div>
                </Field>
                {settings.ttsProvider === 'browser' && (
                  <Field label="Voice name" hint="Depends on your OS installed voices">
                    <input value={settings.ttsVoice} onChange={e => set('ttsVoice', e.target.value)}
                      placeholder="Google UK English Male" className={inputCls}/>
                  </Field>
                )}
              </div>
            </div>
          )}

          {/* Appearance */}
          {activeTab === 'appearance' && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-sm font-bold text-white mb-0.5">Appearance</h2>
                <p className="text-[11px] text-slate-600">Customise the look and feel of NexusAI</p>
              </div>
              <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 space-y-4">
                <Field label="Theme">
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'dark',     label: '☀ Dark',     bg: '#111' },
                      { id: 'darker',   label: '🌙 Darker',  bg: '#0d0d0d' },
                      { id: 'midnight', label: '🌑 Midnight', bg: '#070709' },
                    ] as const).map(t => (
                      <button key={t.id} onClick={() => set('theme', t.id)}
                        className={cn('py-2.5 rounded-xl border text-[11px] font-bold transition-all',
                          settings.theme === t.id
                            ? 'border-indigo-500/40 text-indigo-400 bg-indigo-500/10'
                            : 'border-white/8 text-slate-500 hover:text-white')}
                        style={{ background: settings.theme === t.id ? undefined : t.bg }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Accent colour">
                  <div className="flex items-center gap-3">
                    <input type="color" value={settings.accentColor} onChange={e => set('accentColor', e.target.value)}
                      className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer"/>
                    <input value={settings.accentColor} onChange={e => set('accentColor', e.target.value)}
                      placeholder="#6366f1" className={inputCls + ' flex-1'}/>
                  </div>
                </Field>
                <Field label="Font size">
                  <div className="grid grid-cols-3 gap-2">
                    {([{ id: 'sm', label: 'Small' }, { id: 'base', label: 'Normal' }, { id: 'lg', label: 'Large' }] as const).map(f => (
                      <button key={f.id} onClick={() => set('fontSize', f.id)}
                        className={cn('py-2.5 rounded-xl border text-[11px] font-bold transition-all',
                          settings.fontSize === f.id
                            ? 'bg-indigo-500/15 border-indigo-500/25 text-indigo-400'
                            : 'bg-white/3 border-white/8 text-slate-500 hover:text-white')}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-400">Enable animations</p>
                    <p className="text-[10px] text-slate-600">Page transitions, typing indicators, pulse effects</p>
                  </div>
                  <div onClick={() => set('enableAnimations', !settings.enableAnimations)}
                    className={cn('w-9 h-5 rounded-full transition-colors relative cursor-pointer',
                      settings.enableAnimations ? 'bg-indigo-600' : 'bg-slate-700')}>
                    <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', settings.enableAnimations ? 'translate-x-4' : 'translate-x-0.5')}/>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Development Logs */}
          {activeTab === 'devlog' && (
            <div className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white mb-0.5">Development Logs</h2>
                  <p className="text-[11px] text-slate-600">
                    Live change log for NexusAI. Updated automatically when pages are rebuilt or features are added.
                  </p>
                </div>
                <button onClick={loadDevLog} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl text-[10px] text-slate-400 hover:text-white transition-all">
                  <RefreshCw className={cn('w-3 h-3', devLogLoading && 'animate-spin')}/>Refresh
                </button>
              </div>

              {/* Add entry */}
              <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 space-y-3">
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Add Log Entry</h3>
                <div className="flex gap-2">
                  <select value={newLogType} onChange={e => setNewLogType(e.target.value as DevLogEntry['type'])}
                    className="bg-slate-800 border border-white/10 rounded-xl px-2.5 py-2 text-[11px] text-slate-400 focus:outline-none flex-shrink-0">
                    {Object.entries(TYPE_META).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  <input value={newLogMsg} onChange={e => setNewLogMsg(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addDevLogEntry(); }}
                    placeholder="Describe what was changed..."
                    className="flex-1 bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/40 placeholder-slate-700"/>
                  <button onClick={addDevLogEntry} disabled={!newLogMsg.trim()} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-[11px] font-bold transition-all flex-shrink-0">
                    Add
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-600">Version:</span>
                  <div className="flex gap-1">
                    {versions.map(v => (
                      <button key={v} onClick={() => setFilterVer(v)}
                        className={cn('px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border',
                          filterVer === v
                            ? 'bg-indigo-500/15 border-indigo-500/25 text-indigo-400'
                            : 'bg-white/3 border-white/8 text-slate-600 hover:text-white')}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-600">Type:</span>
                  <div className="flex gap-1">
                    {['all', ...Object.keys(TYPE_META)].map(t => (
                      <button key={t} onClick={() => setFilterType(t)}
                        className={cn('px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border capitalize',
                          filterType === t
                            ? 'bg-indigo-500/15 border-indigo-500/25 text-indigo-400'
                            : 'bg-white/3 border-white/8 text-slate-600 hover:text-white')}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="ml-auto text-[10px] text-slate-700">{filteredLog.length} entries</span>
              </div>

              {/* Log entries */}
              <div className="space-y-2">
                {devLogLoading
                  ? <p className="text-[11px] text-slate-700 italic text-center py-8">Loading...</p>
                  : filteredLog.length === 0
                    ? <p className="text-[11px] text-slate-700 italic text-center py-8">No entries matching filters</p>
                    : (() => {
                        const grouped: Record<string, DevLogEntry[]> = {};
                        filteredLog.forEach(e => {
                          if (!grouped[e.version]) grouped[e.version] = [];
                          grouped[e.version].push(e);
                        });
                        return Object.entries(grouped).map(([ver, entries]) => (
                          <div key={ver} className="space-y-2">
                            {/* Version header */}
                            <div className="flex items-center gap-2 pt-2 pb-1">
                              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                                <ArrowUpCircle className="w-3.5 h-3.5 text-indigo-400"/>
                                <span className="text-[11px] font-bold text-indigo-300">v{ver}</span>
                              </div>
                              <div className="flex-1 h-px bg-white/5"/>
                              <span className="text-[9px] text-slate-700 font-mono">{entries.length} change{entries.length !== 1 ? 's' : ''}</span>
                            </div>
                            {/* Entries */}
                            {entries.map((e, i) => {
                              const meta = TYPE_META[e.type] || TYPE_META.misc;
                              // Split msg into first sentence (headline) + rest (detail)
                              const colonIdx = e.msg.indexOf(': ');
                              const hasDetail = colonIdx > -1 && colonIdx < 80;
                              const headline = hasDetail ? e.msg.slice(0, colonIdx) : e.msg;
                              const detail   = hasDetail ? e.msg.slice(colonIdx + 2) : '';
                              return (
                                <div key={i} className="px-4 py-3 bg-slate-900/40 border border-white/5 rounded-xl hover:border-white/10 transition-colors group">
                                  <div className="flex items-start gap-3">
                                    <div className={cn('flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-bold flex-shrink-0 mt-0.5', meta.color)}>
                                      {meta.icon}{meta.label}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[12px] font-medium text-slate-200 leading-snug mb-0.5">{headline}</p>
                                      {detail && (
                                        <p className="text-[11px] text-slate-500 leading-relaxed font-light">{detail}</p>
                                      )}
                                    </div>
                                    <span className="text-[9px] text-slate-700 font-mono flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {new Date(e.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ));
                      })()
                }
              </div>
            </div>
          )}

          {/* NOTES TAB */}
          {activeTab === 'notes' && (
            <NotesTab />
          )}

          {/* ADDONS / LINKING TAB */}
          {activeTab === 'addons' && (
            <AddonsTab />
          )}
        </div>
      </div>
    </div>
  );
}
