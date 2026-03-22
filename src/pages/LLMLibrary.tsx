import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Download, Trash2, RefreshCw, CheckCircle2,
  AlertCircle, Library, Flame, Eye, Cpu, X, ChevronDown, ChevronUp,
  Terminal, ExternalLink, Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { useSettings } from '../context/SettingsContext';

// ── Model catalog ─────────────────────────────────────────────────────────────
interface Model {
  id: string;
  name: string;
  tag: string;           // ollama pull tag OR huggingface repo
  provider: 'ollama' | 'huggingface';
  category: string;
  size: string;
  vram: string;
  desc: string;
  uncensored?: boolean;
  vision?: boolean;
  featured?: boolean;
  stars?: number;
}

const CATALOG: Model[] = [
  // ── Standard LLMs (Ollama) ────────────────────────────────────────────────
  { id:'llama3.2-3b',    name:'LLaMA 3.2 3B',        tag:'llama3.2:3b',               provider:'ollama', category:'text',      size:'2.0 GB', vram:'4GB',  desc:'Meta\'s latest small model -- fast, great for chat',                            featured:true },
  { id:'llama3.1-8b',    name:'LLaMA 3.1 8B',         tag:'llama3.1:8b',               provider:'ollama', category:'text',      size:'4.7 GB', vram:'8GB',  desc:'Best open-source general model at 8B',                                         featured:true },
  { id:'mistral-7b',     name:'Mistral 7B',            tag:'mistral:7b',                provider:'ollama', category:'text',      size:'4.1 GB', vram:'8GB',  desc:'Fast, efficient European model' },
  { id:'qwen2.5-7b',     name:'Qwen 2.5 7B',           tag:'qwen2.5:7b',                provider:'ollama', category:'text',      size:'4.7 GB', vram:'8GB',  desc:'Alibaba\'s model -- great at coding + reasoning' },
  { id:'deepseek-r1-7b', name:'DeepSeek R1 7B',        tag:'deepseek-r1:7b',            provider:'ollama', category:'text',      size:'4.7 GB', vram:'8GB',  desc:'Thinking model -- reasons before answering',                                    featured:true },
  { id:'phi4-14b',       name:'Phi-4 14B',             tag:'phi4:14b',                  provider:'ollama', category:'text',      size:'8.9 GB', vram:'12GB', desc:'Microsoft -- incredible quality for the size' },
  { id:'gemma2-9b',      name:'Gemma 2 9B',            tag:'gemma2:9b',                 provider:'ollama', category:'text',      size:'5.5 GB', vram:'8GB',  desc:'Google\'s open model' },
  { id:'codellama-7b',   name:'Code LLaMA 7B',         tag:'codellama:7b',              provider:'ollama', category:'code',      size:'3.8 GB', vram:'8GB',  desc:'Meta code model -- Python, JS, C++, anything' },
  { id:'deepseek-coder', name:'DeepSeek Coder 16B',    tag:'deepseek-coder-v2:16b',     provider:'ollama', category:'code',      size:'9.1 GB', vram:'12GB', desc:'Best open-source coding model' },
  // ── Vision models (Ollama) ────────────────────────────────────────────────
  { id:'llava-7b',       name:'LLaVA 7B',              tag:'llava:7b',                  provider:'ollama', category:'vision',    size:'4.5 GB', vram:'8GB',  desc:'See and describe images, screenshots, charts',      vision:true,      featured:true },
  { id:'llava-llama3',   name:'LLaVA LLaMA3 8B',       tag:'llava-llama3:8b',           provider:'ollama', category:'vision',    size:'5.5 GB', vram:'8GB',  desc:'LLaVA on LLaMA3 -- best vision quality',             vision:true },
  { id:'moondream',      name:'Moondream 1.8B',         tag:'moondream:1.8b',            provider:'ollama', category:'vision',    size:'1.7 GB', vram:'4GB',  desc:'Tiny but accurate -- great for screen reading',      vision:true },
  { id:'minicpm-v',      name:'MiniCPM-V 8B',          tag:'minicpm-v:8b',              provider:'ollama', category:'vision',    size:'5.5 GB', vram:'8GB',  desc:'Excellent for document/screenshot understanding',   vision:true },
  // ── Uncensored (Ollama) ───────────────────────────────────────────────────
  { id:'dolphin-mistral',name:'Dolphin Mistral 7B',    tag:'dolphin-mistral',           provider:'ollama', category:'uncensored',size:'4.1 GB', vram:'8GB',  desc:'Zero restrictions. Fully uncensored Mistral',       uncensored:true,  featured:true },
  { id:'dolphin-llama3', name:'Dolphin LLaMA3 8B',     tag:'dolphin-llama3:8b',         provider:'ollama', category:'uncensored',size:'4.7 GB', vram:'8GB',  desc:'Best uncensored model -- no filters ever',           uncensored:true,  featured:true, stars:5 },
  { id:'wizard-vicuna',  name:'WizardVicuna 13B',       tag:'wizard-vicuna-uncensored:13b',provider:'ollama',category:'uncensored',size:'7.4 GB', vram:'12GB', desc:'Older but strong -- no RLHF whatsoever',             uncensored:true },
  { id:'dolphin-mixtral',name:'Dolphin Mixtral',        tag:'dolphin-mixtral:8x7b',      provider:'ollama', category:'uncensored',size:'26 GB',  vram:'24GB', desc:'Massive uncensored model -- needs high-end GPU',     uncensored:true },
  { id:'solar-10b',      name:'SOLAR 10.7B',            tag:'solar:10.7b',               provider:'ollama', category:'uncensored',size:'6.1 GB', vram:'10GB', desc:'Korean model -- strong uncensored reasoning',        uncensored:true },
  { id:'bakllava',       name:'BakLLaVA (uncensored)',  tag:'bakllava:7b',               provider:'ollama', category:'uncensored',size:'4.6 GB', vram:'8GB',  desc:'Uncensored vision model -- sees everything',         uncensored:true, vision:true },
  // ── HuggingFace / diffusers ────────────────────────────────────────────────
  { id:'flux-dev',       name:'FLUX.1 Dev',             tag:'black-forest-labs/FLUX.1-dev',           provider:'huggingface', category:'image', size:'23 GB', vram:'16GB', desc:'Best open image gen -- photorealistic quality',      featured:true },
  { id:'flux-schnell',   name:'FLUX.1 Schnell',         tag:'black-forest-labs/FLUX.1-schnell',       provider:'huggingface', category:'image', size:'23 GB', vram:'12GB', desc:'Fast FLUX -- 4 steps, near-instant generation' },
  { id:'sdxl',           name:'Stable Diffusion XL',    tag:'stabilityai/stable-diffusion-xl-base-1.0',provider:'huggingface',category:'image', size:'6.9 GB', vram:'8GB', desc:'Classic SDXL -- huge community, tons of LoRAs' },
  { id:'flux-unc',       name:'FLUX Uncensored',        tag:'enhanceaiteam/Flux-Uncensored-V2',       provider:'huggingface', category:'image', size:'23 GB', vram:'16GB', desc:'FLUX with no content restrictions',                  uncensored:true, featured:true },
  { id:'sdxl-unc',       name:'SDXL Uncensored',        tag:'stablediffusionapi/sdxl-unstable-diffusers-yhzd79', provider:'huggingface', category:'image', size:'7 GB', vram:'8GB', desc:'SDXL with adult content enabled', uncensored:true },
  { id:'ltx-video',      name:'LTX-Video',              tag:'Lightricks/LTX-Video',                   provider:'huggingface', category:'video', size:'12 GB', vram:'8GB',  desc:'Fastest open video gen -- runs on 8GB VRAM',        featured:true },
  { id:'wan-14b',        name:'Wan Video 14B',          tag:'Wan-AI/Wan2.1-T2V-14B',                  provider:'huggingface', category:'video', size:'32 GB', vram:'24GB', desc:'State of the art open video generation' },
  { id:'whisper-large',  name:'Whisper Large v3',       tag:'openai/whisper-large-v3',                provider:'huggingface', category:'audio', size:'3.1 GB', vram:'4GB', desc:'Best speech-to-text -- 99 languages', featured:true },

  // ── More standard LLMs (Ollama) ───────────────────────────────────────────
  { id:'llama3.3-70b',   name:'LLaMA 3.3 70B',         tag:'llama3.3:70b',              provider:'ollama', category:'text',      size:'43 GB', vram:'48GB', desc:'Meta\'s best open model -- GPT-4 level quality' },
  { id:'llama3.2-1b',    name:'LLaMA 3.2 1B',          tag:'llama3.2:1b',               provider:'ollama', category:'text',      size:'1.3 GB', vram:'4GB', desc:'Tiny but useful -- runs on anything' },
  { id:'llama3.1-70b',   name:'LLaMA 3.1 70B',         tag:'llama3.1:70b',              provider:'ollama', category:'text',      size:'40 GB', vram:'40GB', desc:'Massive open model, near GPT-4 quality' },
  { id:'llama3.1-405b',  name:'LLaMA 3.1 405B',        tag:'llama3.1:405b',             provider:'ollama', category:'text',      size:'231 GB', vram:'256GB', desc:'Largest open LLM ever -- needs server-grade hardware' },
  { id:'mistral-nemo',   name:'Mistral Nemo 12B',      tag:'mistral-nemo:12b',          provider:'ollama', category:'text',      size:'7.1 GB', vram:'8GB',  desc:'Mistral + NVIDIA -- strong reasoning, Apache 2.0' },
  { id:'mistral-large',  name:'Mistral Large',         tag:'mistral-large:123b',        provider:'ollama', category:'text',      size:'69 GB', vram:'80GB',  desc:'Mistral\'s flagship -- rivals GPT-4' },
  { id:'qwen2.5-14b',    name:'Qwen 2.5 14B',          tag:'qwen2.5:14b',               provider:'ollama', category:'text',      size:'9.0 GB', vram:'12GB', desc:'Excellent multilingual reasoning' },
  { id:'qwen2.5-32b',    name:'Qwen 2.5 32B',          tag:'qwen2.5:32b',               provider:'ollama', category:'text',      size:'20 GB', vram:'24GB', desc:'Alibaba\'s big model -- beats many 70B models' },
  { id:'qwen2.5-72b',    name:'Qwen 2.5 72B',          tag:'qwen2.5:72b',               provider:'ollama', category:'text',      size:'47 GB', vram:'48GB', desc:'Top tier open model from Alibaba' },
  { id:'deepseek-r1-14b',name:'DeepSeek R1 14B',       tag:'deepseek-r1:14b',           provider:'ollama', category:'text',      size:'9.0 GB', vram:'12GB', desc:'Reasoning chain model -- thinks step by step',          featured:true },
  { id:'deepseek-r1-32b',name:'DeepSeek R1 32B',       tag:'deepseek-r1:32b',           provider:'ollama', category:'text',      size:'20 GB', vram:'24GB', desc:'Strong reasoning -- best open thinking model at 32B' },
  { id:'deepseek-r1-70b',name:'DeepSeek R1 70B',       tag:'deepseek-r1:70b',           provider:'ollama', category:'text',      size:'43 GB', vram:'48GB', desc:'Near GPT-o1 level reasoning' },
  { id:'phi3-mini',      name:'Phi-3 Mini 3.8B',       tag:'phi3:3.8b',                 provider:'ollama', category:'text',      size:'2.3 GB', vram:'4GB',  desc:'Microsoft tiny powerhouse -- great on low VRAM' },
  { id:'phi3.5-mini',    name:'Phi-3.5 Mini',          tag:'phi3.5:3.8b',               provider:'ollama', category:'text',      size:'2.2 GB', vram:'4GB',  desc:'Improved Phi-3 -- better reasoning + multilingual' },
  { id:'gemma2-2b',      name:'Gemma 2 2B',            tag:'gemma2:2b',                 provider:'ollama', category:'text',      size:'1.6 GB', vram:'4GB',  desc:'Google\'s tiny model -- surprisingly capable' },
  { id:'gemma2-27b',     name:'Gemma 2 27B',           tag:'gemma2:27b',                provider:'ollama', category:'text',      size:'16 GB', vram:'20GB',  desc:'Google\'s large open model' },
  { id:'aya-35b',        name:'Aya 35B',               tag:'aya:35b',                   provider:'ollama', category:'text',      size:'22 GB', vram:'24GB',  desc:'Cohere\'s multilingual model -- 101 languages' },
  { id:'command-r',      name:'Command R 35B',         tag:'command-r:35b',             provider:'ollama', category:'text',      size:'20 GB', vram:'24GB',  desc:'Cohere -- optimised for RAG and tool use' },
  { id:'command-r-plus', name:'Command R+ 104B',       tag:'command-r-plus:104b',       provider:'ollama', category:'text',      size:'59 GB', vram:'64GB',  desc:'Cohere flagship -- best RAG model open source' },
  { id:'smollm2-1.7b',   name:'SmolLM2 1.7B',         tag:'smollm2:1.7b',              provider:'ollama', category:'text',      size:'1.0 GB', vram:'2GB',  desc:'Hugging Face tiny model -- runs on CPU fine' },
  { id:'falcon3-7b',     name:'Falcon 3 7B',           tag:'falcon3:7b',                provider:'ollama', category:'text',      size:'4.4 GB', vram:'8GB',  desc:'TII UAE model -- good reasoning + math' },
  { id:'internlm2.5-7b', name:'InternLM 2.5 7B',      tag:'internlm2:7b',              provider:'ollama', category:'text',      size:'4.5 GB', vram:'8GB',  desc:'Shanghai AI Lab -- strong at math and code' },
  { id:'openchat-3.5',   name:'OpenChat 3.5 7B',       tag:'openchat:7b',               provider:'ollama', category:'text',      size:'4.1 GB', vram:'8GB',  desc:'RLHF-free fine-tune -- beats GPT-3.5 on many tasks' },
  { id:'vicuna-13b',     name:'Vicuna 13B',            tag:'vicuna:13b',                provider:'ollama', category:'text',      size:'7.4 GB', vram:'10GB', desc:'Classic fine-tune of LLaMA -- great for chat' },
  { id:'starling-lm',    name:'Starling LM 7B',        tag:'starling-lm:7b',            provider:'ollama', category:'text',      size:'4.1 GB', vram:'8GB',  desc:'Berkeley RLAIF model -- strong instruction following' },
  { id:'yi-34b',         name:'Yi 34B',                tag:'yi:34b',                    provider:'ollama', category:'text',      size:'20 GB', vram:'24GB',  desc:'01.AI flagship -- bilingual Chinese/English' },
  { id:'yi-9b',          name:'Yi 9B',                 tag:'yi:9b',                     provider:'ollama', category:'text',      size:'5.0 GB', vram:'8GB',  desc:'01.AI lightweight -- solid general model' },
  { id:'solar-pro',      name:'SOLAR Pro 22B',         tag:'solar-pro:22b',             provider:'ollama', category:'text',      size:'13 GB', vram:'16GB',  desc:'Upstage -- great at instruction following' },
  { id:'nemotron-mini',  name:'Nemotron Mini 4B',      tag:'nemotron-mini:4b',          provider:'ollama', category:'text',      size:'2.7 GB', vram:'6GB',  desc:'NVIDIA -- strong reasoning for its size' },
  { id:'hermes3-8b',     name:'Hermes 3 8B',           tag:'hermes3:8b',                provider:'ollama', category:'text',      size:'4.7 GB', vram:'8GB',  desc:'NousResearch fine-tune -- better roleplay + instruction' },
  { id:'hermes3-70b',    name:'Hermes 3 70B',          tag:'hermes3:70b',               provider:'ollama', category:'text',      size:'43 GB', vram:'48GB',  desc:'NousResearch large -- top tier uncensored fine-tune', uncensored:true },

  // ── More code models (Ollama) ─────────────────────────────────────────────
  { id:'qwen2.5-coder-7b', name:'Qwen 2.5 Coder 7B', tag:'qwen2.5-coder:7b',          provider:'ollama', category:'code',      size:'4.7 GB', vram:'8GB',  desc:'Best open coding model at 7B -- beats older 70B models', featured:true },
  { id:'qwen2.5-coder-32b',name:'Qwen 2.5 Coder 32B',tag:'qwen2.5-coder:32b',         provider:'ollama', category:'code',      size:'20 GB', vram:'24GB',  desc:'State of the art open coding -- rivals Claude 3.5' },
  { id:'deepseek-coder2-lite',name:'DeepSeek Coder2 Lite',tag:'deepseek-coder-v2:16b', provider:'ollama', category:'code',      size:'9.1 GB', vram:'12GB',  desc:'Fast coding model -- great at multi-file edits' },
  { id:'starcoder2-15b', name:'StarCoder2 15B',        tag:'starcoder2:15b',            provider:'ollama', category:'code',      size:'9.1 GB', vram:'12GB',  desc:'BigCode -- trained on 600+ programming languages' },
  { id:'codegemma-7b',   name:'CodeGemma 7B',          tag:'codegemma:7b',              provider:'ollama', category:'code',      size:'5.0 GB', vram:'8GB',  desc:'Google code model -- great for Python + JS' },
  { id:'granite-code-8b',name:'Granite Code 8B',       tag:'granite-code:8b',           provider:'ollama', category:'code',      size:'4.6 GB', vram:'8GB',  desc:'IBM granite -- enterprise code generation' },

  // ── More uncensored (Ollama) ──────────────────────────────────────────────
  { id:'dolphin3-8b',    name:'Dolphin 3.0 8B',        tag:'dolphin3:8b',               provider:'ollama', category:'uncensored',size:'4.7 GB', vram:'8GB',  desc:'Latest Dolphin -- LLaMA 3.1 based, zero filters',    uncensored:true, featured:true, stars:5 },
  { id:'dolphin3-70b',   name:'Dolphin 3.0 70B',       tag:'dolphin3:70b',              provider:'ollama', category:'uncensored',size:'40 GB', vram:'48GB',  desc:'Massive uncensored -- top quality, no RLHF at all',  uncensored:true },
  { id:'nous-hermes-llama',name:'Nous Hermes 2 Mixtral',tag:'nous-hermes2:10.7b',       provider:'ollama', category:'uncensored',size:'6.1 GB', vram:'8GB',  desc:'NousResearch raw fine-tune -- no safety training',   uncensored:true },
  { id:'orca-mini',      name:'Orca Mini 7B',           tag:'orca-mini:7b',              provider:'ollama', category:'uncensored',size:'3.8 GB', vram:'6GB',  desc:'Microsoft Orca reasoning without alignment',        uncensored:true },
  { id:'llama2-uncensored',name:'LLaMA 2 Uncensored',  tag:'llama2-uncensored:7b',      provider:'ollama', category:'uncensored',size:'3.8 GB', vram:'6GB',  desc:'Classic uncensored LLaMA 2 -- simple, effective',    uncensored:true },
  { id:'mistral-openorca',name:'Mistral OpenOrca',      tag:'mistral-openorca:7b',       provider:'ollama', category:'uncensored',size:'4.1 GB', vram:'8GB',  desc:'Raw fine-tune on Mistral -- no RLHF filters',        uncensored:true },
  { id:'goliath-120b',   name:'Goliath 120B',           tag:'goliath:120b',              provider:'ollama', category:'uncensored',size:'68 GB', vram:'80GB',  desc:'Two LLaMA 2 70B merged -- huge uncensored model',    uncensored:true },
  { id:'everythinglm',   name:'EverythingLM 13B',       tag:'everythinglm:13b-16k',      provider:'ollama', category:'uncensored',size:'8.0 GB', vram:'12GB', desc:'16K context uncensored model',                     uncensored:true },

  // ── More vision (Ollama) ──────────────────────────────────────────────────
  { id:'llava-34b',      name:'LLaVA 34B',              tag:'llava:34b',                 provider:'ollama', category:'vision',    size:'20 GB', vram:'24GB',  desc:'Large LLaVA -- best vision quality in Ollama',      vision:true },
  { id:'llava13b',       name:'LLaVA 13B',              tag:'llava:13b',                 provider:'ollama', category:'vision',    size:'8.0 GB', vram:'10GB',  desc:'Mid-size LLaVA -- great balance of speed/quality',  vision:true },
  { id:'qwen2-vl-7b',    name:'Qwen2-VL 7B',            tag:'qwen2-vl:7b',               provider:'ollama', category:'vision',    size:'4.9 GB', vram:'8GB',  desc:'Alibaba vision -- reads charts, documents, UI',      vision:true, featured:true },
  { id:'granite-vision', name:'Granite Vision 3.2 2B',  tag:'granite3.2-vision:2b',      provider:'ollama', category:'vision',    size:'1.7 GB', vram:'4GB',  desc:'IBM tiny vision model -- document understanding',    vision:true },
  { id:'llama3.2-vision-11b',name:'LLaMA 3.2 Vision 11B',tag:'llama3.2-vision:11b',     provider:'ollama', category:'vision',    size:'7.9 GB', vram:'10GB', desc:'Meta vision model -- great at charts and screenshots',vision:true, featured:true },
  { id:'llama3.2-vision-90b',name:'LLaMA 3.2 Vision 90B',tag:'llama3.2-vision:90b',     provider:'ollama', category:'vision',    size:'55 GB', vram:'64GB',  desc:'Meta large vision -- GPT-4V level quality',          vision:true },

  // ── More image models (HuggingFace) ───────────────────────────────────────
  { id:'sd3-medium',     name:'SD3 Medium',             tag:'stabilityai/stable-diffusion-3-medium', provider:'huggingface', category:'image', size:'5.0 GB', vram:'8GB', desc:'Stability AI latest -- better text rendering than SDXL' },
  { id:'playground-v2',  name:'Playground v2.5',        tag:'playgroundai/playground-v2.5-1024px-aesthetic', provider:'huggingface', category:'image', size:'6.0 GB', vram:'8GB', desc:'Best aesthetic quality at 1024px' },
  { id:'animagine-xl',   name:'Animagine XL 3.1',       tag:'cagliostrolab/animagine-xl-3.1', provider:'huggingface', category:'image', size:'6.9 GB', vram:'8GB', desc:'Best anime image generator', uncensored:false },
  { id:'pony-diffusion', name:'Pony Diffusion XL',      tag:'hollowstrawberry/pony-diffusion-v6-xl', provider:'huggingface', category:'image', size:'7.0 GB', vram:'8GB', desc:'Stylised character art -- huge LoRA ecosystem', uncensored:true },
  { id:'juggernaut-xl',  name:'Juggernaut XL',          tag:'RunDiffusion/Juggernaut-XL-v9', provider:'huggingface', category:'image', size:'6.9 GB', vram:'8GB', desc:'Photorealistic portraits -- popular on Civitai' },
  { id:'kolors',         name:'Kolors',                 tag:'Kwai-Kolors/Kolors', provider:'huggingface', category:'image', size:'10 GB', vram:'12GB', desc:'Kuaishou -- excellent Chinese/Asian aesthetics' },
  { id:'aura-flow',      name:'AuraFlow 0.3',           tag:'fal-ai/AuraFlow', provider:'huggingface', category:'image', size:'14 GB', vram:'12GB', desc:'Fast flow-matching model -- good prompt adherence' },
  { id:'cogvideox-5b',   name:'CogVideoX 5B',           tag:'THUDM/CogVideoX-5b', provider:'huggingface', category:'video', size:'20 GB', vram:'18GB', desc:'Tsinghua text-to-video -- good 720p quality', featured:true },
  { id:'animatediff',    name:'AnimateDiff XL',         tag:'guoyww/animatediff-motion-adapter-sdxl-beta', provider:'huggingface', category:'video', size:'8.0 GB', vram:'10GB', desc:'Animate any SDXL checkpoint into video' },
  { id:'whisper-medium', name:'Whisper Medium',         tag:'openai/whisper-medium', provider:'huggingface', category:'audio', size:'1.5 GB', vram:'4GB', desc:'Good speech-to-text, lighter than large v3' },
  { id:'musicgen-small', name:'MusicGen Small',         tag:'facebook/musicgen-small', provider:'huggingface', category:'audio', size:'0.9 GB', vram:'4GB', desc:'Meta -- generate music from text prompts' },
  { id:'bark',           name:'Bark TTS',               tag:'suno-ai/bark', provider:'huggingface', category:'audio', size:'5.0 GB', vram:'8GB', desc:'Suno -- most realistic open text-to-speech, laughs/cries/sings' },
];

