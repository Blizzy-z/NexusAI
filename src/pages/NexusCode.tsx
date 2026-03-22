import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Code, Terminal as TerminalIcon, Eye, Download, Plus, Folder,
  FileText, Send, Brain, Zap, X, FileCode, Trash2, RefreshCw,
  Play, Save, Copy, ChevronRight, Check, Sparkles, Settings,
  ChevronDown, FolderOpen, File
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { getGeminiResponse, getOllamaChatResponse } from '../services/api';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import Editor from '@monaco-editor/react';

// ── Types ──────────────────────────────────────────────────────────────────────
type Lang = 'python' | 'javascript' | 'typescript' | 'html' | 'css' | 'json' | 'bash' | 'markdown' | 'rust' | 'go';
interface ProjectFile {
  id: string;
  name: string;
  content: string;
  lang: Lang;
  folder?: string;
  saved?: boolean;
}
interface ChatMsg { role: 'user' | 'ai' | 'system'; text: string; ts: number; }

const LANG_COLORS: Record<Lang, string> = {
  python: 'text-blue-400', javascript: 'text-yellow-400', typescript: 'text-blue-300',
  html: 'text-orange-400', css: 'text-purple-400', json: 'text-green-400',
  bash: 'text-emerald-400', markdown: 'text-slate-400', rust: 'text-orange-500', go: 'text-cyan-400',
};

const LANG_EXT: Record<Lang, string> = {
  python: 'py', javascript: 'js', typescript: 'ts', html: 'html', css: 'css',
  json: 'json', bash: 'sh', markdown: 'md', rust: 'rs', go: 'go',
};

const DEFAULT_FILES: ProjectFile[] = [
  { id: 'main', name: 'main.py', lang: 'python', content: '# Welcome to Nexus Code\n# Your AI-powered development environment\n\nprint("Hello from NexusAI! 🚀")\n', saved: true },
  { id: 'index', name: 'index.html', lang: 'html', content: '<!DOCTYPE html>\n<html>\n<head>\n  <title>NexusAI</title>\n</head>\n<body>\n  <h1>Hello World</h1>\n</body>\n</html>\n', saved: true },
];

function langFromName(name: string): Lang {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, Lang> = { py:'python', js:'javascript', ts:'typescript', html:'html', css:'css', json:'json', sh:'bash', md:'markdown', rs:'rust', go:'go' };
  return map[ext] || 'python';
}

// ── File Icon ──────────────────────────────────────────────────────────────────
function FileIcon({ lang, className }: { lang: Lang; className?: string }) {
  return <FileCode className={cn('w-3.5 h-3.5', LANG_COLORS[lang], className)} />;
}

