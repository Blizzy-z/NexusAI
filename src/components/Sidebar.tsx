import React, { useState } from 'react';
import {
  LayoutDashboard, MessageSquare, Image as ImageIcon, Users, Code, Monitor,
  Zap, ShieldAlert, Settings, Terminal, Home, Briefcase, Shapes, Youtube,
  Brain, Cpu, Sparkles, Library, DollarSign, Phone, Globe, TrendingUp,
  BarChart3, Search, ChevronDown, ChevronRight, Bot,
  BookOpen, StickyNote, CheckSquare, Target, Timer,
  Shield, Cpu as CpuIcon, Globe2
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const BUSINESS_ITEMS = [
  { id: 'biz-leads',        label: 'Lead Generator',      icon: Search,      color: 'text-purple-400', desc: 'Find & close clients' },
  { id: 'biz-receptionist', label: 'AI Receptionist',     icon: Phone,       color: 'text-blue-400',   desc: 'Build AI phone agents' },
  { id: 'biz-websites',     label: 'Website Hunter',      icon: Globe,       color: 'text-emerald-400',desc: 'Find + build websites' },
  { id: 'biz-revenue',      label: 'Revenue Calculator',  icon: BarChart3,   color: 'text-orange-400', desc: 'Track profits' },
  { id: 'biz-methods',      label: 'Money Methods',       icon: TrendingUp,  color: 'text-pink-400',   desc: 'AI income streams' },
];

const LIFE_ITEMS = [
  { id: 'flashcards', label: 'Flashcards',  icon: Brain,       color: 'text-purple-400', desc: 'SRS study cards'     },
  { id: 'notes',      label: 'AI Notes',    icon: StickyNote,  color: 'text-yellow-400', desc: 'Smart notes + AI'    },
  { id: 'tasks',      label: 'Tasks',       icon: CheckSquare, color: 'text-blue-400',   desc: 'To-do + AI breakdown'},
  { id: 'habits',     label: 'Habits',      icon: Target,      color: 'text-emerald-400',desc: 'Daily streaks'       },
  { id: 'focus',      label: 'Focus Timer', icon: Timer,       color: 'text-red-400',    desc: 'Pomodoro timer'      },
  { id: 'budget',     label: 'Budget',      icon: DollarSign,  color: 'text-green-400',  desc: 'Income & expenses'   },
  { id: 'study',      label: 'Study AI',    icon: BookOpen,    color: 'text-indigo-400', desc: 'Explain, quiz, essay'},
];

const SECTIONS = [
  { label: 'Main', items: [
    { id: 'centre',     label: 'The Centre',       icon: Zap },
    { id: 'aitools',    label: 'AI Tools Hub',      icon: Sparkles },
    { id: 'dashboard',  label: 'Dashboard',        icon: LayoutDashboard },
    { id: 'chat',       label: 'Chat Studio',       icon: MessageSquare },
    { id: 'agents',     label: 'Agent Swarm',       icon: Users },
    { id: 'code',       label: 'Nexus Code',        icon: Code },
  ]},
  { label: 'AI & Models', items: [
    { id: 'models',     label: 'LLM Library',      icon: Library },
    { id: 'trainer',    label: 'Model Trainer',    icon: Brain },
    { id: 'aimaker',    label: 'AI Maker',          icon: Sparkles },
    { id: 'mesh',       label: 'NexusMesh 3D',     icon: Shapes },
    { id: 'media',      label: 'Media Studio',     icon: ImageIcon },
  ]},
  { label: 'Build', items: [
    { id: 'osbuilder',  label: 'OS Builder',        icon: Cpu },
    { id: 'doomcase',   label: 'Doomcase OS',       icon: Briefcase },
    { id: 'youtube',    label: 'YouTube Center',    icon: Youtube },
    { id: 'browser',    label: 'Nexus Browser',     icon: Globe2 },
  ]},
  { label: 'System', items: [
    { id: 'kali',       label: 'Kali VM',           icon: Monitor },
    { id: 'claw',       label: 'NexusClaw',         icon: ShieldAlert },
    { id: 'osint',      label: 'OSINT Intel',        icon: Search },
    { id: 'smarthome',  label: 'Smart Home',        icon: Home },
    { id: 'biosuit',    label: 'BioSuit Monitor',   icon: Shield },
    { id: 'jarvis',     label: 'Jarvis Table AI',   icon: CpuIcon },
    { id: 'droneref',   label: 'Drone Gesture Ref', icon: BookOpen },
    { id: 'dev',        label: 'Dev Center',        icon: Terminal },
    { id: 'admin',      label: 'Admin Center',      icon: ShieldAlert },
    { id: 'settings',   label: 'Settings',          icon: Settings },
  ]},
];

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const [lifeOpen, setLifeOpen] = useState(
    LIFE_ITEMS.some(b => b.id === activeTab) || activeTab === 'lifehub'
  );
  const [bizOpen, setBizOpen] = useState(
    BUSINESS_ITEMS.some(b => b.id === activeTab) || activeTab === 'business'
  );
  // Collapse: auto on small screens, but respect manual override
  const [collapsed, setCollapsed] = React.useState(() => {
    const manual = localStorage.getItem('nexus_sidebar_collapsed');
    if (manual !== null) return manual === 'true';
    return window.innerWidth < 1280; // collapse below 1280px handles most laptop screens
  });

  React.useEffect(() => {
    const fn = () => {
      // Only auto-collapse if user hasn't manually set a preference
      const manual = localStorage.getItem('nexus_sidebar_collapsed');
      if (manual === null) {
        setCollapsed(window.innerWidth < 1280);
      }
    };
    fn(); // run on mount too
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const toggleCollapsed = (val: boolean) => {
    setCollapsed(val);
    localStorage.setItem('nexus_sidebar_collapsed', String(val));
  };

  const isBizActive = BUSINESS_ITEMS.some(b => b.id === activeTab);
  const isLifeActive = LIFE_ITEMS.some(b => b.id === activeTab);

  // Icon-only collapsed sidebar for smaller screens
  if (collapsed) return (
    <div className="flex-shrink-0 bg-black border-r border-indigo-500/10 flex flex-col h-full overflow-hidden" style={{width:'52px'}}>
      <div className="flex items-center justify-center py-4 border-b border-white/5">
        <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
          <Zap className="text-white w-4 h-4 fill-current" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {[...SECTIONS[0].items,
          {id:'biz-leads', label:'Business', icon:DollarSign},
          {id:'flashcards', label:'Life Hub', icon:BookOpen},
          ...SECTIONS.slice(1).flatMap(s=>s.items)
        ].map(item => (
          <button key={item.id} onClick={() => setActiveTab(item.id)} title={item.label}
            className={cn("w-full flex items-center justify-center py-2.5 transition-all",
              activeTab===item.id ? "text-indigo-400" : "text-slate-600 hover:text-slate-300")}>
            <item.icon className="w-4 h-4"/>
          </button>
        ))}
      </div>
      <button onClick={() => toggleCollapsed(false)} className="p-3 text-slate-600 hover:text-slate-300 transition-all border-t border-white/5 flex justify-center">
        <ChevronRight className="w-4 h-4"/>
      </button>
    </div>
  );

  return (
    <div className="flex-shrink-0 w-60 bg-black border-r border-indigo-500/10 flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-6 px-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.4)]">
            <Zap className="text-white w-5 h-5 fill-current" />
          </div>
          <h1 className="text-xl font-bold tracking-tighter text-white">NEXUS<span className="text-indigo-500">AI</span></h1>
        </div>

        <nav className="space-y-4">
          {/* Main section */}
          <div>
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em] px-2 mb-1">Main</p>
            <div className="space-y-0.5">
              {SECTIONS[0].items.map(item => (
                <button key={item.id} onClick={() => setActiveTab(item.id)}
                  className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                    activeTab === item.id
                      ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent")}>
                  <item.icon className={cn("w-4 h-4 shrink-0 transition-colors",
                    activeTab === item.id ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300")} />
                  {item.label}
                </button>
              ))}

              {/* Business Hub expandable */}
              <div>
                <button
                  onClick={() => { setBizOpen(!bizOpen); if (!bizOpen) setActiveTab('biz-leads'); }}
                  className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                    isBizActive
                      ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent")}>
                  <DollarSign className={cn("w-4 h-4 shrink-0", isBizActive ? "text-green-400" : "text-slate-500 group-hover:text-slate-300")} />
                  <span className="flex-1 text-left">💰 Business Hub</span>
                  {bizOpen
                    ? <ChevronDown className="w-3.5 h-3.5 opacity-50"/>
                    : <ChevronRight className="w-3.5 h-3.5 opacity-50"/>}
                </button>

                {bizOpen && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/5 pl-3">
                    {BUSINESS_ITEMS.map(item => (
                      <button key={item.id} onClick={() => setActiveTab(item.id)}
                        className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all group",
                          activeTab === item.id
                            ? "bg-white/10 text-white border border-white/10"
                            : "text-slate-500 hover:text-white hover:bg-white/5 border border-transparent")}>
                        <item.icon className={cn("w-3.5 h-3.5 shrink-0", activeTab===item.id ? item.color : "text-slate-600 group-hover:text-slate-400")} />
                        <div className="text-left min-w-0">
                          <p className="truncate">{item.label}</p>
                          {activeTab !== item.id && <p className="text-[9px] text-slate-600 truncate">{item.desc}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Life Hub expandable */}
              <div>
                <button
                  onClick={() => { setLifeOpen(!lifeOpen); if (!lifeOpen) setActiveTab('flashcards'); }}
                  className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                    isLifeActive
                      ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent")}>
                  <BookOpen className={cn("w-4 h-4 shrink-0", isLifeActive ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300")} />
                  <span className="flex-1 text-left">🧠 Life Hub</span>
                  {lifeOpen
                    ? <ChevronDown className="w-3.5 h-3.5 opacity-50"/>
                    : <ChevronRight className="w-3.5 h-3.5 opacity-50"/>}
                </button>

                {lifeOpen && (
                  <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/5 pl-3">
                    {LIFE_ITEMS.map(item => (
                      <button key={item.id} onClick={() => setActiveTab(item.id)}
                        className={cn("w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all group",
                          activeTab === item.id
                            ? "bg-white/10 text-white border border-white/10"
                            : "text-slate-500 hover:text-white hover:bg-white/5 border border-transparent")}>
                        <item.icon className={cn("w-3.5 h-3.5 shrink-0", activeTab===item.id ? item.color : "text-slate-600 group-hover:text-slate-400")} />
                        <div className="text-left min-w-0">
                          <p className="truncate">{item.label}</p>
                          {activeTab !== item.id && <p className="text-[9px] text-slate-600 truncate">{item.desc}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Collapse button */}
          <div className="pt-2 pb-1">
            <button onClick={() => toggleCollapsed(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-400 text-[10px] font-medium transition-all hover:bg-white/3 rounded-xl">
              <ChevronRight className="w-3.5 h-3.5" />
              <span>Collapse sidebar</span>
            </button>
          </div>

          {/* Remaining sections */}
          {SECTIONS.slice(1).map(section => (
            <div key={section.label}>
              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em] px-2 mb-1">{section.label}</p>
              <div className="space-y-0.5">
                {section.items.map(item => (
                  <button key={item.id} onClick={() => setActiveTab(item.id)}
                    className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
                      activeTab === item.id
                        ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                        : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent")}>
                    <item.icon className={cn("w-4 h-4 shrink-0 transition-colors",
                      activeTab === item.id ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300")} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* User card */}
      <div className="p-4 border-t border-white/5 bg-black">
        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">Admin User</p>
            <p className="text-[10px] text-indigo-500 font-mono uppercase tracking-widest">Authorized</p>
          </div>
        </div>
      </div>
    </div>
  );
}
