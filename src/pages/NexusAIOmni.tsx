import React, { useMemo, useState } from 'react';
import { Sparkles, Wand2, Rocket, Briefcase, User, BookOpen, Code2, Megaphone, ClipboardList, Lightbulb, Copy, Check } from 'lucide-react';
import { askOllama } from '../services/api';
import { NEXUS_TOOLS, executeTool } from '../services/nexusTools';
import { cn } from '../lib/utils';

type OmniPreset = {
  id: string;
  icon: React.ElementType;
  title: string;
  desc: string;
  promptTemplate: (input: string) => string;
};

const OMNI_PRESETS: OmniPreset[] = [
  {
    id: 'startup-plan',
    icon: Rocket,
    title: 'Startup Builder',
    desc: 'Turn any idea into offer, MVP, growth loop, and launch checklist.',
    promptTemplate: (input) => `Build a practical AI startup execution plan from this idea:\n${input}\n\nInclude: offer, ICP, MVP scope, 30-day roadmap, channel strategy, pricing, and first 10 customer acquisition moves.`,
  },
  {
    id: 'business-automation',
    icon: Briefcase,
    title: 'Business Automation',
    desc: 'Map manual work into automations, agents, and measurable KPIs.',
    promptTemplate: (input) => `You are a business automation architect.\nProcess to automate:\n${input}\n\nReturn: current workflow map, automation opportunities, implementation sequence, and KPI dashboard spec.`,
  },
  {
    id: 'personal-coach',
    icon: User,
    title: 'Personal AI Coach',
    desc: 'Create a life system for focus, habits, and weekly outcomes.',
    promptTemplate: (input) => `Act as an elite personal coach.\nGoal:\n${input}\n\nDesign: weekly plan, daily routine, anti-procrastination protocol, and review cadence.`,
  },
  {
    id: 'study-accelerator',
    icon: BookOpen,
    title: 'Study Accelerator',
    desc: 'Convert a topic into a study map, flashcards, and exam strategy.',
    promptTemplate: (input) => `Design a high-retention study plan for:\n${input}\n\nOutput: concept map, active recall questions, spaced repetition plan, and test simulation routine.`,
  },
  {
    id: 'code-architect',
    icon: Code2,
    title: 'Code Architect',
    desc: 'Break product specs into clean architecture and implementation steps.',
    promptTemplate: (input) => `Act as a senior software architect.\nSpec:\n${input}\n\nProvide: architecture, key modules, data flow, API contracts, edge cases, and delivery phases.`,
  },
  {
    id: 'content-engine',
    icon: Megaphone,
    title: 'Content Engine',
    desc: 'Generate multi-platform content strategy with reusable assets.',
    promptTemplate: (input) => `Create a content operating system for:\n${input}\n\nReturn: pillar themes, weekly cadence, repurposing pipeline, and CTA funnel.`,
  },
];

export default function NexusAIOmni() {
  const [selected, setSelected] = useState<OmniPreset>(OMNI_PRESETS[0]);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const toolCount = NEXUS_TOOLS.length;
  const categories = useMemo(() => [...new Set(NEXUS_TOOLS.map((t) => t.category))].length, []);

  const runOmni = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setOutput('');
    try {
      const systemPrompt = `You are NexusAI Omni, an execution-first AI operator for all-in-one outcomes.
Keep outputs concrete, high signal, and immediately actionable.
When useful, include checklists, scripts, templates, and decision criteria.`;
      const prompt = selected.promptTemplate(input.trim());
      const result = await askOllama(prompt, systemPrompt);
      setOutput(result);
    } catch (e: any) {
      setOutput(`Error: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  const saveToNotes = async () => {
    if (!output.trim()) return;
    try {
      await executeTool({
        toolId: 'save_note',
        params: { text: output.slice(0, 4000), label: `omni-${selected.id}` },
        raw: '',
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {}
  };

  const copyOutput = async () => {
    if (!output.trim()) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <div className="h-full bg-black text-slate-200 flex overflow-hidden">
      <aside className="w-72 flex-shrink-0 border-r border-white/5 bg-slate-950/60 p-4 overflow-y-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">NexusAI Omni</p>
            <p className="text-[10px] text-slate-500">Universal all-in-one AI workspace</p>
          </div>
        </div>

        <div className="mb-4 p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/10">
          <p className="text-[10px] uppercase tracking-widest text-indigo-300/80 mb-1">Engine capability</p>
          <p className="text-xs text-indigo-100">{toolCount} tools across {categories} categories</p>
        </div>

        <div className="space-y-2">
          {OMNI_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const active = selected.id === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => setSelected(preset)}
                className={cn(
                  'w-full text-left p-3 rounded-xl border transition-all',
                  active
                    ? 'bg-indigo-500/15 border-indigo-400/30'
                    : 'bg-slate-900/60 border-white/10 hover:border-white/20'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn('w-4 h-4', active ? 'text-indigo-300' : 'text-slate-400')} />
                  <p className={cn('text-xs font-semibold', active ? 'text-indigo-100' : 'text-white')}>{preset.title}</p>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">{preset.desc}</p>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-6 overflow-y-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-indigo-400" />
              {selected.title}
            </h1>
            <p className="text-sm text-slate-500 mt-1">{selected.desc}</p>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-4">
          <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">Your objective</p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe what you want to build, improve, or automate..."
            rows={6}
            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-100 resize-none focus:outline-none focus:border-indigo-500/40"
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={runOmni}
              disabled={!input.trim() || loading}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold border border-indigo-400/30"
            >
              {loading ? 'Generating...' : 'Generate with Omni'}
            </button>
            <button
              onClick={saveToNotes}
              disabled={!output.trim()}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50 text-slate-200 text-xs border border-white/10"
            >
              {saved ? 'Saved' : 'Save to notes'}
            </button>
          </div>
        </div>

        <div className="bg-slate-900/50 border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <p className="text-xs font-semibold text-white flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-indigo-300" />
              Omni Output
            </p>
            <button
              onClick={copyOutput}
              disabled={!output.trim()}
              className="text-xs text-slate-400 hover:text-white disabled:opacity-50 flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="p-4 text-[12px] text-slate-200 whitespace-pre-wrap leading-relaxed min-h-[260px] max-h-[560px] overflow-auto">
            {output || 'No output yet. Enter an objective and click Generate with Omni.'}
          </pre>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
            <p className="text-xs font-semibold text-white flex items-center gap-2"><Lightbulb className="w-4 h-4 text-amber-300"/>Pro tip</p>
            <p className="text-xs text-slate-400 mt-1">Be specific with niche, budget, timeline, and current constraints for stronger outputs.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
            <p className="text-xs font-semibold text-white flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-300"/>Works with your stack</p>
            <p className="text-xs text-slate-400 mt-1">Omni uses your local model setup and can persist plans/notes into NexusAI tools.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

