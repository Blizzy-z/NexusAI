import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Download, RotateCcw, Zap, RefreshCw, Shapes, FileCode,
  Trash2, CheckCircle2, AlertCircle, Play, Square, Settings,
  Eye, Grid, Layers, ChevronDown, X, Wand2, Upload, Clock,
  Cpu, HardDrive, Brain
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stage, PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { cn } from '@/src/lib/utils';
import { getGeminiResponse, askOllama } from '../services/api';

const COMFY_URL = (() => {
  try {
    const s = JSON.parse(localStorage.getItem('nexus_settings') || '{}');
    return s?.comfy?.url || s?.providers?.comfy?.url || 'http://127.0.0.1:8188';
  } catch { return 'http://127.0.0.1:8188'; }
})();

// Types 
interface MeshJob {
  id: string;
  prompt: string;
  status: 'queued' | 'generating' | 'done' | 'error';
  progress: number;
  objContent?: string;
  glbUrl?: string;
  previewUrl?: string;
  error?: string;
  ts: number;
  duration?: number;
  vertices?: number;
  faces?: number;
}

// OBJ Parser 
function parseOBJ(objText: string): THREE.BufferGeometry | null {
  try {
    const vertices: number[] = [];
    const positions: number[] = [];
    for (const line of objText.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === 'v') vertices.push(+parts[1], +parts[2], +parts[3]);
      else if (parts[0] === 'f') {
        const verts = parts.slice(1).map(p => parseInt(p.split('/')[0]) - 1);
        for (let i = 1; i < verts.length - 1; i++) {
          [verts[0], verts[i], verts[i+1]].forEach(idx => positions.push(vertices[idx*3], vertices[idx*3+1], vertices[idx*3+2]));
        }
      }
    }
    if (!positions.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const center = new THREE.Vector3(); box.getCenter(center);
    const size = new THREE.Vector3(); box.getSize(size);
    const scale = 2 / Math.max(size.x, size.y, size.z, 0.001);
    const arr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) { arr[i] = (arr[i]-center.x)*scale; arr[i+1] = (arr[i+1]-center.y)*scale; arr[i+2] = (arr[i+2]-center.z)*scale; }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  } catch { return null; }
}

// 3D Viewer 
function ObjViewer({ objText, wireframe }: { objText: string; wireframe?: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => parseOBJ(objText), [objText]);

  if (!geo) return (
    <mesh ref={meshRef}>
      <torusKnotGeometry args={[1, 0.3, 128, 16]} />
      <meshStandardMaterial color="#6366f1" />
    </mesh>
  );

  return (
    <mesh ref={meshRef} geometry={geo}>
      {wireframe
        ? <meshBasicMaterial color="#4ade80" wireframe />
        : <meshStandardMaterial color="#6366f1" metalness={0.3} roughness={0.4} side={THREE.DoubleSide} />}
    </mesh>
  );
}

function Spinner3D() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) { ref.current.rotation.y = clock.getElapsedTime() * 0.8; ref.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.3) * 0.3; }
  });
  return (
    <mesh ref={ref}>
      <octahedronGeometry args={[1.2]} />
      <meshStandardMaterial color="#6366f1" wireframe opacity={0.6} transparent />
    </mesh>
  );
}

