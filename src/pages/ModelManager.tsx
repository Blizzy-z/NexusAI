import React, { useState, useEffect, useMemo } from 'react';
import { 
  Download, 
  HardDrive, 
  Trash2, 
  RefreshCw, 
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Database,
  Library,
  Plus,
  SlidersHorizontal,
  Type,
  Mic,
  ImageIcon,
  Box,
  Video,
  FileText,
  Scan
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { useSettings, OllamaModel } from '../context/SettingsContext';

interface EnhancedModel {
  id: string;
  name: string;
  provider: string;
  size: string;
  quantization: string;
  status: 'idle' | 'downloading' | 'loaded';
  parameters: number; // in millions
  category: string;
  description: string;
}

const CATEGORIES = [
  { id: 'all', label: 'All Models', icon: Library },
  { id: 'text-generation', label: 'Text Generation', icon: FileText },
  { id: 'text-to-speech', label: 'Text-to-Speech', icon: Mic },
  { id: 'text-to-image', label: 'Text-to-Image', icon: ImageIcon },
  { id: 'image-to-text', label: 'Image-to-Text', icon: Scan },
  { id: 'text-to-video', label: 'Text-to-Video', icon: Video },
  { id: 'text-to-3d', label: 'Text-to-3D', icon: Box },
  { id: 'image-to-3d', label: 'Image-to-3D', icon: Box },
];

// Generator for hundreds of models
const generateModels = (): EnhancedModel[] => {
  const baseModels = [
    { name: 'Llama', params: [1000, 3000, 7000, 13000], cats: ['text-generation'] },
    { name: 'Mistral', params: [7000], cats: ['text-generation'] },
    { name: 'Phi', params: [1000, 3000], cats: ['text-generation'] },
    { name: 'Gemma', params: [2000, 7000], cats: ['text-generation'] },
    { name: 'StableDiffusion', params: [800, 1200], cats: ['text-to-image'] },
    { name: 'Whisper', params: [50, 250, 750, 1500], cats: ['image-to-text'] },
    { name: 'Bark', params: [100, 500], cats: ['text-to-speech'] },
    { name: 'SVD', params: [1500, 3000], cats: ['text-to-video'] },
    { name: 'Point-E', params: [300, 900], cats: ['text-to-3d'] },
    { name: 'Shap-E', params: [400, 1000], cats: ['image-to-3d'] },
    { name: 'DeepSeek', params: [1500, 7000, 20000], cats: ['text-generation'] },
    { name: 'Qwen', params: [500, 1500, 7000, 14000], cats: ['text-generation'] },
    { name: 'Flux', params: [12000], cats: ['text-to-image'] },
    { name: 'Mochi', params: [10000], cats: ['text-to-video'] },
    { name: 'Kling', params: [8000, 15000], cats: ['text-to-video'] },
    { name: 'Luma', params: [5000, 12000], cats: ['text-to-video'] },
    { name: 'Tripo', params: [2000, 5000], cats: ['text-to-3d'] },
    { name: 'Meshy', params: [1500, 4000], cats: ['image-to-3d'] },
    { name: 'Eleven', params: [100, 300], cats: ['text-to-speech'] },
    { name: 'PlayHT', params: [200, 600], cats: ['text-to-speech'] },
    { name: 'CLIP', params: [150, 400, 600], cats: ['image-to-text'] },
    { name: 'Moondream', params: [100, 500], cats: ['image-to-text'] },
  ];

  const models: EnhancedModel[] = [];
  
  baseModels.forEach(base => {
    base.params.forEach(p => {
      base.cats.forEach(cat => {
        const versions = ['v1', 'v2', 'v2.5', 'v3', 'Pro', 'Lite', 'Turbo'];
        versions.forEach(v => {
          const pLabel = p >= 1000 ? `${(p / 1000).toFixed(1)}B` : `${p}M`;
          models.push({
            id: `${base.name.toLowerCase()}-${p}-${v}-${cat}`,
            name: `${base.name} ${v} (${pLabel})`,
            provider: 'HuggingFace',
            size: `${(p * 0.002).toFixed(1)} GB`,
            quantization: 'Q4_K_M',
            status: 'idle',
            parameters: p,
            category: cat,
            description: `Advanced ${cat.replace(/-/g, ' ')} model with ${pLabel} parameters.`
          });
        });
      });
    });
  });

  // Add some very small ones to hit the 10M range
  for (let i = 1; i <= 20; i++) {
    models.push({
      id: `nano-tiny-${i}`,
      name: `NanoTiny v${i} (10M)`,
      provider: 'Community',
      size: '25 MB',
      quantization: 'F16',
      status: 'idle',
      parameters: 10,
      category: 'text-generation',
      description: 'Ultra-lightweight model for edge devices.'
    });
  }

  return models;
};

const DISCOVER_MODELS = generateModels();

export default function ModelManager() {
  const { models: installedModels, refreshModels, pullModel, deleteModel, isPulling, pullProgress } = useSettings();
  const [activeTab, setActiveTab] = useState<'library' | 'discover'>('library');
  const [search, setSearch] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [pullingModelName, setPullingModelName] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [paramRange, setParamRange] = useState<[number, number]>([0, 20000]);

  const filteredModels = useMemo(() => {
    const models = activeTab === 'library' 
      ? installedModels.map(m => ({
          id: m.digest,
          name: m.name,
          provider: 'ollama',
          size: (m.size / 1024 / 1024 / 1024).toFixed(1) + ' GB',
          quantization: m.details?.quantization_level || 'Unknown',
          status: 'loaded',
          parameters: 7000, // Default for installed
          category: 'text-generation',
          description: 'Locally installed model.'
        } as EnhancedModel))
      : DISCOVER_MODELS.map(m => ({
          ...m,
          status: installedModels.some(im => im.name.toLowerCase().includes(m.name.toLowerCase().split(' ')[0].toLowerCase())) ? 'loaded' : (isPulling && m.name === pullingModelName ? 'downloading' : 'idle')
        }));

    return models.filter(m => {
      const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || m.category === selectedCategory;
      const matchesParams = m.parameters >= paramRange[0] && m.parameters <= paramRange[1];
      return matchesSearch && matchesCategory && matchesParams;
    });
  }, [activeTab, installedModels, search, selectedCategory, paramRange, isPulling, pullingModelName]);

  const handleDownload = async (name: string) => {
    setPullingModelName(name);
    await pullModel(name);
    setPullingModelName(null);
  };

  const handleDelete = async (name: string) => {
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      await deleteModel(name);
    }
  };

  const handleCustomPull = async () => {
    if (!customModel) return;
    setPullingModelName(customModel);
    await pullModel(customModel);
    setPullingModelName(null);
    setCustomModel('');
  };

  return (
    <div className="p-8 h-full flex flex-col bg-slate-950 overflow-hidden">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Model Manager</h2>
          <p className="text-slate-400">Manage your local AI model library.</p>
        </div>
        <div className="flex gap-4">
           <button onClick={() => refreshModels()} className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all" title="Refresh Library" >
            <RefreshCw className="w-5 h-5 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6 border-b border-white/10 pb-4">
        <button
          onClick={() => setActiveTab('library')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
            activeTab === 'library' ? "bg-emerald-500 text-white" : "text-slate-400 hover:text-white"
          )}
        >
          <Library className="w-4 h-4" />
          My Library ({installedModels.length})
        </button>
        <button
          onClick={() => setActiveTab('discover')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
            activeTab === 'discover' ? "bg-blue-500 text-white" : "text-slate-400 hover:text-white"
          )}
        >
          <Search className="w-4 h-4" />
          Discover ({DISCOVER_MODELS.length})
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[300px] relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search models by name or architecture..." className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all" />
          </div>
          
          <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" />
            <div className="flex flex-col min-w-[200px]">
              <div className="flex justify-between text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">
                <span>Params</span>
                <span className="text-indigo-400">{paramRange[1] >= 1000 ? `${(paramRange[1]/1000).toFixed(1)}B` : `${paramRange[1]}M`}</span>
              </div>
              <input type="range" min="10" max="20000" step="10" value={paramRange[1]} onChange={(e) => setParamRange([0, parseInt(e.target.value)])} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all",
                selectedCategory === cat.id 
                  ? "bg-indigo-500/10 border-indigo-500 text-indigo-400" 
                  : "bg-white/5 border-white/5 text-slate-500 hover:text-slate-300 hover:border-white/10"
              )}
            >
              <cat.icon className="w-3 h-3" />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'discover' && (
        <div className="mb-6 flex gap-2">
          <input value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="Pull from HuggingFace / Ollama (e.g., meta-llama/Llama-3.2-1B)" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50" />
          <button onClick={handleCustomPull} disabled={isPulling || !customModel} className="px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-bold hover:bg-blue-400 transition-all disabled:opacity-50 flex items-center gap-2" >
            {isPulling && pullingModelName === customModel ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Pull
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredModels.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <Database className="w-12 h-12 mb-4 opacity-20" />
            <p>No models match your current filters.</p>
            <p className="text-xs mt-2">Try adjusting the parameter range or search query.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredModels.map((model) => (
            <div key={model.id} className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 hover:border-white/20 transition-all group relative overflow-hidden">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center border bg-indigo-500/10 border-indigo-500/20 text-indigo-400">
                  {CATEGORIES.find(c => c.id === model.category)?.icon ? (
                    React.createElement(CATEGORIES.find(c => c.id === model.category)!.icon, { className: "w-6 h-6" })
                  ) : (
                    <Database className="w-6 h-6" />
                  )}
                </div>
                <div className="flex gap-2">
                  {model.status === 'loaded' && (
                    <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] text-emerald-400 font-mono uppercase tracking-widest">
                      Installed
                    </div>
                  )}
                  <div className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[9px] text-slate-500 font-mono uppercase tracking-widest">
                    {model.parameters >= 1000 ? `${(model.parameters/1000).toFixed(1)}B` : `${model.parameters}M`}
                  </div>
                </div>
              </div>

              <h3 className="text-lg font-bold text-white mb-1">{model.name}</h3>
              <p className="text-[10px] text-slate-500 mb-4 line-clamp-1">{model.description}</p>
              
              <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-6">
                <span className="text-indigo-400">{model.category.replace(/-/g, ' ')}</span>
                <span>-</span>
                <span>{model.size}</span>
                <span>-</span>
                <span>{model.quantization}</span>
              </div>

              {isPulling && pullingModelName === model.name ? (
                 <div className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
                   <RefreshCw className="w-4 h-4 animate-spin" />
                   Downloading...
                 </div>
              ) : (
                <button onClick={() => activeTab === 'discover' ? handleDownload(model.name) : handleDelete(model.name)} disabled={model.status === 'loaded' && activeTab === 'discover'} className={cn( "w-full py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2", activeTab === 'discover' ? (model.status === 'loaded' ? "bg-white/5 text-slate-500 cursor-default" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/20") : "bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20" )} >
                  {activeTab === 'discover' ? (
                    model.status === 'loaded' ? <CheckCircle2 className="w-4 h-4" /> : <Download className="w-4 h-4" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {activeTab === 'discover' ? (model.status === 'loaded' ? 'Installed' : 'Download') : 'Delete'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
