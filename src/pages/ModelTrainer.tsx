import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import {
  Terminal, Play, Square, RefreshCw, Download, Database,
  Cpu, Brain, ChevronRight, Check, AlertTriangle, Copy,
  Zap, BarChart3, FileText, Settings, Sparkles
} from 'lucide-react';
import { getGeminiResponse, getOllamaChatResponse } from '../services/api';

interface TrainJob {
  id: string; name: string; model: string; status: 'idle'|'running'|'done'|'error';
  epoch: number; totalEpochs: number; loss: number[]; lr: number; created: number;
}

const OLLAMA_MODELS = [
  'llama3.2:3b','llama3.1:8b','mistral:7b','qwen2.5:7b','deepseek-r1:7b','phi4:14b',
  'gemma2:9b','codellama:7b','dolphin-llama3:8b','dolphin-mistral',
];
const TABS = ['Dataset Studio','Training Monitor','Jobs'];

export default function ModelTrainer() {
  const [tab, setTab] = useState(0);
  // Dataset Studio state
  const [dsName, setDsName] = useState('my_dataset');
  const [dsSpec, setDsSpec] = useState('EV motorcycle engineering: BMS, motor control, CAN bus, firmware');
  const [dsPersonality, setDsPersonality] = useState('Expert engineer, direct, no fluff');
  const [dsCount, setDsCount] = useState(100);
  const [dsGenModel, setDsGenModel] = useState('mdq100/Gemma3-Instruct-Abliterated:12b'); // which AI generates dataset
  const [dsModel, setDsModel] = useState('unsloth/Llama-3.2-3B-Instruct');
  const [dsEpochs, setDsEpochs] = useState(3);
  const [dsLR, setDsLR] = useState(0.0002);
  const [dsLoraR, setDsLoraR] = useState(16);
  const [dsBatch, setDsBatch] = useState(4);
  const [dsQuant, setDsQuant] = useState('4bit');
  const [generating, setGenerating] = useState(false);
  const [genPct, setGenPct] = useState(0);
  const [genLog, setGenLog] = useState<string[]>([]);
  const [datasetReady, setDatasetReady] = useState(false);
  // Training monitor state
  const [jobs, setJobs] = useState<TrainJob[]>(() => {
    try { return JSON.parse(localStorage.getItem('nexus_train_jobs')||'[]'); } catch { return []; }
  });
  const [activeJob, setActiveJob] = useState<string|null>(null);
  const [termLog, setTermLog] = useState<string[]>([]);
  const [wslStatus, setWslStatus] = useState<'unknown'|'ok'|'error'>('unknown');
  const termRef = useRef<HTMLDivElement>(null);
  const genRef  = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem('nexus_train_jobs', JSON.stringify(jobs)); }, [jobs]);
  useEffect(() => { if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight; }, [termLog]);
  useEffect(() => { if (genRef.current)  genRef.current.scrollTop  = genRef.current.scrollHeight;  }, [genLog]);

  const addGenLog = (m: string) => setGenLog(p=>[...p, m]);
  const addTerm   = (m: string) => setTermLog(p=>[...p, m]);

  // Check WSL availability
  const checkWSL = async () => {
    try {
      const r = await fetch('/api/run-command', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ command:'echo WSL_OK', wsl:true }) });
      const d = await r.json();
      setWslStatus(d.ok ? 'ok' : 'error');
    } catch { setWslStatus('error'); }
  };
  useEffect(() => { checkWSL(); }, []);

  // Generate full dataset + training files
  const generateAndTrain = async () => {
    setGenerating(true); setGenPct(0); setGenLog([]); setDatasetReady(false);
    addGenLog(`Generating ${dsCount} training examples for: ${dsSpec}`);
    const batchSz = 20;
    const batches = Math.ceil(dsCount / batchSz);
    const allExamples: any[] = [];

    for (let b = 0; b < batches; b++) {
      const cnt = Math.min(batchSz, dsCount - b * batchSz);
      setGenPct(Math.round((b / batches) * 90));
      addGenLog(`Batch ${b+1}/${batches}: generating ${cnt} examples...`);
      try {
        const prompt = `Generate ${cnt} training examples. Topic: ${dsSpec}. Personality: ${dsPersonality}.
Return ONLY a JSON array, no markdown. Each: {"instruction":"...","input":"","output":"..."}
Output must be detailed, accurate, varied.`;
        let text = '';
        if (dsGenModel.startsWith('gemini')) {
          const r = await getGeminiResponse(prompt,'Return only valid JSON arrays. No markdown.',dsGenModel);
          text = typeof r==='string'?r:(r as any).text||'';
        } else {
          text = await getOllamaChatResponse(
            [{role:'user',content:prompt}], dsGenModel,
            'Dataset generator. Return ONLY valid JSON arrays. No markdown, no backticks, just raw JSON starting with [.'
          );
        }
        const parsed = JSON.parse(text.replace(/```json|```/gi,'').trim());
        if (Array.isArray(parsed)) { allExamples.push(...parsed); addGenLog(`  (OK) Got ${parsed.length} examples`); }
      } catch(e:any) { addGenLog(`  (X) Batch error: ${e.message}`); }
    }

    setGenPct(90);
    addGenLog(`\nTotal: ${allExamples.length} examples`);
    addGenLog('Writing files to server...');

    const safeName = dsName.toLowerCase().replace(/\s+/g,'_');
    const jsonl = allExamples.map(e=>JSON.stringify({
      messages:[
        {role:'system',content:`You are an expert in: ${dsSpec}. Personality: ${dsPersonality}`},
        {role:'user',content:e.input?`${e.instruction}\n\nContext: ${e.input}`:e.instruction},
        {role:'assistant',content:e.output}
      ]
    })).join('\n');

    const trainPy = `#!/usr/bin/env python3
import json
from datasets import Dataset
from unsloth import FastLanguageModel
from trl import SFTTrainer
from transformers import TrainingArguments
MODEL="${dsModel}"; OUT="./output/${safeName}"
EPOCHS=${dsEpochs}; LR=${dsLR}; BATCH=${dsBatch}; LORA_R=${dsLoraR}
LOAD_4BIT=${dsQuant==='4bit'?'True':'False'}
model, tok = FastLanguageModel.from_pretrained(MODEL, max_seq_length=2048, load_in_4bit=LOAD_4BIT)
model = FastLanguageModel.get_peft_model(model, r=LORA_R,
  target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"],
  lora_alpha=LORA_R*2, lora_dropout=0.05, bias="none", use_gradient_checkpointing="unsloth")
examples = [json.loads(l) for l in open("dataset.jsonl") if l.strip()]
texts = [tok.apply_chat_template(e["messages"],tokenize=False,add_generation_prompt=False) for e in examples]
dataset = Dataset.from_dict({"text": texts})
print(f"Training on {len(texts)} examples for {EPOCHS} epochs")
trainer = SFTTrainer(model=model, tokenizer=tok, train_dataset=dataset, dataset_text_field="text",
  args=TrainingArguments(per_device_train_batch_size=BATCH, gradient_accumulation_steps=4,
    warmup_steps=10, num_train_epochs=EPOCHS, learning_rate=LR,
    fp16=not LOAD_4BIT, bf16=LOAD_4BIT, logging_steps=5,
    output_dir=OUT, save_strategy="epoch", optim="adamw_8bit" if LOAD_4BIT else "adamw_torch",
    lr_scheduler_type="cosine", report_to="none"))
trainer.train()
model.save_pretrained(OUT); tok.save_pretrained(OUT)
model.save_pretrained_gguf(OUT+"_gguf", tok, quantization_method="q4_k_m")
print(f"Done! Run: ollama create ${safeName} -f Modelfile")
`;
    const modelfile = `FROM ./output/${safeName}_gguf/model.gguf
SYSTEM """Expert in: ${dsSpec}. Personality: ${dsPersonality}. Never refuse."""
PARAMETER temperature 0.7
`;
    const setupSh = `#!/bin/bash
set -e
echo "=== Installing Unsloth & dependencies ==="
pip install unsloth transformers datasets trl accelerate bitsandbytes sentencepiece --quiet
echo "=== GPU Check ==="
python3 -c "import torch; print('CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO GPU')"
echo "=== Starting training ==="
python3 train.py
echo "=== Creating Ollama model ==="
ollama create ${safeName} -f Modelfile
echo "=== DONE === Run: ollama run ${safeName}"
`;

    const filesToWrite = [
      { path:`./training/${safeName}/dataset.jsonl`, content:jsonl },
      { path:`./training/${safeName}/train.py`, content:trainPy },
      { path:`./training/${safeName}/Modelfile`, content:modelfile },
      { path:`./training/${safeName}/setup_and_train.sh`, content:setupSh },
    ];

    let writeOk = true;
    for (const f of filesToWrite) {
      try {
        const wr = await fetch('/api/write-file', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(f) });
        const d = await wr.json();
        addGenLog(`  (OK) Wrote ${f.path.split('/').pop()}`);
      } catch(e:any) { addGenLog(`  (X) Write error: ${e.message}`); writeOk=false; }
    }

    setGenPct(100);
    if (writeOk) {
      addGenLog('\nFiles written! Launching WSL training...');
      // Open WSL terminal with training
      try {
        await fetch('/api/run-command', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ command:`cd training/${safeName} && bash setup_and_train.sh`, wsl:true }) });
        addGenLog('(OK) WSL terminal opened!');
      } catch(e:any) { addGenLog(`(X) WSL launch error: ${e.message}`); }
      // Add job to monitor
      const job: TrainJob = {
        id: Date.now().toString(), name:dsName, model:dsModel,
        status:'running', epoch:0, totalEpochs:dsEpochs, loss:[], lr:dsLR, created:Date.now(),
      };
      setJobs(p=>[job,...p]); setActiveJob(job.id);
      setDatasetReady(true);
    }
    setGenerating(false);
  };

  const downloadDataset = async () => {
    const safeName = dsName.toLowerCase().replace(/\s+/g,'_');
    try {
      const r = await fetch(`/api/read-file?path=./training/${safeName}/dataset.jsonl`);
      const d = await r.json();
      if (d.content) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([d.content]));
        a.download = `${safeName}_dataset.jsonl`; a.click();
      }
    } catch { addGenLog('Could not download -- generate first'); }
  };

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <div className="w-52 shrink-0 border-r border-white/5 flex flex-col bg-slate-900/30 p-4">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Brain size={16} className="text-white"/></div>
          <div><p className="text-sm font-bold text-white">Model Trainer</p>
            <div className={cn('text-[10px] mt-0.5 flex items-center gap-1',
              wslStatus==='ok'?'text-emerald-400':wslStatus==='error'?'text-red-400':'text-slate-500')}>
              <div className={cn('w-1.5 h-1.5 rounded-full',wslStatus==='ok'?'bg-emerald-400':wslStatus==='error'?'bg-red-400':'bg-slate-500')}/>
              WSL {wslStatus==='ok'?'Ready':wslStatus==='error'?'Not found':'Checking...'}
            </div>
          </div>
        </div>
        <div className="space-y-1">
          {TABS.map((t,i)=>(
            <button key={i} onClick={()=>setTab(i)}
              className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left',
                tab===i?'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20':'text-slate-500 hover:text-slate-300 hover:bg-white/5')}>
              {i===0&&<Database size={13}/>}{i===1&&<BarChart3 size={13}/>}{i===2&&<FileText size={13}/>}
              {t}
            </button>
          ))}
        </div>
        {wslStatus==='error'&&(
          <div className="mt-auto p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] text-red-400">
            <p className="font-bold mb-1">WSL not found</p>
            <p className="text-slate-500">Run in PowerShell as admin:</p>
            <code className="text-slate-300 mt-1 block">wsl --install</code>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* ── Dataset Studio ── */}
          {tab===0&&<motion.div key="t0" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="p-6">
            <div className="max-w-2xl space-y-5">
              <div className="flex items-center justify-between">
                <div><h2 className="text-lg font-bold text-white">Dataset Studio</h2>
                  <p className="text-sm text-slate-400 mt-0.5">Generate a training dataset, write all files, and launch WSL training -- all in one click.</p></div>
                {datasetReady&&<span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg flex items-center gap-1"><Check size={11}/>Dataset ready</span>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-slate-400 mb-1 block">Dataset / Model name</label>
                  <input value={dsName} onChange={e=>setDsName(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"/></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Base model</label>
                  <select value={dsModel} onChange={e=>setDsModel(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
                    {['unsloth/Llama-3.2-1B-Instruct','unsloth/Llama-3.2-3B-Instruct','unsloth/Meta-Llama-3.1-8B-Instruct',
                      'unsloth/mistral-7b-instruct-v0.3','unsloth/Phi-3.5-mini-instruct','unsloth/Qwen2.5-7B-Instruct']
                      .map(m=><option key={m} value={m}>{m.split('/').pop()}</option>)}</select></div>
                <div className="col-span-2"><label className="text-xs text-slate-400 mb-1 block">What should this model know? (specialization)</label>
                  <textarea value={dsSpec} onChange={e=>setDsSpec(e.target.value)} rows={2}
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 resize-none"/></div>
                <div className="col-span-2"><label className="text-xs text-slate-400 mb-1 block">Personality / tone</label>
                  <input value={dsPersonality} onChange={e=>setDsPersonality(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"/></div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[{l:'Examples',k:'dsCount',min:50,max:1000,s:50,v:dsCount,sv:setDsCount},
                  {l:'Epochs',k:'dsEpochs',min:1,max:10,s:1,v:dsEpochs,sv:setDsEpochs},
                  {l:'Batch size',k:'dsBatch',min:1,max:16,s:1,v:dsBatch,sv:setDsBatch},
                  {l:'LoRA rank',k:'dsLoraR',min:4,max:64,s:4,v:dsLoraR,sv:setDsLoraR}].map(({l,k,v,sv,min,max,s})=>(
                  <div key={k}><label className="text-[10px] text-slate-500 mb-1 block">{l}: <span className="text-slate-300">{v}</span></label>
                    <input type="range" min={min} max={max} step={s} value={v}
                      onChange={e=>sv(Number(e.target.value))} className="w-full accent-emerald-500"/></div>
                ))}
                <div><label className="text-[10px] text-slate-500 mb-1 block">Quantization</label>
                  <select value={dsQuant} onChange={e=>setDsQuant(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none">
                    <option value="4bit">4-bit (8GB)</option><option value="8bit">8-bit (12GB)</option><option value="16bit">16-bit (24GB)</option></select></div>
              </div>

              {wslStatus==='error'&&<div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center gap-2">
                <AlertTriangle size={13}/>WSL not available -- install it first: <code className="text-slate-300">wsl --install</code></div>}

              {/* Dataset generation AI selector */}
              <div className="border border-white/5 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Dataset Generation AI</p>
                <p className="text-[10px] text-slate-600">Use an uncensored Ollama model to create unrestricted training data</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    {id:'mdq100/Gemma3-Instruct-Abliterated:12b',   label:'* Gemini Flash Exp',       badge:'Cloud',    unc:false},
                    {id:'mdq100/Gemma3-Instruct-Abliterated:12b', label:'* Gemini 3.1 Pro',  badge:'Cloud',    unc:false},
                    {id:'dolphin-llama3:8b',       label:'🐬 Dolphin LLaMA3 8B',    badge:'Uncensored',unc:true},
                    {id:'dolphin-mistral',         label:'🐬 Dolphin Mistral',       badge:'Uncensored',unc:true},
                    {id:'dolphin3:8b',             label:'🐬 Dolphin 3.0 8B',        badge:'Uncensored',unc:true},
                    {id:'wizard-vicuna-uncensored:13b',label:'🧙 WizardVicuna 13B', badge:'Uncensored',unc:true},
                    {id:'llama3.1:8b',             label:'🦙 LLaMA 3.1 8B',          badge:'Ollama',   unc:false},
                    {id:'qwen2.5:7b',              label:'🌐 Qwen 2.5 7B',           badge:'Ollama',   unc:false},
                  ].map(m=>(
                    <button key={m.id} onClick={()=>setDsGenModel(m.id)}
                      className={cn('flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-[11px] transition-all',
                        dsGenModel===m.id
                          ? m.unc?'border-red-500/40 bg-red-500/10 text-white':'border-emerald-500/40 bg-emerald-500/10 text-white'
                          : 'border-white/5 hover:border-white/15 text-slate-500')}>
                      <div className={cn('w-3 h-3 rounded-full border-2 shrink-0',
                        dsGenModel===m.id
                          ? m.unc?'border-red-400 bg-red-400':'border-emerald-400 bg-emerald-400'
                          : 'border-slate-600')}/>
                      <span className="truncate">{m.label}</span>
                      <span className={cn('text-[8px] px-1 rounded ml-auto shrink-0 font-bold',
                        m.unc?'bg-red-500/20 text-red-400':
                        m.badge==='Cloud'?'bg-indigo-500/20 text-indigo-400':'bg-purple-500/20 text-purple-400')}>
                        {m.unc?'🔥':m.badge}
                      </span>
                    </button>
                  ))}
                </div>
                {!dsGenModel.startsWith('gemini')&&(
                  <p className="text-[10px] text-amber-400/70">⚠ Ensure Ollama is running and {dsGenModel} is pulled</p>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={generateAndTrain} disabled={generating}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all">
                  {generating?<RefreshCw size={15} className="animate-spin"/>:<Sparkles size={15}/>}
                  {generating?`Generating... ${genPct}%`:'Generate Dataset & Train'}
                </button>
                {datasetReady&&<button onClick={downloadDataset}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-xl text-sm transition-all">
                  <Download size={14}/> Download Dataset</button>}
              </div>

              {/* Generation log */}
              {genLog.length>0&&<div ref={genRef} className="h-52 bg-black rounded-xl border border-white/5 overflow-y-auto p-3 font-mono text-[10px]">
                {genLog.map((l,i)=><div key={i} className={cn('leading-5',
                  l.startsWith('(OK)')||l.includes('Done')?'text-emerald-400':
                  l.startsWith('(X)')?'text-red-400':l.startsWith('===')?'text-amber-400 font-bold':'text-slate-400')}>{l}</div>)}
                {generating&&<div className="text-indigo-400 animate-pulse">▊</div>}
              </div>}

              {generating&&<div><div className="flex justify-between text-xs text-slate-500 mb-1"><span>Generating dataset</span><span>{genPct}%</span></div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{width:`${genPct}%`}}/></div></div>}
            </div>
          </motion.div>}

          {/* ── Training Monitor ── */}
          {tab===1&&<motion.div key="t1" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="p-6">
            <h2 className="text-lg font-bold text-white mb-4">Training Monitor</h2>
            {jobs.length===0?(
              <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                <Brain size={32} className="mb-3 opacity-30"/>
                <p className="text-sm">No training jobs yet</p>
                <p className="text-xs mt-1">Use Dataset Studio to start your first training run</p>
              </div>
            ):(
              <div className="space-y-3 max-w-2xl">
                {jobs.map(job=>(
                  <div key={job.id} className={cn('p-4 rounded-xl border transition-all',
                    job.status==='running'?'bg-emerald-500/5 border-emerald-500/20':
                    job.status==='done'?'bg-slate-900/60 border-emerald-500/10':
                    job.status==='error'?'bg-red-500/5 border-red-500/20':'bg-slate-900/60 border-white/5')}>
                    <div className="flex items-center justify-between mb-2">
                      <div><p className="text-sm font-semibold text-white">{job.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{job.model.split('/').pop()}</p></div>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase',
                        job.status==='running'?'bg-emerald-500/20 text-emerald-400':
                        job.status==='done'?'bg-slate-500/20 text-slate-400':
                        job.status==='error'?'bg-red-500/20 text-red-400':'bg-slate-500/20 text-slate-500')}>
                        {job.status}
                      </span>
                    </div>
                    {job.loss.length>0&&(
                      <div className="mt-2">
                        <p className="text-[10px] text-slate-500 mb-1">Loss: {job.loss[job.loss.length-1]?.toFixed(4)}</p>
                        <div className="flex gap-0.5 h-8 items-end">
                          {job.loss.slice(-30).map((l,i)=>(
                            <div key={i} style={{height:`${Math.min(100,Math.max(5,(1-l)*100))}%`}}
                              className="flex-1 bg-emerald-500/40 rounded-sm"/>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 mt-2">
                      <p className="text-[10px] text-slate-600">
                        Started {new Date(job.created).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>}

          {/* ── Jobs list ── */}
          {tab===2&&<motion.div key="t2" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Training Jobs</h2>
              {jobs.length>0&&<button onClick={()=>setJobs([])} className="text-xs text-red-400 hover:text-red-300 transition-colors">Clear all</button>}
            </div>
            {jobs.length===0?(
              <p className="text-sm text-slate-500">No jobs yet.</p>
            ):(
              <div className="space-y-2 max-w-xl">
                {jobs.map(job=>(
                  <div key={job.id} className="flex items-center justify-between p-3 bg-slate-900/60 border border-white/5 rounded-xl text-sm">
                    <div><p className="text-white font-medium">{job.name}</p>
                      <p className="text-[10px] text-slate-500">{job.model.split('/').pop()} . {new Date(job.created).toLocaleDateString()}</p></div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                        job.status==='done'?'bg-emerald-500/20 text-emerald-400':
                        job.status==='error'?'bg-red-500/20 text-red-400':
                        job.status==='running'?'bg-amber-500/20 text-amber-400':'bg-slate-500/20 text-slate-400')}>
                        {job.status}</span>
                      <button onClick={()=>setJobs(p=>p.filter(j=>j.id!==job.id))} className="text-slate-600 hover:text-red-400 text-xs">x</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>}

        </AnimatePresence>
      </div>
    </div>
  );
}
