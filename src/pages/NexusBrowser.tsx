import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Globe, Home, RefreshCw, Shield, ShieldOff, Star, Bookmark, X, Plus, Search } from 'lucide-react';
import { cn } from '@/src/lib/utils';

const HOME_URL = 'https://duckduckgo.com';
const SEARCH_ENGINES: Record<string, string> = {
  duckduckgo: 'https://duckduckgo.com/?q=',
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  brave: 'https://search.brave.com/search?q=',
};

// Quick access bookmarks
const DEFAULT_BOOKMARKS = [
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com', icon: '🦆' },
  { name: 'GitHub', url: 'https://github.com', icon: '🐙' },
  { name: 'Wikipedia', url: 'https://wikipedia.org', icon: '📚' },
  { name: 'Reddit', url: 'https://reddit.com', icon: '🤖' },
  { name: 'YouTube', url: 'https://youtube.com', icon: '📺' },
  { name: 'Stack Overflow', url: 'https://stackoverflow.com', icon: '💻' },
  { name: 'HuggingFace', url: 'https://huggingface.co', icon: '🤗' },
  { name: 'Ollama', url: 'https://ollama.com', icon: '🦙' },
];

function normalizeUrl(input: string, searchEngine: string = 'duckduckgo'): string {
  const raw = input.trim();
  if (!raw) return HOME_URL;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`;
  // Search query
  return `${SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.duckduckgo}${encodeURIComponent(raw)}`;
}

function getHostname(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

export default function NexusBrowser() {
  // Tab system
  interface Tab { id: string; url: string; title: string; loading: boolean; error: string; }
  const [tabs, setTabs] = useState<Tab[]>([{ id: '1', url: HOME_URL, title: 'New Tab', loading: false, error: '' }]);
  const [activeTab, setActiveTab] = useState('1');
  const [inputUrl, setInputUrl] = useState(HOME_URL);
  const [searchEngine, setSearchEngine] = useState(() => localStorage.getItem('nexus_browser_search') || 'duckduckgo');
  const [proxyMode, setProxyMode] = useState(true); // Use proxy by default for CORS bypass
  const [bookmarks, setBookmarks] = useState<typeof DEFAULT_BOOKMARKS>(() => {
    try { return JSON.parse(localStorage.getItem('nexus_browser_bookmarks') || 'null') || DEFAULT_BOOKMARKS; } catch { return DEFAULT_BOOKMARKS; }
  });
  const [showBookmarks, setShowBookmarks] = useState(false);
  
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const tabCounter = useRef(1);

  const currentTab = tabs.find(t => t.id === activeTab) || tabs[0];
  const safeUrl = useMemo(() => normalizeUrl(currentTab?.url || HOME_URL, searchEngine), [currentTab?.url, searchEngine]);

  // Persist settings
  useEffect(() => { localStorage.setItem('nexus_browser_search', searchEngine); }, [searchEngine]);
  useEffect(() => { localStorage.setItem('nexus_browser_bookmarks', JSON.stringify(bookmarks)); }, [bookmarks]);

  // Load page content
  const loadPage = useCallback(async (url: string, tabId: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, loading: true, error: '' } : t));
    
    try {
      if (proxyMode) {
        // Use server proxy to bypass CORS
        const r = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw new Error(`Failed: ${r.status} ${r.statusText}`);
        const ct = r.headers.get('content-type') || '';
        const title = getHostname(url) || 'Page';
        
        if (ct.includes('text/html')) {
          let html = await r.text();
          // Extract title from HTML
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const pageTitle = titleMatch ? titleMatch[1].trim() : title;
          
          if (iframeRef.current && tabId === activeTab) {
            iframeRef.current.srcdoc = html;
          }
          setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title: pageTitle, loading: false } : t));
        } else {
          // Binary content - load directly
          if (iframeRef.current && tabId === activeTab) {
            iframeRef.current.src = `/api/proxy?url=${encodeURIComponent(url)}`;
          }
          setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title, loading: false } : t));
        }
      } else {
        // Direct load (may be blocked by CORS/X-Frame-Options)
        if (iframeRef.current && tabId === activeTab) {
          iframeRef.current.src = url;
        }
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title: getHostname(url), loading: false } : t));
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, loading: false, error: msg } : t));
    }
  }, [proxyMode, activeTab]);

  // Navigate to URL
  const navigate = useCallback((raw: string) => {
    const url = normalizeUrl(raw, searchEngine);
    setTabs(prev => prev.map(t => t.id === activeTab ? { ...t, url, error: '' } : t));
    setInputUrl(url);
    loadPage(url, activeTab);
  }, [activeTab, searchEngine, loadPage]);

  // Reload on tab switch or URL change
  useEffect(() => {
    if (currentTab) {
      setInputUrl(currentTab.url);
      loadPage(currentTab.url, currentTab.id);
    }
  }, [activeTab]);

  // Tab management
  const newTab = () => {
    tabCounter.current++;
    const id = String(tabCounter.current);
    setTabs(prev => [...prev, { id, url: HOME_URL, title: 'New Tab', loading: false, error: '' }]);
    setActiveTab(id);
    setInputUrl(HOME_URL);
  };

  const closeTab = (id: string) => {
    if (tabs.length === 1) return; // Keep at least one tab
    const idx = tabs.findIndex(t => t.id === id);
    setTabs(prev => prev.filter(t => t.id !== id));
    if (activeTab === id) {
      const newIdx = Math.max(0, idx - 1);
      setActiveTab(tabs[newIdx === idx ? newIdx + 1 : newIdx]?.id || tabs[0]?.id);
    }
  };

  const refresh = () => loadPage(currentTab.url, currentTab.id);
  const goHome = () => navigate(HOME_URL);
  const addBookmark = () => {
    if (!bookmarks.some(b => b.url === currentTab.url)) {
      setBookmarks([...bookmarks, { name: currentTab.title, url: currentTab.url, icon: '⭐' }]);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Tab Bar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-black/40 border-b border-white/5 overflow-x-auto">
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs cursor-pointer min-w-[120px] max-w-[200px] group',
              activeTab === tab.id ? 'bg-slate-900 text-white' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
            )}
          >
            <span className="truncate flex-1">{tab.loading ? '⏳' : tab.error ? '⚠️' : '🌐'} {tab.title}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className="opacity-0 group-hover:opacity-100 hover:text-red-400"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button onClick={newTab} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-white">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Bar */}
      <div className="px-3 py-2 border-b border-white/5 bg-black/20">
        <div className="flex items-center gap-2">
          <button onClick={goHome} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
            <Home className="w-4 h-4"/>
          </button>
          <button onClick={refresh} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
            <RefreshCw className={cn('w-4 h-4', currentTab?.loading && 'animate-spin')}/>
          </button>
          
          <form className="flex-1" onSubmit={(e) => { e.preventDefault(); navigate(inputUrl); }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600"/>
              <input
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Enter URL or search..."
                className="w-full bg-slate-900 border border-white/10 rounded-xl pl-10 pr-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/40"
              />
            </div>
          </form>

          {/* Search engine selector */}
          <select
            value={searchEngine}
            onChange={(e) => setSearchEngine(e.target.value)}
            className="px-2 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-slate-400"
          >
            <option value="duckduckgo">🦆 DuckDuckGo</option>
            <option value="google">🔍 Google</option>
            <option value="bing">Ⓜ️ Bing</option>
            <option value="brave">🦁 Brave</option>
          </select>

          {/* Proxy toggle */}
          <button
            onClick={() => setProxyMode(!proxyMode)}
            className={cn('p-2 rounded-lg border text-xs', proxyMode ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-white/10 text-slate-400')}
            title={proxyMode ? 'Proxy ON (bypasses CORS)' : 'Proxy OFF (direct load)'}
          >
            {proxyMode ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
          </button>

          {/* Bookmark current */}
          <button onClick={addBookmark} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-yellow-400 hover:bg-yellow-500/10">
            <Star className="w-4 h-4" />
          </button>

          {/* Open external */}
          <button onClick={() => window.open(safeUrl, '_blank')} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5" title="Open in system browser">
            <ExternalLink className="w-4 h-4"/>
          </button>
        </div>
      </div>

      {/* Bookmarks Bar */}
      <div className="px-3 py-1.5 border-b border-white/5 bg-black/10 flex items-center gap-2 overflow-x-auto">
        {bookmarks.map((b, i) => (
          <button
            key={i}
            onClick={() => navigate(b.url)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-white hover:bg-white/5 whitespace-nowrap"
          >
            <span>{b.icon}</span>
            <span>{b.name}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 relative">
        {currentTab?.error ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 p-8">
            <div className="text-6xl">🚫</div>
            <p className="text-lg font-medium">Failed to load page</p>
            <p className="text-sm text-center max-w-md">{currentTab.error}</p>
            <div className="flex gap-3">
              <button onClick={refresh} className="px-4 py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-sm hover:bg-indigo-600/30">
                Try Again
              </button>
              <button onClick={() => window.open(safeUrl, '_blank')} className="px-4 py-2 rounded-lg bg-slate-700/20 border border-white/10 text-slate-300 text-sm hover:bg-slate-700/30">
                Open External
              </button>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0">
            <iframe
              ref={iframeRef}
              title="Nexus Browser"
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              onLoad={() => setTabs(prev => prev.map(t => t.id === activeTab ? { ...t, loading: false } : t))}
              onError={() => setTabs(prev => prev.map(t => t.id === activeTab ? { ...t, loading: false, error: 'Failed to load inside iframe' } : t))}
            />
            {currentTab?.loading && (
              <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                  <span className="text-sm text-slate-400">Loading...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

