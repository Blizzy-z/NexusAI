/**
 * AddonsTab - Hardware system linking, firmware flashing, and tunnel setup
 * Lives inside Settings as a separate component to keep Settings.tsx manageable.
 *
 * Systems:
 * - BioMesh Suit ESP32 firmware download + NexusAI server link
 * - Drone System Cloudflare tunnel, ArduPilot params, gesture firmware
 * - Jarvis Table Raspberry Pi 5 setup scripts, SSH link
 * - Doomcase OS Arch Linux ISO builder, custom packages
 */
import React, { useState, useEffect } from 'react';
import {
  Download, RefreshCw, Check, ExternalLink, Copy,
  Play, Square, ChevronDown, ChevronRight,
  Wifi, WifiOff, Server, Shield, Radio, Layers,
  Terminal, HardDrive, Cloud, Zap, AlertTriangle,
  Link, Globe, Package, Github,
} from 'lucide-react';
import { cn } from '../lib/utils';

// Types
interface AddonStatus { connected: boolean; label: string; }
interface StepItem { cmd: string; desc: string; }

// Helpers
async function runCmd(command: string): Promise<{ stdout: string; stderr: string; ok: boolean }> {
  try {
    const r = await fetch('/api/agent/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, timeout: 30000 }),
      signal: AbortSignal.timeout(35000),
    });
    const d = await r.json();
    return { stdout: d.stdout || '', stderr: d.stderr || '', ok: r.ok };
  } catch (e: any) {
    return { stdout: '', stderr: e.message, ok: false };
  }
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

// Expandable addon card
function AddonCard({
  id, icon, title, subtitle, accentColor, borderColor, children, defaultOpen
}: {
  id: string; icon: React.ReactNode; title: string; subtitle: string;
  accentColor: string; borderColor: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className={cn('border rounded-2xl overflow-hidden transition-all', open ? borderColor : 'border-white/8')}>
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/3 transition-colors"
      >
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl border', borderColor, 'bg-black/30')}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-slate-600 flex-shrink-0"/>
          : <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0"/>}
      </button>
      {open && <div className="border-t border-white/5 p-5 space-y-5">{children}</div>}
    </div>
  );
}

// Terminal output panel
function TermOutput({ lines, running }: { lines: string[]; running: boolean }) {
  if (!lines.length && !running) return null;
  return (
    <div className="bg-black/60 border border-white/8 rounded-xl p-3 font-mono text-[11px] max-h-40 overflow-y-auto space-y-0.5">
      {lines.map((l, i) => (
        <p key={i} className={cn('leading-relaxed', l.startsWith('ERROR') || l.startsWith('error') ? 'text-red-400' : l.startsWith('OK') || l.startsWith('SUCCESS') || l.startsWith('[OK]') ? 'text-emerald-400' : l.startsWith('>') ? 'text-cyan-300' : 'text-slate-400' )}>{l}</p>
      ))}
      {running && <p className="text-amber-400 animate-pulse">running...</p>}
    </div>
  );
}

