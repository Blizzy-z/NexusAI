/**
 * AISidebar -- Voice-first personal AI
 * STT: Web Speech API (browser-native, no model, no server required)
 * TTS: ElevenLabs  /  StreamElements  /  Web Speech fallback
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Send, Mic, MicOff, Volume2, VolumeX,
  ChevronRight, ChevronLeft, Trash2, Settings,
  Camera, Monitor, MonitorOff, Check, Edit2, X, Brain, Zap, Activity
} from 'lucide-react';
import { getGeminiResponse, getGeminiChatResponse, getOllamaChatResponse, GEMINI_MODELS, GEMINI_TOOLS } from '../services/api';
import { useSettings } from '../context/SettingsContext';
import { speak } from '../services/elevenlabs';
import { ContinuousSTT, webSpeechSupported } from '../services/stt';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Msg { role: 'user'|'assistant'; content: string; screenshot?: string; ts: number; isGreeting?: boolean; }

// ── All available models ──────────────────────────────────────────────────────
const ALL_MODELS = [
  { id: '__gemini_flash_exp__', label: '* Gemini 3 Flash',   group: 'Cloud',       vision: true  },
  { id: '__gemini_flash__',     label: '* Gemini 3 Flash',         group: 'Cloud',       vision: true  },
  { id: '__gemini_pro__',       label: '* Gemini 3.1 Pro',           group: 'Cloud',       vision: true  },
  { id: '__gemini_flash25__',   label: '* Gemini 3 Flash',         group: 'Cloud',       vision: true  },
  { id: 'dolphin-mistral',              label: '🐬 Dolphin Mistral 7B',    group: 'Uncensored',  vision: false },
  { id: 'dolphin-llama3:8b',            label: '🐬 Dolphin LLaMA3 8B',     group: 'Uncensored',  vision: false },
  { id: 'wizard-vicuna-uncensored:13b', label: '🧙 WizardVicuna 13B',      group: 'Uncensored',  vision: false },
  { id: 'dolphin-mixtral:8x7b',         label: '🐬 Dolphin Mixtral',       group: 'Uncensored',  vision: false },
  { id: 'llava:7b',                     label: '👁 LLaVA 7B',              group: 'Vision',      vision: true  },
  { id: 'llava-llama3:8b',              label: '👁 LLaVA LLaMA3 8B',       group: 'Vision',      vision: true  },
  { id: 'llava-phi3:3.8b',              label: '👁 LLaVA Phi3 3.8B',       group: 'Vision',      vision: true  },
  { id: 'moondream:1.8b',               label: '👁 Moondream 1.8B',        group: 'Vision',      vision: true  },
  { id: 'minicpm-v:8b',                 label: '👁 MiniCPM-V 8B',          group: 'Vision',      vision: true  },
  { id: 'llama3.2:3b',                  label: '🦙 LLaMA 3.2 3B',          group: 'Standard',    vision: false },
  { id: 'llama3.1:8b',                  label: '🦙 LLaMA 3.1 8B',          group: 'Standard',    vision: false },
  { id: 'mistral:7b',                   label: '⚡ Mistral 7B',            group: 'Standard',    vision: false },
  { id: 'phi4:14b',                     label: '🔷 Phi-4 14B',             group: 'Standard',    vision: false },
  { id: 'gemma2:9b',                    label: '💎 Gemma 2 9B',            group: 'Standard',    vision: false },
  { id: 'qwen2.5:7b',                   label: '🌐 Qwen 2.5 7B',           group: 'Standard',    vision: false },
  { id: 'deepseek-r1:7b',               label: '🧠 DeepSeek R1 7B',        group: 'Standard',    vision: false },
  { id: 'deepseek-coder-v2:16b',        label: '💻 DeepSeek Coder 16B',    group: 'Standard',    vision: false },
];

function buildSys(name: string, user: string) {
  const tone       = localStorage.getItem('ai_tone')       || 'casual';
  const style      = localStorage.getItem('ai_style')      || 'companion';
  const traitsRaw  = localStorage.getItem('ai_traits');
  const traits     = traitsRaw ? JSON.parse(traitsRaw).join(', ') : 'loyal, funny, direct, caring';
  const customSys  = localStorage.getItem('ai_custom_sys') || '';
  const nameOvr    = localStorage.getItem('ai_name_override');
  const aiName     = nameOvr || name;

  let age='', location='', interests='', goals='', relationship='';
  try {
    const p = JSON.parse(localStorage.getItem('nexus_user_profile') || '{}');
    age=p.age||''; location=p.location||''; interests=p.interests||''; goals=p.goals||''; relationship=p.relationship||'';
  } catch {}

  const userContext = [
    age && `${user} is ${age} years old`,
    location && `lives in ${location}`,
    interests && `interests: ${interests}`,
    goals && `goals: ${goals}`,
    relationship && `relationship status: ${relationship}`,
  ].filter(Boolean).join('. ');

  return `You are ${aiName}, ${user}'s personal AI ${style}. Tone: ${tone}. Personality traits: ${traits}.
Be casual and direct. Match reply length to what's needed: short for simple chat/greetings (1-2 sentences), medium for questions (3-5 sentences), long only for roleplay/detailed topics/explanations when the user clearly wants depth. Never pad. No disclaimers.
${userContext ? `\nAbout ${user}: ${userContext}.` : ''}
${customSys ? `\nExtra instructions: ${customSys}` : ''}
You remember everything ${user} tells you and bring it up naturally. You are completely loyal to ${user} only.`;
}

const GEMINI_IDS: Record<string, string> = {
  '__gemini__':            'gemini-2.0-flash',
  '__gemini_flash__':      'gemini-2.0-flash',
  '__gemini_pro__':        'gemini-2.5-pro-preview-06-05',
  '__gemini_flash_lite__': 'gemini-3.1-flash-lite-preview',
  // legacy aliases
  '__gemini_flash_exp__':  'gemini-2.0-flash',
  '__gemini_flash25__':    'gemini-2.5-flash-preview-05-20',
};

const WAKE_WORDS = ['nexus', 'hey nexus', 'ok nexus', 'okay nexus', 'yo nexus'];
const isWakeWord = (text: string) => {
  const t = text.toLowerCase().trim().replace(/[^a-z ]/g, '');
  if (WAKE_WORDS.some(w => t === w || t.startsWith(w + ' ') || t.endsWith(' ' + w) || t.includes(' ' + w + ' '))) return true;
  return t.includes('nexus');
};
const stripWakeWord = (text: string) =>
  WAKE_WORDS.reduce((s, w) => s.replace(new RegExp(w, 'gi'), ''), text).trim();

export default function AISidebar() {
  const debugLog = (runId: string, hypothesisId: string, location: string, message: string, data: Record<string, unknown>) => {
    // #region agent log
    fetch('http://127.0.0.1:7260/ingest/5f56a8b4-730a-4b8c-8889-3fdd43644d03',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'037707'},body:JSON.stringify({sessionId:'037707',runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  };
  const { settings, userProfile, updateUserProfile } = useSettings();

  // Inject keyframe animations (avoids esbuild issue with <style> backtick blocks)
  React.useEffect(() => {
    const id = 'nexus-sidebar-anim';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = [
        '@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}',
        '@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}'
      ].join(' ');
      document.head.appendChild(s);
    }
  }, []);
  const [msgs, setMsgs]           = useState<Msg[]>([]);
  const [loading, setLoading]     = useState(false);
  const [model, setModel]         = useState(() => userProfile?.sidebarModel || 'gemma3:12b');
  const [muted, setMuted]         = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [listening, setListening] = useState(false);
  const [watching, setWatching]   = useState(false);
  const [screenshot, setScreenshot] = useState<string|null>(null);
  const [showModels, setShowModels] = useState(false);
  const [showSysEdit, setShowSysEdit] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [waveData, setWaveData]   = useState<number[]>(new Array(40).fill(0));
  const [transcript, setTranscript] = useState('');
  const [customSys, setCustomSys] = useState(() => localStorage.getItem('nexus_sidebar_sys') || '');
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [chatlogContext, setChatlogContext] = useState<string>('');
  const [wakeWordActive, setWakeWordActive] = useState(true);
  const [screenMonitor, setScreenMonitor] = useState(false);
  const [lastScreenDesc, setLastScreenDesc] = useState('');
  const [waitingForCommand, setWaitingForCommand] = useState(false);
  
  const sttRef           = useRef<ContinuousSTT | null>(null);
  const screenMonitorRef = useRef<any>(null);
  const screenRef        = useRef<MediaStream|null>(null);
  const watchTimer       = useRef<any>(null);
  const animRef          = useRef<any>(null);
  const analyserRef      = useRef<AnalyserNode|null>(null);
  const micStreamRef     = useRef<MediaStream|null>(null);
  const wakeActiveRef    = useRef(wakeWordActive);
  const waitingRef       = useRef(false);
  const scrollRef        = useRef<HTMLDivElement>(null);
  const hist             = useRef<Msg[]>([]);

  const aiName   = userProfile?.assistantName || 'Nexus';
  const userName = userProfile?.displayName   || userProfile?.name || 'User';

  const sttSupported = webSpeechSupported();

  useEffect(() => { wakeActiveRef.current = wakeWordActive; }, [wakeWordActive]);
  useEffect(() => { hist.current = msgs; }, [msgs]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs, loading]);
  useEffect(() => { if (userProfile?.sidebarModel) setModel(userProfile.sidebarModel); }, [userProfile?.sidebarModel]);
  useEffect(() => () => { stopListen(); stopWatch(); }, []);
  useEffect(() => {
    if (msgs.length > 1) localStorage.setItem('nexus_sidebar_msgs', JSON.stringify(msgs.slice(-40)));
  }, [msgs]);

  // Load chatlog + cross-app recent memory
  useEffect(() => {
    fetch('/api/chatlog/recent?lines=60')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.lines?.length > 0) setChatlogContext(d.lines.join('\n')); })
      .catch(() => {});

    // Also pull last few messages from Centre and Chat for continuity
    try {
      const centreMsgs = JSON.parse(localStorage.getItem('nexus_centre_msgs') || '[]');
      const chatSessions = JSON.parse(localStorage.getItem('nexus_chat_sessions') || '[]');
      const activeId = localStorage.getItem('nexus_chat_active_session_id');
      const activeSession = chatSessions.find((s: any) => s.id === activeId);
      const chatMsgs = activeSession?.messages || [];

      const recentCentre = centreMsgs.slice(-6)
        .filter((m: any) => m.role === 'user' || m.role === 'ai')
        .map((m: any) => `${m.role === 'user' ? 'User' : 'AI'}: ${String(m.content).slice(0, 200)}`)
        .join('\n');

      const recentChat = chatMsgs.slice(-4)
        .map((m: any) => `${m.role}: ${String(m.content).slice(0, 200)}`)
        .join('\n');

      if (recentCentre || recentChat) {
        const crossAppCtx = [
          recentCentre && `Recent Centre:\n${recentCentre}`,
          recentChat && `Recent Chat:\n${recentChat}`,
        ].filter(Boolean).join('\n\n');
        setChatlogContext(prev => prev ? `${prev}\n\n${crossAppCtx}` : crossAppCtx);
      }
    } catch {}
  }, []);

  // Fetch Ollama models
  useEffect(() => {
    const fetchOllama = async () => {
      try {
        let base = 'http://localhost:11434';
        try {
          const s = JSON.parse(localStorage.getItem('nexus_settings') || '{}');
          const host = (s?.ollama?.host || 'http://localhost').replace(/\/$/, '');
          const port = s?.ollama?.port || '11434';
          base = /:\d+$/.test(host) ? host : `${host}:${port}`;
        } catch {}
        const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = await res.json();
          setInstalledModels((data.models || []).map((m: any) => m.name as string));
        }
      } catch {}
    };
    fetchOllama();
  }, []);

  // Greeting / restore
  const [memories, setMemories] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('nexus_sidebar_memories') || '[]'); } catch { return []; }
  });
  const addMemory = (fact: string) => {
    setMemories(p => {
      const updated = [...p.slice(-49), fact];
      localStorage.setItem('nexus_sidebar_memories', JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    const saved = localStorage.getItem('nexus_sidebar_msgs');
    if (saved) {
      try {
        const parsed: Msg[] = JSON.parse(saved);
        if (parsed.length > 0) { setMsgs(parsed); hist.current = parsed; return; }
      } catch {}
    }
    const h = new Date().getHours();
    const g = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    const memNote = memories.length > 0 ? ` I remember ${memories.length} thing${memories.length > 1 ? 's' : ''} about you.` : '';
    const m: Msg = { role: 'assistant', content: `hey, what do you need?`, ts: Date.now(), isGreeting: true };
    setMsgs([m]); hist.current = [m];
  }, []);

  const addMsg = (role: 'user'|'assistant', content: string, sc?: string) => {
    const m: Msg = { role, content, screenshot: sc, ts: Date.now() };
    setMsgs(p => [...p, m]);
    hist.current = [...hist.current, m];
  };

  const tts = useCallback(async (text: string) => {
    if (muted) return;
    try {
      let elKey = localStorage.getItem('elevenlabs_api_key');
      if (!elKey) {
        try { const s = JSON.parse(localStorage.getItem('nexus_settings') || '{}'); elKey = s?.providers?.elevenLabs || null; } catch {}
      }
      if (elKey) { await speak(text.slice(0, 500)); return; }
    } catch {}
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 300));
    u.rate = 1.1; u.pitch = 1; speechSynthesis.speak(u);
  }, [muted]);

  // ── Screen capture ────────────────────────────────────────────────────────
  const capture = useCallback(async (): Promise<string|null> => {
    try {
      if (!screenRef.current || screenRef.current.getTracks()[0].readyState === 'ended') {
        screenRef.current = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 1, width: { ideal: 1920 }, height: { ideal: 1080 } } as any,
          audio: false,
        });
        screenRef.current.getTracks()[0].onended = () => {
          clearInterval(watchTimer.current); setWatching(false); setScreenshot(null);
        };
      }
      const track = screenRef.current.getVideoTracks()[0];
      if (!track || track.readyState !== 'live') return null;
      return await new Promise<string|null>((resolve) => {
        const video = document.createElement('video');
        video.srcObject = new MediaStream([track]);
        video.muted = true;
        video.onloadedmetadata = () => {
          video.play().then(() => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(null); return; }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            video.pause(); video.srcObject = null;
            resolve(canvas.toDataURL('image/jpeg', 0.6).split(',')[1] || null);
          }).catch(() => resolve(null));
        };
        video.onerror = () => resolve(null);
        setTimeout(() => resolve(null), 3000);
      });
    } catch { return null; }
  }, []);

  const stopWatch = () => {
    clearInterval(watchTimer.current);
    screenRef.current?.getTracks().forEach(t => t.stop()); screenRef.current = null;
    setWatching(false); setScreenshot(null);
  };

  const toggleWatch = useCallback(async () => {
    if (watching) { stopWatch(); addMsg('assistant', '👁 Screen watch stopped.'); return; }
    const sc = await capture();
    if (!sc) { addMsg('assistant', '⚠ Allow screen share when the browser asks.'); return; }
    setScreenshot(sc); setWatching(true);
    watchTimer.current = setInterval(async () => { const s = await capture(); if (s) setScreenshot(s); }, 8000);
    addMsg('assistant', '👁 Screen watch on -- I can see your screen. Every message includes it.');
  }, [watching, capture]);

  // Screen monitor
  const startScreenMonitor = async () => {
    if (screenMonitorRef.current) return;
    addMsg('assistant', '🖥️ Screen monitoring started.');
    screenMonitorRef.current = setInterval(async () => {
      const sc = await capture();
      if (!sc) return;
      setScreenshot(sc);
      try {
        const r = await getGeminiResponse('Describe what is on this screen in 2-3 sentences.', 'Screen monitor. Be concise.', 'gemini-3-flash-preview');
        const desc = typeof r === 'string' ? r : (r as any).text || '';
        if (desc && desc !== lastScreenDesc) {
          const changed = await getGeminiChatResponse(
            [{ role: 'user', content: `Previous: ${lastScreenDesc || 'nothing'}\nCurrent: ${desc}\nMeaningfully changed? If yes: 1 sentence comment. If no: reply NO_CHANGE` }],
            buildSys(aiName, userName), 'gemini-3-flash-preview'
          );
          if (changed && !changed.includes('NO_CHANGE')) { addMsg('assistant', `👁 ${changed}`); tts(changed); }
          setLastScreenDesc(desc);
        }
      } catch {}
    }, 8000);
  };

  const stopScreenMonitor = () => {
    clearInterval(screenMonitorRef.current); screenMonitorRef.current = null;
    addMsg('assistant', '🖥️ Screen monitoring stopped.'); setLastScreenDesc('');
  };

  const toggleScreenMonitor = async () => {
    if (screenMonitor) { stopScreenMonitor(); setScreenMonitor(false); }
    else {
      const sc = await capture();
      if (!sc) { addMsg('assistant', '⚠ Allow screen share first.'); return; }
      setScreenshot(sc); setWatching(true); setScreenMonitor(true); startScreenMonitor();
    }
  };

  // ── Waveform animation ─────────────────────────────────────────────────────
  const startWaveform = (stream: MediaStream) => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.7;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 80;
    src.connect(hp); hp.connect(analyser);
    analyserRef.current = analyser;
    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      const step = Math.floor(buf.length / 40);
      setWaveData(Array.from({ length: 40 }, (_, i) => buf[i * step] / 255));
    };
    draw();
  };

  const stopWaveform = () => {
    cancelAnimationFrame(animRef.current);
    setWaveData(new Array(40).fill(0));
  };

  // ── Send ──────────────────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    const sc = watching ? screenshot ?? undefined : undefined;
    addMsg('user', q, sc);
    setLoading(true);

    const baseSys = customSys || buildSys(aiName, userName);
    const memorySuffix = memories.length > 0
      ? `\n\nKNOWN FACTS ABOUT ${userName.toUpperCase()}:\n${memories.map(m => `- ${m}`).join('\n')}`
      : '';
    const chatlogSuffix = chatlogContext
      ? `\n\nRECENT LOG:\n${chatlogContext.split('\n').slice(-30).join('\n')}`
      : '';
    const sys = baseSys + memorySuffix + chatlogSuffix;

    fetch('/api/chatlog/append', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ role:'user', content:q, ts:Date.now() }) }).catch(()=>{});

    // Auto-extract personal facts
    const personalFacts = [
      { re: /i(?:'m| am)\s+(\d+)\s*(?:years?\s*old)?/i, fmt: (m: RegExpMatchArray) => `${userName} is ${m[1]} years old` },
      { re: /my name is\s+(\w+)/i,                        fmt: (m: RegExpMatchArray) => `${userName}'s name is ${m[1]}` },
      { re: /i\s+(?:live|stay)\s+in\s+([\w\s]{2,30})/i,  fmt: (m: RegExpMatchArray) => `${userName} lives in ${m[1]}` },
      { re: /remember\s+(?:that\s+)?(.{5,100})/i,         fmt: (m: RegExpMatchArray) => m[1] },
    ];
    for (const { re, fmt } of personalFacts) {
      const match = q.match(re);
      if (match) {
        const fact = fmt(match).trim();
        if (!memories.some(existing => existing.toLowerCase().includes(fact.toLowerCase().slice(0, 20)))) addMemory(fact);
        break;
      }
    }

    try {
      let reply = '';
      const geminiId = GEMINI_IDS[model];
      const isVisionModel = ALL_MODELS.find(m => m.id === model)?.vision ?? false;
      // #region agent log
      debugLog('pre-fix', 'H4', 'AISidebar.tsx:send:modelRoute', 'Sidebar model route decision', {
        model,
        geminiId: geminiId || null,
        hasInstalledLocalModels: installedModels.length > 0,
        watching,
        isVisionModel,
      });
      // #endregion

      if (geminiId) {
        // Enable web search for research queries
        const needsSearch = /latest|current|news|search|find|who is|what happened|today|this week/.test(q.toLowerCase());
        const tools = needsSearch ? [GEMINI_TOOLS.googleSearch] : undefined;
        const r = await getGeminiResponse(q, sys, geminiId, tools) as any;
        reply = typeof r === 'string' ? r : (r as any).text || '';
      } else {
        let ollamaModel = model;
        if (installedModels.length > 0) {
          const exact  = installedModels.find(n => n === model);
          const prefix = installedModels.find(n => n.startsWith(model.split(':')[0]));
          if (exact || prefix) ollamaModel = exact || prefix!;
        }

        let enrichedQ = q;
        if (sc && !isVisionModel) {
          try {
            const screenDesc = await getGeminiResponse('Describe what is on this screen in 2-3 sentences.', 'Screen reader. Be concise.', 'gemini-3-flash-preview');
            const desc = typeof screenDesc === 'string' ? screenDesc : (screenDesc as any).text || '';
            enrichedQ = `[Screen: ${desc}]\n\n${q}`;
          } catch {}
        }

        const ollamaHistory = hist.current.filter(m => !m.isGreeting).slice(-8).map(m => ({
          role: m.role as 'user'|'assistant',
          content: m.content,
          ...(m.screenshot && isVisionModel ? { images: [m.screenshot] } : {}),
        }));

        try {
          reply = await getOllamaChatResponse(
            [...ollamaHistory, { role: 'user' as const, content: enrichedQ, ...(sc && isVisionModel ? { images: [sc] } : {}) }],
            ollamaModel, sys
          );
        } catch (e: any) {
          reply = `⚠ Ollama error: ${e.message}. Is Ollama running and is "${ollamaModel}" pulled?`;
        }
      }

      addMsg('assistant', reply);
      tts(reply);
      fetch('/api/chatlog/append', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ role:aiName, content:reply, ts:Date.now() }) }).catch(()=>{});
      setChatlogContext(p => `${p}\n${q}\n${reply}`.split('\n').slice(-60).join('\n'));
    } catch (e: any) {
      addMsg('assistant', `⚠ ${e.message}`);
    }
    setLoading(false);
  }, [loading, model, aiName, userName, tts, watching, screenshot, customSys, installedModels, memories, chatlogContext]);

  // ── STT via Web Speech API ────────────────────────────────────────────────
  const stopListen = useCallback(() => {
    sttRef.current?.stop();
    sttRef.current = null;
    // Stop mic stream for waveform
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    stopWaveform();
    setListening(false);
    setTranscript('');
    setWaitingForCommand(false);
    waitingRef.current = false;
  }, []);

  const startListen = useCallback(async () => {
    if (listening) { stopListen(); return; }

    if (!sttSupported) {
      addMsg('assistant', '⚠ Web Speech API not supported. Please use Chromium/Chrome/Electron.');
      return;
    }

    // Start mic stream just for waveform visualizer (optional)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      micStreamRef.current = stream;
      startWaveform(stream);
    } catch { /* waveform optional */ }

    const lang = userProfile?.language?.slice(0, 5) || 'en-US';
    const stt = new ContinuousSTT(lang);

    stt.onStatus = (s) => {
      if (s === 'listening') setTranscript(wakeActiveRef.current ? '⚡ Say "Nexus" to activate...' : '🎤 Listening...');
      if (s === 'processing') setTranscript('⏳ Processing...');
    };

    stt.onResult = (raw: string) => {
      console.log('[STT]', raw);
      if (!raw || /^(the|a|an|and|or|but|\.+|\[.*\]|♪)\.?$/i.test(raw)) return;

      if (waitingRef.current) {
        // Command after wake word
        setTranscript('');
        waitingRef.current = false;
        setWaitingForCommand(false);
        send(raw);
        return;
      }

      if (wakeActiveRef.current) {
        if (isWakeWord(raw)) {
          const cmd = stripWakeWord(raw).trim();
          if (cmd.length > 3) {
            setTranscript('');
            send(cmd);
          } else {
            waitingRef.current = true;
            setWaitingForCommand(true);
            setTranscript('👂 Go ahead...');
          }
        }
        // No wake word -- ignore
      } else {
        // Open mic mode
        setTranscript('');
        send(raw);
      }
    };

    stt.onError = (e: string) => {
      const lower = (e || '').toLowerCase();
      if (lower.includes('network')) {
        addMsg('assistant', '⚠ STT network error -- check microphone permissions, use Chrome/Electron, or serve the app over HTTPS on mobile Safari.');
      } else if (lower.includes('not allowed') || lower.includes('permission')) {
        addMsg('assistant', '⚠ Microphone permission denied -- allow the browser to use the microphone and try again.');
      } else {
        addMsg('assistant', `⚠ ${e}`);
      }
      // Ensure waveform and mic are stopped on error
      try { micStreamRef.current?.getTracks().forEach((t:any) => t.stop()); } catch {}
      micStreamRef.current = null;
      stopWaveform();
      setListening(false);
      sttRef.current = null;
    };

    try {
      stt.start();
      sttRef.current = stt;
      setListening(true);
    } catch (err: any) {
      // Cleanup if start fails synchronously (permission denied, etc.)
      try { micStreamRef.current?.getTracks().forEach((t:any) => t.stop()); } catch {}
      micStreamRef.current = null;
      stopWaveform();
      setListening(false);
      sttRef.current = null;
      addMsg('assistant', `⚠ STT start failed: ${err?.message || String(err)}`);
    }
  }, [listening, stopListen, send, userProfile, sttSupported]);

  const saveModel = (m: string) => {
    setModel(m); updateUserProfile({ sidebarModel: m }); setShowModels(false);
  };

  const selectedModelDef = ALL_MODELS.find(m => m.id === model);
  const groups = [...new Set(ALL_MODELS.map(m => m.group))];

  // ── Collapsed ─────────────────────────────────────────────────────────────
  if (collapsed) return (
    <div style={{width:'40px',flexShrink:0,background:'#000',borderLeft:'1px solid rgba(99,102,241,0.15)',display:'flex',flexDirection:'column',alignItems:'center',paddingTop:'12px',gap:'8px'}}>
      <button onClick={() => setCollapsed(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#818cf8',padding:'6px',display:'flex',flexDirection:'column',alignItems:'center',gap:'6px'}}>
        <Bot size={16} style={{color:'#818cf8'}} />
        <ChevronLeft size={12} style={{color:'#4f46e5'}} />
      </button>
    </div>
  );

  return (
    <div style={{width:'320px',flexShrink:0,background:'#000',borderLeft:'1px solid rgba(99,102,241,0.15)',display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>

      {/* Header */}
      <div style={{padding:'10px 12px',borderBottom:'1px solid rgba(255,255,255,0.04)',background:'rgba(5,3,20,0.95)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <div style={{width:'30px',height:'30px',borderRadius:'8px',background:'linear-gradient(135deg,rgba(79,70,229,0.4),rgba(139,92,246,0.3))',border:'1px solid rgba(99,102,241,0.5)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 10px rgba(79,70,229,0.3)'}}>
            <Bot size={14} style={{color:'#a5b4fc'}} />
          </div>
          <div>
            <div style={{fontSize:'12px',fontWeight:700,color:'white',lineHeight:1}}>{aiName}</div>
            <div style={{fontSize:'8px',color:'#10b981',fontFamily:'monospace',marginTop:'2px',letterSpacing:'1px',textTransform:'uppercase'}}>
              {selectedModelDef?.label.split(' ').slice(1).join(' ') || model} .{' '}
              {sttSupported
                ? <span style={{color:'#10b981'}}>🎤 Speech Ready</span>
                : <span style={{color:'#ef4444'}}>🎤 No Speech API</span>}
            </div>
          </div>
        </div>
        <div style={{display:'flex',gap:'2px'}}>
          <button onClick={() => setShowModels(p=>!p)} style={{background:showModels?'rgba(99,102,241,0.2)':'none',border:'none',cursor:'pointer',color:showModels?'#818cf8':'#4b5563',padding:'5px',borderRadius:'6px'}} title="Switch model"><Settings size={11}/></button>
          <button onClick={() => setShowSysEdit(p=>!p)} style={{background:showSysEdit?'rgba(99,102,241,0.2)':'none',border:'none',cursor:'pointer',color:showSysEdit?'#818cf8':'#4b5563',padding:'5px',borderRadius:'6px'}} title="Edit system prompt"><Edit2 size={11}/></button>
          <button onClick={() => setShowMemory(p=>!p)} style={{background:showMemory?'rgba(16,185,129,0.2)':'none',border:'none',cursor:'pointer',color:showMemory?'#10b981':'#4b5563',padding:'5px',borderRadius:'6px',position:'relative'}} title="Memory">
            <Brain size={11}/>
            {memories.length > 0 && <span style={{position:'absolute',top:'1px',right:'1px',width:'5px',height:'5px',borderRadius:'50%',background:'#10b981'}}/>}
          </button>
          <button onClick={toggleWatch} style={{background:watching?'rgba(16,185,129,0.15)':'none',border:'none',cursor:'pointer',color:watching?'#10b981':'#4b5563',padding:'5px',borderRadius:'6px'}} title="Watch screen">
            {watching ? <MonitorOff size={11}/> : <Monitor size={11}/>}
          </button>
          <button onClick={toggleScreenMonitor} style={{background:screenMonitor?'rgba(139,92,246,0.2)':'none',border:'none',cursor:'pointer',color:screenMonitor?'#a78bfa':'#4b5563',padding:'5px',borderRadius:'6px',position:'relative'}} title="Constant screen monitor">
            <Activity size={11}/>
            {screenMonitor && <span style={{position:'absolute',top:'1px',right:'1px',width:'4px',height:'4px',borderRadius:'50%',background:'#a78bfa'}}/>}
          </button>
          <button onClick={() => setWakeWordActive(p=>!p)}
            style={{background:wakeWordActive?'rgba(251,191,36,0.2)':'none',border:'none',cursor:'pointer',
              color:wakeWordActive?'#fbbf24':'#4b5563',padding:'5px',borderRadius:'6px',position:'relative'}}
            title={wakeWordActive ? 'Wake word ON -- say "Nexus"' : 'Wake word OFF -- open mic'}>
            <Zap size={11}/>
            {wakeWordActive && <span style={{position:'absolute',top:'1px',right:'1px',width:'4px',height:'4px',borderRadius:'50%',background:'#fbbf24'}}/>}
          </button>
          <button onClick={async()=>{const sc=await capture();if(sc){setScreenshot(sc);await send('Describe my screen.');}}} style={{background:'none',border:'none',cursor:'pointer',color:'#4b5563',padding:'5px',borderRadius:'6px'}} title="Screenshot"><Camera size={11}/></button>
          <button onClick={()=>setMuted(p=>!p)} style={{background:'none',border:'none',cursor:'pointer',color:'#4b5563',padding:'5px',borderRadius:'6px'}}>
            {muted?<VolumeX size={11}/>:<Volume2 size={11}/>}
          </button>
          <button onClick={()=>{setMsgs([]);hist.current=[];localStorage.removeItem('nexus_sidebar_msgs');}} style={{background:'none',border:'none',cursor:'pointer',color:'#4b5563',padding:'5px',borderRadius:'6px'}} title="Clear chat"><Trash2 size={11}/></button>
          <button onClick={()=>setCollapsed(true)} style={{background:'none',border:'none',cursor:'pointer',color:'#4b5563',padding:'5px',borderRadius:'6px'}}><ChevronRight size={11}/></button>
        </div>
      </div>

      {/* Model picker */}
      {showModels && (
        <div style={{borderBottom:'1px solid rgba(255,255,255,0.04)',background:'rgba(3,2,15,0.98)',padding:'8px',flexShrink:0,maxHeight:'280px',overflowY:'auto'}}>
          {installedModels.length > 0 && (
            <div>
              <div style={{fontSize:'8px',color:'#10b981',fontWeight:700,letterSpacing:'2px',textTransform:'uppercase',padding:'4px 6px 2px'}}>OK Installed (Ollama)</div>
              {installedModels.map(name => (
                <button key={name} onClick={()=>saveModel(name)} style={{width:'100%',textAlign:'left',padding:'5px 8px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'11px',marginBottom:'1px', background:model===name?'rgba(16,185,129,0.2)':'transparent', color:model===name?'#6ee7b7':'#6b7280', outline:model===name?'1px solid rgba(16,185,129,0.3)':'none'}}>
                  🦙 {name}
                </button>
              ))}
            </div>
          )}
          {groups.map(g => (
            <div key={g}>
              <div style={{fontSize:'8px',color:'#374151',fontWeight:700,letterSpacing:'2px',textTransform:'uppercase',padding:'4px 6px 2px'}}>{g}</div>
              {ALL_MODELS.filter(m=>m.group===g).map(m=>{
                const isInstalled = installedModels.some(n => n.startsWith(m.id.split(':')[0]));
                return (
                  <button key={m.id} onClick={()=>saveModel(m.id)} style={{width:'100%',textAlign:'left',padding:'5px 8px',borderRadius:'6px',border:'none',cursor:'pointer',fontSize:'11px',marginBottom:'1px', background:model===m.id?'rgba(99,102,241,0.2)':'transparent', color:model===m.id?'#a5b4fc':g==='Cloud'?'#6b7280':'#4b5563', outline:model===m.id?'1px solid rgba(99,102,241,0.3)':'none', opacity: g==='Cloud' ? 1 : isInstalled ? 1 : 0.4}}>
                    {m.label}
                    {m.vision&&<span style={{fontSize:'8px',color:'#0284c7',marginLeft:'4px'}}>vision</span>}
                    {g!=='Cloud' && !isInstalled && <span style={{fontSize:'7px',color:'#4b5563',marginLeft:'4px'}}>not installed</span>}
                    {g!=='Cloud' && isInstalled && <span style={{fontSize:'7px',color:'#10b981',marginLeft:'4px'}}>OK</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* System prompt editor */}
      {showSysEdit && (
        <div style={{borderBottom:'1px solid rgba(255,255,255,0.04)',background:'rgba(3,2,15,0.98)',padding:'8px',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'5px'}}>
            <span style={{fontSize:'8px',color:'#6366f1',fontFamily:'monospace',letterSpacing:'1px',textTransform:'uppercase'}}>System Prompt</span>
            <div style={{display:'flex',gap:'4px'}}>
              <button onClick={() => { localStorage.setItem('nexus_sidebar_sys', customSys); setShowSysEdit(false); }}
                style={{fontSize:'9px',background:'rgba(99,102,241,0.3)',border:'1px solid rgba(99,102,241,0.4)',color:'#a5b4fc',padding:'2px 7px',borderRadius:'4px',cursor:'pointer'}}>Save</button>
              <button onClick={() => { setCustomSys(''); localStorage.removeItem('nexus_sidebar_sys'); }}
                style={{fontSize:'9px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',color:'#6b7280',padding:'2px 7px',borderRadius:'4px',cursor:'pointer'}}>Reset</button>
              <button onClick={() => setShowSysEdit(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#4b5563',padding:'2px'}}><X size={10}/></button>
            </div>
          </div>
          <textarea value={customSys} onChange={e => setCustomSys(e.target.value)}
            placeholder={buildSys(aiName, userName)} rows={4}
            style={{width:'100%',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'6px',
              padding:'6px 8px',fontSize:'10px',color:'#cbd5e1',fontFamily:'monospace',resize:'vertical',outline:'none',
              lineHeight:'1.5',boxSizing:'border-box'}}
          />
          <p style={{fontSize:'8px',color:'#374151',marginTop:'3px'}}>Leave blank to use default. Click Save to apply.</p>
        </div>
      )}

      {/* Memory panel */}
      {showMemory && (
        <div style={{borderBottom:'1px solid rgba(255,255,255,0.04)',background:'rgba(3,2,15,0.98)',padding:'8px',flexShrink:0,maxHeight:'220px',overflowY:'auto'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'5px'}}>
            <span style={{fontSize:'8px',color:'#10b981',fontFamily:'monospace',letterSpacing:'1px',textTransform:'uppercase'}}>
              Memory . {memories.length} facts
            </span>
            <div style={{display:'flex',gap:'4px'}}>
              <button onClick={() => { setMemories([]); localStorage.removeItem('nexus_sidebar_memories'); }}
                style={{fontSize:'9px',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.2)',color:'#f87171',padding:'2px 7px',borderRadius:'4px',cursor:'pointer'}}>Clear facts</button>
              <button onClick={() => { fetch('/api/chatlog',{method:'DELETE'}).catch(()=>{}); setChatlogContext(''); }}
                style={{fontSize:'9px',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.2)',color:'#f87171',padding:'2px 7px',borderRadius:'4px',cursor:'pointer'}}>Clear log</button>
              <button onClick={() => setShowMemory(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#4b5563',padding:'2px'}}><X size={10}/></button>
            </div>
          </div>
          {memories.length === 0
            ? <p style={{fontSize:'9px',color:'#374151',fontFamily:'monospace'}}>No pinned facts yet. Tell me something about yourself.</p>
            : memories.map((m, i) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:'4px',marginBottom:'3px'}}>
                <span style={{fontSize:'9px',color:'#6ee7b7',fontFamily:'monospace',flex:1,lineHeight:'1.4'}}>{m}</span>
                <button onClick={() => { const u=memories.filter((_,j)=>j!==i); setMemories(u); localStorage.setItem('nexus_sidebar_memories',JSON.stringify(u)); }}
                  style={{background:'none',border:'none',cursor:'pointer',color:'#374151',padding:'1px',flexShrink:0}}><X size={9}/></button>
              </div>
            ))
          }
          <div style={{marginTop:'6px',borderTop:'1px solid rgba(255,255,255,0.05)',paddingTop:'5px'}}>
            <input
              placeholder="Add a memory manually..."
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                  addMemory((e.target as HTMLInputElement).value.trim());
                  (e.target as HTMLInputElement).value = '';
                }
              }}
              style={{width:'100%',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',
                borderRadius:'5px',padding:'4px 7px',fontSize:'9px',color:'#cbd5e1',fontFamily:'monospace',outline:'none',boxSizing:'border-box'}}
            />
          </div>
        </div>
      )}

      {/* Screen watch bar */}
      {watching && (
        <div style={{display:'flex',alignItems:'center',gap:'6px',padding:'5px 10px',background:'rgba(16,185,129,0.05)',borderBottom:'1px solid rgba(16,185,129,0.1)',flexShrink:0}}>
          <div style={{width:'5px',height:'5px',borderRadius:'50%',background:'#10b981',animation:'pulse 1s infinite'}}/>
          <span style={{fontSize:'8px',color:'#10b981',fontFamily:'monospace',letterSpacing:'1px',textTransform:'uppercase',flex:1}}>Screen active</span>
          {screenshot&&<img src={`data:image/jpeg;base64,${screenshot}`} style={{height:'20px',borderRadius:'3px',border:'1px solid rgba(16,185,129,0.2)',cursor:'pointer'}} onClick={()=>send('What changed on my screen?')} alt="screen"/>}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{flex:1,overflowY:'auto',padding:'12px',display:'flex',flexDirection:'column',gap:'8px',minHeight:0}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:'flex',flexDirection:'column',maxWidth:'88%',alignSelf:m.role==='user'?'flex-end':'flex-start',gap:'2px'}}>
            {m.screenshot&&<img src={`data:image/jpeg;base64,${m.screenshot}`} style={{width:'100%',maxHeight:'60px',objectFit:'cover',borderRadius:'6px',border:'1px solid rgba(255,255,255,0.06)',marginBottom:'3px'}} alt="screen"/>}
            <div style={{padding:'9px 12px',borderRadius:'12px',fontSize:'12px',lineHeight:'1.55',background:m.role==='user'?'linear-gradient(135deg,#4338ca,#6366f1)':'rgba(255,255,255,0.04)',color:m.role==='user'?'white':'#cbd5e1',borderTopRightRadius:m.role==='user'?'3px':'12px',borderTopLeftRadius:m.role==='user'?'12px':'3px',border:m.role==='user'?'none':'1px solid rgba(255,255,255,0.05)',boxShadow:m.role==='user'?'0 2px 12px rgba(79,70,229,0.25)':'none'}}>{m.content}</div>
            <div style={{fontSize:'8px',color:'#1e293b',textAlign:m.role==='user'?'right':'left'}}>
              {new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
            </div>
          </div>
        ))}
        {loading&&(
          <div style={{display:'flex',gap:'4px',alignSelf:'flex-start',padding:'6px 10px',background:'rgba(255,255,255,0.03)',borderRadius:'10px',border:'1px solid rgba(255,255,255,0.05)'}}>
            {[0,1,2].map(i=><div key={i} style={{width:'5px',height:'5px',borderRadius:'50%',background:'#6366f1',animation:`bounce 0.6s ${i*0.15}s infinite`}}/>)}
          </div>
        )}
      </div>

      {/* Waveform visualizer */}
      <div style={{height:'56px',background:'rgba(3,2,15,0.8)',borderTop:'1px solid rgba(255,255,255,0.03)',display:'flex',alignItems:'center',justifyContent:'center',gap:'2px',padding:'0 12px',flexShrink:0,position:'relative'}}>
        {transcript && (
          <div style={{position:'absolute',top:'4px',left:'12px',right:'12px',fontSize:'9px',color:'#818cf8',fontFamily:'monospace',textOverflow:'ellipsis',overflow:'hidden',whiteSpace:'nowrap',textAlign:'center'}}>
            {transcript}
          </div>
        )}
        {waveData.map((v,i)=>(
          <div key={i} style={{width:'4px',height:`${Math.max(3,v*44)}px`,borderRadius:'2px',background:listening?`rgba(${Math.round(99+v*100)},${Math.round(102-v*50)},241,${0.4+v*0.6})`:'rgba(99,102,241,0.15)',transition:'height 0.05s ease',flexShrink:0}}/>
        ))}
        {!listening && !transcript && (
          <div style={{position:'absolute',fontSize:'9px',color:'#1e293b',fontFamily:'monospace',letterSpacing:'1px',textTransform:'uppercase'}}>
            {!sttSupported ? '⚠ Speech API not available' : wakeWordActive ? '⚡ say "Nexus" to activate' : 'tap mic to speak'}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{borderTop:'1px solid rgba(255,255,255,0.04)',background:'rgba(3,2,15,0.95)',flexShrink:0}}>
        <div style={{padding:'10px 12px',display:'flex',alignItems:'center',justifyContent:'center',gap:'12px'}}>
          <button onClick={()=>setMuted(p=>!p)} style={{background:'none',border:'none',cursor:'pointer',color:'#4b5563',padding:'4px'}}>
            {muted?<VolumeX size={14}/>:<Volume2 size={14}/>}
          </button>

          <button
            onClick={startListen}
            disabled={!sttSupported}
            style={{
              width:'56px', height:'56px', borderRadius:'50%', border:'none', cursor: sttSupported ? 'pointer' : 'not-allowed',
              display:'flex', alignItems:'center', justifyContent:'center',
              background: !sttSupported
                ? '#1e293b'
                : listening
                  ? 'radial-gradient(circle,#dc2626,#991b1b)'
                  : 'radial-gradient(circle,#4f46e5,#3730a3)',
              boxShadow: listening
                ? '0 0 20px rgba(220,38,38,0.6), 0 0 40px rgba(220,38,38,0.3)'
                : '0 0 16px rgba(79,70,229,0.5), 0 0 30px rgba(79,70,229,0.2)',
              transition: 'all 0.2s',
              transform: listening ? 'scale(1.05)' : 'scale(1)',
              opacity: sttSupported ? 1 : 0.5,
            }}>
            {listening ? <MicOff size={20} style={{color:'white'}}/> : <Mic size={20} style={{color:'white'}}/>}
          </button>

          <div style={{fontSize:'8px',color:'#374151',fontFamily:'monospace',letterSpacing:'1px',textTransform:'uppercase'}}>
            {listening ? (waitingForCommand ? 'speak now...' : 'listening...') : 'tap mic'}
          </div>
        </div>

        {/* Text fallback */}
        <div style={{display:'flex',gap:'6px',padding:'0 10px 10px'}}>
          <input
            value={transcript.startsWith('⚡') || transcript.startsWith('🎤') || transcript.startsWith('👂') || transcript.startsWith('⏳') ? '' : transcript}
            onChange={e => setTranscript(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && transcript.trim() && !transcript.startsWith('⚡') && !transcript.startsWith('🎤')) { const t = transcript.trim(); setTranscript(''); send(t); } }}
            placeholder="Or type here..."
            style={{
              flex:1, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)',
              borderRadius:'8px', padding:'6px 10px', fontSize:'11px', color:'#cbd5e1',
              outline:'none', fontFamily:'inherit',
            }}
          />
          <button
            onClick={() => { const t = transcript.trim(); if (t && !t.startsWith('⚡') && !t.startsWith('🎤')) { setTranscript(''); send(t); } }}
            style={{background:'rgba(79,70,229,0.6)',border:'none',borderRadius:'8px',padding:'6px 10px',cursor:'pointer',color:'white',fontSize:'11px',display:'flex',alignItems:'center',gap:'4px'}}>
            <Send size={11}/>
          </button>
        </div>
      </div>


    </div>

  );
}

