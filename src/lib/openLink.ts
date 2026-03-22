// Open a URL in the system browser works in both Electron and web
export function openLink(url: string) {
  if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
    (window as any).electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