// Step list
function StepList({ steps, title }: { steps: StepItem[]; title: string }) {
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [stepIdx, setStepIdx] = useState(-1);

  const runAll = async () => {
    setRunning(true);
    setLog([]);
    for (let i = 0; i < steps.length; i++) {
      setStepIdx(i);
      setLog(p => [...p, `> ${steps[i].desc}`]);
      const { stdout, stderr } = await runCmd(steps[i].cmd);
      if (stdout.trim()) setLog(p => [...p, stdout.trim().split('\n').slice(0, 3).join('\n')]);
      if (stderr.trim() && !stdout.trim()) setLog(p => [...p, `ERROR: ${stderr.trim().slice(0, 100)}`]);
      else setLog(p => [...p, `OK - step ${i + 1} done`]);
    }
    setStepIdx(-1);
    setRunning(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</p>
        <button onClick={runAll} disabled={running} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/25 text-emerald-400 rounded-xl text-[10px] font-bold disabled:opacity-50 transition-all">
          {running ? <><RefreshCw className="w-3 h-3 animate-spin"/>Running...</> : <><Play className="w-3 h-3"/>Run All</>}
        </button>
      </div>
      <div className="space-y-1.5">
        {steps.map((s, i) => (
          <div key={i} className={cn('flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all', stepIdx === i ? 'bg-amber-500/10 border-amber-500/20' : stepIdx > i ? 'bg-emerald-500/8 border-emerald-500/15' : 'bg-white/3 border-white/5')}>
            <div className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold', stepIdx > i ? 'bg-emerald-500/20 text-emerald-400' : stepIdx === i ? 'bg-amber-500/20 text-amber-400 animate-pulse' : 'bg-white/8 text-slate-600')}>
              {stepIdx > i ? 'OK' : i + 1}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-300">{s.desc}</p>
              <p className="text-[10px] text-slate-600 font-mono mt-0.5 truncate">{s.cmd}</p>
            </div>
            <button onClick={() => copyText(s.cmd)} className="p-1 text-slate-700 hover:text-white transition-colors flex-shrink-0">
              <Copy className="w-3 h-3"/>
            </button>
          </div>
        ))}
      </div>
      <TermOutput lines={log} running={running} />
    </div>
  );
}

// Download button
function DownloadBtn({ label, url, desc }: { label: string; url: string; desc: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3 p-3 bg-white/3 border border-white/5 rounded-xl">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-white">{label}</p>
        <p className="text-[10px] text-slate-600 mt-0.5">{desc}</p>
      </div>
      <button onClick={() => { copyText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="px-3 py-1.5 bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg text-[10px] text-slate-400 hover:text-white transition-all flex-shrink-0">
        {copied ? <><Check className="w-3 h-3 inline mr-1 text-emerald-400"/>Copied</> : 'Copy URL'}
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-indigo-600/80 hover:bg-indigo-500 border border-indigo-500/30 rounded-lg text-[10px] text-white font-bold transition-all flex items-center gap-1.5 flex-shrink-0">
        <ExternalLink className="w-3 h-3"/>Open
      </a>
    </div>
  );
}

// Input row
function InputRow({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-[10px] text-slate-500 w-32 flex-shrink-0">{label}</label>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn('flex-1 bg-slate-900/60 border border-white/8 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none focus:border-indigo-500/40', mono && 'font-mono')}
      />
    </div>
  );
}

//
// BIOMESH SUIT ADDON
//
function BioMeshAddon() {
  const [serverUrl, setServerUrl] = useState('http://192.168.1.x:3000');
  const [esp32Port, setEsp32Port] = useState('COM3');
  const [log, setLog] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<'idle'|'ok'|'fail'>('idle');

  const testLink = async () => {
    setTesting(true);
    setStatus('idle');
    const { stdout } = await runCmd(`curl -s --max-time 5 ${serverUrl}/api/health`);
    if (stdout.includes('ok') || stdout.includes('status')) {
      setStatus('ok');
      setLog(['Connected to NexusAI server successfully.', `Server URL: ${serverUrl}`]);
    } else {
      setStatus('fail');
      setLog(['Could not reach NexusAI server.', 'Check the IP/port and make sure NexusAI is running.']);
    }
    setTesting(false);
  };

  const FLASH_STEPS: StepItem[] = [
    { desc: 'Check Python + esptool installed', cmd: 'python --version && pip show esptool' },
    { desc: 'Install esptool (ESP32 flasher)', cmd: 'pip install esptool --quiet' },
    { desc: 'Check ESP32 connected', cmd: `mode ${esp32Port}` },
    { desc: 'Download BioMesh firmware binary', cmd: 'curl -L https://github.com/nexusai/biomesh/releases/latest/download/biomesh_esp32.bin -o biomesh_esp32.bin' },
    { desc: 'Erase ESP32 flash', cmd: `python -m esptool --port ${esp32Port} erase_flash` },
    { desc: 'Flash BioMesh firmware', cmd: `python -m esptool --port ${esp32Port} --baud 460800 write_flash -z 0x0 biomesh_esp32.bin` },
  ];

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        The BioMesh Suit system runs on an ESP32 microcontroller. Flash it with the NexusAI BioMesh firmware, 
        then link it to this NexusAI server so the BioSuit Monitor page receives live biometric data via WebSocket.
      </p>

      {/* NexusAI Server Link */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">NexusAI Server Link</p>
        <p className="text-[10px] text-slate-600 leading-relaxed">
          The ESP32 sends biometric data to this NexusAI server over WiFi. Enter the server IP so the firmware 
          knows where to connect. This is the IP of the PC running NexusAI on your local network.
        </p>
        <InputRow label="NexusAI Server URL" value={serverUrl} onChange={setServerUrl}
          placeholder="http://192.168.1.x:3000" mono />
        <div className="flex gap-2">
          <button onClick={testLink} disabled={testing} className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/25 text-emerald-400 rounded-xl text-[11px] font-bold disabled:opacity-50 transition-all">
            {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <Wifi className="w-3.5 h-3.5"/>}
            Test Connection
          </button>
          {status === 'ok' && <span className="flex items-center gap-1.5 text-[11px] text-emerald-400"><Check className="w-3.5 h-3.5"/>Connected</span>}
          {status === 'fail' && <span className="flex items-center gap-1.5 text-[11px] text-red-400"><AlertTriangle className="w-3.5 h-3.5"/>Failed</span>}
        </div>
        <TermOutput lines={log} running={testing} />
      </div>

      {/* Downloads */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Downloads</p>
        <DownloadBtn label="BioMesh Firmware (.bin)" url="https://github.com/nexusai/biomesh/releases/latest/download/biomesh_esp32.bin" desc="ESP32 firmware binary flash with esptool"/>
        <DownloadBtn label="BioMesh Config Tool" url="https://github.com/nexusai/biomesh/releases/latest/download/biomesh_config.exe" desc="Windows config utility sets WiFi credentials and server URL"/>
        <DownloadBtn label="Arduino Source Code" url="https://github.com/nexusai/biomesh" desc="Full open-source firmware modify sensors, thresholds, sampling rate"/>
        <DownloadBtn label="BioMesh Source (ZIP)" url="/api/addons/download?addon=biomesh" desc="Download local BioMesh addon source as a ZIP (if present)"/>
      </div>

      {/* Flash Steps */}
      <InputRow label="ESP32 COM Port" value={esp32Port} onChange={setEsp32Port} placeholder="COM3" mono />
      <StepList steps={FLASH_STEPS} title="Flash ESP32 Firmware"/>

      {/* BioSuit Server endpoints info */}
      <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Server Endpoints (auto-active)</p>
        {[
          ['POST /api/biosuit/data', 'ESP32 POSTs biometric readings here every 100ms'],
          ['WS /api/ws/biosuit', 'BioSuit Monitor page connects here for live data'],
          ['GET /api/biosuit/stream', 'SSE stream for chart updates'],
        ].map(([ep, desc]) => (
          <div key={ep} className="flex gap-3 items-start">
            <code className="text-[10px] text-indigo-400 font-mono flex-shrink-0 mt-0.5">{ep}</code>
            <p className="text-[10px] text-slate-600">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

//
// DRONE SYSTEM ADDON
//
function DroneAddon() {
  const [cfEmail, setCfEmail] = useState('');
  const [cfToken, setCfToken] = useState('');
  const [droneIp, setDroneIp] = useState('192.168.4.1');
  const [tunnelName, setTunnelName] = useState('nexusdrone');
  const [tunnelStatus, setTunnelStatus] = useState<'idle'|'running'|'stopped'>('idle');
  const [tunnelUrl, setTunnelUrl] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const startTunnel = async () => {
    setRunning(true);
    setLog(['Starting Cloudflare tunnel...']);
    // Check cloudflared installed
    const check = await runCmd('cloudflared --version');
    if (!check.ok || check.stderr.includes('not recognized')) {
      setLog(p => [...p,
        'cloudflared not found. Downloading...',
        'Run: winget install --id Cloudflare.cloudflared',
        'Or: https://github.com/cloudflare/cloudflared/releases/latest',
      ]);
      setRunning(false);
      return;
    }
    setLog(p => [...p, `OK cloudflared ${check.stdout.split('\n')[0]}`, 'Starting quick tunnel (no account needed)...']);
    // Start a quick tunnel pointing at drone companion computer
    const { stdout, stderr } = await runCmd(
      `start /b cloudflared tunnel --url http://${droneIp}:5760 2>&1`
    );
    const urlMatch = (stdout + stderr).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (urlMatch) {
      setTunnelUrl(urlMatch[0]);
      setTunnelStatus('running');
      setLog(p => [...p, `Tunnel live: ${urlMatch[0]}`, 'MAVLink proxy accessible at this URL.']);
    } else {
      setLog(p => [...p, 'Tunnel output:', (stdout || stderr).slice(0, 200)]);
    }
    setRunning(false);
  };

  const stopTunnel = async () => {
    await runCmd('taskkill /f /im cloudflared.exe');
    setTunnelStatus('stopped');
    setTunnelUrl('');
    setLog(['Tunnel stopped.']);
  };

  const FLASH_STEPS: StepItem[] = [
    { desc: 'Check Python 3.10+ installed', cmd: 'python --version' },
    { desc: 'Install MAVProxy (ground station)', cmd: 'pip install MAVProxy --quiet' },
    { desc: 'Install dronekit (Python API)', cmd: 'pip install dronekit dronekit-sitl --quiet' },
    { desc: 'Download ArduPilot Configurator', cmd: 'curl -L https://firmware.ardupilot.org/Tools/MissionPlanner/MissionPlanner-latest.msi -o MissionPlanner.msi' },
    { desc: 'Download NexusAI param file', cmd: 'curl -L http://localhost:3000/api/drone/params -o nexusai_arducopter.param' },
    { desc: 'Download gesture bridge script', cmd: 'curl -L http://localhost:3000/api/drone/gesture-bridge -o gesture_bridge.py' },
    { desc: 'Test MAVLink connection', cmd: `python -c "from pymavlink import mavutil; m=mavutil.mavlink_connection('udpin:0.0.0.0:14550'); m.wait_heartbeat(); print('Heartbeat OK')"` },
  ];

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Link the drone to NexusAI via MAVLink. Set up a Cloudflare tunnel so you can access the 
        companion computer MAVLink stream and gesture bridge remotely. Flash ArduPilot parameters 
        optimised for the NexusAI gesture control system.
      </p>

      {/* Cloudflare Tunnel */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cloudflare Tunnel</p>
        <p className="text-[10px] text-slate-600 leading-relaxed">
          Creates a secure public URL for your drone's companion computer so you can reach the MAVLink 
          telemetry stream and gesture bridge from anywhere -- no port forwarding needed.
        </p>
        <InputRow label="Drone Companion IP" value={droneIp} onChange={setDroneIp} placeholder="192.168.4.1" mono />
        <InputRow label="Tunnel Name" value={tunnelName} onChange={setTunnelName} placeholder="nexusdrone" mono />

        {tunnelUrl && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl">
            <Globe className="w-4 h-4 text-emerald-400 flex-shrink-0"/>
            <p className="text-[11px] text-emerald-300 font-mono flex-1 truncate">{tunnelUrl}</p>
            <button onClick={() => navigator.clipboard.writeText(tunnelUrl)} className="p-1 text-emerald-600 hover:text-emerald-400 transition-colors">
              <Copy className="w-3.5 h-3.5"/>
            </button>
          </div>
        )}

        <div className="flex gap-2">
          {tunnelStatus !== 'running' ? (
            <button onClick={startTunnel} disabled={running} className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/25 text-blue-400 rounded-xl text-[11px] font-bold disabled:opacity-50 transition-all">
              {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <Cloud className="w-3.5 h-3.5"/>}
              Start Tunnel
            </button>
          ) : (
            <button onClick={stopTunnel} className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/25 text-red-400 rounded-xl text-[11px] font-bold transition-all">
              <Square className="w-3.5 h-3.5"/>Stop Tunnel
            </button>
          )}
        </div>
        <TermOutput lines={log} running={running} />

        <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Install cloudflared (Windows)</p>
          {[
            'winget install --id Cloudflare.cloudflared',
            '# Or download from:',
            'https://github.com/cloudflare/cloudflared/releases/latest',
          ].map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <code className="text-[10px] text-slate-400 font-mono flex-1">{l}</code>
              {!l.startsWith('#') && !l.startsWith('http') && (
                <button onClick={() => copyText(l)} className="p-1 text-slate-700 hover:text-white transition-colors">
                  <Copy className="w-3 h-3"/>
                </button>
              )}
              {l.startsWith('http') && (
                <a href={l} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-700 hover:text-indigo-400 transition-colors">
                  <ExternalLink className="w-3 h-3"/>
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Downloads */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Downloads</p>
        <DownloadBtn label="ArduPilot Mission Planner" url="https://firmware.ardupilot.org/Tools/MissionPlanner/MissionPlanner-latest.msi" desc="Windows FC configuration and firmware flasher"/>
        <DownloadBtn label="ArduCopter Firmware (STM32F4)" url="https://firmware.ardupilot.org/Copter/stable/Pixhawk1/arducopter.apj" desc="Latest stable ArduCopter for Pixhawk 1/2"/>
        <DownloadBtn label="QGroundControl (alternative)" url="https://d176tv9ibo4jno.cloudfront.net/latest/QGroundControl-installer.exe" desc="Alternative ground control station"/>
        <DownloadBtn label="DroneRef Technical Guide" url="http://localhost:3000" desc="View the full Hybrid Gesture-Control Drone technical reference in NexusAI see the DroneRef page"/>
        <DownloadBtn label="DroneRef Source (ZIP)" url="/api/addons/download?addon=drone" desc="Download local Drone addon source as a ZIP (if present)"/>
      </div>

      {/* Setup Steps */}
      <StepList steps={FLASH_STEPS} title="Software Setup + MAVLink Test"/>

      {/* NexusAI Drone endpoints */}
      <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">NexusAI Drone Endpoints</p>
        {[
          ['GET /api/drone/params', 'Download ArduCopter parameter file (NexusAI defaults)'],
          ['GET /api/drone/gesture-bridge', 'Download the Python gesture bridge script'],
          ['WS /api/ws/drone', 'Real-time MAVLink telemetry WebSocket'],
          ['POST /api/drone/command', 'Send MAVLink commands from NexusAI UI'],
        ].map(([ep, desc]) => (
          <div key={ep} className="flex gap-3 items-start">
            <code className="text-[10px] text-cyan-400 font-mono flex-shrink-0 mt-0.5">{ep}</code>
            <p className="text-[10px] text-slate-600">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

//
// JARVIS TABLE (RASPBERRY PI 5) ADDON
//
function JarvisAddon() {
  const [biomeshIp, setBiomeshIp] = useState('192.168.1.101');
  const [voiceIp,   setVoiceIp]   = useState('192.168.1.102');
  const [cameraIp,  setCameraIp]  = useState('192.168.1.103');
  const [protocol,  setProtocol]  = useState<'mqtt'|'ws'>('ws');
  const [mqttIp,    setMqttIp]    = useState('192.168.1.1');
  const [log, setLog] = useState<string[]>([]);
  const [pinging, setPinging] = useState(false);

  const pingAll = async () => {
    setPinging(true);
    setLog(['Pinging ESP32 nodes...']);
    for (const [name, ip] of [['BioMesh', biomeshIp],['Voice I/O', voiceIp],['Camera', cameraIp]]) {
      const { stdout } = await runCmd(`ping -n 1 -w 1000 ${ip}`);
      const ok = stdout.includes('TTL=') || stdout.includes('bytes=');
      setLog(p => [...p, `${ok ? 'OK' : 'OFFLINE'} ${name} @ ${ip}`]);
    }
    setPinging(false);
  };

  const FIRMWARE_STEPS_BIOMESH: StepItem[] = [
    { desc: 'Install Arduino IDE + ESP32 board support', cmd: 'winget install --id ArduinoSA.IDE.stable' },
    { desc: 'Install required libraries (PubSubClient, ArduinoJson)', cmd: 'echo Install via Arduino IDE Library Manager: PubSubClient by Nick O Brien, ArduinoJson by Benoit Blanchon' },
    { desc: 'Download BioMesh ESP32 firmware', cmd: 'curl -L http://localhost:3000/api/strap/firmware -o biomesh_firmware.zip' },
    { desc: 'Configure WiFi and PC server IP in firmware', cmd: 'echo Edit WiFi_SSID, WiFi_PASS, and PC_SERVER_IP in config.h before flashing' },
    { desc: 'Flash via Arduino IDE (select ESP32 Dev Module, 115200 baud)', cmd: 'echo Select board: Tools > Board > ESP32 Dev Module. Connect USB. Click Upload.' },
    { desc: 'Verify in Serial Monitor -- should print CONNECTED TO PC', cmd: 'echo Open Serial Monitor at 115200 baud to verify connection' },
  ];

  const FIRMWARE_STEPS_VOICE: StepItem[] = [
    { desc: 'Install Arduino IDE + ESP32 board support (if not done)', cmd: 'echo Same as BioMesh setup above' },
    { desc: 'Install Audio libraries (ESP8266Audio or I2S)', cmd: 'echo Arduino Library Manager: ESP8266Audio by Earle Philhower, ArduinoWebSockets by Markus Sattler' },
    { desc: 'Download Voice I/O firmware', cmd: 'curl -L http://localhost:3000/api/jarvis/voice-firmware -o voice_esp32_firmware.zip' },
    { desc: 'Connect I2S microphone (INMP441 or SPH0645) and I2S speaker (MAX98357A)', cmd: 'echo INMP441: VDD=3.3V, GND, WS=GPIO15, SCK=GPIO14, SD=GPIO32. MAX98357A: VIN=5V, GND, DIN=GPIO25, BCLK=GPIO26, LRC=GPIO27' },
    { desc: 'Set PC IP and WebSocket port in config', cmd: 'echo Edit PC_SERVER_IP and WS_PORT (default 3001) in voice_config.h' },
    { desc: 'Flash and verify microphone stream', cmd: 'echo Serial Monitor should show: Audio streaming to PC... and Receiving TTS audio...' },
  ];

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        The Jarvis Table uses ESP32 nodes as lightweight sensor edges connected to this PC via WiFi.
        The PC runs all AI computation (Gemma 12B). ESP32s just send data up and receive commands down.
        No Raspberry Pi required -- the PC IS the hub.
      </p>

      {/* Architecture summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: '🫀', title: 'BioMesh ESP32',   ip: biomeshIp, setIp: setBiomeshIp,
            up: 'HR, temp, IMU, SpO2', down: 'LED, buzzer, haptic' },
          { icon: '🎤', title: 'Voice I/O ESP32', ip: voiceIp,   setIp: setVoiceIp,
            up: 'Mic audio stream', down: 'TTS audio bytes' },
          { icon: '📷', title: 'ESP32-CAM',       ip: cameraIp,  setIp: setCameraIp,
            up: 'MJPEG video stream', down: 'Flash, pan/tilt' },
        ].map(node => (
          <div key={node.title} className="p-3 bg-white/3 border border-white/8 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{node.icon}</span>
              <p className="text-[10px] font-bold text-white">{node.title}</p>
            </div>
            <input value={node.ip} onChange={e => node.setIp(e.target.value)}
              placeholder="192.168.1.10x" className="w-full bg-slate-900/60 border border-white/8 rounded-lg px-2.5 py-1.5 text-[11px] text-white font-mono focus:outline-none focus:border-indigo-500/30"/>
            <div className="text-[9px] space-y-1">
              <div className="px-1.5 py-0.5 bg-emerald-500/8 rounded text-emerald-400"><span className="font-mono">UP: </span>{node.up}</div>
              <div className="px-1.5 py-0.5 bg-indigo-500/8 rounded text-indigo-400"><span className="font-mono">DN: </span>{node.down}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Protocol */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Communication Protocol</p>
        <div className="flex gap-2">
          {(['ws', 'mqtt'] as const).map(p => (
            <button key={p} onClick={() => setProtocol(p)}
              className={`px-4 py-2 rounded-xl text-[11px] font-bold border uppercase transition-all ${
                protocol === p ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400' : 'bg-white/3 border-white/8 text-slate-600 hover:text-white'
              }`}>
              {p === 'ws' ? 'WebSocket (recommended)' : 'MQTT'}
            </button>
          ))}
        </div>
        {protocol === 'mqtt' && (
          <div>
            <p className="text-[10px] text-slate-600 mb-1">MQTT Broker IP (runs on your router or this PC)</p>
            <input value={mqttIp} onChange={e => setMqttIp(e.target.value)} placeholder="192.168.1.1"
              className="bg-slate-900/60 border border-white/8 rounded-lg px-3 py-2 text-[11px] text-white font-mono focus:outline-none w-48"/>
            <p className="text-[9px] text-slate-700 mt-1">Install Mosquitto on this PC: winget install mosquitto</p>
          </div>
        )}
        {protocol === 'ws' && (
          <p className="text-[10px] text-slate-600">
            ESP32s connect to <code className="text-cyan-400">ws://YOUR_PC_IP:3001</code> directly.
            NexusAI server handles the WebSocket endpoint -- no extra broker needed.
          </p>
        )}
      </div>

      {/* Ping test */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Connectivity Test</p>
        <button onClick={pingAll} disabled={pinging} className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/25 text-emerald-400 rounded-xl text-[11px] font-bold disabled:opacity-50 transition-all">
          {pinging ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/>Pinging...</> : <><Wifi className="w-3.5 h-3.5"/>Ping All ESP32 Nodes</>}
        </button>
        <TermOutput lines={log} running={pinging}/>
      </div>

      {/* Downloads */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Downloads</p>
        <DownloadBtn label="Arduino IDE" url="https://www.arduino.cc/en/software" desc="Required for ESP32 firmware flashing"/>
        <DownloadBtn label="ESP32 Board Package" url="https://dl.espressif.com/dl/package_esp32_index.json" desc="Add to Arduino IDE: File > Preferences > Board Manager URLs"/>
        <DownloadBtn label="INMP441 Mic Wiring Guide" url="https://www.instructables.com/ESP32-INMP441-I2S-Microphone/" desc="Wiring for I2S microphone to ESP32"/>
        <DownloadBtn label="MAX98357A Speaker Wiring" url="https://learn.adafruit.com/adafruit-max98357-i2s-class-d-mono-amp" desc="I2S audio amplifier + speaker wiring"/>
        <DownloadBtn label="MQTT Explorer (debug tool)" url="https://mqtt-explorer.com/" desc="Inspect MQTT messages between ESP32 and PC"/>
      </div>

      {/* Firmware steps */}
      <StepList steps={FIRMWARE_STEPS_BIOMESH} title="Flash BioMesh ESP32"/>
      <StepList steps={FIRMWARE_STEPS_VOICE} title="Flash Voice I/O ESP32"/>

      {/* NexusAI endpoints */}
      <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">NexusAI Server Endpoints (ESP32 connects here)</p>
        {[
          ['POST /api/jarvis/node/register', 'ESP32 calls on boot -- registers its ID, type, IP'],
          ['POST /api/jarvis/node/data',     'ESP32 POSTs sensor data every interval'],
          ['GET  /api/jarvis/nodes',         'JarvisTable UI fetches all node statuses'],
          ['POST /api/jarvis/node/command',  'NexusAI sends commands to ESP32 via HTTP'],
          ['WS   /api/ws/jarvis-voice',      'Voice ESP32 audio stream WebSocket'],
        ].map(([ep, desc]) => (
          <div key={ep as string} className="flex gap-3 items-start">
            <code className="text-[10px] text-cyan-400 font-mono flex-shrink-0 mt-0.5">{ep as string}</code>
            <p className="text-[10px] text-slate-600">{desc as string}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DoomcaseAddon() {
  const [log, setLog] = useState<string[]>([]);

  const ARCH_STEPS: StepItem[] = [
    { desc: 'Check WSL2 / Linux environment', cmd: 'wsl --version' },
    { desc: 'Install archiso build tool (in WSL/Linux)', cmd: 'wsl sudo pacman -Sy archiso --noconfirm' },
    { desc: 'Download NexusAI Doomcase profile', cmd: 'wsl git clone https://github.com/nexusai/doomcase-os ~/doomcase-profile' },
    { desc: 'Build ISO (takes 5-15 min)', cmd: 'wsl cd ~/doomcase-profile && sudo mkarchiso -v -w /tmp/archiso-work -o ~/doomcase-out ./releng' },
    { desc: 'Copy ISO to Windows', cmd: 'wsl cp ~/doomcase-out/*.iso /mnt/c/Users/$USER/Desktop/' },
    { desc: 'Download Ventoy (bootable USB maker)', cmd: 'curl -L https://github.com/ventoy/Ventoy/releases/latest/download/ventoy-1.0.99-windows.zip -o ventoy.zip && tar -xf ventoy.zip' },
  ];

  const PACKAGE_GROUPS = [
    {
      group: 'AI & ML',
      pkgs: ['ollama', 'python-pytorch-cuda', 'python-transformers', 'python-accelerate', 'cuda', 'cudnn'],
    },
    {
      group: 'Development',
      pkgs: ['nodejs', 'npm', 'git', 'neovim', 'zsh', 'tmux', 'htop', 'python', 'pip'],
    },
    {
      group: 'Desktop',
      pkgs: ['hyprland', 'waybar', 'rofi-wayland', 'kitty', 'firefox', 'thunar'],
    },
    {
      group: 'Hardware / Drone',
      pkgs: ['arduino-ide', 'mission-planner', 'python-dronekit', 'python-pymavlink', 'esptool'],
    },
    {
      group: 'Security / OSINT',
      pkgs: ['nmap', 'wireshark', 'metasploit', 'hashcat', 'john', 'aircrack-ng'],
    },
  ];

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Build and flash the Doomcase OS -- a custom Arch Linux distribution optimised for the Doomcase 
        ITX form factor with CUDA AI workloads, Hyprland desktop, and all NexusAI dependencies pre-installed.
        Use WSL2 on Windows to run the archiso build process.
      </p>

      {/* Downloads */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Downloads</p>
        <DownloadBtn label="Ventoy (bootable USB)" url="https://github.com/ventoy/Ventoy/releases/latest" desc="Flash the ISO to a USB drive without burning"/>
        <DownloadBtn label="Balena Etcher" url="https://etcher.balena.io/" desc="Alternative USB flasher simple drag and drop"/>
        <DownloadBtn label="Arch Linux Base ISO" url="https://archlinux.org/download/" desc="Start from vanilla Arch if not using the NexusAI profile"/>
        <DownloadBtn label="NVIDIA CUDA Toolkit" url="https://developer.nvidia.com/cuda-downloads" desc="Required for GPU AI workloads in Doomcase OS"/>
        <DownloadBtn label="Doomcase Source (ZIP)" url="/api/addons/download?addon=doomcase" desc="Download local Doomcase build profile as a ZIP (if present)"/>
      </div>

      {/* Package groups */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Package Groups (pre-installed)</p>
        {PACKAGE_GROUPS.map(({ group, pkgs }) => (
          <div key={group} className="p-3 bg-white/3 border border-white/5 rounded-xl">
            <p className="text-[10px] font-bold text-slate-400 mb-2">{group}</p>
            <div className="flex flex-wrap gap-1.5">
              {pkgs.map(p => (
                <span key={p} className="text-[9px] font-mono px-2 py-0.5 bg-slate-800/80 border border-white/8 rounded text-slate-400">{p}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Build steps */}
      <StepList steps={ARCH_STEPS} title="Build ISO (requires WSL2)"/>

      {/* UEFI / BIOS notes */}
      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 space-y-1.5">
        <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Doomcase BIOS Notes</p>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Boot from USB: press DEL or F2 at POST for BIOS. Disable Secure Boot. Set boot order to USB first. 
          After install, re-enable Secure Boot if needed for GPU drivers. CUDA requires UEFI boot mode.
        </p>
        {[
          ['Secure Boot', 'Disable during installation'],
          ['Boot Mode', 'UEFI only (not legacy CSM)'],
          ['Fast Boot', 'Disable -- prevents USB boot'],
          ['Above 4G Decoding', 'Enable -- required for GPU passthrough/AI'],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-3 text-[10px]">
            <span className="text-amber-400/70 font-mono w-32 flex-shrink-0">{k}</span>
            <span className="text-slate-500">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

//
// WRIST STRAP (nRF52840) ADDON
//
function StrapAddon() {
  const [port, setPort] = useState('COM4');
  const FLASH_STEPS: StepItem[] = [
    { desc: 'Install nRF Command Line Tools', cmd: 'winget install --id NordicSemiconductor.nRFCommandLineTools' },
    { desc: 'Download NexusStrap firmware (.hex)', cmd: 'curl -L http://localhost:3000/api/strap/firmware -o nexus_strap.hex' },
    { desc: 'Check nRF52840 connected (J-Link)', cmd: 'nrfjprog --version' },
    { desc: 'Erase nRF52840 flash', cmd: 'nrfjprog --eraseall -f NRF52' },
    { desc: 'Flash NexusStrap firmware', cmd: 'nrfjprog --program nexus_strap.hex --sectorerase -f NRF52 --verify' },
    { desc: 'Reset and verify', cmd: 'nrfjprog --reset -f NRF52' },
    { desc: 'Check BLE advertising (scan)', cmd: 'python -m bleak discover --timeout 5 --name NexusStrap' },
  ];

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Flash the NexusStrap nRF52840 wrist straps with gesture-control firmware. 
        Requires a J-Link programmer (nRF52840 DK or standalone J-Link) and Nordic nRF Command Line Tools.
      </p>
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Downloads</p>
        <DownloadBtn label="nRF Command Line Tools" url="https://www.nordicsemi.com/Products/Development-tools/nRF-Command-Line-Tools/Download" desc="Nordic nrfjprog required for J-Link flashing"/>
        <DownloadBtn label="nRF Connect Desktop" url="https://www.nordicsemi.com/Products/Development-tools/nRF-Connect-for-Desktop" desc="GUI tool for BLE inspection and DFU updates"/>
        <DownloadBtn label="Zephyr RTOS (source)" url="https://docs.zephyrproject.org/latest/getting_started/index.html" desc="Build NexusStrap firmware from source"/>
        <DownloadBtn label="NexusStrap Source (ZIP)" url="/api/addons/download?addon=nexusstrap" desc="Download local NexusStrap firmware/profile as a ZIP (if present)"/>
      </div>
      <StepList steps={FLASH_STEPS} title="Flash NexusStrap Firmware"/>
      <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 space-y-1.5">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Strap BLE Identifiers</p>
        {[['Right strap', 'NexusStrap-R', 'Primary hand gesture sensor'],['Left strap', 'NexusStrap-L', 'Secondary/modifier input']].map(([id, name, desc]) => (
          <div key={id} className="flex gap-3 text-[10px] items-center">
            <span className="text-indigo-400 font-mono w-24 flex-shrink-0">{name}</span>
            <span className="text-slate-600">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

//
// GITHUB CLI CONTROL ADDON
//
function GitHubControlAddon() {
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [op, setOp] = useState<'auth_status'|'repo_view'|'pr_list'|'issue_list'|'workflow_list'|'workflow_runs'>('repo_view');

  const loadConfig = async () => {
    try {
      const [cfgRes, statusRes] = await Promise.all([
        fetch('/api/github-cli/config', { signal: AbortSignal.timeout(5000) }),
        fetch('/api/github-cli/status', { signal: AbortSignal.timeout(8000) }),
      ]);
      const cfg = await cfgRes.json().catch(() => ({}));
      const st = await statusRes.json().catch(() => ({}));
      if (cfg?.config) {
        setOwner(String(cfg.config.owner || ''));
        setRepo(String(cfg.config.repo || ''));
      }
      if (st?.ok) setStatus(st);
    } catch {}
  };

  useEffect(() => { loadConfig(); }, []);

  const saveRepoConfig = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/github-cli/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo }),
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      await loadConfig();
      setResult({ ok: true, summary: `Saved default repo ${owner}/${repo}` });
    } catch (e: any) {
      setResult({ ok: false, summary: e.message || 'Failed to save repo config' });
    }
    setSaving(false);
  };

  const saveToken = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/github-cli/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(12000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setStatus(d);
      setResult({ ok: true, summary: token ? 'GitHub token saved.' : 'GitHub token cleared.' });
    } catch (e: any) {
      setResult({ ok: false, summary: e.message || 'Failed to save token' });
    }
    setSaving(false);
  };

  const refreshStatus = async () => {
    setChecking(true);
    try {
      const r = await fetch('/api/github-cli/status', { signal: AbortSignal.timeout(10000) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setStatus(d);
      setResult({ ok: true, summary: 'GitHub CLI status refreshed.' });
    } catch (e: any) {
      setResult({ ok: false, summary: e.message || 'Failed to refresh status' });
    }
    setChecking(false);
  };

  const runOperation = async () => {
    setRunning(true);
    try {
      const r = await fetch('/api/github-cli/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: op, owner, repo, state: 'open', limit: 10 }),
        signal: AbortSignal.timeout(35000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setResult(d);
    } catch (e: any) {
      setResult({ ok: false, error: e.message || 'Failed to run operation' });
    }
    setRunning(false);
  };

  const stateBadge = status?.auth?.authenticated
    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
    : 'bg-amber-500/10 border-amber-500/25 text-amber-400';

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Connect NexusAI to GitHub CLI and let AI run managed GitHub operations (repo info, PR lists, issues, workflows)
        through safe allowlisted server endpoints.
      </p>

      <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">CLI Status</p>
          <button onClick={refreshStatus} disabled={checking}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg text-[10px] text-slate-400 hover:text-white disabled:opacity-50">
            {checking ? <RefreshCw className="w-3 h-3 animate-spin"/> : <RefreshCw className="w-3 h-3"/>}
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
          <div className="px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-slate-400">
            gh installed: <span className={cn('font-mono', status?.installed ? 'text-emerald-400' : 'text-red-400')}>{status?.installed ? 'yes' : 'no'}</span>
          </div>
          <div className={cn('px-3 py-2 rounded-lg border font-mono', stateBadge)}>
            auth: {status?.auth?.authenticated ? `ok (${status?.auth?.login || 'logged in'})` : 'not authenticated'}
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-slate-400">
            default repo: <span className="font-mono text-indigo-300">{status?.config?.owner && status?.config?.repo ? `${status.config.owner}/${status.config.repo}` : '(unset)'}</span>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-slate-400">
            token source: <span className="font-mono text-slate-300">{status?.auth?.source || 'none'}</span>
          </div>
        </div>
        {status?.auth?.error && (
          <p className="text-[10px] text-amber-400 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
            {status.auth.error}
          </p>
        )}
      </div>

      <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 space-y-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Repository Defaults</p>
        <InputRow label="Owner" value={owner} onChange={setOwner} placeholder="abdul" mono />
        <InputRow label="Repo" value={repo} onChange={setRepo} placeholder="nexusai_public" mono />
        <button onClick={saveRepoConfig} disabled={saving || !owner || !repo}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/25 text-indigo-300 rounded-xl text-[11px] font-bold disabled:opacity-50 transition-all">
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <Check className="w-3.5 h-3.5"/>}
          Save Repo Defaults
        </button>
      </div>

      <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 space-y-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">GitHub Token (optional, recommended)</p>
        <div className="flex items-center gap-2">
          <input
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="ghp_... or github_pat_..."
            className="flex-1 bg-slate-900/60 border border-white/8 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none focus:border-indigo-500/30 font-mono"
          />
          <button onClick={() => setShowToken(v => !v)}
            className="px-3 py-2 bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg text-[10px] text-slate-400 hover:text-white">
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={saveToken} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/25 text-emerald-300 rounded-xl text-[11px] font-bold disabled:opacity-50 transition-all">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <Shield className="w-3.5 h-3.5"/>}
            Save / Update Token
          </button>
          <button onClick={() => { setToken(''); }}
            className="px-4 py-2 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl text-[11px] text-slate-400 hover:text-white">
            Clear Field
          </button>
        </div>
      </div>

      <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 space-y-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Run Managed Operation</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {([
            { id: 'auth_status', label: 'Auth Status' },
            { id: 'repo_view', label: 'Repo View' },
            { id: 'pr_list', label: 'PR List' },
            { id: 'issue_list', label: 'Issue List' },
            { id: 'workflow_list', label: 'Workflows' },
            { id: 'workflow_runs', label: 'Workflow Runs' },
          ] as const).map(item => (
            <button key={item.id} onClick={() => setOp(item.id)}
              className={cn('px-3 py-2 rounded-lg border text-[10px] font-bold transition-all',
                op === item.id ? 'bg-indigo-500/15 border-indigo-500/25 text-indigo-300' : 'bg-white/3 border-white/8 text-slate-500 hover:text-white')}>
              {item.label}
            </button>
          ))}
        </div>
        <button onClick={runOperation} disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/25 text-cyan-300 rounded-xl text-[11px] font-bold disabled:opacity-50 transition-all">
          {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <Play className="w-3.5 h-3.5"/>}
          Run {op}
        </button>
      </div>

      {result && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Last Result</p>
          <pre className="bg-black/60 border border-white/8 rounded-xl p-3 font-mono text-[10px] text-slate-300 max-h-64 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

//
// NEXUSAI UPDATER ADDON
//
function NexusUpdaterAddon() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<any>(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/updater/status', { signal: AbortSignal.timeout(10000) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setStatus(d);
      setResult(null);
    } catch (e: any) {
      setResult({ ok: false, error: e.message || 'Failed to load updater status' });
    }
    setLoading(false);
  };

  useEffect(() => { loadStatus(); }, []);

  const checkRemote = async () => {
    setChecking(true);
    try {
      const r = await fetch('/api/updater/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(45000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setStatus(d.status || d);
      setResult({ ok: true, summary: 'Remote check completed.', data: d });
    } catch (e: any) {
      setResult({ ok: false, error: e.message || 'Remote check failed' });
    }
    setChecking(false);
  };

  const applyUpdate = async () => {
    setApplying(true);
    try {
      const r = await fetch('/api/updater/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(130000),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setStatus(d.status || status);
      setResult(d);
    } catch (e: any) {
      setResult({ ok: false, error: e.message || 'Update failed' });
    }
    setApplying(false);
  };

  const shortHash = (value: string) => value ? value.slice(0, 8) : '-';
  const cleanBadge = status?.clean
    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
    : 'bg-red-500/10 border-red-500/25 text-red-400';
  const updateBadge = status?.hasUpdates
    ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
    : 'bg-white/3 border-white/8 text-slate-500';

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Safe in-app updater for this NexusAI install. It runs real <code className="text-indigo-300">git fetch</code> and
        fast-forward-only <code className="text-indigo-300">git pull --ff-only</code>. It will not update while your working
        tree has uncommitted changes.
      </p>

      <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Repository Status</p>
          <button
            onClick={loadStatus}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg text-[10px] text-slate-400 hover:text-white disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-3 h-3 animate-spin"/> : <RefreshCw className="w-3 h-3"/>}
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
          <div className="px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-slate-400">
            repo root: <span className="font-mono text-slate-300">{status?.repoRoot || '(unknown)'}</span>
          </div>
          <div className={cn('px-3 py-2 rounded-lg border font-mono', cleanBadge)}>
            workspace: {status?.clean ? 'clean' : 'dirty'}
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-slate-400">
            branch: <span className="font-mono text-indigo-300">{status?.branch || '(unknown)'}</span>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-slate-400">
            upstream: <span className="font-mono text-slate-300">{status?.tracking || '(none)'}</span>
          </div>
          <div className={cn('px-3 py-2 rounded-lg border text-slate-400', updateBadge)}>
            behind: <span className="font-mono">{Number(status?.behind || 0)}</span> | ahead: <span className="font-mono">{Number(status?.ahead || 0)}</span>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-slate-400">
            can update: <span className={cn('font-mono', status?.canUpdate ? 'text-emerald-400' : 'text-slate-500')}>{status?.canUpdate ? 'yes' : 'no'}</span>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-slate-400">
            local: <span className="font-mono text-slate-300">{shortHash(String(status?.localHead?.hash || ''))}</span>
            <p className="text-[10px] text-slate-600 mt-1 truncate">{status?.localHead?.subject || '-'}</p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-slate-400">
            remote: <span className="font-mono text-slate-300">{shortHash(String(status?.remoteHead?.hash || ''))}</span>
            <p className="text-[10px] text-slate-600 mt-1 truncate">{status?.remoteHead?.subject || '-'}</p>
          </div>
        </div>

        {Array.isArray(status?.dirtyFiles) && status.dirtyFiles.length > 0 && (
          <div className="p-3 rounded-lg bg-red-500/8 border border-red-500/20">
            <p className="text-[10px] text-red-300 font-semibold mb-1">Dirty files ({status.dirtyFiles.length})</p>
            <div className="max-h-20 overflow-y-auto space-y-0.5">
              {status.dirtyFiles.slice(0, 10).map((f: string) => (
                <p key={f} className="text-[10px] font-mono text-red-200/90">{f}</p>
              ))}
            </div>
          </div>
        )}

        {!!status?.blockedReason && (
          <p className="text-[10px] text-amber-400 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
            {status.blockedReason}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={checkRemote}
          disabled={checking}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/25 text-cyan-300 rounded-xl text-[11px] font-bold disabled:opacity-50 transition-all"
        >
          {checking ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <Download className="w-3.5 h-3.5"/>}
          Check Remote
        </button>

        <button
          onClick={applyUpdate}
          disabled={applying || !status?.canUpdate}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/25 text-emerald-300 rounded-xl text-[11px] font-bold disabled:opacity-50 transition-all"
        >
          {applying ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <Check className="w-3.5 h-3.5"/>}
          Apply Update (FF-only)
        </button>
      </div>

      {result && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Last Updater Result</p>
          <pre className="bg-black/60 border border-white/8 rounded-xl p-3 font-mono text-[10px] text-slate-300 max-h-64 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

//
// MAIN ADDONS TAB
//
export default function AddonsTab() {
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-sm font-bold text-white mb-0.5">Addons & System Linking</h2>
        <p className="text-[11px] text-slate-600">
          Download firmware, flash hardware, set up tunnels, and link all NexusAI subsystems together.
          Each addon auto-detects what you have installed and guides you step by step.
        </p>
      </div>

      <AddonCard id="biomesh" icon="🫀" title="BioMesh Suit System"
        subtitle="ESP32 biometric sensor -- firmware flash + NexusAI server link"
        accentColor="text-rose-400" borderColor="border-rose-500/25" defaultOpen>
        <BioMeshAddon/>
      </AddonCard>

      <AddonCard id="drone" icon="🚁" title="Drone System"
        subtitle="Cloudflare tunnel, ArduPilot params, gesture bridge, MAVLink setup"
        accentColor="text-cyan-400" borderColor="border-cyan-500/25">
        <DroneAddon/>
      </AddonCard>

      <AddonCard id="strap" icon="🖐" title="NexusStrap (Wrist Gesture)"
        subtitle="nRF52840 BLE gesture straps -- J-Link firmware flash"
        accentColor="text-amber-400" borderColor="border-amber-500/25">
        <StrapAddon/>
      </AddonCard>

      <AddonCard id="jarvis" icon="🍓" title="Jarvis AI Table (Raspberry Pi 5)"
        subtitle="PC AI brain + ESP32 nodes via WiFi -- BioMesh, Voice I/O, Camera"
        accentColor="text-green-400" borderColor="border-green-500/25">
        <JarvisAddon/>
      </AddonCard>

      <AddonCard id="doomcase" icon="💀" title="Doomcase OS"
        subtitle="Custom Arch Linux -- CUDA, Hyprland, AI tools, hardware support"
        accentColor="text-purple-400" borderColor="border-purple-500/25">
        <DoomcaseAddon/>
      </AddonCard>

      <AddonCard id="github-cli" icon={<Github className="w-5 h-5"/>} title="GitHub CLI Control"
        subtitle="Managed GitHub automation for NexusAI agent + chat tools"
        accentColor="text-indigo-400" borderColor="border-indigo-500/25">
        <GitHubControlAddon/>
      </AddonCard>

      <AddonCard id="nexus-updater" icon="🔄" title="NexusAI Updater"
        subtitle="Safe fast-forward updater for this local repo"
        accentColor="text-emerald-400" borderColor="border-emerald-500/25">
        <NexusUpdaterAddon/>
      </AddonCard>
    </div>
  );
}

