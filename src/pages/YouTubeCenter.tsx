import React, { useState, useEffect, useRef } from 'react';
import { 
  Youtube, 
  TrendingUp, 
  Users, 
  Play, 
  Clock, 
  FileText, 
  Video, 
  Scissors, 
  Sparkles, 
  BarChart3, 
  Plus, 
  Download, 
  Share2, 
  MoreHorizontal,
  Search,
  Maximize2,
  ChevronRight,
  MessageSquare,
  Zap,
  Layout,
  Settings,
  Brain,
  RefreshCw,
  ExternalLink,
  FolderOpen,
  File,
  FileVideo,
  FileAudio,
  Eye,
  Terminal as TerminalIcon,
  HardDrive,
  Key,
  ShieldCheck,
  History,
  PlayCircle,
  PauseCircle,
  SkipForward,
  SkipBack,
  Volume2,
  Layers as LayersIcon,
  Monitor,
  Type,
  Image as ImageIcon,
  Upload,
  Send,
  Cpu,
  Film
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { getGeminiResponse } from '../services/api';
import { useToast } from '../context/ToastContext';

interface VideoStats {
  id: string;
  title: string;
  views: string;
  likes: string;
  comments: string;
  thumbnail: string;
  date: string;
}

const ANALYTICS_DATA = [
  { day: 'Mon', views: 1200, subs: 5 },
  { day: 'Tue', views: 1500, subs: 8 },
  { day: 'Wed', views: 1100, subs: 3 },
  { day: 'Thu', views: 2200, subs: 12 },
  { day: 'Fri', views: 2800, subs: 15 },
  { day: 'Sat', views: 3500, subs: 25 },
  { day: 'Sun', views: 3100, subs: 20 },
];

export default function YouTubeCenter() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'scripts' | 'editor' | 'files' | 'providers'>('dashboard');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [scriptPrompt, setScriptPrompt] = useState('');
  const [generatedScript, setGeneratedScript] = useState('');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // AI Editor State
  const [isEditing, setIsEditing] = useState(false);
  const [editLogs, setEditLogs] = useState<string[]>([]);
  const [ffmpegCommand, setFfmpegCommand] = useState('');
  const [reviewLoopCount, setReviewLoopCount] = useState(0);
  const [videos, setVideos] = useState<VideoStats[]>([]);
  const [isSyncingVideos, setIsSyncingVideos] = useState(false);
  
  // ffmpeg-edit Chat State
  const [messages, setMessages] = useState<any[]>([
    {
      id: 1,
      role: 'ai',
      content: "ffmpeg-edit model loaded via Ollama. I am ready to generate FFMPEG commands for your YouTube content. Import your clips to begin.",
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [clips, setClips] = useState<any[]>([]);
  const [activeClip, setActiveClip] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleSendChatMessage = () => {
    if (!inputMessage.trim()) return;

    const newMessage = {
      id: Date.now(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, newMessage]);
    setInputMessage('');
    setIsProcessing(true);

    // Simulate AI response from ffmpeg-edit model
    setTimeout(() => {
      const aiResponse = {
        id: Date.now() + 1,
        role: 'ai',
        content: `[ffmpeg-edit] Analyzing request...\nProposed command: \`ffmpeg -i input.mp4 -vf "unsharp=5:5:1.0:5:5:0.0" output.mp4\`\n\nThis will enhance the clarity of your footage. Should I apply this to the current timeline?`,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsProcessing(false);
      setEditLogs(prev => [...prev, `AI generated FFMPEG command for: ${inputMessage}`]);
    }, 1500);
  };

  const handleVideoImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const newClips = Array.from(files as FileList).map((file: File) => ({
        id: Date.now() + Math.random(),
        name: file.name,
        url: URL.createObjectURL(file as Blob),
        size: ((file as File).size / (1024 * 1024)).toFixed(2) + ' MB'
      }));
      setClips(prev => [...prev, ...newClips]);
      if (!activeClip && newClips.length > 0) {
        setActiveClip(newClips[0]);
      }
      toast(`Imported ${newClips.length} clips`, 'success');
    }
  };
  
  // Files State
  const [files, setFiles] = useState<any[]>([]);

  // Providers State
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const { toast } = useToast();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      const newFiles = Array.from(fileList);
      setFiles(prev => [...prev, ...newFiles]);
      toast(`Uploaded ${newFiles.length} files successfully`, 'success');
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch('/api/auth/youtube/url');
      const { url } = await response.json();
      const authWindow = window.open(url, 'youtube_oauth', 'width=600,height=700');
      
      if (!authWindow) {
        toast('Please allow popups for this site to connect your YouTube account.', 'error');
        setIsConnecting(false);
      }
    } catch (error) {
      console.error('OAuth error:', error);
      toast('Failed to initiate connection', 'error');
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === 'youtube') {
        setIsConnected(true);
        setIsConnecting(false);
        toast('YouTube Channel Connected Successfully', 'success');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const generateScript = async () => {
    if (!scriptPrompt) {
      toast('Please enter a topic for the script', 'warning');
      return;
    }
    setIsGeneratingScript(true);
    try {
      const systemPrompt = "You are an expert YouTube scriptwriter. Generate a high-retention, engaging video script based on the user's topic. Include hooks, timestamps, and B-roll suggestions.";
      const response = await getGeminiResponse(scriptPrompt, systemPrompt);
      setGeneratedScript(response.text);
      toast('Script generated successfully', 'success');
    } catch (error) {
      console.error(error);
      toast('Failed to generate script. Check API connection.', 'error');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const runAiEdit = () => {
    if (files.length === 0) {
      setEditLogs(['Error: No source media found. Please upload files first.']);
      toast('No source media found', 'error');
      return;
    }
    setIsEditing(true);
    setEditLogs(['Initializing AI Editor...', 'Scanning for source footage...']);
    
    setTimeout(() => {
      setEditLogs(prev => [...prev, 'No suitable footage detected for autonomous edit.', 'Waiting for user input...']);
      setIsEditing(false);
      toast('Autonomous edit paused: Input required', 'warning');
    }, 2000);
  };

  const syncVideos = () => {
    if (!isConnected && !youtubeApiKey) {
      toast("Please connect YouTube or provide an API Key in Providers tab.", 'error');
      return;
    }
    setIsSyncingVideos(true);
    // Simulate API fetch
    setTimeout(() => {
      setVideos([
        { id: '1', title: 'Building NexusAI: Part 1', views: '1.2K', likes: '120', comments: '45', thumbnail: 'https://picsum.photos/seed/nexus1/320/180', date: '2 days ago' },
        { id: '2', title: 'AI Agent Workflow', views: '850', likes: '95', comments: '32', thumbnail: 'https://picsum.photos/seed/nexus2/320/180', date: '5 days ago' },
        { id: '3', title: 'Local LLM Setup Guide', views: '2.5K', likes: '340', comments: '89', thumbnail: 'https://picsum.photos/seed/nexus3/320/180', date: '1 week ago' },
      ]); 
      setIsSyncingVideos(false);
      toast('Channel content synced', 'success');
    }, 2000);
  };

  return (
    <div className="h-full flex flex-col bg-black text-slate-300 overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-white/5 bg-slate-950/50 backdrop-blur-xl flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/20">
            <Youtube className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">YouTube Creator Center</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">NexusAI Content Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
          <button onClick={() => setActiveTab('dashboard')} className={cn( "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all", activeTab === 'dashboard' ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-white" )} >
            <BarChart3 className="w-3 h-3 inline mr-2" /> Dashboard
          </button>
          <button onClick={() => setActiveTab('scripts')} className={cn( "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all", activeTab === 'scripts' ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-white" )} >
            <FileText className="w-3 h-3 inline mr-2" /> Script AI
          </button>
          <button onClick={() => setActiveTab('editor')} className={cn( "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all", activeTab === 'editor' ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-white" )} >
            <Scissors className="w-3 h-3 inline mr-2" /> AI Editor
          </button>
          <button onClick={() => setActiveTab('files')} className={cn( "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all", activeTab === 'files' ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-white" )} >
            <FolderOpen className="w-3 h-3 inline mr-2" /> Files
          </button>
          <button onClick={() => setActiveTab('providers')} className={cn( "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all", activeTab === 'providers' ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-white" )} >
            <ShieldCheck className="w-3 h-3 inline mr-2" /> Providers
          </button>
        </div>

        <div className="flex items-center gap-4">
          {!isConnected ? (
            <button onClick={handleConnect} disabled={isConnecting} className="px-4 py-2 bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-red-500 transition-all shadow-lg shadow-red-500/20 flex items-center gap-2" >
              {isConnecting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Youtube className="w-3 h-3" />}
              Connect YouTube
            </button>
          ) : (
            <div className="flex items-center gap-3 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Connected</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Stats Overview */}
              {!isConnected ? (
                <div className="h-[400px] flex flex-col items-center justify-center border border-white/5 rounded-2xl bg-white/5 space-y-4">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 animate-pulse">
                    <Youtube className="w-8 h-8 text-red-500" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-lg font-bold text-white uppercase tracking-widest">Channel Offline</h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Connect your YouTube account to access real-time analytics, manage content, and enable autonomous AI features.
                    </p>
                  </div>
                  <button onClick={handleConnect} className="px-6 py-3 bg-red-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-red-500 transition-all shadow-lg shadow-red-500/20 flex items-center gap-2" >
                    <Youtube className="w-4 h-4" />
                    Connect Channel
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Subscribers', value: '12.5K', delta: '+12%', icon: Users, color: 'text-blue-400' },
                      { label: 'Total Views', value: '1.2M', delta: '+8.5%', icon: TrendingUp, color: 'text-emerald-400' },
                      { label: 'Watch Time', value: '45.2K', delta: '+5.1%', icon: Clock, color: 'text-amber-400' },
                      { label: 'Revenue', value: '$2,450', delta: '+15%', icon: Zap, color: 'text-purple-400' },
                    ].map((stat, i) => (
                      <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-2xl relative overflow-hidden group">
                        <div className="flex items-center justify-between mb-4">
                          <div className={cn("p-2 rounded-xl bg-white/5 border border-white/5", stat.color)}>
                            <stat.icon className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg">{stat.delta}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">{stat.label}</p>
                        <p className="text-2xl font-bold text-white">{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Analytics Chart */}
                  <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-6">Channel Growth</h3>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={ANALYTICS_DATA}>
                          <defs>
                            <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                          <XAxis dataKey="day" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                            itemStyle={{ color: '#ef4444', fontSize: '10px' }}
                          />
                          <Area type="monotone" dataKey="views" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorViews)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Recent Videos */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Recent Performance</h3>
                        <button onClick={syncVideos} disabled={isSyncingVideos} className="text-[10px] text-indigo-400 hover:text-indigo-300 uppercase tracking-widest font-bold transition-colors flex items-center gap-2" >
                          {isSyncingVideos ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Sync Videos
                        </button>
                      </div>
                      <div className="space-y-4">
                        {videos.length === 0 ? (
                          <div className="p-12 border border-white/5 border-dashed rounded-2xl flex flex-col items-center justify-center text-center space-y-3">
                            <Video className="w-8 h-8 text-slate-600" />
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">No Videos Found</p>
                            <p className="text-[10px] text-slate-600">Sync your channel to retrieve latest content.</p>
                          </div>
                        ) : (
                          videos.map(video => (
                            <div key={video.id} className="bg-white/5 border border-white/10 p-4 rounded-2xl flex gap-6 group hover:border-white/20 transition-all">
                              <div className="w-48 aspect-video bg-slate-900 rounded-xl overflow-hidden relative shrink-0">
                                <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                                  <Play className="w-8 h-8 text-white fill-white" />
                                </div>
                              </div>
                              <div className="flex-1 flex flex-col justify-between py-1">
                                <div>
                                  <h4 className="text-sm font-bold text-white mb-2 group-hover:text-red-400 transition-colors">{video.title}</h4>
                                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">{video.date}</p>
                                </div>
                                <div className="flex items-center gap-6">
                                  <div className="flex items-center gap-2">
                                    <TrendingUp className="w-3 h-3 text-slate-500" />
                                    <span className="text-[10px] font-bold text-slate-300">{video.views}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Sparkles className="w-3 h-3 text-slate-500" />
                                    <span className="text-[10px] font-bold text-slate-300">{video.likes}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <MessageSquare className="w-3 h-3 text-slate-500" />
                                    <span className="text-[10px] font-bold text-slate-300">{video.comments}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Audience Insights */}
                    <div className="space-y-6">
                      <h3 className="text-sm font-bold text-white uppercase tracking-widest">AI Audience Insights</h3>
                      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 space-y-6">
                        <div className="flex items-center gap-3">
                          <Brain className="w-5 h-5 text-red-500" />
                          <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Nexus AI Analysis</span>
                        </div>
                        <div className="space-y-4">
                          <div className="p-4 bg-black/40 border border-white/5 rounded-xl">
                            <p className="text-[10px] text-slate-400 leading-relaxed italic">
                              "Your audience engages most with technical tutorials on Tuesdays. Consider increasing upload frequency for 'AI Agent' topics."
                            </p>
                          </div>
                        </div>
                        <button className="w-full py-3 bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all">
                          Generate Content Strategy
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          ) : activeTab === 'scripts' ? (
            <motion.div 
              key="scripts"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full"
            >
              <div className="flex flex-col gap-6">
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
                  <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                    <Brain className="w-4 h-4 text-red-500" />
                    Script Generator
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Video Topic</label>
                      <input value={scriptPrompt} onChange={(e) => setScriptPrompt(e.target.value)} placeholder="e.g., How to build a custom PC in 2026..." className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-red-500/50" />
                    </div>
                    <button onClick={generateScript} disabled={isGeneratingScript} className="w-full py-3 bg-red-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-red-500 transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2" >
                      {isGeneratingScript ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Generate Script
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col h-full overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white uppercase tracking-widest">Generated Output</h3>
                  <button onClick={() => { navigator.clipboard.writeText(generatedScript); toast('Script copied to clipboard', 'success'); }} disabled={!generatedScript} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors" >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 bg-black/40 rounded-xl p-4 overflow-y-auto custom-scrollbar font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap border border-white/5">
                  {generatedScript || <span className="text-slate-600 italic">Script will appear here...</span>}
                </div>
              </div>
            </motion.div>
          ) : activeTab === 'editor' ? (
            <motion.div 
              key="editor"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col h-full gap-6"
            >
              <div className="flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-white uppercase tracking-[0.2em]">ffmpeg-edit AI Studio</h2>
                  <p className="text-slate-500 text-[10px] uppercase tracking-widest">Quantized Ollama Model (Q4_K_M) - FFMPEG Command Engine</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => videoInputRef.current?.click()} className="px-4 py-2 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2" >
                    <Plus className="w-4 h-4" />
                    Import Clips
                  </button>
                  <input type="file" ref={videoInputRef} onChange={handleVideoImport} accept="video/mp4" multiple className="hidden" />
                  <button onClick={runAiEdit} disabled={isEditing || clips.length === 0} className="px-4 py-2 bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-red-500 transition-all shadow-lg shadow-red-500/20 flex items-center gap-2 disabled:opacity-50" >
                    {isEditing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Execute AI Edit
                  </button>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
                {/* Left: Chat Interface */}
                <div className="lg:col-span-4 flex flex-col bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
                  <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center border border-orange-500/30">
                        <Cpu className="w-4 h-4 text-orange-400" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">ffmpeg-edit</h4>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[8px] text-emerald-400 font-mono uppercase tracking-widest">Ollama Active</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {messages.map((msg) => (
                      <div key={msg.id} className={cn( "flex flex-col max-w-[90%] space-y-1", msg.role === 'user' ? "self-end items-end" : "self-start items-start" )} >
                        <div className={cn( "p-3 rounded-2xl text-[11px] leading-relaxed", msg.role === 'user' ? "bg-red-600 text-white rounded-br-none" : "bg-white/10 text-slate-200 rounded-bl-none border border-white/5" )}>
                          {msg.content}
                        </div>
                        <span className="text-[8px] text-slate-600 font-mono px-1">{msg.timestamp}</span>
                      </div>
                    ))}
                    {isProcessing && (
                      <div className="self-start flex items-center gap-2 p-3 bg-white/5 rounded-2xl rounded-bl-none border border-white/5">
                        <div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-white/5 bg-black/20">
                    <div className="flex items-center gap-2 bg-black/50 border border-white/10 rounded-xl p-1 pr-2">
                      <input value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()} placeholder="Ask ffmpeg-edit..." className="flex-1 bg-transparent border-none text-[11px] text-white px-3 py-2 focus:outline-none placeholder:text-slate-600" />
                      <button onClick={handleSendChatMessage} disabled={!inputMessage.trim() || isProcessing} className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50" >
                        <Send className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Center/Right: Workspace */}
                <div className="lg:col-span-8 flex flex-col gap-6 min-h-0">
                  {/* Preview Window */}
                  <div className="flex-1 bg-slate-900 rounded-3xl border border-white/10 relative overflow-hidden flex items-center justify-center group shadow-2xl">
                    {activeClip ? (
                      <video 
                        src={activeClip.url} 
                        controls 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-600">
                        <FileVideo className="w-16 h-16 mb-4 opacity-20" />
                        <p className="text-xs font-mono uppercase tracking-widest opacity-50">No clip selected for editing</p>
                      </div>
                    )}
                  </div>

                  {/* Bottom: Timeline & Logs */}
                  <div className="h-64 grid grid-cols-1 lg:grid-cols-2 gap-6 shrink-0">
                    {/* Timeline / Clips */}
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-4 flex flex-col overflow-hidden">
                      <h4 className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-3 flex items-center justify-between">
                        Project Timeline
                        <span className="text-red-500">{clips.length} Clips</span>
                      </h4>
                      <div className="flex-1 flex gap-3 overflow-x-auto custom-scrollbar pb-2">
                        {clips.length === 0 ? (
                          <div onClick={() => videoInputRef.current?.click()} className="w-full h-full border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-white/20 hover:text-slate-300 hover:bg-white/5 transition-all cursor-pointer" >
                            <Upload className="w-5 h-5" />
                            <span className="text-[8px] uppercase font-bold">Import Media</span>
                          </div>
                        ) : (
                          clips.map((clip) => (
                            <div key={clip.id} onClick={() => setActiveClip(clip)} className={cn( "w-40 h-full bg-black rounded-xl border flex-shrink-0 relative group cursor-pointer overflow-hidden transition-all", activeClip?.id === clip.id ? "border-red-500 ring-1 ring-red-500/50" : "border-white/10 hover:border-white/30" )} >
                              <video 
                                src={clip.url} 
                                className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                              />
                              <div className="absolute inset-0 flex flex-col justify-end p-2 bg-gradient-to-t from-black/90 to-transparent">
                                <p className="text-[10px] font-bold text-white truncate">{clip.name}</p>
                                <p className="text-[8px] text-slate-400 font-mono">{clip.size}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* AI Logs */}
                    <div className="bg-black border border-white/10 rounded-3xl p-4 font-mono flex flex-col overflow-hidden">
                      <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
                        <div className="flex items-center gap-2 text-[10px] text-red-500 uppercase tracking-widest font-bold">
                          <TerminalIcon className="w-4 h-4" />
                          Edit Engine Output
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                        {editLogs.length === 0 ? (
                          <div className="text-[10px] text-slate-600 italic">Awaiting AI commands...</div>
                        ) : (
                          editLogs.map((log, i) => (
                            <div key={i} className="text-[10px] text-slate-400">
                              <span className="text-red-500/50 mr-2">[{new Date().toLocaleTimeString()}]</span>
                              {log}
                            </div>
                          ))
                        )}
                        {isEditing && <div className="text-[10px] text-red-500 animate-pulse">_</div>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : activeTab === 'files' ? (
            <motion.div 
              key="files"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white uppercase tracking-[0.2em]">Media Assets</h2>
                  <p className="text-slate-500 text-[10px] uppercase tracking-widest">Manage your raw footage and project files.</p>
                </div>
                <div className="flex gap-3">
                  <button className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Upload New
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div className="md:col-span-1 space-y-6">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
                    {[
                      { label: 'All Files', icon: FolderOpen, count: 12 },
                      { label: 'Videos', icon: FileVideo, count: 5 },
                      { label: 'Audio', icon: FileAudio, count: 3 },
                      { label: 'Images', icon: ImageIcon, count: 4 },
                    ].map(cat => (
                      <button key={cat.label} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-all group">
                        <div className="flex items-center gap-3">
                          <cat.icon className="w-4 h-4 text-slate-500 group-hover:text-red-400 transition-colors" />
                          <span className="text-[10px] font-bold text-slate-400 group-hover:text-white uppercase tracking-widest">{cat.label}</span>
                        </div>
                        <span className="text-[10px] text-slate-600">{cat.count}</span>
                      </button>
                    ))}
                  </div>
                  <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center gap-2 text-red-500">
                      <HardDrive className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Storage</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[8px] uppercase tracking-widest text-slate-500">
                        <span>Used</span>
                        <span className="text-white">4.5 GB / 50 GB</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: '9%' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-3">
                  <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-[10px]">
                      <thead className="bg-white/5 text-slate-500 uppercase tracking-widest">
                        <tr>
                          <th className="px-6 py-4 font-bold">Name</th>
                          <th className="px-6 py-4 font-bold">Type</th>
                          <th className="px-6 py-4 font-bold text-right">Size</th>
                          <th className="px-6 py-4 font-bold text-right">Date</th>
                          <th className="px-6 py-4 font-bold text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {files.map(file => (
                          <tr key={file.id} className="hover:bg-white/5 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {file.type === 'video' ? <FileVideo className="w-4 h-4 text-blue-400" /> : 
                                 file.type === 'audio' ? <FileAudio className="w-4 h-4 text-emerald-400" /> : <ImageIcon className="w-4 h-4 text-purple-400" />}
                                <span className="text-white font-bold">{file.name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-slate-500 uppercase tracking-widest">{file.type}</td>
                            <td className="px-6 py-4 text-right text-slate-400">{file.size}</td>
                            <td className="px-6 py-4 text-right text-slate-400">{file.date}</td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button className="p-1.5 text-slate-500 hover:text-white transition-colors"><Eye className="w-4 h-4" /></button>
                                <button className="p-1.5 text-slate-500 hover:text-white transition-colors"><Download className="w-4 h-4" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : activeTab === 'providers' ? (
            <motion.div 
              key="providers"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="text-center space-y-2">
                <h2 className="text-xl font-bold text-white uppercase tracking-[0.2em]">API Providers & Secrets</h2>
                <p className="text-slate-500 text-[10px] uppercase tracking-widest">Manage your credentials for YouTube and AI services.</p>
              </div>

              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-8">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-red-500 uppercase tracking-widest flex items-center gap-2">
                        <Key className="w-4 h-4" />
                        YouTube API Key
                      </label>
                      <span className="text-[8px] text-slate-500 uppercase tracking-widest">Optional for Analytics</span>
                    </div>
                    <input type="password" value={youtubeApiKey} onChange={(e) => setYoutubeApiKey(e.target.value)} placeholder="Enter your YouTube Data API v3 Key" className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-red-500/50" />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-red-500 uppercase tracking-widest flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" />
                        OAuth Client Secret
                      </label>
                      <span className="text-[8px] text-slate-500 uppercase tracking-widest">Required for Uploads</span>
                    </div>
                    <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Enter your OAuth 2.0 Client Secret" className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-red-500/50" />
                  </div>

                  <div className="p-6 bg-red-500/5 border border-red-500/20 rounded-2xl space-y-4">
                    <div className="flex items-center gap-3">
                      <Brain className="w-5 h-5 text-red-500" />
                      <span className="text-[10px] font-bold text-white uppercase tracking-widest">AI Status</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      NexusAI is currently running in **Local Mode**. Analytics and Script generation will use local LLaMA models if API keys are not provided. Advanced features like automated uploads require valid OAuth credentials.
                    </p>
                  </div>

                  <button className="w-full py-4 bg-red-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-red-500 transition-all shadow-lg shadow-red-500/20">
                    Save Credentials
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
