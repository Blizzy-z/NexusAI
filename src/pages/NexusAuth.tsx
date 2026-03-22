import React, { useState, useEffect } from 'react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Key, Eye, EyeOff, Wifi, WifiOff, RefreshCw, Check, X, Zap } from 'lucide-react';

// NexusAuth token-based auth gate for laptop access 
// On the MSI: NexusLink server runs, generates a token
// On the laptop: this screen asks for the server URL + token
// Once authed, token is saved and all API calls go through the MSI

const STORAGE_KEY = 'nexus_auth';

export interface NexusAuthState {
  serverUrl: string;   // e.g. http://100.x.x.x:4200 (Tailscale IP)
  token: string;
  authed: boolean;
  mode: 'local' | 'remote'; // local = running on MSI, remote = laptop
}

function loadAuth(): NexusAuthState {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return { serverUrl: '', token: '', authed: false, mode: 'local' };
}

export function saveAuth(state: NexusAuthState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getAuth(): NexusAuthState {
  return loadAuth();
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

// Hook for components to get the current auth/proxy base URL
export function useNexusProxy() {
  const auth = loadAuth();
  if (auth.mode === 'remote' && auth.authed && auth.serverUrl) {
    return {
      ollamaBase: `${auth.serverUrl}/ollama`,
      geminiBase: `${auth.serverUrl}/nexuslink/gemini`,
      authHeaders: { 'x-nexus-token': auth.token },
      isRemote: true,
    };
  }
  return {
    ollamaBase: 'http://localhost:11434',
    geminiBase: null,
    authHeaders: {},
    isRemote: false,
  };
}

interface Props {
  onAuthed: () => void;
}

export default function NexusAuthGate({ onAuthed }: Props) {
  const [auth, setAuth] = useState<NexusAuthState>(loadAuth);
  const [serverUrl, setServerUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'local' | 'remote'>('local');

  // If already authed locally, skip gate
  useEffect(() => {
    if (auth.authed) { onAuthed(); return; }
    // On mobile/iPhone accessing via LAN IP, auto-auth as local
    const isMobile = window.innerWidth < 768;
    const isLAN = !['localhost','127.0.0.1'].includes(window.location.hostname);
    if (isMobile && isLAN) {
      const state: NexusAuthState = { serverUrl: '', token: '', authed: true, mode: 'local' };
      saveAuth(state);
      onAuthed();
    }
  }, []);

  const testAndSave = async () => {
    if (mode === 'local') {
      const state: NexusAuthState = { serverUrl: '', token: '', authed: true, mode: 'local' };
      saveAuth(state);
      setAuth(state);
      onAuthed();
      return;
    }
    if (!serverUrl || !token) { setError('Enter server URL and token'); return; }
    setStatus('testing');
    setError('');
    try {
      const url = serverUrl.replace(/\/$/, '');
      const res = await fetch(`${url}/nexuslink/health`, {
        headers: { 'x-nexus-token': token },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const state: NexusAuthState = { serverUrl: url, token, authed: true, mode: 'remote' };
      saveAuth(state);
      setAuth(state);
      setStatus('ok');
      setTimeout(onAuthed, 600);
    } catch (e: any) {
      setStatus('fail');
      setError(e.message || 'Could not connect');
    }
  };

  return (
    <div className="fixed inset-0 bg-[#07070d] flex items-center justify-center z-50">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md mx-4 space-y-6">

        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-indigo-600/20 border border-indigo-500/40 rounded-2xl flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">NexusAI</h1>
          <p className="text-sm text-slate-500">Select how you're connecting</p>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2 p-1 bg-white/5 border border-white/5 rounded-2xl">
          <button onClick={() => setMode('local')}
            className={cn('flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2',
              mode === 'local' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white')}>
            <Zap className="w-4 h-4" /> This PC
          </button>
          <button onClick={() => setMode('remote')}
            className={cn('flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2',
              mode === 'remote' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white')}>
            <Wifi className="w-4 h-4" /> Connect to MSI
          </button>
        </div>

        {/* Remote fields */}
        <AnimatePresence>
          {mode === 'remote' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="space-y-4 overflow-hidden">
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block">MSI Server URL</label>
                <input value={serverUrl} onChange={e => setServerUrl(e.target.value)}
                  placeholder="http://100.x.x.x:4200  (Tailscale IP)"
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-indigo-500/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block">Auth Token</label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-black border border-white/10 rounded-xl px-4 py-3">
                    <Key className="w-4 h-4 text-slate-600 shrink-0" />
                    <input value={token} onChange={e => setToken(e.target.value)}
                      type={showToken ? 'text' : 'password'}
                      placeholder="Paste token from your MSI"
                      className="flex-1 bg-transparent text-sm text-white font-mono focus:outline-none" />
                  </div>
                  <button onClick={() => setShowToken(v => !v)}
                    className="px-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors">
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <X className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-1">
                <p className="text-[10px] font-bold text-indigo-400 uppercase">Where to find these</p>
                <p className="text-[10px] text-slate-500">On your MSI / NexusAI / Settings / Remote Access / Start NexusLink / copy URL and Token</p>
                <p className="text-[10px] text-orange-400">Install Tailscale on both devices for internet access from school</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Connect button */}
        <button onClick={testAndSave} disabled={status === 'testing'} className={cn('w-full py-4 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2', status === 'ok'   ? 'bg-emerald-600 text-white' : status === 'fail' ? 'bg-red-600/50 border border-red-500/30 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white')}>
          {status === 'testing' ? <><RefreshCw className="w-4 h-4 animate-spin" /> Connecting...</> :
           status === 'ok'      ? <><Check className="w-4 h-4" /> Connected!</> :
           mode === 'local'     ? <><Zap className="w-4 h-4" /> Launch NexusAI</> :
           <><Wifi className="w-4 h-4" /> Connect to MSI</>}
        </button>
      </motion.div>
    </div>
  );
}
