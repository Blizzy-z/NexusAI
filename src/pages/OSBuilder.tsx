import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Cpu, Send, Plus, Trash2, RefreshCw, Download, Copy,
  Zap, Brain, FileCode, FolderOpen, Layers, X,
  HardDrive, Code2, RotateCcw, Box, Rocket, ChevronRight,
  CheckCircle, Monitor, Server, Smartphone, ArrowLeft, Play, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { getGeminiChatResponse, getOllamaChatResponse } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import ReactMarkdown from 'react-markdown';

// Types
type AIProvider = 'ollama' | 'mdq100/Gemma3-Instruct-Abliterated:12b' | 'ollama';
type PanelMode = 'files' | 'code' | 'project' | 'vbox' | 'preview';
type OSBase = 'scratch' | 'linux' | 'android' | 'windows-like' | 'rtos' | 'jetson-orin';
type BuildTarget = 'virtualbox' | 'embedded' | 'x86' | 'raspberry-pi' | 'android-device' | 'jetson-orin';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: number;
  provider?: AIProvider;
  files?: GeneratedFile[];
  tokens?: number;
}

interface GeneratedFile {
  path: string;
  content: string;
  language: string;
  description: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  provider: AIProvider;
  ollamaModel?: string;
  systemPrompt: string;
  color: string;
  icon: string;
  messages: Message[];
  isThinking: boolean;
}

interface OSProject {
  id: string;
  name: string;
  description: string;
  osBase: OSBase;
  buildTarget: BuildTarget;
  targetPlatform: string;
  vboxConfig: VBoxConfig;
  files: GeneratedFile[];
  createdAt: number;
}

interface VBoxConfig {
  enabled: boolean;
  vmName: string;
  ram: number;
  cpus: number;
  diskSize: number;
  vramSize: number;
  guestOS: string;
  isoPath: string;
  sharedFolder: string;
  networkMode: 'nat' | 'bridged' | 'host-only';
}

// OS base configs
const OS_BASES: Record<OSBase, { label: string; icon: string; desc: string; color: string; vboxGuest: string }> = {
  scratch:      { label: 'From Scratch',    icon: '⚡', desc: 'Bare metal kernel, bootloader, everything custom', color: 'indigo', vboxGuest: 'Other/Unknown' },
  linux:        { label: 'Linux-based',     icon: '🐧', desc: 'Custom Linux distro via Buildroot or Yocto', color: 'emerald', vboxGuest: 'Linux (64-bit)' },
  android:      { label: 'Android-based',   icon: '🤖', desc: 'AOSP fork with custom UI, apps, and kernel', color: 'green', vboxGuest: 'Linux (64-bit)' },
  'windows-like': { label: 'Windows-like', icon: '🪟', desc: 'Win32 compatible layer (ReactOS style) or custom WM', color: 'blue', vboxGuest: 'Windows 11 (64-bit)' },
  rtos:         { label: 'RTOS / Embedded', icon: '🔧', desc: 'FreeRTOS / Zephyr for EV motorcycle hardware', color: 'amber', vboxGuest: 'Other/Unknown' },
  'jetson-orin': { label: 'Jetson Orin (Android)', icon: '🟢', desc: 'Android 13 AOSP on Jetson Orin Nano Super -- EV motorcycle AI OS', color: 'green', vboxGuest: 'Linux (64-bit)' },
};

const BUILD_TARGETS: Record<BuildTarget, { label: string; icon: any; desc: string }> = {
  virtualbox:    { label: 'VirtualBox VM',    icon: Box,     desc: 'Run in Oracle VirtualBox -- get full VM config + ISO builder' },
  embedded:      { label: 'Embedded / MCU',   icon: Cpu,     desc: 'ARM Cortex-M/A, STM32, custom PCB' },
  'x86':         { label: 'x86 PC',           icon: Monitor, desc: 'Standard desktop / laptop hardware' },
  'raspberry-pi':{ label: 'Raspberry Pi',     icon: Server,  desc: 'Pi 4 / CM4 -- great for EV motorcycle dashboard' },
  'android-device':{ label: 'Android Device', icon: Smartphone, desc: 'Flash to Android phone/tablet hardware' },
  'jetson-orin':   { label: '🟢 Jetson Orin Nano Super', icon: Cpu,  desc: 'NVIDIA Jetson Orin Nano Super -- 1024 CUDA cores, 8GB RAM, perfect for EV AI OS' },
};

// System prompts
function buildSystemPrompt(role: string, project: OSProject): string {
  const baseCtx: Record<OSBase, string> = {
    scratch: 'The OS is built completely from scratch: custom bootloader (GRUB/custom MBR), custom kernel in C/Assembly, custom userspace. No Linux, no Android. Pure custom.',
    linux: 'The OS is Linux-based: custom kernel config, Buildroot or Yocto build system, custom init system (systemd/OpenRC/custom), custom package set and UI layer.',
    android: 'The OS is Android-based: AOSP fork, custom Android kernel, custom SystemUI, custom Launcher, custom Settings, OEM apps, possible GMS replacement.',
    'windows-like': 'The OS has a Windows-like interface: Win32 API compatibility layer (ReactOS-style) or custom window manager that mimics Windows UX with proper taskbar, explorer, registry-like config store.',
    rtos: 'The OS is an RTOS for embedded EV motorcycle hardware: FreeRTOS or Zephyr RTOS, ARM Cortex-M7, CAN bus, BMS integration, motor controller drivers, LVGL UI.',
    'jetson-orin': 'The OS is Android 13 AOSP running on NVIDIA Jetson Orin Nano Super. Target: EV motorcycle AI dashboard. Custom NVIDIA device tree, L4T kernel 5.15, TensorRT 10 for on-device AI inference, CAN bus via SPI adapter, BLE for BMS/instruments, UART for motor controller.',
  };
  const targetCtx: Record<BuildTarget, string> = {
    virtualbox: 'Build target is Oracle VirtualBox. Generate VBoxManage CLI commands for VM creation, ISO build scripts, and VirtualBox-compatible bootloader config. Include VM XML config when relevant.',
    embedded: 'Build target is embedded hardware. Generate bare metal or RTOS code, linker scripts, memory maps, and flash procedures.',
    x86: 'Build target is standard x86 PC. Generate GRUB config, x86_64 kernel code, hardware abstraction for standard PC peripherals.',
    'raspberry-pi': 'Build target is Raspberry Pi (ARM64). Generate Pi-specific boot config, device tree overlays, and ARM64 kernel configuration.',
    'android-device': 'Build target is Android device. Generate AOSP device tree, vendor blobs manifest, kernel defconfig, and fastboot flash commands.',
    'jetson-orin': `Build target is NVIDIA Jetson Orin Nano Super Developer Kit. CRITICAL HARDWARE SPECS:
- SoC: NVIDIA Jetson Orin Nano (Ampere GPU: 1024 CUDA cores, 32 Tensor cores), 6-core ARM Cortex-A78AE CPU
- RAM: 8GB LPDDR5 (shared CPU+GPU)
- Storage: NVMe SSD via M.2 M-Key slot, microSD, eMMC
- Connectivity: Gigabit Ethernet, M.2 E-Key (WiFi/BT), USB 3.2 Gen2, USB 2.0, 40-pin GPIO header
- Display: 1x HDMI 2.1, 1x DP 1.4 via USB-C, MIPI DSI (4-lane) for small displays
- Camera: 2x MIPI CSI-2 (up to 4 streams), compatible with Raspberry Pi Camera v2
- Power: 5V-20V DC barrel jack or USB-C PD
- BSP: NVIDIA Jetson Linux (L4T) -- Jetpack 6.x, based on Ubuntu 22.04 + custom kernel 5.15
- Android support: NVIDIA provides Android 13 BSP for Jetson. Use AOSP + android-nvidia-jetson device tree from NVIDIA devzone
- Key tools: flash.py (Jetson flashing), jetpack-sdk-manager, BoardConfig files at /board/nvidia/
- GPIO: Use Jetson.GPIO Python library or libgpiod
- CUDA/AI: TensorRT 10.x, CUDA 12.x, cuDNN 9.x, Jetson Inference library for real-time inference
- CAN bus: Available via MCP2515 SPI or USB-CAN adapter on GPIO header (SPI0: pins 19,21,23,24)
- UART: /dev/ttyTHS0 (J14 header), /dev/ttyTHS1 available
- For EV motorcycle: use Jetson as the main compute unit -- run Android for UI, use GPIO for sensor input, UART/CAN for motor controller comms, CUDA for predictive range estimation and traction AI`,
  };

  const prompts: Record<string, string> = {
    architect: `You are the OS Architect for "${project.name}".
${baseCtx[project.osBase]}
${targetCtx[project.buildTarget]}

Your expertise: kernel design, bootloaders, memory management, process scheduling, filesystems, IPC, security model.
You write REAL, COMPLETE code -- no placeholders, no TODOs. Every function fully implemented.
Output files in <FILES>[{"path":"...","language":"...","description":"...","content":"...full content..."}]</FILES> at end of response.`,

    driver: `You are the Driver & BSP Engineer for "${project.name}".
${baseCtx[project.osBase]}
${targetCtx[project.buildTarget]}

Your expertise: device drivers (USB, network, display, storage), Board Support Package, HAL, firmware interfaces, DMA, interrupts.
For EV motorcycle: BMS driver, motor controller FOC, CAN bus stack, IMU, GPS, display drivers.
Write actual register-level driver code. Include header guards, proper C99 style.
Output files in <FILES>[...]</FILES> at end of response.`,

    ui: `You are the UI/UX Engineer for "${project.name}".
${baseCtx[project.osBase]}
${targetCtx[project.buildTarget]}

Your expertise:
- Android: AOSP SystemUI, custom Launcher XML/Kotlin, Settings provider, WM policies  
- Linux: Wayland compositor, GTK4/Qt6 apps, custom shell
- Scratch/RTOS: LVGL (C), custom framebuffer renderer
- Windows-like: custom Win32 window manager, GDI-like rendering

Write real UI code -- actual layouts, actual event handlers, actual rendering logic.
Output files in <FILES>[...]</FILES> at end of response.`,

    vbox: `You are the VirtualBox & Build Systems Engineer for "${project.name}".
${baseCtx[project.osBase]}

Your expertise: 
- VBoxManage CLI -- VM creation, disk creation, ISO mounting, snapshot management, network config
- ISO building -- mkisofs/xorriso, bootable ISO structure, GRUB/syslinux for ISO boot
- VM XML config (.vbox files)  
- Build automation -- Makefiles, shell scripts, Docker build environments
- QEMU as an alternative to VirtualBox when needed

Generate complete, runnable VBoxManage commands. Generate complete build scripts.
The user's VirtualBox is installed at the default path on Windows.
Output files in <FILES>[...]</FILES> at end of response.`,

    security: `You are the Security Engineer for "${project.name}".
${baseCtx[project.osBase]}

Your expertise: secure boot, code signing, dm-verity, SELinux/AppArmor policies, sandboxing, crypto libraries, OTA update security, TPM integration.
Write real security configs and code -- actual SELinux policy files, actual kernel security config, actual signing scripts.
Output files in <FILES>[...]</FILES> at end of response.`,

    jetson: `You are the NVIDIA Jetson Orin Nano Super specialist for the "${project.name}" EV motorcycle AI OS.

HARDWARE: Jetson Orin Nano Super | 1024 CUDA cores | 6-core ARM Cortex-A78AE | 8GB LPDDR5 shared memory
BSP: Jetpack 6.x | L4T kernel 5.15 | Android 13 AOSP with NVIDIA device tree

Your deep expertise:
- NVIDIA Jetson Android BSP: android-nvidia-jetson, BoardConfig.mk, device/nvidia/jetson-orin-nano/
- L4T kernel patches for Android: kernel defconfig (tegra_defconfig), DTS overlays for peripherals
- JetPack SDK: TensorRT 10, CUDA 12, cuDNN 9, Jetson Inference -- integrating AI into Android apps
- Flashing: flash.py, Jetson SDK Manager, creating flashable Android images
- GPIO via Android: JNI + libgpiod wrapper for Android, accessing /sys/class/gpio from Android service
- UART/CAN on Jetson: configuring /dev/ttyTHS0 for motor controller comms, USB-CAN via SocketCAN in Android
- Display: MIPI DSI small displays (4-7 inch), configuring EDID, touch overlay via I2C
- Camera: CSI-2 cameras for rider-facing or surround-view via Android Camera2 API + Jetson ISP
- Power management: nvpmodel profiles (10W/15W/25W), thermal management for motorcycle temperature range
- AI features: real-time object detection (YOLOv8 TensorRT), predictive range estimation, voice commands (Whisper on CUDA)

Write REAL code -- actual Android Kotlin/Java, actual JNI C++, actual kernel DTS, actual shell scripts.
Output files in <FILES>[{"path":"...","language":"...","description":"...","content":"..."}]</FILES> at end.`,

    general: `You are NexusOS Studio -- expert AI assistant for building "${project.name}".
${baseCtx[project.osBase]}
${targetCtx[project.buildTarget]}

You write REAL, COMPLETE code and configs. Never use placeholders.
Output any files in <FILES>[{"path":"...","language":"...","description":"...","content":"..."}]</FILES> at end.`,
  };
  return prompts[role] || prompts.general;
}

