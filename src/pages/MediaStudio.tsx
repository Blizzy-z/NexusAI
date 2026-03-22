import React, { useState, useEffect, useRef } from 'react';
import { 
  Image as ImageIcon, Video, Download, Play, Trash2,
  Maximize2, Cpu, Database, X, Sparkles, Sliders,
  RefreshCw, Copy, ChevronDown, Wand2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

const COMFY_URL = (() => {
  try {
    const s = JSON.parse(localStorage.getItem('nexus_settings') || '{}');
    return s?.comfy?.url || s?.providers?.comfy?.url || 'http://127.0.0.1:8188';
  } catch { return 'http://127.0.0.1:8188'; }
})();

const PONY_PRESETS = [
  { label: '✨ Photorealistic', tags: 'score_9, score_8_up, score_7_up, masterpiece, photorealistic, hyperdetailed' },
  { label: '🎨 Anime', tags: 'score_9, score_8_up, anime, 2d, vibrant colors, cel shading' },
  { label: '🖼 Illustration', tags: 'score_9, score_8_up, digital illustration, detailed, professional art' },
  { label: '🌆 Cinematic', tags: 'score_9, score_8_up, cinematic lighting, movie still, 8k, volumetric fog' },
  { label: '💜 Fantasy', tags: 'score_9, score_8_up, fantasy art, magical, ethereal, glowing effects' },
];

const NEG_DEFAULT = 'score_4, score_3, score_2, score_1, bad anatomy, bad hands, extra limbs, blurry, low quality, watermark, text, logo';

function buildWorkflow(prompt: string, negPrompt: string, steps: number, cfg: number, width: number, height: number, seed: number) {
  return {
    "3": { "class_type": "KSampler", "inputs": {
      "seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "euler",
      "scheduler": "karras", "denoise": 1,
      "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]
    }},
    "4": { "class_type": "CheckpointLoaderSimple", "inputs": {
      "ckpt_name": "ponyDiffusionV6XL_v6StartWithThisOne.safetensors"
    }},
    "5": { "class_type": "EmptyLatentImage", "inputs": { "width": width, "height": height, "batch_size": 1 }},
    "6": { "class_type": "CLIPTextEncode", "inputs": { "text": prompt, "clip": ["4", 1] }},
    "7": { "class_type": "CLIPTextEncode", "inputs": { "text": negPrompt, "clip": ["4", 1] }},
    "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] }},
    "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "nexusai", "images": ["8", 0] }}
  };
}

async function queuePrompt(workflow: any): Promise<string> {
  const res = await fetch(`${COMFY_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) throw new Error(`ComfyUI error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.prompt_id;
}

async function pollResult(promptId: string): Promise<string> {
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const res = await fetch(`${COMFY_URL}/history/${promptId}`);
    const hist = await res.json();
    if (hist[promptId]) {
      const outputs = hist[promptId].outputs;
      for (const nodeId of Object.keys(outputs)) {
        const imgs = outputs[nodeId].images;
        if (imgs && imgs.length > 0) {
          const img = imgs[0];
          return `${COMFY_URL}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`;
        }
      }
    }
  }
  throw new Error('Generation timed out after 3 minutes');
}

export default function MediaStudio() {
  const [prompt, setPrompt]           = useState('');
  const [negPrompt, setNegPrompt]     = useState(NEG_DEFAULT);
  const [steps, setSteps]             = useState(25);
  const [cfg, setCfg]                 = useState(7);
  const [width, setWidth]             = useState(1024);
  const [height, setHeight]           = useState(1024);
  const [seed, setSeed]               = useState(-1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress]       = useState('');
  const [gallery, setGallery]         = useState<any[]>([]);
  const [selected, setSelected]       = useState<any>(null);
  const [comfyStatus, setComfyStatus] = useState<'checking'|'online'|'offline'>('checking');
  const [modelFound, setModelFound] = useState<boolean|null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activePreset, setActivePreset] = useState(0);
  const progressRef = useRef<any>(null);

  // Check ComfyUI status
  useEffect(() => {
    const check = async () => {
      try {
        await fetch(`${COMFY_URL}/system_stats`, { signal: AbortSignal.timeout(2000) });
        setComfyStatus('online');
        // Check if Pony model is visible
        try {
          const r2 = await fetch(`${COMFY_URL}/object_info/CheckpointLoaderSimple`);
          const d2 = await r2.json();
          const ckpts: string[] = d2?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
          setModelFound(ckpts.some((n: string) => n.toLowerCase().includes('pony') || n.toLowerCase().includes('ponydiffusion')));
        } catch { setModelFound(null); }
      } catch {
        setComfyStatus('offline');
        setModelFound(null);
      }
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, []);

  // Poll ComfyUI progress via websocket-like polling
  const pollProgress = async (promptId: string) => {
    for (let i = 0; i < 180; i++) {
      await new Promise(r => setTimeout(r, 800));
      try {
        const res = await fetch(`${COMFY_URL}/queue`);
        const q = await res.json();
        const running = q.queue_running || [];
        const inQueue = running.some((item: any) => item[1] === promptId);
        if (inQueue) {
          setProgress(`Generating... step ${Math.min(i * 1, steps)}/${steps}`);
        }
        const histRes = await fetch(`${COMFY_URL}/history/${promptId}`);
        const hist = await histRes.json();
        if (hist[promptId]) {
          const outputs = hist[promptId].outputs;
          for (const nodeId of Object.keys(outputs)) {
            const imgs = outputs[nodeId].images;
            if (imgs?.length > 0) {
              const img = imgs[0];
              return `${COMFY_URL}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`;
            }
          }
        }
      } catch {}
    }
    throw new Error('Timed out');
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating || comfyStatus !== 'online') return;
    setIsGenerating(true);
    setProgress('Queuing...');
    try {
      const fullPrompt = `${PONY_PRESETS[activePreset].tags}, ${prompt}`;
      const actualSeed = seed === -1 ? Math.floor(Math.random() * 2**32) : seed;
      const workflow = buildWorkflow(fullPrompt, negPrompt, steps, cfg, width, height, actualSeed);
      const promptId = await queuePrompt(workflow);
      setProgress('Waiting in queue...');
      const imgUrl = await pollProgress(promptId);
      const newItem = {
        id: Date.now(), url: imgUrl, prompt: fullPrompt,
        seed: actualSeed, steps, cfg, width, height,
        timestamp: new Date().toLocaleString()
      };
      setGallery(g => [newItem, ...g]);
      setSelected(newItem);
      setProgress('');
    } catch (e: any) {
      setProgress(`❌ ${e.message}`);
      setTimeout(() => setProgress(''), 4000);
    }
    setIsGenerating(false);
  };

  const randomSeed = () => setSeed(Math.floor(Math.random() * 2**32));

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">

      {/* Lightbox */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
            onClick={() => setSelected(null)}>
            <motion.img initial={{scale:0.85}} animate={{scale:1}} exit={{scale:0.85}}
              src={selected.url} alt={selected.prompt}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-2xl"
              onClick={e => e.stopPropagation()} />
            <button onClick={() => setSelected(null)}
              className="absolute top-6 right-6 p-2 bg-white/10 rounded-full hover:bg-white/20">
              <X className="w-5 h-5 text-white" />
            </button>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3">
              <a href={selected.url} download={`nexusai_${selected.id}.png`}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl text-white text-xs hover:bg-white/20">
                <Download className="w-4 h-4" /> Download
              </a>
              <button onClick={() => { setPrompt(selected.prompt); setSelected(null); }}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-xl text-purple-300 text-xs hover:bg-purple-500/30">
                <Copy className="w-4 h-4" /> Reuse Prompt
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Left Panel */}
      <div className="w-96 border-r border-white/5 flex flex-col bg-slate-900/20 overflow-y-auto custom-scrollbar">
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Media Studio</h2>
              <p className="text-[10px] text-slate-500 mt-0.5">Pony Diffusion XL v6 via ComfyUI</p>
            </div>
            {/* ComfyUI Status */}
            <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border",
              comfyStatus === 'online'   ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
              comfyStatus === 'offline'  ? "bg-red-500/10 border-red-500/20 text-red-400" :
              "bg-yellow-500/10 border-yellow-500/20 text-yellow-400")}>
              <div className={cn("w-1.5 h-1.5 rounded-full", 
                comfyStatus === 'online' ? "bg-emerald-400 animate-pulse" :
                comfyStatus === 'offline' ? "bg-red-400" : "bg-yellow-400 animate-pulse")} />
              {comfyStatus === 'online' ? 'ComfyUI Online' : comfyStatus === 'offline' ? 'ComfyUI Offline' : 'Checking...'}
            </div>
          </div>

          {comfyStatus === 'offline' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-1.5">
              <p className="font-bold text-sm text-red-300">ComfyUI Offline</p>
              <p className="text-xs text-red-400/80">Start ComfyUI then come back. It auto-detects when running.</p>
              <div className="mt-1.5 p-2 bg-black/30 rounded-lg font-mono text-[10px] text-slate-400">python main.py --listen 0.0.0.0</div>
            </div>
          )}

          {comfyStatus === 'online' && modelFound === false && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 space-y-3">
              <p className="text-sm font-bold text-orange-300">Model not visible to ComfyUI</p>
              <p className="text-xs text-orange-400/80">ComfyUI is running but your Pony Diffusion model is not in its search paths.</p>
              <div className="space-y-2 text-xs text-slate-400">
                <p className="font-bold text-slate-300">Fix in 2 steps:</p>
                <div className="bg-black/40 border border-white/10 rounded-lg p-2.5 space-y-1">
                  <p className="text-emerald-400 font-mono text-[11px]">1. Run: setup-comfyui-models.bat</p>
                  <p className="text-slate-500">Creates extra_model_paths.yaml in your ComfyUI folder</p>
                </div>
                <div className="bg-black/40 border border-white/10 rounded-lg p-2.5 space-y-1">
                  <p className="text-orange-300 font-bold">2. Restart ComfyUI completely</p>
                  <p className="text-slate-500">It must reload to pick up the new paths</p>
                </div>
                <p className="text-slate-500">Or move the model manually to:</p>
                <div className="bg-black/40 border border-white/10 rounded-lg p-2 font-mono text-[10px] text-slate-300">ComfyUI\models\checkpoints\</div>
              </div>
              <button onClick={async () => {
                try {
                  const r = await fetch(`${COMFY_URL}/object_info/CheckpointLoaderSimple`);
                  const d = await r.json();
                  const ckpts: string[] = d?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
                  const found = ckpts.some((n: string) => n.toLowerCase().includes('pony') || n.toLowerCase().includes('ponydiffusion'));
                  setModelFound(found);
                  if (!found) alert('Still not found. Did you restart ComfyUI after running the bat?');
                } catch {}
              }} className="w-full py-2 bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded-xl text-xs font-bold hover:bg-orange-500/30 transition-all flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5" /> Check again
              </button>
            </div>
          )}

          {/* Style Presets */}
          <div>
            <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-2">Style Preset</label>
            <div className="grid grid-cols-2 gap-1.5">
              {PONY_PRESETS.map((p, i) => (
                <button key={i} onClick={() => setActivePreset(i)}
                  className={cn("px-2 py-1.5 rounded-lg text-[11px] font-medium text-left transition-all",
                    activePreset === i ? "bg-purple-500/20 border border-purple-500/40 text-purple-300" : "bg-white/5 border border-white/5 text-slate-400 hover:text-white")}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-2">Prompt</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder="beautiful girl, long hair, sunset, detailed face..."
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all h-28 resize-none placeholder-slate-600" />
            <p className="text-[9px] text-slate-600 mt-1">Style tags auto-added from preset above</p>
          </div>

          {/* Quick settings */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Steps', value: steps, set: setSteps, min: 10, max: 50 },
              { label: 'CFG', value: cfg, set: setCfg, min: 1, max: 15 },
            ].map(({label, value, set, min, max}) => (
              <div key={label} className="col-span-1 space-y-1">
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block">{label}</label>
                <input type="number" value={value} min={min} max={max}
                  onChange={e => set(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white text-center" />
              </div>
            ))}
            <div className="col-span-1 space-y-1">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block">Size</label>
              <select value={`${width}x${height}`}
                onChange={e => { const [w,h] = e.target.value.split('x').map(Number); setWidth(w); setHeight(h); }}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white">
                <option value="1024x1024">1:1</option>
                <option value="896x1152">3:4</option>
                <option value="1152x896">4:3</option>
                <option value="768x1344">9:16</option>
                <option value="1344x768">16:9</option>
              </select>
            </div>
          </div>

          {/* Advanced toggle */}
          <button onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-[10px] text-slate-500 hover:text-slate-300 transition-colors w-full">
            <Sliders className="w-3 h-3" />
            Advanced
            <ChevronDown className={cn("w-3 h-3 ml-auto transition-transform", showAdvanced && "rotate-180")} />
          </button>

          {showAdvanced && (
            <div className="space-y-3 border-t border-white/5 pt-3">
              <div>
                <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-2">Negative Prompt</label>
                <textarea value={negPrompt} onChange={e => setNegPrompt(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-slate-400 focus:outline-none focus:border-purple-500/50 h-20 resize-none" />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mb-1">Seed</label>
                  <input type="number" value={seed} onChange={e => setSeed(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white" />
                </div>
                <button onClick={randomSeed}
                  className="mt-5 p-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
              <p className="text-[9px] text-slate-600">-1 = random seed each time</p>
            </div>
          )}

          {/* Generate Button */}
          <button onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim() || comfyStatus !== 'online'}
            className={cn("w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all text-sm",
              isGenerating || !prompt.trim() || comfyStatus !== 'online'
                ? "bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed"
                : "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.4)] hover:shadow-[0_0_30px_rgba(147,51,234,0.6)] hover:from-purple-500 hover:to-pink-500"
            )}>
            {isGenerating ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{progress || 'Generating...'}</>
            ) : (
              <><Wand2 className="w-4 h-4" />Generate with Pony XL</>
            )}
          </button>
        </div>
      </div>

      {/* Gallery */}
      <div className="flex-1 flex flex-col bg-slate-950">
        <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-slate-950/50 backdrop-blur-xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-bold text-white">Generated Images</h3>
            <span className="text-[10px] text-slate-500 font-mono">{gallery.length} images</span>
          </div>
          {gallery.length > 0 && (
            <button onClick={() => setGallery([])}
              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {gallery.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
              <div className="w-24 h-24 rounded-3xl bg-white/5 flex items-center justify-center mb-4">
                <ImageIcon className="w-10 h-10" />
              </div>
              <p className="text-sm font-bold uppercase tracking-widest">No images yet</p>
              <p className="text-xs text-slate-500 mt-2">Make sure ComfyUI is running on port 8188</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              {gallery.map((item) => (
                <motion.div key={item.id} initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}}
                  className="group relative bg-slate-900 rounded-2xl overflow-hidden border border-white/5 hover:border-purple-500/30 transition-all cursor-pointer"
                  onClick={() => setSelected(item)}>
                  <img src={item.url} alt={item.prompt}
                    className="w-full aspect-square object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                    <p className="text-[11px] text-white font-medium line-clamp-2 mb-2">{item.prompt}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-slate-400 font-mono">seed: {item.seed}</span>
                      <div className="flex gap-1.5">
                        <a href={item.url} download={`nexusai_${item.id}.png`} onClick={e => e.stopPropagation()}
                          className="p-1 bg-white/10 rounded-md hover:bg-white/20 transition-colors">
                          <Download className="w-3 h-3 text-white" />
                        </a>
                        <button onClick={e => { e.stopPropagation(); setSelected(item); }}
                          className="p-1 bg-white/10 rounded-md hover:bg-white/20 transition-colors">
                          <Maximize2 className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
