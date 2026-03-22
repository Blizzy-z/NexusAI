/**
 * NexusAI STT Service Web Speech API
 * No AI model, no server, no ffmpeg. Uses the browser's built-in
 * SpeechRecognition (Chromium/Electron). Falls back gracefully.
 */

export type STTCallback = (text: string) => void;
export type STTStatus  = 'idle' | 'listening' | 'processing' | 'error';

// Check support once
export const webSpeechSupported = (): boolean =>
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

const SpeechRecognitionClass = (): any =>
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// Continuous listener fires onResult every time something is heard 
export class ContinuousSTT {
  private rec: any = null;
  private _running = false;
  private _errors = 0; // consecutive errors counter
  private _lang: string;
  public onResult: STTCallback = () => {};
  public onStatus: (s: STTStatus) => void = () => {};
  public onError: (e: string) => void = () => {};

  constructor(lang = 'en-US') {
    this._lang = lang;
  }

  get running() { return this._running; }

  start() {
    if (!webSpeechSupported()) {
      this.onError('Web Speech API not supported in this browser.');
      return;
    }
    if (this._running) return;
    this._running = true;
    this._launch();
  }

  private _launch() {
    if (!this._running) return;
    const R = SpeechRecognitionClass();
    const rec = new R();
    this.rec = rec;
    rec.lang = this._lang;
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => this.onStatus('listening');

    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .filter((r: any) => r.isFinal)
        .map((r: any) => r[0].transcript)
        .join(' ')
        .trim();
      if (transcript) {
        this.onStatus('processing');
        this.onResult(transcript);
      }
    };

    rec.onerror = (e: any) => {
      // Normalize error codes
      const code = (e && e.error) ? String(e.error).toLowerCase() : '';

      if (code === 'aborted' || code === 'no-speech' || code === 'no-speecherror') {
        // Restart silently on no-speech / aborted
        if (this._running) setTimeout(() => this._launch(), 300);
        return;
      }

      // For transient network/service errors, retry a couple times before surfacing
      if (code === 'network' || code === 'network-error' || code === 'service-not-allowed' || code === 'not-allowed') {
        this._errors = (this._errors || 0) + 1;
        if (this._errors <= 2 && this._running) {
          // quick backoff then relaunch
          setTimeout(() => this._launch(), 500 + this._errors * 300);
          return;
        }
        this._errors = 0;
        this.onError('STT network error: check microphone permissions, use Chrome/Electron, or serve via HTTPS on mobile Safari');
        this.onStatus('error');
        return;
      }

      // Unknown/unrecoverable error - report it
      this.onError(`STT error: ${e.error || 'unknown'}`);
      this.onStatus('error');
    };

    rec.onend = () => {
      // Auto-restart unless explicitly stopped
      if (this._running) setTimeout(() => this._launch(), 200);
      else this.onStatus('idle');
    };

    try { rec.start(); } catch { if (this._running) setTimeout(() => this._launch(), 500); }
  }

  stop() {
    this._running = false;
    try { this.rec?.stop(); } catch {}
    try { this.rec?.abort(); } catch {}
    this.rec = null;
    this.onStatus('idle');
  }
}

// One-shot records until silence then fires callback once 
export function listenOnce(lang = 'en-US'): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!webSpeechSupported()) { reject(new Error('Web Speech API not supported')); return; }
    const R = SpeechRecognitionClass();
    const rec = new R();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let done = false;

    rec.onresult = (e: any) => {
      done = true;
      const t = e.results[0]?.[0]?.transcript?.trim() || '';
      resolve(t);
    };
    rec.onerror = (e: any) => {
      if (!done) reject(new Error(e.error));
    };
    rec.onend = () => {
      if (!done) resolve('');
    };

    try { rec.start(); } catch (e) { reject(e); }
  });
}
