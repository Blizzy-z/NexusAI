import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Home, RefreshCw, Shield, ShieldOff, Star, X, Plus, Search } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { openLink } from '@/src/lib/openLink';

const HOME_URL = 'https://duckduckgo.com';
const SEARCH_ENGINES: Record<string, string> = {
  duckduckgo: 'https://duckduckgo.com/?q=',
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  brave: 'https://search.brave.com/search?q=',
};

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

type Tab = {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  error: string;
};

type BrowserHost = (HTMLIFrameElement & {
  loadURL?: (url: string) => void;
  canGoBack?: () => boolean;
  canGoForward?: () => boolean;
  goBack?: () => void;
  goForward?: () => void;
  getURL?: () => string;
  addEventListener?: (type: string, listener: (event: any) => void) => void;
  removeEventListener?: (type: string, listener: (event: any) => void) => void;
}) | null;

function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
}

function normalizeUrl(input: string, searchEngine = 'duckduckgo'): string {
  const raw = input.trim();
  if (!raw) return HOME_URL;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`;
  return `${SEARCH_ENGINES[searchEngine] || SEARCH_ENGINES.duckduckgo}${encodeURIComponent(raw)}`;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export default function NexusBrowser() {
  const [tabs, setTabs] = useState<Tab[]>([{ id: '1', url: HOME_URL, title: 'New Tab', loading: false, error: '' }]);
  const [activeTab, setActiveTab] = useState('1');
  const [inputUrl, setInputUrl] = useState(HOME_URL);
  const [searchEngine, setSearchEngine] = useState(() => localStorage.getItem('nexus_browser_search') || 'duckduckgo');
  const [isElectron, setIsElectron] = useState(() => isElectronRuntime());
  const [proxyMode, setProxyMode] = useState(() => !isElectronRuntime());
  const [bookmarks, setBookmarks] = useState<typeof DEFAULT_BOOKMARKS>(() => {
    try {
      return JSON.parse(localStorage.getItem('nexus_browser_bookmarks') || 'null') || DEFAULT_BOOKMARKS;
    } catch {
      return DEFAULT_BOOKMARKS;
    }
  });
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const viewRef = useRef<BrowserHost>(null);
  const tabCounter = useRef(1);
  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];
  const safeUrl = useMemo(() => normalizeUrl(currentTab?.url || HOME_URL, searchEngine), [currentTab?.url, searchEngine]);

  useEffect(() => {
    setIsElectron(isElectronRuntime());
  }, []);

  useEffect(() => {
    localStorage.setItem('nexus_browser_search', searchEngine);
  }, [searchEngine]);

  useEffect(() => {
    localStorage.setItem('nexus_browser_bookmarks', JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    if (isElectron) setProxyMode(false);
  }, [isElectron]);

  const patchTab = useCallback((tabId: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...patch } : t)));
  }, []);

  const refreshNavButtons = useCallback(() => {
    if (!isElectron) {
      setCanGoBack(false);
      setCanGoForward(false);
      return;
    }
    const host = viewRef.current;
    if (!host) return;
    setCanGoBack(Boolean(host.canGoBack?.()));
    setCanGoForward(Boolean(host.canGoForward?.()));
  }, [isElectron]);

  const loadPage = useCallback(async (url: string, tabId: string) => {
    if (!url || url === 'about:blank') return;
    patchTab(tabId, { loading: true, error: '', url });

    if (isElectron) {
      const host = viewRef.current;
      if (host && tabId === activeTab) {
        try {
          if (typeof host.loadURL === 'function') host.loadURL(url);
          else host.src = url;
        } catch {
          host.src = url;
        }
      }
      patchTab(tabId, { title: getHostname(url) || 'Page', loading: false });
      return;
    }

    const frame = viewRef.current as HTMLIFrameElement | null;
    if (!frame || tabId !== activeTab) return;

    try {
      if (proxyMode) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, {
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const contentType = response.headers.get('content-type') || '';
        const title = getHostname(url) || 'Page';
        if (contentType.includes('text/html')) {
          const html = await response.text();
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const pageTitle = titleMatch ? titleMatch[1].trim().slice(0, 64) : title;
          frame.srcdoc = html;
          patchTab(tabId, { title: pageTitle, loading: false });
        } else {
          frame.src = `/api/proxy?url=${encodeURIComponent(url)}`;
          patchTab(tabId, { title, loading: false });
        }
      } else {
        frame.src = url;
        patchTab(tabId, { title: getHostname(url) || 'Page', loading: false });
      }
    } catch (error: any) {
      const message = error?.name === 'AbortError' ? 'Request timed out' : (error?.message || 'Failed to load');
      patchTab(tabId, { loading: false, error: message });
    }
  }, [activeTab, isElectron, patchTab, proxyMode]);

  const navigate = useCallback((raw: string) => {
    const url = normalizeUrl(raw, searchEngine);
    setInputUrl(url);
    patchTab(activeTab, { url, error: '' });
    loadPage(url, activeTab);
  }, [activeTab, loadPage, patchTab, searchEngine]);

  useEffect(() => {
    if (!currentTab) return;
    setInputUrl(currentTab.url);
    loadPage(currentTab.url, currentTab.id);
  }, [activeTab]);

  useEffect(() => {
    if (!isElectron) return;
    const host = viewRef.current;
    if (!host?.addEventListener) return;

    const onStart = () => patchTab(activeTab, { loading: true, error: '' });
    const onStop = () => {
      patchTab(activeTab, { loading: false });
      try {
        const currentUrl = host.getURL?.();
        if (currentUrl) {
          setInputUrl(currentUrl);
          patchTab(activeTab, { url: currentUrl, title: getHostname(currentUrl) || 'Page' });
        }
      } catch {
        // ignore
      }
      refreshNavButtons();
    };
    const onNavigate = (event: any) => {
      const nextUrl = event?.url || host.getURL?.();
      if (!nextUrl) return;
      setInputUrl(nextUrl);
      patchTab(activeTab, { url: nextUrl, title: getHostname(nextUrl) || 'Page', error: '' });
      refreshNavButtons();
    };
    const onTitle = (event: any) => {
      const title = String(event?.title || '').trim();
      if (title) patchTab(activeTab, { title: title.slice(0, 80) });
    };
    const onFail = (event: any) => {
      if (Number(event?.errorCode) === -3) return;
      const code = event?.errorCode ?? 'ERR';
      const desc = event?.errorDescription || 'Failed to load';
      patchTab(activeTab, { loading: false, error: `${code}: ${desc}` });
    };
    const onNewWindow = (event: any) => {
      const target = String(event?.url || '').trim();
      if (target) openLink(target);
    };

    host.addEventListener('did-start-loading', onStart);
    host.addEventListener('did-stop-loading', onStop);
    host.addEventListener('did-navigate', onNavigate);
    host.addEventListener('did-navigate-in-page', onNavigate);
    host.addEventListener('page-title-updated', onTitle);
    host.addEventListener('did-fail-load', onFail);
    host.addEventListener('new-window', onNewWindow);

    return () => {
      host.removeEventListener?.('did-start-loading', onStart);
      host.removeEventListener?.('did-stop-loading', onStop);
      host.removeEventListener?.('did-navigate', onNavigate);
      host.removeEventListener?.('did-navigate-in-page', onNavigate);
      host.removeEventListener?.('page-title-updated', onTitle);
      host.removeEventListener?.('did-fail-load', onFail);
      host.removeEventListener?.('new-window', onNewWindow);
    };
  }, [activeTab, isElectron, patchTab, refreshNavButtons]);

  const newTab = () => {
    tabCounter.current += 1;
    const id = String(tabCounter.current);
    setTabs((prev) => [...prev, { id, url: HOME_URL, title: 'New Tab', loading: false, error: '' }]);
    setActiveTab(id);
    setInputUrl(HOME_URL);
  };

  const closeTab = (id: string) => {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === id);
    const nextTabs = tabs.filter((t) => t.id !== id);
    setTabs(nextTabs);
    if (activeTab === id) {
      const fallback = nextTabs[Math.max(0, idx - 1)] || nextTabs[0];
      if (fallback) setActiveTab(fallback.id);
    }
  };

  const addBookmark = () => {
    if (!currentTab?.url) return;
    if (bookmarks.some((b) => b.url === currentTab.url)) return;
    setBookmarks((prev) => [...prev, { name: currentTab.title || getHostname(currentTab.url) || 'Bookmark', url: currentTab.url, icon: '⭐' }]);
  };

  const goBack = () => {
    const host = viewRef.current;
    if (!host) return;
    if (isElectron && host.canGoBack?.()) {
      host.goBack?.();
      return;
    }
    try {
      (host as HTMLIFrameElement).contentWindow?.history.back();
    } catch {
      // ignore cross-origin
    }
  };

  const goForward = () => {
    const host = viewRef.current;
    if (!host) return;
    if (isElectron && host.canGoForward?.()) {
      host.goForward?.();
      return;
    }
    try {
      (host as HTMLIFrameElement).contentWindow?.history.forward();
    } catch {
      // ignore cross-origin
    }
  };

  const refresh = () => {
    if (!currentTab) return;
    loadPage(currentTab.url, currentTab.id);
  };

  const goHome = () => navigate(HOME_URL);

  return (
    <div className="h-full flex flex-col bg-slate-950 min-w-0">
      <div className="flex items-center gap-1 px-2 py-1 bg-black/40 border-b border-white/5 overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs cursor-pointer min-w-[120px] max-w-[220px] group',
              activeTab === tab.id ? 'bg-slate-900 text-white' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
            )}
          >
            <span className="truncate flex-1">{tab.loading ? '⏳' : tab.error ? '⚠️' : '🌐'} {tab.title}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-red-400"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button onClick={newTab} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-white" title="New tab">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-white/5 bg-black/20">
        <div className="flex items-center gap-2">
          <button onClick={goBack} disabled={isElectron && !canGoBack} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-40">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button onClick={goForward} disabled={isElectron && !canGoForward} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-40">
            <ArrowRight className="w-4 h-4" />
          </button>
          <button onClick={goHome} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
            <Home className="w-4 h-4" />
          </button>
          <button onClick={refresh} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
            <RefreshCw className={cn('w-4 h-4', currentTab?.loading && 'animate-spin')} />
          </button>

          <form className="flex-1 min-w-0" onSubmit={(e) => { e.preventDefault(); navigate(inputUrl); }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
              <input
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Enter URL or search..."
                className="w-full bg-slate-900 border border-white/10 rounded-xl pl-10 pr-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/40"
              />
            </div>
          </form>

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

          <button
            onClick={() => !isElectron && setProxyMode((v) => !v)}
            disabled={isElectron}
            className={cn(
              'p-2 rounded-lg border text-xs disabled:opacity-50',
              proxyMode ? 'border-green-500/30 text-green-400 bg-green-500/10' : 'border-white/10 text-slate-400'
            )}
            title={isElectron ? 'Electron uses direct webview mode' : (proxyMode ? 'Proxy ON (bypasses CORS)' : 'Proxy OFF (direct load)')}
          >
            {proxyMode ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
          </button>

          <button onClick={addBookmark} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-yellow-400 hover:bg-yellow-500/10">
            <Star className="w-4 h-4" />
          </button>

          <button onClick={() => openLink(safeUrl)} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5" title="Open in system browser">
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>

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

      <div className="flex-1 relative min-w-0">
        {currentTab?.error ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 p-8">
            <div className="text-6xl">🚫</div>
            <p className="text-lg font-medium">Failed to load page</p>
            <p className="text-sm text-center max-w-md">{currentTab.error}</p>
            <div className="flex gap-3">
              <button onClick={refresh} className="px-4 py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-sm hover:bg-indigo-600/30">
                Try Again
              </button>
              <button onClick={() => openLink(safeUrl)} className="px-4 py-2 rounded-lg bg-slate-700/20 border border-white/10 text-slate-300 text-sm hover:bg-slate-700/30">
                Open External
              </button>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0">
            {isElectron
              ? React.createElement('webview', {
                  ref: (node: any) => { viewRef.current = node; },
                  src: safeUrl,
                  className: 'w-full h-full border-0 bg-white',
                  allowpopups: 'true',
                  partition: 'persist:nexus-browser',
                  webpreferences: 'contextIsolation=yes,sandbox=yes,nativeWindowOpen=yes',
                })
              : (
                <iframe
                  ref={(node) => { viewRef.current = node as BrowserHost; }}
                  title="Nexus Browser"
                  className="w-full h-full border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  onLoad={() => patchTab(activeTab, { loading: false, error: '' })}
                  onError={() => patchTab(activeTab, { loading: false, error: 'Failed to load inside iframe' })}
                />
              )}
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
