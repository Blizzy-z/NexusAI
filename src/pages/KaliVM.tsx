/**
 * KaliVM Kali Linux VM interface
 * Connects to Kali via SSH (ssh2 on server) or WebSocket terminal bridge
 * Supports: SSH terminal, tool launcher, file browser, VNC/RDP via iframe
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Terminal, Wifi, WifiOff, Shield, Settings2,
  RefreshCw, Play, Square, AlertTriangle,
  Eye, EyeOff, Maximize2, ChevronRight, Zap,
  Lock, Globe, Server, Monitor, Copy, Check,
  FolderOpen, HardDrive, Activity, ExternalLink,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { askOllama } from '../services/api';

// Types 
interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  keyPath?: string;
}

interface ToolGroup {
  name: string;
  color: string;
  icon: string;
  tools: { name: string; cmd: string; desc: string }[];
}

// Kali security tools 
const TOOL_GROUPS: ToolGroup[] = [
  {
    name: 'Recon', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: '🔍',
    tools: [
      { name: 'nmap', cmd: 'nmap -sV -sC -O --script vuln TARGET', desc: 'Full version + script scan' },
      { name: 'whois', cmd: 'whois TARGET', desc: 'WHOIS lookup' },
      { name: 'dig', cmd: 'dig TARGET ANY', desc: 'DNS records' },
      { name: 'theHarvester', cmd: 'theHarvester -d TARGET -b all', desc: 'OSINT harvester' },
      { name: 'masscan', cmd: 'masscan TARGET -p1-65535 --rate=1000', desc: 'Mass port scan' },
    ],
  },
  {
    name: 'Web', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', icon: '🌐',
    tools: [
      { name: 'nikto', cmd: 'nikto -h http://TARGET', desc: 'Web vulnerability scanner' },
      { name: 'dirb', cmd: 'dirb http://TARGET', desc: 'Dir/file brute-force' },
      { name: 'gobuster', cmd: 'gobuster dir -u http://TARGET -w /usr/share/wordlists/dirb/common.txt', desc: 'Dir enum' },
      { name: 'sqlmap', cmd: 'sqlmap -u "http://TARGET?id=1" --dbs', desc: 'SQL injection auto' },
      { name: 'wpscan', cmd: 'wpscan --url http://TARGET', desc: 'WordPress scanner' },
    ],
  },
  {
    name: 'Network', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: '📡',
    tools: [
      { name: 'wireshark', cmd: 'wireshark &', desc: 'Packet capture GUI' },
      { name: 'tcpdump', cmd: 'tcpdump -i eth0 -w capture.pcap', desc: 'CLI packet capture' },
      { name: 'netcat', cmd: 'nc -lvnp 4444', desc: 'Listen on port 4444' },
      { name: 'arpspoof', cmd: 'arpspoof -i eth0 -t TARGET GATEWAY', desc: 'ARP spoofing' },
    ],
  },
  {
    name: 'Password', color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: '🔑',
    tools: [
      { name: 'hashcat', cmd: 'hashcat -m 0 hash.txt /usr/share/wordlists/rockyou.txt', desc: 'Hash cracking' },
      { name: 'john', cmd: 'john --wordlist=/usr/share/wordlists/rockyou.txt hash.txt', desc: 'John the Ripper' },
      { name: 'hydra', cmd: 'hydra -l admin -P /usr/share/wordlists/rockyou.txt TARGET ssh', desc: 'Brute-force SSH' },
      { name: 'crunch', cmd: 'crunch 8 12 abcdefghijklmnopqrstuvwxyz', desc: 'Wordlist generator' },
    ],
  },
  {
    name: 'Exploit', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', icon: '💣',
    tools: [
      { name: 'msfconsole', cmd: 'msfconsole -q', desc: 'Metasploit Framework' },
      { name: 'msfvenom', cmd: 'msfvenom -p linux/x86/meterpreter/reverse_tcp LHOST=LHOST LPORT=4444 -f elf', desc: 'Payload generator' },
      { name: 'searchsploit', cmd: 'searchsploit TARGET_SERVICE', desc: 'Search ExploitDB' },
    ],
  },
];

// SSH Terminal emulator 
function SSHTerminal({
  config, onOutput,
}: {
  config: SSHConfig; onOutput?: (line: string) => void;
}) {
  const [lines, setLines] = useState<{ t: 'in' | 'out' | 'err' | 'sys'; v: string }[]>([
    { t: 'sys', v: '── NexusAI SSH Terminal ──────────────────────────────' },
    { t: 'sys', v: `Connecting to ${config.host}:${config.port} as ${config.username}...` },
  ]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [wsReady, setWsReady] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);

  const addLine = (t: 'in' | 'out' | 'err' | 'sys', v: string) => {
    setLines(prev => [...prev, { t, v }]);
    if (t === 'out' || t === 'err') onOutput?.(v);
  };

  // WebSocket SSH bridge 
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/api/ws/ssh`;
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsReady(true);
        ws.send(JSON.stringify({ type: 'connect', ...config }));
        addLine('sys', 'OK WebSocket bridge connected -- sending SSH handshake...');
      };

      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === 'data')    addLine('out', d.data);
          if (d.type === 'error')   addLine('err', d.error);
          if (d.type === 'ready')   addLine('sys', `OK SSH connected to ${config.host}`);
          if (d.type === 'closed')  addLine('sys', 'x SSH session closed');
        } catch {
          addLine('out', e.data);
        }
      };

      ws.onerror = () => {
        addLine('err', '⚠ WebSocket error -- SSH bridge may not be available');
        addLine('sys', 'Tip: Run NexusAI from rebuild.bat on your main PC where ssh2 is installed');
      };

      ws.onclose = () => {
        setWsReady(false);
        addLine('sys', 'WebSocket closed');
      };
    } catch {
      addLine('err', 'Could not establish WebSocket -- SSH unavailable in this environment');
    }
    return () => wsRef.current?.close();
  }, []);

  const sendCmd = () => {
    if (!input.trim()) return;
    const cmd = input.trim();
    setInput('');
    addLine('in', `${config.username}@kali:~$ ${cmd}`);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: cmd + '\n' }));
    } else {
      // Fallback: exec via agent endpoint
      setRunning(true);
      fetch('/api/agent/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.stdout) addLine('out', d.stdout);
          if (d.stderr) addLine('err', d.stderr);
        })
        .catch(e => addLine('err', e.message))
        .finally(() => setRunning(false));
    }
  };

  const insertCmd = (cmd: string, target: string) => {
    setInput(cmd.replace(/TARGET/g, target || 'TARGET').replace(/LHOST/g, window.location.hostname));
  };

  return { lines, input, setInput, sendCmd, running, wsReady, addLine, insertCmd, endRef };
}

// Main component 
export default function KaliVM() {
  const [config, setConfig] = useState<SSHConfig>({
    host: 'kali.local',
    port: 22,
    username: 'kali',
    password: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [connected, setConnected] = useState(false);
  const [activeView, setActiveView] = useState<'terminal' | 'tools' | 'vnc' | 'ai'>('terminal');
  const [termLines, setTermLines] = useState<{ t: 'in' | 'out' | 'err' | 'sys'; v: string }[]>([
    { t: 'sys', v: '── NexusAI x Kali Linux Terminal ──────────────────────' },
    { t: 'sys', v: 'Configure SSH connection to the left, then click Connect.' },
    { t: 'sys', v: 'Once connected, type commands below or use the Tools tab.' },
  ]);
  const [termInput, setTermInput] = useState('');
  const [termRunning, setTermRunning] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [toolTarget, setToolTarget] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>('Recon');
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [ollamaModel, setOllamaModel] = useState('mdq100/Gemma3-Instruct-Abliterated:12b');
  const [vncUrl, setVncUrl] = useState('');
  const [copied, setCopied] = useState<string>('');

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [termLines]);

  const addLine = (t: 'in' | 'out' | 'err' | 'sys', v: string) => {
    setTermLines(prev => [...prev, { t, v }]);
  };

  // Connect SSH via WebSocket bridge 
  const connect = () => {
    if (wsRef.current) wsRef.current.close();
    addLine('sys', `Connecting to ${config.host}:${config.port}...`);

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/ssh`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'connect', ...config }));
    };
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'ready')   { setConnected(true); addLine('sys', `OK SSH session open -- ${config.username}@${config.host}`); }
        if (d.type === 'data')    addLine('out', d.data);
        if (d.type === 'error')   addLine('err', d.error || 'SSH error');
        if (d.type === 'closed')  { setConnected(false); addLine('sys', 'x Session closed'); }
      } catch { addLine('out', e.data); }
    };
    ws.onerror = () => {
      setConnected(false);
      addLine('err', '⚠ Cannot reach SSH bridge -- is the server running on your main PC?');
    };
    ws.onclose = () => { setConnected(false); };
  };

  const disconnect = () => {
    wsRef.current?.close();
    setConnected(false);
    addLine('sys', 'Disconnected.');
  };

  const sendCmd = () => {
    if (!termInput.trim()) return;
    const cmd = termInput.trim();
    setTermInput('');
    addLine('in', `${config.username}@kali $ ${cmd}`);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: cmd + '\n' }));
    } else {
      // Fallback exec on local PC if not SSH connected
      setTermRunning(true);
      fetch('/api/agent/exec', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.stdout) addLine('out', d.stdout);
          if (d.stderr) addLine('err', d.stderr);
        })
        .catch(e => addLine('err', e.message))
        .finally(() => setTermRunning(false));
    }
  };

  const launchTool = (cmd: string) => {
    const full = cmd.replace(/TARGET/g, toolTarget || '127.0.0.1').replace(/LHOST/g, window.location.hostname);
    addLine('in', `kali$ ${full}`);
    setActiveView('terminal');
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: full + '\n' }));
    } else {
      addLine('sys', 'Not connected -- command queued. Connect SSH first.');
    }
  };

  const copyCmd = async (cmd: string) => {
    await navigator.clipboard.writeText(cmd);
    setCopied(cmd);
    setTimeout(() => setCopied(''), 1500);
  };

  const runAI = async () => {
    if (!aiInput.trim() || aiLoading) return;
    setAiLoading(true);
    const sys = `You are a Kali Linux security expert. Be precise, technical, and always include the exact commands needed.
Recent terminal output: ${termLines.slice(-10).map(l => l.v).join('\n')}`;
    try {
      const res = await askOllama(aiInput, sys, ollamaModel);
      setAiResult(res);
    } catch (e: any) { setAiResult('⚠ ' + e.message); }
    setAiLoading(false);
  };

  const VIEWS = [
    { id: 'terminal', label: '⬛ SSH Terminal' },
    { id: 'tools',    label: '🛠 Tool Launcher' },
    { id: 'vnc',      label: '🖥 VNC/Desktop' },
    { id: 'ai',       label: '🧠 AI Assist' },
  ] as const;

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d] text-slate-200 overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#111] border-b border-white/6 flex-shrink-0">
        <Shield className="w-4.5 h-4.5 text-red-500"/>
        <div>
          <h1 className="text-sm font-bold text-white">Kali VM</h1>
          <p className="text-[9px] text-slate-600">SSH terminal . tool launcher . VNC desktop</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <select value={ollamaModel} onChange={e => setOllamaModel(e.target.value)}
            className="bg-[#1a1a1a] border border-white/8 rounded px-2 py-1 text-[9px] text-slate-500 focus:outline-none">
            {['gemma3:12b', 'gemma3:4b', 'deepseek-r1:7b', 'mistral:7b'].map(m =>
              <option key={m} value={m}>{m.replace(/^hf\.co\/[^/]+\//,'').replace(/^[^/]+\//,'')}</option>)}
          </select>
          <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-bold', connected ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400')}>
            {connected ? <Wifi className="w-3 h-3"/> : <WifiOff className="w-3 h-3"/>}
            {connected ? `SSH . ${config.host}` : 'Not connected'}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left: Config */}
        <div className="w-56 flex-shrink-0 bg-[#111] border-r border-white/5 flex flex-col overflow-hidden">
          <div className="px-3 py-3 border-b border-white/5">
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-3">SSH Connection</p>
            <div className="space-y-2">
              {[
                { label: 'Host / IP', key: 'host',     type: 'text',     placeholder: 'kali.local' },
                { label: 'Port',      key: 'port',     type: 'number',   placeholder: '22' },
                { label: 'Username',  key: 'username', type: 'text',     placeholder: 'kali' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-[9px] text-slate-700 mb-0.5">{f.label}</label>
                  <input
                    type={f.type}
                    value={(config as any)[f.key]}
                    onChange={e => setConfig(prev => ({ ...prev, [f.key]: f.type === 'number' ? +e.target.value : e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-[#1a1a1a] border border-white/8 rounded px-2 py-1.5 text-[11px] font-mono text-white focus:outline-none focus:border-red-500/40"
                  />
                </div>
              ))}
              <div>
                <label className="block text-[9px] text-slate-700 mb-0.5">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={config.password}
                    onChange={e => setConfig(prev => ({ ...prev, password: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') connect(); }}
                    placeholder="------"
                    className="w-full bg-[#1a1a1a] border border-white/8 rounded px-2 py-1.5 text-[11px] font-mono text-white focus:outline-none focus:border-red-500/40 pr-7"
                  />
                  <button onClick={() => setShowPass(p => !p)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-700 hover:text-slate-400">
                    {showPass ? <EyeOff className="w-3 h-3"/> : <Eye className="w-3 h-3"/>}
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-1.5">
              <button onClick={connect} disabled={connected} className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-[10px] font-bold transition-all">
                Connect
              </button>
              <button onClick={disconnect} disabled={!connected} className="flex-1 py-1.5 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white rounded text-[10px] font-bold transition-all">
                Disconnect
              </button>
            </div>
          </div>

          {/* Tool target input */}
          <div className="px-3 py-2.5 border-b border-white/5">
            <label className="block text-[9px] text-slate-700 mb-1">Tool target (replaces TARGET)</label>
            <input
              value={toolTarget}
              onChange={e => setToolTarget(e.target.value)}
              placeholder="192.168.1.100 or domain.com"
              className="w-full bg-[#1a1a1a] border border-white/8 rounded px-2 py-1.5 text-[10px] font-mono text-white focus:outline-none focus:border-orange-500/40 placeholder-slate-700"
            />
          </div>

          {/* VNC config */}
          <div className="px-3 py-2.5 border-b border-white/5">
            <label className="block text-[9px] text-slate-700 mb-1">VNC/noVNC URL</label>
            <input
              value={vncUrl}
              onChange={e => setVncUrl(e.target.value)}
              placeholder="http://kali.local:6080/vnc.html"
              className="w-full bg-[#1a1a1a] border border-white/8 rounded px-2 py-1.5 text-[10px] font-mono text-white focus:outline-none focus:border-purple-500/40 placeholder-slate-700"
            />
          </div>

          {/* Quick connections */}
          <div className="flex-1 px-3 py-3 overflow-y-auto">
            <p className="text-[9px] font-bold text-slate-700 uppercase tracking-widest mb-2">Quick connect</p>
            {[
              { label: 'Kali mDNS', host: 'kali.local', user: 'kali' },
              { label: 'VirtualBox', host: '192.168.56.101', user: 'kali' },
              { label: 'VMware', host: '192.168.181.128', user: 'root' },
              { label: 'Localhost', host: '127.0.0.1', user: 'kali' },
            ].map(q => (
              <button key={q.label} onClick={() => setConfig(prev => ({ ...prev, host: q.host, username: q.user }))}
                className="w-full text-left px-2.5 py-2 mb-1 bg-white/2 hover:bg-white/4 border border-white/5 rounded text-[10px] text-slate-600 hover:text-white transition-all">
                <span className="font-bold block">{q.label}</span>
                <span className="font-mono text-[9px] text-slate-700">{q.user}@{q.host}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Views */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* View tabs */}
          <div className="flex border-b border-white/5 bg-[#111] flex-shrink-0">
            {VIEWS.map(v => (
              <button key={v.id} onClick={() => setActiveView(v.id)}
                className={cn('px-4 py-2 text-[10px] font-bold uppercase tracking-wide transition-all border-b-2',
                  activeView === v.id
                    ? 'text-white border-red-500 bg-white/3'
                    : 'text-slate-600 border-transparent hover:text-slate-300')}>
                {v.label}
              </button>
            ))}
          </div>

          {/* Terminal */}
          {activeView === 'terminal' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-[#050505]">
              <div className="flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed">
                {termLines.map((l, i) => (
                  <pre key={i} className={cn('whitespace-pre-wrap break-all',
                    l.t === 'in'  ? 'text-cyan-400' :
                    l.t === 'err' ? 'text-red-400' :
                    l.t === 'sys' ? 'text-slate-600 italic' :
                                    'text-emerald-300')}>
                    {l.v}
                  </pre>
                ))}
                {termRunning && <p className="text-amber-400 animate-pulse">executing...</p>}
                <div ref={endRef}/>
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 border-t border-white/6 bg-[#0a0a0a] flex-shrink-0">
                <span className="text-red-500 font-mono text-sm select-none">❯</span>
                <input
                  value={termInput}
                  onChange={e => setTermInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendCmd(); }}
                  placeholder={connected ? `${config.username}@${config.host}:~$` : 'Connect SSH first (or exec local commands)'}
                  className="flex-1 bg-transparent text-white font-mono text-[12px] focus:outline-none placeholder-slate-800"
                />
              </div>
            </div>
          )}

          {/* Tool Launcher */}
          {activeView === 'tools' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex items-center gap-3 mb-1">
                <p className="text-[10px] text-slate-600">Target: <span className="font-mono text-white">{toolTarget || 'not set (<- set in sidebar)'}</span></p>
              </div>
              {TOOL_GROUPS.map(group => (
                <div key={group.name} className="border border-white/5 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedGroup(expandedGroup === group.name ? null : group.name)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 bg-[#111] hover:bg-white/3 transition-colors text-left">
                    <span className="text-sm">{group.icon}</span>
                    <span className={cn('text-[11px] font-bold', group.color.split(' ')[0])}>{group.name}</span>
                    <span className="text-[9px] text-slate-700 ml-1">{group.tools.length} tools</span>
                    <ChevronRight className={cn('w-3.5 h-3.5 text-slate-700 ml-auto transition-transform',
                      expandedGroup === group.name && 'rotate-90')}/>
                  </button>
                  {expandedGroup === group.name && (
                    <div className="divide-y divide-white/5">
                      {group.tools.map(tool => {
                        const cmd = tool.cmd.replace(/TARGET/g, toolTarget || 'TARGET').replace(/LHOST/g, window.location.hostname);
                        return (
                          <div key={tool.name} className="flex items-center gap-3 px-4 py-3 bg-[#0d0d0d] hover:bg-white/2 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold text-white">{tool.name}</p>
                              <p className="text-[9px] text-slate-600 mt-0.5">{tool.desc}</p>
                              <p className="text-[9px] font-mono text-slate-700 mt-1 truncate">{cmd}</p>
                            </div>
                            <div className="flex gap-1.5 flex-shrink-0">
                              <button onClick={() => copyCmd(cmd)}
                                className="p-1.5 bg-white/3 hover:bg-white/6 border border-white/8 rounded text-slate-600 hover:text-white transition-colors">
                                {copied === cmd ? <Check className="w-3 h-3 text-emerald-400"/> : <Copy className="w-3 h-3"/>}
                              </button>
                              <button onClick={() => launchTool(tool.cmd)}
                                className={cn('p-1.5 rounded border transition-colors', group.color,
                                  'hover:opacity-80')}>
                                <Play className="w-3 h-3"/>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* VNC/Desktop */}
          {activeView === 'vnc' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-black">
              {vncUrl ? (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#111] border-b border-white/5 flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse"/>
                    <span className="text-[10px] text-slate-500 font-mono truncate">{vncUrl}</span>
                    <a href={vncUrl} target="_blank" rel="noreferrer" className="ml-auto text-slate-700 hover:text-slate-400">
                      <ExternalLink className="w-3.5 h-3.5"/>
                    </a>
                  </div>
                  <iframe
                    src={vncUrl}
                    className="flex-1 border-none"
                    title="Kali VNC Desktop"
                    allow="clipboard-read; clipboard-write"
                  />
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-700">
                  <Monitor className="w-12 h-12 opacity-20"/>
                  <p className="text-xs uppercase tracking-widest">No VNC URL configured</p>
                  <p className="text-[10px] text-center max-w-sm leading-relaxed">
                    Install noVNC on Kali: <code className="text-slate-600">sudo apt install novnc tightvncserver</code><br/>
                    Start: <code className="text-slate-600">vncserver :1 && novnc --listen 6080 --vnc localhost:5901</code><br/>
                    Then enter <code className="text-slate-600">http://kali.local:6080/vnc.html</code> in the sidebar
                  </p>
                </div>
              )}
            </div>
          )}

          {/* AI Assist */}
          {activeView === 'ai' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex gap-3">
                <input
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') runAI(); }}
                  placeholder="Ask about Kali tools, exploit techniques, scan results..."
                  className="flex-1 bg-[#1a1a1a] border border-white/8 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-500/40 placeholder-slate-700"
                />
                <button onClick={runAI} disabled={aiLoading} className="px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5">
                  {aiLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <Zap className="w-3.5 h-3.5"/>}
                  Ask
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  'Explain nmap -sV -sC output',
                  'How to escalate privileges on Linux?',
                  'What does this Metasploit error mean?',
                  'Best wordlists for password cracking',
                  'How to set up a reverse shell',
                ].map(q => (
                  <button key={q} onClick={() => setAiInput(q)}
                    className="px-3 py-1.5 bg-white/3 hover:bg-white/5 border border-white/8 rounded-xl text-[10px] text-slate-600 hover:text-white transition-all">
                    {q}
                  </button>
                ))}
              </div>
              {aiResult && (
                <div className="bg-[#111] border border-white/8 rounded-2xl p-4">
                  <pre className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{aiResult}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
