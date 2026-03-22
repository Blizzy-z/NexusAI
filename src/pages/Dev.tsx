import React, { useState, useEffect, useRef } from 'react';
import { 
  RefreshCw,
  Cpu, 
  Database, 
  Activity, 
  Search, 
  Plus, 
  Send, 
  Brain, 
  X, 
  Monitor, 
  ShieldAlert,
  ChevronDown,
  Folder,
  FileCode,
  Layers,
  Zap,
  Settings as SettingsIcon,
  Globe,
  HardDrive,
  Code,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import ReactMarkdown from 'react-markdown';
import { getGeminiResponse } from '../services/api';

type OS = 'windows' | 'ubuntu' | 'kali';

export default function Dev() {
  const [activeTab, setActiveTab] = useState<'sync' | 'chat'>('sync');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'complete'>('idle');
  const [publishStatus, setPublishStatus] = useState<'idle' | 'publishing' | 'complete'>('idle');
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  
  const systemPrompt = `You are the AI Developer of this NexusAI application. You have full access to the "src/" directory and can modify any file in the project.
  
  Your capabilities:
  1. **List Files**: Use [LIST_FILES] to see the project structure.
  2. **Read Code**: Use [READ_FILE:path/to/file] to inspect code before changing it.
  3. **Write Code**: Use [FILE_UPDATE:path/to/file]NEW_CONTENT[/FILE_UPDATE] to propose changes.
  
  When the user approves a change, the system will automatically apply it and restart the server to reflect updates immediately.
  
  Your goal is to help the user build and refine the NexusAI platform, including the Doomcase OS, YouTube Center, and NexusMesh modules.
  Always check file content before editing to ensure accuracy.`;

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/dev/files');
      const data = await res.json();
      if (data.files) setProjectFiles(data.files);
    } catch (err) {
      console.error("Failed to fetch files", err);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || isThinking) return;
    const userMsg = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsThinking(true);

    try {
      const response = await getGeminiResponse(chatInput, systemPrompt);
      let assistantText = response.text;

      // Handle AI "Commands" (simulated for now, but the UI will show them)
      if (assistantText.includes('[LIST_FILES]')) {
        assistantText = assistantText.replace('[LIST_FILES]', `\n\n**Project Files:**\n${projectFiles.map(f => `- ${f}`).join('\n')}`);
      }

      if (assistantText.includes('[READ_FILE:')) {
        const path = assistantText.split('[READ_FILE:')[1].split(']')[0];
        try {
          const res = await fetch('/api/dev/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: path })
          });
          const data = await res.json();
          if (data.content) {
            assistantText = assistantText.replace(`[READ_FILE:${path}]`, `\n\n**Content of \`${path}\`:**\n\`\`\`tsx\n${data.content}\n\`\`\``);
          }
        } catch (err) {
          console.error("Failed to read file", err);
        }
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: assistantText }]);
    } catch (error) {
      console.error(error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Connection to AI Studio workspace lost. Please retry." }]);
    } finally {
      setIsThinking(false);
    }
  };

  const applyUpdate = async (filePath: string, content: string) => {
    setIsApplyingUpdate(true);
    try {
      const res = await fetch('/api/dev/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, content })
      });
      if (res.ok) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `✅ Update applied to \`${filePath}\`. Restarting system...` }]);
        await fetch('/api/dev/restart', { method: 'POST' });
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch (err) {
      console.error("Failed to apply update", err);
    } finally {
      setIsApplyingUpdate(false);
    }
  };

  const handleSync = () => {
    setSyncStatus('syncing');
    setTimeout(() => setSyncStatus('complete'), 3000);
  };

  const handlePublish = () => {
    setPublishStatus('publishing');
    setTimeout(() => setPublishStatus('complete'), 4000);
  };

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">
      {/* Dev Sidebar */}
      <div className="w-72 border-r border-white/5 flex flex-col bg-slate-900/40">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.4)]">
              <Layers className="text-white w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Dev Center</h2>
              <p className="text-[10px] text-blue-500 font-mono uppercase tracking-widest">Workspace Hub</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          <DevNavItem 
            active={activeTab === 'sync'} 
            onClick={() => setActiveTab('sync')} 
            icon={RefreshCw} 
            label="Workspace Sync" 
            color="text-blue-400" 
          />
          <DevNavItem 
            active={activeTab === 'chat'} 
            onClick={() => setActiveTab('chat')} 
            icon={Brain} 
            label="Direct AI Chat" 
            color="text-emerald-400" 
          />
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-xl">
            <div className="flex items-center gap-2 text-blue-400 mb-2">
              <Globe className="w-3 h-3" />
              <span className="text-[9px] font-bold uppercase tracking-widest">AI Studio Link</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>Status</span>
              <span className="text-emerald-400">Connected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Dev Content */}
      <div className="flex-1 flex flex-col bg-slate-950 relative">
        <div className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-slate-950/50 backdrop-blur-xl z-20">
          <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-3">
            {activeTab === 'sync' ? <RefreshCw className="w-4 h-4 text-blue-400" /> : <Brain className="w-4 h-4 text-emerald-400" />}
            {activeTab === 'sync' ? 'Google AI Studio Workspace' : 'Direct Developer Chat'}
          </h3>
        </div>

        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activeTab === 'sync' && (
              <motion.div 
                key="sync"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                className="h-full p-8 overflow-y-auto custom-scrollbar"
              >
                <div className="max-w-4xl mx-auto space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-900/50 border border-white/5 p-8 rounded-3xl space-y-6 relative overflow-hidden group">
                      <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all" />
                      <div className="w-14 h-14 bg-blue-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.5)]">
                        <RefreshCw className={cn("text-white w-8 h-8", syncStatus === 'syncing' && "animate-spin")} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white mb-2">Workspace Sync</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                          Synchronize your local application state with the Google AI Studio workspace. Pull latest changes and updates.
                        </p>
                      </div>
                      <button onClick={handleSync} disabled={syncStatus === 'syncing'} className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold hover:bg-blue-400 transition-all flex items-center justify-center gap-2" >
                        {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'complete' ? 'Sync Complete' : 'Sync Workspace'}
                      </button>
                    </div>

                    <div className="bg-slate-900/50 border border-white/5 p-8 rounded-3xl space-y-6 relative overflow-hidden group">
                      <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all" />
                      <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.5)]">
                        <Zap className={cn("text-white w-8 h-8", publishStatus === 'publishing' && "animate-pulse")} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white mb-2">Publish Updates</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                          Push your current workspace state to all local application instances. This will update the UI and logic globally.
                        </p>
                      </div>
                      <button onClick={handlePublish} disabled={publishStatus === 'publishing'} className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-400 transition-all flex items-center justify-center gap-2" >
                        {publishStatus === 'publishing' ? 'Publishing...' : publishStatus === 'complete' ? 'Updates Published' : 'Publish to Local Apps'}
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 border border-white/5 p-8 rounded-3xl">
                    <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-400" />
                      Deployment History
                    </h4>
                    <div className="space-y-4">
                      <HistoryItem version="v2.4.1" date="2026-03-01 08:30" status="Success" />
                      <HistoryItem version="v2.4.0" date="2026-02-28 14:20" status="Success" />
                      <HistoryItem version="v2.3.9" date="2026-02-28 10:15" status="Success" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="h-full flex flex-col"
              >
                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                  {chatMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                      <Brain className="w-16 h-16 mb-4 text-emerald-500" />
                      <p className="text-sm font-mono uppercase tracking-widest">Direct AI Developer Link</p>
                      <p className="text-xs text-slate-500 mt-2">Communicate directly with the AI responsible for this application.</p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={cn("flex gap-4 max-w-4xl mx-auto", msg.role === 'user' ? "flex-row-reverse" : "")}>
                      <div className={cn( "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border", msg.role === 'user' ? "bg-blue-500/20 border-blue-500/30" : "bg-emerald-500/20 border-emerald-500/30" )}>
                        {msg.role === 'user' ? <Users className="w-4 h-4 text-blue-400" /> : <Brain className="w-4 h-4 text-emerald-400" />}
                      </div>
                      <div className="p-4 rounded-2xl text-sm leading-relaxed bg-white/5 text-slate-200 border border-white/5 max-w-[80%]">
                        <ReactMarkdown>
                          {msg.content.split('[/FILE_UPDATE]')[0].split('[FILE_UPDATE:')[0]}
                        </ReactMarkdown>
                        {msg.role === 'assistant' && msg.content.includes('[FILE_UPDATE:') && (
                          <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                            <div className="flex items-center gap-2 text-emerald-400 mb-2">
                              <FileCode className="w-4 h-4" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">Suggested Update: {msg.content.split('[FILE_UPDATE:')[1].split(']')[0]}</span>
                            </div>
                            <button onClick={() => { const path = msg.content.split('[FILE_UPDATE:')[1].split(']')[0]; const content = msg.content.split(']')[1].split('[/FILE_UPDATE]')[0]; applyUpdate(path, content); }} disabled={isApplyingUpdate} className="w-full py-2 bg-emerald-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-400 transition-all flex items-center justify-center gap-2" >
                              {isApplyingUpdate ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                              Approve & Apply Update
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isThinking && (
                    <div className="flex gap-4 max-w-4xl mx-auto animate-pulse">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                        <Brain className="w-4 h-4 text-emerald-400" />
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-500/50 flex items-center">AI Developer is thinking...</span>
                    </div>
                  )}
                </div>
                <div className="p-6 bg-slate-950/50 backdrop-blur-xl border-t border-white/5">
                  <div className="max-w-4xl mx-auto relative">
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendChat())}
                      placeholder="Message AI Developer..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 pr-16 focus:outline-none focus:border-emerald-500/50 transition-all resize-none h-16 max-h-64 custom-scrollbar text-sm"
                    />
                    <button onClick={handleSendChat} className="absolute right-3 bottom-3 p-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-400 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]" >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function HistoryItem({ version, date, status }: { version: string, date: string, status: string }) {
  return (
    <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
      <div className="flex items-center gap-4">
        <div className="w-2 h-2 bg-emerald-500 rounded-full" />
        <div>
          <p className="text-xs font-bold text-white">{version}</p>
          <p className="text-[10px] text-slate-500 font-mono">{date}</p>
        </div>
      </div>
      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">{status}</span>
    </div>
  );
}

function DevNavItem({ active, onClick, icon: Icon, label, color }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-medium transition-all duration-200 group",
        active ? "bg-white/5 text-white border border-white/10 shadow-lg" : "text-slate-500 hover:text-slate-300 border border-transparent"
      )}
    >
      <Icon className={cn("w-4 h-4 transition-colors", active ? color : "text-slate-600 group-hover:text-slate-400")} />
      {label}
    </button>
  );
}

function FileCard({ name, type, size }: { name: string, type: string, size: string }) {
  return (
    <div className="bg-slate-900/50 border border-white/5 p-4 rounded-xl hover:border-emerald-500/30 transition-all group cursor-pointer">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center group-hover:bg-emerald-500/10 transition-colors">
          <FileCode className="w-5 h-5 text-slate-400 group-hover:text-emerald-400" />
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-bold text-white truncate">{name}</h4>
          <p className="text-[9px] text-slate-500 uppercase font-mono">{type}</p>
        </div>
      </div>
      <div className="flex items-center justify-between text-[9px] font-mono text-slate-600">
        <span>{size}</span>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="hover:text-emerald-400"><Send className="w-3 h-3" /></button>
          <button className="hover:text-red-400"><X className="w-3 h-3" /></button>
        </div>
      </div>
    </div>
  );
}
