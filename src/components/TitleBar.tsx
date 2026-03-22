import React, { useState, useEffect } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    // Check if running in Electron
    if (window.electronAPI) {
      setIsElectron(true);
    }
  }, []);

  if (!isElectron) return null;

  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize();
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  return (
    <div className="h-8 bg-slate-950 flex items-center justify-between px-2 select-none drag-region border-b border-white/5">
      <div className="flex items-center gap-2 px-2">
        <div className="w-3 h-3 bg-indigo-500 rounded-full opacity-50" />
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">NexusAI Desktop</span>
      </div>
      <div className="flex items-center no-drag">
        <button onClick={handleMinimize} className="h-8 w-10 flex items-center justify-center text-slate-500 hover:bg-white/5 hover:text-white transition-colors" >
          <Minus className="w-4 h-4" />
        </button>
        <button onClick={handleMaximize} className="h-8 w-10 flex items-center justify-center text-slate-500 hover:bg-white/5 hover:text-white transition-colors" >
          <Square className="w-3 h-3" />
        </button>
        <button onClick={handleClose} className="h-8 w-10 flex items-center justify-center text-slate-500 hover:bg-red-500 hover:text-white transition-colors" >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
