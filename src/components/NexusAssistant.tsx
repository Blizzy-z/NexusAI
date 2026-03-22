import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { Mic, MicOff, Volume2, VolumeX, X, Minimize2, Sparkles, Brain, User, Loader, MessageSquare } from 'lucide-react';
import { getGeminiResponse } from '../services/api';
import { speak } from '../services/elevenlabs';
import { useSettings } from '../context/SettingsContext';

interface Message { role: 'user'|'assistant'; text: string; ts: number; }
type AState = 'idle'|'listening'|'thinking'|'speaking'|'error';

async function getVoiceFingerprint(blob: Blob): Promise<number[]> {
  try {
    const buf = await blob.arrayBuffer();
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const bands = 16;
    const sz = Math.floor(data.length / bands);
    return Array.from({ length: bands }, (_, i) => {
      const s = data.slice(i * sz, (i + 1) * sz);
      return Math.sqrt(s.reduce((a: number, v: number) => a + v * v, 0) / s.length);
    });
  } catch { return []; }
}

function cosineSim(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 1;
  const dot = a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return magA && magB ? dot / (magA * magB) : 1;
}

export default function NexusAssistant({ onClose }: { onClose: () => void }) {
  const debugLog = (runId: string, hypothesisId: string, location: string, message: string, data: Record<string, unknown>) => {
    // #region agent log
    fetch('http://127.0.0.1:7260/ingest/5f56a8b4-730a-4b8c-8889-3fdd43644d03',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'037707'},body:JSON.stringify({sessionId:'037707',runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  };
  const { settings, userProfile } = useSettings();
  const [state, setState] = useState<AState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState('');
  const [muted, setMuted] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [waveAnim, setWaveAnim] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const histRef = useRef<Message[]>([]);
  const transcriptRef = useRef('');

  const name = userProfile.assistantName || 'Nexus';
  const user = userProfile.displayName || userProfile.name || 'User';

  useEffect(() => { histRef.current = messages; }, [messages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  const addMsg = (role: 'user'|'assistant', text: string) => {
    const m: Message = { role, text, ts: Date.now() };
    setMessages(p => [...p, m]);
    histRef.current = [...histRef.current, m];
  };

  const tts = useCallback(async (text: string) => {
    if (muted) { setState('idle'); return; }
    setState('speaking');
    const apiKey = settings.providers.elevenLabs;
    const voiceId = userProfile.elevenLabsVoice || settings.providers.elevenLabsVoice || '21m00Tcm4TlvDq8ikWAM';
    if (apiKey) {
      await speak(text, () => setState('idle'), voiceId);
    } else {
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 1.05; utt.pitch = 1;
      utt.onend = () => setState('idle');
      speechSynthesis.speak(utt);
    }
  }, [muted, settings.providers.elevenLabs, userProfile.elevenLabsVoice]);

  const handleQuery = useCallback(async (text: string) => {
    addMsg('user', text);
    setState('thinking');
    const sys = `You are ${name}, a concise personal AI voice assistant for ${user}.
Personality: ${userProfile.assistantPersonality || 'helpful, direct, and friendly'}.
${userProfile.bio ? `User bio: ${userProfile.bio}` : ''}
${userProfile.occupation ? `User's occupation: ${userProfile.occupation}` : ''}
Keep answers SHORT (1-3 sentences max for voice). Be conversational and warm.
Current time: ${new Date().toLocaleTimeString()}. Date: ${new Date().toLocaleDateString()}.
History of this session: ${histRef.current.slice(-6).map(m => `${m.role}: ${m.text}`).join(' | ')}`;
    try {
      // #region agent log
      debugLog('pre-fix', 'H5', 'NexusAssistant.tsx:handleQuery', 'NexusAssistant always using Gemini path', {
        hasGeminiKey: Boolean(settings.providers.gemini),
        assistantName: name,
      });
      // #endregion
      const r = await getGeminiResponse(text, sys);
      const reply = typeof r === 'string' ? r : (r as any).text || 'I had trouble thinking.';
      const clean = reply.replace(/\*+/g, '').replace(/`+/g, '').trim();
      addMsg('assistant', clean);
      await tts(clean);
    } catch {
      const err = "Sorry, I couldn't reach the AI right now.";
      addMsg('assistant', err);
      await tts(err);
    }
  }, [name, user, userProfile, tts]);

  const verifyVoice = useCallback(async (blob: Blob): Promise<boolean> => {
    if (!userProfile.voiceEnrolled || !userProfile.voiceId) return true;
    const enrolled = userProfile.voiceId.split(',').map(Number);
    const current = await getVoiceFingerprint(blob);
    const sim = cosineSim(enrolled, current);
    return sim > 0.65;
  }, [userProfile]);

  const startListening = useCallback(async () => {
    if (state !== 'idle') return;
    setVerifyError('');
    setState('listening');
    setWaveAnim(true);
    setTranscript('');
    transcriptRef.current = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg' });
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.start();
      mrRef.current = mr;

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) { setState('error'); setVerifyError('Speech recognition not supported. Use Chrome.'); return; }
      const rec = new SR();
      rec.lang = userProfile.language || 'en-US';
      rec.interimResults = true;
      rec.continuous = false;
      recRef.current = rec;

      rec.onresult = (e: any) => {
        const t = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('');
        setTranscript(t);
        transcriptRef.current = t;
      };

      rec.onend = async () => {
        setWaveAnim(false);
        mr.stop();
        stream.getTracks().forEach(t => t.stop());
        mr.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const verified = await verifyVoice(blob);
          if (!verified) {
            setVerifyError(`Voice not recognized. Only ${user} can use ${name}.`);
            setState('idle');
            return;
          }
          const q = transcriptRef.current.trim();
          if (q) handleQuery(q);
          else setState('idle');
        };
      };

      rec.onerror = () => { setWaveAnim(false); setState('idle'); };
      rec.start();
    } catch (e: any) {
      setState('error');
      setVerifyError('Microphone denied: ' + (e.message || ''));
      setWaveAnim(false);
    }
  }, [state, userProfile.language, verifyVoice, handleQuery, user, name]);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    mrRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // Greeting
  useEffect(() => {
    const h = new Date().getHours();
    const g = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    const msg = `Good ${g}, ${user}. I'm ${name}. How can I help?`;
    setTimeout(() => {
      addMsg('assistant', msg);
      if (!muted) tts(msg);
    }, 500);
  }, []);

  const stateColor = { idle: 'bg-indigo-500', listening: 'bg-red-500', thinking: 'bg-amber-500', speaking: 'bg-emerald-500', error: 'bg-red-600' }[state];
  const stateLabel = { idle: 'Ready', listening: 'Listening...', thinking: 'Thinking...', speaking: 'Speaking...', error: 'Error' }[state];

  if (minimized) return (
    <motion.button onClick={() => setMinimized(false)} initial={{ scale: 0 }} animate={{ scale: 1 }}
      className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 rounded-full shadow-2xl flex items-center justify-center z-[500] border-2 border-indigo-400/50">
      <Sparkles className="w-6 h-6 text-white" />
      <div className={cn('absolute top-1 right-1 w-3 h-3 rounded-full border border-slate-900', stateColor)} />
    </motion.button>
  );

  return (
    <motion.div initial={{ x: 340, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 340, opacity: 0 }}
      transition={{ type: 'spring', damping: 20 }}
      className="fixed right-0 top-0 bottom-0 w-80 bg-[#0a0a12] border-l border-white/8 flex flex-col z-[400] shadow-2xl">

      {/* Header */}
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 bg-gradient-to-r from-indigo-950/60 to-[#0a0a12] shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 bg-indigo-500/20 border border-indigo-500/40 rounded-xl flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </div>
            <div className={cn('absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#0a0a12]', stateColor)} />
          </div>
          <div>
            <p className="text-xs font-bold text-white">{name}</p>
            <p className="text-[9px] text-indigo-400/70 font-mono">{stateLabel}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setMuted(p => !p)} className="p-2 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-all">
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setMinimized(true)} className="p-2 text-slate-500 hover:text-white rounded-lg hover:bg-white/5">
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-red-400 rounded-lg hover:bg-white/5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {messages.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={cn('flex gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 bg-indigo-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3 h-3 text-indigo-400" />
              </div>
            )}
            <div className={cn('max-w-[220px] px-3 py-2 rounded-2xl text-xs leading-relaxed', m.role === 'user' ? 'bg-indigo-500/20 text-indigo-100 border border-indigo-500/20' : 'bg-white/5 text-slate-300 border border-white/5')}>
              {m.text}
            </div>
            {m.role === 'user' && (
              <div className="w-6 h-6 bg-slate-700 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs">
                {userProfile.avatar || '🧑'}
              </div>
            )}
          </motion.div>
        ))}
        {state === 'thinking' && (
          <div className="flex gap-2">
            <div className="w-6 h-6 bg-indigo-500/20 rounded-lg flex items-center justify-center shrink-0">
              <Sparkles className="w-3 h-3 text-indigo-400" />
            </div>
            <div className="bg-white/5 border border-white/5 px-3 py-2 rounded-2xl flex gap-1 items-center">
              {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
            </div>
          </div>
        )}
        {transcript && state === 'listening' && (
          <div className="text-center text-[10px] text-slate-500 italic">{transcript}</div>
        )}
        <div ref={endRef} />
      </div>

      {/* Voice wave visualization */}
      <AnimatePresence>
        {waveAnim && (
          <motion.div initial={{ height: 0 }} animate={{ height: 56 }} exit={{ height: 0 }}
            className="shrink-0 flex items-center justify-center gap-1 bg-red-950/20 border-t border-red-900/30 overflow-hidden px-4">
            {Array.from({ length: 16 }).map((_, i) => (
              <motion.div key={i}
                className="w-1 bg-red-400 rounded-full"
                animate={{ height: [4, Math.random() * 28 + 8, 4] }}
                transition={{ duration: 0.5 + Math.random() * 0.5, repeat: Infinity, delay: i * 0.05 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {verifyError && (
        <div className="mx-4 mb-2 p-2 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] text-red-400 text-center shrink-0">
          {verifyError}
        </div>
      )}

      {/* Mic button */}
      <div className="shrink-0 p-4 border-t border-white/5 flex flex-col items-center gap-3">
        <motion.button
          onMouseDown={startListening}
          onMouseUp={state === 'listening' ? stopListening : undefined}
          onTouchStart={startListening}
          onTouchEnd={state === 'listening' ? stopListening : undefined}
          onClick={state === 'idle' ? startListening : state === 'listening' ? stopListening : undefined}
          whileTap={{ scale: 0.92 }}
          className={cn('w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg border-2',
            state === 'listening' ? 'bg-red-500 border-red-400 shadow-red-500/30 shadow-xl' :
            state === 'thinking' ? 'bg-amber-500/20 border-amber-500/40' :
            state === 'speaking' ? 'bg-emerald-500/20 border-emerald-500/40' :
            'bg-indigo-500/20 border-indigo-500/40 hover:bg-indigo-500/30')}>
          {state === 'thinking' ? <Loader className="w-6 h-6 text-amber-400 animate-spin" /> :
           state === 'speaking' ? <Volume2 className="w-6 h-6 text-emerald-400 animate-pulse" /> :
           state === 'listening' ? <MicOff className="w-6 h-6 text-white" /> :
           <Mic className="w-6 h-6 text-indigo-400" />}
        </motion.button>
        <p className="text-[9px] text-slate-600 font-mono uppercase tracking-widest">
          {state === 'idle' ? 'Hold or click to speak' :
           state === 'listening' ? 'Release to send' :
           state === 'speaking' ? `${name} is speaking...` : stateLabel}
        </p>
        {userProfile.voiceEnrolled && (
          <p className="text-[8px] text-indigo-500/50 font-mono">🔒 Voice ID active</p>
        )}
      </div>
    </motion.div>
  );
}