// Hunyuan3D ComfyUI Workflow 
// Optimised for 8GB VRAM uses fp16, reduced steps, tiled VAE
function buildHunyuanWorkflow(prompt: string, steps: number, guidance: number, octreeDepth: number) {
  return {
    "1": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "hunyuan3d-2.1.safetensors" } },
    "2": { "class_type": "CLIPTextEncode", "inputs": { "text": prompt, "clip": ["1", 1] } },
    "3": { "class_type": "CLIPTextEncode", "inputs": { "text": "low quality, blurry, deformed", "clip": ["1", 1] } },
    // Image-to-3D via Hunyuan3D 2.1 generates multiview then reconstructs
    "4": {
      "class_type": "Hunyuan3DModelLoader",
      "inputs": {
        "model_path": "C:\\Users\\abdul\\nexusai\\models\\ponyDiffusionV6XL_v6StartWithThisOne.safetensors",
        // Hunyuan3D 2.1 model path user needs to set this
        "hunyuan3d_path": "C:\\Users\\abdul\\nexusai\\models",
        "device": "cuda",
        "dtype": "fp16"  // 8GB VRAM optimisation use fp16
      }
    },
    "5": {
      "class_type": "Hunyuan3DGenerate",
      "inputs": {
        "model": ["4", 0],
        "positive": ["2", 0],
        "negative": ["3", 0],
        "steps": steps,
        "guidance_scale": guidance,
        "octree_resolution": octreeDepth, // 256 for 8GB, 384 for 12GB+
        "num_views": 6,                   // 6 views instead of 8 saves ~1.5GB VRAM
        "seed": Math.floor(Math.random() * 2**32),
        "use_tiled_vae": true,            // Critical for 8GB tiles VAE to save memory
        "vae_tile_size": 512,
      }
    },
    "6": {
      "class_type": "Hunyuan3DSave",
      "inputs": {
        "mesh": ["5", 0],
        "filename_prefix": "nexusmesh",
        "format": "obj",  // OBJ for Three.js display
        "simplify": true,
        "target_faces": 50000  // Keep reasonable poly count
      }
    }
  };
}

// Simple workflow using LLaMA-Mesh via Ollama (fallback if no Hunyuan)
async function generateViaOllama(prompt: string, ollamaUrl: string): Promise<string> {
  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-mesh',
      messages: [
        { role: 'system', content: 'You are a 3D modeling assistant. Respond ONLY with a valid OBJ file. Start directly with v lines. No explanation, no markdown.' },
        { role: 'user', content: `Create a 3D mesh for: ${prompt}` }
      ],
      stream: false, options: { temperature: 0.1, num_predict: 4096 }
    })
  });
  const data = await res.json();
  return data.message?.content || '';
}

