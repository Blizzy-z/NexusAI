export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  reasoning?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  projectId?: string;
  systemPrompt?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface Model {
  id: string;
  name: string;
  provider: 'ollama' | 'gemini' | 'huggingface';
  size?: string;
  quantization?: string;
  status: 'idle' | 'downloading' | 'loaded' | 'offline';
  progress?: number;
}

export interface BackendStatus {
  connected: boolean;
  vram_total_gb: number;
  vram_used_gb: number;
  flux_loaded: boolean;
  ltx_loaded: boolean;
}
