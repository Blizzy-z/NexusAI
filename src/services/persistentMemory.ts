export type SharedMemoryMap = Record<string, string>;

const SHARED_MEMORY_KEY = 'nexus_shared_memory';
const LEGACY_MEMORY_KEY = 'nexus_agent_memory';

function parseMemoryMap(raw: string | null): SharedMemoryMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: SharedMemoryMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && k.trim()) out[k.trim()] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function persistSharedMemory(memory: SharedMemoryMap): void {
  localStorage.setItem(SHARED_MEMORY_KEY, JSON.stringify(memory));
}

function normalizeValue(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function slug(value: string): string {
  return normalizeValue(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function upsert(memory: SharedMemoryMap, key: string, value: string): boolean {
  const k = normalizeValue(key);
  const v = normalizeValue(value);
  if (!k || !v) return false;
  if (memory[k] === v) return false;
  memory[k] = v;
  return true;
}

export function loadSharedMemory(): SharedMemoryMap {
  const shared = parseMemoryMap(localStorage.getItem(SHARED_MEMORY_KEY));
  const legacy = parseMemoryMap(localStorage.getItem(LEGACY_MEMORY_KEY));
  if (Object.keys(legacy).length === 0) return shared;

  const merged: SharedMemoryMap = { ...legacy, ...shared };
  if (JSON.stringify(merged) !== JSON.stringify(shared)) persistSharedMemory(merged);
  return merged;
}

export function setSharedMemory(key: string, value: string): void {
  const memory = loadSharedMemory();
  if (upsert(memory, key, value)) persistSharedMemory(memory);
}

export function removeSharedMemory(key: string): void {
  const memory = loadSharedMemory();
  const k = normalizeValue(key);
  if (!k || !(k in memory)) return;
  delete memory[k];
  persistSharedMemory(memory);
}

function addRememberedNote(memory: SharedMemoryMap, note: string): boolean {
  const clean = normalizeValue(note);
  if (!clean) return false;
  const existing = Object.entries(memory).find(([k, v]) => k.startsWith('note.') && normalizeValue(v) === clean);
  if (existing) return false;
  const key = `note.${slug(clean).slice(0, 42) || Date.now().toString()}`;
  memory[key] = clean;
  return true;
}

export function ingestMessageForMemory(text: string, source: 'chat' | 'centre' | 'sidebar' = 'chat'): string[] {
  const input = normalizeValue(text);
  if (!input) return [];

  const memory = loadSharedMemory();
  const changed: string[] = [];
  let m: RegExpMatchArray | null = null;

  if ((m = input.match(/\bmy name is\s+([a-z][a-z .'-]{1,40})\b/i))) {
    if (upsert(memory, 'user.name', m[1])) changed.push('user.name');
  }

  if ((m = input.match(/\bcall me\s+([a-z][a-z .'-]{1,40})\b/i))) {
    if (upsert(memory, 'user.preferred_name', m[1])) changed.push('user.preferred_name');
  }

  if ((m = input.match(/\b(?:i am|i'm)\s+(\d{1,3})\s*(?:years?\s*old)?\b/i))) {
    if (upsert(memory, 'user.age', m[1])) changed.push('user.age');
  }

  if ((m = input.match(/\b(?:i live in|i'm from|i am from)\s+([a-z0-9 .,'-]{2,70})\b/i))) {
    if (upsert(memory, 'user.location', m[1])) changed.push('user.location');
  }

  if ((m = input.match(/\bmy email(?: address)? is\s+([^\s]+@[^\s]+\.[^\s]+)\b/i))) {
    if (upsert(memory, 'user.email', m[1])) changed.push('user.email');
  }

  if ((m = input.match(/\bmy phone(?: number)? is\s+([+\d][\d\s\-()]{6,})\b/i))) {
    if (upsert(memory, 'user.phone', m[1])) changed.push('user.phone');
  }

  if ((m = input.match(/\b(?:i like|i love)\s+(.{2,90})$/i))) {
    if (upsert(memory, 'user.likes', m[1])) changed.push('user.likes');
  }

  if ((m = input.match(/\bmy goal is\s+(.{2,120})$/i))) {
    if (upsert(memory, 'user.goal', m[1])) changed.push('user.goal');
  }

  if ((m = input.match(/\bremember(?: that)?\s+(.{2,180})$/i))) {
    if (addRememberedNote(memory, m[1])) changed.push('note');
  }

  if (changed.length > 0) {
    upsert(memory, 'meta.last_source', source);
    upsert(memory, 'meta.last_update', new Date().toISOString());
    persistSharedMemory(memory);
  }

  return changed;
}

export function getSharedMemoryPrompt(maxEntries: number = 30): string {
  const memory = loadSharedMemory();
  const entries = Object.entries(memory).filter(([k]) => !k.startsWith('meta.'));
  if (entries.length === 0) return '';

  entries.sort(([a], [b]) => {
    const aNote = a.startsWith('note.');
    const bNote = b.startsWith('note.');
    if (aNote !== bNote) return aNote ? 1 : -1;
    return a.localeCompare(b);
  });

  const lines = entries.slice(0, Math.max(1, maxEntries)).map(([k, v]) => `- ${k}: ${v}`);
  return `\n\nPersistent memory from past conversations (use only when relevant and accurate):\n${lines.join('\n')}`;
}

