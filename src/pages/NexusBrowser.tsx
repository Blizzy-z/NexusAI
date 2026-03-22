import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Globe, Home, RefreshCw } from 'lucide-react';
import { cn } from '@/src/lib/utils';

const HOME_URL = 'https://duckduckgo.com';
const ALLOWLIST = [
  'duckduckgo.com', 'example.com', 'wikipedia.org', 'github.com', 'localhost'
];

function normalizeUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return HOME_URL;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(raw)}`;
}

export default function NexusBrowser() {
  const debugLog = (runId: string, hypothesisId: string, location: string, message: string, data: Record<string, unknown>) => {
    // #region agent log
    fetch('http://127.0.0.1:7260/ingest/5f56a8b4-730a-4b8c-8889-3fdd43644d03',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'037707'},body:JSON.stringify({sessionId:'037707',runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  };

  const [currentUrl, setCurrentUrl] = useState(HOME_URL);
  const [inputUrl, setInputUrl] = useState(HOME_URL);
  const [history, setHistory] = useState<string[]>([HOME_URL]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const canGoBack = historyIdx > 0;
  const canGoForward = historyIdx < history.length - 1;
  const safeUrl = useMemo(() => normalizeUrl(currentUrl), [currentUrl]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    setLoading(true);

    const origin = (() => { try { return new URL(safeUrl).hostname } catch { return ''; } })();
    if (!ALLOWLIST.some(a => origin.includes(a))) {
      setLoadError('Site not allowed by browser allowlist. Open externally if needed.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const r = await fetch(`/api/proxy?url=${encodeURIComponent(safeUrl)}`);
        const ct = r.headers.get('content-type') || '';
        if (ct.includes('text/html')) {
          const html = await r.text();
          if (!cancelled && iframeRef.current) iframeRef.current.srcdoc = html;
        } else {
          if (!cancelled && iframeRef.current) iframeRef.current.src = `/api/proxy?url=${encodeURIComponent(safeUrl)}`;
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [safeUrl]);

  const navigate = (raw: string) => {
    const next = normalizeUrl(raw);
    setLoadError('');
    setLoading(true);
    setCurrentUrl(next);
    setInputUrl(next);
    setHistory((prev) => {
      const base = prev.slice(0, historyIdx + 1);
      const updated = [...base, next];
      setHistoryIdx(updated.length - 1);
      return updated;
    });
    // #region agent log
    debugLog('pre-fix', 'B1', 'NexusBrowser.tsx:navigate', 'Browser navigate triggered', { raw, next });
    // #endregion
  };

  const goBack = () => {
    if (!canGoBack) return;
    const idx = historyIdx - 1;
    const target = history[idx];
    setHistoryIdx(idx);
    setCurrentUrl(target);
    setInputUrl(target);
    setLoadError('');
    setLoading(true);
    // #region agent log
    debugLog('pre-fix', 'B2', 'NexusBrowser.tsx:goBack', 'Browser back navigation', { idx, target });
    // #endregion
  };

  const goForward = () => {
    if (!canGoForward) return;
    const idx = historyIdx + 1;
    const target = history[idx];
    setHistoryIdx(idx);
    setCurrentUrl(target);
    setInputUrl(target);
    setLoadError('');
    setLoading(true);
    // #region agent log
    debugLog('pre-fix', 'B3', 'NexusBrowser.tsx:goForward', 'Browser forward navigation', { idx, target });
    // #endregion
  };

  const refresh = () => {
    setLoadError('');
    setLoading(true);
    setCurrentUrl((u) => `${u.split('#')[0]}#${Date.now()}`);
    // #region agent log
    debugLog('pre-fix', 'B4', 'NexusBrowser.tsx:refresh', 'Browser refresh requested', { currentUrl });
    // #endregion
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      <div className="px-4 py-3 border-b border-white/5 bg-black/30">
        <div className="flex items-center gap-2">
          <button onClick={goBack} disabled={!canGoBack} className={cn('p-2 rounded-lg border border-white/10 text-slate-400', canGoBack ? 'hover:text-white hover:bg-white/5' : 'opacity-40 cursor-not-allowed')}>
            <ArrowLeft className="w-4 h-4"/>
          </button>
          <button onClick={goForward} disabled={!canGoForward} className={cn('p-2 rounded-lg border border-white/10 text-slate-400', canGoForward ? 'hover:text-white hover:bg-white/5' : 'opacity-40 cursor-not-allowed')}>
            <ArrowRight className="w-4 h-4"/>
          </button>
          <button onClick={refresh} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')}/>
          </button>
          <button onClick={() => navigate(HOME_URL)} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5">
            <Home className="w-4 h-4"/>
          </button>
          <form className="flex-1" onSubmit={(e) => { e.preventDefault(); navigate(inputUrl); }}>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600"/>
              <input value={inputUrl} onChange={(e) => setInputUrl(e.target.value)} placeholder="Enter URL or search"
                className="w-full bg-slate-900 border border-white/10 rounded-xl pl-10 pr-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/40"/>
            </div>
          </form>
          <div className="flex gap-2">
            <button onClick={() => window.open(safeUrl, '_blank')} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5" title="Open in external browser">
              <ExternalLink className="w-4 h-4"/>
            </button>
            <button onClick={() => { const url = normalizeUrl(inputUrl); window.open(`/api/proxy?url=${encodeURIComponent(url)}`, '_blank'); }} className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5" title="Open via proxy in external browser">
              <ExternalLink className="w-4 h-4"/>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 relative">
        {loadError ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
            <p className="text-sm">This site blocked embedding.</p>
            <p className="text-xs">{loadError}</p>
            <button onClick={() => window.open(safeUrl, '_blank')} className="px-3 py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-sm hover:bg-indigo-600/30">
              Open in system browser
            </button>
          </div>
        ) : (
            <div className="absolute inset-0">
              <iframe
                ref={iframeRef}
                title="Nexus Browser"
                src=""
                className="w-full h-full border-0"
                onLoad={() => {
                  setLoading(false);
                  debugLog('post-fix', 'B5', 'NexusBrowser.tsx:iframe:onLoad', 'Iframe load success', { safeUrl });
                }}
                onError={() => {
                  setLoading(false);
                  setLoadError('Failed to load inside iframe.');
                  debugLog('post-fix', 'B6', 'NexusBrowser.tsx:iframe:onError', 'Iframe load error', { safeUrl });
                }}
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
              {loading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">Loading...</div>}
            </div>
        )}
      </div>
    </div>
  );
}

