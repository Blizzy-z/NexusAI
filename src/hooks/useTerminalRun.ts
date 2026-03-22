/**
 * useTerminalRun sends a command to the NexusAI terminal.
 * 1. Tries to inject into open terminal tab via /api/terminal-inject
 * 2. Falls back to opening a new cmd/bash window via /api/run-command
 */
import { useState, useCallback } from 'react';

export type RunStatus = 'idle' | 'running' | 'done' | 'error' | 'no_terminal';

export function useTerminalRun() {
  const [status, setStatus] = useState<RunStatus>('idle');
  const [message, setMessage] = useState('');

  const run = useCallback(async (command: string): Promise<RunStatus> => {
    setStatus('running');
    setMessage('');
    try {
      // 1. Try injecting into open terminal tab
      const injectRes = await fetch('/api/terminal-inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const injectData = await injectRes.json();

      if (injectRes.ok && injectData.ok) {
        setStatus('done');
        setMessage('Sent to terminal OK');
        return 'done';
      }

      // 2. No terminal open open new window
      if (injectData.error === 'no_terminal' || !injectRes.ok) {
        const runRes = await fetch('/api/run-command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
        });
        const runData = await runRes.json();
        if (runRes.ok) {
          setStatus('no_terminal');
          setMessage('Opened new terminal OK');
          return 'no_terminal';
        }
        throw new Error(runData.error || 'Failed');
      }

      throw new Error(injectData.error || 'Failed');
    } catch (e: any) {
      setStatus('error');
      setMessage(e.message || 'Error');
      return 'error';
    }
  }, []);

  const reset = useCallback(() => { setStatus('idle'); setMessage(''); }, []);
  return { run, status, message, reset };
}
