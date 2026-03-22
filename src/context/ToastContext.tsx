import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={cn(
                "pointer-events-auto min-w-[300px] max-w-md p-4 rounded-xl shadow-2xl border backdrop-blur-md flex items-start gap-3",
                t.type === 'success' && "bg-emerald-500/10 border-emerald-500/20 text-emerald-100",
                t.type === 'error' && "bg-red-500/10 border-red-500/20 text-red-100",
                t.type === 'warning' && "bg-amber-500/10 border-amber-500/20 text-amber-100",
                t.type === 'info' && "bg-blue-500/10 border-blue-500/20 text-blue-100"
              )}
            >
              <div className={cn( "mt-0.5 shrink-0", t.type === 'success' && "text-emerald-500", t.type === 'error' && "text-red-500", t.type === 'warning' && "text-amber-500", t.type === 'info' && "text-blue-500" )}>
                {t.type === 'success' && <CheckCircle className="w-5 h-5" />}
                {t.type === 'error' && <AlertCircle className="w-5 h-5" />}
                {t.type === 'warning' && <AlertTriangle className="w-5 h-5" />}
                {t.type === 'info' && <Info className="w-5 h-5" />}
              </div>
              <div className="flex-1 pt-0.5">
                <p className="text-sm font-medium leading-relaxed">{t.message}</p>
              </div>
              <button onClick={() => removeToast(t.id)} className="shrink-0 text-white/40 hover:text-white transition-colors" >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