const AGENT_PRESETS = [
  { name: 'OS Architect', role: 'architect', provider: 'ollama' as AIProvider, color: 'indigo', icon: '🧠' },
  { name: 'Driver Dev',   role: 'driver',    provider: 'ollama' as AIProvider, color: 'emerald', icon: '⚙️' },
  { name: 'UI Engineer',  role: 'ui',        provider: 'ollama' as AIProvider, color: 'blue', icon: '🎨' },
  { name: 'VBox Builder', role: 'vbox',      provider: 'ollama' as AIProvider, color: 'purple', icon: '📦' },
  { name: 'Security',     role: 'security',  provider: 'ollama' as AIProvider, color: 'red', icon: '🔒' },
  { name: 'Jetson Expert', role: 'jetson',    provider: 'ollama' as AIProvider, color: 'green', icon: '🟢' },
];

const COLOR_MAP: Record<string, string> = {
  indigo:  'bg-indigo-500/20 border-indigo-500/40 text-indigo-400',
  emerald: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
  blue:    'bg-blue-500/20 border-blue-500/40 text-blue-400',
  red:     'bg-red-500/20 border-red-500/40 text-red-400',
  purple:  'bg-purple-500/20 border-purple-500/40 text-purple-400',
  amber:   'bg-amber-500/20 border-amber-500/40 text-amber-400',
  green:   'bg-green-500/20 border-green-500/40 text-green-400',
};

function parseFiles(raw: string): GeneratedFile[] {
  const match = raw.match(/<FILES>([\s\S]*?)<\/FILES>/i);
  if (!match) return [];
  try { return JSON.parse(match[1].trim()); } catch { return []; }
}
function stripFiles(raw: string): string {
  return raw.replace(/<FILES>[\s\S]*?<\/FILES>/gi, '').trim();
}
function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).length * 1.3);
}

