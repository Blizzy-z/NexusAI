import { GoogleGenAI } from "@google/genai";

const DEFAULT_MAIN_SYSTEM_PROMPT =
  "You are Nexus, a highly capable AI assistant running locally on this machine. You are helpful, direct, and technically precise.";

type NexusSettings = {
  aiPersona?: string;
  defaultModel?: string;
  geminiApiKey?: string;
  ollamaUrl?: string;
  providers?: { gemini?: string };
  ollama?: { host?: string; port?: string };
};

function readNexusSettings(): NexusSettings {
  try {
    return JSON.parse(localStorage.getItem('nexus_settings') || '{}');
  } catch {
    return {};
  }
}

export function getGlobalSystemPrompt(): string {
  const settings = readNexusSettings();
  const fromSettings = String(settings?.aiPersona || '').trim();
  return fromSettings || DEFAULT_MAIN_SYSTEM_PROMPT;
}

export function resolveSystemPrompt(pagePrompt?: string): string {
  const globalPrompt = getGlobalSystemPrompt();
  const scopedPrompt = String(pagePrompt || '').trim();
  if (!scopedPrompt) return globalPrompt;
  if (scopedPrompt.includes(globalPrompt)) return scopedPrompt;
  return `${globalPrompt}\n\nAdditional page instructions:\n${scopedPrompt}`;
}

export function getDefaultModelFromSettings(): string {
  const settings = readNexusSettings();
  const model = String(settings?.defaultModel || '').trim();
  return model || 'mdq100/Gemma3-Instruct-Abliterated:12b';
}

function getOllamaBaseFromSettings(): string {
  const settings = readNexusSettings();
  const host = String(settings?.ollama?.host || '').trim().replace(/\/$/, '');
  const port = String(settings?.ollama?.port || '11434').trim();
  if (host) return /:\d+$/.test(host) ? host : `${host}:${port}`;
  const explicit = String(settings?.ollamaUrl || '').trim().replace(/\/$/, '');
  if (explicit) return explicit;
  return 'http://127.0.0.1:11434';
}

// Strip Qwen3/3.5 thinking tokens from model output.
// These models output <think>...</think> before the actual answer.
// The content inside is the model's internal reasoning chain not the response.
// We always strip it. If the caller wants reasoning shown separately, they
// can call extractThinking() first to get the think block before stripping.
export function stripThinkingTags(text: string): string {
  if (!text) return text;
  // Remove complete <think>...</think> blocks (greedy=false to handle multiple)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Also catch the edge case where the model output starts mid-think
  cleaned = cleaned.replace(/<think>[\s\S]*/gi, '');
  // Trim whitespace left by the removed block
  return cleaned.trim();
}

// Extract the thinking content separately (for showing reasoning in UI)
export function extractThinking(text: string): string {
  const match = text.match(/<think>([\s\S]*?)<\/think>/i);
  return match ? match[1].trim() : '';
}

// Helper to get Gemini key from any storage location
function getGeminiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const direct = localStorage.getItem('gemini_api_key');
  if (direct) return direct;
  try {
    const s = JSON.parse(localStorage.getItem('nexus_settings') || '{}');
    if (s?.providers?.gemini) return s.providers.gemini;
    if (s?.geminiApiKey) return s.geminiApiKey;
  } catch {}
  try {
    const mobile = JSON.parse(localStorage.getItem('nxa_settings') || '{}');
    return mobile?.geminiKey || '';
  } catch { return ''; }
}

