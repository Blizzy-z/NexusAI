import React, { createContext, useContext, useState, useEffect } from 'react';

// Settings shape 
export interface Settings {
  ollama: { host: string; port: string; remoteHost: string; remotePort: string; useRemote: boolean };
  wol: { mac: string; broadcastIp: string; port: string; enabled: boolean };
  kali:   { ip: string; user: string; pass: string; port: string };
  ssh:    { ip: string; user: string; pass: string; port: string };
  // Remote NexusAI server (laptop connecting to this PC)
  remoteServer: {
    enabled: boolean;
    port: string;
    token: string;        // shared auth token
    allowedOrigins: string; // comma-separated
  };
  userProfile: UserProfile;
  // Provider API keys (all stored here so any page can read them)
  providers: {
    gemini:       string;
    openai:       string;
    anthropic:    string;
    groq:         string;
    openrouter:   string;
    mistral:      string;
    togetherai:   string;
    xai:          string;      // Grok
    deepseek:     string;
    perplexity:   string;
    elevenLabs:   string;
    elevenLabsVoice: string;
    stabilityai:  string;
    huggingface:  string;
    replicate:    string;
  };
}

export interface UserProfile {
  name: string;
  displayName: string;
  avatar: string;
  bio: string;
  voiceId: string;
  voiceEnrolled: boolean;
  voicePassword: string;   // password required to re-enroll voice
  voiceSamples: number[][];// raw fingerprint samples saved locally
  elevenLabsVoice: string;
  language: string;
  timezone: string;
  occupation: string;
  assistantName: string;
  assistantPersonality: string;
  sidebarModel: string;    // persisted sidebar AI model
  // Extended profile fields
  age: string;
  location: string;
  interests: string;
  goals: string;
  relationship: string;
  personality: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  details: { parameter_size: string; quantization_level: string; family: string };
}

interface SettingsContextType {
  settings: Settings;
  updateSettings: (s: Partial<Settings>) => void;
  updateProviders: (p: Partial<Settings['providers']>) => void;
  models: OllamaModel[];
  refreshModels: () => Promise<void>;
  pullModel: (name: string) => Promise<void>;
  deleteModel: (name: string) => Promise<void>;
  isPulling: boolean;
  pullProgress: number;
  userProfile: UserProfile;
  updateUserProfile: (p: Partial<UserProfile>) => void;
}

// Defaults 
const defaultSettings: Settings = {
  ollama:  { host: 'http://localhost', port: '11434', remoteHost: '', remotePort: '11434', useRemote: false },
  userProfile: {
    name: 'User', displayName: 'User', avatar: '🧑💻', bio: '',
    voiceId: '', voiceEnrolled: false, voicePassword: '', voiceSamples: [], elevenLabsVoice: '21m00Tcm4TlvDq8ikWAM', sidebarModel: '__gemini__',
    language: 'en-US', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    occupation: '', assistantName: 'Nexus', assistantPersonality: 'helpful',
    age: '', location: '', interests: '', goals: '', relationship: '', personality: '',
  },
  wol: { mac: '', broadcastIp: '255.255.255.255', port: '9', enabled: false },
  kali:    { ip: '192.168.1.100', user: 'kali', pass: 'kali', port: '22' },
  ssh:     { ip: '127.0.0.1', user: 'root', pass: 'toor', port: '22' },
  remoteServer: {
    enabled: false,
    port: '4200',
    token: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
    allowedOrigins: '*',
  },
  providers: {
    gemini:          '',
    openai:          '',
    anthropic:       '',
    groq:            '',
    openrouter:      '',
    mistral:         '',
    togetherai:      '',
    xai:             '',
    deepseek:        '',
    perplexity:      '',
    elevenLabs:      '',
    elevenLabsVoice: '21m00Tcm4TlvDq8ikWAM',
    stabilityai:     '',
    huggingface:     '',
    replicate:       '',
  },
};

// Merge saved settings over defaults so new keys always appear
function mergeSettings(saved: any): Settings {
  return {
    ...defaultSettings,
    ...saved,
    providers: { ...defaultSettings.providers, ...(saved?.providers ?? {}) },
    remoteServer: { ...defaultSettings.remoteServer, ...(saved?.remoteServer ?? {}) },
    ollama: { ...defaultSettings.ollama, ...(saved?.ollama ?? {}) },
    wol:    { ...defaultSettings.wol,    ...(saved?.wol    ?? {}) },
    kali:   { ...defaultSettings.kali,   ...(saved?.kali   ?? {}) },
    ssh:    { ...defaultSettings.ssh,    ...(saved?.ssh    ?? {}) },
  };
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem('nexus_settings');
      return saved ? mergeSettings(JSON.parse(saved)) : defaultSettings;
    } catch { return defaultSettings; }
  });

  const [models, setModels] = useState<OllamaModel[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('nexus_user_profile');
    return saved ? { ...defaultSettings.userProfile, ...JSON.parse(saved) } : defaultSettings.userProfile;
  });
  const updateUserProfile = (p: Partial<UserProfile>) => {
    setUserProfile(prev => {
      const updated = { ...prev, ...p };
      localStorage.setItem('nexus_user_profile', JSON.stringify(updated));
      return updated;
    });
  };
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);

  useEffect(() => {
    localStorage.setItem('nexus_settings', JSON.stringify(settings));
    // Mirror legacy keys for backward compat
    if (settings.providers.gemini)     localStorage.setItem('gemini_api_key', settings.providers.gemini);
    if (settings.providers.elevenLabs) localStorage.setItem('elevenlabs_api_key', settings.providers.elevenLabs);
    if (settings.providers.elevenLabsVoice) localStorage.setItem('elevenlabs_voice_id', settings.providers.elevenLabsVoice);
  }, [settings]);

  const updateSettings = (s: Partial<Settings>) =>
    setSettings(prev => ({ ...prev, ...s }));

  const updateProviders = (p: Partial<Settings['providers']>) =>
    setSettings(prev => ({ ...prev, providers: { ...prev.providers, ...p } }));

  const ollamaBase = () => settings.ollama.useRemote && settings.ollama.remoteHost
    ? `http://${settings.ollama.remoteHost}:${settings.ollama.remotePort}`
    : `${settings.ollama.host}:${settings.ollama.port}`;

  const refreshModels = async () => {
    try {
      const res = await fetch(`${ollamaBase()}/api/tags`);
      const data = await res.json();
      if (data.models) setModels(data.models);
    } catch { setModels([]); }
  };

  const pullModel = async (name: string) => {
    setIsPulling(true); setPullProgress(0);
    try {
      const res = await fetch(`${ollamaBase()}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, stream: true }),
      });
      if (!res.body) throw new Error('No body');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            if (obj.total && obj.completed) {
              setPullProgress(Math.round((obj.completed / obj.total) * 100));
            }
          } catch {}
        }
      }
      await refreshModels();
    } catch (e) { console.error('pull failed', e); }
    finally { setIsPulling(false); setPullProgress(100); }
  };

  const deleteModel = async (name: string) => {
    try {
      await fetch(`${ollamaBase()}/api/delete`, {
        method: 'DELETE',
        body: JSON.stringify({ name }),
      });
      await refreshModels();
    } catch (e) { console.error('delete failed', e); }
  };

  useEffect(() => { refreshModels(); }, [settings.ollama]);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, updateProviders, models, refreshModels, pullModel, deleteModel, isPulling, pullProgress, userProfile, updateUserProfile }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};