// Main 
export default function NexusMesh() {
  const [jobs, setJobs]               = useState<MeshJob[]>(() => {
    try { return JSON.parse(localStorage.getItem('nexusmesh_jobs') || '[]'); } catch { return []; }
  });
  const [activeJobId, setActiveJobId] = useState<string | null>(jobs[0]?.id || null);
  const [prompt, setPrompt]           = useState('');
  const [backend, setBackend]         = useState<'hunyuan' | 'llamaMesh' | 'gemini'>('hunyuan');
  const [comfyStatus, setComfyStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [wireframe, setWireframe]     = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [aiPrompt, setAiPrompt]       = useState('');
  const [aiLoading, setAiLoading]     = useState(false);

  // Generation settings tuned for 8GB VRAM
  const [steps, setSteps]             = useState(20);
  const [guidance, setGuidance]       = useState(5.5);
  const [octreeDepth, setOctreeDepth] = useState(256); // 256 = 8GB safe, 384 = needs more

  useEffect(() => { localStorage.setItem('nexusmesh_jobs', JSON.stringify(jobs)); }, [jobs]);

  const activeJob = jobs.find(j => j.id === activeJobId);

  // Check ComfyUI + Ollama status
  useEffect(() => {
    const check = async () => {
      try { await fetch(`${COMFY_URL}/system_stats`, { signal: AbortSignal.timeout(2000) }); setComfyStatus('online'); }
      catch { setComfyStatus('offline'); }
      try { await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) }); setOllamaStatus('online'); }
      catch { setOllamaStatus('offline'); }
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
  }, []);

  const updateJob = (id: string, updates: Partial<MeshJob>) =>
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j));

  const pollComfyJob = async (promptId: string, jobId: string) => {
    const start = Date.now();
    for (let i = 0; i < 300; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const progress = Math.min(95, Math.round(i / 3));
        updateJob(jobId, { progress, status: 'generating' });

        const histRes = await fetch(`${COMFY_URL}/history/${promptId}`);
        const hist = await histRes.json();
        if (hist[promptId]) {
          const outputs = hist[promptId].outputs;
          for (const nodeId of Object.keys(outputs)) {
            const meshes = outputs[nodeId].meshes || outputs[nodeId].files || outputs[nodeId].images;
            if (meshes?.length > 0) {
              const mesh = meshes[0];
              const meshUrl = `${COMFY_URL}/view?filename=${mesh.filename}&subfolder=${mesh.subfolder || ''}&type=${mesh.type || 'output'}`;
              // Fetch the OBJ content
              const objRes = await fetch(meshUrl);
              const objContent = await objRes.text();
              const vCount = (objContent.match(/^v /gm) || []).length;
              const fCount = (objContent.match(/^f /gm) || []).length;
              updateJob(jobId, { status: 'done', progress: 100, objContent, vertices: vCount, faces: fCount, duration: Math.round((Date.now()-start)/1000) });
              return;
            }
          }
        }
      } catch {}
    }
    updateJob(jobId, { status: 'error', error: 'Timed out after 5 minutes' });
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    const jobId = Date.now().toString();
    const job: MeshJob = { id: jobId, prompt, status: 'queued', progress: 0, ts: Date.now() };
    setJobs(prev => [job, ...prev]);
    setActiveJobId(jobId);

    try {
      if (backend === 'hunyuan' && comfyStatus === 'online') {
        updateJob(jobId, { status: 'generating' });
        const workflow = buildHunyuanWorkflow(prompt, steps, guidance, octreeDepth);
        const res = await fetch(`${COMFY_URL}/prompt`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: workflow })
        });
        if (!res.ok) throw new Error(`ComfyUI: ${res.status} ${res.statusText}`);
        const { prompt_id } = await res.json();
        await pollComfyJob(prompt_id, jobId);

      } else if (backend === 'llamaMesh' && ollamaStatus === 'online') {
        updateJob(jobId, { status: 'generating', progress: 30 });
        const raw = await generateViaOllama(prompt, 'http://localhost:11434');
        const objContent = raw.split('\n').filter(l => l.startsWith('v ') || l.startsWith('f ') || l.startsWith('#')).join('\n');
        if (!objContent.includes('v ')) throw new Error('LLaMA-Mesh returned no geometry -- try a simpler prompt like "a cube" or "a sphere"');
        const vCount = (objContent.match(/^v /gm) || []).length;
        const fCount = (objContent.match(/^f /gm) || []).length;
        updateJob(jobId, { status: 'done', progress: 100, objContent, vertices: vCount, faces: fCount });

      } else if (backend === 'gemini') {
        updateJob(jobId, { status: 'generating', progress: 50 });
        const res = await askOllama(`Generate a valid OBJ 3D mesh for: ${prompt}\n\nOutput ONLY the raw OBJ file content. Start with comment lines (#), then vertex lines (v x y z), then face lines (f i j k). No markdown, no explanation.`, 'You are a 3D geometry generator. Output only valid OBJ format vertex and face data.', 'mdq100/Gemma3-Instruct-Abliterated:12b') as any;
        const raw = res?.text || String(res);
        const objContent = raw.replace(/```[^\n]*\n?/g, '').replace(/```/g, '').trim();
        if (!objContent.includes('v ')) throw new Error('No geometry in response');
        const vCount = (objContent.match(/^v /gm) || []).length;
        const fCount = (objContent.match(/^f /gm) || []).length;
        updateJob(jobId, { status: 'done', progress: 100, objContent, vertices: vCount, faces: fCount });

      } else {
        throw new Error(backend === 'hunyuan' ? 'ComfyUI is offline -- start it first' : 'Ollama is offline -- run: ollama serve');
      }
    } catch (e: any) {
      updateJob(jobId, { status: 'error', error: e.message });
    }
    setPrompt('');
  };

  const enhancePrompt = async () => {
    if (!aiPrompt.trim() && !prompt.trim()) return;
    setAiLoading(true);
    const base = aiPrompt || prompt;
    const res = await askOllama(`Enhance this 3D model prompt for photorealistic generation: "${base}"\n\nReturn only the enhanced prompt, 1-2 sentences, specific details about geometry, surface, proportions.`, 'Expert 3D prompt engineer. Write concise, specific prompts for 3D model generation.', 'mdq100/Gemma3-Instruct-Abliterated:12b') as any;
    const enhanced = (res?.text || String(res)).replace(/^"|"$/g, '').trim();
    setPrompt(enhanced);
    setAiLoading(false);
  };

  const downloadObj = (job: MeshJob) => {
    if (!job.objContent) return;
    const blob = new Blob([job.objContent], { type: 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `nexusmesh_${job.prompt.slice(0,30).replace(/\s+/g,'_')}.obj`; a.click();
  };

  const STATUS_COLORS = { queued: 'text-yellow-400', generating: 'text-blue-400 animate-pulse', done: 'text-emerald-400', error: 'text-red-400' };
  const STATUS_ICONS = { queued: Clock, generating: RefreshCw, done: CheckCircle2, error: AlertCircle };

  return (
    <div className="h-full flex bg-black text-slate-300 overflow-hidden">

      {/* Left Panel */}
      <div className="w-72 flex-shrink-0 border-r border-white/5 flex flex-col bg-[#050508]">
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-2 mb-4">
            <Shapes className="w-5 h-5 text-indigo-400" />
            <h1 className="text-sm font-bold text-white">NexusMesh</h1>
            <div className="ml-auto flex gap-1.5">
              <div className={cn("text-[9px] px-2 py-0.5 rounded-full font-bold border", comfyStatus==='online'?"bg-emerald-500/10 border-emerald-500/20 text-emerald-400":"bg-red-500/10 border-red-500/20 text-red-400")}>
                ComfyUI
              </div>
              <div className={cn("text-[9px] px-2 py-0.5 rounded-full font-bold border", ollamaStatus==='online'?"bg-blue-500/10 border-blue-500/20 text-blue-400":"bg-slate-500/10 border-slate-500/20 text-slate-500")}>
                Ollama
              </div>
            </div>
          </div>

          {/* Backend selector */}
          <div className="space-y-2 mb-4">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest">Generation Backend</p>
            {[
              { id: 'hunyuan', label: 'Hunyuan3D 2.1', badge: '⭐ Best Quality', desc: 'ComfyUI . 8GB VRAM optimised', status: comfyStatus },
              { id: 'llamaMesh', label: 'LLaMA-Mesh', badge: '⚡ Fast', desc: 'Ollama local . CPU/GPU', status: ollamaStatus },
              { id: 'gemini', label: 'Gemini AI', badge: '☁ Cloud', desc: 'Always available . simpler', status: 'online' as const },
            ].map(b => (
              <button key={b.id} onClick={() => setBackend(b.id as any)}
                className={cn("w-full text-left px-3 py-2.5 rounded-xl border transition-all",
                  backend === b.id ? "bg-indigo-500/10 border-indigo-500/30" : "bg-white/3 border-white/5 hover:border-white/10")}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-bold text-white">{b.label}</span>
                  <span className="text-[9px] px-1.5 py-0.5 bg-white/5 rounded text-slate-400">{b.badge}</span>
                </div>
                <span className="text-[10px] text-slate-500">{b.desc}</span>
                {b.status === 'offline' && <p className="text-[9px] text-red-400 mt-0.5">⚠ Offline</p>}
              </button>
            ))}
          </div>

          {/* Prompt */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                placeholder="Describe your model, AI will enhance it..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-indigo-500/50"/>
              <button onClick={enhancePrompt} disabled={aiLoading || (!aiPrompt && !prompt)} className="p-1.5 bg-indigo-600/20 border border-indigo-500/30 rounded-lg text-indigo-400 hover:bg-indigo-600/30 transition-all disabled:opacity-30" title="AI enhance prompt">
                {aiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <Wand2 className="w-3.5 h-3.5"/>}
              </button>
            </div>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && e.ctrlKey && generate()}
              placeholder="Final prompt... Ctrl+Enter to generate"
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-300 resize-none focus:outline-none focus:border-indigo-500/50 placeholder-slate-700"/>

            {/* Quick prompts */}
            <div className="flex flex-wrap gap-1">
              {['🚀 Rocket', '🏡 House', '🌊 Wave', '⚔ Sword', '🐉 Dragon', '🪐 Planet'].map(p => (
                <button key={p} onClick={() => setPrompt(p.slice(2))}
                  className="px-2 py-1 bg-white/5 border border-white/5 rounded-lg text-[10px] text-slate-500 hover:text-white hover:border-white/15 transition-all">
                  {p}
                </button>
              ))}
            </div>

            <button onClick={generate} disabled={!prompt.trim()} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
              <Shapes className="w-4 h-4" /> Generate 3D Model
            </button>
          </div>
        </div>

        {/* Settings */}
        <button onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-2 px-4 py-2.5 text-[11px] text-slate-600 hover:text-slate-400 border-b border-white/5 transition-all">
          <Settings className="w-3.5 h-3.5"/> Generation Settings
          <ChevronDown className={cn("w-3 h-3 ml-auto transition-transform", showSettings && "rotate-180")}/>
        </button>
        {showSettings && (
          <div className="px-4 py-3 space-y-3 border-b border-white/5 bg-black/20">
            <div className="flex items-center gap-2 p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <Cpu className="w-3.5 h-3.5 text-blue-400 flex-shrink-0"/>
              <p className="text-[10px] text-blue-300">8GB VRAM mode -- using fp16, tiled VAE, 6 views, octree 256</p>
            </div>
            {[
              { label: 'Steps', value: steps, set: setSteps, min: 10, max: 50, tip: '20 = fast, 35 = quality' },
              { label: 'Guidance Scale', value: guidance, set: setGuidance, min: 1, max: 10, step: 0.5, tip: '5.5 = balanced' },
              { label: 'Octree Depth', value: octreeDepth, set: setOctreeDepth, min: 128, max: 384, step: 64, tip: '256 = 8GB safe, 384 = needs 12GB' },
            ].map(s => (
              <div key={s.label}>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest">{s.label}</span>
                  <span className="text-[10px] text-indigo-400 font-mono">{s.value}</span>
                </div>
                <input type="range" min={s.min} max={s.max} step={(s as any).step || 1} value={s.value} onChange={e => s.set(Number(e.target.value))} className="w-full accent-indigo-500 h-1.5"/>
                <p className="text-[9px] text-slate-700 mt-0.5">{s.tip}</p>
              </div>
            ))}
          </div>
        )}

        {/* Job history */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <p className="text-[9px] text-slate-700 uppercase tracking-widest px-4 py-2">History</p>
          {jobs.length === 0 && <p className="text-[10px] text-slate-700 italic text-center py-6">No models yet</p>}
          {jobs.map(job => {
            const Icon = STATUS_ICONS[job.status];
            return (
              <button key={job.id} onClick={() => setActiveJobId(job.id)}
                className={cn("w-full text-left px-4 py-3 border-b border-white/3 hover:bg-white/3 transition-all group",
                  activeJobId === job.id && "bg-indigo-500/5 border-l-2 border-l-indigo-500")}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", STATUS_COLORS[job.status], job.status==='generating'&&'animate-spin')}/>
                  <span className="text-xs text-white font-medium truncate flex-1">{job.prompt}</span>
                  <button onClick={e => { e.stopPropagation(); setJobs(p => p.filter(j => j.id !== job.id)); if(activeJobId===job.id) setActiveJobId(null); }}
                    className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all">
                    <X className="w-3 h-3"/>
                  </button>
                </div>
                {job.status === 'generating' && (
                  <div className="h-0.5 bg-slate-800 rounded-full overflow-hidden mt-1.5">
                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${job.progress}%` }}/>
                  </div>
                )}
                {job.status === 'done' && <p className="text-[9px] text-slate-600">{job.vertices?.toLocaleString()} verts . {job.faces?.toLocaleString()} faces {job.duration ? `. ${job.duration}s` : ''}</p>}
                {job.status === 'error' && <p className="text-[9px] text-red-500 truncate">{job.error}</p>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3D Viewport */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Viewport toolbar */}
        <div className="flex-shrink-0 px-4 py-2 border-b border-white/5 flex items-center gap-2 bg-black/50 backdrop-blur-sm z-10">
          <button onClick={() => setWireframe(!wireframe)}
            className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border transition-all",
              wireframe ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-300" : "bg-white/5 border-white/10 text-slate-400 hover:text-white")}>
            <Grid className="w-3.5 h-3.5"/> Wireframe
          </button>
          {activeJob?.status === 'done' && activeJob.objContent && (
            <button onClick={() => downloadObj(activeJob)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600/20 border border-emerald-500/30 rounded-lg text-[11px] text-emerald-400 hover:bg-emerald-600/30 transition-all">
              <Download className="w-3.5 h-3.5"/> Download OBJ
            </button>
          )}
          <div className="flex-1"/>
          {activeJob && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span className={STATUS_COLORS[activeJob.status]}>{activeJob.status}</span>
              {activeJob.status === 'generating' && <span>{activeJob.progress}%</span>}
            </div>
          )}
        </div>

        {/* 3D Canvas */}
        <div className="flex-1 relative">
          {!activeJob && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <p className="text-slate-700 text-sm font-mono">Generate a 3D model to see it here</p>
            </div>
          )}
          {activeJob?.status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/50">
              <AlertCircle className="w-10 h-10 text-red-400 mb-3"/>
              <p className="text-red-400 text-sm font-bold mb-1">Generation Failed</p>
              <p className="text-slate-500 text-xs max-w-md text-center">{activeJob.error}</p>
            </div>
          )}
          <Canvas camera={{ position: [0, 0, 4], fov: 45 }} style={{ background: 'linear-gradient(135deg, #0d0d1a 0%, #050510 100%)' }}>
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 10, 5]} intensity={1.2} />
            <pointLight position={[-5, -5, -5]} color="#6366f1" intensity={0.5} />
            {activeJob?.status === 'generating' ? (
              <Spinner3D />
            ) : activeJob?.objContent ? (
              <ObjViewer objText={activeJob.objContent} wireframe={wireframe} />
            ) : (
              <mesh>
                <octahedronGeometry args={[1]} />
                <meshStandardMaterial color="#1e1b4b" wireframe />
              </mesh>
            )}
            <OrbitControls enablePan enableZoom enableRotate />
          </Canvas>
        </div>

        {/* Setup guide overlay when ComfyUI offline */}
        {comfyStatus === 'offline' && backend === 'hunyuan' && (
          <div className="absolute bottom-4 left-4 right-4 bg-slate-900/95 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><HardDrive className="w-4 h-4 text-indigo-400"/>Hunyuan3D 2.1 Setup</h3>
            <div className="grid grid-cols-2 gap-3 text-[10px]">
              <div className="space-y-1">
                <p className="text-slate-400 font-bold">1. Install ComfyUI + custom nodes</p>
                <pre className="bg-black/40 rounded-lg p-2 text-emerald-400 font-mono overflow-x-auto">{`cd ComfyUI/custom_nodes
git clone https://github.com/kijai/ComfyUI-HunyuanDiT
cd ..
pip install -r requirements.txt`}</pre>
              </div>
              <div className="space-y-1">
                <p className="text-slate-400 font-bold">2. Place Hunyuan3D model</p>
                <pre className="bg-black/40 rounded-lg p-2 text-emerald-400 font-mono overflow-x-auto">{`# Copy to ComfyUI models folder:
ComfyUI/models/checkpoints/
  hunyuan3d-2.1.safetensors

# Or your existing model folder:
C:\\Users\\abdul\\nexusai\\models\\`}</pre>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-[10px] text-blue-300">
                💡 8GB VRAM tip: Using fp16 + tiled VAE + octree 256 + 6 views -- this config fits in 8GB. Don't increase octree to 384 unless you have 12GB+.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