// Safety settings BLOCK_NONE on all categories 
const NO_FILTERS = [
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

export const getGeminiResponse = async (prompt: string, systemInstruction?: string, modelName: string = "mdq100/Gemma3-Instruct-Abliterated:12b", tools?: any[]) => {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("Gemini API Key is missing. Please add it in Settings -> API Providers -> Google Gemini.");

  const sys = resolveSystemPrompt(systemInstruction);
  const requestedModel = String(modelName || '').trim();
  const resolvedModel = requestedModel.startsWith('gemini')
    ? requestedModel
    : (requestedModel.includes('/') ? 'gemini-2.0-flash' : requestedModel || 'gemini-2.0-flash');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`;
  const body: any = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: sys }] },
    generationConfig: { temperature: 0.9, topP: 0.95, maxOutputTokens: 8192 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };
  if (tools) body.tools = tools;

  try {
    const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json() as any;
    if (!res.ok) throw new Error(data?.error?.message || `Gemini error ${res.status}`);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { text, reasoning: '' };
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const getOllamaResponse = async (prompt: string, model: string, systemPrompt?: string) => {
  try {
    const ollamaUrl = getOllamaBaseFromSettings();
    const selectedModel = String(model || '').trim() || getDefaultModelFromSettings();
    const effectiveSystemPrompt = resolveSystemPrompt(systemPrompt);

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        prompt: prompt,
        system: effectiveSystemPrompt,
        stream: false,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API Error: ${response.statusText}`);
    }

    const data = await response.json();
    return stripThinkingTags(data.response || '');
  } catch (error) {
    console.error("Ollama Error:", error);
    throw error;
  }
};