// ── Simple syntax-highlighted display ─────────────────────────────────────────
function CodeDisplay({ code, lang }: { code: string; lang: Lang }) {
  return (
    <div className="relative w-full h-full overflow-auto bg-[#0d1117] custom-scrollbar">
      <pre className="p-5 text-sm font-mono leading-relaxed text-slate-300 whitespace-pre-wrap min-h-full">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function NexusCode() {
  const [files, setFiles]             = useState<ProjectFile[]>(() => {
    try { return JSON.parse(localStorage.getItem('nexuscode_files') || 'null') || DEFAULT_FILES; } catch { return DEFAULT_FILES; }
  });
  const [activeFileId, setActiveFileId] = useState(files[0]?.id || 'main');
  const [chatMsgs, setChatMsgs]       = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]     = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [viewMode, setViewMode]       = useState<'code' | 'preview' | 'terminal'>('code');
  const [sideTab, setSideTab]         = useState<'files' | 'chat'>('chat');
  const [newFileName, setNewFileName] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);
  const [copied, setCopied]           = useState(false);
  const [model, setModel]             = useState('mdq100/Gemma3-Instruct-Abliterated:12b');
  const [aiModel, setAiModel]         = useState('mdq100/Gemma3-Instruct-Abliterated:12b');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [running, setRunning]         = useState(false);
  const [runOutput, setRunOutput]     = useState('');
  const [suggestion, setSuggestion]   = useState<{ text: string; lang: Lang } | null>(null);

  const termRef    = useRef<HTMLDivElement>(null);
  const xtermRef   = useRef<Terminal | null>(null);
  const fitRef     = useRef<FitAddon | null>(null);
  const wsRef      = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const editorRef  = useRef<any>(null);
  const monacoRef  = useRef<any>(null);

  const activeFile = files.find(f => f.id === activeFileId) || files[0];

  // Persist files
  useEffect(() => { localStorage.setItem('nexuscode_files', JSON.stringify(files)); }, [files]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);

  // Fetch Ollama models
  useEffect(() => {
    fetch('/api/nexuslink/ollama-models').then(r => r.json())
      .then(d => { if (d.models?.length) setOllamaModels(d.models); }).catch(() => {});
  }, []);

  // Terminal
  useEffect(() => {
    if (viewMode !== 'terminal' || !termRef.current || xtermRef.current) return;
    const term = new Terminal({ cursorBlink: true, fontFamily: '"JetBrains Mono", monospace', fontSize: 13, theme: { background: '#0d1117', foreground: '#e6edf3', cursor: '#58a6ff' } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
    fit.fit();
    xtermRef.current = term;
    fitRef.current = fit;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/terminal`);
    wsRef.current = ws;
    ws.onopen  = () => term.write('\x1b[32m⚡ Nexus Code Terminal\x1b[0m\r\n$ ');
    ws.onmessage = e => term.write(e.data);
    ws.onclose   = () => term.write('\r\n\x1b[31m[disconnected]\x1b[0m');
    term.onData(d => ws.readyState === WebSocket.OPEN && ws.send(d));

    return () => { ws.close(); term.dispose(); xtermRef.current = null; };
  }, [viewMode]);

  const updateFile = (id: string, content: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, content, saved: false } : f));
  };

  const saveFile = (id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, saved: true } : f));
  };

  const addFile = () => {
    if (!newFileName.trim()) return;
    const lang = langFromName(newFileName);
    const newFile: ProjectFile = { id: Date.now().toString(), name: newFileName.trim(), lang, content: '', saved: true };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
    setNewFileName('');
    setShowNewFile(false);
    setSideTab('chat');
  };

  const deleteFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    if (activeFileId === id) setActiveFileId(files.find(f => f.id !== id)?.id || '');
  };

  const copyCode = () => {
    navigator.clipboard.writeText(activeFile?.content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = activeFile.name;
    a.click();
  };

  const runCode = async () => {
    if (!activeFile || running) return;
    setRunning(true);
    setRunOutput('Running...');
    try {
      const lang = activeFile.lang;
      if (lang === 'python') {
        const r = await fetch('/api/agent/exec', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: `python -c "${activeFile.content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`, timeout: 15000 })
        });
        const reader = r.body?.getReader(); let out = '';
        if (reader) { const dec = new TextDecoder(); while (true) { const { value, done } = await reader.read(); if (done) break; out += dec.decode(value, { stream: true }); } }
        setRunOutput(out || '(no output)');
      } else if (lang === 'javascript' || lang === 'typescript') {
        const r = await fetch('/api/agent/exec', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: `node -e "${activeFile.content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`, timeout: 15000 })
        });
        const reader = r.body?.getReader(); let out = '';
        if (reader) { const dec = new TextDecoder(); while (true) { const { value, done } = await reader.read(); if (done) break; out += dec.decode(value, { stream: true }); } }
        setRunOutput(out || '(no output)');
      } else {
        setRunOutput(`▶ Run not supported for ${lang} in browser. Use the terminal.`);
      }
    } catch (e: any) {
      setRunOutput('Error: ' + e.message);
    }
    setRunning(false);
  };

  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput('');
    setChatMsgs(m => [...m, { role: 'user', text, ts: Date.now() }]);
    setChatLoading(true);

    const fileCtx = activeFile
      ? `\n\nCurrent file: ${activeFile.name} (${activeFile.lang})\n\`\`\`${activeFile.lang}\n${activeFile.content.slice(0, 3000)}\n\`\`\``
      : '';

    const sys = `You are an expert coding assistant inside NexusAI -- a personal AI development environment. Be concise and practical. When writing code, always put it in a fenced code block with the language tag. If the user asks you to write or fix code, write the complete updated file content.${fileCtx}`;

    try {
      let reply = '';
      if (aiModel.startsWith('gemini')) {
        const r = await getGeminiResponse(text, sys, aiModel) as any;
        reply = r?.text || String(r);
        setChatMsgs(m => [...m, { role: 'ai', text: reply, ts: Date.now() }]);
      } else {
        // Stream via server SSE proxy
        const streamReq = await fetch('/api/ai/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: aiModel, messages: [{ role: 'user', content: text }], system: sys }) });
        if (!streamReq.ok) {
          const eText = await streamReq.text().catch(() => streamReq.statusText || 'Stream error');
          throw new Error(eText);
        }

        const reader = (streamReq.body as any)?.getReader?.();
        const dec = new TextDecoder();
        // Insert an empty AI message and capture its index
        let aiIndex = -1;
        setChatMsgs(prev => { aiIndex = prev.length; return [...prev, { role: 'ai', text: '', ts: Date.now() }]; });

        if (reader) {
          let buffer = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = dec.decode(value, { stream: true });
            buffer += chunk;
            // SSE events are separated by double newlines
            const parts = buffer.split('\n\n');
            // Leave last partial in buffer
            buffer = parts.pop() || '';
            for (const part of parts) {
              // Each part may contain lines like "data: ..." or other fields
              const lines = part.split('\n');
              for (const line of lines) {
                if (!line.trim()) continue;
                if (line.startsWith('data:')) {
                  let data = line.replace(/^data:\s?/, '');
                  if (data === '[DONE]') {
                    // noop
                  } else {
                    // Server encoded newlines as \\n                    data = data.replace(/\\n/g, '\n');
                    // Append to reply and update AI message
                    reply += data;
                    setChatMsgs(prev => {
                      const copy = [...prev];
                      if (aiIndex >= 0 && copy[aiIndex]) copy[aiIndex] = { ...copy[aiIndex], text: reply };
                      return copy;
                    });
                    // Also update suggestion live preview
                    setSuggestion({ text: reply, lang: activeFile.lang });
                  }
                }
              }
            }
          }
        } else {
          reply = await streamReq.text();
          setChatMsgs(m => [...m, { role: 'ai', text: reply, ts: Date.now() }]);
        }
      }

      // Handle code blocks: suggest by default, auto-apply only for explicit 'apply' intent
      const codeMatch = reply.match(/```(?:\w+)?\n([\s\S]*?)```/);
      if (codeMatch && activeFile) {
        const intent = text.toLowerCase();
        const explicitApply = intent.includes('apply') || intent.includes('force') || intent.includes('overwrite');
        if (explicitApply) {
          setFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, content: codeMatch[1], saved: false } : f));
          setChatMsgs(m => [...m, { role: 'system', text: `✅ Applied to ${activeFile.name}`, ts: Date.now() }]);
        } else {
          // Present as a suggestion (ghost text) rather than overwriting
          setSuggestion({ text: codeMatch[1], lang: activeFile.lang });
          setChatMsgs(m => [...m, { role: 'system', text: `💡 Suggestion available for ${activeFile.name} — accept to apply.`, ts: Date.now() }]);
        }
      }
    } catch (e: any) {
      setChatMsgs(m => [...m, { role: 'system', text: `❌ ${e.message}`, ts: Date.now() }]);
    }
    setChatLoading(false);
  }, [chatInput, chatLoading, activeFile, aiModel]);

  const acceptSuggestion = () => {
    if (!activeFile || !suggestion) return;
    setFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, content: suggestion.text, saved: false } : f));
    setChatMsgs(m => [...m, { role: 'system', text: `✅ Applied suggestion to ${activeFile.name}`, ts: Date.now() }]);
    setSuggestion(null);
  };

  const rejectSuggestion = () => {
    setSuggestion(null);
    setChatMsgs(m => [...m, { role: 'system', text: `✖ Suggestion dismissed`, ts: Date.now() }]);
  };

  // --- Monaco ghost-text content widget and keyboard shortcut ---
  useEffect(() => {
    // inject minimal ghost-text CSS once
    if (!document.getElementById('nexus-ghost-css')) {
      const style = document.createElement('style');
      style.id = 'nexus-ghost-css';
      style.innerHTML = `
        .nexus-ghost { color: #6ee7b7; opacity: 0.9; font-family: "JetBrains Mono", monospace; font-size: 13px; white-space: pre; }
        .nexus-ghost .nexus-ghost-inner { background: rgba(2,16,32,0.6); padding: 6px; border-radius: 6px; max-height: 220px; overflow:auto; }
      `;
      document.head.appendChild(style);
    }

    if (!editorRef.current || !monacoRef.current) return;
    // Content widget object
    let widgetId = 'nexus-ghost-widget';
    const createWidget = (text: string) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      const position = editor.getPosition() || { lineNumber: 1, column: 1 };
      const dom = document.createElement('div');
      dom.className = 'nexus-ghost';
      dom.innerHTML = `<div class="nexus-ghost-inner"><pre style="margin:0">${escapeHtml(text)}</pre></div>`;
      const widget: any = {
        getId: () => widgetId,
        getDomNode: () => dom,
        getPosition: () => ({ position, preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE, monaco.editor.ContentWidgetPositionPreference.BELOW] })
      };
      try { editor.addContentWidget(widget); return widget; } catch { return null; }
    };

    const removeWidget = () => {
      try { editorRef.current.removeContentWidget({ getId: () => 'nexus-ghost-widget' }); } catch {}
    };

    // helper to escape HTML
    function escapeHtml(s: string) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    if (suggestion) {
      // create or update widget
      removeWidget();
      createWidget(suggestion.text.length > 1000 ? suggestion.text.slice(0,1000) + '...' : suggestion.text);
    } else {
      removeWidget();
    }

    // Register keyboard shortcut: Ctrl/Cmd+Enter to accept suggestion
    const mon = monacoRef.current;
    const keybinding = mon?.KeyMod?.CtrlCmd ? (mon.KeyMod.CtrlCmd | mon.KeyCode.Enter) : null;
    let disposable: any = null;
    try {
      if (keybinding && editorRef.current && mon) {
        const cmdId = editorRef.current.addCommand(keybinding, () => { acceptSuggestion(); });
        disposable = cmdId;
      }
    } catch { }

    return () => {
      removeWidget();
      // dispose keyboard shortcut if possible
      try { if (disposable && editorRef.current) editorRef.current.removeCommand?.(disposable); } catch {}
    };
  }, [suggestion, editorRef.current, monacoRef.current]);

  const aiRefactor = async () => {
    if (!activeFile || chatLoading) return;
    setChatLoading(true);
    try {
      const sys = `You are a code refactoring assistant. Return the full updated file content for ${activeFile.name} inside a single fenced code block only.`;
      const prompt = `Refactor and improve the following file. Return ONLY the complete file content in a single fenced code block.\n\nFilename: ${activeFile.name}\n\n${activeFile.content}`;
      let reply = '';
      if (aiModel.startsWith('gemini')) {
        const r = await getGeminiResponse(prompt, sys, aiModel) as any; reply = r?.text || String(r);
      } else {
        reply = await getOllamaChatResponse([{ role: 'user', content: prompt }], aiModel, sys);
      }
      const codeMatch2 = reply.match(/```(?:\w+)?\n([\s\S]*?)```/);
      if (codeMatch2) {
        setFiles(prev => prev.map(f => f.id === activeFile.id ? { ...f, content: codeMatch2[1], saved: false } : f));
        setChatMsgs(m => [...m, { role: 'system', text: `✅ Applied AI refactor to ${activeFile.name}`, ts: Date.now() }]);
      } else {
        setChatMsgs(m => [...m, { role: 'system', text: '❌ AI refactor returned no code block', ts: Date.now() }]);
      }
    } catch (e: any) {
      setChatMsgs(m => [...m, { role: 'system', text: `❌ AI refactor failed: ${e?.message || e}`, ts: Date.now() }]);
    }
    setChatLoading(false);
  };

  return (
    <div className="h-full flex bg-[#0d1117] text-slate-300 overflow-hidden">

      {/* ── Left: File explorer + Chat ── */}
      <div className="w-56 flex-shrink-0 border-r border-white/5 flex flex-col bg-[#010409]">
        {/* Tabs */}
        <div className="flex border-b border-white/5 flex-shrink-0">
          {([['chat', '💬 AI'], ['files', '📁 Files']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setSideTab(id as any)}
              className={cn('flex-1 py-2.5 text-[11px] font-bold transition-all',
                sideTab === id ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-600 hover:text-slate-400')}>
              {label}
            </button>
          ))}
        </div>

        {/* Chat panel */}
        {sideTab === 'chat' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* AI model selector */}
            <div className="px-3 py-2 border-b border-white/5">
              <select value={aiModel} onChange={e => setAiModel(e.target.value)}
                className="w-full bg-[#161b22] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-slate-300 focus:outline-none [&>option]:bg-slate-900 [&>optgroup]:bg-slate-900">
                <optgroup label="⭐ Recommended">
                  <option value="mdq100/Gemma3-Instruct-Abliterated:12b">* Gemini 2.0 Flash ⭐</option>
                  {ollamaModels.includes('gemma3:12b') && <option value="gemma3:12b">💎 Gemma 3 12B</option>}
                  {ollamaModels.includes('qwen2.5-coder:7b') && <option value="qwen2.5-coder:7b">🔥 Qwen Coder 7B</option>}
                </optgroup>
                {ollamaModels.length > 0 && <optgroup label="🦙 Ollama">{ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}</optgroup>}
                <optgroup label="☁ Gemini">
                  <option value="mdq100/Gemma3-Instruct-Abliterated:12b">Gemini 2.0 Flash</option>
                  <option value="gemini-2.5-pro-preview-06-05">Gemini 2.5 Pro</option>
                </optgroup>
              </select>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
              {chatMsgs.length === 0 && (
                <div className="space-y-1.5 pt-2">
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-3">Quick actions</p>
                  {[
                    '🐛 Find bugs in this file',
                    '✨ Refactor & clean up',
                    '📝 Add comments & docs',
                    '⚡ Optimise performance',
                    '🧪 Write unit tests',
                    '💡 Explain this code',
                  ].map(q => (
                    <button key={q} onClick={() => { setChatInput(q.slice(2)); }}
                      className="w-full text-left px-2.5 py-2 rounded-lg bg-white/3 hover:bg-white/6 border border-white/5 hover:border-white/10 text-[11px] text-slate-500 hover:text-slate-300 transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              )}
              {chatMsgs.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className={cn('text-[11px] leading-relaxed',
                    m.role === 'user' ? 'text-blue-300 border-l-2 border-blue-500/40 pl-2' :
                    m.role === 'system' ? 'text-emerald-400 text-[10px] italic' :
                    'text-slate-300')}>
                  {m.role === 'ai' ? (
                    <div className="space-y-2">
                      {m.text.split(/(```[\s\S]*?```)/g).map((part, j) => {
                        if (part.startsWith('```')) {
                          const code = part.replace(/^```\w*\n?/, '').replace(/```$/, '');
                          return (
                            <div key={j} className="relative">
                              <pre className="bg-[#0d1117] border border-white/10 rounded-lg p-2.5 text-[10px] font-mono text-emerald-300 overflow-x-auto max-h-40 custom-scrollbar">{code}</pre>
                              <button onClick={() => { if (activeFile) { setFiles(p => p.map(f => f.id === activeFile.id ? {...f, content: code, saved: false} : f)); } }}
                                className="absolute top-1.5 right-1.5 px-2 py-0.5 bg-blue-600/20 border border-blue-500/30 rounded text-[9px] text-blue-300 hover:bg-blue-600/40 transition-all">
                                Apply
                              </button>
                            </div>
                          );
                        }
                        return <p key={j}>{part}</p>;
                      })}
                    </div>
                  ) : m.text}
                </motion.div>
              ))}
              {chatLoading && <div className="text-[11px] text-slate-600 animate-pulse">Nexus is thinking...</div>}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-2 border-t border-white/5 flex gap-1.5">
              <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="Ask AI about your code..."
                rows={2}
                className="flex-1 bg-[#161b22] border border-white/10 rounded-xl px-2.5 py-2 text-[11px] text-slate-300 resize-none focus:outline-none focus:border-blue-500/50 placeholder-slate-700"/>
              <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} className="px-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded-xl text-white transition-all flex-shrink-0">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Files panel */}
        {sideTab === 'files' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-2 space-y-0.5">
              {files.map(f => (
                <button key={f.id} onClick={() => { setActiveFileId(f.id); setSideTab('chat'); }}
                  className={cn('w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] transition-all group',
                    activeFileId === f.id ? 'bg-blue-500/10 border border-blue-500/20 text-blue-300' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent')}>
                  <FileIcon lang={f.lang} />
                  <span className="flex-1 text-left truncate">{f.name}</span>
                  {!f.saved && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" title="Unsaved" />}
                  <button onClick={e => { e.stopPropagation(); deleteFile(f.id); }}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all">
                    <X className="w-3 h-3" />
                  </button>
                </button>
              ))}
            </div>

            {/* Add file */}
            {showNewFile ? (
              <div className="px-2 py-1.5 flex gap-1.5">
                <input value={newFileName} onChange={e => setNewFileName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addFile()}
                  placeholder="filename.py" autoFocus
                  className="flex-1 bg-[#161b22] border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-blue-500/50"/>
                <button onClick={addFile} className="px-2 py-1 bg-blue-600 rounded-lg text-white text-[10px]">Add</button>
                <button onClick={() => setShowNewFile(false)} className="p-1 text-slate-500 hover:text-white"><X className="w-3.5 h-3.5"/></button>
              </div>
            ) : (
              <button onClick={() => setShowNewFile(true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-[11px] text-slate-600 hover:text-slate-400 transition-all">
                <Plus className="w-3.5 h-3.5" /> New File
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Main editor area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Tab bar */}
        <div className="flex-shrink-0 h-10 flex items-center border-b border-white/5 bg-[#010409] overflow-x-auto">
          {files.map(f => (
            <button key={f.id} onClick={() => setActiveFileId(f.id)}
              className={cn('flex items-center gap-1.5 px-4 h-full text-[11px] border-r border-white/5 flex-shrink-0 transition-all',
                activeFileId === f.id ? 'bg-[#0d1117] text-white border-t-2 border-t-blue-500' : 'text-slate-600 hover:text-slate-400 hover:bg-white/3')}>
              <FileIcon lang={f.lang} />
              {f.name}
              {!f.saved && <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex-shrink-0 px-4 py-2 border-b border-white/5 flex items-center gap-2 bg-[#0d1117]">
          {/* View toggles */}
          <div className="flex bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            {([['code', '< > Code'], ['preview', '👁 Preview'], ['terminal', '$ Terminal']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setViewMode(id as any)}
                className={cn('px-3 py-1.5 text-[11px] font-medium transition-all',
                  viewMode === id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white')}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Actions */}
          <button onClick={() => saveFile(activeFileId)} title="Save"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[11px] text-slate-400 hover:text-white hover:border-white/20 transition-all">
            <Save className="w-3.5 h-3.5" /> Save
          </button>
          <button onClick={copyCode} title="Copy" className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[11px] text-slate-400 hover:text-white transition-all">
            {copied ? <><Check className="w-3.5 h-3.5 text-green-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
          </button>
          <button onClick={runCode} disabled={running} title="Run" className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600/20 border border-emerald-500/30 rounded-lg text-[11px] text-emerald-400 hover:bg-emerald-600/30 transition-all disabled:opacity-40">
            {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {running ? 'Running...' : 'Run'}
          </button>
          <button onClick={downloadFile} title="Download" className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-slate-400 hover:text-white transition-all">
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Editor / Preview / Terminal */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {viewMode === 'code' && activeFile && (
            <div className="flex-1 relative">
              <Editor
                height="100%"
                defaultLanguage={activeFile.lang}
                language={activeFile.lang}
                value={activeFile.content}
                theme="vs-dark"
                onChange={(v) => updateFile(activeFile.id, v || '')}
                options={{ automaticLayout: true, fontFamily: '"JetBrains Mono", monospace', fontSize: 13, minimap: { enabled: false } }}
                onMount={(editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco; }}
              />

              {/* Suggestion banner */}
              {suggestion && (
                <div className="absolute right-4 bottom-4 bg-[#021025] border border-blue-500/30 rounded-lg p-3 shadow-lg w-[420px]">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <div className="text-[11px] text-slate-300 font-medium">AI Suggestion</div>
                      <pre className="mt-2 text-[11px] font-mono text-emerald-300 max-h-28 overflow-auto p-2 bg-[#0b1220] rounded">{suggestion.text.length > 600 ? suggestion.text.slice(0, 600) + '...': suggestion.text}</pre>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button onClick={acceptSuggestion} className="px-3 py-1 bg-blue-600 rounded text-white text-[11px]">Accept</button>
                      <button onClick={rejectSuggestion} className="px-3 py-1 bg-transparent border border-white/10 rounded text-[11px] text-slate-300">Reject</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {viewMode === 'preview' && activeFile && (
            <div className="flex-1 bg-white overflow-hidden">
              {activeFile.lang === 'html' ? (
                <iframe srcDoc={activeFile.content} className="w-full h-full border-0" title="Preview" sandbox="allow-scripts" />
              ) : (
                <div className="h-full flex items-center justify-center bg-[#0d1117] text-slate-500 text-sm">
                  Preview only available for HTML files
                </div>
              )}
            </div>
          )}
          {viewMode === 'terminal' && (
            <div ref={termRef} className="flex-1 bg-[#0d1117]" />
          )}

          {/* Run output */}
          {runOutput && viewMode === 'code' && (
            <div className="flex-shrink-0 border-t border-white/5 bg-[#010409]">
              <div className="flex items-center justify-between px-4 py-1.5 border-b border-white/5">
                <span className="text-[10px] text-slate-500 font-mono uppercase">Output</span>
                <button onClick={() => setRunOutput('')} className="text-slate-600 hover:text-slate-400"><X className="w-3.5 h-3.5" /></button>
              </div>
              <pre className="px-4 py-3 text-[11px] font-mono text-emerald-400 max-h-40 overflow-y-auto custom-scrollbar">{runOutput}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