const CATEGORIES = [
  { id:'all',        label:'All',        icon:'🔮' },
  { id:'text',       label:'Chat / LLM', icon:'💬' },
  { id:'uncensored', label:'🔥 Uncensored', icon:'🔥' },
  { id:'vision',     label:'Vision',     icon:'👁' },
  { id:'code',       label:'Code',       icon:'💻' },
  { id:'image',      label:'Images',     icon:'🖼' },
  { id:'video',      label:'Video',      icon:'🎬' },
  { id:'audio',      label:'Audio / STT',icon:'🎙' },
];

// ── Download state ─────────────────────────────────────────────────────────────
interface DownloadState {
  status: 'idle' | 'downloading' | 'done' | 'error';
  progress: number;
  message: string;
}

export default function LLMLibrary() {
  const { models: installedModels, pullModel, deleteModel, refreshModels, isPulling, pullProgress } = useSettings();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [termLog, setTermLog] = useState<string[]>([]);
  const [showTerm, setShowTerm] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);

  useEffect(() => { refreshModels(); }, []);
  useEffect(() => { if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight; }, [termLog]);

  const log = (msg: string) => setTermLog(p => [...p.slice(-200), msg]);

  const isInstalled = (model: Model) =>
    installedModels.some(m => m.name.startsWith(model.tag.split(':')[0]));

  const setDl = (id: string, s: Partial<DownloadState>) =>
    setDownloads(p => ({ ...p, [id]: { status:'idle', progress:0, message:'', ...p[id], ...s } }));

  // ── One-click Ollama pull ────────────────────────────────────────────────
  const pullOllama = async (model: Model) => {
    setDl(model.id, { status:'downloading', progress:0, message:`Pulling ${model.tag}...` });
    setShowTerm(true);
    log(`$ ollama pull ${model.tag}`);
    try {
      let base = 'http://localhost:11434';
      try { const s = JSON.parse(localStorage.getItem('nexus_settings') || '{}'); const h = (s?.ollama?.host||'http://localhost').replace(/\/$/,''); const p = s?.ollama?.port||'11434'; base = /:\d+$/.test(h)?h:`${h}:${p}`; } catch {}

      const res = await fetch(`${base}/api/pull`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name: model.tag, stream: true }),
      });
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.status) log(`  ${obj.status}`);
            if (obj.total && obj.completed) {
              const pct = Math.round((obj.completed / obj.total) * 100);
              const mb = (obj.completed / 1024 / 1024).toFixed(0);
              const total = (obj.total / 1024 / 1024).toFixed(0);
              setDl(model.id, { progress: pct, message: `${mb} / ${total} MB` });
            }
            if (obj.status === 'success') {
              log(`(OK) ${model.tag} installed successfully`);
              setDl(model.id, { status:'done', progress:100, message:'Installed!' });
              await refreshModels();
              return;
            }
          } catch {}
        }
      }
      setDl(model.id, { status:'done', progress:100, message:'Installed!' });
      await refreshModels();
    } catch (e: any) {
      log(`(X) Error: ${e.message}`);
      setDl(model.id, { status:'error', progress:0, message: e.message });
    }
  };

  // ── HuggingFace / diffusers install ──────────────────────────────────────
  const installHF = async (model: Model) => {
    setDl(model.id, { status:'downloading', progress:0, message:'Installing via pip...' });
    setShowTerm(true);
    log(`$ Installing ${model.name} from HuggingFace`);

    // Use the NexusAI server /api/run-command endpoint
    const cmds = [
      'pip install diffusers transformers accelerate torch torchvision safetensors --quiet',
      `python -c "from huggingface_hub import snapshot_download; snapshot_download('${model.tag}', local_dir='./models/${model.id}')"`,
    ];

    try {
      for (let i = 0; i < cmds.length; i++) {
        log(`$ ${cmds[i].slice(0, 60)}...`);
        setDl(model.id, { progress: (i / cmds.length) * 80, message: i === 0 ? 'Installing dependencies...' : 'Downloading model...' });
        const res = await fetch('/api/run-command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmds[i] }),
        });
        const data = await res.json();
        if (data.output) data.output.split('\n').filter(Boolean).forEach((l: string) => log(`  ${l}`));
        if (data.error) data.error.split('\n').filter(Boolean).slice(0,5).forEach((l: string) => log(`  ⚠ ${l}`));
      }
      log(`(OK) ${model.name} downloaded to ./models/${model.id}`);
      setDl(model.id, { status:'done', progress:100, message:'Downloaded!' });
    } catch (e: any) {
      log(`(X) ${e.message}`);
      setDl(model.id, { status:'error', message: e.message });
    }
  };

  const handleDownload = (model: Model) => {
    if (model.provider === 'ollama') pullOllama(model);
    else installHF(model);
  };

  const handleDelete = async (model: Model) => {
    if (!confirm(`Delete ${model.name}?`)) return;
    if (model.provider === 'ollama') { await deleteModel(model.tag); await refreshModels(); }
    setDl(model.id, { status:'idle', progress:0, message:'' });
  };

  const filtered = CATALOG.filter(m => {
    if (category !== 'all' && m.category !== category) return false;
    if (search) {
      const s = search.toLowerCase();
      return m.name.toLowerCase().includes(s) || m.desc.toLowerCase().includes(s) || m.tag.toLowerCase().includes(s);
    }
    return true;
  });

  const installedList = CATALOG.filter(m => isInstalled(m));

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">
      {/* Left sidebar */}
      <div className="w-56 shrink-0 border-r border-white/5 flex flex-col bg-slate-900/30 overflow-y-auto">
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Library size={16} className="text-indigo-400"/>
            <span className="font-bold text-sm text-white">LLM Library</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">{installedList.length} installed . {CATALOG.length} available</p>
        </div>

        {/* Categories */}
        <div className="p-2 space-y-0.5 flex-1">
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                category === c.id ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5')}>
              <span>{c.icon}</span>{c.label}
            </button>
          ))}
        </div>

        {/* Installed list */}
        {installedList.length > 0 && (
          <div className="p-3 border-t border-white/5">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold mb-2">Installed</p>
            {installedList.map(m => (
              <div key={m.id} className="flex items-center justify-between py-1">
                <span className="text-[10px] text-emerald-400 truncate flex-1">{m.name}</span>
                <button onClick={() => handleDelete(m)} className="text-slate-600 hover:text-red-400 ml-1">
                  <Trash2 size={10}/>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Search bar */}
        <div className="p-4 border-b border-white/5 flex items-center gap-3 bg-slate-950/50">
          <div className="relative flex-1 max-w-md">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"/>
          </div>
          <button onClick={() => refreshModels()} className="p-2 text-slate-500 hover:text-white transition-colors" title="Refresh installed">
            <RefreshCw size={14}/>
          </button>
          <button onClick={() => setShowTerm(p => !p)}
            className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all',
              showTerm ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-slate-400 hover:text-white border border-white/10')}>
            <Terminal size={12}/> Log
          </button>
        </div>

        {/* Terminal log */}
        {showTerm && (
          <div ref={termRef} className="h-32 bg-black border-b border-white/5 overflow-y-auto p-3 font-mono text-[10px] shrink-0">
            {termLog.length === 0
              ? <p className="text-slate-600">Download log appears here...</p>
              : termLog.map((l, i) => (
                <div key={i} className={cn('leading-5',
                  l.startsWith('(OK)') ? 'text-emerald-400' :
                  l.startsWith('(X)') ? 'text-red-400' :
                  l.startsWith('$') ? 'text-indigo-400' :
                  l.includes('⚠') ? 'text-amber-400' : 'text-slate-400')}>{l}</div>
              ))
            }
          </div>
        )}

        {/* Model grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-600">
              <Library size={32} className="mb-3 opacity-30"/>
              <p className="text-sm">No models match your search</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map(model => {
                const dl = downloads[model.id] || { status:'idle', progress:0, message:'' };
                const installed = isInstalled(model);
                const isExpanded = expanded === model.id;

                return (
                  <div key={model.id} className={cn(
                    'bg-slate-900/60 border rounded-xl overflow-hidden transition-all',
                    installed ? 'border-emerald-500/20' :
                    model.uncensored ? 'border-red-500/15' :
                    model.featured ? 'border-indigo-500/15' : 'border-white/5',
                    'hover:border-white/20'
                  )}>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-semibold text-white truncate">{model.name}</span>
                            {model.uncensored && <span className="px-1.5 py-0.5 bg-red-500/15 text-red-400 text-[9px] font-bold rounded uppercase tracking-wide">🔥 Uncensored</span>}
                            {model.vision && <span className="px-1.5 py-0.5 bg-blue-500/15 text-blue-400 text-[9px] font-bold rounded uppercase tracking-wide">👁 Vision</span>}
                            {model.featured && <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 text-[9px] rounded">⭐</span>}
                            {installed && <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 text-[9px] font-bold rounded uppercase">(OK) Installed</span>}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{model.tag}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium',
                            model.provider === 'ollama' ? 'bg-purple-500/15 text-purple-400' : 'bg-orange-500/15 text-orange-400')}>
                            {model.provider === 'ollama' ? 'Ollama' : 'HF'}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-400 mb-3 leading-relaxed">{model.desc}</p>

                      <div className="flex items-center gap-3 text-[10px] text-slate-600 mb-3">
                        <span>💾 {model.size}</span>
                        <span>🖥 {model.vram} VRAM</span>
                      </div>

                      {/* Download progress */}
                      {dl.status === 'downloading' && (
                        <div className="mb-3">
                          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                            <span>{dl.message}</span>
                            <span>{dl.progress}%</span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                              style={{ width: `${dl.progress}%` }}/>
                          </div>
                        </div>
                      )}

                      {dl.status === 'error' && (
                        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <p className="text-[10px] text-red-400">{dl.message}</p>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        {installed ? (
                          <button onClick={() => handleDelete(model)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/15 hover:bg-red-600/25 border border-red-500/20 text-red-400 rounded-lg text-xs transition-all">
                            <Trash2 size={11}/> Remove
                          </button>
                        ) : dl.status === 'downloading' ? (
                          <button disabled className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg text-xs cursor-not-allowed">
                            <RefreshCw size={11} className="animate-spin"/> Downloading...
                          </button>
                        ) : dl.status === 'done' ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/15 text-emerald-400 rounded-lg text-xs">
                            <CheckCircle2 size={11}/> Installed!
                          </div>
                        ) : (
                          <button onClick={() => handleDownload(model)}
                            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all font-medium',
                              model.uncensored
                                ? 'bg-red-600/20 hover:bg-red-600/30 border border-red-500/20 text-red-400'
                                : 'bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/20 text-indigo-400')}>
                            <Download size={11}/>
                            {model.provider === 'ollama' ? 'One-click install' : 'Download (HF)'}
                          </button>
                        )}
                        {model.provider === 'huggingface' && (
                          <a href={`https://huggingface.co/${model.tag}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 rounded-lg text-xs transition-all">
                            <ExternalLink size={10}/>
                          </a>
                        )}
                        <button onClick={() => setExpanded(isExpanded ? null : model.id)}
                          className="ml-auto text-slate-600 hover:text-slate-300 p-1">
                          {isExpanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                        </button>
                      </div>

                      {/* Expanded install info */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-white/5">
                          <p className="text-[10px] text-slate-500 mb-2">Manual install command:</p>
                          <code className={cn('block text-[10px] font-mono p-2 rounded-lg bg-black/40 text-slate-300 break-all',
                            model.provider === 'ollama' ? 'text-purple-300' : 'text-orange-300')}>
                            {model.provider === 'ollama'
                              ? `ollama pull ${model.tag}`
                              : `python -c "from huggingface_hub import snapshot_download; snapshot_download('${model.tag}')"`
                            }
                          </code>
                          {model.provider === 'huggingface' && (
                            <p className="text-[10px] text-slate-600 mt-2">
                              Requires: pip install diffusers transformers accelerate
                              {model.vram.includes('16') || model.vram.includes('24') ? ' . Needs CUDA GPU' : ' . Works on 8GB VRAM'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