// Ollama chat (with history + system prompt injected as role:system) 
export const getOllamaChatResponse = async (
  messages: { role: "user" | "assistant"; content: string; images?: string[] }[],
  model: string,
  systemPrompt?: string
): Promise<string> => {
  const base = getOllamaBaseFromSettings();

  // Resolve exact model name from what's installed
  const requestedModel = String(model || '').trim() || getDefaultModelFromSettings();
  let resolvedModel = requestedModel;
  try {
    const tagsRes = await fetch(`${base}/api/tags`);
    if (tagsRes.ok) {
      const tags = await tagsRes.json();
      const installed: string[] = (tags.models || []).map((m: any) => m.name);
      // Try exact match first
      const exact = installed.find(n => n === requestedModel);
      // Try name without tag (e.g. "dolphin-llama3" matches "dolphin-llama3:latest")
      const nameOnly = installed.find(n => n.split(':')[0] === requestedModel.split(':')[0]);
      // Try partial match
      const partial = installed.find(n => n.includes(requestedModel.split(':')[0]));
      resolvedModel = exact || nameOnly || partial || requestedModel;
      if (resolvedModel !== requestedModel) console.log(`[Ollama] Resolved "${requestedModel}" -> "${resolvedModel}"`);
    }
  } catch {}

  const effectiveSystemPrompt = resolveSystemPrompt(systemPrompt);
  const finalMessages: any[] = [{ role: 'system', content: effectiveSystemPrompt }, ...messages];

  let response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: resolvedModel, messages: finalMessages, stream: false, options: { temperature: 1.0, top_p: 0.95, repeat_penalty: 1.1 } }),
  });
  // Fallback for older Ollama (< 0.1.14) that lacks /api/chat
  if (response.status === 404) {
    const userMsg = finalMessages.filter((m:any) => m.role !== 'system').map((m:any) => m.content).join('\n');
    const sysMsg  = (finalMessages.find((m:any) => m.role === 'system') as any)?.content || effectiveSystemPrompt;
    response = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: resolvedModel, prompt: userMsg, system: sysMsg, stream: false, options: { temperature: 1.0 } }),
    });
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Ollama error (${response.status}): ${errText.slice(0,200)}\n\nModel tried: "${resolvedModel}"\nRun: ollama pull ${requestedModel}`);
  }
  const data = await response.json();
  const raw = data.message?.content || (data as any).response || "";
  // Strip Qwen3/3.5 thinking tokens the model outputs <think>...</think> before
  // its actual response. We strip the entire block and return only the clean answer.
  return stripThinkingTags(raw);
};

// GEMINI_MODELS constant 
export const GEMINI_MODELS = {
  FLASH:      "gemini-2.0-flash",
  FLASH_EXP:  "gemini-2.0-flash",
  PRO:        "gemini-2.5-pro-preview-06-05",
  FLASH_LITE: "gemini-3.1-flash-lite-preview",
  FLASH_25:   "gemini-2.5-flash-preview-05-20",
};

// Gemini chat uses raw REST API for maximum control + no SDK quirks 
export const getGeminiChatResponse = async (
  messages: { role: string; content: string }[],
  systemPrompt?: string,
  model: string = GEMINI_MODELS.FLASH
): Promise<string> => {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("Gemini API Key is missing. Please add it in Settings -> API Providers.");

  const filtered = messages.filter(m => m.content?.trim());
  const lastMsg  = filtered[filtered.length - 1];
  const history  = filtered.slice(0, -1);

  const sys = resolveSystemPrompt(systemPrompt);

  // Build clean alternating history (Gemini requires user/model alternation)
  const geminiHistory: { role: 'user'|'model'; parts: { text: string }[] }[] = [];
  for (const m of history) {
    const role = m.role === 'assistant' ? 'model' as const : 'user' as const;
    if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length-1].role === role) continue;
    geminiHistory.push({ role, parts: [{ text: m.content }] });
  }
  while (geminiHistory.length > 0 && geminiHistory[0].role !== 'user') geminiHistory.shift();

  // System prompt baked in as first user/model exchange
  const contents = [
    { role: 'user',  parts: [{ text: `[INST] ${sys} [/INST]` }] },
    { role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] },
    ...geminiHistory,
    { role: 'user',  parts: [{ text: lastMsg?.content || '' }] },
  ];

  // Use raw fetch gives full control, no SDK version quirks
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents,
    systemInstruction: { parts: [{ text: sys }] },
    generationConfig: { temperature: 1.0, topP: 0.95 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json() as any;

  if (!res.ok) throw new Error(data?.error?.message || `Gemini API error ${res.status}`);

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text && data?.candidates?.[0]?.finishReason === 'SAFETY') {
    // Safety block hit retry with system prompt injected more aggressively
    const retryBody = { ...body, contents: [{ role: 'user', parts: [{ text: `${sys}\n\nUser message: ${lastMsg?.content || ''}` }] }] };
    const r2   = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(retryBody) });
    const d2   = await r2.json() as any;
    return d2?.candidates?.[0]?.content?.parts?.[0]?.text || '⚠ Response blocked.';
  }
  return text;
};


// GEMINI_TOOLS for web search and code execution grounding 
export const GEMINI_TOOLS = {
  googleSearch: { google_search: {} },
  codeExecution: { code_execution: {} },
};

// getGeminiResponseWithHistory supports conversation history + tools 
export const getGeminiResponseWithHistory = async (
  prompt: string,
  systemInstruction: string = '',
  modelName: string = 'mdq100/Gemma3-Instruct-Abliterated:12b',
  tools: any[] = [],
  history: { role: string; content: string }[] = []
): Promise<{ text: string; sources?: string[] }> => {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error('No Gemini API key set -- go to Settings -> API Providers');

  const model = modelName.startsWith('gemini') ? modelName : GEMINI_MODELS.FLASH;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Build contents array from history + current prompt
  const contents: any[] = [];
  for (const m of history) {
    const role = m.role === 'user' ? 'user' : 'model';
    if (contents.length > 0 && contents[contents.length - 1].role === role) continue;
    contents.push({ role, parts: [{ text: m.content }] });
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const body: any = {
    contents,
    generationConfig: { temperature: 1.0, topP: 0.95, maxOutputTokens: 8192 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };
  const sys = resolveSystemPrompt(systemInstruction);
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  if (tools.length > 0) body.tools = tools;

  const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.error?.message || `Gemini error ${res.status}`);

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p: any) => p.text || '').join('').trim();

  // Extract web search sources if present
  const sources: string[] = [];
  const groundingMeta = data?.candidates?.[0]?.groundingMetadata;
  if (groundingMeta?.webSearchQueries) sources.push(...groundingMeta.webSearchQueries);

  return { text: text || '(No response)', sources };
};

// formatModelName strips namespace prefixes from HuggingFace/Ollama model names 
// e.g. "mdq100/Gemma3-Instruct-Abliterated:12b" "Gemma3-Instruct-Abliterated:12b"
// e.g. "hf.co/bartowski/Llama-3.2:latest" "Llama-3.2:latest"
export function formatModelName(raw: string): string {
  if (!raw) return raw;
  // Strip hf.co/<user>/ or <user>/ namespace prefix
  let name = raw.replace(/^hf\.co\/[^/]+\//, '').replace(/^[^/]+\//, '');
  return name;
}

// askOllama convenience wrapper used across all pages 
export async function askOllama(
  prompt: string,
  systemPrompt?: string,
  model: string = getDefaultModelFromSettings()
): Promise<string> {
  return getOllamaChatResponse(
    [{ role: 'user', content: prompt }],
    model,
    systemPrompt
  );
}

