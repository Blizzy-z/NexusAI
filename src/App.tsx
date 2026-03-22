import React, { useState, useEffect, Suspense, lazy } from 'react';
import Sidebar from './components/Sidebar';
import TitleBar from './components/TitleBar';
import AISidebar from './components/AISidebar';
import NexusAuthGate from './pages/NexusAuth';

// Eagerly loaded (used immediately) 
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import LifeHub from './pages/LifeHub';
import NexusCentre from './pages/NexusCentre';

// Lazily loaded (only bundled when first visited) 
// This massively speeds up initial load on slow laptops
const MediaStudio  = lazy(() => import('./pages/MediaStudio'));
const LLMLibrary   = lazy(() => import('./pages/LLMLibrary'));
const ModelTrainer = lazy(() => import('./pages/ModelTrainer'));
const Agents       = lazy(() => import('./pages/Agents'));
const NexusCode    = lazy(() => import('./pages/NexusCode'));
const KaliVM       = lazy(() => import('./pages/KaliVM'));
const NexusClaw    = lazy(() => import('./pages/NexusClaw'));
const NexusOSINT   = lazy(() => import('./pages/NexusOSINT'));
const SmartHome    = lazy(() => import('./pages/SmartHome'));
const Doomcase     = lazy(() => import('./pages/Doomcase'));
const NexusMesh    = lazy(() => import('./pages/NexusMesh'));
const YouTubeCenter= lazy(() => import('./pages/YouTubeCenter'));
const NexusBrowser = lazy(() => import('./pages/NexusBrowser'));
const Admin        = lazy(() => import('./pages/Admin'));
const Dev          = lazy(() => import('./pages/Dev'));
const OSBuilder    = lazy(() => import('./pages/OSBuilder'));
const AIMaker      = lazy(() => import('./pages/AIMaker'));
const BusinessHub  = lazy(() => import('./pages/BusinessHub'));
const NexusAITools   = lazy(() => import('./pages/NexusAITools'));
const BioSuitMonitor = lazy(() => import('./pages/BioSuitMonitor'));
const JarvisTable    = lazy(() => import('./pages/JarvisTable'));
const DroneRef       = lazy(() => import('./pages/DroneRef'));
import { motion, AnimatePresence } from 'motion/react';
import { SettingsProvider } from './context/SettingsContext';
import { ToastProvider } from './context/ToastContext';
import {
  LayoutDashboard, MessageSquare, Image, Cpu, Settings as SettingsIcon,
  MoreHorizontal, Bot, Code, Wrench
} from 'lucide-react';

// Detect mobile/iPhone
function useIsMobile() {
  const [mobile, setMobile] = useState(() => {
    const ua = navigator.userAgent;
    const isTouch = /iPhone|iPad|iPod|Android/i.test(ua);
    return isTouch || window.innerWidth < 768;
  });
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

// Auto-scale the app to fit any screen size
// Designed for 1440 900. Scales down uniformly on smaller screens.
function useAutoScale() {
  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth;
      // Don't touch font size at all on mobile or normal desktop widths
      // Only adjust if extremely narrow (tablet-ish) to prevent layout breaks
      if (w < 768) {
        // Mobile: browser handles this, don't touch
        document.documentElement.style.fontSize = '';
        return;
      }
      if (w >= 1100) {
        // Normal laptop/desktop: use default 16px, no scaling
        document.documentElement.style.fontSize = '';
        return;
      }
      // Very narrow desktop (1024-1099px): gentle 14px base
      if (w >= 1024) {
        document.documentElement.style.fontSize = '14px';
        return;
      }
      // Super narrow (768-1023px): 13px base
      document.documentElement.style.fontSize = '13px';
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);
}