// VM Preview Panel
function VMPreviewPanel({ vmName }: { vmName: string }) {
  const [vmState, setVmState]     = useState<'unknown' | 'running' | 'stopped' | 'starting' | 'stopping'>('unknown');
  const [vncPort, setVncPort]     = useState(5900);
  const [noVncPort, setNoVncPort] = useState(6080);
  const [showVnc, setShowVnc]     = useState(false);
  const [log, setLog]             = useState<string[]>([]);
  const [rdpPort, setRdpPort]     = useState(3389);

  const addLog = (msg: string) => setLog(p => [...p.slice(-30), `[${new Date().toLocaleTimeString()}] ${msg}`]);

  // Check VM state via Electron IPC (falls back to instructions if not available)
  const checkState = async () => {
    try {
      const result = await (window as any).electronAPI?.runVBoxCommand?.(`showvminfo "${vmName}" --machinereadable`);
      if (result?.includes('VMState="running"')) setVmState('running');
      else if (result) setVmState('stopped');
      else setVmState('unknown');
    } catch { setVmState('unknown'); }
  };

  useEffect(() => { checkState(); }, [vmName]);

  const startVM = async () => {
    setVmState('starting');
    addLog(`Starting VM: ${vmName}...`);
    try {
      // Enable VRDE (RDP) on port 3389 and start headless
      await (window as any).electronAPI?.runVBoxCommand?.(
        `modifyvm "${vmName}" --vrde on --vrdeport ${rdpPort}`
      );
      await (window as any).electronAPI?.runVBoxCommand?.(
        `startvm "${vmName}" --type headless`
      );
      addLog(`OK VM started headlessly with VRDE on port ${rdpPort}`);
      setVmState('running');
    } catch (e: any) {
      addLog(`X ${e.message}`);
      setVmState('stopped');
    }
  };

  const stopVM = async () => {
    setVmState('stopping');
    addLog(`Sending ACPI shutdown to ${vmName}...`);
    try {
      await (window as any).electronAPI?.runVBoxCommand?.(`controlvm "${vmName}" acpipowerbutton`);
      addLog('OK Shutdown signal sent');
      setVmState('stopped');
    } catch (e: any) { addLog(`X ${e.message}`); setVmState('running'); }
  };

  const takeSnapshot = async () => {
    const name = `nexus_snap_${Date.now()}`;
    addLog(`Taking snapshot: ${name}...`);
    try {
      await (window as any).electronAPI?.runVBoxCommand?.(`snapshot "${vmName}" take "${name}"`);
      addLog(`OK Snapshot taken: ${name}`);
    } catch (e: any) { addLog(`X ${e.message}`); }
  };

  const noVncUrl = `http://localhost:${noVncPort}/vnc.html?host=localhost&port=${vncPort}&autoconnect=true&resize=scale`;
  const hasIPC = typeof (window as any).electronAPI?.runVBoxCommand === 'function';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="p-3 border-b border-white/5 space-y-3">
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', vmState === 'running' ? 'bg-emerald-500 animate-pulse' : vmState === 'starting' || vmState === 'stopping' ? 'bg-amber-500 animate-pulse' : 'bg-slate-600')} />
          <span className="text-xs font-bold text-white truncate">{vmName}</span>
          <span className={cn('ml-auto text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full', vmState === 'running' ? 'bg-emerald-500/20 text-emerald-400' : vmState === 'starting' || vmState === 'stopping' ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-slate-500')}>{vmState}</span>
        </div>

        <div className="flex gap-1.5">
          <button onClick={startVM} disabled={vmState === 'running' || vmState === 'starting'} className="flex-1 py-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-[9px] font-bold disabled:opacity-40 hover:bg-emerald-500/30 transition-all">
            ▶ Start
          </button>
          <button onClick={stopVM} disabled={vmState !== 'running'} className="flex-1 py-1.5 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-[9px] font-bold disabled:opacity-40 hover:bg-red-500/30 transition-all">
            ■ Stop
          </button>
          <button onClick={takeSnapshot} disabled={vmState !== 'running'} className="flex-1 py-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg text-[9px] font-bold disabled:opacity-40 hover:bg-blue-500/30 transition-all">
            📷 Snap
          </button>
          <button onClick={checkState} className="px-2 py-1.5 bg-white/5 border border-white/10 text-slate-400 rounded-lg text-[9px] font-bold hover:bg-white/10 transition-all">
            ↺
          </button>
        </div>
      </div>

      {/* Screen viewer */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">

        {/* noVNC embed */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Live Screen (noVNC)</p>
            <button onClick={() => setShowVnc(v => !v)}
              className={cn('text-[9px] font-bold px-2 py-0.5 rounded-lg border transition-all',
                showVnc ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white')}>
              {showVnc ? 'Hide' : 'Show'}
            </button>
          </div>

          {showVnc && vmState === 'running' ? (
            <div className="rounded-xl overflow-hidden border border-white/10 bg-black aspect-video">
              <iframe
                src={noVncUrl}
                className="w-full h-full"
                sandbox="allow-scripts allow-same-origin allow-forms"
                title="VM Preview"
              />
            </div>
          ) : showVnc && vmState !== 'running' ? (
            <div className="rounded-xl border border-white/10 bg-black aspect-video flex items-center justify-center">
              <p className="text-xs text-slate-600">Start the VM first</p>
            </div>
          ) : null}

          {/* noVNC setup instructions */}
          <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-[9px] space-y-1.5">
            <p className="font-bold text-slate-400 uppercase tracking-widest">Setup (one-time)</p>
            <p className="text-slate-500">noVNC bridges VNC  /  browser. Run once before previewing:</p>
            <div className="bg-black rounded-lg p-2 font-mono space-y-0.5">
              <p><span className="text-emerald-400">$</span> npm install -g novnc</p>
              <p><span className="text-emerald-400">$</span> {'websockify --web /usr/share/novnc ' + noVncPort + ' localhost:' + vncPort}</p>
            </div>
            <p className="text-slate-600">Or download noVNC from github.com/novnc/noVNC and run websockify manually.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5">
              <p className="text-[8px] text-slate-600 uppercase tracking-widest">VNC Port</p>
              <input type="number" value={vncPort} onChange={e => setVncPort(+e.target.value)}
                className="w-full bg-black border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white font-mono focus:outline-none focus:border-purple-500/50" />
            </div>
            <div className="space-y-0.5">
              <p className="text-[8px] text-slate-600 uppercase tracking-widest">noVNC Port</p>
              <input type="number" value={noVncPort} onChange={e => setNoVncPort(+e.target.value)}
                className="w-full bg-black border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white font-mono focus:outline-none focus:border-purple-500/50" />
            </div>
          </div>
        </div>

        {/* RDP alternative */}
        <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl space-y-2">
          <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Alternative: RDP (VRDE)</p>
          <p className="text-[9px] text-slate-500">VirtualBox VRDE exposes RDP. Connect any RDP client to <code className="text-blue-300 bg-blue-500/10 px-1 rounded">localhost:{rdpPort}</code></p>
          <div className="space-y-0.5">
            <p className="text-[8px] text-slate-600 uppercase tracking-widest">VRDE Port</p>
            <input type="number" value={rdpPort} onChange={e => setRdpPort(+e.target.value)}
              className="w-full bg-black border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white font-mono focus:outline-none focus:border-blue-500/50" />
          </div>
          <div className="font-mono text-[9px] bg-black rounded-lg p-2 space-y-0.5">
            <p className="text-slate-600"># Enable VRDE manually:</p>
            <p><span className="text-emerald-400">$</span> VBoxManage modifyvm "{'{vmName}'}" --vrde on --vrdeport {rdpPort}</p>
            <p><span className="text-emerald-400">$</span> VBoxManage startvm "{'{vmName}'}" --type headless</p>
            <p className="text-slate-600 mt-1"># Then connect mstsc.exe (Windows RDP) to localhost:{rdpPort}</p>
          </div>
        </div>

        {/* Log */}
        {!hasIPC && (
          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-[9px] text-amber-400">
            ⚠️ Electron IPC not detected -- Start/Stop buttons will show commands only. Add <code className="bg-amber-500/10 px-1 rounded">runVBoxCommand</code> to preload.js for full control.
          </div>
        )}

        {log.length > 0 && (
          <div className="bg-black rounded-xl border border-white/5 p-3 space-y-0.5 font-mono text-[9px] max-h-32 overflow-y-auto custom-scrollbar">
            {log.map((l, i) => (
              <p key={i} className={cn(l.includes('OK') ? 'text-emerald-400' : l.includes('X') ? 'text-red-400' : 'text-slate-500')}>{l}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// VirtualBox script generator
function generateVBoxScript(project: OSProject): string {
  const { vboxConfig, name, osBase } = project;
  const vmName = vboxConfig.vmName || name.replace(/\s+/g, '_');
  const guestOS = OS_BASES[osBase].vboxGuest;

  return `#!/bin/bash
# NexusAI -- VirtualBox VM Setup Script for "${name}"
# Generated automatically -- run this in Git Bash or WSL on Windows
# Requires: VirtualBox installed (VBoxManage in PATH)

set -e
VM_NAME="${vmName}"
RAM_MB=${vboxConfig.ram}
CPUS=${vboxConfig.cpus}
DISK_GB=${vboxConfig.diskSize}
VRAM_MB=${vboxConfig.vramSize}
ISO_PATH="${vboxConfig.isoPath || '/path/to/your-os.iso'}"

echo ">>> Creating VM: $VM_NAME"

# Create the VM
VBoxManage createvm --name "$VM_NAME" --ostype "${guestOS}" --register

# Set RAM, CPUs, VRAM
VBoxManage modifyvm "$VM_NAME" \\
  --memory $RAM_MB \\
  --cpus $CPUS \\
  --vram $VRAM_MB \\
  --acpi on \\
  --ioapic on \\
  --pae off \\
  --graphicscontroller vmsvga \\
  --audio-driver none \\
  --usb on

# Networking
VBoxManage modifyvm "$VM_NAME" --nic1 ${vboxConfig.networkMode}

# Create virtual disk
VBoxManage createmedium disk \\
  --filename "$HOME/VirtualBox VMs/$VM_NAME/$VM_NAME.vdi" \\
  --size $((DISK_GB * 1024)) \\
  --format VDI

# Attach storage controller + disk
VBoxManage storagectl "$VM_NAME" --name "SATA" --add sata --bootable on
VBoxManage storageattach "$VM_NAME" \\
  --storagectl "SATA" \\
  --port 0 --device 0 \\
  --type hdd \\
  --medium "$HOME/VirtualBox VMs/$VM_NAME/$VM_NAME.vdi"

# Attach ISO
VBoxManage storagectl "$VM_NAME" --name "IDE" --add ide
VBoxManage storageattach "$VM_NAME" \\
  --storagectl "IDE" \\
  --port 0 --device 0 \\
  --type dvddrive \\
  --medium "$ISO_PATH"

# Boot order: DVD first, then disk
VBoxManage modifyvm "$VM_NAME" --boot1 dvd --boot2 disk --boot3 none --boot4 none

${vboxConfig.sharedFolder ? `# Shared folder
VBoxManage sharedfolder add "$VM_NAME" \\
  --name "nexusai_share" \\
  --hostpath "${vboxConfig.sharedFolder}" \\
  --automount` : '# No shared folder configured'}

echo ">>> VM created successfully!"
echo ">>> Start with: VBoxManage startvm '$VM_NAME' --type gui"
echo ">>> Or headless: VBoxManage startvm '$VM_NAME' --type headless"
`;
}

function generateVBoxXML(project: OSProject): string {
  const { vboxConfig, name, osBase } = project;
  const vmName = vboxConfig.vmName || name.replace(/\s+/g, '_');
  return `<?xml version="1.0"?>
<!--
  NexusAI VirtualBox Machine Config for "${name}"
  Place this as: ~/VirtualBox VMs/${vmName}/${vmName}.vbox
  Then register: VBoxManage registervm "/path/to/${vmName}.vbox"
-->
<VirtualBox xmlns="http://www.virtualbox.org/" version="1.19-windows">
  <Machine uuid="{${crypto.randomUUID()}}" name="${vmName}"
    OSType="${OS_BASES[osBase].vboxGuest.replace(/[()\/]/g, '_')}"
    snapshotFolder="Snapshots" lastStateChange="2025-01-01T00:00:00Z">
    <MediaRegistry>
      <HardDisks>
        <HardDisk uuid="{${crypto.randomUUID()}}" location="${vmName}.vdi"
          format="VDI" type="Normal"/>
      </HardDisks>
    </MediaRegistry>
    <Hardware>
      <CPU count="${vboxConfig.cpus}" hotPlug="false">
        <PAE enabled="false"/>
        <LongMode enabled="true"/>
        <X2APIC enabled="true"/>
      </CPU>
      <Memory RAMSize="${vboxConfig.ram}"/>
      <Display VRAMSize="${vboxConfig.vramSize}" monitorCount="1" accelerate3D="false"/>
      <BIOS>
        <IOAPIC enabled="true"/>
        <BootMenu mode="MessageAndMenu"/>
      </BIOS>
      <Network>
        <Adapter slot="0" enabled="true" type="82540EM" attachmentType="${vboxConfig.networkMode}"/>
      </Network>
      <USB><DeviceFilters/></USB>
      <AudioAdapter driver="Null" enabled="false"/>
    </Hardware>
    <StorageControllers>
      <StorageController name="SATA" type="AHCI" PortCount="2" useHostIOCache="false" Bootable="true">
        <AttachedDevice type="HardDisk" hotpluggable="false" port="0" device="0">
          <Image uuid="{placeholder-disk-uuid}"/>
        </AttachedDevice>
      </StorageController>
      <StorageController name="IDE" type="PIIX4" Bootable="true">
        <AttachedDevice type="DVD" port="0" device="0">
          <Image uuid="empty"/>
        </AttachedDevice>
      </StorageController>
    </StorageControllers>
  </Machine>
</VirtualBox>`;
}

// Quick prompts per OS base
const QUICK_PROMPTS: Record<OSBase, { label: string; prompt: string }[]> = {
  scratch: [
    { label: '🥾 Bootloader', prompt: 'Write a complete custom x86_64 bootloader in Assembly that loads a kernel from disk: Stage 1 (MBR, 512 bytes), Stage 2 (GDT setup, protected mode switch, long mode switch, kernel load), and a minimal C kernel that prints "NexusOS" to VGA text mode.' },
    { label: '🧠 Kernel core', prompt: 'Build a minimal x86_64 kernel in C: interrupt descriptor table (IDT), exception handlers, physical memory manager (bitmap allocator), virtual memory (4-level paging), and a simple round-robin task scheduler. Include all header files.' },
    { label: '📁 VFS layer', prompt: 'Implement a Virtual File System layer: VFS superblock, inode, dentry structures, file operations interface, and a simple in-memory tmpfs implementation as the first filesystem.' },
    { label: '🖥 VGA driver', prompt: 'Write a complete VGA framebuffer driver: text mode (80x25), graphics mode 320x200 (Mode 13h), font rendering, scrolling, color support, and a printf-like kprintf function.' },
    { label: '📦 VBox ISO', prompt: 'Generate a complete ISO build script using xorriso/mkisofs that packages my custom kernel into a bootable ISO for VirtualBox. Include GRUB2 config, ISO directory structure, and the VBoxManage commands to create and boot the VM.' },
    { label: '⌨️ Keyboard/PS2', prompt: 'Write a PS/2 keyboard driver: IRQ1 handler, scancode to keycode translation table (US layout), key event queue, modifier key tracking (shift/ctrl/alt), and a blocking getchar() for the kernel.' },
  ],
  linux: [
    { label: '🐧 Buildroot config', prompt: 'Create a complete Buildroot external tree for a custom Linux distro: BR2_EXTERNAL structure, Config.in, external.mk, custom packages list, kernel config fragment for x86_64/ARM64, and custom rootfs overlay with our branding.' },
    { label: '🔧 Custom init', prompt: 'Write a custom init system in C to replace systemd for our minimal Linux: service definition format, dependency resolution, parallel startup, process supervision, shutdown sequence, and runlevel management.' },
    { label: '📦 Package manager', prompt: 'Design and implement a minimal package manager in Python or C: package format (tar.gz + manifest), dependency resolver, install/remove/upgrade commands, local package repository, and package signing verification.' },
    { label: '🎨 Wayland WM', prompt: 'Write a minimal Wayland compositor in C using libwlroots: window management, keyboard/mouse input, XWayland support for legacy apps, basic compositing effects, and a config file parser.' },
    { label: '📦 VBox ISO', prompt: 'Write a complete script to build a bootable ISO of our custom Linux distro for VirtualBox using xorriso. Include GRUB2 EFI+BIOS hybrid boot, squashfs rootfs, live boot parameters, and VBoxManage commands to set up the VM.' },
    { label: '🔄 OTA updater', prompt: 'Implement an A/B OTA update system for Linux: update manifest format, delta update generation with bsdiff, verified download over HTTPS with certificate pinning, atomic partition switching, and rollback on boot failure.' },
  ],
  android: [
    { label: '🤖 Device tree', prompt: 'Generate a complete AOSP device tree for a generic x86_64 Android target that can boot in VirtualBox: device.mk, BoardConfig.mk, AndroidProducts.mk, kernel defconfig, and fstab. Based on AOSP android_x86 style.' },
    { label: '🏠 Custom Launcher', prompt: 'Write a complete Android Launcher in Kotlin: app grid with drag-and-drop, custom dock, swipe-up app drawer, custom icon pack support, widget support, and gesture navigation. Include full AndroidManifest.xml and res/ files.' },
    { label: '🎨 Custom SystemUI', prompt: 'Fork and customize AOSP SystemUI: custom status bar with EV motorcycle telemetry (speed, battery %, motor temp via BLE), custom notification panel with quick settings tiles, custom volume dialog, and lock screen.' },
    { label: '⚙️ Settings app', prompt: 'Create a custom Android Settings app: custom theme matching our OS design, EV motorcycle specific settings section (BLE device pairing, telemetry display config, ride mode selection), and hook into Android Settings provider.' },
    { label: '📦 VBox setup', prompt: 'Generate complete instructions and scripts to run Android-x86 in VirtualBox: download the right ISO, VBoxManage commands for VM creation with proper UEFI config, GPU passthrough settings, ADB over network setup, and how to sideload our custom APKs.' },
    { label: '🔋 BLE telemetry', prompt: 'Write an Android service in Kotlin that connects to an EV motorcycle BLE telemetry module: GATT service discovery, real-time speed/battery/temperature characteristic subscriptions, background service with foreground notification, and broadcast intents for the UI.' },
  ],
  'windows-like': [
    { label: '🪟 Window manager', prompt: 'Write a custom window manager in C that runs on Linux/X11 but looks like Windows 11: floating windows with title bars, minimize/maximize/close buttons, taskbar at bottom, system tray area, Alt+Tab switcher, and window snapping.' },
    { label: '📁 File Explorer', prompt: 'Create a Windows Explorer-like file manager in C++ with GTK4: tree panel on left, file grid on right, address bar, breadcrumb navigation, copy/paste/rename operations, context menu, and thumbnail preview for images.' },
    { label: '🖥 Desktop shell', prompt: 'Build a complete desktop shell: desktop icon grid, right-click context menu, wallpaper engine, taskbar with running app buttons, system clock, Start menu alternative with app search, and system notifications.' },
    { label: '📦 VBox test', prompt: 'Generate VBoxManage commands to set up a VirtualBox VM running our Windows-like Linux OS: VM creation with Windows 11 guest type for better compatibility, display settings for high resolution, shared clipboard, drag-and-drop, and Guest Additions install script.' },
    { label: '⚙️ Control Panel', prompt: 'Design a Control Panel app in Python/GTK4 that mimics Windows settings: Display settings (resolution, scaling), Network config UI, User accounts, Default apps, and a Themes section for our custom OS look.' },
    { label: '🔧 Registry alt', prompt: 'Implement a Windows Registry alternative in C: hierarchical key-value store with typed values (string, dword, binary), file-backed persistence in a binary format, API similar to Win32 registry functions, and a GUI editor app.' },
  ],
  'jetson-orin': [
    { label: '🟢 Android device tree', prompt: 'Generate the complete AOSP Android 13 device tree for Jetson Orin Nano Super: device/nvidia/jetson-orin-nano/ with device.mk, BoardConfig.mk, AndroidProducts.mk, fstab.jetson, init.jetson.rc, and the kernel defconfig fragment for Android. Base it on NVIDIA Jetson Android BSP structure.' },
    { label: '🚀 Flash script', prompt: 'Write a complete flash procedure for Jetson Orin Nano Super: how to put it in recovery mode, flash.py command with correct board config, partition layout, and how to build + flash a custom Android 13 AOSP image. Include all terminal commands.' },
    { label: '🏎 Motor controller UART', prompt: 'Write an Android system service in Kotlin + JNI C++ that communicates with an EV motor controller via UART (/dev/ttyTHS0 on Jetson): serial port config (115200 8N1), custom binary protocol for torque command, speed feedback, fault codes, exposed as an Android AIDL service for the UI app.' },
    { label: '🔋 BMS BLE service', prompt: 'Create an Android background service in Kotlin that connects to a BLE Battery Management System: GATT service discovery, cell voltage characteristics (16 cells), SOC/temperature notifications, foreground service with persistent notification, and a ContentProvider that exposes live BMS data to other apps.' },
    { label: '🤖 TensorRT AI range', prompt: 'Implement a predictive range estimation AI for the EV motorcycle using TensorRT on Jetson: train a small LSTM model on speed profile + elevation + temperature + SOC data, export to ONNX, convert to TensorRT engine, and wrap it in an Android JNI service that updates range estimate every second.' },
    { label: '📊 Moto dashboard UI', prompt: 'Build the main Android motorcycle dashboard Activity in Kotlin: full-screen landscape layout for a 5-7 inch display, custom Canvas speedometer (0-180 km/h), battery arc, range, motor temp, power mode indicator, BLE status. Subscribe to the motor controller AIDL service and BMS service for live data. Dark theme, large readable fonts for riding.' },
    { label: '📷 CSI camera surround', prompt: 'Set up Android Camera2 API for 2x CSI-2 cameras on Jetson: CameraManager configuration, concurrent camera streams, YUV_420_888 output, run YOLOv8 TensorRT inference on frames for obstacle detection, overlay bounding boxes on the dashboard UI.' },
    { label: '🔧 GPIO & CAN setup', prompt: 'Write the complete setup for GPIO and CAN bus on Jetson Orin Nano in Android: kernel DTS overlay to enable SPI0 and configure MCP2515 CAN controller, SocketCAN bring-up script (ip link set can0 up type can bitrate 500000), JNI wrapper to access /sys/class/gpio from Android, and Android SELinux policy additions to allow access.' },
  ],
  rtos: [
    { label: '⚡ FreeRTOS kernel', prompt: 'Generate a complete FreeRTOS project for ARM Cortex-M7 (STM32H7): FreeRTOSConfig.h fully configured, main.c with task creation, a motor control task at 10kHz, a CAN bus task, a display task at 60fps, and a BMS monitoring task. Include CMakeLists.txt.' },
    { label: '🔋 BMS driver', prompt: 'Write a complete BMS driver in C: I2C communication with BQ76952 cell monitor IC, 16-cell voltage reading, SOC estimation via Coulomb counting + Kalman filter, cell balancing algorithm, temperature monitoring (NTC thermistors), and CAN bus status broadcasts every 100ms.' },
    { label: '🏎 FOC controller', prompt: 'Implement a complete Field Oriented Control (FOC) motor controller in C for BLDC: Clarke/Park transforms, PI current controllers with anti-windup, SVPWM generation, encoder interface (incremental + hall), speed loop, position loop, and torque mode. Runs at 20kHz ISR.' },
    { label: '📊 LVGL dashboard', prompt: 'Create a complete LVGL 9.x dashboard for EV motorcycle: speedometer arc (0-200 km/h), animated battery percentage bar, range estimate, motor temperature gauge, power output meter, trip odometer, gear indicator, and fault warning overlays. Full C code with all lv_obj_t declarations.' },
    { label: '📡 CAN bus stack', prompt: 'Build a complete CAN bus stack for the EV motorcycle: message routing table with 50 PGNs, J1939-style addressing, motor controller messages (torque cmd, speed feedback, fault codes), BMS messages (SOC, cell voltages, charge status), and a CANopen heartbeat service.' },
    { label: '📦 VBox sim', prompt: 'Since bare metal RTOS cannot run in VirtualBox directly, generate: a QEMU launch script that simulates our ARM Cortex-M7 target, a Linux hosted simulation of our RTOS tasks using pthreads, and a VirtualBox VM config running the simulation for development/testing.' },
  ],
};

// Component
export default function OSBuilder() {
  const { toast } = useToast();
  const { settings, models } = useSettings();
  const ollamaModels = models.map(m => m.name);

  // Wizard / project setup
  // Saved projects list
  const [savedProjects, setSavedProjects] = useState<{id:string;name:string;osBase:OSBase;buildTarget:BuildTarget;createdAt:number}[]>(() => {
    try { return JSON.parse(localStorage.getItem('nexusos_project_list') || '[]'); } catch { return []; }
  });
  const [showProjectManager, setShowProjectManager] = useState(false);

  // Persist helpers
  const STORAGE_KEY = 'nexusos_active_workspace';

  const loadWorkspace = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  };

  const saved = loadWorkspace();

  const [wizardStep, setWizardStep] = useState<'base' | 'target' | 'vbox' | 'ready' | 'working'>(
    saved?.wizardStep === 'working' ? 'working' : 'base'
  );
  const [project, setProject] = useState<OSProject>(saved?.project || {
    id: crypto.randomUUID(),
    name: 'NexusMoto OS',
    description: 'Android-based OS for EV motorcycle on Jetson Orin Nano Super. Features: real-time BLE telemetry from BMS and motor controller, LVGL dashboard UI, TensorRT range prediction AI, CAN bus communication, and Android 13 AOSP with NVIDIA device tree.',
    osBase: 'android',
    buildTarget: 'jetson-orin',
    targetPlatform: 'NVIDIA Jetson Orin Nano Super (ARM64)',
    vboxConfig: {
      enabled: true, vmName: 'NexusOS_VM',
      ram: 2048, cpus: 2, diskSize: 20, vramSize: 128,
      guestOS: 'Linux (64-bit)', isoPath: '', sharedFolder: '',
      networkMode: 'nat',
    },
    files: [],
    createdAt: Date.now(),
  });

  // Agents
  const [agents, setAgents] = useState<Agent[]>(saved?.agents || []);
  const [activeAgentId, setActiveAgentId] = useState(saved?.activeAgentId || '');
  const activeAgent = agents.find(a => a.id === activeAgentId) || agents[0];

  // UI state
  const [input, setInput] = useState('');
  const [panelMode, setPanelMode] = useState<PanelMode>('files');
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgentPreset, setNewAgentPreset] = useState(0);
  const [newAgentProvider, setNewAgentProvider] = useState<AIProvider>('ollama');
  const [newAgentOllamaModel, setNewAgentOllamaModel] = useState(ollamaModels[0] || 'llama3');
  const [broadcastInput, setBroadcastInput] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [totalTokens, setTotalTokens] = useState(saved?.totalTokens || 0);

  // Auto-save to localStorage on any state change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ wizardStep, project, agents, activeAgentId, totalTokens }));
    } catch {}
  }, [wizardStep, project, agents, activeAgentId, totalTokens]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeAgent?.messages]);

  // Auto-update VBox guestOS when osBase changes
  useEffect(() => {
    setProject(p => ({
      ...p,
      vboxConfig: { ...p.vboxConfig, guestOS: OS_BASES[p.osBase].vboxGuest }
    }));
  }, [project.osBase]);

  // Start project from wizard
  const startProject = () => {
    // Spawn default agents based on OS type
    const presets = project.buildTarget === 'jetson-orin'
      ? [AGENT_PRESETS.find(p => p.role === 'jetson')!, AGENT_PRESETS[2], AGENT_PRESETS[0]]
      : project.osBase === 'rtos'
        ? [AGENT_PRESETS[0], AGENT_PRESETS[1], AGENT_PRESETS[2]]
        : project.buildTarget === 'virtualbox'
          ? [AGENT_PRESETS[0], AGENT_PRESETS[3], AGENT_PRESETS[2]]
          : [AGENT_PRESETS[0], AGENT_PRESETS[1], AGENT_PRESETS[2]];

    const spawnedAgents: Agent[] = presets.map((p, i) => ({
      ...p,
      id: `agent-${i}-${Date.now()}`,
      ollamaModel: ollamaModels[0],
      systemPrompt: buildSystemPrompt(p.role, project),
      messages: [],
      isThinking: false,
    }));
    setAgents(spawnedAgents);
    setActiveAgentId(spawnedAgents[0].id);
    
    // Auto-kickstart fires via useEffect watching wizardStep + agents

    // Add VBox files to project if target is virtualbox
    if (project.buildTarget === 'virtualbox') {
      const vboxFiles: GeneratedFile[] = [
        { path: 'vbox/setup_vm.sh', language: 'bash', description: 'VBoxManage setup script', content: generateVBoxScript(project) },
        { path: `vbox/${project.vboxConfig.vmName || 'NexusOS_VM'}.vbox`, language: 'xml', description: 'VirtualBox machine config', content: generateVBoxXML(project) },
      ];
      setProject(p => ({ ...p, files: vboxFiles }));
      toast('VirtualBox scripts generated!', 'success');
    }

    setWizardStep('working');
    // Save to project list
    setTimeout(() => saveProjectToList(project), 100);
  };

  // AI call
  const callAI = useCallback(async (agent: Agent, userMessage: string): Promise<{ content: string; files: GeneratedFile[] }> => {
    const systemPrompt = buildSystemPrompt(agent.role, project) +
      `\n\nCurrent project files: ${project.files.map(f => f.path).join(', ') || 'none yet'}\n\n` +
      `CRITICAL OUTPUT RULE: You MUST end every response with a <FILES> block containing ALL code you wrote as real files. ` +
      `Format: <FILES>[{"path":"...","language":"...","description":"...","content":"...complete file content..."}]</FILES> ` +
      `Never skip this. Never write placeholder content. Every file must be complete and compilable/runnable.`;

    // Force file generation instruction appended directly to the user message
    const forcedMsg = userMessage +
      `\n\n[SYSTEM: You must output all code as files in <FILES>[...]</FILES> JSON at the end of your response. ` +
      `Include every file you mention or describe. Complete implementations only -- no TODO comments, no placeholders.]`;

    const history = agent.messages.filter(m => m.role !== 'system').slice(-16)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    history.push({ role: 'user' as const, content: forcedMsg });

    let raw = '';
    if (agent.provider === 'ollama') {
      raw = await getOllamaChatResponse(history, agent.ollamaModel || 'llama3', systemPrompt);
    } else {
      const result = await getGeminiChatResponse(history, systemPrompt, agent.provider);
      raw = typeof result === 'string' ? result : (result as any).text || result;
    }

    // Try to extract files from <FILES> tag
    let files = parseFiles(raw);

    // Fallback: if no <FILES> tag but there are code blocks, extract them as files
    if (files.length === 0) {
      // Split on ``` without using backticks in regex (avoids TSX parser issue)
      const fence = String.fromCharCode(96, 96, 96);
      const parts = raw.split(fence);
      const fileHints = [...raw.matchAll(/(?:file|path|named?|called?)[:\s]+["']?([\w/.]+\.\w+)["']?/gi)];
      let hintIdx = 0;
      for (let i = 1; i < parts.length; i += 2) {
        const firstLine = parts[i].indexOf('\n');
        const lang = firstLine > 0 ? parts[i].slice(0, firstLine).trim() : 'text';
        const code = firstLine > 0 ? parts[i].slice(firstLine + 1).trim() : parts[i].trim();
        if (code.length < 20) continue;
        const hintedPath = fileHints[hintIdx]?.[1];
        hintIdx++;
        const extMap: Record<string, string> = { kotlin: 'kt', java: 'java', cpp: 'cpp', c: 'c', python: 'py', bash: 'sh', xml: 'xml', json: 'json', makefile: 'mk', cmake: 'cmake', dts: 'dts' };
        const ext = extMap[lang.toLowerCase()] || (lang.toLowerCase() || 'txt');
        const filePath = hintedPath || `generated/file_${Math.floor(i / 2) + 1}.${ext}`;
        files.push({ path: filePath, language: lang || 'text', description: 'Auto-extracted from response', content: code });
      }
    }

    return { content: stripFiles(raw), files };
  }, [project]);

  // Send
  const handleSend = async () => {
    if (!input.trim() || !activeAgent) return;
    const msg = input.trim(); setInput('');
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: msg, ts: Date.now() };
    updateAgent(activeAgentId, m => [...m, userMsg]);
    setAgentThinking(activeAgentId, true);
    try {
      const { content, files } = await callAI(activeAgent, msg);
      setTotalTokens(t => t + estimateTokens(content));
      const aiMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content, ts: Date.now(), provider: activeAgent.provider, files: files.length ? files : undefined };
      updateAgent(activeAgentId, m => [...m, aiMsg]);
      if (files.length) {
        addFiles(files);
        toast(`${files.length} file(s) added`, 'success');
      }
    } catch (e: any) {
      updateAgent(activeAgentId, m => [...m, { id: crypto.randomUUID(), role: 'assistant', content: `⚠ ${e.message}`, ts: Date.now() }]);
      toast(e.message, 'error');
    } finally { setAgentThinking(activeAgentId, false); }
  };

  // Broadcast
  const handleBroadcast = async () => {
    if (!broadcastInput.trim()) return;
    const msg = broadcastInput.trim(); setBroadcastInput(''); setIsBroadcasting(true);
    await Promise.allSettled(agents.map(async agent => {
      const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: `[BROADCAST] ${msg}`, ts: Date.now() };
      updateAgent(agent.id, m => [...m, userMsg]);
      setAgentThinking(agent.id, true);
      try {
        const { content, files } = await callAI(agent, msg);
        const aiMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content, ts: Date.now(), provider: agent.provider, files: files.length ? files : undefined };
        updateAgent(agent.id, m => [...m, aiMsg]);
        if (files.length) addFiles(files);
      } catch (e: any) {
        updateAgent(agent.id, m => [...m, { id: crypto.randomUUID(), role: 'assistant', content: `⚠ ${e.message}`, ts: Date.now() }]);
      } finally { setAgentThinking(agent.id, false); }
    }));
    setIsBroadcasting(false);
    toast('Broadcast complete', 'success');
  };

  // Auto-kickstart on project start
  const [hasKickstarted, setHasKickstarted] = useState(() => {
    // Only auto-kickstart for fresh workspaces (no existing messages)
    return !!(saved?.agents?.some((a: any) => a.messages?.length > 1));
  });

  useEffect(() => {
    if (wizardStep !== 'working' || hasKickstarted || agents.length === 0) return;
    const kickstartMsg = agents[0]?.messages[0]?.content;
    if (!kickstartMsg) return;
    setHasKickstarted(true);

    const run = async () => {
      await Promise.allSettled(agents.map(async (agent) => {
        setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, isThinking: true } : a));
        try {
          const result = await callAI({ ...agent, messages: [] }, kickstartMsg);
          const aiMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: result.content, ts: Date.now(), provider: agent.provider, files: result.files.length ? result.files : undefined };
          setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, isThinking: false, messages: [...a.messages, aiMsg] } : a));
          if (result.files.length) setProject(p => ({ ...p, files: [...p.files.filter(f => !result.files.find(nf => nf.path === f.path)), ...result.files] }));
        } catch (e: any) {
          setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, isThinking: false, messages: [...a.messages, { id: crypto.randomUUID(), role: 'assistant' as const, content: `⚠ ${e.message}`, ts: Date.now() }] } : a));
        }
      }));
    };
    run();
  }, [wizardStep, agents.length, hasKickstarted]);

  // Helpers
  const updateAgent = (id: string, fn: (m: Message[]) => Message[]) =>
    setAgents(prev => prev.map(a => a.id === id ? { ...a, messages: fn(a.messages) } : a));
  const setAgentThinking = (id: string, v: boolean) =>
    setAgents(prev => prev.map(a => a.id === id ? { ...a, isThinking: v } : a));
  const addFiles = (files: GeneratedFile[]) =>
    setProject(p => ({ ...p, files: [...p.files.filter(f => !files.find(nf => nf.path === f.path)), ...files] }));

  const saveProjectToList = (p: OSProject) => {
    const entry = { id: p.id, name: p.name, osBase: p.osBase, buildTarget: p.buildTarget, createdAt: p.createdAt };
    setSavedProjects(prev => {
      const updated = [entry, ...prev.filter(x => x.id !== p.id)].slice(0, 20);
      try { localStorage.setItem('nexusos_project_list', JSON.stringify(updated)); } catch {}
      return updated;
    });
    // Save full project data
    try { localStorage.setItem(`nexusos_project_${p.id}`, JSON.stringify({ project: p, agents, activeAgentId, totalTokens, wizardStep: 'working' })); } catch {}
    toast('Project saved', 'success');
  };

  const loadProject = (id: string) => {
    try {
      const raw = localStorage.getItem(`nexusos_project_${id}`);
      if (!raw) { toast('Project data not found', 'error'); return; }
      const data = JSON.parse(raw);
      setProject(data.project);
      setAgents(data.agents || []);
      setActiveAgentId(data.activeAgentId || '');
      setTotalTokens(data.totalTokens || 0);
      setWizardStep('working');
      setShowProjectManager(false);
      toast(`Loaded: ${data.project.name}`, 'success');
    } catch { toast('Failed to load project', 'error'); }
  };

  const deleteProject = (id: string) => {
    setSavedProjects(prev => {
      const updated = prev.filter(p => p.id !== id);
      try { localStorage.setItem('nexusos_project_list', JSON.stringify(updated)); } catch {}
      return updated;
    });
    try { localStorage.removeItem(`nexusos_project_${id}`); } catch {}
  };

  const startNewProject = () => {
    // Save current project first
    if (wizardStep === 'working') saveProjectToList(project);
    // Reset to wizard
    const newId = crypto.randomUUID();
    setProject({ id: newId, name: 'NexusOS', description: 'Custom operating system', osBase: 'android', buildTarget: 'jetson-orin', targetPlatform: 'NVIDIA Jetson Orin Nano Super (ARM64)', vboxConfig: { enabled: true, vmName: 'NexusOS_VM', ram: 2048, cpus: 2, diskSize: 20, vramSize: 128, guestOS: 'Linux (64-bit)', isoPath: '', sharedFolder: '', networkMode: 'nat' }, files: [], createdAt: Date.now() });
    setAgents([]); setActiveAgentId(''); setTotalTokens(0);
    setWizardStep('base');
    setShowProjectManager(false);
  };

  const addAgent = () => {
    const preset = AGENT_PRESETS[newAgentPreset];
    const a: Agent = { ...preset, id: `agent-${Date.now()}`, ollamaModel: newAgentOllamaModel, systemPrompt: buildSystemPrompt(preset.role, project), messages: [], isThinking: false };
    setAgents(p => [...p, a]); setActiveAgentId(a.id); setShowAddAgent(false);
    toast(`${a.name} added`, 'success');
  };

  const exportProject = () => {
    const blob = new Blob([JSON.stringify({ project, exportedAt: Date.now() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${project.name.replace(/\s+/g, '_')}_nexusos.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadFile = (f: GeneratedFile) => {
    const blob = new Blob([f.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = f.path.split('/').pop() || 'file'; a.click();
    URL.revokeObjectURL(url);
  };

  const providerLabel = (p: AIProvider) => p === 'ollama' ? '* 2.5 Pro' : p === 'mdq100/Gemma3-Instruct-Abliterated:12b' ? '⚡ Flash' : '🦙 Ollama';
  const providerColor = (p: AIProvider) => p === 'ollama' ? 'text-blue-400' : p === 'mdq100/Gemma3-Instruct-Abliterated:12b' ? 'text-cyan-400' : 'text-orange-400';

  // Regenerate VBox scripts
  const regenVBox = () => {
    const vboxFiles: GeneratedFile[] = [
      { path: 'vbox/setup_vm.sh', language: 'bash', description: 'VBoxManage setup script', content: generateVBoxScript(project) },
      { path: `vbox/${project.vboxConfig.vmName || 'NexusOS_VM'}.vbox`, language: 'xml', description: 'VirtualBox machine config', content: generateVBoxXML(project) },
    ];
    addFiles(vboxFiles);
    toast('VBox scripts regenerated', 'success');
  };

  // WIZARD
  if (wizardStep !== 'working') {
    return (
      <div className="h-full flex flex-col bg-black text-white overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full p-8 space-y-8">

          {/* Header */}
          <div className="text-center space-y-2 pt-4">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(99,102,241,0.4)]">
              <Layers className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">OS Builder Studio</h1>
            <p className="text-slate-500 text-sm">Build a custom operating system with multi-agent AI</p>
          </div>

          {/* Project name */}
          <div className="space-y-2">
            <label className="text-[10px] text-slate-500 uppercase tracking-widest">Project Name</label>
            <input value={project.name} onChange={e => setProject(p => ({ ...p, name: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-bold text-lg focus:outline-none focus:border-indigo-500/60" />
          </div>

          {/* OS Base */}
          <div className="space-y-3">
            <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">OS Foundation</label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.entries(OS_BASES) as [OSBase, typeof OS_BASES[OSBase]][]).map(([key, val]) => (
                <button key={key} onClick={() => setProject(p => ({ ...p, osBase: key }))}
                  className={cn('flex items-center gap-4 p-4 rounded-xl border text-left transition-all',
                    project.osBase === key ? COLOR_MAP[val.color] + ' ring-1 ring-current' : 'bg-white/5 border-white/10 hover:border-white/20')}>
                  <span className="text-2xl">{val.icon}</span>
                  <div className="flex-1">
                    <p className="font-bold text-sm text-white">{val.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{val.desc}</p>
                  </div>
                  {project.osBase === key && <CheckCircle className="w-4 h-4 text-current shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Build Target */}
          <div className="space-y-3">
            <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Build Target</label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.entries(BUILD_TARGETS) as [BuildTarget, typeof BUILD_TARGETS[BuildTarget]][]).map(([key, val]) => {
                const Icon = val.icon;
                return (
                  <button key={key} onClick={() => setProject(p => ({ ...p, buildTarget: key, vboxConfig: { ...p.vboxConfig, enabled: key === 'virtualbox' } }))}
                    className={cn('flex items-center gap-4 p-4 rounded-xl border text-left transition-all',
                      project.buildTarget === key ? 'bg-indigo-500/20 border-indigo-500/40 ring-1 ring-indigo-500/40' : 'bg-white/5 border-white/10 hover:border-white/20')}>
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', project.buildTarget === key ? 'bg-indigo-500/30' : 'bg-white/5')}>
                      <Icon className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm text-white">{val.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{val.desc}</p>
                    </div>
                    {project.buildTarget === key && <CheckCircle className="w-4 h-4 text-indigo-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* VirtualBox config -- only if target is virtualbox */}
          {project.buildTarget === 'virtualbox' && (
            <div className="space-y-3">
              <label className="text-[10px] text-slate-500 uppercase tracking-widest font-bold flex items-center gap-2">
                <Box className="w-3 h-3" /> VirtualBox Configuration
              </label>
              <div className="p-5 bg-white/5 border border-white/10 rounded-xl space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'VM Name', key: 'vmName', type: 'text', placeholder: 'NexusOS_VM' },
                    { label: 'RAM (MB)', key: 'ram', type: 'number', placeholder: '2048' },
                    { label: 'CPUs', key: 'cpus', type: 'number', placeholder: '2' },
                    { label: 'Disk (GB)', key: 'diskSize', type: 'number', placeholder: '20' },
                    { label: 'VRAM (MB)', key: 'vramSize', type: 'number', placeholder: '128' },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key} className="space-y-1">
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest">{label}</p>
                      <input type={type} placeholder={placeholder} value={(project.vboxConfig as any)[key]} onChange={e => setProject(p => ({ ...p, vboxConfig: { ...p.vboxConfig, [key]: type === 'number' ? Number(e.target.value) : e.target.value } }))} className="w-full bg-black border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50" />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest">Network</p>
                    <select value={project.vboxConfig.networkMode} onChange={e => setProject(p => ({ ...p, vboxConfig: { ...p.vboxConfig, networkMode: e.target.value as any } }))} className="w-full bg-black border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none">
                      <option value="nat">NAT</option>
                      <option value="bridged">Bridged</option>
                      <option value="host-only">Host-Only</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">ISO Path (optional -- fill in later)</p>
                  <input type="text" placeholder="C:\Users\shush\Downloads\nexusos.iso" value={project.vboxConfig.isoPath} onChange={e => setProject(p => ({ ...p, vboxConfig: { ...p.vboxConfig, isoPath: e.target.value } }))} className="w-full bg-black border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500/50" />
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest">Shared Folder (optional)</p>
                  <input type="text" placeholder="C:\Users\shush\nexusai_share" value={project.vboxConfig.sharedFolder} onChange={e => setProject(p => ({ ...p, vboxConfig: { ...p.vboxConfig, sharedFolder: e.target.value } }))} className="w-full bg-black border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500/50" />
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <label className="text-[10px] text-slate-500 uppercase tracking-widest">Description (give AI more context)</label>
            <textarea value={project.description} onChange={e => setProject(p => ({ ...p, description: e.target.value }))}
              rows={3} placeholder="Custom OS for an EV motorcycle dashboard, needs real-time motor control, BLE telemetry..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/60 resize-none" />
          </div>

          <button onClick={startProject} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm uppercase tracking-widest rounded-xl hover:opacity-90 transition-all shadow-[0_0_30px_rgba(99,102,241,0.3)] flex items-center justify-center gap-3">
            <Rocket className="w-5 h-5" /> Launch OS Builder Studio
          </button>
        </div>
      </div>
    );
  }

  // MAIN WORKSPACE
  return (
    <div className="h-full flex flex-col bg-black text-slate-300 overflow-hidden">

      {/* Project Manager Modal */}
      <AnimatePresence>
        {showProjectManager && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => setShowProjectManager(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-white/5">
                <div>
                  <h2 className="text-sm font-bold text-white">Projects</h2>
                  <p className="text-[9px] text-slate-500 mt-0.5">Switch between or start new OS projects</p>
                </div>
                <button onClick={() => setShowProjectManager(false)} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {/* Current project */}
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{OS_BASES[project.osBase].icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{project.name}</p>
                      <p className="text-[9px] text-indigo-400">Current project . {project.files.length} files</p>
                    </div>
                    <span className="text-[8px] text-indigo-400 bg-indigo-500/20 px-2 py-0.5 rounded-full">Active</span>
                  </div>
                </div>
                {/* Saved projects */}
                {savedProjects.filter(p => p.id !== project.id).map(sp => (
                  <div key={sp.id} className="group flex items-center gap-3 p-3 bg-white/5 border border-white/5 hover:border-white/15 rounded-xl transition-all">
                    <span className="text-base">{OS_BASES[sp.osBase]?.icon || '🖥'}</span>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadProject(sp.id)}>
                      <p className="text-xs font-bold text-white truncate">{sp.name}</p>
                      <p className="text-[9px] text-slate-500">{OS_BASES[sp.osBase]?.label} . {BUILD_TARGETS[sp.buildTarget]?.label} . {new Date(sp.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => loadProject(sp.id)} className="px-2 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 text-[9px] font-bold rounded-lg transition-all">Load</button>
                      <button onClick={() => deleteProject(sp.id)} className="p-1 text-slate-600 hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
                {savedProjects.filter(p => p.id !== project.id).length === 0 && (
                  <p className="text-center text-slate-600 text-xs py-6">No other saved projects</p>
                )}
              </div>
              <div className="p-4 border-t border-white/5 flex gap-2">
                <button onClick={() => { saveProjectToList(project); }}
                  className="flex-1 py-2 bg-white/5 border border-white/10 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5">
                  <Download className="w-3 h-3" /> Save Current
                </button>
                <button onClick={startNewProject} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5">
                  <Plus className="w-3 h-3" /> New Project
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="h-13 border-b border-white/5 bg-slate-950/80 flex items-center justify-between px-5 shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setShowProjectManager(true)}
            title="Project Manager"
            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-all shrink-0">
            <FolderOpen className="w-4 h-4" />
          </button>
          <span className="text-lg">{OS_BASES[project.osBase].icon}</span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{project.name}</p>
            <p className="text-[8px] text-slate-600 uppercase tracking-widest">{OS_BASES[project.osBase].label} . {BUILD_TARGETS[project.buildTarget].label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] text-slate-600 font-mono hidden sm:block">~{totalTokens.toLocaleString()} tokens . {project.files.length} files</span>
          <button onClick={() => saveProjectToList(project)} className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold text-slate-400 hover:text-white transition-all flex items-center gap-1">
            <Save className="w-3 h-3" /> Save
          </button>
          <button onClick={exportProject} className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold text-slate-400 hover:text-white transition-all flex items-center gap-1">
            <Download className="w-3 h-3" /> Export
          </button>
          <button onClick={() => setShowProjectManager(true)} className="px-2.5 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[9px] font-bold text-indigo-400 hover:bg-indigo-500/20 transition-all flex items-center gap-1">
            <Plus className="w-3 h-3" /> Projects
          </button>
          {project.buildTarget === 'virtualbox' && (
            <button onClick={regenVBox} className="px-2.5 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-lg text-[9px] font-bold text-purple-400 hover:bg-purple-500/20 transition-all flex items-center gap-1">
              <Box className="w-3 h-3" /> Regen VBox
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left: agents */}
        <div className="w-56 border-r border-white/5 flex flex-col bg-slate-950/40 shrink-0">
          <div className="p-2.5 border-b border-white/5 flex items-center justify-between">
            <span className="text-[8px] text-slate-600 uppercase tracking-widest font-bold">Agents</span>
            <button onClick={() => setShowAddAgent(v => !v)} className="w-5 h-5 bg-indigo-600 hover:bg-indigo-500 rounded flex items-center justify-center transition-colors">
              <Plus className="w-3 h-3 text-white" />
            </button>
          </div>

          <AnimatePresence>
            {showAddAgent && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-b border-white/5 overflow-hidden">
                <div className="p-2.5 space-y-2">
                  <select value={newAgentPreset} onChange={e => setNewAgentPreset(Number(e.target.value))}
                    className="w-full bg-black border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none">
                    {AGENT_PRESETS.map((p, i) => <option key={i} value={i}>{p.icon} {p.name}</option>)}
                  </select>
                  <select value={newAgentProvider} onChange={e => setNewAgentProvider(e.target.value as AIProvider)}
                    className="w-full bg-black border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none">
                    <option value="ollama">* Gemini 3.1 Pro</option>
                    <option value="ollama">⚡ Gemini Flash</option>
                    <option value="ollama">🦙 Ollama Local</option>
                  </select>
                  {newAgentProvider === 'ollama' && (
                    <select value={newAgentOllamaModel} onChange={e => setNewAgentOllamaModel(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none">
                      {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                  <button onClick={addAgent} className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold rounded-lg transition-all">Add</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
            {agents.map(agent => (
              <div key={agent.id} onClick={() => setActiveAgentId(agent.id)}
                className={cn('group rounded-xl border cursor-pointer transition-all',
                  activeAgentId === agent.id ? COLOR_MAP[agent.color] : 'bg-white/5 border-white/5 hover:border-white/15')}>
                <div className="flex items-center gap-2 p-2.5">
                  <span className="text-sm">{agent.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-bold text-white truncate">{agent.name}</p>
                    <p className={cn('text-[8px]', providerColor(agent.provider))}>{providerLabel(agent.provider)}</p>
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {agent.isThinking && <RefreshCw className="w-2.5 h-2.5 text-indigo-400 animate-spin" />}
                    <button onClick={e => { e.stopPropagation(); updateAgent(agent.id, () => []); }} className="p-0.5 hover:text-amber-400 text-slate-600 transition-colors"><RotateCcw className="w-2.5 h-2.5" /></button>
                    {agents.length > 1 && <button onClick={e => { e.stopPropagation(); setAgents(p => p.filter(a => a.id !== agent.id)); if (activeAgentId === agent.id) setActiveAgentId(agents[0].id); }} className="p-0.5 hover:text-red-400 text-slate-600 transition-colors"><X className="w-2.5 h-2.5" /></button>}
                  </div>
                </div>
                <div className="px-2.5 pb-2 text-[7px] text-slate-600">{agent.messages.filter(m => m.role !== 'system').length} msgs</div>
              </div>
            ))}
          </div>

          {/* Broadcast */}
          <div className="border-t border-white/5 p-2.5 space-y-1.5">
            <p className="text-[8px] text-amber-400 uppercase tracking-widest font-bold">⚡ Broadcast All</p>
            <div className="flex gap-1">
              <input value={broadcastInput} onChange={e => setBroadcastInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleBroadcast()}
                placeholder="All agents..." className="flex-1 bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-[9px] text-white focus:outline-none min-w-0" />
              <button onClick={handleBroadcast} disabled={isBroadcasting || !broadcastInput.trim()} className="p-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-400 disabled:opacity-40 hover:bg-amber-500/30 transition-all shrink-0">
                {isBroadcasting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>

        {/* Centre: chat */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r border-white/5">
          {activeAgent && (
            <div className="h-10 border-b border-white/5 flex items-center gap-2.5 px-4 bg-slate-950/40 shrink-0">
              <span>{activeAgent.icon}</span>
              <span className="text-[11px] font-bold text-white">{activeAgent.name}</span>
              <span className={cn('text-[9px]', providerColor(activeAgent.provider))}>{providerLabel(activeAgent.provider)}</span>
              {activeAgent.isThinking && <div className="ml-auto flex items-center gap-1 text-[9px] text-indigo-400"><Brain className="w-3 h-3 animate-pulse" />Thinking...</div>}
            </div>
          )}

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
            {activeAgent && agents.find(a => a.id === activeAgentId)?.messages.length === 0 && (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="text-4xl mb-2">{activeAgent.icon}</div>
                  <p className="text-sm font-bold text-white">{activeAgent.name}</p>
                  <p className="text-xs text-slate-500 mt-1">Building: {OS_BASES[project.osBase].label} to {BUILD_TARGETS[project.buildTarget].label}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(QUICK_PROMPTS[project.osBase] || []).map((qp, i) => (
                    <button key={i} onClick={() => setInput(qp.prompt)}
                      className="text-left p-3 bg-white/5 border border-white/5 hover:border-indigo-500/30 hover:bg-indigo-500/5 rounded-xl transition-all text-[10px] text-slate-400 hover:text-white">
                      <span className="font-bold">{qp.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {agents.find(a => a.id === activeAgentId)?.messages.map(msg => (
              <div key={msg.id} className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-1 text-[8px] text-slate-600">
                    <span>{activeAgent?.icon}</span><span>{activeAgent?.name}</span>
                    {msg.provider && <span className={providerColor(msg.provider)}>{providerLabel(msg.provider)}</span>}
                  </div>
                )}
                <div className={cn('max-w-[90%] px-4 py-3 rounded-2xl text-xs leading-relaxed', msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white/5 border border-white/5 text-slate-200 rounded-bl-none')}>
                  {msg.role === 'assistant'
                    ? <div className="prose prose-invert prose-xs max-w-none [&_pre]:bg-black/60 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:text-[10px] [&_pre]:overflow-x-auto [&_code]:text-emerald-400 [&_h1]:text-white [&_h2]:text-slate-200 [&_h3]:text-slate-300"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                    : msg.content}
                </div>
                {msg.files && msg.files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 max-w-[90%]">
                    {msg.files.map((f, i) => (
                      <button key={i} onClick={() => { setSelectedFile(f); setPanelMode('code'); }}
                        className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[9px] text-emerald-400 hover:bg-emerald-500/20 transition-all font-mono">
                        <FileCode className="w-2.5 h-2.5" />{f.path.split('/').pop()}
                      </button>
                    ))}
                  </div>
                )}
                <span className="text-[7px] text-slate-700 mt-0.5 px-1">{new Date(msg.ts).toLocaleTimeString()}</span>
              </div>
            ))}

            {activeAgent?.isThinking && (
              <div className="flex items-center gap-2 px-4 py-3 bg-white/5 border border-white/5 rounded-2xl rounded-bl-none w-fit">
                <Brain className="w-3 h-3 text-indigo-400 animate-pulse" />
                <span className="text-[10px] text-slate-500">Writing code...</span>
                {[0,150,300].map(d => <div key={d} className="w-1 h-1 bg-slate-600 rounded-full animate-bounce" style={{animationDelay:`${d}ms`}} />)}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-3 border-t border-white/5 bg-slate-950/40 shrink-0">
            <div className="flex items-end gap-2 bg-black/60 border border-white/10 rounded-xl p-2 focus-within:border-indigo-500/40 transition-colors">
              <textarea value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={`Tell ${activeAgent?.name || 'the agent'} what to build...`} rows={3}
                className="flex-1 bg-transparent text-xs text-white px-1 focus:outline-none resize-none placeholder:text-slate-600 leading-relaxed" />
              <button onClick={handleSend} disabled={!input.trim() || activeAgent?.isThinking} className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-40 shrink-0">
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: files/code/vbox */}
        <div className="w-96 flex flex-col bg-slate-950/20 shrink-0">
          <div className="h-10 border-b border-white/5 flex items-center px-2 gap-1 bg-slate-950/60 shrink-0">
            {([
              { id: 'files' as PanelMode, label: 'Files', icon: FolderOpen },
              { id: 'code'  as PanelMode, label: 'Code',  icon: Code2 },
              { id: 'vbox'    as PanelMode, label: 'VBox',    icon: Box },
              { id: 'preview' as PanelMode, label: '▶ Preview', icon: Monitor },
              { id: 'project' as PanelMode, label: 'Info', icon: HardDrive },
            ]).map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setPanelMode(id)}
                className={cn('flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all',
                  panelMode === id ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white')}>
                <Icon className="w-3 h-3" />{label}
              </button>
            ))}
            <span className="ml-auto text-[8px] text-slate-600 pr-2">{project.files.length} files</span>
          </div>

          {panelMode === 'files' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-1">
              {project.files.length === 0
                ? <div className="text-center py-16 text-slate-600 text-xs"><FileCode className="w-8 h-8 mx-auto mb-2 opacity-20" /><p>Ask an agent to generate files</p></div>
                : project.files.map((f, i) => (
                  <div key={i} onClick={() => { setSelectedFile(f); setPanelMode('code'); }}
                    className={cn('group flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all',
                      selectedFile?.path === f.path ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-white/5 border-white/5 hover:border-white/15')}>
                    <FileCode className="w-3 h-3 text-indigo-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-white truncate">{f.path.split('/').pop()}</p>
                      <p className="text-[8px] text-slate-600 font-mono truncate">{f.path}</p>
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(f.content); toast('Copied', 'success'); }} className="p-1 text-slate-600 hover:text-white"><Copy className="w-2.5 h-2.5" /></button>
                      <button onClick={e => { e.stopPropagation(); downloadFile(f); }} className="p-1 text-slate-600 hover:text-emerald-400"><Download className="w-2.5 h-2.5" /></button>
                      <button onClick={e => { e.stopPropagation(); setProject(p => ({ ...p, files: p.files.filter((_, j) => j !== i) })); }} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-2.5 h-2.5" /></button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {panelMode === 'code' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedFile ? (
                <>
                  <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between bg-black/40 shrink-0">
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold text-white truncate">{selectedFile.path}</p>
                      <p className="text-[8px] text-slate-500">{selectedFile.content.split('\n').length} lines . {selectedFile.language}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => navigator.clipboard.writeText(selectedFile.content).then(() => toast('Copied','success'))} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-all"><Copy className="w-3 h-3" /></button>
                      <button onClick={() => downloadFile(selectedFile)} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-emerald-400 transition-all"><Download className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto custom-scrollbar bg-black/60 p-3">
                    <pre className="text-[10px] text-emerald-400 font-mono leading-relaxed whitespace-pre-wrap break-all">{selectedFile.content}</pre>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-600 text-xs text-center"><div><Code2 className="w-8 h-8 mx-auto mb-2 opacity-20" /><p>Select a file</p></div></div>
              )}
            </div>
          )}

          {panelMode === 'vbox' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              <div className="flex items-center gap-2 mb-2">
                <Box className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-bold text-white">Oracle VirtualBox</h3>
              </div>
              <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl space-y-3 text-xs text-slate-400">
                <p className="font-bold text-purple-400 text-[10px] uppercase tracking-widest">Quick Start</p>
                <ol className="space-y-2 text-[10px] leading-relaxed">
                  <li><span className="text-white font-bold">1.</span> Build your OS ISO (ask the VBox Builder agent to generate an ISO build script)</li>
                  <li><span className="text-white font-bold">2.</span> Download the <code className="text-purple-300 bg-purple-500/20 px-1 rounded">vbox/setup_vm.sh</code> file from the Files panel</li>
                  <li><span className="text-white font-bold">3.</span> Run it in Git Bash: <code className="text-purple-300 bg-purple-500/20 px-1 rounded">bash setup_vm.sh</code></li>
                  <li><span className="text-white font-bold">4.</span> Or on Windows CMD: use the commands line by line manually</li>
                  <li><span className="text-white font-bold">5.</span> Start VM: <code className="text-purple-300 bg-purple-500/20 px-1 rounded">VBoxManage startvm "{project.vboxConfig.vmName}" --type gui</code></li>
                </ol>
              </div>

              {/* VBox config editor */}
              <div className="space-y-3">
                <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">VM Configuration</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'VM Name', key: 'vmName', type: 'text' },
                    { label: 'RAM MB', key: 'ram', type: 'number' },
                    { label: 'CPUs', key: 'cpus', type: 'number' },
                    { label: 'Disk GB', key: 'diskSize', type: 'number' },
                    { label: 'VRAM MB', key: 'vramSize', type: 'number' },
                  ].map(({ label, key, type }) => (
                    <div key={key} className="space-y-0.5">
                      <p className="text-[8px] text-slate-600 uppercase tracking-widest">{label}</p>
                      <input type={type} value={(project.vboxConfig as any)[key]} onChange={e => setProject(p => ({ ...p, vboxConfig: { ...p.vboxConfig, [key]: type === 'number' ? Number(e.target.value) : e.target.value } }))} className="w-full bg-black border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-purple-500/50" />
                    </div>
                  ))}
                  <div className="space-y-0.5">
                    <p className="text-[8px] text-slate-600 uppercase tracking-widest">Network</p>
                    <select value={project.vboxConfig.networkMode} onChange={e => setProject(p => ({ ...p, vboxConfig: { ...p.vboxConfig, networkMode: e.target.value as any } }))}
                      className="w-full bg-black border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none">
                      <option value="nat">NAT</option><option value="bridged">Bridged</option><option value="host-only">Host-Only</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[8px] text-slate-600 uppercase tracking-widest">ISO Path</p>
                  <input value={project.vboxConfig.isoPath} onChange={e => setProject(p => ({ ...p, vboxConfig: { ...p.vboxConfig, isoPath: e.target.value } }))}
                    placeholder="C:\path\to\nexusos.iso" className="w-full bg-black border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white font-mono focus:outline-none focus:border-purple-500/50" />
                </div>
                <button onClick={regenVBox} className="w-full py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-400 text-[9px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2">
                  <RefreshCw className="w-3 h-3" /> Regenerate VBox Scripts
                </button>
              </div>

              <div className="p-3 bg-white/5 border border-white/5 rounded-xl space-y-1.5">
                <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Ask VBox Builder agent:</p>
                {['Generate a bootable ISO build script for this OS', 'Write a Dockerfile to build the OS in a container', 'Create a QEMU alternative launch script', 'Set up VirtualBox Guest Additions install'].map((q, i) => (
                  <button key={i} onClick={() => { setInput(q); setActiveAgentId(agents.find(a => a.role === 'vbox')?.id || activeAgentId); }}
                    className="w-full text-left p-2 hover:bg-white/5 rounded-lg text-[9px] text-slate-500 hover:text-white transition-all">
                    {'->'} {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {panelMode === 'preview' && (
            <VMPreviewPanel vmName={project.vboxConfig.vmName || project.name.replace(/\s+/g, '_')} />
          )}

          {panelMode === 'project' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              <div className="space-y-2">
                <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Project</p>
                {[{ label: 'Name', key: 'name' }, { label: 'Description', key: 'description' }].map(({ label, key }) => (
                  <div key={key} className="space-y-0.5">
                    <p className="text-[8px] text-slate-600 uppercase tracking-widest">{label}</p>
                    <input value={(project as any)[key]} onChange={e => setProject(p => ({ ...p, [key]: e.target.value }))}
                      className="w-full bg-black border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white focus:outline-none focus:border-indigo-500/50" />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'OS Base', value: OS_BASES[project.osBase].label },
                  { label: 'Target', value: BUILD_TARGETS[project.buildTarget].label },
                  { label: 'Files', value: project.files.length },
                  { label: 'Agents', value: agents.length },
                  { label: 'Messages', value: agents.reduce((s, a) => s + a.messages.length, 0) },
                  { label: 'Tokens', value: `~${totalTokens.toLocaleString()}` },
                ].map(({ label, value }) => (
                  <div key={label} className="p-2.5 bg-white/5 border border-white/5 rounded-xl">
                    <p className="text-[7px] text-slate-600 uppercase tracking-widest">{label}</p>
                    <p className="text-xs font-bold text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="font-mono text-[9px] text-slate-500 bg-black/40 rounded-xl p-3 border border-white/5 space-y-0.5">
                <div className="text-indigo-400 mb-1">📁 {project.name}/</div>
                {project.files.map((f, i) => (
                  <div key={i} className="pl-3 hover:text-white cursor-pointer transition-colors" onClick={() => { setSelectedFile(f); setPanelMode('code'); }}>
                    └─ {f.path}
                  </div>
                ))}
              </div>

              <button onClick={exportProject} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2">
                <Download className="w-3.5 h-3.5" /> Export Full Project
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
