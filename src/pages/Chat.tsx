import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, Settings as SettingsIcon, Trash2, Plus, Search,
  FileSpreadsheet, Presentation, Brain, ChevronDown,
  MessageSquare, Users, Zap, X, Phone, PhoneOff, Mic, MicOff,
  Wrench
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { getGeminiResponse, getOllamaResponse, GEMINI_TOOLS, getGlobalSystemPrompt } from '../services/api';
import { speak, stopSpeaking } from '../services/elevenlabs';
import { Message, ChatSession } from '../types';
import { cn } from '../lib/utils';
import { useSettings } from '../context/SettingsContext';
import { getToolSystemPrompt, processToolCalls, NEXUS_TOOLS } from '../services/nexusTools';
import {
  ingestMessageForMemory,
  getSharedMemoryPrompt,
  loadSharedMemory,
  setSharedMemory,
  removeSharedMemory,
} from '../services/persistentMemory';

// Web Speech API types
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function Chat() {
  const getSettingsDefaultModel = () => {
    try {
      const s = JSON.parse(localStorage.getItem('nexus_settings') || '{}');
      return String(s?.defaultModel || '').trim() || 'mdq100/Gemma3-Instruct-Abliterated:12b';
    } catch {
      return 'mdq100/Gemma3-Instruct-Abliterated:12b';
    }
  };

  const debugLog = (runId: string, hypothesisId: string, location: string, message: string, data: Record<string, unknown>) => {
    // #region agent log
    fetch('http://127.0.0.1:7260/ingest/5f56a8b4-730a-4b8c-8889-3fdd43644d03',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'037707'},body:JSON.stringify({sessionId:'037707',runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  };

  React.useEffect(() => {
    const id = 'nexus-chat-anim';
    if (!document.getElementById(id)) {
      const s = document.createElement('style');
      s.id = id;
      s.textContent = '@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}';
      document.head.appendChild(s);
    }
  }, []);
  const [sessions, setSessions]       = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput]             = useState(localStorage.getItem('nexus_chat_input') || '');
  const [isLoading, setIsLoading]     = useState(false);
  const [webSearch, setWebSearch]     = useState(false);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [toolCallResults, setToolCallResults] = useState<{id: string; tool: string; result: string}[]>([]);
  const [selectedModel, setSelectedModel] = useState(getSettingsDefaultModel());
  const [voiceEnabled, setVoiceEnabled] = useState(localStorage.getItem('voice_enabled') === 'true');
  const [isSpeaking, setIsSpeaking]   = useState(false);
  const [isThinking, setIsThinking]   = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'sessions' | 'memory'>('sessions');
  const [sharedMemory, setSharedMemoryState] = useState<Record<string, string>>(() => loadSharedMemory());
  const [memoryKey, setMemoryKey] = useState('');
  const [memoryValue, setMemoryValue] = useState('');
  // Call state 
  const [inCall, setInCall]           = useState(false);
  const [callStatus, setCallStatus]   = useState('');
  const [callTranscript, setCallTranscript] = useState('');
  const callActiveRef = useRef(false);
  const callRecRef    = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { models } = useSettings();
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  const updateSystemPrompt = (newPrompt: string) => {
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, systemPrompt: newPrompt } : s));
  };

  useEffect(() => {
    const saved = localStorage.getItem('nexus_chat_sessions');
    const savedActiveId = localStorage.getItem('nexus_chat_active_session_id');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSessions(parsed);
      setActiveSessionId(savedActiveId || (parsed.length > 0 ? parsed[0].id : null));
    } else {
      createNewSession();
    }
  }, []);

  useEffect(() => { if (sessions.length > 0) { localStorage.setItem('nexus_chat_sessions', JSON.stringify(sessions)); scrollToBottom(); } }, [sessions]);
  useEffect(() => { if (activeSessionId) localStorage.setItem('nexus_chat_active_session_id', activeSessionId); }, [activeSessionId]);
  useEffect(() => { localStorage.setItem('nexus_chat_input', input); }, [input]);
  useEffect(() => {
    const refresh = () => setSharedMemoryState(loadSharedMemory());
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === 'nexus_shared_memory' || e.key === 'nexus_agent_memory') refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Cleanup call on unmount
  useEffect(() => () => { endCall(); }, []);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const createNewSession = (projectId?: string) => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Conversation',
      messages: [],
      projectId,
      systemPrompt: getGlobalSystemPrompt()
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  // AI Call with Web Speech API 
  const webSpeechSupported = (): boolean =>
    typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const endCall = useCallback(() => {
    callActiveRef.current = false;
    try { callRecRef.current?.stop(); callRecRef.current?.abort(); } catch {}
    callRecRef.current = null;
    stopSpeaking();
    setInCall(false);
    setCallTranscript('');
    setCallStatus('');
  }, []);

  const startCall = useCallback(async () => {
    if (!webSpeechSupported()) {
      alert('Voice calls require Web Speech API (Chromium/Electron). Not supported in this browser.');
      return;
    }

    setInCall(true);
    callActiveRef.current = true;
    setCallStatus('Starting call...');

    const SpeechRecognitionCls = window.SpeechRecognition || window.webkitSpeechRecognition;

    const callLoop = () => {
      if (!callActiveRef.current) return;

      const rec = new SpeechRecognitionCls();
      callRecRef.current = rec;
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      setCallStatus('🎤 Listening... speak now');

      rec.onresult = async (e: any) => {
        const text = e.results[0]?.[0]?.transcript?.trim();
        if (!text || !callActiveRef.current) return;

        setCallTranscript(text);
        setCallStatus('🤔 Thinking...');

        try {
          // Get AI response
          const sysPrompt = activeSession?.systemPrompt;
          const r = await getGeminiResponse(text, sysPrompt, selectedModel);
          const reply = (r as any)?.text || String(r) || '';

          if (!callActiveRef.current) return;
          setCallStatus('🔊 Speaking...');
          setCallTranscript(text);

          await speak(reply);

          if (callActiveRef.current) callLoop();
        } catch (err: any) {
          if (callActiveRef.current) {
            setCallStatus('⚠ Error -- retrying...');
            setTimeout(callLoop, 1500);
          }
        }
      };

      rec.onerror = (e: any) => {
        if (!callActiveRef.current) return;
        if (e.error === 'no-speech' || e.error === 'aborted') {
          // Restart on silence
          setTimeout(callLoop, 300);
          return;
        }
        setCallStatus(`Error: ${e.error}`);
        setTimeout(callLoop, 2000);
      };

      rec.onend = () => {
        // onresult fires before onend so this handles the no-result case
        if (callActiveRef.current && callStatus !== '🤔 Thinking...' && callStatus !== '🔊 Speaking...') {
          setTimeout(callLoop, 300);
        }
      };

      try { rec.start(); } catch { if (callActiveRef.current) setTimeout(callLoop, 500); }
    };

    callLoop();
  }, [activeSession, selectedModel, callStatus]);

  // Text chat 
  const handleSend = async () => {
    if (!input.trim() || !activeSessionId || isLoading) return;

    const userText = input.trim();
    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: userText, timestamp: Date.now() };
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, userMessage] } : s));
    ingestMessageForMemory(userText, 'chat');
    setSharedMemoryState(loadSharedMemory());

    // Auto-title the session after first message
    if (activeSession?.messages.length === 0) {
      const title = userText.slice(0, 40) + (userText.length > 40 ? '...' : '');
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, title } : s));
    }

    setInput('');
    setIsLoading(true);
    setIsThinking(true);

    try {
      // #region agent log
      debugLog('pre-fix', 'H1', 'Chat.tsx:handleSend:start', 'Chat send started', {
        selectedModel,
        usesGeminiBranch: selectedModel.startsWith('gemini'),
        hasLocalModels: models.length > 0,
      });
      // #endregion
      let response: { text: string; reasoning?: string };
      const baseSystemPrompt = activeSession?.systemPrompt || '';
      const memoryPrompt = getSharedMemoryPrompt(24);
      // Inject tool system prompt if tools are enabled
      const systemPrompt = toolsEnabled
        ? baseSystemPrompt + memoryPrompt + '\n\n' + getToolSystemPrompt()
        : baseSystemPrompt + memoryPrompt;

      if (selectedModel.startsWith('gemini')) {
        // #region agent log
        debugLog('pre-fix', 'H2', 'Chat.tsx:handleSend:gemini', 'Using cloud branch in Chat', {
          selectedModel,
          webSearch,
          toolsEnabled,
        });
        // #endregion
        // Auto tool selection no manual toggles needed
        const t = input.toLowerCase();
        const tools: any[] = [];
        const needsSearch = /latest|current|news|today|this week|search for|find|who is|what is|price|when did|recent|2024|2025|2026/.test(t);
        const needsExec   = /run this|calculate|compute|test (this|the)|what.*output|result of/.test(t);
        if (needsSearch || webSearch) tools.push(GEMINI_TOOLS.googleSearch);
        if (needsExec)  tools.push(GEMINI_TOOLS.codeExecution);
        const r = await getGeminiResponse(userText, systemPrompt, selectedModel, tools.length ? tools : undefined) as any;
        response = { text: r?.text || '', reasoning: r?.reasoning || '' };
        if (r?.sources?.length) {
          response.text += '\n\n---\n📎 Sources:\n' + r.sources.slice(0,5).map((s: string) => `- ${s}`).join('\n');
        }
      } else {
        // #region agent log
        debugLog('pre-fix', 'H3', 'Chat.tsx:handleSend:ollama', 'Using local branch in Chat', {
          selectedModel,
          hasSystemPrompt: Boolean(systemPrompt),
        });
        // #endregion
        const text = await getOllamaResponse(userText, selectedModel, systemPrompt);
        response = { text, reasoning: '' };
      }

      setIsThinking(false);

      // Process tool calls in the response
      let finalText = response.text.replace(/\[ACTION:\w+\]/g, '').replace(/\[CLOTHES:\w+\]/g, '').trim();
      if (toolsEnabled) {
        const { displayText, toolResults, hasTools } = await processToolCalls(finalText);
        if (hasTools) {
          finalText = displayText;
          // Append tool results as formatted blocks
          if (toolResults.length > 0) {
            const toolBlock = toolResults.map(tr =>
              `\n\n🔧 **${tr.tool.emoji} ${tr.tool.name}**\n\`\`\`\n${tr.result}\n\`\`\``
            ).join('');
            finalText += toolBlock;
            setToolCallResults(prev => [
              ...prev,
              ...toolResults.map(tr => ({ id: Date.now().toString() + tr.tool.id, tool: tr.tool.name, result: tr.result }))
            ]);
          }
        }
      }

      if (voiceEnabled) {
        setIsSpeaking(true);
        speak(finalText, () => setIsSpeaking(false));
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: finalText, timestamp: Date.now(), reasoning: response.reasoning
      };
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, assistantMessage] } : s));
    } catch (error: any) {
      setIsThinking(false);
      const errMsg: Message = {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: `⚠ Error: ${error.message || 'Something went wrong'}`, timestamp: Date.now()
      };
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, errMsg] } : s));
    } finally {
      setIsLoading(false);
      setIsThinking(false);
    }
  };

  return (
    <div className="flex h-full bg-slate-950">

      {/* Call overlay */}
      {inCall && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center gap-8">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center">
              <Mic className="w-10 h-10 text-emerald-400" />
            </div>
            {/* Pulse rings */}
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500/30 animate-ping" />
            <div className="absolute -inset-3 rounded-full border border-emerald-500/15 animate-ping" style={{animationDelay:'0.3s'}} />
          </div>
          <div className="text-center space-y-2">
            <p className="text-white text-2xl font-bold tracking-tight">AI Call Active</p>
            <p className="text-emerald-400 text-sm font-mono">{callStatus || '...'}</p>
            {callTranscript && (
              <div className="mt-3 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl max-w-sm">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">You said</p>
                <p className="text-white text-sm">{callTranscript}</p>
              </div>
            )}
          </div>
          <button onClick={endCall} className="flex items-center gap-2 px-8 py-4 bg-red-500 hover:bg-red-400 text-white rounded-full font-bold text-base transition-all shadow-lg shadow-red-500/30">
            <PhoneOff className="w-5 h-5" /> End Call
          </button>
          <p className="text-slate-600 text-xs">Powered by Web Speech API + {selectedModel}</p>
        </div>
      )}

      {/* Sessions Sidebar */}
      <div className="hidden md:flex w-72 border-r border-white/5 flex-col bg-slate-900/20">
        <div className="p-4 space-y-3">
          <button onClick={() => createNewSession()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-sm font-bold hover:bg-indigo-500/20 transition-all">
            <Plus className="w-4 h-4" /> New Chat
          </button>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/30 border border-white/5 rounded-xl">
            <button onClick={() => setSidebarTab('sessions')}
              className={cn("px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                sidebarTab === 'sessions' ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-slate-500 hover:text-white")}>
              Chats
            </button>
            <button onClick={() => setSidebarTab('memory')}
              className={cn("px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                sidebarTab === 'memory' ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-slate-500 hover:text-white")}>
              Memory
            </button>
          </div>
        </div>
        {sidebarTab === 'sessions' ? (
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {sessions.map(session => (
              <button key={session.id} onClick={() => setActiveSessionId(session.id)}
                className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition-all group",
                  activeSessionId === session.id ? "bg-white/5 text-white border border-white/10" : "text-slate-500 hover:text-slate-300")}>
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span className="truncate flex-1">{session.title}</span>
                <Trash2 onClick={e => { e.stopPropagation(); setSessions(prev => prev.filter(s => s.id !== session.id)); }}
                  className="w-4 h-4 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity" />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Shared Memory</p>
            <div className="space-y-2">
              <input
                value={memoryKey}
                onChange={e => setMemoryKey(e.target.value)}
                placeholder="Key (e.g. user.name)"
                className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-2.5 py-2 text-[11px] text-white focus:outline-none"
              />
              <textarea
                value={memoryValue}
                onChange={e => setMemoryValue(e.target.value)}
                rows={2}
                placeholder="Value"
                className="w-full bg-slate-900/70 border border-white/10 rounded-lg px-2.5 py-2 text-[11px] text-white focus:outline-none resize-none"
              />
              <button
                onClick={() => {
                  if (!memoryKey.trim() || !memoryValue.trim()) return;
                  setSharedMemory(memoryKey, memoryValue);
                  setSharedMemoryState(loadSharedMemory());
                  setMemoryKey('');
                  setMemoryValue('');
                }}
                className="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold transition-all"
              >
                Save Memory
              </button>
            </div>
            <div className="space-y-1.5">
              {Object.entries(sharedMemory).filter(([k]) => !k.startsWith('meta.')).length === 0 ? (
                <p className="text-[10px] text-slate-600 italic py-3 text-center">No memory yet</p>
              ) : (
                Object.entries(sharedMemory)
                  .filter(([k]) => !k.startsWith('meta.'))
                  .map(([k, v]) => (
                    <div key={k} className="bg-white/5 border border-white/5 rounded-lg p-2.5">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold text-indigo-300 truncate">{k}</p>
                          <p className="text-[11px] text-slate-300 mt-0.5 break-words">{v}</p>
                        </div>
                        <button
                          onClick={() => {
                            removeSharedMemory(k);
                            setSharedMemoryState(loadSharedMemory());
                          }}
                          className="text-slate-500 hover:text-red-400 transition-colors"
                          title="Delete memory"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col relative min-w-0">

        {/* Header */}
        <div className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-slate-950/50 backdrop-blur-xl z-20">
          <div className="flex items-center gap-4">
            <div className="relative">
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                className="appearance-none bg-slate-800 border border-white/10 text-white text-xs font-mono rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:border-indigo-500/50 transition-colors">
                <optgroup label="☁ Gemini 3 (Cloud)" className="bg-slate-900">
                  <option value="mdq100/Gemma3-Instruct-Abliterated:12b">* Gemini 3 Flash</option>
                  <option value="mdq100/Gemma3-Instruct-Abliterated:12b">* Gemini 3.1 Pro</option>
                  <option value="gemini-3.1-flash-lite-preview">* Gemini 3.1 Flash Lite</option>
                </optgroup>
                <optgroup label="💎 Gemma 3 (Local)" className="bg-slate-900">
                  <option value="mdq100/Gemma3-Instruct-Abliterated:12b">🔥 Gemma 3 12B Abliterated ★</option>
                  <option value="gemma3:12b">💎 Gemma 3 12B</option>
                  <option value="gemma3:4b">💎 Gemma 3 4B</option>
                  <option value="gemma3:27b">💎 Gemma 3 27B</option>
                </optgroup>
                <optgroup label="🦙 All Local Ollama" className="bg-slate-900">
                  {models.length > 0
                    ? models.map(m => <option key={m.name} value={m.name}>{m.name.replace(/^hf\.co\/[^/]+\//,'').replace(/^[^/]+\//,'')}</option>)
                    : <option disabled>No local models -- run ollama pull gemma3:12b</option>
                  }
                </optgroup>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>

            <button onClick={() => setWebSearch(!webSearch)}
              className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all",
                webSearch ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-white/5 text-slate-500 border border-white/5")}>
              <Search className="w-3 h-3" />
              {webSearch ? '🌐 Search: Force ON' : '🌐 Search: Auto'}
            </button>

            <button onClick={() => setToolsEnabled(!toolsEnabled)}
              className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all",
                toolsEnabled ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" : "bg-white/5 text-slate-500 border border-white/5")}
              title={`${NEXUS_TOOLS.length} tools available -- AI will call them when needed`}>
              <Wrench className="w-3 h-3" />
              {toolsEnabled ? `🔧 Tools: ON (${NEXUS_TOOLS.length})` : '🔧 Tools: OFF'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Voice toggle */}
            <div className="flex items-center gap-3 px-3 py-1.5 bg-white/5 border border-white/5 rounded-xl">
              <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center border transition-all", voiceEnabled ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" : "bg-white/5 border-white/5 text-slate-600")}>
                <Zap className="w-3 h-3" />
              </div>
              <button onClick={() => { const n = !voiceEnabled; setVoiceEnabled(n); localStorage.setItem('voice_enabled', String(n)); }}
                className={cn("w-8 h-4 rounded-full relative transition-colors", voiceEnabled ? "bg-emerald-500" : "bg-slate-700")}>
                <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", voiceEnabled ? "left-[18px]" : "left-0.5")} />
              </button>
              <span className="text-[9px] font-bold text-white uppercase tracking-widest">Voice</span>
            </div>

            {/* Call button */}
            <button onClick={inCall ? endCall : startCall} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all", inCall ? "bg-red-500/20 border-red-500/30 text-red-400 animate-pulse" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20")}>
              {inCall ? <PhoneOff className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
              {inCall ? 'End Call' : 'Call AI'}
            </button>

            <button onClick={() => setShowSettingsModal(true)} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all">
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {activeSession?.messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
              <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-4 border border-indigo-500/20">
                <Brain className="w-8 h-8 text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">NexusAI Chat Studio</h3>
              <p className="text-sm text-slate-400 max-w-xs">
                Start a conversation. Hit <strong className="text-emerald-400">Call AI</strong> for a real-time voice call.
              </p>
            </div>
          )}

          {activeSession?.messages.map((msg) => (
            <div key={msg.id} className={cn("flex gap-4 max-w-4xl mx-auto", msg.role === 'user' ? "flex-row-reverse" : "")}>
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border", msg.role === 'user' ? "bg-blue-500/20 border-blue-500/30" : "bg-indigo-500/20 border-indigo-500/30")}>
                {msg.role === 'user' ? <Users className="w-4 h-4 text-blue-400" /> : <Zap className="w-4 h-4 text-indigo-400" />}
              </div>
              <div className={cn("flex-1 space-y-2", msg.role === 'user' ? "text-right" : "")}>
                <div className={cn("inline-block p-4 rounded-2xl text-sm leading-relaxed text-left max-w-full overflow-hidden break-words", msg.role === 'user' ? "bg-blue-500/10 text-blue-50 border border-blue-500/20" : "bg-white/5 text-slate-200 border border-white/5")}>
                  <div className="prose prose-invert max-w-none prose-sm overflow-x-auto">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex gap-4 max-w-4xl mx-auto">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border bg-indigo-500/20 border-indigo-500/30">
                <Zap className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex items-center gap-1.5 px-4 py-3 bg-white/5 border border-white/5 rounded-2xl">
                {[0,1,2].map(i=><div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400" style={{animation:`bounce 0.6s ${i*0.15}s infinite`}}/>)}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-6 bg-slate-950/50 backdrop-blur-xl border-t border-white/5">
          <div className="max-w-4xl mx-auto relative">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Message NexusAI..."
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 pr-32 focus:outline-none focus:border-indigo-500/50 transition-all resize-none h-16 max-h-64 custom-scrollbar text-sm"
            />
            <div className="absolute right-3 bottom-3 flex items-center gap-2">
              <button className="p-2 text-slate-500 hover:text-white transition-colors"><FileSpreadsheet className="w-5 h-5" /></button>
              <button className="p-2 text-slate-500 hover:text-white transition-colors"><Presentation className="w-5 h-5" /></button>
              <button onClick={handleSend} disabled={isLoading || !input.trim()} className={cn("p-2 rounded-xl transition-all", isLoading || !input.trim() ? "bg-white/5 text-slate-700" : "bg-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)]")}>
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* System Prompt Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}}
              className="bg-slate-900 border border-indigo-500/30 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
              <div className="h-12 border-b border-white/5 flex items-center justify-between px-6 bg-slate-950/50">
                <div className="flex items-center gap-2 text-indigo-400 font-mono text-[10px] uppercase tracking-widest font-bold">
                  <SettingsIcon className="w-4 h-4" /> Chat Configuration
                </div>
                <button onClick={() => setShowSettingsModal(false)} className="text-slate-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block">System Prompt</label>
                  <textarea value={activeSession?.systemPrompt || ''} onChange={e => updateSystemPrompt(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm text-slate-300 focus:outline-none focus:border-indigo-500/50 h-48 resize-none font-mono" />
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setShowSettingsModal(false)}
                    className="px-6 py-2 bg-indigo-500 text-white rounded-xl text-sm font-bold hover:bg-indigo-400 transition-all">
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* animations via useEffect */}
    </div>
  );
}