// Mobile bottom nav tabs
const MOBILE_TABS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
  { id: 'chat',      icon: MessageSquare,   label: 'Chat' },
  { id: 'media',     icon: Image,           label: 'Media' },
  { id: 'code',      icon: Code,            label: 'Code' },
  { id: 'settings',  icon: SettingsIcon,    label: 'Settings' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [authed, setAuthed] = useState(() => {
    try { const a = JSON.parse(localStorage.getItem('nexus_auth') || '{}'); return !!a.authed; } catch { return false; }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<{primaryUrl:string,localIps:string[],port:number}|null>(null);
  const isMobile = useIsMobile();
  useAutoScale();

  // Dashboard quick-nav events
  useEffect(() => {
    const handler = (e: Event) => setActiveTab((e as CustomEvent).detail);
    window.addEventListener('nexus-navigate', handler);
    return () => window.removeEventListener('nexus-navigate', handler);
  }, []);

  // Fetch network info on mount
  useEffect(() => {
    fetch('/api/network-info')
      .then(r => r.json())
      .then(d => setNetworkInfo(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const hasOnboarded = localStorage.getItem('nexus_onboarded');
    if (!hasOnboarded) setShowOnboarding(true);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':  return <Dashboard />;
      case 'chat':       return <Chat />;
      case 'media':      return <MediaStudio />;
      case 'models':     return <LLMLibrary />;
      case 'llmlibrary': return <LLMLibrary />;      case 'trainer':    return <ModelTrainer />;
      case 'agents':     return <Agents />;
      case 'code':       return <NexusCode />;
      case 'kali':       return <KaliVM />;
      case 'claw':       return <NexusClaw />;
      case 'smarthome':  return <SmartHome />;
      case 'doomcase':   return <Doomcase />;
      case 'mesh':       return <NexusMesh />;
      case 'youtube':    return <YouTubeCenter />;
      case 'browser':    return <NexusBrowser />;
      case 'lifehub':    return <LifeHub initialTab='flashcards' />;
      case 'flashcards': return <LifeHub initialTab='flashcards' />;
      case 'notes':      return <LifeHub initialTab='notes' />;
      case 'tasks':      return <LifeHub initialTab='tasks' />;
      case 'habits':     return <LifeHub initialTab='habits' />;
      case 'focus':      return <LifeHub initialTab='focus' />;
      case 'budget':     return <LifeHub initialTab='budget' />;
      case 'study':      return <LifeHub initialTab='study' />;
      case 'centre':     return <NexusCentre />;
      case 'aitools':    return <NexusAITools />;
      case 'osint':      return <NexusOSINT />;
      case 'admin':      return <Admin />;
      case 'dev':        return <Dev />;
      case 'settings':   return <Settings />;
      case 'osbuilder':  return <OSBuilder />;
      case 'aimaker':    return <AIMaker />;
      case 'biz-leads':        return <BusinessHub tab="leads"/>;
      case 'biz-receptionist': return <BusinessHub tab="receptionist"/>;
      case 'biz-websites':     return <BusinessHub tab="websites"/>;
      case 'biz-revenue':      return <BusinessHub tab="revenue"/>;
      case 'biz-methods':      return <BusinessHub tab="methods"/>;
      case 'business':         return <BusinessHub tab="leads"/>;
      case 'biosuit':    return <BioSuitMonitor />;
      case 'jarvis':     return <JarvisTable />;
      case 'droneref':   return <DroneRef />;
      default:           return <Dashboard />;
    }
  };

  if (!authed) return <NexusAuthGate onAuthed={() => setAuthed(true)} />;

  // Mobile layout 
  if (isMobile) {
    return (
      <SettingsProvider>
        <ToastProvider>
          <div style={{display:'flex',flexDirection:'column',height:'100%',minHeight:'-webkit-fill-available',background:'#000',color:'#cbd5e1',overflow:'hidden', paddingTop:'env(safe-area-inset-top)',paddingBottom:'env(safe-area-inset-bottom)'}}>

            {/* Mobile header */}
            <div style={{height:'44px',background:'rgba(0,0,0,0.95)',borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 16px',flexShrink:0, paddingLeft:'calc(16px + env(safe-area-inset-left))',paddingRight:'calc(16px + env(safe-area-inset-right))'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <div style={{width:'26px',height:'26px',borderRadius:'7px',background:'linear-gradient(135deg,#4f46e5,#7c3aed)', display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <Bot size={14} style={{color:'white'}}/>
                </div>
                <span style={{fontWeight:700,fontSize:'15px',color:'white',letterSpacing:'-0.3px'}}>NexusAI</span>
              </div>
              <button onClick={() => setMobileMenuOpen(p=>!p)}
                style={{background:'rgba(255,255,255,0.06)',border:'none',borderRadius:'8px',padding:'6px 10px',
                  color:'#94a3b8',cursor:'pointer',fontSize:'12px',fontWeight:600}}>
                More
              </button>
            </div>

            {/* Content */}
            <div style={{flex:1,overflow:'hidden',position:'relative'}}>
              <AnimatePresence mode="wait">
                <motion.div key={activeTab}
                  initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
                  transition={{duration:0.15}}
                  style={{position:'absolute',inset:0,overflow:'auto'}}>
                  <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="w-6 h-6 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin"/></div>}>{renderContent()}</Suspense>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Mobile bottom nav */}
            <div style={{ height:'calc(56px + env(safe-area-inset-bottom))', paddingBottom:'env(safe-area-inset-bottom)', background:'rgba(0,0,0,0.97)', borderTop:'1px solid rgba(255,255,255,0.06)', display:'flex',alignItems:'center',flexShrink:0, paddingLeft:'env(safe-area-inset-left)', paddingRight:'env(safe-area-inset-right)', }}>
              {MOBILE_TABS.map(({id, icon: Icon, label}) => {
                const active = activeTab === id;
                return (
                  <button key={id} onClick={() => setActiveTab(id)}
                    style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                      gap:'3px',background:'none',border:'none',cursor:'pointer',padding:'6px 0',
                      color: active ? '#818cf8' : '#4b5563', minWidth:0}}>
                    <Icon size={20} style={{color: active ? '#818cf8' : '#4b5563'}}/>
                    <span style={{fontSize:'10px',fontWeight: active ? 600 : 400,color: active ? '#818cf8' : '#4b5563'}}>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Mobile "More" sheet */}
            {mobileMenuOpen && (
              <div style={{position:'fixed',inset:0,zIndex:200}} onClick={() => setMobileMenuOpen(false)}>
                <div style={{position:'absolute',bottom:0,left:0,right:0,background:'#0f0f1a',borderTop:'1px solid rgba(255,255,255,0.1)', borderRadius:'20px 20px 0 0',padding:'12px 0 calc(24px + env(safe-area-inset-bottom))', maxHeight:'70vh',overflowY:'auto'}} onClick={e => e.stopPropagation()}>
                  <div style={{width:'36px',height:'4px',borderRadius:'2px',background:'rgba(255,255,255,0.15)',margin:'0 auto 16px'}}/>
                  {[
                    { id:'models',    label:'LLM Library',       emoji:'📚' },
                    { id:'trainer',   label:'AI Model Trainer',  emoji:'🧠' },
                    { id:'agents',    label:'AI Agents',         emoji:'⚡' },
                    { id:'youtube',   label:'YouTube Center',    emoji:'🎬' },
                    { id:'browser',   label:'Nexus Browser',     emoji:'🌐' },
                    { id:'mesh',      label:'NexusMesh 3D',      emoji:'🧊' },
                    { id:'osbuilder', label:'OS Builder',        emoji:'💿' },
                    { id:'aimaker',   label:'AI Maker',          emoji:'✨' },
                    { id:'admin',     label:'Admin Core',        emoji:'🛡' },
                    { id:'dev',       label:'Dev Centre',        emoji:'💻' },
                    { id:'kali',      label:'Kali VM',           emoji:'☠' },
                    { id:'doomcase',  label:'Doomcase OS',       emoji:'⚡' },
                  ].map(({id, label, emoji}) => (
                    <button key={id} onClick={() => { setActiveTab(id); setMobileMenuOpen(false); }}
                      style={{width:'100%',display:'flex',alignItems:'center',gap:'14px',padding:'13px 20px',
                        background:'none',border:'none',cursor:'pointer',color:'#e2e8f0',fontSize:'15px',textAlign:'left'}}>
                      <span style={{fontSize:'20px',width:'28px',textAlign:'center'}}>{emoji}</span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ToastProvider>
      </SettingsProvider>
    );
  }

  // Desktop layout 
  return (
    <SettingsProvider>
      <ToastProvider>
        <div className="flex flex-col h-screen bg-black text-slate-200 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 overflow-hidden">
          <TitleBar />

          {/* Connect from phone modal */}
          {showConnectModal && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center" onClick={() => setShowConnectModal(false)}>
              <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <span className="text-2xl">📱</span> Connect from Phone
                </h3>
                <p className="text-xs text-slate-400 mb-5">Open NexusAI on any device on your WiFi network</p>

                {networkInfo ? (
                  <>
                    {/* QR Code via Google Charts API */}
                    <div className="flex justify-center mb-4">
                      <div className="bg-white p-3 rounded-xl">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(networkInfo.primaryUrl + '/app')}`}
                          alt="QR Code"
                          className="w-44 h-44"
                        />
                      </div>
                    </div>
                    <div className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-center mb-4">
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Phone App URL</p>
                      <p className="text-lg font-mono font-bold text-indigo-400">{networkInfo.primaryUrl}/app</p>
                    </div>
                    {networkInfo.localIps.length > 1 && (
                      <div className="space-y-1 mb-4">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">Other IPs on this machine</p>
                        {networkInfo.localIps.slice(1).map(ip => (
                          <p key={ip} className="text-xs font-mono text-slate-400">http://{ip}:{networkInfo.port}</p>
                        ))}
                      </div>
                    )}
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-xs text-emerald-300">
                      OK Make sure your phone is on the same WiFi network as this PC
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">Loading network info...</p>
                )}

                <button onClick={() => setShowConnectModal(false)}
                  className="w-full mt-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-slate-300 hover:bg-white/10 transition-all">
                  Close
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-1 overflow-hidden">
            <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
            <main style={{flex:1, overflow:'hidden', position:'relative', display:'flex', flexDirection:'column', minWidth:0}}>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                  <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="w-6 h-6 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin"/></div>}>{renderContent()}</Suspense>
                </motion.div>
              </AnimatePresence>

              {showOnboarding && (
                <div className="fixed bottom-8 right-8 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-slate-900 border border-indigo-500/30 p-6 rounded-2xl shadow-2xl max-w-sm">
                    <h3 className="text-lg font-bold text-white mb-2">Welcome to NexusAI</h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Your advanced AI command center is ready. Head to Settings to connect your API keys.
                    </p>
                    <div className="flex gap-3">
                      <button onClick={() => { setActiveTab('settings'); setShowOnboarding(false); }}
                        className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-bold hover:bg-indigo-400 transition-colors">
                        Open Settings
                      </button>
                      <button onClick={() => setShowOnboarding(false)}
                        className="px-4 py-2 bg-white/5 text-slate-300 rounded-xl text-sm font-bold hover:bg-white/10 transition-colors">
                        Later
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </main>
            <AISidebar />
          </div>
        </div>
      </ToastProvider>
    </SettingsProvider>
  );
}
