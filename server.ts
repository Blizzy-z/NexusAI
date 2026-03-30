import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { spawn } from "child_process";
import { createServer as createNetServer } from "net";
import * as https from "https";
import { networkInterfaces } from "os";
import { readdir, readFile, writeFile, mkdir, access, unlink } from "fs/promises";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import nodemailer from "nodemailer";
import { chromium } from "playwright";
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// ssh2 is optional only available when installed with build tools
let SshClient: any = null;
try {
  const ssh2 = await import("ssh2");
  SshClient = ssh2.Client;
} catch {
  console.warn("[NexusAI] ssh2 not available — Kali VM SSH will be disabled. Run on your main PC to enable it.");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const debugLog = (runId: string, hypothesisId: string, location: string, message: string, data: Record<string, unknown>) => {
    fetch('http://127.0.0.1:7260/ingest/5f56a8b4-730a-4b8c-8889-3fdd43644d03',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'037707'},body:JSON.stringify({sessionId:'037707',runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
  };
  const app = express();
  // Check for saved port override
  let savedPort = 3000;
  try {
    const { readFileSync, existsSync } = require("fs");
    const portFile = path.join(process.cwd(), ".nexus_port");
    if (existsSync(portFile)) savedPort = parseInt(readFileSync(portFile, "utf-8").trim()) || 3000;
  } catch {}
  const PORT = parseInt(process.env.PORT || String(savedPort) || '3000');

  // CORS allow iPhone / any LAN device to hit the API
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-nexus-token');
    if (req.method === 'OPTIONS') { res.sendStatus(200); return; }
    next();
  });
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));



  // Auto-find free port using ESM imports (no require ESM module)
  // Always use port 3000 kill whatever is on it first to keep localStorage consistent
  const { execSync } = await import('child_process');
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano', { encoding: 'utf8', timeout: 3000 });
      for (const line of out.split('\n')) {
        if (line.includes(':3000') && line.includes('LISTENING')) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && /^\d+$/.test(pid) && pid !== '0') {
            execSync(`taskkill /f /pid ${pid}`, { timeout: 3000 });
            await new Promise(r => setTimeout(r, 500));
          }
          break;
        }
      }
    }
  } catch {}

  const getPort = (start: number): Promise<number> => new Promise((resolve, reject) => {
    const s = createNetServer();
    s.listen(start, '0.0.0.0', () => { s.close(() => resolve(start)); });
    s.on('error', () => getPort(start + 1).then(resolve).catch(reject));
  });

  const actualPort = await getPort(PORT);

  // API routes

  // Network info for iPhone/mobile connection 
  app.get("/api/network-info", (req, res) => {
    const nets = networkInterfaces();
    const ips: string[] = [];
    for (const iface of Object.values(nets)) {
      for (const net of (iface || [])) {
        if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
      }
    }
    res.json({
      port: actualPort,
      localIps: ips,
      primaryUrl: ips[0] ? `http://${ips[0]}:${actualPort}` : `http://localhost:${actualPort}`,
      qrData: ips[0] ? `http://${ips[0]}:${actualPort}` : null,
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", version: "4.5.0" });
  });

  // ── Startup Builder Module (/startup and /startup/mobile) ─────────────────────
  type StartupTaskStatus = "queued" | "running" | "done" | "error";
  type StartupCheckStatus = "pending" | "ok" | "warn" | "error";
  type StartupLeadStatus = "new" | "messaged" | "responded" | "qualified" | "closed";
  type StartupDeliveryStatus = "sent" | "failed";
  type StartupLoopStatus = "ok" | "warn" | "error";
  type StartupCodeLanguage = "javascript" | "python" | "powershell";

  interface StartupTask {
    id: string;
    title: string;
    status: StartupTaskStatus;
    detail: string;
    updatedAt: number;
  }

  interface StartupLead {
    id: string;
    name: string;
    email: string;
    phone?: string;
    sourceUrl?: string;
    sourceDomain?: string;
    website?: string;
    hasWebsite?: boolean;
    reviewSummary?: string;
    reviewSource?: string;
    reviewCount?: number;
    avgRating?: number;
    companyInfo?: string;
    enrichedAt?: number;
    niche: string;
    status: StartupLeadStatus;
    valueUsd: number;
    updatedAt: number;
    lastOutreachAt?: number;
    lastOutreachStatus?: StartupDeliveryStatus;
    outreachAttempts?: number;
    lastCallAt?: number;
    lastCallStatus?: StartupDeliveryStatus;
    callAttempts?: number;
    lastCallSid?: string;
    lastAutoReplyAt?: number;
    lastAutoReplyStatus?: StartupDeliveryStatus;
    autoReplyAttempts?: number;
  }

  interface StartupCheck {
    id: string;
    label: string;
    status: StartupCheckStatus;
    detail: string;
    checkedAt: number;
  }

  interface StartupCampaign {
    id: string;
    name: string;
    channel: string;
    active: boolean;
    sentCount: number;
    responseCount: number;
    updatedAt: number;
  }

  interface StartupAISettings {
    preferLocal: boolean;
    localModel: string;
    geminiModel: string;
    useGeminiFallback: boolean;
    hasGeminiKey: boolean;
  }

  interface StartupAutopilotState {
    enabled: boolean;
    autoGenerateLeads: boolean;
    lastRunAt: number | null;
    lastProvider: "ollama" | "gemini" | "fallback" | "none";
    lastSummary: string;
    lastPlan: string;
    totalRuns: number;
    totalErrors: number;
    lastError: string;
  }

  interface StartupOutreachSettings {
    enabled: boolean;
    fromName: string;
    fromEmail: string;
    replyTo: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    hasSmtpPassword: boolean;
    batchSizePerRun: number;
    minHoursBetweenMessages: number;
    minMinutesBetweenSends: number;
    subjectTemplate: string;
    autoReplyEnabled: boolean;
    autoReplyCooldownHours: number;
    autoReplySubjectTemplate: string;
    autoReplyTemplate: string;
  }

  interface StartupCallingSettings {
    enabled: boolean;
    vapiAssistantId: string;
    vapiPhoneNumberId: string;
    hasVapiApiKey: boolean;
    defaultCountryCode: string;
    batchSizePerRun: number;
    minHoursBetweenCalls: number;
    minMinutesBetweenCalls: number;
    fallbackToEmailWhenNoPhone: boolean;
    assistantDescription: string;
    firstMessage: string;
    systemPrompt: string;
    scriptTemplate: string;
  }

  interface StartupDelivery {
    id: string;
    channel: "email" | "call";
    kind?: "outreach" | "autoreply" | "call";
    status: StartupDeliveryStatus;
    leadId: string;
    leadEmail: string;
    leadPhone?: string;
    subject: string;
    provider: string;
    messageId: string;
    error: string;
    ts: number;
  }

  interface StartupBusinessModel {
    niche: string;
    offerName: string;
    offerSummary: string;
    monthlyTargetGbp: number;
    monthlyPriceGbp: number;
    setupFeeGbp: number;
    clientsNeeded: number;
    supportByBrowserAgent: string[];
  }

  interface StartupBrowserAgentState {
    enabled: boolean;
    headless: boolean;
    searchEngine: "duckduckgo" | "google" | "bing";
    maxActionsPerRun: number;
    humanDelayMinMs: number;
    humanDelayMaxMs: number;
    googlePlacesEnabled: boolean;
    googlePlacesLocation: string;
    googlePlacesMaxResults: number;
    hasGooglePlacesApiKey: boolean;
    lastRunAt: number | null;
    lastSummary: string;
    lastError: string;
  }

  interface StartupLoopMemoryEntry {
    id: string;
    ts: number;
    currentGoal: string;
    plan: string;
    action: string;
    expectedResult: string;
    observation: string;
    improvement: string;
    status: StartupLoopStatus;
    browserAction: Record<string, any> | null;
  }

  interface StartupCodeRunResult {
    id: string;
    ts: number;
    language: "javascript" | "python" | "powershell";
    command: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
  }

  interface StartupState {
    version: number;
    mode: "safe" | "live";
    autoLoopEnabled: boolean;
    automationIntervalMinutes: number;
    niche: string;
    offerName: string;
    monthlyTargetUsd: number;
    pricingUsd: { starter: number; growth: number; scale: number };
    channels: {
      email: boolean;
      sms: boolean;
      dms: boolean;
      calls: boolean;
    };
    schedule: { dailyStart: string; dailyEnd: string; timezone: string };
    checks: StartupCheck[];
    tasks: StartupTask[];
    leads: StartupLead[];
    campaigns: StartupCampaign[];
    logs: { ts: number; level: "info" | "warn" | "error"; msg: string }[];
    stats: {
      outreachSent: number;
      replies: number;
      callsBooked: number;
      closedDeals: number;
      mrrUsd: number;
    };
    business: StartupBusinessModel;
    browserAgent: StartupBrowserAgentState;
    loopMemory: StartupLoopMemoryEntry[];
    codeRuns: StartupCodeRunResult[];
    repliesInbox: StartupInboundReply[];
    outreach: StartupOutreachSettings;
    calling: StartupCallingSettings;
    deliveries: StartupDelivery[];
    ai: StartupAISettings;
    autopilot: StartupAutopilotState;
    lastAuditAt: number | null;
    nextRunAt: number | null;
  }

  interface StartupInboundReply {
    id: string;
    ts: number;
    fromEmail: string;
    fromName: string;
    subject: string;
    text: string;
    leadId: string;
    leadEmail: string;
    autoReplyStatus: "queued" | "sent" | "failed" | "skipped";
    autoReplyAt?: number;
    autoReplyError?: string;
  }

  const startupDataDir = path.join(process.cwd(), ".nexus_startup");
  const startupStatePath = path.join(startupDataDir, "state.json");
  const startupGeminiKeyPath = path.join(startupDataDir, "gemini_api_key.txt");
  const startupSmtpPasswordPath = path.join(startupDataDir, "smtp_password.txt");
  const startupGooglePlacesKeyPath = path.join(startupDataDir, "google_places_api_key.txt");
  const startupVapiApiKeyPath = path.join(startupDataDir, "vapi_api_key.txt");
  let startupLoopTimer: ReturnType<typeof setInterval> | null = null;
  let startupAuditInFlight: Promise<StartupState> | null = null;
  let startupAuditInFlightReason: string | null = null;
  let startupAuditLastStartedAt: number | null = null;
  let startupAuditLastFinishedAt: number | null = null;
  let startupAuditLastError = "";

  const createStartupState = (): StartupState => {
    const now = Date.now();
    return {
      version: 2,
      mode: "safe",
      autoLoopEnabled: true,
      automationIntervalMinutes: 10,
      niche: "Local service businesses",
      offerName: "NexusAI Lead Engine",
      monthlyTargetUsd: 3000,
      pricingUsd: { starter: 499, growth: 999, scale: 1499 },
      channels: { email: true, sms: false, dms: true, calls: true },
      schedule: { dailyStart: "09:00", dailyEnd: "18:00", timezone: "local" },
      checks: [
        { id: "server-health", label: "Server health", status: "pending", detail: "Waiting for first audit", checkedAt: now },
        { id: "cloudflare-health", label: "Cloudflare domain", status: "pending", detail: "Waiting for first audit", checkedAt: now },
        { id: "offer-readiness", label: "Offer readiness", status: "pending", detail: "Waiting for first audit", checkedAt: now },
        { id: "lead-flow", label: "Lead pipeline", status: "pending", detail: "Waiting for first audit", checkedAt: now },
        { id: "outreach-delivery", label: "Outreach delivery", status: "pending", detail: "Waiting for SMTP setup", checkedAt: now },
        { id: "call-delivery", label: "Call delivery", status: "pending", detail: "Waiting for Vapi setup", checkedAt: now },
      ],
      tasks: [
        { id: "setup-offer", title: "Define service offer and pricing", status: "queued", detail: "Set starter, growth, and scale package details.", updatedAt: now },
        { id: "setup-outreach", title: "Prepare outreach sequences", status: "queued", detail: "Create email and DM templates for 7-day cadence.", updatedAt: now },
        { id: "setup-leadlist", title: "Create initial lead list", status: "queued", detail: "Collect first 50 prospects with business email + niche.", updatedAt: now },
        { id: "setup-followup", title: "Enable follow-up automation", status: "queued", detail: "Run daily follow-up and qualification workflow.", updatedAt: now },
      ],
      leads: [],
      campaigns: [
        { id: "email-outreach", name: "Email Outreach", channel: "email", active: true, sentCount: 0, responseCount: 0, updatedAt: now },
        { id: "dm-outreach", name: "DM Outreach", channel: "dms", active: true, sentCount: 0, responseCount: 0, updatedAt: now },
      ],
      logs: [{ ts: now, level: "info", msg: "Startup module initialized. First audit pending." }],
      stats: { outreachSent: 0, replies: 0, callsBooked: 0, closedDeals: 0, mrrUsd: 0 },
      business: {
        niche: "UK Local Trades",
        offerName: "AI Lead Engine for Trades",
        offerSummary: "Lead capture + follow-up automation + review/reactivation workflows for plumbers, electricians, and roofers.",
        monthlyTargetGbp: 1000,
        monthlyPriceGbp: 299,
        setupFeeGbp: 199,
        clientsNeeded: 4,
        supportByBrowserAgent: [
          "Research local trade businesses and collect safe public contact data",
          "Draft personalized outreach copy and prep contact form submissions",
          "Track outreach outcomes and follow-up cadence",
          "Update CRM-style lead status and notes after each run",
        ],
      },
      browserAgent: {
        enabled: true,
        headless: true,
        searchEngine: "duckduckgo",
        maxActionsPerRun: 20,
        humanDelayMinMs: 900,
        humanDelayMaxMs: 2200,
        googlePlacesEnabled: false,
        googlePlacesLocation: "London, UK",
        googlePlacesMaxResults: 8,
        hasGooglePlacesApiKey: false,
        lastRunAt: null,
        lastSummary: "Browser agent ready.",
        lastError: "",
      },
      loopMemory: [],
      codeRuns: [],
      repliesInbox: [],
      outreach: {
        enabled: true,
        fromName: "NexusAI",
        fromEmail: "",
        replyTo: "",
        smtpHost: "",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "",
        hasSmtpPassword: false,
        batchSizePerRun: 5,
        minHoursBetweenMessages: 24,
        minMinutesBetweenSends: 2,
        subjectTemplate: "Quick idea for {business}",
        autoReplyEnabled: true,
        autoReplyCooldownHours: 12,
        autoReplySubjectTemplate: "Re: {subject}",
        autoReplyTemplate: "Hi {firstName},\n\nThanks for replying.\n\nHappy to share a quick plan tailored to {business}. Would Tuesday at 11:00 or Wednesday at 14:00 work for a 15-minute call?\n\n— {senderName}",
      },
      calling: {
        enabled: true,
        vapiAssistantId: "6cedba67-1b85-40f6-a566-b11bbcaab87d",
        vapiPhoneNumberId: "",
        hasVapiApiKey: false,
        defaultCountryCode: "GB",
        batchSizePerRun: 5,
        minHoursBetweenCalls: 24,
        minMinutesBetweenCalls: 2,
        fallbackToEmailWhenNoPhone: true,
        assistantDescription: "Outbound caller for NexusAI. Calls UK local service businesses, quickly qualifies fit, handles objections politely, and books a 15-minute growth call. If no fit, exits cleanly and logs disposition.",
        firstMessage: "Hi, is this the business owner or manager? I'm calling from NexusAI because we help local businesses get more booked jobs with a simple website and AI follow-up.",
        systemPrompt: "You are NexusAI's outbound sales caller. Sound human, calm, and concise. Goal: book a 15-minute discovery call. Flow: intro -> permission -> qualify (website, lead flow, decision-maker) -> 20s value pitch -> CTA. Value pitch: \"We set up a conversion-focused website and AI follow-up so missed opportunities become booked jobs.\" Handle objections briefly (max 2 attempts), then close politely. If not ready: ask for best email and permission to send info. If asked to stop: apologize, end call, mark do-not-contact. Never invent results or guarantees. End each call with: DISPOSITION: booked | follow_up | not_interested | wrong_number | voicemail. SUMMARY: 1-2 lines. NEXT_ACTION: specific next step.",
        scriptTemplate: "You are NexusAI's outbound sales caller. Sound human, calm, and concise. Goal: book a 15-minute discovery call. Flow: intro -> permission -> qualify (website, lead flow, decision-maker) -> 20s value pitch -> CTA. Value pitch: \"We set up a conversion-focused website and AI follow-up so missed opportunities become booked jobs.\" Handle objections briefly (max 2 attempts), then close politely. If not ready: ask for best email and permission to send info. If asked to stop: apologize, end call, mark do-not-contact. Never invent results or guarantees. End each call with: DISPOSITION: booked | follow_up | not_interested | wrong_number | voicemail. SUMMARY: 1-2 lines. NEXT_ACTION: specific next step.",
      },
      deliveries: [],
      ai: {
        preferLocal: true,
        localModel: "mdq100/Gemma3-Instruct-Abliterated:12b",
        geminiModel: "gemini-2.0-flash",
        useGeminiFallback: true,
        hasGeminiKey: false,
      },
      autopilot: {
        enabled: true,
        autoGenerateLeads: true,
        lastRunAt: null,
        lastProvider: "none",
        lastSummary: "Autopilot ready. First run pending.",
        lastPlan: "",
        totalRuns: 0,
        totalErrors: 0,
        lastError: "",
      },
      lastAuditAt: null,
      nextRunAt: now + 10 * 60 * 1000,
    };
  };

  const normaliseStartupState = (rawState: any): StartupState => {
    const base = createStartupState();
    const parsed = rawState || {};
    return {
      ...base,
      ...parsed,
      pricingUsd: { ...base.pricingUsd, ...(parsed.pricingUsd || {}) },
      channels: { ...base.channels, ...(parsed.channels || {}) },
      schedule: { ...base.schedule, ...(parsed.schedule || {}) },
      stats: { ...base.stats, ...(parsed.stats || {}) },
      business: { ...base.business, ...(parsed.business || {}) },
      browserAgent: { ...base.browserAgent, ...(parsed.browserAgent || {}) },
      outreach: { ...base.outreach, ...(parsed.outreach || {}) },
      calling: { ...base.calling, ...(parsed.calling || {}) },
      ai: { ...base.ai, ...(parsed.ai || {}) },
      autopilot: { ...base.autopilot, ...(parsed.autopilot || {}) },
      checks: Array.isArray(parsed.checks) ? parsed.checks : base.checks,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : base.tasks,
      leads: Array.isArray(parsed.leads) ? parsed.leads : base.leads,
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : base.campaigns,
      loopMemory: Array.isArray(parsed.loopMemory) ? parsed.loopMemory : base.loopMemory,
      codeRuns: Array.isArray(parsed.codeRuns) ? parsed.codeRuns : base.codeRuns,
      repliesInbox: Array.isArray(parsed.repliesInbox) ? parsed.repliesInbox : base.repliesInbox,
      deliveries: Array.isArray(parsed.deliveries) ? parsed.deliveries : base.deliveries,
      logs: Array.isArray(parsed.logs) ? parsed.logs : base.logs,
    };
  };

  const startupLog = (state: StartupState, level: "info" | "warn" | "error", msg: string) => {
    state.logs.unshift({ ts: Date.now(), level, msg });
    if (state.logs.length > 200) state.logs = state.logs.slice(0, 200);
  };

  const readStartupGeminiKey = async (): Promise<string> => {
    try {
      await access(startupGeminiKeyPath);
      const key = (await readFile(startupGeminiKeyPath, "utf-8")).trim();
      if (key) return key;
    } catch {}
    return String(process.env.GEMINI_API_KEY || "").trim();
  };

  const writeStartupGeminiKey = async (key: string) => {
    const trimmed = String(key || "").trim();
    if (!trimmed) {
      try { await unlink(startupGeminiKeyPath); } catch {}
      return;
    }
    await mkdir(startupDataDir, { recursive: true });
    await writeFile(startupGeminiKeyPath, trimmed, "utf-8");
  };

  const readStartupGooglePlacesKey = async (): Promise<string> => {
    try {
      await access(startupGooglePlacesKeyPath);
      const key = (await readFile(startupGooglePlacesKeyPath, "utf-8")).trim();
      if (key) return key;
    } catch {}
    return String(
      process.env.NEXUS_STARTUP_GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      "",
    ).trim();
  };

  const writeStartupGooglePlacesKey = async (key: string) => {
    const trimmed = String(key || "").trim();
    if (!trimmed) {
      try { await unlink(startupGooglePlacesKeyPath); } catch {}
      return;
    }
    await mkdir(startupDataDir, { recursive: true });
    await writeFile(startupGooglePlacesKeyPath, trimmed, "utf-8");
  };

  const readStartupSmtpPassword = async (): Promise<string> => {
    try {
      await access(startupSmtpPasswordPath);
      const saved = (await readFile(startupSmtpPasswordPath, "utf-8")).trim();
      if (saved) return saved;
    } catch {}
    return String(
      process.env.NEXUS_STARTUP_SMTP_PASSWORD ||
      process.env.SMTP_PASSWORD ||
      process.env.SMTP_PASS ||
      "",
    ).trim();
  };

  const writeStartupSmtpPassword = async (password: string) => {
    const trimmed = String(password || "").trim();
    if (!trimmed) {
      try { await unlink(startupSmtpPasswordPath); } catch {}
      return;
    }
    await mkdir(startupDataDir, { recursive: true });
    await writeFile(startupSmtpPasswordPath, trimmed, "utf-8");
  };

  const readStartupVapiApiKey = async (): Promise<string> => {
    try {
      await access(startupVapiApiKeyPath);
      const key = (await readFile(startupVapiApiKeyPath, "utf-8")).trim();
      if (key) return key;
    } catch {}
    return String(
      process.env.NEXUS_STARTUP_VAPI_API_KEY ||
      process.env.VAPI_API_KEY ||
      "",
    ).trim();
  };

  const writeStartupVapiApiKey = async (key: string) => {
    const trimmed = String(key || "").trim();
    if (!trimmed) {
      try { await unlink(startupVapiApiKeyPath); } catch {}
      return;
    }
    await mkdir(startupDataDir, { recursive: true });
    await writeFile(startupVapiApiKeyPath, trimmed, "utf-8");
  };

  const safeReadStartupState = async (): Promise<StartupState> => {
    try {
      await access(startupStatePath);
      const raw = await readFile(startupStatePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (!parsed?.version) throw new Error("invalid startup state");
      const next = normaliseStartupState(parsed);
      const geminiKey = await readStartupGeminiKey();
      const googlePlacesApiKey = await readStartupGooglePlacesKey();
      const vapiApiKey = await readStartupVapiApiKey();
      next.ai.hasGeminiKey = Boolean(geminiKey);
      next.browserAgent.hasGooglePlacesApiKey = Boolean(googlePlacesApiKey);
      next.outreach.hasSmtpPassword = Boolean(await readStartupSmtpPassword());
      next.calling.hasVapiApiKey = Boolean(vapiApiKey);
      return next;
    } catch {
      const fallback = normaliseStartupState(createStartupState());
      const geminiKey = await readStartupGeminiKey();
      const googlePlacesApiKey = await readStartupGooglePlacesKey();
      const vapiApiKey = await readStartupVapiApiKey();
      fallback.ai.hasGeminiKey = Boolean(geminiKey);
      fallback.browserAgent.hasGooglePlacesApiKey = Boolean(googlePlacesApiKey);
      fallback.outreach.hasSmtpPassword = Boolean(await readStartupSmtpPassword());
      fallback.calling.hasVapiApiKey = Boolean(vapiApiKey);
      await mkdir(startupDataDir, { recursive: true });
      await writeFile(startupStatePath, JSON.stringify(fallback, null, 2), "utf-8");
      return fallback;
    }
  };

  const saveStartupState = async (state: StartupState) => {
    await mkdir(startupDataDir, { recursive: true });
    await writeFile(startupStatePath, JSON.stringify(state, null, 2), "utf-8");
  };

  const upsertCheck = (checks: StartupCheck[], next: StartupCheck) => {
    const idx = checks.findIndex((c) => c.id === next.id);
    if (idx === -1) checks.push(next);
    else checks[idx] = next;
  };

  const createStartupAutopilotPrompt = (state: StartupState) => {
    return [
      "You are NexusAI Startup Autopilot. Generate today's tactical execution plan to grow revenue.",
      `Business: ${state.offerName}`,
      `Target niche: ${state.niche}`,
      `Monthly target USD: ${state.monthlyTargetUsd}`,
      `Pricing: starter=${state.pricingUsd.starter}, growth=${state.pricingUsd.growth}, scale=${state.pricingUsd.scale}`,
      `Channels: email=${state.channels.email}, sms=${state.channels.sms}, dms=${state.channels.dms}, calls=${state.channels.calls}`,
      `Current funnel stats: outreach=${state.stats.outreachSent}, replies=${state.stats.replies}, calls=${state.stats.callsBooked}, closed=${state.stats.closedDeals}, mrr=${state.stats.mrrUsd}`,
      `Leads:\n${state.leads.slice(0, 15).map((l) => `- ${l.name} | ${l.email} | ${l.status} | $${l.valueUsd}`).join("\n") || "- none"}`,
      "Output strict JSON with keys: summary (string), actions (array of strings), outreachTemplates (array of strings), leadIdeas (array of objects with name,email,niche,valueUsd).",
    ].join("\n\n");
  };

  const callOllamaStartupPlan = async (model: string, prompt: string) => {
    const upstream = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.35 },
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => upstream.statusText);
      throw new Error(`ollama error: ${txt}`);
    }
    const data = await upstream.json() as any;
    return String(data?.response || "").trim();
  };

  const callGeminiStartupPlan = async (model: string, prompt: string, apiKey: string) => {
    if (!apiKey) throw new Error("gemini key missing");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35, topP: 0.95, maxOutputTokens: 4096 },
    };
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(data?.error?.message || `gemini error ${r.status}`);
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return String(text || "").trim();
  };

  interface StartupAutopilotParsedPlan {
    summary: string;
    actions: string[];
    outreachTemplates: string[];
    leadIdeas: any[];
  }

  interface StartupDeliveryRunResult {
    sent: number;
    failed: number;
    skipped: number;
    checkStatus: StartupCheckStatus;
    detail: string;
  }

  interface StartupCallRunResult {
    sent: number;
    failed: number;
    skipped: number;
    fallbackCandidates: string[];
    checkStatus: StartupCheckStatus;
    detail: string;
  }

  const parseStartupAutopilotJson = (raw: string): StartupAutopilotParsedPlan => {
    const text = String(raw || "").trim();
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    const jsonSource = fenced?.[1] || text;
    try {
      const parsed = JSON.parse(jsonSource) as any;
      return {
        summary: String(parsed?.summary || "Autopilot execution plan generated."),
        actions: Array.isArray(parsed?.actions) ? parsed.actions.map((a: any) => String(a)) : [],
        outreachTemplates: Array.isArray(parsed?.outreachTemplates) ? parsed.outreachTemplates.map((a: any) => String(a)) : [],
        leadIdeas: Array.isArray(parsed?.leadIdeas) ? parsed.leadIdeas : [],
      };
    } catch {
      return {
        summary: text.slice(0, 500) || "Autopilot generated text output.",
        actions: [],
        outreachTemplates: [],
        leadIdeas: [],
      };
    }
  };

  const emailLooksValid = (value: string): boolean => {
    const email = String(value || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
    const host = email.split("@")[1]?.toLowerCase() || "";
    if (!host) return false;
    if (host.endsWith(".example") || host.endsWith(".invalid") || host.endsWith(".test") || host.endsWith(".local")) return false;
    if (host === "example.com" || host === "example.org" || host === "example.net") return false;
    if (/(?:\d+x\d+@|@\d+x\d+|@2x\.png$|@3x\.png$|@icon\.|@image\.)/i.test(email)) return false;
    return true;
  };

  const normaliseEmail = (value: string): string => {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[>,;]+$/g, "");
  };

  const countryDialCodeByIso: Record<string, string> = {
    GB: "+44",
    US: "+1",
    CA: "+1",
    AU: "+61",
    IE: "+353",
    NZ: "+64",
  };

  const normalisePhoneNumber = (value: string, defaultCountryCode = "GB"): string => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    let compact = raw
      .replace(/[^\d+]/g, "")
      .replace(/^00/, "+")
      .replace(/\+{2,}/g, "+");
    if (!compact) return "";
    if (compact.startsWith("+")) {
      const digits = compact.slice(1).replace(/\D/g, "");
      return digits ? `+${digits}` : "";
    }
    const localDigits = compact.replace(/\D/g, "");
    if (!localDigits) return "";
    const iso = String(defaultCountryCode || "GB").trim().toUpperCase();
    const dialCode = countryDialCodeByIso[iso] || "+44";
    const normalizedLocal = localDigits.startsWith("0") ? localDigits.slice(1) : localDigits;
    if (!normalizedLocal) return "";
    return `${dialCode}${normalizedLocal}`;
  };

  const phoneLooksCallable = (value: string): boolean => {
    return /^\+\d{7,15}$/.test(String(value || "").trim());
  };

  const extractEmailsFromText = (text: string): string[] => {
    const matches = String(text || "").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];
    const out = new Set<string>();
    for (const raw of matches) {
      const clean = normaliseEmail(raw.replace(/[),.;:!?]+$/g, ""));
      if (emailLooksValid(clean)) out.add(clean);
    }
    return Array.from(out);
  };

  const parseReplySender = (rawValue: string): { email: string; name: string } => {
    const value = String(rawValue || "").trim();
    const foundEmails = extractEmailsFromText(value);
    const email = normaliseEmail(foundEmails[0] || value);
    const cleanedName = value
      .replace(/<[^>]*>/g, " ")
      .replace(/[",]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const fallbackName = email ? email.split("@")[0] : "Contact";
    return {
      email,
      name: cleanedName && cleanedName !== email ? cleanedName : fallbackName,
    };
  };

  const normaliseReplyTextForDedup = (text: string): string => {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .slice(0, 500);
  };

  const disallowedProspectHosts = [
    "google.com",
    "bing.com",
    "duckduckgo.com",
    "youtube.com",
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "linkedin.com",
    "wikipedia.org",
    "yelp.com",
    "tripadvisor.com",
    "pinterest.com",
    "tiktok.com",
    "reddit.com",
  ];

  const hostMatches = (host: string, blocked: string): boolean => {
    return host === blocked || host.endsWith(`.${blocked}`);
  };

  const isProspectCandidateLink = (href: string): boolean => {
    try {
      const url = new URL(String(href || ""));
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (disallowedProspectHosts.some((blocked) => hostMatches(host, blocked))) return false;
      const path = url.pathname.toLowerCase();
      if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|docx?|pptx?|xlsx?|mp4|mp3)$/i.test(path)) return false;
      return true;
    } catch {
      return false;
    }
  };

  const pickDomain = (href: string): string => {
    try {
      return new URL(href).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  };

  const resolveSearchRedirectHref = (href: string): string => {
    try {
      const url = new URL(String(href || ""));
      const host = url.hostname.toLowerCase();
      if (host.endsWith("duckduckgo.com")) {
        const uddg = url.searchParams.get("uddg");
        if (uddg) return decodeURIComponent(uddg);
      }
      if (host.endsWith("google.com") || host.endsWith("google.co.uk")) {
        const q = url.searchParams.get("q");
        if (q && /^https?:\/\//i.test(q)) return decodeURIComponent(q);
      }
      if (host.endsWith("bing.com")) {
        const target = url.searchParams.get("u");
        if (target && /^https?:\/\//i.test(target)) return decodeURIComponent(target);
      }
      return href;
    } catch {
      return href;
    }
  };

  const deriveBusinessName = (title: string, linkText: string, href: string): string => {
    const host = pickDomain(href);
    const fallback = host.split(".").slice(0, -1).join(" ") || host || "Unknown Business";
    const fromTitle = String(title || "")
      .replace(/\s*\|\s*.*$/, "")
      .replace(/\s*-\s*.*$/, "")
      .trim();
    const fromLink = String(linkText || "").trim();
    const chosen = fromTitle.length >= 3 ? fromTitle : (fromLink.length >= 3 ? fromLink : fallback);
    return chosen.slice(0, 100);
  };

  const buildLeadTemplateVars = (
    lead: StartupLead,
    state: StartupState,
    extra: Record<string, string> = {},
  ): Record<string, string> => {
    const firstName = String(lead.name || "").trim().split(/\s+/)[0] || "there";
    return {
      "{business}": String(lead.name || "").trim(),
      "{firstName}": firstName,
      "{email}": String(lead.email || "").trim(),
      "{niche}": String(lead.niche || state.niche || "").trim(),
      "{offer}": String(state.offerName || "").trim(),
      "{starterPrice}": String(state.pricingUsd.starter || 0),
      "{growthPrice}": String(state.pricingUsd.growth || 0),
      "{scalePrice}": String(state.pricingUsd.scale || 0),
      "{monthlyTarget}": String(state.monthlyTargetUsd || 0),
      "{senderName}": String(state.outreach.fromName || "NexusAI").trim() || "NexusAI",
      ...extra,
    };
  };

  const applyTemplateVars = (template: string, vars: Record<string, string>): string => {
    let output = String(template || "");
    for (const [token, value] of Object.entries(vars)) {
      output = output.replaceAll(token, String(value ?? ""));
    }
    return output;
  };

  const fillOutreachTemplate = (template: string, lead: StartupLead, state: StartupState): string => {
    return applyTemplateVars(template, buildLeadTemplateVars(lead, state));
  };

  const splitOutreachTemplate = (template: string, fallbackSubject: string) => {
    const cleaned = String(template || "").trim().replace(/^```(?:markdown|text)?/i, "").replace(/```$/i, "").trim();
    const lines = cleaned.split(/\r?\n/);
    let subject = fallbackSubject;
    let body = cleaned;
    if (lines.length > 0 && /^subject\s*:/i.test(lines[0])) {
      subject = lines[0].replace(/^subject\s*:/i, "").trim() || fallbackSubject;
      body = lines.slice(1).join("\n").trim();
    }
    return {
      subject: subject || fallbackSubject,
      body: body || cleaned,
    };
  };

  const parseClockTimeMinutes = (value: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
    if (!m) return null;
    const hours = Number(m[1]);
    const mins = Number(m[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
      return null;
    }
    return hours * 60 + mins;
  };

  const withinStartupScheduleWindow = (state: StartupState): boolean => {
    const start = parseClockTimeMinutes(state.schedule.dailyStart);
    const end = parseClockTimeMinutes(state.schedule.dailyEnd);
    if (start === null || end === null) return true;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (start <= end) return minutes >= start && minutes <= end;
    return minutes >= start || minutes <= end;
  };

  const pushStartupDelivery = (state: StartupState, delivery: StartupDelivery) => {
    state.deliveries.unshift(delivery);
    if (state.deliveries.length > 300) state.deliveries = state.deliveries.slice(0, 300);
  };

  const pushStartupReply = (state: StartupState, reply: StartupInboundReply) => {
    state.repliesInbox.unshift(reply);
    if (state.repliesInbox.length > 400) state.repliesInbox = state.repliesInbox.slice(0, 400);
  };

  const findLeadByEmail = (state: StartupState, email: string): StartupLead | undefined => {
    const target = normaliseEmail(email);
    if (!target) return undefined;
    return state.leads.find((lead) => normaliseEmail(lead.email) === target);
  };

  const runStartupCallDelivery = async (
    state: StartupState,
    reason: string,
  ): Promise<StartupCallRunResult> => {
    if (!state.calling.enabled || !state.channels.calls) {
      return {
        sent: 0,
        failed: 0,
        skipped: state.leads.length,
        fallbackCandidates: [],
        checkStatus: "warn",
        detail: "Calling is disabled in channel/settings.",
      };
    }
    if (!withinStartupScheduleWindow(state)) {
      return {
        sent: 0,
        failed: 0,
        skipped: state.leads.length,
        fallbackCandidates: [],
        checkStatus: "warn",
        detail: `Outside schedule window (${state.schedule.dailyStart}-${state.schedule.dailyEnd}).`,
      };
    }

    const vapiApiKey = await readStartupVapiApiKey();
    state.calling.hasVapiApiKey = Boolean(vapiApiKey);
    const missing: string[] = [];
    if (!vapiApiKey) missing.push("vapiApiKey");
    if (!String(state.calling.vapiAssistantId || "").trim()) missing.push("vapiAssistantId");
    if (!String(state.calling.vapiPhoneNumberId || "").trim()) missing.push("vapiPhoneNumberId");
    if (missing.length > 0) {
      return {
        sent: 0,
        failed: 0,
        skipped: state.leads.length,
        fallbackCandidates: [],
        checkStatus: "error",
        detail: `Vapi not configured: ${missing.join(", ")}`,
      };
    }

    const now = Date.now();
    const cooldownHours = Math.max(1, Number(state.calling.minHoursBetweenCalls || 24));
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    const sendGapMinutes = Math.max(0, Number(state.calling.minMinutesBetweenCalls || 0));
    const sendGapMs = sendGapMinutes * 60 * 1000;
    const maxBatch = Math.max(1, Math.min(50, Number(state.calling.batchSizePerRun || 5)));
    const defaultCountryCode = String(state.calling.defaultCountryCode || "GB").trim().toUpperCase() || "GB";

    const candidates = state.leads.filter((lead) => {
      if (lead.status === "closed") return false;
      const noWebsite = lead.hasWebsite === false || !String(lead.website || "").trim();
      if (!noWebsite) return false;
      const leadPhone = normalisePhoneNumber(String(lead.phone || ""), defaultCountryCode);
      if (!phoneLooksCallable(leadPhone)) return false;
      if (lead.lastCallAt && now - lead.lastCallAt < cooldownMs) return false;
      return true;
    }).slice(0, maxBatch);

    if (candidates.length === 0) {
      return {
        sent: 0,
        failed: 0,
        skipped: state.leads.length,
        fallbackCandidates: [],
        checkStatus: "warn",
        detail: "No eligible leads with callable phone numbers for this call run.",
      };
    }

    let sent = 0;
    let failed = 0;
    const fallbackCandidates = new Set<string>();
    for (let i = 0; i < candidates.length; i += 1) {
      const lead = candidates[i];
      const ts = Date.now();
      const phone = normalisePhoneNumber(String(lead.phone || ""), defaultCountryCode);
      const systemPrompt = String(state.calling.systemPrompt || state.calling.scriptTemplate || "").trim();
      const firstMessage = String(state.calling.firstMessage || "").trim();
      const assistantDescription = String(state.calling.assistantDescription || "").trim();
      const mergedSystemPrompt = assistantDescription
        ? `${assistantDescription}\n\n${systemPrompt}`.trim()
        : systemPrompt;
      const assistantOverrides = {
        model: {
          messages: [
            ...(mergedSystemPrompt
              ? [{
                  role: "system",
                  content: applyTemplateVars(
                    mergedSystemPrompt,
                    buildLeadTemplateVars(lead, state, { "{phone}": phone }),
                  ),
                } as const]
              : []),
            ...(firstMessage
              ? [{
                  role: "assistant",
                  content: applyTemplateVars(
                    firstMessage,
                    buildLeadTemplateVars(lead, state, { "{phone}": phone }),
                  ),
                } as const]
              : []),
          ],
        },
      };
      try {
        const response = await fetch("https://api.vapi.ai/call", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${vapiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assistantId: String(state.calling.vapiAssistantId || "").trim(),
            phoneNumberId: String(state.calling.vapiPhoneNumberId || "").trim(),
            customer: { number: phone, name: String(lead.name || "").trim() || undefined },
            destination: { type: "number", number: phone },
            assistantOverrides,
            metadata: {
              source: "nexusai-startup",
              reason,
              leadId: lead.id,
              leadEmail: lead.email,
              leadName: lead.name,
            },
          }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await response.json().catch(() => ({} as any));
        if (!response.ok) {
          throw new Error(String(data?.message || data?.error || `Vapi call create failed (${response.status}).`));
        }
        sent += 1;
        const callId = String(data?.id || data?.call?.id || "").trim();
        lead.lastCallAt = ts;
        lead.lastCallStatus = "sent";
        lead.callAttempts = Number(lead.callAttempts || 0) + 1;
        if (callId) lead.lastCallSid = callId;
        lead.updatedAt = ts;
        if (lead.status === "new") lead.status = "messaged";
        pushStartupDelivery(state, {
          id: `${ts}-${Math.random().toString(36).slice(2, 8)}`,
          channel: "call",
          kind: "call",
          status: "sent",
          leadId: lead.id,
          leadEmail: lead.email,
          leadPhone: phone,
          subject: "Vapi outbound call",
          provider: "vapi",
          messageId: callId,
          error: "",
          ts,
        });
      } catch (e: any) {
        failed += 1;
        const message = String(e?.message || e);
        lead.lastCallAt = ts;
        lead.lastCallStatus = "failed";
        lead.callAttempts = Number(lead.callAttempts || 0) + 1;
        lead.updatedAt = ts;
        if (state.calling.fallbackToEmailWhenNoPhone && emailLooksValid(lead.email)) {
          fallbackCandidates.add(lead.id);
        }
        pushStartupDelivery(state, {
          id: `${ts}-${Math.random().toString(36).slice(2, 8)}`,
          channel: "call",
          kind: "call",
          status: "failed",
          leadId: lead.id,
          leadEmail: lead.email,
          leadPhone: phone,
          subject: "Vapi outbound call",
          provider: "vapi",
          messageId: "",
          error: message,
          ts,
        });
        startupLog(state, "error", `Vapi call failed to ${phone} (${lead.name}): ${message}`);
      }
      if (i < candidates.length - 1 && sendGapMs > 0) {
        startupLog(state, "info", `Call pacing delay ${sendGapMinutes} minute(s) before next call.`);
        await new Promise((resolve) => setTimeout(resolve, sendGapMs));
      }
    }

    const noPhoneLeads = state.leads.filter((lead) => {
      if (lead.status === "closed") return false;
      const noWebsite = lead.hasWebsite === false || !String(lead.website || "").trim();
      if (!noWebsite) return false;
      if (!state.calling.fallbackToEmailWhenNoPhone) return false;
      if (!emailLooksValid(lead.email)) return false;
      const phone = normalisePhoneNumber(String(lead.phone || ""), defaultCountryCode);
      return !phoneLooksCallable(phone);
    });
    for (const lead of noPhoneLeads) {
      fallbackCandidates.add(lead.id);
    }

    if (sent > 0) {
      state.stats.callsBooked += sent;
    }
    const skipped = Math.max(0, state.leads.length - candidates.length);
    const checkStatus: StartupCheckStatus = failed > 0 ? (sent > 0 ? "warn" : "error") : "ok";
    const detail = `Call run ${reason}: sent=${sent}, failed=${failed}, skipped=${skipped}, fallbackEmailCandidates=${fallbackCandidates.size}.`;
    startupLog(state, failed > 0 ? "warn" : "info", detail);
    return { sent, failed, skipped, fallbackCandidates: Array.from(fallbackCandidates), checkStatus, detail };
  };

  const runStartupOutreachDelivery = async (
    state: StartupState,
    templates: string[],
    reason: string,
    options?: { leadIds?: string[] },
  ): Promise<StartupDeliveryRunResult> => {
    if (!state.outreach.enabled || !state.channels.email) {
      return {
        sent: 0,
        failed: 0,
        skipped: state.leads.length,
        checkStatus: "warn",
        detail: "Email outreach is disabled in channel/settings.",
      };
    }

    if (!withinStartupScheduleWindow(state)) {
      return {
        sent: 0,
        failed: 0,
        skipped: state.leads.length,
        checkStatus: "warn",
        detail: `Outside schedule window (${state.schedule.dailyStart}-${state.schedule.dailyEnd}).`,
      };
    }

    const smtpPassword = await readStartupSmtpPassword();
    state.outreach.hasSmtpPassword = Boolean(smtpPassword);
    const missing: string[] = [];
    if (!state.outreach.fromEmail.trim()) missing.push("fromEmail");
    if (!state.outreach.smtpHost.trim()) missing.push("smtpHost");
    if (!Number.isFinite(state.outreach.smtpPort) || state.outreach.smtpPort <= 0) missing.push("smtpPort");
    if (!state.outreach.smtpUser.trim()) missing.push("smtpUser");
    if (!smtpPassword) missing.push("smtpPassword");
    if (missing.length > 0) {
      return {
        sent: 0,
        failed: 0,
        skipped: state.leads.length,
        checkStatus: "error",
        detail: `SMTP not configured: ${missing.join(", ")}`,
      };
    }

    const now = Date.now();
    const cooldownHours = Math.max(1, Number(state.outreach.minHoursBetweenMessages || 24));
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    const sendGapMinutes = Math.max(0, Number(state.outreach.minMinutesBetweenSends || 0));
    const sendGapMs = sendGapMinutes * 60 * 1000;
    const maxBatch = Math.max(1, Math.min(50, Number(state.outreach.batchSizePerRun || 5)));
    const subjectTemplateRaw = String(state.outreach.subjectTemplate || "Quick idea for {business}").trim();
    const leadIdFilter = new Set(
      Array.isArray(options?.leadIds)
        ? options!.leadIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [],
    );

    const eligibleLeads = state.leads.filter((lead) => {
      if (lead.status === "closed") return false;
      if (leadIdFilter.size > 0 && !leadIdFilter.has(lead.id)) return false;
      if (!emailLooksValid(lead.email)) return false;
      if (lead.lastOutreachAt && now - lead.lastOutreachAt < cooldownMs) return false;
      return true;
    }).slice(0, maxBatch);

    if (eligibleLeads.length === 0) {
      return {
        sent: 0,
        failed: 0,
        skipped: state.leads.length,
        checkStatus: "warn",
        detail: "No eligible leads for this outreach run.",
      };
    }

    const fallbackBody = [
      "Hi {firstName},",
      "",
      "I run {offer} and we help {niche} teams generate more qualified leads and automate follow-up without adding headcount.",
      `Our plans start at $${state.pricingUsd.starter}/mo and can scale to $${state.pricingUsd.scale}/mo.`,
      "",
      "If you want, I can send a quick 3-step growth plan for {business}.",
      "",
      "— NexusAI",
    ].join("\n");
    const templatePool = templates.length > 0 ? templates : [fallbackBody];

    const transporter = nodemailer.createTransport({
      host: state.outreach.smtpHost.trim(),
      port: Number(state.outreach.smtpPort),
      secure: Boolean(state.outreach.smtpSecure),
      auth: {
        user: state.outreach.smtpUser.trim(),
        pass: smtpPassword,
      },
    });

    try {
      await transporter.verify();
    } catch (e: any) {
      const message = e?.message || String(e);
      startupLog(state, "error", `SMTP verify failed: ${message}`);
      return {
        sent: 0,
        failed: eligibleLeads.length,
        skipped: Math.max(0, state.leads.length - eligibleLeads.length),
        checkStatus: "error",
        detail: `SMTP verify failed: ${message}`,
      };
    }

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < eligibleLeads.length; i += 1) {
      const lead = eligibleLeads[i];
      const rawTemplate = templatePool[i % templatePool.length] || fallbackBody;
      const resolvedSubjectTemplate = fillOutreachTemplate(subjectTemplateRaw, lead, state);
      const split = splitOutreachTemplate(rawTemplate, resolvedSubjectTemplate);
      const subject = fillOutreachTemplate(split.subject, lead, state).slice(0, 180);
      const text = fillOutreachTemplate(split.body, lead, state);
      const timestamp = Date.now();

      try {
        const info = await transporter.sendMail({
          from: {
            name: String(state.outreach.fromName || "NexusAI").trim() || "NexusAI",
            address: state.outreach.fromEmail.trim(),
          },
          to: lead.email.trim(),
          replyTo: state.outreach.replyTo.trim() || undefined,
          subject,
          text,
        });
        sent += 1;
        lead.lastOutreachAt = timestamp;
        lead.lastOutreachStatus = "sent";
        lead.outreachAttempts = Number(lead.outreachAttempts || 0) + 1;
        if (lead.status === "new") {
          lead.status = "messaged";
          lead.updatedAt = timestamp;
        }
        pushStartupDelivery(state, {
          id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
          channel: "email",
          kind: "outreach",
          status: "sent",
          leadId: lead.id,
          leadEmail: lead.email,
          subject,
          provider: `smtp:${state.outreach.smtpHost.trim()}`,
          messageId: String(info?.messageId || ""),
          error: "",
          ts: timestamp,
        });
      } catch (e: any) {
        const errorMessage = e?.message || String(e);
        failed += 1;
        lead.lastOutreachAt = timestamp;
        lead.lastOutreachStatus = "failed";
        lead.outreachAttempts = Number(lead.outreachAttempts || 0) + 1;
        pushStartupDelivery(state, {
          id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
          channel: "email",
          kind: "outreach",
          status: "failed",
          leadId: lead.id,
          leadEmail: lead.email,
          subject,
          provider: `smtp:${state.outreach.smtpHost.trim()}`,
          messageId: "",
          error: errorMessage,
          ts: timestamp,
        });
        startupLog(state, "error", `Outreach send failed to ${lead.email}: ${errorMessage}`);
      }
      if (i < eligibleLeads.length - 1 && sendGapMs > 0) {
        startupLog(state, "info", `Outreach pacing delay ${sendGapMinutes} minute(s) before next email.`);
        await new Promise((resolve) => setTimeout(resolve, sendGapMs));
      }
    }

    if (sent > 0) {
      state.stats.outreachSent += sent;
      state.campaigns = state.campaigns.map((campaign) => {
        if (campaign.channel !== "email") return campaign;
        return {
          ...campaign,
          sentCount: campaign.sentCount + sent,
          updatedAt: now,
        };
      });
    }

    const skipped = Math.max(0, state.leads.length - eligibleLeads.length);
    const checkStatus: StartupCheckStatus = failed > 0 ? (sent > 0 ? "warn" : "error") : "ok";
    const detail = `Email outreach run ${reason}: sent=${sent}, failed=${failed}, skipped=${skipped}.`;
    startupLog(state, failed > 0 ? "warn" : "info", detail);
    return { sent, failed, skipped, checkStatus, detail };
  };

  interface StartupAutoReplyRunResult {
    sent: number;
    failed: number;
    skipped: number;
    detail: string;
  }

  const runStartupAutoReply = async (
    state: StartupState,
    reason: string,
  ): Promise<StartupAutoReplyRunResult> => {
    const pendingReplies = state.repliesInbox
      .filter((reply) => reply.autoReplyStatus === "queued")
      .slice(0, 30);
    if (pendingReplies.length === 0) {
      return { sent: 0, failed: 0, skipped: 0, detail: "No queued replies for auto-reply." };
    }
    if (!state.outreach.autoReplyEnabled) {
      return { sent: 0, failed: 0, skipped: pendingReplies.length, detail: "Auto-reply is disabled." };
    }
    if (!withinStartupScheduleWindow(state)) {
      return {
        sent: 0,
        failed: 0,
        skipped: pendingReplies.length,
        detail: `Auto-reply outside schedule window (${state.schedule.dailyStart}-${state.schedule.dailyEnd}).`,
      };
    }

    const smtpPassword = await readStartupSmtpPassword();
    state.outreach.hasSmtpPassword = Boolean(smtpPassword);
    const missing: string[] = [];
    if (!state.outreach.fromEmail.trim()) missing.push("fromEmail");
    if (!state.outreach.smtpHost.trim()) missing.push("smtpHost");
    if (!Number.isFinite(state.outreach.smtpPort) || state.outreach.smtpPort <= 0) missing.push("smtpPort");
    if (!state.outreach.smtpUser.trim()) missing.push("smtpUser");
    if (!smtpPassword) missing.push("smtpPassword");
    if (missing.length > 0) {
      return {
        sent: 0,
        failed: 0,
        skipped: pendingReplies.length,
        detail: `SMTP not configured for auto-reply: ${missing.join(", ")}`,
      };
    }

    const transporter = nodemailer.createTransport({
      host: state.outreach.smtpHost.trim(),
      port: Number(state.outreach.smtpPort),
      secure: Boolean(state.outreach.smtpSecure),
      auth: {
        user: state.outreach.smtpUser.trim(),
        pass: smtpPassword,
      },
    });

    try {
      await transporter.verify();
    } catch (e: any) {
      const message = e?.message || String(e);
      startupLog(state, "error", `Auto-reply SMTP verify failed: ${message}`);
      return {
        sent: 0,
        failed: pendingReplies.length,
        skipped: 0,
        detail: `Auto-reply SMTP verify failed: ${message}`,
      };
    }

    const now = Date.now();
    const cooldownHours = Math.max(1, Number(state.outreach.autoReplyCooldownHours || 12));
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    const sendGapMinutes = Math.max(0, Number(state.outreach.minMinutesBetweenSends || 0));
    const sendGapMs = sendGapMinutes * 60 * 1000;
    const subjectTemplate = String(state.outreach.autoReplySubjectTemplate || "Re: {subject}").trim() || "Re: {subject}";
    const bodyTemplate = String(state.outreach.autoReplyTemplate || "").trim() || [
      "Hi {firstName},",
      "",
      "Thanks for your reply.",
      "",
      "I can put together a quick plan for {business}.",
      "Would Tuesday at 11:00 or Wednesday at 14:00 work for a 15-minute call?",
      "",
      "— {senderName}",
    ].join("\n");

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (let i = 0; i < pendingReplies.length; i += 1) {
      const reply = pendingReplies[i];
      const lead = state.leads.find((item) => item.id === reply.leadId) || findLeadByEmail(state, reply.leadEmail || reply.fromEmail);
      if (!lead) {
        skipped += 1;
        reply.autoReplyStatus = "skipped";
        reply.autoReplyError = "Lead not found.";
        reply.autoReplyAt = Date.now();
        continue;
      }
      if (lead.lastAutoReplyAt && now - lead.lastAutoReplyAt < cooldownMs) {
        skipped += 1;
        continue;
      }
      const vars = buildLeadTemplateVars(lead, state, {
        "{subject}": String(reply.subject || "").trim() || "your message",
        "{incomingMessage}": cleanTextSummary(reply.text || "", 800),
      });
      const subject = applyTemplateVars(subjectTemplate, vars).slice(0, 180);
      const text = applyTemplateVars(bodyTemplate, vars);
      const ts = Date.now();
      try {
        const info = await transporter.sendMail({
          from: {
            name: String(state.outreach.fromName || "NexusAI").trim() || "NexusAI",
            address: state.outreach.fromEmail.trim(),
          },
          to: normaliseEmail(reply.fromEmail) || lead.email.trim(),
          replyTo: state.outreach.replyTo.trim() || undefined,
          subject,
          text,
        });
        sent += 1;
        lead.lastAutoReplyAt = ts;
        lead.lastAutoReplyStatus = "sent";
        lead.autoReplyAttempts = Number(lead.autoReplyAttempts || 0) + 1;
        lead.updatedAt = ts;
        if (lead.status === "new" || lead.status === "messaged") lead.status = "responded";
        reply.autoReplyStatus = "sent";
        reply.autoReplyAt = ts;
        reply.autoReplyError = "";
        pushStartupDelivery(state, {
          id: `${ts}-${Math.random().toString(36).slice(2, 8)}`,
          channel: "email",
          kind: "autoreply",
          status: "sent",
          leadId: lead.id,
          leadEmail: normaliseEmail(reply.fromEmail) || lead.email,
          subject,
          provider: `smtp:${state.outreach.smtpHost.trim()}`,
          messageId: String(info?.messageId || ""),
          error: "",
          ts,
        });
      } catch (e: any) {
        const message = e?.message || String(e);
        failed += 1;
        lead.lastAutoReplyAt = ts;
        lead.lastAutoReplyStatus = "failed";
        lead.autoReplyAttempts = Number(lead.autoReplyAttempts || 0) + 1;
        lead.updatedAt = ts;
        reply.autoReplyStatus = "failed";
        reply.autoReplyAt = ts;
        reply.autoReplyError = message;
        pushStartupDelivery(state, {
          id: `${ts}-${Math.random().toString(36).slice(2, 8)}`,
          channel: "email",
          kind: "autoreply",
          status: "failed",
          leadId: lead.id,
          leadEmail: normaliseEmail(reply.fromEmail) || lead.email,
          subject,
          provider: `smtp:${state.outreach.smtpHost.trim()}`,
          messageId: "",
          error: message,
          ts,
        });
        startupLog(state, "error", `Auto-reply failed to ${reply.fromEmail || lead.email}: ${message}`);
      }
      if (i < pendingReplies.length - 1 && sendGapMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, sendGapMs));
      }
    }

    const detail = `Auto-reply run ${reason}: sent=${sent}, failed=${failed}, skipped=${skipped}.`;
    startupLog(state, failed > 0 ? "warn" : "info", detail);
    return { sent, failed, skipped, detail };
  };

  const pushLoopMemory = (state: StartupState, entry: StartupLoopMemoryEntry) => {
    state.loopMemory.unshift(entry);
    if (state.loopMemory.length > 200) state.loopMemory = state.loopMemory.slice(0, 200);
  };

  const pushCodeRun = (state: StartupState, entry: StartupCodeRunResult) => {
    state.codeRuns.unshift(entry);
    if (state.codeRuns.length > 100) state.codeRuns = state.codeRuns.slice(0, 100);
  };

  const withHumanDelay = async (state: StartupState) => {
    const min = Math.max(200, Number(state.browserAgent.humanDelayMinMs || 900));
    const max = Math.max(min, Number(state.browserAgent.humanDelayMaxMs || 2200));
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, ms));
  };

  const safeBusinessQuery = (state: StartupState): string => {
    const niche = String(state.business.niche || state.niche || "UK local trades").trim();
    return `${niche} business directory contact`;
  };

  interface StartupDiscoverySeed {
    source: string;
    listingUrl: string;
    profileHrefPattern: RegExp;
    directWebsites?: string[];
  }

  const startupDiscoverySeeds = (state: StartupState): StartupDiscoverySeed[] => {
    const niche = String(state.business.niche || state.niche || "UK local trades").toLowerCase();
    const base: StartupDiscoverySeed[] = [
      {
        source: "trustatrader-plumbers-london",
        listingUrl: "https://www.trustatrader.com/plumbers-in-london",
        profileHrefPattern: /^\/traders\/[a-z0-9-]+$/i,
        directWebsites: [
          "https://www.londonplumbingheating.uk/contact/",
          "https://www.pimlicoplumbers.com/contact/",
          "https://www.dulwich-plumber.co.uk/",
          "https://www.pulseplumbers.co.uk/contact-us/",
          "https://london-plumber.co.uk/contact-us/",
          "https://happydogplumbing.london/plumbers/emergency",
          "https://eastlondonplumber.com/contact/",
          "https://locallondonplumber.co.uk/",
          "https://www.homecureplumbers.co.uk/",
        ],
      },
      {
        source: "trustatrader-electricians-london",
        listingUrl: "https://www.trustatrader.com/electricians-in-london",
        profileHrefPattern: /^\/traders\/[a-z0-9-]+$/i,
        directWebsites: [
          "https://www.checkatrade.com/trades/smartsparks",
          "https://www.trustmark.org.uk/find-a-tradesperson",
        ],
      },
      {
        source: "trustatrader-roofers-london",
        listingUrl: "https://www.trustatrader.com/roofers-and-roofing-in-london",
        profileHrefPattern: /^\/traders\/[a-z0-9-]+$/i,
        directWebsites: [
          "https://www.mybuilder.com/roofing/roofing-contractor-tradespeople/london",
          "https://www.checkatrade.com/Search?query=roofer%20london",
        ],
      },
      {
        source: "trustatrader-builders-london",
        listingUrl: "https://www.trustatrader.com/builders-in-london",
        profileHrefPattern: /^\/traders\/[a-z0-9-]+$/i,
        directWebsites: [
          "https://www.mybuilder.com/extensions/extension-builder-tradespeople/london",
          "https://www.mybuilder.com/restoration-refurbishment/restoration-refurbishment-specialist-tradespeople/london",
        ],
      },
    ];
    if (niche.includes("plumb")) return base.filter((seed) => seed.source.includes("plumbers"));
    if (niche.includes("electric")) return base.filter((seed) => seed.source.includes("electricians"));
    if (niche.includes("roof")) return base.filter((seed) => seed.source.includes("roofers"));
    return base;
  };

  const cleanExternalUrl = (href: string): string => {
    let out = String(href || "").trim();
    if (!out) return "";
    out = out.replace(/^https?:\/\//i, "https://");
    out = out.replace(/['"<>()\s]+$/g, "");
    if (/^https:\/\/https:\/\//i.test(out)) out = out.replace(/^https:\/\/https:\/\//i, "https://");
    if (/^https:\/\/http:\/\//i.test(out)) out = out.replace(/^https:\/\/http:\/\//i, "http://");
    try {
      const u = new URL(out);
      return u.toString();
    } catch {
      return "";
    }
  };

  const normaliseContactLink = (href: string): string => {
    let out = cleanExternalUrl(href);
    if (!out) return "";
    out = out.replace(/&#038;/g, "&");
    out = out.replace(/\?+$/g, "");
    return out;
  };

  const splitAndNormaliseEmails = (emails: string[]): string[] => {
    const values = new Set<string>();
    for (const raw of emails) {
      const parts = String(raw || "")
        .split(/[;,]/)
        .map((v) => normaliseEmail(v))
        .filter(Boolean);
      for (const part of parts) {
        const clean = part
          .replace(/\?.*$/g, "")
          .replace(/&.*$/g, "")
          .replace(/[^a-z0-9._%+\-@]/gi, "");
        if (emailLooksValid(clean)) values.add(clean);
      }
    }
    return Array.from(values);
  };

  const cleanTextSummary = (value: string, max = 240): string => {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  };

  const parseAverageRating = (text: string): number | undefined => {
    const match = /(?:rating|rated|review score)[^\d]{0,20}(\d(?:\.\d)?)/i.exec(text)
      || /(\d(?:\.\d)?)\s*\/\s*5/i.exec(text);
    if (!match) return undefined;
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n < 0 || n > 5) return undefined;
    return n;
  };

  const parseReviewCount = (text: string): number | undefined => {
    const match = /(\d{1,4})\s+(?:reviews?|ratings?)/i.exec(text);
    if (!match) return undefined;
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return n;
  };

  const enrichExistingLeads = async (state: StartupState): Promise<number> => {
    const leads = state.leads
      .filter((lead) => lead.status !== "closed")
      .slice(0, 16);
    let enriched = 0;
    for (const lead of leads) {
      if (!lead.sourceUrl && !lead.website) continue;
      const targets = [lead.sourceUrl, lead.website]
        .filter(Boolean)
        .map((url) => normaliseContactLink(String(url)))
        .filter(Boolean) as string[];
      if (targets.length === 0) continue;
      const seen = new Set<string>();
      const uniqueTargets = targets.filter((url) => {
        const key = url.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      for (const target of uniqueTargets) {
        try {
          const res = await fetch(target, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
            },
            signal: AbortSignal.timeout(20000),
          });
          if (!res.ok) continue;
          const html = await res.text();
          const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "";
          const plain = html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const snippets = plain
            .split(/(?<=[.!?])\s+/)
            .filter(Boolean)
            .filter((line) => /(review|rated|testimonial|feedback|service|years|established|family-run)/i.test(line))
            .slice(0, 4);
          const summaryParts = [cleanTextSummary(title, 120), ...snippets.map((s) => cleanTextSummary(s, 120))].filter(Boolean);
          lead.reviewSummary = summaryParts.join(" | ").slice(0, 320) || lead.reviewSummary || "";
          lead.reviewSource = target;
          lead.reviewCount = parseReviewCount(plain) ?? lead.reviewCount;
          lead.avgRating = parseAverageRating(plain) ?? lead.avgRating;
          lead.companyInfo = cleanTextSummary(plain.slice(0, 1200), 320) || lead.companyInfo || "";
          lead.enrichedAt = Date.now();
          lead.updatedAt = Date.now();
          enriched += 1;
          break;
        } catch {
          // continue next target
        }
      }
    }
    if (enriched > 0) {
      startupLog(state, "info", `Lead enrichment updated ${enriched} lead profile(s).`);
    } else {
      startupLog(state, "warn", "Lead enrichment pass found no updates.");
    }
    return enriched;
  };

  const pickBusinessWebsiteFromLinks = (links: string[]): string | null => {
    const candidates = links
      .map((href) => cleanExternalUrl(href))
      .filter(Boolean)
      .filter((href) => isBusinessWebsiteLink(href));
    if (candidates.length === 0) return null;
    const byPriority = [
      /centrona/i,
      /plumb|plumber|heating|roof|electric|gas|boiler|building|trade/i,
    ];
    for (const pattern of byPriority) {
      const found = candidates.find((url) => pattern.test(url));
      if (found) return found;
    }
    return candidates[0] || null;
  };

  const excludedExternalBusinessDomains = [
    "trustatrader.com",
    "assets.trustatrader.com",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "x.com",
    "twitter.com",
    "tiktok.com",
    "youtube.com",
    "play.google.com",
    "itunes.apple.com",
    "apple.com",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
  ];

  const isBusinessWebsiteLink = (href: string): boolean => {
    try {
      const url = new URL(String(href || ""));
      if (!["http:", "https:"].includes(url.protocol)) return false;
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (excludedExternalBusinessDomains.some((blocked) => hostMatches(host, blocked))) return false;
      return true;
    } catch {
      return false;
    }
  };

  interface StartupGooglePlaceCandidate {
    name: string;
    placeId: string;
    website?: string;
    sourceUrl: string;
    phone?: string;
    address: string;
    rating?: number;
    reviewCount?: number;
  }

  const fetchGooglePlaceCandidates = async (
    state: StartupState,
    query: string,
  ): Promise<StartupGooglePlaceCandidate[]> => {
    const apiKey = await readStartupGooglePlacesKey();
    state.browserAgent.hasGooglePlacesApiKey = Boolean(apiKey);
    if (!apiKey) return [];

    const maxResults = Math.max(1, Math.min(20, Math.round(Number(state.browserAgent.googlePlacesMaxResults || 8))));
    const fetchWithPlacesV1 = async (): Promise<StartupGooglePlaceCandidate[]> => {
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "NexusAI-Startup/1.0",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.websiteUri,places.googleMapsUri,places.formattedAddress,places.rating,places.userRatingCount,places.internationalPhoneNumber,places.nationalPhoneNumber",
        },
        body: JSON.stringify({
          textQuery: query,
          maxResultCount: maxResults,
          languageCode: "en",
        }),
        signal: AbortSignal.timeout(25000),
      });
      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) {
        const message = String(data?.error?.message || `Google Places v1 search failed (${response.status}).`);
        throw new Error(message);
      }
      const places = Array.isArray(data?.places) ? data.places : [];
      const out: StartupGooglePlaceCandidate[] = [];
      for (const place of places) {
        const rawWebsite = normaliseContactLink(String(place?.websiteUri || ""));
        const website = rawWebsite && isBusinessWebsiteLink(rawWebsite) ? rawWebsite : "";
        const sourceUrl = normaliseContactLink(String(place?.googleMapsUri || website || `https://maps.google.com/?q=place_id:${String(place?.id || "")}`));
        const phone = normalisePhoneNumber(
          String(place?.internationalPhoneNumber || place?.nationalPhoneNumber || ""),
          state.calling.defaultCountryCode,
        );
        if (!website && !phoneLooksCallable(phone)) continue;
        out.push({
          name: String(place?.displayName?.text || "Business").trim(),
          placeId: String(place?.id || "").trim() || `v1-${Math.random().toString(36).slice(2, 8)}`,
          ...(website ? { website } : {}),
          sourceUrl: sourceUrl || website || `https://maps.google.com/?q=place_id:${String(place?.id || "").trim()}`,
          ...(phoneLooksCallable(phone) ? { phone } : {}),
          address: String(place?.formattedAddress || "").trim(),
          rating: Number.isFinite(Number(place?.rating)) ? Number(place.rating) : undefined,
          reviewCount: Number.isFinite(Number(place?.userRatingCount)) ? Number(place.userRatingCount) : undefined,
        });
        if (out.length >= maxResults) break;
      }
      return out;
    };

    const fetchWithPlacesLegacy = async (): Promise<StartupGooglePlaceCandidate[]> => {
      const textSearchUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
      textSearchUrl.searchParams.set("query", query);
      textSearchUrl.searchParams.set("key", apiKey);
      const textSearchResponse = await fetch(textSearchUrl.toString(), {
        headers: { "User-Agent": "NexusAI-Startup/1.0" },
        signal: AbortSignal.timeout(25000),
      });
      const textSearchData = await textSearchResponse.json().catch(() => ({} as any));
      if (!textSearchResponse.ok) {
        throw new Error(`Google Places text search failed (${textSearchResponse.status}).`);
      }
      const textStatus = String(textSearchData?.status || "UNKNOWN");
      if (textStatus !== "OK" && textStatus !== "ZERO_RESULTS") {
        throw new Error(`Google Places text search status: ${textStatus}`);
      }
      const places = Array.isArray(textSearchData?.results) ? textSearchData.results.slice(0, maxResults) : [];
      const out: StartupGooglePlaceCandidate[] = [];
      for (const place of places) {
        const placeId = String(place?.place_id || "").trim();
        if (!placeId) continue;
        const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
        detailsUrl.searchParams.set("place_id", placeId);
        detailsUrl.searchParams.set("fields", "name,website,url,formatted_address,rating,user_ratings_total,formatted_phone_number,international_phone_number");
        detailsUrl.searchParams.set("key", apiKey);
        const detailsResponse = await fetch(detailsUrl.toString(), {
          headers: { "User-Agent": "NexusAI-Startup/1.0" },
          signal: AbortSignal.timeout(20000),
        });
        const detailsData = await detailsResponse.json().catch(() => ({} as any));
        if (!detailsResponse.ok) continue;
        const detailsStatus = String(detailsData?.status || "UNKNOWN");
        if (detailsStatus !== "OK") continue;
        const result = detailsData?.result || {};
        const rawWebsite = normaliseContactLink(String(result?.website || ""));
        const website = rawWebsite && isBusinessWebsiteLink(rawWebsite) ? rawWebsite : "";
        const sourceUrl = normaliseContactLink(String(result?.url || website || `https://maps.google.com/?q=place_id:${placeId}`));
        const phone = normalisePhoneNumber(
          String(result?.international_phone_number || result?.formatted_phone_number || ""),
          state.calling.defaultCountryCode,
        );
        if (!website && !phoneLooksCallable(phone)) continue;
        out.push({
          name: String(result?.name || place?.name || "Business").trim(),
          placeId,
          ...(website ? { website } : {}),
          sourceUrl: sourceUrl || website || `https://maps.google.com/?q=place_id:${placeId}`,
          ...(phoneLooksCallable(phone) ? { phone } : {}),
          address: String(result?.formatted_address || place?.formatted_address || "").trim(),
          rating: Number.isFinite(Number(result?.rating)) ? Number(result.rating) : undefined,
          reviewCount: Number.isFinite(Number(result?.user_ratings_total)) ? Number(result.user_ratings_total) : undefined,
        });
        if (out.length >= maxResults) break;
        await new Promise((resolve) => setTimeout(resolve, 220));
      }
      return out;
    };

    let v1Error = "";
    try {
      const v1 = await fetchWithPlacesV1();
      if (v1.length > 0) return v1;
    } catch (e: any) {
      v1Error = String(e?.message || e);
    }
    try {
      return await fetchWithPlacesLegacy();
    } catch (legacyErr: any) {
      const legacyMessage = String(legacyErr?.message || legacyErr);
      throw new Error(v1Error ? `${v1Error} | ${legacyMessage}` : legacyMessage);
    }
  };

  const extractContactLinksFromHtml = (html: string, baseUrl: string): string[] => {
    const links = new Set<string>();
    const regex = /href\s*=\s*["']([^"']+)["']/gi;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(String(html || ""))) !== null) {
      const rawHref = String(match[1] || "").trim();
      if (!rawHref || rawHref.startsWith("#")) continue;
      if (!/contact|about|team|get-in-touch|quote|enquiry|enquiries/i.test(rawHref)) continue;
      try {
        const absolute = new URL(rawHref, baseUrl).toString();
        const cleaned = normaliseContactLink(absolute);
        if (cleaned && isProspectCandidateLink(cleaned)) links.add(cleaned);
      } catch {
        // ignore malformed href
      }
      if (links.size >= 6) break;
    }
    return Array.from(links);
  };

  const collectWebsiteEmails = async (websiteUrl: string): Promise<{ emails: string[]; sourceUrl: string; summary: string }> => {
    const cleanedWebsite = normaliseContactLink(websiteUrl);
    if (!cleanedWebsite) return { emails: [], sourceUrl: "", summary: "" };
    const fetchPage = async (url: string): Promise<{ html: string; finalUrl: string }> => {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`website fetch failed (${response.status})`);
      const html = await response.text();
      return { html, finalUrl: normaliseContactLink(response.url || url) || url };
    };

    const homepage = await fetchPage(cleanedWebsite);
    const homepageEmails = splitAndNormaliseEmails(extractEmailsFromText(homepage.html));
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(homepage.html)?.[1] || "";
    const plain = homepage.html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (homepageEmails.length > 0) {
      return {
        emails: homepageEmails,
        sourceUrl: homepage.finalUrl,
        summary: cleanTextSummary(`${title} ${plain.slice(0, 900)}`, 320),
      };
    }

    const contactLinks = extractContactLinksFromHtml(homepage.html, homepage.finalUrl);
    for (const link of contactLinks.slice(0, 3)) {
      try {
        const page = await fetchPage(link);
        const found = splitAndNormaliseEmails(extractEmailsFromText(page.html));
        if (found.length > 0) {
          const contactTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(page.html)?.[1] || "";
          const contactPlain = page.html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          return {
            emails: found,
            sourceUrl: page.finalUrl,
            summary: cleanTextSummary(`${contactTitle} ${contactPlain.slice(0, 900)}`, 320),
          };
        }
      } catch {
        // continue contact links
      }
    }
    return {
      emails: [],
      sourceUrl: homepage.finalUrl,
      summary: cleanTextSummary(`${title} ${plain.slice(0, 900)}`, 320),
    };
  };

  const runStartupBrowserAgent = async (
    state: StartupState,
    currentGoal: string,
  ): Promise<{ observation: string; actionTrace: Record<string, any>; status: StartupLoopStatus; }> => {
    if (!state.browserAgent.enabled) {
      return {
        observation: "Browser agent disabled by settings.",
        actionTrace: { skipped: true, reason: "disabled" },
        status: "warn",
      };
    }
    const maxActions = Math.max(5, Math.min(40, Number(state.browserAgent.maxActionsPerRun || 20)));
    const maxProspectsToVisit = Math.max(3, Math.min(8, Math.floor(maxActions / 3)));
    const query = safeBusinessQuery(state);
    const searchUrl = state.browserAgent.searchEngine === "google"
      ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
      : state.browserAgent.searchEngine === "bing"
        ? `https://www.bing.com/search?q=${encodeURIComponent(query)}`
        : `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;

    const actionTrace: Record<string, any> = {
      engine: state.browserAgent.searchEngine,
      searchUrl,
      maxActions,
      maxProspectsToVisit,
      actions: [] as any[],
      extracted: [] as string[],
      discovered: [] as Array<{ name: string; email: string; sourceUrl: string }>,
    };

    const browser = await chromium.launch({ headless: Boolean(state.browserAgent.headless) });
    try {
      const page = await browser.newPage();
      actionTrace.actions.push({ type: "open_tab", url: "about:blank", ts: Date.now() });
      await withHumanDelay(state);
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      actionTrace.actions.push({ type: "navigate", url: searchUrl, ts: Date.now() });
      await withHumanDelay(state);

      let extractedText = "";
      try {
        extractedText = await page.locator("body").innerText({ timeout: 10000 });
      } catch {
        extractedText = await page.content();
      }
      const snippets = String(extractedText || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !/cookie|accept|privacy|javascript/i.test(line))
        .slice(0, 12);
      actionTrace.extracted = snippets;
      actionTrace.actions.push({ type: "extract_visible_text", count: snippets.length, ts: Date.now() });

      const rawLinks = await page.$$eval("a", (anchors) => anchors
        .map((a) => ({ text: (a.textContent || "").trim(), href: (a as HTMLAnchorElement).href || "" }))
        .filter((a) => a.href.startsWith("http") && a.text.length > 0)
        .slice(0, 80));
      actionTrace.actions.push({ type: "extract_links", count: rawLinks.length, ts: Date.now() });

      const resolvedLinks = rawLinks.map((link) => ({
        text: link.text,
        href: resolveSearchRedirectHref(link.href),
      }));

      const seenDomains = new Set<string>();
      const candidateLinks = resolvedLinks.filter((link) => {
        if (!isProspectCandidateLink(link.href)) return false;
        const domain = pickDomain(link.href);
        if (!domain || seenDomains.has(domain)) return false;
        seenDomains.add(domain);
        return true;
      });

      const knownEmails = new Set(state.leads.map((lead) => normaliseEmail(lead.email)));
      const discoveredLeads: StartupLead[] = [];
      const seedCandidates: Array<{ text: string; href: string; source: string; businessWebsite?: string }> = [];
      const seeds = startupDiscoverySeeds(state);
      let actionsUsed = 3;

      const getCurrentPageText = async (): Promise<string> => {
        try {
          return await page.locator("body").innerText({ timeout: 10000 });
        } catch {
          return await page.content();
        }
      };

      const collectContactEmailsFromPage = async (): Promise<string[]> => {
        const body = await getCurrentPageText();
        const textEmails = extractEmailsFromText(body);
        const mailto = await page.$$eval("a[href^='mailto:']", (anchors) => anchors
          .map((a) => (a as HTMLAnchorElement).getAttribute("href") || "")
          .map((href) => href.replace(/^mailto:/i, "").split("?")[0].trim())
          .filter(Boolean));
        const combined = new Set<string>(splitAndNormaliseEmails(textEmails));
        for (const candidate of splitAndNormaliseEmails(mailto)) {
          if (emailLooksValid(candidate)) combined.add(candidate);
        }
        return Array.from(combined);
      };

      const collectLeadInsights = async (lead: StartupLead): Promise<void> => {
        try {
          const body = await getCurrentPageText();
          const reviewSnippets = String(body || "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((line) => /(review|rated|testimonials?|feedback|stars?)/i.test(line))
            .slice(0, 5);
          const title = await page.title().catch(() => "");
          const infoParts = [title, ...reviewSnippets].filter(Boolean);
          const merged = infoParts.join(" | ");
          lead.reviewSummary = cleanTextSummary(merged, 320);
          lead.reviewSource = page.url();
          lead.reviewCount = parseReviewCount(body);
          lead.avgRating = parseAverageRating(body);
          lead.companyInfo = cleanTextSummary(String(body || "").slice(0, 1200), 320);
          lead.enrichedAt = Date.now();
        } catch {
          // keep enrichment best-effort without blocking lead capture
        }
      };

      if (state.browserAgent.googlePlacesEnabled && actionsUsed < maxActions && discoveredLeads.length < maxProspectsToVisit) {
        const location = String(state.browserAgent.googlePlacesLocation || "London, UK").trim() || "London, UK";
        const placesQuery = `${String(state.business.niche || state.niche || "local trades").trim()} businesses in ${location}`;
        try {
          const places = await fetchGooglePlaceCandidates(state, placesQuery);
          actionTrace.actions.push({
            type: "google_places_search",
            query: placesQuery,
            count: places.length,
            ts: Date.now(),
          });
          for (const place of places) {
            if (actionsUsed >= maxActions || discoveredLeads.length >= maxProspectsToVisit) break;
            const domain = pickDomain(place.website || place.sourceUrl);
            if (!domain) continue;
            const placeKey = place.website ? `domain:${domain}` : `place:${place.placeId}`;
            const alreadyKnownDomain = state.leads.some((lead) => {
              if (place.website) return pickDomain(lead.website || lead.sourceUrl || "") === domain;
              return String(lead.sourceDomain || "") === placeKey;
            });
            if (alreadyKnownDomain) continue;
            let websiteData: { emails: string[]; sourceUrl: string; summary: string } = {
              emails: [],
              sourceUrl: place.website || place.sourceUrl,
              summary: "",
            };
            if (place.website && isBusinessWebsiteLink(place.website)) {
              await withHumanDelay(state);
              actionsUsed += 1;
              actionTrace.actions.push({
                type: "open_google_place_website",
                placeId: place.placeId,
                href: place.website,
                ts: Date.now(),
              });
              try {
                websiteData = await collectWebsiteEmails(place.website);
              } catch (websiteErr: any) {
                actionTrace.actions.push({
                  type: "google_place_website_error",
                  placeId: place.placeId,
                  href: place.website,
                  error: String(websiteErr?.message || websiteErr),
                  ts: Date.now(),
                });
              }
            } else {
              actionTrace.actions.push({
                type: "google_place_no_website",
                placeId: place.placeId,
                href: place.sourceUrl,
                phone: place.phone || "",
                ts: Date.now(),
              });
            }
            const freshEmail = websiteData.emails
              .map((email) => normaliseEmail(email))
              .find((email) => emailLooksValid(email) && !knownEmails.has(email));
            const placePhone = normalisePhoneNumber(String(place.phone || ""), state.calling.defaultCountryCode);
            if (!freshEmail && !phoneLooksCallable(placePhone)) {
              actionTrace.actions.push({
                type: "google_place_no_contact",
                placeId: place.placeId,
                href: place.website || place.sourceUrl,
                ts: Date.now(),
              });
              continue;
            }
            if (freshEmail) knownEmails.add(freshEmail);
            const discovered: StartupLead = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: place.name || deriveBusinessName("", "", place.website || place.sourceUrl),
              email: freshEmail || `${pickDomain(place.sourceUrl || place.website || "business") || "unknown"}@contact.local`,
              sourceUrl: websiteData.sourceUrl || place.sourceUrl || place.website || "",
              sourceDomain: place.website ? domain : placeKey,
              ...(place.website ? { website: place.website, hasWebsite: true } : { hasWebsite: false }),
              ...(phoneLooksCallable(placePhone) ? { phone: placePhone } : {}),
              reviewSummary: cleanTextSummary(`${websiteData.summary || ""}${place.address ? ` | ${place.address}` : ""}`, 320),
              reviewSource: place.sourceUrl || place.website || "",
              reviewCount: place.reviewCount,
              avgRating: place.rating,
              companyInfo: cleanTextSummary(place.address || "", 320),
              enrichedAt: Date.now(),
              niche: String(state.business.niche || state.niche).trim(),
              status: "new",
              valueUsd: Number(state.pricingUsd.starter || 0),
              updatedAt: Date.now(),
            };
            discoveredLeads.push(discovered);
            state.leads.unshift(discovered);
            actionTrace.discovered.push({
              name: discovered.name,
              email: discovered.email,
              sourceUrl: discovered.sourceUrl || place.website || place.sourceUrl,
            });
          }
        } catch (placesErr: any) {
          actionTrace.actions.push({
            type: "google_places_error",
            query: placesQuery,
            error: String(placesErr?.message || placesErr),
            ts: Date.now(),
          });
          startupLog(state, "warn", `Google Places discovery failed: ${String(placesErr?.message || placesErr)}`);
        }
      }

      for (const seed of seeds) {
        if (actionsUsed >= maxActions || seedCandidates.length >= maxProspectsToVisit * 3) break;
        try {
          await withHumanDelay(state);
          await page.goto(seed.listingUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
          actionTrace.actions.push({ type: "open_seed_listing", source: seed.source, href: seed.listingUrl, ts: Date.now() });
          actionsUsed += 1;
          await withHumanDelay(state);
          await page.mouse.wheel(0, 420);
          actionTrace.actions.push({ type: "scroll_seed_listing", source: seed.source, deltaY: 420, ts: Date.now() });
          actionsUsed += 1;
          const profileLinks = await page.$$eval("a", (anchors) => anchors
            .map((a) => ({ text: (a.textContent || "").trim(), href: (a as HTMLAnchorElement).getAttribute("href") || "" }))
            .filter((a) => a.href.length > 0));
          for (const profile of profileLinks) {
            if (!seed.profileHrefPattern.test(profile.href)) continue;
            const absoluteHref = new URL(profile.href, seed.listingUrl).toString();
            seedCandidates.push({ text: profile.text || "Trader profile", href: absoluteHref, source: seed.source });
            if (seedCandidates.length >= maxProspectsToVisit * 3) break;
          }
        } catch (seedErr: any) {
          actionTrace.actions.push({
            type: "seed_listing_error",
            source: seed.source,
            href: seed.listingUrl,
            error: String(seedErr?.message || seedErr),
            ts: Date.now(),
          });
        }
      }

      for (const seed of seeds) {
        if (!Array.isArray(seed.directWebsites) || seed.directWebsites.length === 0) continue;
        for (const direct of seed.directWebsites) {
          if (actionsUsed >= maxActions || discoveredLeads.length >= maxProspectsToVisit) break;
          const directUrl = normaliseContactLink(direct);
          if (!directUrl || !isBusinessWebsiteLink(directUrl)) continue;
          try {
            await withHumanDelay(state);
            await page.goto(directUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
            actionTrace.actions.push({ type: "open_seed_website", source: seed.source, href: directUrl, ts: Date.now() });
            actionsUsed += 1;
            const emails = await collectContactEmailsFromPage();
            const freshEmail = emails.map(normaliseEmail).find((email) => emailLooksValid(email) && !knownEmails.has(email));
            if (!freshEmail) {
              actionTrace.actions.push({ type: "seed_website_no_email", source: seed.source, href: directUrl, ts: Date.now() });
              continue;
            }
            knownEmails.add(freshEmail);
            const title = await page.title();
            const discovered: StartupLead = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: deriveBusinessName(title, seed.source, directUrl),
              email: freshEmail,
              sourceUrl: directUrl,
              sourceDomain: pickDomain(directUrl),
              website: `https://${pickDomain(directUrl)}`,
              niche: String(state.business.niche || state.niche).trim(),
              status: "new",
              valueUsd: Number(state.pricingUsd.starter || 0),
              updatedAt: Date.now(),
            };
            await collectLeadInsights(discovered);
            discoveredLeads.push(discovered);
            state.leads.unshift(discovered);
            actionTrace.discovered.push({
              name: discovered.name,
              email: discovered.email,
              sourceUrl: discovered.sourceUrl || directUrl,
            });
          } catch (directErr: any) {
            actionTrace.actions.push({
              type: "seed_website_error",
              source: seed.source,
              href: directUrl,
              error: String(directErr?.message || directErr),
              ts: Date.now(),
            });
          }
        }
      }

      for (const seedCandidate of seedCandidates) {
        if (actionsUsed >= maxActions) break;
        if (seedCandidate.businessWebsite) continue;
        try {
          await withHumanDelay(state);
          await page.goto(seedCandidate.href, { waitUntil: "domcontentloaded", timeout: 30000 });
          actionTrace.actions.push({ type: "open_profile_page", href: seedCandidate.href, source: seedCandidate.source, ts: Date.now() });
          actionsUsed += 1;
          const outboundLinks = await page.$$eval("a[href^='http']", (anchors) => anchors
            .map((a) => (a as HTMLAnchorElement).href || "")
            .filter(Boolean)
            .slice(0, 120));
          const businessWebsite = pickBusinessWebsiteFromLinks(outboundLinks);
          if (businessWebsite) {
            seedCandidate.businessWebsite = businessWebsite;
            actionTrace.actions.push({
              type: "profile_business_site_found",
              href: seedCandidate.href,
              businessWebsite,
              source: seedCandidate.source,
              ts: Date.now(),
            });
          } else {
            actionTrace.actions.push({
              type: "profile_business_site_missing",
              href: seedCandidate.href,
              source: seedCandidate.source,
              ts: Date.now(),
            });
          }
        } catch (profileErr: any) {
          actionTrace.actions.push({
            type: "profile_open_error",
            href: seedCandidate.href,
            source: seedCandidate.source,
            error: String(profileErr?.message || profileErr),
            ts: Date.now(),
          });
        }
      }

      const allCandidates = [
        ...seedCandidates.map((entry) => ({ text: entry.text, href: entry.businessWebsite || entry.href })),
        ...candidateLinks,
      ];
      const dedupCandidates: Array<{ text: string; href: string }> = [];
      const seenCandidateHrefs = new Set<string>();
      for (const candidate of allCandidates) {
        const key = candidate.href.toLowerCase();
        if (seenCandidateHrefs.has(key)) continue;
        if (!isProspectCandidateLink(candidate.href)) continue;
        seenCandidateHrefs.add(key);
        dedupCandidates.push(candidate);
      }
      actionTrace.seedCandidates = seedCandidates.slice(0, maxActions).map((entry) => ({
        text: entry.text,
        href: entry.href,
        source: entry.source,
        businessWebsite: entry.businessWebsite || null,
      }));
      actionTrace.links = dedupCandidates.slice(0, maxActions);

      actionsUsed = Math.max(actionsUsed, actionTrace.actions.length);
      for (const candidate of dedupCandidates) {
        if (actionsUsed >= maxActions) break;
        if (discoveredLeads.length >= maxProspectsToVisit) break;

        await withHumanDelay(state);
        await page.goto(candidate.href, { waitUntil: "domcontentloaded", timeout: 30000 });
        actionTrace.actions.push({ type: "open_link", href: candidate.href, ts: Date.now() });
        actionsUsed += 1;

        await withHumanDelay(state);
        await page.mouse.wheel(0, 500);
        actionTrace.actions.push({ type: "scroll", deltaY: 500, ts: Date.now() });
        actionsUsed += 1;

        const pageTitle = await page.title();
        let emails = await collectContactEmailsFromPage();
        let sourceUrl = candidate.href;

        if (emails.length === 0 && actionsUsed < maxActions) {
          const externalLinks = await page.$$eval("a", (anchors) => anchors
            .map((a) => (a as HTMLAnchorElement).href || "")
            .filter(Boolean)
            .slice(0, 50));
          const businessSite = externalLinks.find((href) => /^https?:\/\//i.test(href));
          const preferredBusinessSite = externalLinks.find((href) => /https?:\/\//i.test(href) && !/trustatrader\.com/i.test(href));
          const nextBusinessUrl = preferredBusinessSite || businessSite;
          if (nextBusinessUrl && isBusinessWebsiteLink(nextBusinessUrl)) {
            await withHumanDelay(state);
            await page.goto(nextBusinessUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
            actionTrace.actions.push({ type: "open_business_site", href: nextBusinessUrl, ts: Date.now() });
            actionsUsed += 1;
            emails = await collectContactEmailsFromPage();
            sourceUrl = nextBusinessUrl;
          }
        }

        if (emails.length === 0 && actionsUsed < maxActions) {
          const contactLinks = await page.$$eval("a", (anchors) => anchors
            .map((a) => (a as HTMLAnchorElement).href || "")
            .filter(Boolean)
            .filter((href) => /contact|about|team|get-in-touch|quote|enquiry|enquiries/i.test(href))
            .slice(0, 3));
          for (const contactHref of contactLinks) {
            if (actionsUsed >= maxActions) break;
            if (!isProspectCandidateLink(contactHref)) continue;
            await withHumanDelay(state);
            await page.goto(contactHref, { waitUntil: "domcontentloaded", timeout: 30000 });
            actionTrace.actions.push({ type: "open_contact", href: contactHref, ts: Date.now() });
            actionsUsed += 1;
            emails = await collectContactEmailsFromPage();
            sourceUrl = contactHref;
            if (emails.length > 0) break;
          }
        }

        const freshEmail = emails.map(normaliseEmail).find((email) => emailLooksValid(email) && !knownEmails.has(email));
        if (!freshEmail) {
          actionTrace.actions.push({ type: "no_email_found", href: candidate.href, ts: Date.now() });
          continue;
        }

        knownEmails.add(freshEmail);
        const discovered: StartupLead = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: deriveBusinessName(pageTitle, candidate.text, candidate.href),
          email: freshEmail,
          sourceUrl,
          sourceDomain: pickDomain(sourceUrl),
          website: `https://${pickDomain(sourceUrl)}`,
          niche: String(state.business.niche || state.niche).trim(),
          status: "new",
          valueUsd: Number(state.pricingUsd.starter || 0),
          updatedAt: Date.now(),
        };
        await collectLeadInsights(discovered);
        discoveredLeads.push(discovered);
        state.leads.unshift(discovered);
        actionTrace.discovered.push({
          name: discovered.name,
          email: discovered.email,
          sourceUrl: discovered.sourceUrl || candidate.href,
        });
      }

      state.browserAgent.lastRunAt = Date.now();
      state.browserAgent.lastSummary = `Browser research completed for "${query}" with ${dedupCandidates.length} candidate links and ${discoveredLeads.length} real leads.`;
      state.browserAgent.lastError = "";
      if (discoveredLeads.length > 0) {
        startupLog(state, "info", `Browser agent captured ${discoveredLeads.length} new leads with contact emails.`);
      } else {
        startupLog(state, "warn", "Browser agent completed but did not capture new contact emails.");
      }
      return {
        observation: `Captured ${snippets.length} text snippets, ${dedupCandidates.length} candidate links, and ${discoveredLeads.length} real leads with emails.`,
        actionTrace,
        status: discoveredLeads.length > 0 ? "ok" : "warn",
      };
    } catch (e: any) {
      const message = e?.message || String(e);
      state.browserAgent.lastRunAt = Date.now();
      state.browserAgent.lastError = message;
      state.browserAgent.lastSummary = "Browser agent run failed.";
      return {
        observation: `Browser run failed: ${message}`,
        actionTrace,
        status: "error",
      };
    } finally {
      await browser.close().catch(() => {});
    }
  };

  const escapeInlineCommand = (code: string): string => {
    return String(code || "")
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replace(/\r?\n/g, "; ");
  };

  const runStartupCodeTask = async (
    state: StartupState,
    code: string,
    language: StartupCodeLanguage,
  ): Promise<StartupCodeRunResult> => {
    const start = Date.now();
    const escaped = escapeInlineCommand(code);
    const command = language === "python"
      ? `python -c "${escaped}"`
      : language === "javascript"
        ? `node -e "${escaped}"`
        : `powershell -NoProfile -Command "${escaped}"`;
    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 60000, maxBuffer: 1024 * 1024 });
      const out: StartupCodeRunResult = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        language,
        command,
        exitCode: 0,
        stdout: String(stdout || "").slice(0, 6000),
        stderr: String(stderr || "").slice(0, 6000),
        durationMs: Date.now() - start,
      };
      pushCodeRun(state, out);
      return out;
    } catch (e: any) {
      const out: StartupCodeRunResult = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        language,
        command,
        exitCode: typeof e?.code === "number" ? e.code : 1,
        stdout: String(e?.stdout || "").slice(0, 6000),
        stderr: String(e?.stderr || e?.message || "").slice(0, 6000),
        durationMs: Date.now() - start,
      };
      pushCodeRun(state, out);
      return out;
    }
  };

  const callFallbackLeadIdsFromState = (state: StartupState): string[] => {
    if (!state.calling.fallbackToEmailWhenNoPhone) return [];
    const defaultCountryCode = String(state.calling.defaultCountryCode || "GB").trim().toUpperCase() || "GB";
    const out = new Set<string>();
    for (const lead of state.leads) {
      if (lead.status === "closed") continue;
      const noWebsite = lead.hasWebsite === false || !String(lead.website || "").trim();
      if (!noWebsite) continue;
      if (!emailLooksValid(lead.email)) continue;
      const phone = normalisePhoneNumber(String(lead.phone || ""), defaultCountryCode);
      if (!phoneLooksCallable(phone)) out.add(lead.id);
    }
    return Array.from(out);
  };

  const runStartupCoreLoop = async (
    state: StartupState,
    reason: string,
    parsedPlan: StartupAutopilotParsedPlan,
  ): Promise<{ entry: StartupLoopMemoryEntry; codeRun: StartupCodeRunResult; }> => {
    const currentGoal = `Reach £${state.business.monthlyTargetGbp}/month in ${state.business.niche} via ${state.business.offerName}.`;
    const plan = parsedPlan.actions[0] || "Research 5 qualified leads and prepare personalized outreach.";
      const action = `Run browser research + trigger call-first outreach for current lead queue (${reason}).`;
    const expectedResult = "New qualified leads added and at least one outreach batch prepared/sent.";
    const browser = await runStartupBrowserAgent(state, currentGoal);
    const codeRun = await runStartupCodeTask(
      state,
      `console.log(JSON.stringify({timestamp: Date.now(), reason: ${JSON.stringify(reason)}, goal: ${JSON.stringify(currentGoal)}}));`,
      "javascript",
    );
    const improvement = browser.status === "ok"
      ? "Prioritize businesses with clear contact pages and existing ad spend signals."
      : "Reduce max actions and switch search engine if failures continue.";
    const entry: StartupLoopMemoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      currentGoal,
      plan,
      action,
      expectedResult,
      observation: browser.observation,
      improvement,
      status: browser.status,
      browserAction: browser.actionTrace,
    };
    pushLoopMemory(state, entry);
    startupLog(state, browser.status === "ok" ? "info" : "warn", `Core loop ${browser.status}: ${browser.observation}`);
    return { entry, codeRun };
  };

  const runStartupAutopilot = async (reason: string): Promise<{ state: StartupState; provider: "ollama" | "gemini" | "none"; plan: string; parsed: StartupAutopilotParsedPlan; }> => {
    const state = await safeReadStartupState();
    const now = Date.now();
    if (!state.autopilot.enabled) {
      state.autopilot.lastRunAt = now;
      state.autopilot.lastProvider = "none";
      state.autopilot.lastSummary = "Autopilot disabled.";
      startupLog(state, "warn", `Autopilot skipped (${reason}) because it is disabled.`);
      await saveStartupState(state);
      return {
        state,
        provider: "none",
        plan: "",
        parsed: { summary: "Autopilot disabled.", actions: [], outreachTemplates: [], leadIdeas: [] },
      };
    }

    const prompt = createStartupAutopilotPrompt(state);
    const geminiKey = await readStartupGeminiKey();
    state.ai.hasGeminiKey = Boolean(geminiKey);
    let provider: "ollama" | "gemini" | "fallback" | "none" = "none";
    let planText = "";
    let lastErr = "";

    const tryLocalFirst = state.ai.preferLocal;
    const localModel = state.ai.localModel || "mdq100/Gemma3-Instruct-Abliterated:12b";
    const geminiModel = state.ai.geminiModel || "gemini-2.0-flash";

    if (tryLocalFirst) {
      try {
        planText = await callOllamaStartupPlan(localModel, prompt);
        provider = "ollama";
      } catch (e: any) {
        lastErr = e?.message || String(e);
      }
      if (!planText && state.ai.useGeminiFallback && geminiKey) {
        try {
          planText = await callGeminiStartupPlan(geminiModel, prompt, geminiKey);
          provider = "gemini";
        } catch (e: any) {
          lastErr = `${lastErr ? `${lastErr} | ` : ""}${e?.message || String(e)}`;
        }
      }
    } else {
      if (geminiKey) {
        try {
          planText = await callGeminiStartupPlan(geminiModel, prompt, geminiKey);
          provider = "gemini";
        } catch (e: any) {
          lastErr = e?.message || String(e);
        }
      }
      if (!planText) {
        try {
          planText = await callOllamaStartupPlan(localModel, prompt);
          provider = "ollama";
        } catch (e: any) {
          lastErr = `${lastErr ? `${lastErr} | ` : ""}${e?.message || String(e)}`;
        }
      }
    }

    if (!planText) {
      provider = "fallback";
      planText = JSON.stringify({
        summary: "AI providers unavailable. Executing deterministic revenue plan.",
        actions: [
          "Run browser lead discovery for UK local trades and capture contact emails from business/contact pages.",
          "Prioritize fresh leads with business domains and trigger outreach immediately.",
          "Mark replied leads as responded/qualified and propose call booking slots.",
        ],
        outreachTemplates: [
          "Subject: Quick lead-gen idea for {business}\nHi {firstName},\n\nI run {offer} for {niche} teams. We help generate and follow up with new enquiries without adding admin overhead.\n\nIf helpful, I can send a short 3-step growth plan tailored to {business}.\n\n— NexusAI",
        ],
        leadIdeas: [],
      });
      state.autopilot.totalErrors += 1;
      state.autopilot.lastError = lastErr || "Autopilot provider failed; fallback plan used.";
      state.autopilot.lastRunAt = now;
      state.autopilot.lastProvider = "fallback";
      state.autopilot.lastSummary = "Autopilot fallback plan generated.";
      startupLog(state, "warn", `Autopilot provider failure (${reason}). Continuing with fallback plan. ${state.autopilot.lastError}`);
    }

    const parsed = parseStartupAutopilotJson(planText);
    const leadIdeas = Array.isArray(parsed.leadIdeas) ? parsed.leadIdeas.slice(0, 5) : [];
    if (state.autopilot.autoGenerateLeads && leadIdeas.length > 0) {
      startupLog(state, "info", `Autopilot generated ${leadIdeas.length} lead ideas. Browser validation required before intake.`);
    }

    if (parsed.actions.length > 0) {
      state.tasks = parsed.actions.slice(0, 8).map((a, idx) => ({
        id: `auto-${idx + 1}`,
        title: `Autopilot action ${idx + 1}`,
        status: "running",
        detail: a,
        updatedAt: now,
      }));
    }

    state.campaigns = state.campaigns.map((c) => ({
      ...c,
      active: true,
      updatedAt: now,
    }));

    state.autopilot.lastRunAt = now;
    state.autopilot.lastProvider = provider;
    state.autopilot.lastSummary = parsed.summary || "Autopilot run completed.";
    state.autopilot.lastPlan = planText.slice(0, 6000);
    state.autopilot.totalRuns += 1;
    state.autopilot.lastError = "";
    startupLog(state, "info", `Autopilot run completed (${reason}) using ${provider}.`);

    await saveStartupState(state);
    return { state, provider, plan: planText, parsed };
  };

  const runStartupAudit = async (reason: string, options?: { skipAutopilot?: boolean }): Promise<StartupState> => {
    const state = await safeReadStartupState();
    const now = Date.now();
    state.lastAuditAt = now;
    state.nextRunAt = now + Math.max(1, state.automationIntervalMinutes) * 60 * 1000;

    // Check 1: Local server health
    let serverOk = false;
    try {
      const r = await fetch(`http://127.0.0.1:${actualPort}/api/health`, { signal: AbortSignal.timeout(3000) });
      serverOk = r.ok;
    } catch {}
    upsertCheck(state.checks, {
      id: "server-health",
      label: "Server health",
      status: serverOk ? "ok" : "error",
      detail: serverOk ? `NexusAI server healthy on port ${actualPort}` : "Server health check failed",
      checkedAt: now,
    });

    // Check 2: Cloudflare domain health
    let cfOk = false;
    try {
      const r = await fetch("https://nexusais.app/api/health", { signal: AbortSignal.timeout(6000) });
      cfOk = r.ok;
    } catch {}
    upsertCheck(state.checks, {
      id: "cloudflare-health",
      label: "Cloudflare domain",
      status: cfOk ? "ok" : "warn",
      detail: cfOk ? "nexusais.app reachable" : "Domain check failed — verify tunnel/service",
      checkedAt: now,
    });

    // Check 3: Offer readiness
    const pricingReady = state.pricingUsd.starter > 0 && state.pricingUsd.growth >= state.pricingUsd.starter;
    upsertCheck(state.checks, {
      id: "offer-readiness",
      label: "Offer readiness",
      status: pricingReady ? "ok" : "error",
      detail: pricingReady
        ? `${state.offerName} configured (${state.pricingUsd.starter}/${state.pricingUsd.growth}/${state.pricingUsd.scale} USD)`
        : "Pricing is not configured correctly",
      checkedAt: now,
    });

    // Check 4: Lead flow
    const leadCount = state.leads.length;
    const leadStatus: StartupCheckStatus = leadCount >= 10 ? "ok" : leadCount >= 1 ? "warn" : "error";
    upsertCheck(state.checks, {
      id: "lead-flow",
      label: "Lead pipeline",
      status: leadStatus,
      detail: leadCount === 0 ? "No leads yet — add first prospects" : `${leadCount} leads in pipeline`,
      checkedAt: now,
    });

    // Auto-progress tasks based on checks
    state.tasks = state.tasks.map((task) => {
      if (task.id === "setup-offer" && pricingReady) return { ...task, status: "done", detail: "Offer + pricing configured.", updatedAt: now };
      if (task.id === "setup-leadlist" && leadCount > 0) return { ...task, status: "done", detail: `Lead list has ${leadCount} entries.`, updatedAt: now };
      if (task.status === "queued") return { ...task, status: "running", updatedAt: now };
      return task;
    });

    if (!options?.skipAutopilot) {
      try {
        const ap = await runStartupAutopilot(`audit:${reason}`);
        state.autopilot = ap.state.autopilot;
        state.ai = ap.state.ai;
        state.leads = ap.state.leads;
        state.tasks = ap.state.tasks;
        state.campaigns = ap.state.campaigns;
        state.stats = ap.state.stats;
        state.business = ap.state.business;
        state.browserAgent = ap.state.browserAgent;
        state.loopMemory = ap.state.loopMemory;
        state.codeRuns = ap.state.codeRuns;
        state.deliveries = ap.state.deliveries;
        state.outreach = ap.state.outreach;
        state.logs = ap.state.logs;

        const loop = await runStartupCoreLoop(state, reason, ap.parsed);
        await enrichExistingLeads(state);
        const autoReply = await runStartupAutoReply(state, reason);
        const callResult = await runStartupCallDelivery(state, reason);
        const fallbackLeadIds = callResult.fallbackCandidates.length > 0
          ? callResult.fallbackCandidates
          : callFallbackLeadIdsFromState(state);
        upsertCheck(state.checks, {
          id: "call-delivery",
          label: "Call delivery",
          status: callResult.checkStatus,
          detail: callResult.detail,
          checkedAt: Date.now(),
        });
        if (fallbackLeadIds.length > 0) {
          const fallbackEmail = await runStartupOutreachDelivery(state, ap.parsed.outreachTemplates, `${reason}:email-fallback`, {
            leadIds: fallbackLeadIds,
          });
          upsertCheck(state.checks, {
            id: "outreach-delivery",
            label: "Outreach delivery",
            status: fallbackEmail.checkStatus,
            detail: `${fallbackEmail.detail} (call fallback)`,
            checkedAt: Date.now(),
          });
        }
        state.tasks = state.tasks.map((task) => {
          if (task.id !== "setup-followup") return task;
          return {
            ...task,
            status: loop.entry.status === "ok" ? "done" : "running",
            detail: `Core loop: ${loop.entry.currentGoal}. Auto-reply sent ${autoReply.sent}, failed ${autoReply.failed}.`,
            updatedAt: Date.now(),
          };
        });

        const outreachResult = ap.provider === "none"
          ? {
              sent: 0,
              failed: 0,
              skipped: state.leads.length,
              checkStatus: "warn" as StartupCheckStatus,
              detail: "Autopilot is disabled; outreach run skipped.",
            }
          : await runStartupOutreachDelivery(state, ap.parsed.outreachTemplates, reason, {
              leadIds: fallbackLeadIds.length > 0 ? fallbackLeadIds : undefined,
            });
        upsertCheck(state.checks, {
          id: "outreach-delivery",
          label: "Outreach delivery",
          status: outreachResult.checkStatus,
          detail: outreachResult.detail,
          checkedAt: Date.now(),
        });
        if (outreachResult.sent > 0) {
          state.tasks = state.tasks.map((task) => {
            if (task.id !== "setup-outreach") return task;
            return {
              ...task,
              status: "done",
              detail: `Live outreach active. Last run sent ${outreachResult.sent} email(s).`,
              updatedAt: Date.now(),
            };
          });
        }
      } catch (e: any) {
        startupLog(state, "warn", `Autopilot skipped during audit (${reason}): ${e?.message || e}`);
        upsertCheck(state.checks, {
          id: "outreach-delivery",
          label: "Outreach delivery",
          status: "warn",
          detail: "Autopilot failed; outreach run skipped.",
          checkedAt: Date.now(),
        });
      }
    }

    startupLog(state, "info", `Automation audit completed (${reason}).`);
    await saveStartupState(state);
    return state;
  };

  const runStartupAuditGuarded = async (
    reason: string,
    options?: { skipAutopilot?: boolean; force?: boolean },
  ): Promise<StartupState> => {
    if (startupAuditInFlight && !options?.force) {
      return startupAuditInFlight;
    }
    startupAuditInFlightReason = reason;
    startupAuditLastStartedAt = Date.now();
    startupAuditLastError = "";
    startupAuditInFlight = runStartupAudit(reason, options)
      .then((state) => {
        startupAuditLastFinishedAt = Date.now();
        startupAuditLastError = "";
        return state;
      })
      .catch((error: any) => {
        startupAuditLastFinishedAt = Date.now();
        startupAuditLastError = String(error?.message || error || "Startup audit failed");
        throw error;
      })
      .finally(() => {
        startupAuditInFlight = null;
        startupAuditInFlightReason = null;
      });
    return startupAuditInFlight;
  };

  const ensureStartupLoop = () => {
    if (startupLoopTimer) clearInterval(startupLoopTimer);
    startupLoopTimer = setInterval(async () => {
      try {
        const state = await safeReadStartupState();
        if (!state.autoLoopEnabled) return;
        if (state.nextRunAt && Date.now() < state.nextRunAt) return;
        await runStartupAuditGuarded("timer");
      } catch (e: any) {
        console.error("[startup] periodic audit failed:", e?.message || e);
      }
    }, 60 * 1000);
  };

  const startupAppPath = path.join(__dirname, "public", "startup.html");
  const startupMobilePath = path.join(__dirname, "public", "startup-mobile.html");
  const startupResultsPath = path.join(__dirname, "public", "startup-results.html");

  app.get("/startup", (_req, res) => {
    res.sendFile(startupAppPath);
  });
  app.get("/startup/mobile", (_req, res) => {
    res.sendFile(startupMobilePath);
  });
  app.get("/startup/results", (_req, res) => {
    res.sendFile(startupResultsPath);
  });

  app.get("/api/startup/state", async (_req, res) => {
    try {
      const state = await safeReadStartupState();
      res.json(state);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/state", async (req, res) => {
    try {
      const current = await safeReadStartupState();
      const patch = req.body || {};
      if (patch?.browserAgent && Object.prototype.hasOwnProperty.call(patch.browserAgent, "googlePlacesApiKey")) {
        await writeStartupGooglePlacesKey(String(patch.browserAgent.googlePlacesApiKey || ""));
      }
      const next: StartupState = normaliseStartupState({
        ...current,
        ...patch,
        business: { ...current.business, ...(patch.business || {}) },
        browserAgent: { ...current.browserAgent, ...(patch.browserAgent || {}) },
        pricingUsd: { ...current.pricingUsd, ...(patch.pricingUsd || {}) },
        channels: { ...current.channels, ...(patch.channels || {}) },
        schedule: { ...current.schedule, ...(patch.schedule || {}) },
        outreach: { ...current.outreach, ...(patch.outreach || {}) },
        calling: { ...current.calling, ...(patch.calling || {}) },
        ai: { ...current.ai, ...(patch.ai || {}) },
        autopilot: { ...current.autopilot, ...(patch.autopilot || {}) },
      });
      if (typeof next.automationIntervalMinutes !== "number" || next.automationIntervalMinutes < 1) {
        next.automationIntervalMinutes = 10;
      }
      if (typeof next.outreach.batchSizePerRun !== "number" || !Number.isFinite(next.outreach.batchSizePerRun)) {
        next.outreach.batchSizePerRun = 5;
      }
      next.outreach.batchSizePerRun = Math.max(1, Math.min(50, Math.round(next.outreach.batchSizePerRun)));
      if (typeof next.outreach.minHoursBetweenMessages !== "number" || !Number.isFinite(next.outreach.minHoursBetweenMessages)) {
        next.outreach.minHoursBetweenMessages = 24;
      }
      next.outreach.minHoursBetweenMessages = Math.max(1, Math.min(720, Math.round(next.outreach.minHoursBetweenMessages)));
      if (typeof next.outreach.autoReplyEnabled !== "boolean") {
        next.outreach.autoReplyEnabled = true;
      }
      if (typeof next.outreach.autoReplyCooldownHours !== "number" || !Number.isFinite(next.outreach.autoReplyCooldownHours)) {
        next.outreach.autoReplyCooldownHours = 12;
      }
      next.outreach.autoReplyCooldownHours = Math.max(1, Math.min(168, Math.round(next.outreach.autoReplyCooldownHours)));
      next.outreach.autoReplySubjectTemplate = String(next.outreach.autoReplySubjectTemplate || "Re: {subject}").trim() || "Re: {subject}";
      next.outreach.autoReplyTemplate = String(next.outreach.autoReplyTemplate || "").trim() || createStartupState().outreach.autoReplyTemplate;
      if (typeof next.outreach.minMinutesBetweenSends !== "number" || !Number.isFinite(next.outreach.minMinutesBetweenSends)) {
        next.outreach.minMinutesBetweenSends = 2;
      }
      next.outreach.minMinutesBetweenSends = Math.max(0, Math.min(60, Math.round(next.outreach.minMinutesBetweenSends)));
      if (typeof next.outreach.smtpPort !== "number" || !Number.isFinite(next.outreach.smtpPort)) {
        next.outreach.smtpPort = 587;
      }
      next.outreach.smtpPort = Math.max(1, Math.min(65535, Math.round(next.outreach.smtpPort)));
      if (!Number.isFinite(next.browserAgent.maxActionsPerRun)) next.browserAgent.maxActionsPerRun = 20;
      next.browserAgent.maxActionsPerRun = Math.max(5, Math.min(40, Math.round(next.browserAgent.maxActionsPerRun)));
      if (!Number.isFinite(next.browserAgent.humanDelayMinMs)) next.browserAgent.humanDelayMinMs = 900;
      if (!Number.isFinite(next.browserAgent.humanDelayMaxMs)) next.browserAgent.humanDelayMaxMs = 2200;
      next.browserAgent.humanDelayMinMs = Math.max(200, Math.min(8000, Math.round(next.browserAgent.humanDelayMinMs)));
      next.browserAgent.humanDelayMaxMs = Math.max(next.browserAgent.humanDelayMinMs, Math.min(12000, Math.round(next.browserAgent.humanDelayMaxMs)));
      if (typeof next.browserAgent.googlePlacesEnabled !== "boolean") next.browserAgent.googlePlacesEnabled = false;
      if (!Number.isFinite(next.browserAgent.googlePlacesMaxResults)) next.browserAgent.googlePlacesMaxResults = 8;
      next.browserAgent.googlePlacesMaxResults = Math.max(1, Math.min(20, Math.round(next.browserAgent.googlePlacesMaxResults)));
      next.browserAgent.googlePlacesLocation = String(next.browserAgent.googlePlacesLocation || "London, UK").trim() || "London, UK";
      const googlePlacesApiKey = await readStartupGooglePlacesKey();
      next.browserAgent.hasGooglePlacesApiKey = Boolean(googlePlacesApiKey);
      if (Object.prototype.hasOwnProperty.call(next.browserAgent as any, "googlePlacesApiKey")) {
        delete (next.browserAgent as any).googlePlacesApiKey;
      }
      if (typeof next.calling.enabled !== "boolean") next.calling.enabled = true;
      next.calling.vapiAssistantId = String(next.calling.vapiAssistantId || "").trim();
      next.calling.vapiPhoneNumberId = String(next.calling.vapiPhoneNumberId || "").trim();
      next.calling.defaultCountryCode = String(next.calling.defaultCountryCode || "GB").trim().toUpperCase() || "GB";
      if (!Number.isFinite(next.calling.batchSizePerRun)) next.calling.batchSizePerRun = 5;
      next.calling.batchSizePerRun = Math.max(1, Math.min(50, Math.round(next.calling.batchSizePerRun)));
      if (!Number.isFinite(next.calling.minHoursBetweenCalls)) next.calling.minHoursBetweenCalls = 24;
      next.calling.minHoursBetweenCalls = Math.max(1, Math.min(720, Math.round(next.calling.minHoursBetweenCalls)));
      if (!Number.isFinite(next.calling.minMinutesBetweenCalls)) next.calling.minMinutesBetweenCalls = 2;
      next.calling.minMinutesBetweenCalls = Math.max(0, Math.min(60, Math.round(next.calling.minMinutesBetweenCalls)));
      if (typeof next.calling.fallbackToEmailWhenNoPhone !== "boolean") next.calling.fallbackToEmailWhenNoPhone = true;
      next.calling.assistantDescription = String(next.calling.assistantDescription || "").trim() || createStartupState().calling.assistantDescription;
      next.calling.firstMessage = String(next.calling.firstMessage || "").trim() || createStartupState().calling.firstMessage;
      next.calling.systemPrompt = String(next.calling.systemPrompt || "").trim() || createStartupState().calling.systemPrompt;
      next.calling.scriptTemplate = String(next.calling.scriptTemplate || "").trim() || next.calling.systemPrompt || createStartupState().calling.scriptTemplate;
      const vapiApiKey = await readStartupVapiApiKey();
      next.calling.hasVapiApiKey = Boolean(vapiApiKey);
      if (typeof next.autopilot.enabled !== "boolean") next.autopilot.enabled = true;
      if (typeof next.autopilot.autoGenerateLeads !== "boolean") next.autopilot.autoGenerateLeads = true;
      const geminiKey = await readStartupGeminiKey();
      next.ai.hasGeminiKey = Boolean(geminiKey);
      next.outreach.hasSmtpPassword = Boolean(await readStartupSmtpPassword());
      next.calling.hasVapiApiKey = Boolean(await readStartupVapiApiKey());
      startupLog(next, "info", "Startup settings updated.");
      await saveStartupState(next);
      ensureStartupLoop();
      res.json({ ok: true, state: next });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/autopilot/config", async (req, res) => {
    try {
      const state = await safeReadStartupState();
      const body = req.body || {};
      state.autopilot.enabled = typeof body.enabled === "boolean" ? body.enabled : state.autopilot.enabled;
      state.autopilot.autoGenerateLeads = typeof body.autoGenerateLeads === "boolean" ? body.autoGenerateLeads : state.autopilot.autoGenerateLeads;
      state.ai.preferLocal = typeof body.preferLocal === "boolean" ? body.preferLocal : state.ai.preferLocal;
      state.ai.useGeminiFallback = typeof body.useGeminiFallback === "boolean" ? body.useGeminiFallback : state.ai.useGeminiFallback;
      if (body.localModel) state.ai.localModel = String(body.localModel);
      if (body.geminiModel) state.ai.geminiModel = String(body.geminiModel);
      if (body.geminiApiKey !== undefined) await writeStartupGeminiKey(String(body.geminiApiKey || ""));
      if (body.smtpPassword !== undefined) await writeStartupSmtpPassword(String(body.smtpPassword || ""));
      if (body.vapiApiKey !== undefined) await writeStartupVapiApiKey(String(body.vapiApiKey || ""));
      state.ai.hasGeminiKey = Boolean(await readStartupGeminiKey());
      state.outreach.hasSmtpPassword = Boolean(await readStartupSmtpPassword());
      state.calling.hasVapiApiKey = Boolean(await readStartupVapiApiKey());
      startupLog(state, "info", "Startup autopilot config updated.");
      await saveStartupState(state);
      res.json({ ok: true, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/outreach/config", async (req, res) => {
    try {
      const state = await safeReadStartupState();
      const body = req.body || {};
      state.outreach.enabled = typeof body.enabled === "boolean" ? body.enabled : state.outreach.enabled;
      if (body.fromName !== undefined) state.outreach.fromName = String(body.fromName || "").trim();
      if (body.fromEmail !== undefined) state.outreach.fromEmail = String(body.fromEmail || "").trim();
      if (body.replyTo !== undefined) state.outreach.replyTo = String(body.replyTo || "").trim();
      if (body.smtpHost !== undefined) state.outreach.smtpHost = String(body.smtpHost || "").trim();
      if (body.smtpPort !== undefined) {
        const port = Number(body.smtpPort);
        if (!Number.isFinite(port) || port <= 0 || port > 65535) {
          return res.status(400).json({ error: "smtpPort must be between 1 and 65535" });
        }
        state.outreach.smtpPort = Math.round(port);
      }
      if (body.smtpSecure !== undefined) state.outreach.smtpSecure = Boolean(body.smtpSecure);
      if (body.smtpUser !== undefined) state.outreach.smtpUser = String(body.smtpUser || "").trim();
      if (body.batchSizePerRun !== undefined) {
        const batch = Number(body.batchSizePerRun);
        if (!Number.isFinite(batch) || batch < 1 || batch > 50) {
          return res.status(400).json({ error: "batchSizePerRun must be between 1 and 50" });
        }
        state.outreach.batchSizePerRun = Math.round(batch);
      }
      if (body.minMinutesBetweenSends === undefined && !Number.isFinite(state.outreach.minMinutesBetweenSends as any)) {
        state.outreach.minMinutesBetweenSends = 2;
      }
      if (body.minHoursBetweenMessages !== undefined) {
        const hours = Number(body.minHoursBetweenMessages);
        if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
          return res.status(400).json({ error: "minHoursBetweenMessages must be between 1 and 720" });
        }
        state.outreach.minHoursBetweenMessages = Math.round(hours);
      }
      if (body.minMinutesBetweenSends !== undefined) {
        const minutes = Number(body.minMinutesBetweenSends);
        if (!Number.isFinite(minutes) || minutes < 0 || minutes > 60) {
          return res.status(400).json({ error: "minMinutesBetweenSends must be between 0 and 60" });
        }
        state.outreach.minMinutesBetweenSends = Math.round(minutes);
      }
      if (body.subjectTemplate !== undefined) state.outreach.subjectTemplate = String(body.subjectTemplate || "").trim();
      if (body.autoReplyEnabled !== undefined) state.outreach.autoReplyEnabled = Boolean(body.autoReplyEnabled);
      if (body.autoReplyCooldownHours !== undefined) {
        const cooldown = Number(body.autoReplyCooldownHours);
        if (!Number.isFinite(cooldown) || cooldown < 1 || cooldown > 168) {
          return res.status(400).json({ error: "autoReplyCooldownHours must be between 1 and 168" });
        }
        state.outreach.autoReplyCooldownHours = Math.round(cooldown);
      }
      if (body.autoReplySubjectTemplate !== undefined) {
        state.outreach.autoReplySubjectTemplate = String(body.autoReplySubjectTemplate || "").trim() || "Re: {subject}";
      }
      if (body.autoReplyTemplate !== undefined) {
        state.outreach.autoReplyTemplate = String(body.autoReplyTemplate || "").trim() || createStartupState().outreach.autoReplyTemplate;
      }
      if (body.smtpPassword !== undefined) await writeStartupSmtpPassword(String(body.smtpPassword || ""));
      state.outreach.hasSmtpPassword = Boolean(await readStartupSmtpPassword());
      startupLog(state, "info", "Startup outreach config updated.");
      await saveStartupState(state);
      res.json({ ok: true, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/calling/config", async (req, res) => {
    try {
      const state = await safeReadStartupState();
      const body = req.body || {};
      state.calling.enabled = typeof body.enabled === "boolean" ? body.enabled : state.calling.enabled;
      if (body.vapiAssistantId !== undefined) state.calling.vapiAssistantId = String(body.vapiAssistantId || "").trim();
      if (body.vapiPhoneNumberId !== undefined) state.calling.vapiPhoneNumberId = String(body.vapiPhoneNumberId || "").trim();
      if (body.defaultCountryCode !== undefined) {
        state.calling.defaultCountryCode = String(body.defaultCountryCode || "").trim().toUpperCase() || "GB";
      }
      if (body.batchSizePerRun !== undefined) {
        const batch = Number(body.batchSizePerRun);
        if (!Number.isFinite(batch) || batch < 1 || batch > 50) {
          return res.status(400).json({ error: "batchSizePerRun must be between 1 and 50" });
        }
        state.calling.batchSizePerRun = Math.round(batch);
      }
      if (body.minHoursBetweenCalls !== undefined) {
        const hours = Number(body.minHoursBetweenCalls);
        if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
          return res.status(400).json({ error: "minHoursBetweenCalls must be between 1 and 720" });
        }
        state.calling.minHoursBetweenCalls = Math.round(hours);
      }
      if (body.minMinutesBetweenCalls !== undefined) {
        const mins = Number(body.minMinutesBetweenCalls);
        if (!Number.isFinite(mins) || mins < 0 || mins > 60) {
          return res.status(400).json({ error: "minMinutesBetweenCalls must be between 0 and 60" });
        }
        state.calling.minMinutesBetweenCalls = Math.round(mins);
      }
      if (body.fallbackToEmailWhenNoPhone !== undefined) {
        state.calling.fallbackToEmailWhenNoPhone = Boolean(body.fallbackToEmailWhenNoPhone);
      }
      if (body.assistantDescription !== undefined) {
        state.calling.assistantDescription = String(body.assistantDescription || "").trim() || createStartupState().calling.assistantDescription;
      }
      if (body.firstMessage !== undefined) {
        state.calling.firstMessage = String(body.firstMessage || "").trim() || createStartupState().calling.firstMessage;
      }
      if (body.systemPrompt !== undefined) {
        state.calling.systemPrompt = String(body.systemPrompt || "").trim() || createStartupState().calling.systemPrompt;
      }
      if (body.scriptTemplate !== undefined) {
        state.calling.scriptTemplate = String(body.scriptTemplate || "").trim() || state.calling.systemPrompt || createStartupState().calling.scriptTemplate;
      }
      if (body.vapiApiKey !== undefined) await writeStartupVapiApiKey(String(body.vapiApiKey || ""));
      state.calling.hasVapiApiKey = Boolean(await readStartupVapiApiKey());
      startupLog(state, "info", "Startup calling config updated.");
      await saveStartupState(state);
      res.json({ ok: true, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/outreach/send-now", async (req, res) => {
    try {
      const state = await safeReadStartupState();
      const reason = String(req.body?.reason || "manual-send-now");
      const templates = Array.isArray(req.body?.templates)
        ? req.body.templates.map((entry: any) => String(entry || "")).filter(Boolean).slice(0, 10)
        : [];
      const leadIds = Array.isArray(req.body?.leadIds)
        ? req.body.leadIds.map((entry: any) => String(entry || "").trim()).filter(Boolean).slice(0, 200)
        : undefined;
      const result = await runStartupOutreachDelivery(state, templates, reason, { leadIds });
      upsertCheck(state.checks, {
        id: "outreach-delivery",
        label: "Outreach delivery",
        status: result.checkStatus,
        detail: result.detail,
        checkedAt: Date.now(),
      });
      await saveStartupState(state);
      res.json({ ok: true, result, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/calling/run", async (req, res) => {
    try {
      const state = await safeReadStartupState();
      const reason = String(req.body?.reason || "manual-calling-run");
      const result = await runStartupCallDelivery(state, reason);
      upsertCheck(state.checks, {
        id: "call-delivery",
        label: "Call delivery",
        status: result.checkStatus,
        detail: result.detail,
        checkedAt: Date.now(),
      });
      if (result.fallbackCandidates.length > 0) {
        const emailFallback = await runStartupOutreachDelivery(state, [], `${reason}:email-fallback`, {
          leadIds: result.fallbackCandidates,
        });
        upsertCheck(state.checks, {
          id: "outreach-delivery",
          label: "Outreach delivery",
          status: emailFallback.checkStatus,
          detail: `${emailFallback.detail} (fallback from call run)`,
          checkedAt: Date.now(),
        });
      }
      await saveStartupState(state);
      res.json({ ok: true, result, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/browser-agent/config", async (req, res) => {
    try {
      const state = await safeReadStartupState();
      const body = req.body || {};
      if (body.enabled !== undefined) state.browserAgent.enabled = Boolean(body.enabled);
      if (body.headless !== undefined) state.browserAgent.headless = Boolean(body.headless);
      if (body.searchEngine !== undefined) {
        const engine = String(body.searchEngine || "").toLowerCase();
        if (!["duckduckgo", "google", "bing"].includes(engine)) {
          return res.status(400).json({ error: "searchEngine must be duckduckgo, google, or bing" });
        }
        state.browserAgent.searchEngine = engine as "duckduckgo" | "google" | "bing";
      }
      if (body.maxActionsPerRun !== undefined) {
        const maxActions = Number(body.maxActionsPerRun);
        if (!Number.isFinite(maxActions) || maxActions < 5 || maxActions > 40) {
          return res.status(400).json({ error: "maxActionsPerRun must be between 5 and 40" });
        }
        state.browserAgent.maxActionsPerRun = Math.round(maxActions);
      }
      if (body.humanDelayMinMs !== undefined) {
        const minDelay = Number(body.humanDelayMinMs);
        if (!Number.isFinite(minDelay) || minDelay < 200 || minDelay > 8000) {
          return res.status(400).json({ error: "humanDelayMinMs must be between 200 and 8000" });
        }
        state.browserAgent.humanDelayMinMs = Math.round(minDelay);
      }
      if (body.humanDelayMaxMs !== undefined) {
        const maxDelay = Number(body.humanDelayMaxMs);
        if (!Number.isFinite(maxDelay) || maxDelay < state.browserAgent.humanDelayMinMs || maxDelay > 12000) {
          return res.status(400).json({ error: "humanDelayMaxMs must be >= humanDelayMinMs and <= 12000" });
        }
        state.browserAgent.humanDelayMaxMs = Math.round(maxDelay);
      }
      if (body.googlePlacesEnabled !== undefined) state.browserAgent.googlePlacesEnabled = Boolean(body.googlePlacesEnabled);
      if (body.googlePlacesLocation !== undefined) {
        state.browserAgent.googlePlacesLocation = String(body.googlePlacesLocation || "").trim() || "London, UK";
      }
      if (body.googlePlacesMaxResults !== undefined) {
        const maxResults = Number(body.googlePlacesMaxResults);
        if (!Number.isFinite(maxResults) || maxResults < 1 || maxResults > 20) {
          return res.status(400).json({ error: "googlePlacesMaxResults must be between 1 and 20" });
        }
        state.browserAgent.googlePlacesMaxResults = Math.round(maxResults);
      }
      if (body.googlePlacesApiKey !== undefined) {
        await writeStartupGooglePlacesKey(String(body.googlePlacesApiKey || ""));
      }
      state.browserAgent.hasGooglePlacesApiKey = Boolean(await readStartupGooglePlacesKey());
      startupLog(state, "info", "Startup browser agent config updated.");
      await saveStartupState(state);
      res.json({ ok: true, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/browser-agent/run", async (req, res) => {
    try {
      const state = await safeReadStartupState();
      const reason = String(req.body?.reason || "manual-browser-agent");
      const goal = String(req.body?.goal || `Reach £${state.business.monthlyTargetGbp}/month quickly.`);
      const parsed: StartupAutopilotParsedPlan = {
        summary: "Manual browser run",
        actions: [`${String(req.body?.plan || "Research leads and collect contact opportunities.")} Goal: ${goal}`],
        outreachTemplates: [],
        leadIdeas: [],
      };
      const out = await runStartupCoreLoop(state, reason, parsed);
      startupLog(state, "info", `Manual browser-agent run completed for goal: ${goal}`);
      await saveStartupState(state);
      res.json({ ok: true, goal, loopEntry: out.entry, codeRun: out.codeRun, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/leads/enrich", async (req, res) => {
    try {
      const state = await safeReadStartupState();
      const reason = String(req.body?.reason || "manual-lead-enrich");
      const updated = await enrichExistingLeads(state);
      startupLog(state, "info", `Lead enrichment run (${reason}) updated ${updated} lead(s).`);
      await saveStartupState(state);
      res.json({ ok: true, updated, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/replies/intake", async (req, res) => {
    try {
      const state = await safeReadStartupState();
      const body = req.body || {};
      const from = parseReplySender(String(body.from || body.fromEmail || ""));
      if (!emailLooksValid(from.email)) {
        return res.status(400).json({ error: "valid from email required" });
      }
      const subject = String(body.subject || "").trim().slice(0, 240);
      const text = String(body.text || body.message || "").trim();
      if (!text) return res.status(400).json({ error: "reply text required" });
      const lead = findLeadByEmail(state, from.email);
      if (!lead) {
        return res.status(404).json({ error: "no matching lead for reply email" });
      }

      const incomingFingerprint = normaliseReplyTextForDedup(text);
      const duplicate = state.repliesInbox.find((entry) => {
        if (normaliseEmail(entry.fromEmail) !== normaliseEmail(from.email)) return false;
        if (normaliseReplyTextForDedup(entry.text) !== incomingFingerprint) return false;
        return Math.abs(Date.now() - Number(entry.ts || 0)) < 10 * 60 * 1000;
      });
      if (duplicate) {
        return res.status(200).json({ ok: true, duplicate: true, reply: duplicate, state });
      }

      const reply: StartupInboundReply = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        fromEmail: normaliseEmail(from.email),
        fromName: from.name,
        subject,
        text,
        leadId: lead.id,
        leadEmail: lead.email,
        autoReplyStatus: "queued",
      };
      pushStartupReply(state, reply);
      if (lead.status === "new" || lead.status === "messaged") lead.status = "responded";
      lead.updatedAt = Date.now();
      state.stats.replies += 1;

      startupLog(state, "info", `Reply captured from ${reply.fromEmail}.`);
      const autoResult = await runStartupAutoReply(state, "reply-intake");
      await saveStartupState(state);
      res.json({ ok: true, reply, autoReply: autoResult, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/replies/auto-run", async (req, res) => {
    try {
      const state = await safeReadStartupState();
      const reason = String(req.body?.reason || "manual-auto-reply-run");
      const result = await runStartupAutoReply(state, reason);
      await saveStartupState(state);
      res.json({ ok: true, result, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/code/run", async (req, res) => {
    try {
      const state = await safeReadStartupState();
      const language = String(req.body?.language || "javascript").toLowerCase();
      if (!["javascript", "python", "powershell"].includes(language)) {
        return res.status(400).json({ error: "language must be javascript, python, or powershell" });
      }
      const code = String(req.body?.code || "").trim();
      if (!code) return res.status(400).json({ error: "code required" });
      const result = await runStartupCodeTask(state, code, language as StartupCodeLanguage);
      startupLog(state, result.exitCode === 0 ? "info" : "warn", `Startup code run (${language}) exit=${result.exitCode}`);
      await saveStartupState(state);
      res.json({ ok: true, result, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/autopilot/run", async (req, res) => {
    try {
      const reason = String(req.body?.reason || "manual-autopilot");
      const out = await runStartupAutopilot(reason);
      const runState = out.state;
      const callResult = await runStartupCallDelivery(runState, reason);
      upsertCheck(runState.checks, {
        id: "call-delivery",
        label: "Call delivery",
        status: callResult.checkStatus,
        detail: callResult.detail,
        checkedAt: Date.now(),
      });
      const fallbackLeadIds = callResult.fallbackCandidates.length > 0
        ? callResult.fallbackCandidates
        : callFallbackLeadIdsFromState(runState);
      if (fallbackLeadIds.length > 0) {
        startupLog(runState, "info", `Call run queued ${fallbackLeadIds.length} no-website lead(s) for email fallback.`);
      }
      const delivery = out.provider === "none"
        ? {
            sent: 0,
            failed: 0,
            skipped: runState.leads.length,
            checkStatus: "warn" as StartupCheckStatus,
            detail: "Autopilot is disabled; outreach run skipped.",
          }
        : await runStartupOutreachDelivery(runState, out.parsed.outreachTemplates, reason, {
            leadIds: fallbackLeadIds.length > 0 ? fallbackLeadIds : undefined,
          });
      upsertCheck(runState.checks, {
        id: "outreach-delivery",
        label: "Outreach delivery",
        status: delivery.checkStatus,
        detail: delivery.detail,
        checkedAt: Date.now(),
      });
      if (delivery.sent > 0) {
        runState.tasks = runState.tasks.map((task) => {
          if (task.id !== "setup-outreach") return task;
          return {
            ...task,
            status: "done",
            detail: `Live outreach active. Last run sent ${delivery.sent} email(s).`,
            updatedAt: Date.now(),
          };
        });
      }
      await saveStartupState(runState);
      const audited = await runStartupAuditGuarded(`autopilot:${reason}`, { skipAutopilot: true });
      res.json({ ok: true, provider: out.provider, plan: out.plan, state: audited });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/leads", async (req, res) => {
    try {
      const { name, email, niche, valueUsd = 0 } = req.body || {};
      if (!name || !email) return res.status(400).json({ error: "name and email required" });
      const cleanedEmail = normaliseEmail(String(email));
      if (!emailLooksValid(cleanedEmail)) {
        return res.status(400).json({ error: "valid business email required" });
      }
      const state = await safeReadStartupState();
      const phone = normalisePhoneNumber(String(req.body?.phone || ""), String(state.calling.defaultCountryCode || "GB"));
      const hasWebsite = req.body?.hasWebsite !== undefined ? Boolean(req.body.hasWebsite) : undefined;
      const duplicate = state.leads.some((lead) => normaliseEmail(lead.email) === cleanedEmail);
      if (duplicate) {
        return res.status(409).json({ error: "lead email already exists" });
      }
      const sourceUrl = String(req.body?.sourceUrl || "").trim();
      const lead: StartupLead = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: String(name).trim(),
        email: cleanedEmail,
        sourceUrl: sourceUrl || undefined,
        sourceDomain: sourceUrl ? pickDomain(sourceUrl) : undefined,
        ...(phoneLooksCallable(phone) ? { phone } : {}),
        ...(typeof hasWebsite === "boolean" ? { hasWebsite } : {}),
        niche: String(niche || state.niche).trim(),
        status: "new",
        valueUsd: Number(valueUsd) || 0,
        updatedAt: Date.now(),
      };
      state.leads.unshift(lead);
      startupLog(state, "info", `Lead added: ${lead.name} (${lead.email}).`);
      await saveStartupState(state);
      res.json({ ok: true, lead, total: state.leads.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/leads/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body || {};
      const allowed: StartupLeadStatus[] = ["new", "messaged", "responded", "qualified", "closed"];
      if (!allowed.includes(status)) return res.status(400).json({ error: "invalid status" });
      const state = await safeReadStartupState();
      const lead = state.leads.find((l) => l.id === id);
      if (!lead) return res.status(404).json({ error: "lead not found" });
      lead.status = status;
      lead.updatedAt = Date.now();
      if (status === "closed") {
        state.stats.closedDeals += 1;
        state.stats.mrrUsd += lead.valueUsd > 0 ? lead.valueUsd : state.pricingUsd.starter;
      }
      startupLog(state, "info", `Lead ${lead.name} moved to ${status}.`);
      await saveStartupState(state);
      res.json({ ok: true, lead, stats: state.stats });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/run-check", async (req, res) => {
    try {
      const reason = String(req.body?.reason || "manual");
      const state = await runStartupAuditGuarded(reason);
      res.json({ ok: true, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/startup/autopilot/status", async (_req, res) => {
    try {
      const state = await safeReadStartupState();
      res.json({
        ok: true,
        running: Boolean(startupAuditInFlight),
        inFlightReason: startupAuditInFlightReason,
        lastStartedAt: startupAuditLastStartedAt,
        lastFinishedAt: startupAuditLastFinishedAt,
        lastError: startupAuditLastError,
        nextRunAt: state.nextRunAt,
        autoLoopEnabled: state.autoLoopEnabled,
        autopilotEnabled: state.autopilot.enabled,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/startup/seed", async (_req, res) => {
    res.status(410).json({ error: "Seed/demo flow removed. Use real lead intake and browser automation." });
  });

  app.post("/api/startup/generate-plan", async (req: any, res: any) => {
    try {
      const state = await safeReadStartupState();
      const objective = String(req.body?.objective || "Generate today's high-impact revenue plan.");
      const prompt = [
        `Business: ${state.offerName}`,
        `Niche: ${state.niche}`,
        `MRR target USD: ${state.monthlyTargetUsd}`,
        `Pricing: starter ${state.pricingUsd.starter}, growth ${state.pricingUsd.growth}, scale ${state.pricingUsd.scale}`,
        `Current stats: outreach=${state.stats.outreachSent}, replies=${state.stats.replies}, calls=${state.stats.callsBooked}, closed=${state.stats.closedDeals}, mrr=${state.stats.mrrUsd}`,
        `Leads snapshot:\n${state.leads.slice(0, 10).map((l) => `- ${l.name} (${l.status}, ${l.email}, value ${l.valueUsd})`).join("\n") || "- none"}`,
        `Request: ${objective}`,
        "Output JSON with keys: dailyPlan (array), risks (array), quickWins (array), nextCheckFocus (array).",
      ].join("\n\n");

      const upstream = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemma3:12b",
          prompt,
          stream: false,
          options: { temperature: 0.3 },
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => upstream.statusText);
        return res.status(502).json({ error: `Ollama plan generation failed: ${text}` });
      }

      const data = await upstream.json() as any;
      const planText = String(data?.response || "").trim();
      startupLog(state, "info", "AI startup plan generated.");
      await saveStartupState(state);
      res.json({ ok: true, plan: planText });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Simple HTTP proxy for rendering third-party sites inside the app iframe.
  // Use: GET /api/proxy?url=https://example.com
  app.get('/api/proxy', async (req, res) => {
    const url = String(req.query.url || '');
    if (!url) return res.status(400).send('url query param required');
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) return res.status(400).send('invalid protocol');
      const upstream = await fetch(url, { headers: { 'User-Agent': 'NexusAI-Proxy/1.0' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!upstream.ok) return res.status(502).send(`Upstream error: ${upstream.status} ${upstream.statusText}`);
      const ct = upstream.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        let body = await upstream.text();
        // Remove CSP / X-Frame related meta tags so embedding isn't blocked in the iframe
        body = body.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, '');
        body = body.replace(/<meta[^>]+http-equiv=["']?x-frame-options["']?[^>]*>/gi, '');
        body = body.replace(/<meta[^>]+name=["']?referrer["']?[^>]*>/gi, '');
        body = body.replace(/<meta[^>]+http-equiv=["']?content-security-policy-report-only["']?[^>]*>/gi, '');
        // Inject a <base> tag so relative URLs resolve correctly to the original origin
        const baseTag = `<base href="${parsed.origin}/">`;
        if (/\<head[^>]*>/i.test(body)) {
          // If a base tag already exists, replace it
          if (/<base[^>]*>/i.test(body)) body = body.replace(/<base[^>]*>/i, baseTag);
          else body = body.replace(/\<head([^>]*)>/i, (m) => `${m}${baseTag}`);
        } else {
          body = baseTag + body;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(body);
      }
      // For non-HTML (images, etc.) stream bytes through
      const arrayBuf = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      res.setHeader('Content-Type', ct);
      return res.send(buffer);
    } catch (err: any) {
      console.error('[proxy] error fetching', url, err?.message || err);
      return res.status(500).send(String(err?.message || err));
    }
  });

  // ── /api/drone/params — ArduCopter parameter file for NexusAI gesture system ─
  app.get("/api/drone/params", (_req: any, res: any) => {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="nexusai_arducopter.param"');
    res.send([
      "# NexusAI ArduCopter Parameters v4.5.0",
      "ARMING_CHECK,1","FS_GCS_ENABLE,1","FS_GCS_TIMEOUT,5",
      "FS_BATT_ENABLE,1","FS_BATT_VOLTAGE,14.0","FS_THR_ENABLE,1","FS_THR_VALUE,975",
      "PILOT_TKOFF_ALT,100","LAND_SPEED,30","RTL_ALT,3000","WPNAV_SPEED,500",
      "WPNAV_ACCEL,100","ANGLE_MAX,3500","EK3_ENABLE,1","GPS_TYPE,1",
      "FLOW_ENABLE,1","RNGFND1_TYPE,1","RNGFND1_ORIENT,25","RNGFND1_MAX_CM,700",
      "MOT_SPIN_ARM,0.10","MOT_SPIN_MIN,0.15","MOT_THST_HOVER,0.35",
      "LOG_BITMASK,65535","LOG_DISARMED,0","BRD_SAFETYENABLE,0",
    ].join("\n"));
  });

  // ── /api/drone/command — latest gesture command for gesture bridge polling ───
  let _droneCommand: any = { active: false, vx: 0, vy: 0, vz: 0, yaw_rate: 0, ts: 0 };
  app.get("/api/drone/command", (_req: any, res: any) => {
    res.json(_droneCommand);
  });
  app.post("/api/drone/command", (req: any, res: any) => {
    _droneCommand = { ...req.body, ts: Date.now() };
    res.json({ ok: true });
  });

  // ── /api/strap/firmware — redirect to latest NexusStrap release ──────────────
  app.get("/api/strap/firmware", (_req: any, res: any) => {
    res.redirect('https://github.com/nexusai/nexusstrap/releases/latest/download/nexus_strap.hex');
  });

  // /api/ollama/unload evict a model from VRAM 
  // Sends keep_alive:0 to Ollama which immediately unloads the model from GPU memory.
  // Call this before switching to OpenClaw so two 9-12B models don't sit in VRAM simultaneously.
  app.post("/api/ollama/unload", async (req: any, res: any) => {
    const { model } = req.body || {};
    if (!model) return res.json({ ok: false, error: 'model required' });
    try {
      const r = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: '', keep_alive: 0 }),
        signal: AbortSignal.timeout(5000),
      });
      return res.json({ ok: r.ok, status: r.status });
    } catch (e: any) {
      return res.json({ ok: false, error: e.message });
    }
  });

  // ── Streaming AI proxy (SSE) ─────────────────────────────────────────────────
  // POST /api/ai/stream
  // Body: { model, messages, system }
  // Streams model output as text/event-stream to the client. Falls back to non-stream if upstream doesn't support streaming.
  app.post('/api/ai/stream', async (req: any, res: any) => {
    try {
      const { model, messages, system } = req.body || {};
      // Build a simple prompt from messages for Ollama compatibility
      const userPrompt = (messages || []).map((m: any) => m.content).join('\n') || '';

      let base = 'http://127.0.0.1:11434';
      try {
        const s = JSON.parse(req.headers['x-nexus-settings'] as string || '{}');
        const host = (s?.ollama?.host || '').replace(/\/$/, '');
        const port = s?.ollama?.port || '11434';
        if (host) base = /:\d+$/.test(host) ? host : `${host}:${port}`;
      } catch {}

      let effectiveSystem = String(system || '');
      if (!effectiveSystem) {
        try {
          const raw = await readFile(path.join(process.cwd(), '.nexus_settings.json'), 'utf-8');
          const parsed = JSON.parse(raw || '{}');
          effectiveSystem = String(parsed?.aiPersona || '').trim();
        } catch {}
      }

      const upstream = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: userPrompt, system: effectiveSystem, stream: true }),
      });

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => upstream.statusText || 'upstream error');
        return res.status(502).json({ error: text });
      }

      // Stream back to the client as SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const reader = (upstream.body as any)?.getReader?.();
      const decoder = new TextDecoder();
      if (!reader) {
        // Upstream didn't provide a stream; send whole response
        const txt = await upstream.text();
        res.write(`data: ${txt.replace(/\n/g,'\\n')}\n\n`);
        res.write('event: done\ndata: [DONE]\n\n');
        return res.end();
      }

      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          // Send raw chunk as SSE data events
          const safe = chunk.replace(/\n/g, '\\n');
          res.write(`data: ${safe}\n\n`);
        }
      }
      res.write('event: done\ndata: [DONE]\n\n');
      res.end();
    } catch (e: any) {
      console.error('[ai/stream] error', e?.message || e);
      try { res.status(500).json({ error: String(e) }); } catch { res.end(); }
    }
  });

  // /api/ollama/loaded list models currently loaded in VRAM 
  app.get("/api/ollama/loaded", async (_req: any, res: any) => {
    try {
      const r = await fetch('http://127.0.0.1:11434/api/ps', { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = await r.json() as any;
        return res.json({ models: d.models || [] });
      }
    } catch {}
    res.json({ models: [] });
  });

  // Provide ZIP downloads of local addon folders (if present). Example: /api/addons/download?addon=biomesh
  app.get('/api/addons/download', async (req, res) => {
    const addon = String(req.query.addon || '');
    if (!addon) return res.status(400).json({ error: 'addon query param required' });
    const addonMap: Record<string,string> = {
      biomesh: path.join(__dirname, 'biomesh'),
      drone:   path.join(__dirname, 'drone'),
      doomcase: path.join(__dirname, 'doomcase'),
      nexusstrap: path.join(__dirname, 'nexusstrap'),
      comfyui: path.join(__dirname, 'comfyui')
    };
    const folder = addonMap[addon];
    if (!folder) return res.status(404).json({ error: 'Unknown addon' });
    try {
      const { existsSync } = await import('fs');
      if (!existsSync(folder)) return res.status(404).json({ error: 'Addon files not found on disk' });
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      async function addDir(dir: string, z: any) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) { const f = z.folder(e.name); await addDir(full, f); }
          else { const contents = await readFile(full); z.file(e.name, contents); }
        }
      }
      await addDir(folder, zip);
      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${addon}.zip"`);
      return res.send(buf);
    } catch (e: any) {
      console.error('[addons] zip error', e?.message || e);
      return res.status(500).json({ error: e?.message || 'Failed to create zip' });
    }
  });
  // Wake on LAN 
  app.post("/api/wol", async (req, res) => {
    const { mac, broadcastIp = "255.255.255.255", port = 9 } = req.body;
    if (!mac) return res.status(400).json({ error: "MAC address required" });
    try {
      // Build magic packet: 6x FF then MAC repeated 16 times
      const macBytes = mac.replace(/[:\-]/g, "").match(/.{2}/g)?.map((b: string) => parseInt(b, 16));
      if (!macBytes || macBytes.length !== 6) return res.status(400).json({ error: "Invalid MAC address" });
      const buf = Buffer.alloc(102);
      buf.fill(0xff, 0, 6);
      for (let i = 0; i < 16; i++) macBytes.forEach((b: number, j: number) => buf[6 + i * 6 + j] = b);
      // Send via UDP
      const dgram = await import("dgram");
      const sock = dgram.createSocket("udp4");
      sock.once("listening", () => sock.setBroadcast(true));
      sock.send(buf, 0, buf.length, Number(port), broadcastIp, (err) => {
        sock.close();
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: `Magic packet sent to ${mac}` });
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });



  // YouTube OAuth Routes
  app.get("/api/auth/youtube/url", (req, res) => {
    const redirectUri = process.env.APP_URL 
      ? `${process.env.APP_URL}/auth/youtube/callback`
      : `http://localhost:3000/auth/youtube/callback`;

    const params = new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID || 'YOUR_CLIENT_ID',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl',
      access_type: 'offline',
      prompt: 'consent'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    res.json({ url: authUrl });
  });

  app.get("/auth/youtube/callback", (req, res) => {
    const { code } = req.query;
    // In a real app, you'd exchange the code for tokens here
    // const tokens = await exchangeCodeForTokens(code);
    
    res.send(`
      <html>
        <body style="background: #000; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
          <div style="text-align: center; padding: 2rem; border: 1px solid #333; border-radius: 1rem; background: #0a0a0a;">
            <h2 style="color: #ff0000;">YouTube Connected</h2>
            <p style="color: #888;">Authentication successful. This window will close automatically.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'youtube' }, '*');
                setTimeout(() => window.close(), 1000);
              } else {
                window.location.href = '/';
              }
            </script>
          </div>
        </body>
      </html>
    `);
  });

  // Dev Center File Management API
  app.use(express.json());

  app.get("/api/dev/files", async (req, res) => {
    try {
      const getFiles = async (dir: string): Promise<string[]> => {
        const entries = await readdir(dir, { withFileTypes: true });
        const files = await Promise.all(entries.map((entry) => {
          const res = path.resolve(dir, entry.name);
          return entry.isDirectory() ? getFiles(res) : res;
        }));
        return Array.prototype.concat(...files);
      };
      const allFiles = await getFiles(path.join(__dirname, "src"));
      const relativeFiles = allFiles.map(f => path.relative(__dirname, f));
      res.json({ files: relativeFiles });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/dev/read", async (req, res) => {
    try {
      const { filePath } = req.body;
      if (!filePath.startsWith("src/")) return res.status(403).json({ error: "Access denied" });
      const content = await readFile(path.join(__dirname, filePath), "utf-8");
      res.json({ content });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/dev/write", async (req, res) => {
    try {
      const { filePath, content } = req.body;
      if (!filePath.startsWith("src/")) return res.status(403).json({ error: "Access denied" });
      await writeFile(path.join(__dirname, filePath), content, "utf-8");
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/api/dev/restart", (req, res) => {
    res.json({ success: true, message: "Server restarting..." });
    setTimeout(() => process.exit(0), 1000);
  });

  // Server info (local IP for Remote Access panel) 
  app.get("/api/server-info", (_req, res) => {
    const nets = networkInterfaces();
    let ip = "127.0.0.1";
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === "IPv4" && !net.internal) { ip = net.address; break; }
      }
    }
    res.json({ ip, version: "4.2.0" });
  });

  // NexusLink: remote LAN proxy server 
  let nexusLinkServer: any = null;

  app.post("/api/remote/start", async (req, res) => {
    if (nexusLinkServer) return res.json({ ok: true, message: "Already running" });
    const { port = "4200", token = "", origins = "*" } = req.body || {};
    const link = express();
    link.use((req2: any, res2: any, next: any) => {
      res2.setHeader("Access-Control-Allow-Origin", origins);
      res2.setHeader("Access-Control-Allow-Headers", "Content-Type, x-nexus-token, Authorization");
      res2.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      if (req2.method === "OPTIONS") return res2.sendStatus(204);
      const t = req2.headers["x-nexus-token"] || req2.query["nexus_token"];
      if (token && t !== token) return res2.status(401).json({ error: "Unauthorized" });
      next();
    });
    link.use(express.json({ limit: "50mb" }));
    link.get("/nexuslink/health", (_r: any, res2: any) => res2.json({ ok: true, version: "4.2.0" }));

    // Gemini proxy adds server-side API key so laptop doesn't need one
    link.post("/nexuslink/gemini", async (req2: any, res2: any) => {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        const apiKey = process.env.GEMINI_API_KEY || "";
        if (!apiKey) return res2.status(500).json({ error: "GEMINI_API_KEY not set on server" });
        const ai = new GoogleGenAI({ apiKey });
        const { model = "gemini-3-flash-preview", contents, config: cfg } = req2.body;
        const response = await (ai.models as any).generateContent({ model, contents, config: cfg });
        res2.json({ text: response.text });
      } catch (e: any) { res2.status(500).json({ error: e?.message || String(e) }); }
    });

    // Ollama proxy forwards /ollama/* to local Ollama
    link.all("/ollama/*", async (req2: any, res2: any) => {
      try {
        const targetUrl = `http://127.0.0.1:11434${req2.path.replace(/^\/ollama/, "")}`;
        const fetchRes = await fetch(targetUrl, {
          method: req2.method,
          headers: { "Content-Type": "application/json" },
          body: ["GET","HEAD"].includes(req2.method) ? undefined : JSON.stringify(req2.body),
        });
        res2.status(fetchRes.status);
        res2.setHeader("Content-Type", fetchRes.headers.get("content-type") || "application/json");
        res2.end(Buffer.from(await fetchRes.arrayBuffer()));
      } catch (e: any) { res2.status(502).json({ error: `Ollama proxy: ${e?.message}` }); }
    });

    try {
      nexusLinkServer = link.listen(parseInt(port), "0.0.0.0", () => {
        console.log(`[NexusLink] Remote server on :${port}`);
      });
      res.json({ ok: true, port });
    } catch (e: any) { nexusLinkServer = null; res.status(500).json({ error: e?.message }); }
  });

  app.post("/api/remote/stop", (_req, res) => {
    if (nexusLinkServer) { nexusLinkServer.close(); nexusLinkServer = null; }
    res.json({ ok: true });
  });

  app.get("/api/remote/status", (_req, res) => res.json({ running: !!nexusLinkServer }));



  // Dev Centre: File tree 
  app.get("/api/dev/files", async (req, res) => {
    const { readdir, stat } = await import('fs/promises');
    const { join, relative } = await import('path');
    const srcDir = join(__dirname, 'src');

    async function buildTree(dir: string, base: string): Promise<any[]> {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        const nodes = await Promise.all(
          entries
            .filter(e => !e.name.startsWith('.') && !['node_modules','dist','__pycache__'].includes(e.name))
            .map(async e => {
              const full = join(dir, e.name);
              const relPath = relative(join(__dirname), full).replace(/\\/g, '/');
              if (e.isDirectory()) {
                const children = await buildTree(full, base);
                return { name: e.name, path: relPath, type: 'dir', children };
              } else {
                const s = await stat(full);
                return { name: e.name, path: relPath, type: 'file', size: s.size };
              }
            })
        );
        return nodes;
      } catch { return []; }
    }

    const tree = await buildTree(srcDir, __dirname);
    res.json({ tree: [{ name: 'src', path: 'src', type: 'dir', children: tree }] });
  });

  // Dev Centre: Read file 
  app.get("/api/dev/file", async (req, res) => {
    const { readFile } = await import('fs/promises');
    const { join, resolve } = await import('path');
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: 'path required' });
    // Security: only allow files within the project dir
    const fullPath = resolve(join(__dirname, filePath));
    if (!fullPath.startsWith(__dirname)) return res.status(403).json({ error: 'forbidden' });
    try {
      const content = await readFile(fullPath, 'utf-8');
      res.json({ content, path: filePath });
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });

  // Dev Centre: Write file 
  app.post("/api/dev/file", async (req, res) => {
    const { writeFile, mkdir } = await import('fs/promises');
    const { join, resolve, dirname } = await import('path');
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: 'path and content required' });
    const fullPath = resolve(join(__dirname, filePath));
    if (!fullPath.startsWith(__dirname)) return res.status(403).json({ error: 'forbidden' });
    try {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
      res.json({ ok: true, path: filePath });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Dev Centre: Package list 
  app.get("/api/dev/packages", async (req, res) => {
    const { readFile } = await import('fs/promises');
    const { join } = await import('path');
    try {
      const pkg = JSON.parse(await readFile(join(__dirname, 'package.json'), 'utf-8'));
      const deps = Object.entries(pkg.dependencies || {}).map(([name, version]) => ({ name, version, type: 'dep' }));
      const devDeps = Object.entries(pkg.devDependencies || {}).map(([name, version]) => ({ name, version, type: 'dev' }));
      res.json({ packages: [...deps, ...devDeps] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Run command in a new shell (used by model install buttons) 
  app.post("/api/run-command", async (req, res) => {
    const { command, cwd: cmdCwd, wsl } = req.body;
    if (!command) return res.status(400).json({ error: "command required" });
    const isWin = process.platform === "win32";
    // Python/pip must go through WSL on Windows
    const needsWSL = isWin && (
      wsl === true ||
      /^pip[23]?\s|^python[23]?\s|unsloth|diffusers|transformers|huggingface_hub/.test(command)
    );
    try {
      if (needsWSL) {
        // Open WSL window and run command there
        const safe = command.replace(/"/g, "\'");
        spawn("wsl.exe", ["bash", "-c", safe + "; echo; echo '=== Done ==='; read -p 'Press Enter to close'"], {
          detached: true, stdio: "ignore", cwd: cmdCwd || process.cwd(),
        }).unref();
        res.json({ ok: true, msg: "Running in WSL terminal", wsl: true });
      } else if (isWin) {
        const safe = command.replace(/"/g, '\\"');
        spawn("cmd.exe", ["/c", "start", "cmd.exe", "/k", safe], {
          detached: true, stdio: "ignore", cwd: cmdCwd || process.cwd(),
        }).unref();
        res.json({ ok: true, msg: "Opened new terminal window" });
      } else {
        const proc = spawn("bash", ["-c", command], {
          detached: true, stdio: "ignore", cwd: cmdCwd || process.cwd(),
        });
        proc.unref();
        res.json({ ok: true, msg: "Running in background" });
      }
    } catch (e) {
      res.status(500).json({ error: (e as any).message });
    }
  });
  // ── Send command to active terminal WebSocket sessions ────────────────────
  // Store active terminal WS connections so we can inject commands
  const terminalSessions = new Set<any>();
  app.post("/api/terminal-inject", (req, res) => {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: "command required" });
    if (terminalSessions.size === 0) return res.status(503).json({ error: "no_terminal", msg: "No terminal open. Open the terminal tab first." });
    const cmd = (process.platform === 'win32' ? command + '\r\n' : command + '\n');
    let sent = 0;
    terminalSessions.forEach(session => {
      try { session.shell.stdin.write(cmd); sent++; } catch {}
    });
    res.json({ ok: true, sent });
  });

  // ── FFmpeg execution (called only after user approval in YouTubeCenter) ──────
  app.post("/api/ffmpeg/run", async (req, res) => {
    const { command } = req.body || {};
    if (!command || typeof command !== "string") {
      return res.status(400).json({ error: "No command provided" });
    }
    // Basic safety: only allow commands starting with "ffmpeg"
    const trimmed = command.trim();
    if (!trimmed.toLowerCase().startsWith("ffmpeg")) {
      return res.status(400).json({ error: "Only ffmpeg commands are allowed" });
    }
    // Parse args (simple split respecting quoted strings)
    const args: string[] = [];
    let current = "";
    let inQuote = false;
    let quoteChar = "";
    for (const ch of trimmed.slice(6).trim()) { // strip "ffmpeg"
      if ((ch === '"' || ch === "'") && !inQuote) { inQuote = true; quoteChar = ch; }
      else if (ch === quoteChar && inQuote) { inQuote = false; quoteChar = ""; }
      else if (ch === " " && !inQuote) { if (current) { args.push(current); current = ""; } }
      else { current += ch; }
    }
    if (current) args.push(current);


    try {
      const { stdout, stderr } = await execAsync(`ffmpeg ${args.join(" ")}`, {
        timeout: 300_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      res.json({ ok: true, stdout, stderr });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message, stdout: e?.stdout || "", stderr: e?.stderr || "" });
    }
  });

  // ── Write file (for AI Maker / Model Trainer dataset + script saving) ───────
  // ── Chat log — append messages + read recent history ─────────────────────
  // ── STT — Web Speech API mode (browser-native, no AI model required) ────────
  // The frontend uses the browser's built-in SpeechRecognition API directly.
  // These endpoints exist for backward compatibility / optional server-side STT.

  app.post("/api/stt/transcribe", async (_req, res) => {
    // Frontend uses Web Speech API now — this endpoint is a no-op fallback
    res.json({ text: "", mode: "webspeech" });
  });

  app.get("/api/stt/status", async (_req, res) => {
    // Always report as available — Web Speech API needs no server
    res.json({ available: true, mode: "webspeech", model: "none", hint: "Using browser Web Speech API — no model needed" });
  });

    app.post("/api/chatlog/append", async (req, res) => {
    const { role, content, ts } = req.body;
    if (!role || !content) return res.status(400).json({ error: "role and content required" });
    try {
      const { appendFile, mkdir } = await import('fs/promises');
      const logPath = path.join(process.cwd(), 'chatlog.txt');
      const time = new Date(ts || Date.now()).toLocaleString('en-GB');
      const line = `[${time}] ${role.toUpperCase()}: ${content.replace(/\n/g, ' ')}\n`;
      await appendFile(logPath, line, 'utf-8');
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/chatlog/recent", async (req, res) => {
    try {
      const { readFile } = await import('fs/promises');
      const logPath = path.join(process.cwd(), 'chatlog.txt');
      const text = await readFile(logPath, 'utf-8');
      // Return last N lines
      const lines = text.split('\n').filter(Boolean);
      const limit = parseInt(req.query.lines as string) || 100;
      res.json({ lines: lines.slice(-limit), total: lines.length });
    } catch {
      res.json({ lines: [], total: 0 }); // file doesn't exist yet
    }
  });

  app.delete("/api/chatlog", async (req, res) => {
    try {
      const { writeFile } = await import('fs/promises');
      await writeFile(path.join(process.cwd(), 'chatlog.txt'), '', 'utf-8');
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/write-file", async (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: "path and content required" });
    // Restrict to safe subdirectories only
    const safe = ['datasets/', 'training/', 'Modelfile', 'models/'];
    const isSafe = safe.some(p => filePath.startsWith(p) || filePath.startsWith(p.slice(0,-1)));
    if (!isSafe) return res.status(403).json({ error: "Path not allowed" });
    try {
      const fullPath = path.join(process.cwd(), filePath);
      const { mkdir, writeFile } = await import('fs/promises');
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
      res.json({ ok: true, path: filePath });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/system/install-deps", (req, res) => {
    const child = spawn("npm", ["install"], {
      cwd: process.cwd(),
      stdio: "inherit"
    });

    child.on("close", (code) => {
      if (code === 0) {
        res.json({ success: true, message: "Dependencies installed successfully" });
      } else {
        res.status(500).json({ success: false, message: `Installation failed with code ${code}` });
      }
    });
  });


  // ══════════════════════════════════════════════════════════════════════════════
  // NEXUS AGENT — Agentic code execution + self-improvement endpoints
  // ══════════════════════════════════════════════════════════════════════════════

  // Auth helper for agent routes
  const agentAuth = async (req: any): Promise<boolean> => {
    let savedToken = "";
    try {
      const { readFile, access } = await import("fs/promises");
      const tp = path.join(process.cwd(), ".nexus_remote_token");
      await access(tp);
      savedToken = (await readFile(tp, "utf-8")).trim();
    } catch {}
    if (!savedToken) return true; // no token set = open
    const incoming = (req.headers["x-nexus-token"] || req.query["nexus_token"]) as string;
    return incoming === savedToken;
  };

  // ── /api/agent/exec — runs a command, streams stdout+stderr back ─────────────
  // Used by the AI agent to execute code on the PC
  app.post("/api/agent/exec", async (req: any, res: any) => {
    if (!await agentAuth(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { command, cwd: cwdArg, timeout: timeoutMs = 30000 } = req.body || {};
    if (!command) { res.status(400).json({ error: "command required" }); return; }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "bash";
    const shellFlag = isWin ? "/c" : "-c";
    const cwd = cwdArg || process.cwd();

    let output = "";
    let timedOut = false;

    try {
      const child = spawn(shell, [shellFlag, command], {
        cwd,
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });

      const deadline = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, Math.min(Number(timeoutMs), 120000)); // max 2min

      child.stdout.on("data", (d: Buffer) => { const s = d.toString(); output += s; res.write(s); });
      child.stderr.on("data", (d: Buffer) => { const s = d.toString(); output += s; res.write("[stderr] " + s); });

      child.on("close", (code: number) => {
        clearTimeout(deadline);
        if (timedOut) res.write("\n[TIMEOUT — process killed after limit]");
        else res.write(`\n[exit ${code ?? 0}]`);
        res.end();
      });

      child.on("error", (e: Error) => {
        clearTimeout(deadline);
        res.write("\n[error] " + e.message);
        res.end();
      });
    } catch (e: any) {
      res.write("[error] " + e.message);
      res.end();
    }
  });

  // ── /api/agent/write — write a file on the PC ────────────────────────────────
  app.post("/api/agent/write", async (req: any, res: any) => {
    if (!await agentAuth(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { filePath, content: fileContent } = req.body || {};
    if (!filePath) { res.status(400).json({ error: "filePath required" }); return; }
    try {
      const { writeFile, mkdir } = await import("fs/promises");
      const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, fileContent || "", "utf-8");
      res.json({ ok: true, path: abs });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── /api/agent/read — read a file on the PC ──────────────────────────────────
  app.post("/api/agent/read", async (req: any, res: any) => {
    if (!await agentAuth(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { filePath } = req.body || {};
    if (!filePath) { res.status(400).json({ error: "filePath required" }); return; }
    try {
      const { readFile } = await import("fs/promises");
      const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
      const content = await readFile(abs, "utf-8");
      res.json({ ok: true, content, path: abs });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── /api/agent/ls — list files ───────────────────────────────────────────────
  app.post("/api/agent/ls", async (req: any, res: any) => {
    if (!await agentAuth(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { dirPath = "." } = req.body || {};
    try {
      const { readdir, stat } = await import("fs/promises");
      const abs = path.isAbsolute(dirPath) ? dirPath : path.join(process.cwd(), dirPath);
      const entries = await readdir(abs, { withFileTypes: true });
      const files = await Promise.all(entries.slice(0, 200).map(async e => {
        try {
          const s = await stat(path.join(abs, e.name));
          return { name: e.name, type: e.isDirectory() ? "dir" : "file", size: s.size, mtime: s.mtime };
        } catch { return { name: e.name, type: e.isDirectory() ? "dir" : "file" }; }
      }));
      res.json({ ok: true, path: abs, files });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── /api/agent/improve — AI rewrites a NexusAI source file ──────────────────
  // Self-improvement: AI can read and rewrite its own source files
  app.post("/api/agent/improve", async (req: any, res: any) => {
    if (!await agentAuth(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { instruction, targetFile } = req.body || {};
    if (!instruction || !targetFile) { res.status(400).json({ error: "instruction and targetFile required" }); return; }
    // Only allow editing files within the NexusAI project (safety)
    const abs = path.join(process.cwd(), targetFile);
    if (!abs.startsWith(process.cwd())) { res.status(403).json({ error: "Cannot edit files outside NexusAI folder" }); return; }
    try {
      const { readFile } = await import("fs/promises");
      const current = await readFile(abs, "utf-8");
      res.json({ ok: true, current, path: abs });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── /api/agent/status — PC system info for agent context ─────────────────────
  app.get("/api/agent/status", async (req: any, res: any) => {
    if (!await agentAuth(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
    try {
      const os = await import("os");
      const { execAsync: ea } = await Promise.resolve({ execAsync });
      const isWin = process.platform === "win32";
      let gpuInfo = "unknown";
      try {
        const { stdout } = await execAsync(isWin
          ? "wmic path win32_videocontroller get name /value"
          : "nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader",
          { timeout: 3000 }
        );
        gpuInfo = stdout.trim().replace(/Name=/gi, "");
      } catch {}
      res.json({
        platform: process.platform,
        arch: os.arch(),
        hostname: os.hostname(),
        cpus: os.cpus().length,
        totalMemGb: (os.totalmem() / 1e9).toFixed(1),
        freeMemGb: (os.freemem() / 1e9).toFixed(1),
        cwd: process.cwd(),
        gpu: gpuInfo,
        uptime: os.uptime(),
        nodeVersion: process.version,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });


  // ── /api/network-info — full network info for phone app ────────────────────
  app.get("/api/network-info", async (req: any, res: any) => {
    const nets2 = networkInterfaces();
    const localIps: string[] = [];
    for (const iface of Object.values(nets2)) {
      for (const net of (iface || [])) {
        if ((net as any).family === "IPv4" && !(net as any).internal) {
          localIps.push((net as any).address);
        }
      }
    }
    res.json({
      ip: localIps[0] || "127.0.0.1",
      localIps,
      port: actualPort,
      version: "4.3.0",
      platform: process.platform,
      hostname: require("os").hostname(),
    });
  });

  // ── /api/health — simple health check (no auth required for connectivity) ─
  app.get("/api/health", (_req: any, res: any) => {
    res.json({ ok: true, version: "4.5.0", ts: Date.now() });
  });

  // ── /api/model-config — read/write default model (always prefer Ollama) ────
  app.get("/api/model-config", async (_req: any, res: any) => {
    try {
      const cfgPath = path.join(process.cwd(), ".nexus_model_config.json");
      const { readFile, access } = await import("fs/promises");
      await access(cfgPath);
      const cfg = JSON.parse(await readFile(cfgPath, "utf-8"));
      res.json(cfg);
    } catch {
      // Default: always Ollama gemma3:12b
      res.json({ defaultModel: "gemma3:12b", fallbackModel: "gemma3:4b", preferOllama: true });
    }
  });

  app.post("/api/model-config", async (req: any, res: any) => {
    const { defaultModel, fallbackModel, preferOllama } = req.body || {};
    const cfg = {
      defaultModel: defaultModel || "mdq100/Gemma3-Instruct-Abliterated:12b",
      fallbackModel: fallbackModel || "gemma3:4b",
      preferOllama: preferOllama !== false,
    };
    try {
      const { writeFile } = await import("fs/promises");
      await writeFile(path.join(process.cwd(), ".nexus_model_config.json"), JSON.stringify(cfg, null, 2), "utf-8");
      res.json({ ok: true, ...cfg });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── /api/github-cli/* — managed GitHub CLI bridge for AI + UI ───────────────
  const GITHUB_TOKEN_PATH = path.join(process.cwd(), ".nexus_github_token");
  const GITHUB_CONFIG_PATH = path.join(process.cwd(), ".nexus_github_config.json");

  interface GitHubCliConfig {
    owner: string;
    repo: string;
  }

  interface GitHubCliRunResult {
    ok: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut?: boolean;
    notInstalled?: boolean;
  }

  type GitHubCliOperation =
    | "auth_status"
    | "repo_view"
    | "pr_list"
    | "issue_list"
    | "workflow_list"
    | "workflow_runs"
    | "run_view";

  const normaliseGitHubPart = (value: any): string =>
    String(value || "").trim().replace(/[^A-Za-z0-9_.-]/g, "");

  const normaliseGitHubOperation = (value: any): GitHubCliOperation => {
    const op = String(value || "").trim().toLowerCase();
    if (
      op === "auth_status" ||
      op === "repo_view" ||
      op === "pr_list" ||
      op === "issue_list" ||
      op === "workflow_list" ||
      op === "workflow_runs" ||
      op === "run_view"
    ) return op;
    throw new Error(`Unsupported GitHub operation: ${op || "(empty)"}`);
  };

  const readGitHubToken = async (): Promise<string> => {
    try {
      const { readFile, access } = await import("fs/promises");
      await access(GITHUB_TOKEN_PATH);
      return (await readFile(GITHUB_TOKEN_PATH, "utf-8")).trim();
    } catch {
      return "";
    }
  };

  const writeGitHubToken = async (token: string): Promise<void> => {
    const clean = String(token || "").trim();
    const { writeFile, unlink } = await import("fs/promises");
    if (clean) {
      await writeFile(GITHUB_TOKEN_PATH, clean, "utf-8");
      return;
    }
    await unlink(GITHUB_TOKEN_PATH).catch(() => {});
  };

  const readGitHubConfig = async (): Promise<GitHubCliConfig> => {
    try {
      const { readFile, access } = await import("fs/promises");
      await access(GITHUB_CONFIG_PATH);
      const parsed = JSON.parse(await readFile(GITHUB_CONFIG_PATH, "utf-8"));
      return {
        owner: normaliseGitHubPart(parsed?.owner),
        repo: normaliseGitHubPart(parsed?.repo),
      };
    } catch {
      return { owner: "", repo: "" };
    }
  };

  const writeGitHubConfig = async (patch: Partial<GitHubCliConfig>): Promise<GitHubCliConfig> => {
    const current = await readGitHubConfig();
    const next: GitHubCliConfig = {
      owner: patch.owner !== undefined ? normaliseGitHubPart(patch.owner) : current.owner,
      repo: patch.repo !== undefined ? normaliseGitHubPart(patch.repo) : current.repo,
    };
    const { writeFile } = await import("fs/promises");
    await writeFile(GITHUB_CONFIG_PATH, JSON.stringify(next, null, 2), "utf-8");
    return next;
  };

  const runGitHubCli = async (args: string[], timeoutMs = 20000): Promise<GitHubCliRunResult> => {
    const token = await readGitHubToken();
    const env = { ...process.env } as Record<string, string>;
    if (token) env.GH_TOKEN = token;
    const ghPath = process.platform === "win32"
      ? "C:\\Program Files\\GitHub CLI\\gh.exe"
      : "gh";
    const executable = (process.platform === "win32" && !process.env.PATH?.toLowerCase().includes("github cli"))
      ? ghPath
      : "gh";
    const clampedTimeout = Math.max(2000, Math.min(120000, Math.round(Number(timeoutMs) || 20000)));
    try {
      const { stdout, stderr } = await execFileAsync(executable, args, {
        cwd: process.cwd(),
        env,
        timeout: clampedTimeout,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8,
      });
      return {
        ok: true,
        exitCode: 0,
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || "").trim(),
      };
    } catch (err: any) {
      const stdout = String(err?.stdout || "").trim();
      const stderr = String(err?.stderr || err?.message || "").trim();
      if (err?.code === "ENOENT") {
        return {
          ok: false,
          exitCode: 127,
          stdout,
          stderr: stderr || "gh CLI not found on PATH.",
          notInstalled: true,
        };
      }
      const timedOut = err?.killed && typeof err?.signal === "string";
      return {
        ok: false,
        exitCode: Number.isFinite(Number(err?.code)) ? Number(err.code) : (timedOut ? -1 : 1),
        stdout,
        stderr: timedOut ? `${stderr}\nTimed out after ${clampedTimeout}ms.`.trim() : stderr,
        timedOut: Boolean(timedOut),
      };
    }
  };

  const parseJsonMaybe = (text: string): any | undefined => {
    const trimmed = String(text || "").trim();
    if (!trimmed) return undefined;
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  };

  const runGitHubCliOperation = async (operation: GitHubCliOperation, rawBody: any = {}) => {
    const cfg = await readGitHubConfig();
    const owner = normaliseGitHubPart(rawBody?.owner) || cfg.owner;
    const repo = normaliseGitHubPart(rawBody?.repo) || cfg.repo;
    const repoRef = owner && repo ? `${owner}/${repo}` : "";
    const stateRaw = String(rawBody?.state || "open").toLowerCase();
    const state = (stateRaw === "open" || stateRaw === "closed" || stateRaw === "all") ? stateRaw : "open";
    const limitNum = Number(rawBody?.limit);
    const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(50, Math.round(limitNum))) : 10;
    const runId = String(rawBody?.runId || rawBody?.run_id || "").trim();
    const ensureRepo = () => {
      if (!repoRef) throw new Error("owner and repo are required for this operation.");
    };

    let args: string[] = [];
    let timeoutMs = 25000;
    switch (operation) {
      case "auth_status":
        args = ["auth", "status"];
        break;
      case "repo_view":
        ensureRepo();
        args = [
          "repo", "view", repoRef,
          "--json", "nameWithOwner,description,url,visibility,isPrivate,defaultBranchRef",
        ];
        break;
      case "pr_list":
        ensureRepo();
        args = [
          "pr", "list", "--repo", repoRef, "--state", state, "--limit", String(limit),
          "--json", "number,title,state,author,updatedAt,url",
        ];
        break;
      case "issue_list":
        ensureRepo();
        args = [
          "issue", "list", "--repo", repoRef, "--state", state, "--limit", String(limit),
          "--json", "number,title,state,author,updatedAt,url",
        ];
        break;
      case "workflow_list":
        ensureRepo();
        args = [
          "workflow", "list", "--repo", repoRef,
          "--json", "id,name,path,state",
        ];
        break;
      case "workflow_runs":
        ensureRepo();
        args = [
          "run", "list", "--repo", repoRef, "--limit", String(limit),
          "--json", "databaseId,name,workflowName,status,conclusion,event,headBranch,updatedAt,url",
        ];
        break;
      case "run_view":
        ensureRepo();
        if (!/^\d+$/.test(runId)) throw new Error("runId must be a numeric GitHub Actions run id.");
        args = [
          "run", "view", runId, "--repo", repoRef,
          "--json", "databaseId,name,workflowName,status,conclusion,event,headBranch,url,createdAt,updatedAt",
        ];
        timeoutMs = 45000;
        break;
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    const result = await runGitHubCli(args, timeoutMs);
    const data = parseJsonMaybe(result.stdout);
    return { operation, args, owner, repo, state, limit, runId, result, data };
  };

  const formatGitHubRunResult = (run: {
    operation: string;
    args: string[];
    owner: string;
    repo: string;
    state: string;
    limit: number;
    runId: string;
    result: GitHubCliRunResult;
    data?: any;
  }): string => {
    const repoRef = run.owner && run.repo ? `${run.owner}/${run.repo}` : "(not set)";
    const lines = [
      `GitHub CLI operation: ${run.operation}`,
      `Repo: ${repoRef}`,
      `Command: gh ${run.args.join(" ")}`,
      `Exit: ${run.result.exitCode}`,
      `OK: ${run.result.ok ? "yes" : "no"}`,
    ];
    if (run.result.notInstalled) lines.push("Status: gh CLI is not installed.");
    if (run.result.stdout) lines.push(`STDOUT:\n${run.result.stdout.slice(0, 4000)}`);
    if (run.result.stderr) lines.push(`STDERR:\n${run.result.stderr.slice(0, 2000)}`);
    if (run.data !== undefined) {
      lines.push(`Parsed JSON:\n${JSON.stringify(run.data, null, 2).slice(0, 4000)}`);
    }
    return lines.join("\n");
  };

  const getGitHubCliStatus = async () => {
    const versionRun = await runGitHubCli(["--version"], 8000);
    const installed = versionRun.ok || !versionRun.notInstalled;
    const token = await readGitHubToken();
    const config = await readGitHubConfig();

    let authenticated = false;
    let login = "";
    let authError = "";
    let authSource: "token" | "gh_auth" | "none" = "none";

    if (installed) {
      if (token) {
        authSource = "token";
        const whoami = await runGitHubCli(["api", "user", "--jq", ".login"], 10000);
        if (whoami.ok && whoami.stdout) {
          authenticated = true;
          login = whoami.stdout.trim();
        } else {
          authError = (whoami.stderr || whoami.stdout || "Saved GH token is invalid or missing scopes.").trim();
        }
      } else {
        authSource = "gh_auth";
        const authStatus = await runGitHubCli(["auth", "status"], 10000);
        authenticated = authStatus.ok;
        const combined = `${authStatus.stdout}\n${authStatus.stderr}`;
        const loginMatch = combined.match(/Logged in to github\.com as ([^\s]+)/i);
        if (loginMatch?.[1]) login = loginMatch[1];
        if (!authenticated) {
          authError = (authStatus.stderr || authStatus.stdout || "Not authenticated with gh auth login.").trim();
        }
      }
    } else {
      authError = "GitHub CLI is not installed.";
    }

    return {
      installed,
      version: versionRun.stdout.split("\n").find(Boolean) || "",
      hasSavedToken: Boolean(token),
      auth: {
        authenticated,
        login,
        source: authSource,
        error: authError,
      },
      config,
    };
  };

  app.get("/api/github-cli/config", async (_req: any, res: any) => {
    try {
      const config = await readGitHubConfig();
      res.json({ ok: true, config });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/github-cli/config", async (req: any, res: any) => {
    try {
      const next = await writeGitHubConfig({
        owner: req.body?.owner,
        repo: req.body?.repo,
      });
      res.json({ ok: true, config: next });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.get("/api/github-cli/status", async (_req: any, res: any) => {
    try {
      const status = await getGitHubCliStatus();
      res.json({ ok: true, ...status });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/github-cli/status", async (_req: any, res: any) => {
    try {
      const status = await getGitHubCliStatus();
      res.json({ ok: true, ...status });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/github-cli/token", async (req: any, res: any) => {
    try {
      await writeGitHubToken(String(req.body?.token || ""));
      const status = await getGitHubCliStatus();
      res.json({ ok: true, ...status });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/github-cli/run", async (req: any, res: any) => {
    try {
      const operation = normaliseGitHubOperation(req.body?.operation || "auth_status");
      const out = await runGitHubCliOperation(operation, req.body || {});
      res.json({
        ok: out.result.ok,
        operation: out.operation,
        args: out.args,
        owner: out.owner,
        repo: out.repo,
        state: out.state,
        limit: out.limit,
        runId: out.runId,
        result: out.result,
        data: out.data,
      });
    } catch (e: any) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // ── /api/dev-log — development change log (append-only) ─────────────────────
  const devLogEntries: { ts: number; version: string; type: string; msg: string }[] = [

    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "Notes system: /api/notes GET/POST/DELETE endpoints. AI save_note and read_notes tools in nexusTools registry -- AI saves reminders automatically when you say 'remind me to...' or 'note this down'. Notes persist in server memory, accessible in Settings > Notes tab." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "Dev log AI tools: save_devlog tool lets AI save changelog entries when you say 'log this' or 'save to dev log'. read_devlog tool reads recent entries back when you ask 'what did we work on'. Both wired to /api/tools/save_devlog and /api/tools/read_devlog server endpoints." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "Settings: Notes tab added (icon: FileText). Full notes UI: add notes with 7 label types (todo, tomorrow, idea, remind, project, devlog, general), filter by label, delete individual or clear by label, date stamps, hover-reveal delete buttons." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "JarvisTable v2: complete rewrite reflecting correct architecture. PC = AI brain (Gemma 12B, all compute). ESP32 #1 BioMesh (body sensors -> PC), ESP32 #2 Voice I/O (mic stream -> PC Whisper, PC TTS -> I2S speaker), ESP32-CAM (MJPEG stream -> PC vision). No Raspberry Pi in the loop. New tabs: Chat, Nodes, Architecture diagram, Projects. Commands dispatched to ESP32s via /api/jarvis/node/command HTTP proxy." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "Server: ESP32 node registry -- /api/jarvis/node/register (ESP32 calls on boot), /api/jarvis/node/data (sensor POST every interval), /api/jarvis/nodes (UI polls for status), /api/jarvis/node/command (HTTP proxy to ESP32 IP). Nodes marked offline after 10s without heartbeat. BioMesh, Voice, Camera nodes pre-registered with default IPs." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "Addons > Jarvis section updated to match ESP32 architecture. Shows per-node IP config, protocol selector (WebSocket vs MQTT), ping test for all 3 nodes, Arduino IDE setup steps, firmware flash guide for BioMesh and Voice I/O ESP32s, wiring diagrams for INMP441 mic and MAX98357A I2S speaker." },
    { ts: Date.now(), version: "4.5.0", type: "fix",  msg: "Full codebase audit: all 51 tsx/ts files clean. Zero Unicode in comments, zero div depth mismatches, zero hardcoded Gemini model references in useState. Applied recursive comment cleaner to fix any remaining esbuild-confusing box-drawing characters." },

    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "Dashboard: full rewrite with live data. Polls /api/agent/status for CPU/RAM/Node, /api/models for Ollama model list, /api/ollama/loaded for VRAM state, /api/openclaw/health for gateway status. Shows active AI config (Gemma3 Abliterated for Direct Chat, Qwen3.5 HERETIC for OpenClaw). Quick-nav grid dispatches nexus-navigate CustomEvents caught by App.tsx. Live system log with rolling 20-line display." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "VRAM management: added /api/ollama/unload endpoint — sends keep_alive:0 to Ollama which immediately evicts the model from GPU memory. Added /api/ollama/loaded — queries /api/ps to list models currently in VRAM. NexusClaw sendClaw() calls unloadModel() before firing OpenClaw so two 9-12B models never compete for VRAM simultaneously." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "OpenClaw model upgraded to xbann/Qwen3.5-9B-Claude-4.6-HighIQ-THINKING-HERETIC-UNCENSORED. This model supports tool calling (required for OpenClaw's agent capabilities) and is uncensored. Primary Direct Chat stays as Gemma3 12B Abliterated (no tools, uncensored). NexusClaw model dropdown now groups: tool-capable (for OpenClaw tab) vs no-tools (for Direct Chat tab) with VRAM estimates per model." },
    { ts: Date.now(), version: "4.5.0", type: "fix",  msg: "sendClaw(): was calling setClawSending(false) immediately after fetch(), ignoring the CLI response. Now awaits res.json() and reads d.reply directly from the CLI stdout — the server blocks on openclaw agent --local until the full response arrives, so d.reply is always the complete answer. No more polling timeouts. User message now added locally before fetch, not after." },
    { ts: Date.now(), version: "4.5.0", type: "fix",  msg: "NexusCentre model dropdown was always empty: /api/nexuslink/ollama-models requires x-nexus-token auth header which the browser never sent. Added /api/models (no auth required) and switched NexusCentre to use it. Also fixed OSINT hardcoded to gemini-2.0-flash-exp — now uses the selected model." },
    { ts: Date.now(), version: "4.5.0", type: "fix",  msg: "Global model sweep: LifeHub, AIMaker, ModelTrainer switched from Gemma-only Gemini calls to askOllama with Gemma3 Abliterated as default. NexusMesh both getGeminiResponse calls switched to askOllama. All defaults now point to mdq100/Gemma3-Instruct-Abliterated:12b." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "App.tsx: nexus-navigate CustomEvent listener added. Dashboard quick-nav buttons dispatch window.dispatchEvent(new CustomEvent('nexus-navigate', {detail: pageId})) which App.tsx catches and calls setActiveTab(). Allows Dashboard to navigate to any page without prop drilling." },

    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "NexusClaw: AI-to-AI Collab mode — Gemma (Direct Chat) plans tasks and sends instructions to OpenClaw which executes them. Loop runs for configurable turns (2-10). Each turn: Gemma receives task → writes [TO_OPENCLAW]: instruction → server sends to openclaw CLI → polls /api/openclaw/messages until reply appears → Gemma reads reply and plans next step. Shows purple Gemma bubbles vs red OpenClaw bubbles. Stop button halts anytime. [TASK_COMPLETE] signal ends the loop early." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "NexusClaw: complete JSX rewrite for clean structure. Collab mode is a proper conditional branch (collabMode ? CollabPanel : NormalChat) not nested conditionals. Fixed 7 unclosed div tags from previous merge. Div depth tracker verifies 0 at end of file." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "NEXUSAI_DEV_LOG.txt: comprehensive session log with every message from both dev sessions summarized. MSG-by-MSG format: what Abdul asked, what was done, root cause analysis for bugs, thought process for decisions. Future Claude reads this first to pick up context without repeating history." },
    { ts: Date.now(), version: "4.5.0", type: "fix",  msg: "NexusClaw JSX structure: rewrote entire component clean. Previous version had collabMode ternary inside an incomplete outer conditional which left 7 div tags unclosed. Verified with Python div depth tracker (opens vs closes must equal 0)." },

    // ── v4.5.0 — OpenClaw CLI Integration + Drone Reference + Full Dev Logs ──────
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "OpenClaw chat: replaced broken WebSocket handshake approach with openclaw CLI shell-out (\`openclaw agent -m text --local\`). The openclaw-control-ui uses a proprietary webchat subprotocol that requires a specific JSON auth frame sent within milliseconds of WS open — this was impossible to replicate without the source. The CLI bypass is guaranteed to work on the same machine and returns the full AI response as stdout." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "DroneRef page: full interactive technical reference for the Hybrid Gesture-Control Drone System. 9 parts, 36 subsections covering PCB layout (28x18mm, two-layer analog/digital split), sensor processing (biquad IIR on nRF52840 Cortex-M4F HW FPU at <2µs), gesture recognition (two-layer threshold SM + HMM), AI autopilot (predictive blend, gesture-aware state machine, follow-me with velocity feedforward), MAVLink control (unified 50Hz stream, active hover heartbeat), layered safety architecture, behavioral cloning dataset requirements, RF coexistence, and long-term system health monitoring." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "DroneRef download button: generates drone-gesture-system.zip containing 11 real implementation files — ground/arbitrator.py (50Hz blend engine with watchdog), ground/gesture_engine.py (two-layer SM+HMM with confidence scoring and temporal initiation check), ground/ble_receiver.py (BLE receiver with temperature compensation), ground/follow_me.py (ByteTrack + bounding-box/depth fusion + Lucas-Kanade velocity feedforward), ground/mavlink_bridge.py (SET_POSITION_TARGET_LOCAL_NED at 50Hz), firmware/sensor_config.h (ADC precharge timing, haptic pattern arrays, BLE crystal compensation), firmware/iir_filter.h (biquad Direct Form II with real 8Hz/500Hz coefficients), params/arducopter.param (optical flow, battery failsafe, GCS timeout), tools/calibrate.py (interactive BLE calibration with temp measurement), tools/log_analyzer.py (CBOR segment filtering, negative mining, quality scoring, sliding window export)." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "OpenClaw model switching now uses CLI config set: \`openclaw config set agents.defaults.model <model>\` — writes directly to openclaw.json which is reloaded dynamically. Falls back to HTTP REST if CLI unavailable. No longer depends on WS being authenticated." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "OpenClaw gateway status polling: server polls \`/__openclaw__/canvas/\` every 5 seconds to maintain accurate connected/disconnected state. NexusClaw UI reflects true gateway availability rather than WS handshake state." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "DroneRef added to Sidebar System section with BookOpen icon, lazy-loaded via React.lazy(). Wired into App.tsx renderContent switch at case 'droneref'. Zero impact on initial bundle size." },
    { ts: Date.now(), version: "4.5.0", type: "feat", msg: "jszip added to package.json dependencies (^3.10.1). DroneRef uses \`import JSZip from 'jszip'\` — proper bundled import, no CDN dynamic import hacks. Vite bundles it into the DroneRef lazy chunk." },
    { ts: Date.now(), version: "4.5.0", type: "fix",  msg: "Phone connect button removed from App.tsx main content area overlay (absolute top-3 right-3 z-30). Was blocking content on every page. The phone modal still exists and is accessible but no longer floated over every view." },
    { ts: Date.now(), version: "4.5.0", type: "fix",  msg: "Settings test connection button: now routes through /api/openclaw/health proxy instead of direct browser fetch to 127.0.0.1:18789. Browser→OpenClaw direct fetch was blocked by CORS since OpenClaw gateway doesn't set Access-Control-Allow-Origin headers." },
    { ts: Date.now(), version: "4.5.0", type: "fix",  msg: "Settings OpenClaw host field: now strips http:// prefix and :port suffix automatically on input. Gateway was receiving 'http://127.0.0.1:18789' as the host value instead of just '127.0.0.1', causing all connection attempts to fail with double-protocol URLs." },
    { ts: Date.now(), version: "4.5.0", type: "fix",  msg: "OpenClaw default port corrected from 8765 to 18789. The original 8765 was a placeholder — actual port is set in openclaw.json gateway.port field and shown in gateway startup log." },
    { ts: Date.now(), version: "4.5.0", type: "fix",  msg: "NexusClaw: polls /api/openclaw/messages and /api/openclaw/status every 1500ms using Promise.all for parallel fetching. Removed redundant separate polling intervals." },
    { ts: Date.now(), version: "4.5.0", type: "fix",  msg: "electron-main.cjs: OpenClaw auto-start now tries C:\\Users\\abdul\\.openclaw\\gateway.cmd first (exact path from openclaw install), then node dist/index.js gateway --port 18789, then openclaw from PATH. Non-blocking — NexusAI window opens immediately, gateway starts in background. openClawProcess killed on app exit." },
    { ts: Date.now(), version: "4.5.0", type: "chore", msg: "openclaw.json: tools.web.search.provider changed from 'google' to 'auto' — was causing [WEB_SEARCH_PROVIDER_INVALID_AUTODETECT] warning on every gateway startup. The 'google' value is not valid without a configured Google Search API key." },

    // v4.4.0 NexusClaw, BioSuit Architecture, Server Fixes 
    { ts: Date.now(), version: "4.4.0", type: "feat", msg: "NexusClaw complete rewrite: real OpenClaw gateway integration replacing the previous stub. Chat tab with WebSocket polling, model switcher dropdown (9 Ollama models), animated typing indicator (3-dot bounce), copy-per-message button, clear history, offline queuing. Net Scan tab with ping to any IP/domain and quick-target buttons. Terminal tab for running PC commands. Status tab showing gateway details, WS connection health, quick action buttons that pre-load terminal commands." },
    { ts: Date.now(), version: "4.4.0", type: "feat", msg: "BioSuitMonitor: Architecture tab added alongside Monitor tab. Shows ESP32 as real-time safety/actuator layer (no round-trip to PC, hardware watchdog, <5ms response) vs PC AI as intelligence layer (pattern recognition, predictions, no safety authority). Latency comparison table: ESP32 <5ms / dashboard ~1s / AI analysis 5-30s. Explicit statement that the AI has zero authority over physical actuators." },
    { ts: Date.now(), version: "4.4.0", type: "feat", msg: "JarvisTable: Pi data-flow diagram tab added. Shows complete data pipeline: ESP32→Pi serial/WiFi, Pi→PC server REST, PC server→PC AI. Pi role breakdown: data logging (InfluxDB + Grafana), simulation/dev hub (SITL, code execution, git), voice I/O (Whisper STT + Piper TTS). Distinguishes Pi as infrastructure layer vs PC AI as cognitive layer." },
    { ts: Date.now(), version: "4.4.0", type: "feat", msg: "NexusCode full rework: industrial terminal-noir aesthetic with JetBrains Mono font. Folder tree explorer (collapsible, file icons by extension), multi-tab editor (Tab→2 spaces, Ctrl+S save, Ctrl+Enter run), folder preview mode (combines open HTML+CSS+JS tabs into live iframe render). AI assist panel via Ollama (explain/refactor/optimize/debug actions). Output panel with stdout/stderr." },
    { ts: Date.now(), version: "4.4.0", type: "feat", msg: "KaliVM: SSH terminal via WebSocket bridge at /api/ws/ssh. Tool Launcher with 80+ commands across 5 groups (Recon: nmap, masscan, theHarvester; Web: nikto, sqlmap, gobuster; Network: wireshark, tcpdump, netcat; Password: hashcat, john, hydra; Exploit: metasploit, searchsploit). TARGET substitution, VNC/noVNC iframe tab, AI assist via Ollama with security context." },
    { ts: Date.now(), version: "4.4.0", type: "feat", msg: "Settings: new API Keys tab separating Gemini + ElevenLabs keys from General settings. OpenClaw connection config (host, port, auth token, device token, messenger bridge selector for Telegram/WhatsApp/Slack, bot token, chat ID, cron schedule, burner mode toggle). Test Connection button routes through server proxy." },
    { ts: Date.now(), version: "4.4.0", type: "fix",  msg: "server.ts: removed duplicate biosuitHistory, BIOSUIT_MAX_HISTORY, and jarvisStatus variable declarations that were causing a tsx TransformError crash on startup. These were accidentally declared twice in the same scope during the v4.3 BioSuit additions." },
    { ts: Date.now(), version: "4.4.0", type: "fix",  msg: "Gemini phone proxy: maxOutputTokens raised from 600 to 8192 — was silently truncating all phone AI responses to a fraction of their intended length. The 600 token limit was carried over from an early prototype and never corrected." },
    { ts: Date.now(), version: "4.4.0", type: "fix",  msg: "rebuild.bat rewritten with CRLF line endings (\\r\\n written as raw bytes via Python). Original file had Linux LF endings — Windows cmd.exe silently ignores lines without \\r\\n. Batch was parsing as a single malformed command and exiting immediately on every line." },
    { ts: Date.now(), version: "4.4.0", type: "fix",  msg: "llava:7b input type corrected from ['text'] to ['text','image'] in openclaw.json, models.json, and all model config arrays. The original was never updated when llava was added and prevented the vision model from receiving image inputs." },
    { ts: Date.now(), version: "4.4.0", type: "feat", msg: "Model display names: formatModelName() strips hf.co/ and registry prefixes from Ollama model IDs for clean display in all dropdowns. Regex: m.replace(/^hf\\.co\\/[^/]+\\//, '').replace(/^[^/]+\\//, '') — keeps the model name and tag only." },
    { ts: Date.now(), version: "4.4.0", type: "feat", msg: "vite.config.ts: C:\\Users\\abdul\\models excluded from watch and rollup. Watch ignored patterns: C:/Users/abdul/models/**, C:/Users/abdul/nexusai/models/**, **/models/**. Rollup external() function skips any path containing /models/, \\models\\, .gguf, .safetensors, .bin. Prevents Vite from attempting to bundle 100GB model directories." },
    { ts: Date.now(), version: "4.4.0", type: "chore", msg: "Version bumped to 4.4.0 across server.ts banner, package.json, Settings sidebar version display, rebuild.bat header." },

    // v4.3.0 BioSuit, Jarvis, Ollama-first architecture 
    { ts: Date.now(), version: "4.3.0", type: "feat", msg: "BioSuitMonitor: ESP32 body heatmap visualization with dynamic color zones (red=alert, amber=warning, green=normal). Real-time HR/SpO2 charts using Recharts with 60-sample rolling window at 1Hz refresh. Alert log with timestamp, sensor source, and acknowledgement. CSV export of session data. WebSocket polling to /api/biosuit/stream." },
    { ts: Date.now(), version: "4.3.0", type: "feat", msg: "JarvisTable: Raspberry Pi 5 workbench AI with camera feed integration, project card management, voice dispatch via Piper TTS (11 voices), Whisper STT local transcription, tool execution (git, npm, python, bash), NexusMesh node ping. Separate session from main Chat — maintains Jarvis personality context." },
    { ts: Date.now(), version: "4.3.0", type: "feat", msg: "SmartHome: Ollama AI voice control for device automation. HTTP ping to smart home hub endpoints. Device form with state toggle + level slider. Energy consumption chart with 24hr rolling window (Recharts area chart). Room grouping sidebar. Auto-refresh every 30s." },
    { ts: Date.now(), version: "4.3.0", type: "fix",  msg: "Global Ollama switch: 8 pages migrated from Gemini-only to askOllama() with Gemini fallback. Pages: Dashboard, LLMLibrary, ModelTrainer, NexusOSINT, AIMaker, BusinessHub, NexusMesh, SmartHome. No API key required for any core AI feature." },
    { ts: Date.now(), version: "4.3.0", type: "fix",  msg: "SmartHome form submit: prevented default form submission that was causing page reload on device add/edit. Changed <form onSubmit> to <div> + explicit button onClick handlers." },

    // v4.2.0 Chat Studio overhaul, token fixes 
    { ts: Date.now(), version: "4.2.0", type: "feat", msg: "Chat Studio: voice call mode added — microphone button activates Whisper STT loop, AI response is spoken via ElevenLabs TTS or browser speech synthesis fallback. Real-time waveform visualization during recording. Call mode has a different visual state (green border, end-call button)." },
    { ts: Date.now(), version: "4.2.0", type: "feat", msg: "Chat Studio: extended thinking/reasoning output shown as collapsible panel above main response. Gemini 2.5 Pro reasoning tokens rendered in a faded italic style to distinguish thinking from output." },
    { ts: Date.now(), version: "4.2.0", type: "feat", msg: "Chat Studio: session persistence via localStorage. Chat history survives page reload. Multiple named sessions with timestamps. Export session as markdown file." },
    { ts: Date.now(), version: "4.2.0", type: "fix",  msg: "maxOutputTokens: raised from 600 to 8192 globally in the Gemini proxy. The 600 token limit was a development artifact that was never removed. All AI responses were being silently truncated at mid-sentence. This affected every AI feature in the app." },

    // v4.1.0 OSINT platform expansion 
    { ts: Date.now(), version: "4.1.0", type: "feat", msg: "NexusOSINT: 80+ platform database covering social (Instagram, TikTok, Twitter/X, Reddit, LinkedIn, Discord, Telegram), professional (GitHub, GitLab, HackerNews, ProductHunt), breach data (HaveIBeenPwned, DeHashed), network recon (Shodan, Censys, GreyNoise), email (Hunter.io, EmailRep), and 50+ miscellaneous platforms. Each platform entry has URL template, description, and category tag." },
    { ts: Date.now(), version: "4.1.0", type: "feat", msg: "NexusOSINT: 6 search modes — Username, Email, Phone, Domain, IP, Name. AI-powered auto-search triggers on input after 800ms debounce. Results scored by platform relevance and shown with confidence indicators. DeHashed/Hunter.io/Shodan API keys stored in Settings API Keys tab." },
    { ts: Date.now(), version: "4.1.0", type: "feat", msg: "NexusOSINT: report generation as markdown file with all findings, timestamps, and source URLs. Copy individual result URLs. Export full session." },

    // v4.0.0 Phone app + NexusMesh 3D 
    { ts: Date.now(), version: "4.0.0", type: "feat", msg: "Phone app: standalone zero-dependency HTML file (5,600 lines). Full feature parity with desktop — chat, voice, NexusMesh, SmartHome, LifeHub. Served at /app from the NexusAI server. Works on any mobile browser over local WiFi or HTTPS tunnel. No framework, no build step, single file." },
    { ts: Date.now(), version: "4.0.0", type: "feat", msg: "NexusMesh 3D: Three.js node graph visualization. Each device is a sphere with color-coded status (green=online, amber=idle, red=offline). Physics-based spring layout. Click node to expand details panel. Real-time ping updating node glow intensity. Orbit controls (drag to rotate, scroll to zoom)." },
    { ts: Date.now(), version: "4.0.0", type: "feat", msg: "NexusMesh: device pairing via QR code and PIN. Mesh topology visualization showing connected/disconnected edges. Bandwidth and latency metrics per link. Node type icons (laptop, phone, Pi, ESP32, server)." },
    { ts: Date.now(), version: "4.0.0", type: "feat", msg: "YouTubeCenter: script writer with chapter markers, hook generator, thumbnail concept generator. FFmpeg command builder for video processing (trim, compress, extract audio, create clips). API key setup with YouTube Data API v3 for analytics integration." },
    { ts: Date.now(), version: "4.0.0", type: "feat", msg: "Doomcase OS: custom Arch Linux build system. Hardware profile editor for the Doomcase form factor (ITX + GPU + custom PCB). Package list manager with AUR support. PKGBUILD generator. Assembly guide with step-by-step hardware photos." },

    // v3.x Foundation 
    { ts: Date.now(), version: "3.9.0", type: "feat", msg: "LLMLibrary: searchable database of 200+ LLM models with benchmarks, context window sizes, licensing, and Ollama pull commands. Filter by size (3B/7B/13B/34B/70B+), capability (vision/code/instruct/chat), and license (MIT/Apache/Llama/Commercial). Quick-copy ollama pull commands." },
    { ts: Date.now(), version: "3.9.0", type: "feat", msg: "ModelTrainer: LoRA fine-tuning workflow guide. Dataset format examples (JSONL instruction pairs). Training config generator for Unsloth/Axolotl/LLaMA-Factory. Hardware requirements calculator based on model size and context length. Export to GGUF guide." },
    { ts: Date.now(), version: "3.8.0", type: "feat", msg: "AIMaker: drag-and-drop AI pipeline builder. Node types: LLM, Tool, Memory, Condition, Output. Connect nodes to build multi-step AI workflows. Export as Python script. Pre-built templates: RAG pipeline, web researcher, code reviewer, document analyzer." },
    { ts: Date.now(), version: "3.8.0", type: "feat", msg: "LifeHub: unified personal productivity suite. Flashcard system with spaced repetition algorithm (SM-2). Notes with Markdown + AI summarization. Task manager with AI breakdown (enter a goal, AI creates subtasks). Habit tracker with streak visualization. Focus timer (Pomodoro). Budget tracker with spending categories and charts." },
    { ts: Date.now(), version: "3.7.0", type: "feat", msg: "OSBuilder: AI-powered custom OS and VM builder. Generates complete shell scripts, kernel configs, package lists, and VM XML definitions. Supports Arch, Debian, Ubuntu, Alpine base. GPU passthrough config for VFIO. Multi-agent mode where specialized agents handle kernel, desktop, networking, security layers independently." },
    { ts: Date.now(), version: "3.7.0", type: "feat", msg: "BusinessHub: 5 sections — Lead Generator (scrapes LinkedIn/Hunter.io for prospects), AI Receptionist (builds Vapi/Bland.ai voice agent configs), Website Hunter (finds local businesses without websites), Revenue Calculator (pricing models for AI agency services), Methods (sales scripts and outreach templates)." },
    { ts: Date.now(), version: "3.6.0", type: "feat", msg: "MediaStudio: image generation via Stable Diffusion local API (AUTOMATIC1111 compatible) + Ollama vision models for image analysis. Video trimming and processing via FFmpeg commands. Audio extraction and conversion. Batch processing queue." },
    { ts: Date.now(), version: "3.5.0", type: "feat", msg: "Admin Center: server health dashboard (CPU, RAM, disk, network via /api/system/stats). Process management (kill/restart server, Ollama, Whisper). Log viewer with tail -f equivalent via WebSocket streaming. API key validation checker. Token usage tracking." },
    { ts: Date.now(), version: "3.5.0", type: "feat", msg: "Dev Center: in-app code editor with AI developer assistant. File browser for src/ directory. READ_FILE / FILE_UPDATE command protocol for AI to propose code changes. Apply Update button triggers server-side file write and hot reload. Full project context via LIST_FILES." },
    { ts: Date.now(), version: "3.0.0", type: "feat", msg: "Initial NexusAI Desktop release. Electron + React + Express architecture. Sidebar navigation with 20+ pages. Ollama integration for local AI. Gemini API integration for cloud AI. Whisper STT server. ElevenLabs TTS. NexusAuth token gate for remote access. TailwindCSS dark theme." },
  ];

    app.get("/api/dev-log", (_req: any, res: any) => {
    res.json({ entries: devLogEntries });
  });

  app.post("/api/dev-log", async (req: any, res: any) => {
    const { version, type, msg } = req.body || {};
    if (!msg) return res.status(400).json({ error: "msg required" });
    devLogEntries.unshift({ ts: Date.now(), version: version || "4.5.0", type: type || "misc", msg });
    res.json({ ok: true });
  });

  // ── /api/notes — persistent notes/reminders, saved and read by AI tools ─────
  const notes: { id: string; ts: number; label: string; text: string }[] = [];

  app.get("/api/notes", (req: any, res: any) => {
    const { label } = req.query;
    const filtered = label ? notes.filter(n => n.label === label) : notes;
    res.json({ notes: filtered.slice(0, 100) });
  });

  app.post("/api/notes", (req: any, res: any) => {
    const { text, label } = req.body || {};
    if (!text) return res.status(400).json({ error: "text required" });
    const note = { id: Date.now().toString(), ts: Date.now(), label: label || "general", text };
    notes.unshift(note);
    if (notes.length > 500) notes.pop();
    res.json({ ok: true, note });
  });

  app.delete("/api/notes", (req: any, res: any) => {
    const { label, id } = req.query;
    if (id) {
      const idx = notes.findIndex(n => n.id === id);
      if (idx >= 0) notes.splice(idx, 1);
    } else if (label) {
      const before = notes.length;
      notes.splice(0, notes.length, ...notes.filter(n => n.label !== label));
      return res.json({ ok: true, deleted: before - notes.length });
    } else {
      notes.splice(0);
    }
    res.json({ ok: true });
  });

  // ── /api/tools/* — server-side tool execution for NexusTools ─────────────────
  app.post("/api/tools/save_devlog", async (req: any, res: any) => {
    const { message, type } = req.body || {};
    if (!message) return res.status(400).json({ error: "message required" });
    devLogEntries.unshift({ ts: Date.now(), version: "4.5.0", type: type || "misc", msg: message });
    res.json({ result: `Dev log saved.\nType: ${type || 'misc'}\nMessage: ${message.slice(0, 100)}${message.length > 100 ? '…' : ''}\nVisible in Settings > Dev Logs.` });
  });

  app.post("/api/tools/read_devlog", (req: any, res: any) => {
    const limit = parseInt(req.body?.limit || '10', 10);
    const version = req.body?.version;
    const entries = version
      ? devLogEntries.filter(e => e.version === version)
      : devLogEntries;
    const recent = entries.slice(0, Math.min(limit, 20));
    const text = recent.map(e =>
      `[${e.type}] v${e.version} — ${e.msg.slice(0, 120)}${e.msg.length > 120 ? '…' : ''}`
    ).join('\n');
    res.json({ result: `Dev log (${recent.length} entries):\n${text || '(no entries)'}` });
  });

  app.post("/api/tools/save_note", (req: any, res: any) => {
    const { text, label } = req.body || {};
    if (!text) return res.status(400).json({ error: "text required" });
    const note = { id: Date.now().toString(), ts: Date.now(), label: label || "general", text };
    notes.unshift(note);
    res.json({ result: `Note saved.\nLabel: ${note.label}\nText: ${text}\n\nAccess anytime via Settings > Notes, or ask me to "read my notes".` });
  });

  app.post("/api/tools/read_notes", (req: any, res: any) => {
    const { label } = req.body || {};
    const filtered = label ? notes.filter(n => n.label === label) : notes;
    if (!filtered.length) {
      return res.json({ result: "No notes saved yet. Ask me to save a note anytime." });
    }
    const text = filtered.slice(0, 20).map(n =>
      `[${n.label.toUpperCase()}] ${new Date(n.ts).toLocaleDateString()} — ${n.text}`
    ).join('\n');
    res.json({ result: `Your notes (${filtered.length} total):\n${text}` });
  });

  app.post("/api/tools/clear_notes", (req: any, res: any) => {
    const { label } = req.body || {};
    const before = notes.length;
    if (label) {
      notes.splice(0, notes.length, ...notes.filter(n => n.label !== label));
    } else {
      notes.splice(0);
    }
    res.json({ result: `Cleared ${before - notes.length} notes${label ? ` with label "${label}"` : ''}.` });
  });

  app.post("/api/tools/startup_control", async (req: any, res: any) => {
    try {
      const action = String(req.body?.action || "run_check").trim().toLowerCase();
      const reason = String(req.body?.reason || "tool-startup-control");
      const actions = new Set(["run_check", "autopilot_run", "autopilot_status", "outreach_send_now", "browser_agent_run", "auto_reply_run", "call_run"]);
      if (!actions.has(action)) {
        return res.status(400).json({
          error: `Unsupported startup control action "${action}". Allowed: run_check, autopilot_run, autopilot_status, outreach_send_now, browser_agent_run, auto_reply_run, call_run.`,
        });
      }

      if (action === "run_check") {
        const state = await runStartupAuditGuarded(reason);
        return res.json({
          result: `Startup run-check completed.\nReason: ${reason}\nLeads: ${state.leads.length}\nMRR USD: ${state.stats.mrrUsd}\nReplies: ${state.stats.replies}`,
          state,
        });
      }

      if (action === "autopilot_run") {
        const out = await runStartupAutopilot(reason);
        const audited = await runStartupAuditGuarded(`tool:${reason}`, { skipAutopilot: true });
        return res.json({
          result: `Startup autopilot completed.\nProvider: ${out.provider}\nSummary: ${out.parsed.summary || "n/a"}\nLeads: ${audited.leads.length}`,
          provider: out.provider,
          plan: out.plan,
          state: audited,
        });
      }

      if (action === "autopilot_status") {
        const state = await safeReadStartupState();
        return res.json({
          result: `Autopilot status.\nRunning: ${Boolean(startupAuditInFlight)}\nReason: ${startupAuditInFlightReason || "none"}\nNext run: ${state.nextRunAt || 0}\nAuto loop: ${state.autoLoopEnabled}`,
          status: {
            running: Boolean(startupAuditInFlight),
            inFlightReason: startupAuditInFlightReason,
            lastStartedAt: startupAuditLastStartedAt,
            lastFinishedAt: startupAuditLastFinishedAt,
            lastError: startupAuditLastError,
            nextRunAt: state.nextRunAt,
            autoLoopEnabled: state.autoLoopEnabled,
            autopilotEnabled: state.autopilot.enabled,
          },
          state,
        });
      }

      if (action === "outreach_send_now") {
        const state = await safeReadStartupState();
        const templates = Array.isArray(req.body?.templates)
          ? req.body.templates.map((entry: any) => String(entry || "")).filter(Boolean).slice(0, 10)
          : [];
        const leadIds = Array.isArray(req.body?.leadIds)
          ? req.body.leadIds.map((entry: any) => String(entry || "").trim()).filter(Boolean).slice(0, 200)
          : undefined;
        const delivery = await runStartupOutreachDelivery(state, templates, reason, { leadIds });
        upsertCheck(state.checks, {
          id: "outreach-delivery",
          label: "Outreach delivery",
          status: delivery.checkStatus,
          detail: delivery.detail,
          checkedAt: Date.now(),
        });
        await saveStartupState(state);
        return res.json({
          result: `Outreach send-now completed.\nSent: ${delivery.sent}\nFailed: ${delivery.failed}\nSkipped: ${delivery.skipped}\nDetail: ${delivery.detail}`,
          delivery,
          state,
        });
      }

      if (action === "browser_agent_run") {
        const state = await safeReadStartupState();
        const goal = String(req.body?.goal || `Reach £${state.business.monthlyTargetGbp}/month quickly.`);
        const parsed: StartupAutopilotParsedPlan = {
          summary: "Tool browser run",
          actions: [`${String(req.body?.plan || "Research leads and collect contact opportunities.")} Goal: ${goal}`],
          outreachTemplates: [],
          leadIdeas: [],
        };
        const out = await runStartupCoreLoop(state, reason, parsed);
        await saveStartupState(state);
        return res.json({
          result: `Browser agent run completed.\nGoal: ${goal}\nLoop status: ${out.entry.status}`,
          loopEntry: out.entry,
          codeRun: out.codeRun,
          state,
        });
      }

      if (action === "call_run") {
        const state = await safeReadStartupState();
        const call = await runStartupCallDelivery(state, reason);
        upsertCheck(state.checks, {
          id: "call-delivery",
          label: "Call delivery",
          status: call.checkStatus,
          detail: call.detail,
          checkedAt: Date.now(),
        });
        if (call.fallbackCandidates.length > 0) {
          const emailFallback = await runStartupOutreachDelivery(state, [], `${reason}:email-fallback`, {
            leadIds: call.fallbackCandidates,
          });
          upsertCheck(state.checks, {
            id: "outreach-delivery",
            label: "Outreach delivery",
            status: emailFallback.checkStatus,
            detail: `${emailFallback.detail} (fallback from call run)`,
            checkedAt: Date.now(),
          });
        }
        await saveStartupState(state);
        return res.json({
          result: `Call run completed.\nSent: ${call.sent}\nFailed: ${call.failed}\nSkipped: ${call.skipped}\nFallback emails: ${call.fallbackCandidates.length}`,
          call,
          state,
        });
      }

      const state = await safeReadStartupState();
      const auto = await runStartupAutoReply(state, reason);
      await saveStartupState(state);
      return res.json({
        result: `Auto-reply run completed.\nSent: ${auto.sent}\nFailed: ${auto.failed}\nQueued remaining: ${state.repliesInbox.filter((r) => r.autoReplyStatus === "queued").length}`,
        autoReply: auto,
        state,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // OpenClaw CLI-based integration (bypasses WS protocol complexity) 
  // The openclaw CLI is on PATH since it auto-starts with NexusAI.
  // We shell out to `openclaw agent -m "text" --local` for reliable message delivery
  // rather than fighting the proprietary webchat WebSocket subprotocol.
  let openClawConfig: any = {
    host: '127.0.0.1', port: '18789',
    authToken: '4f0416e702cef54e6e7db3f25795586e1b195330532b5c4a',
    deviceToken: 'b9a4jPGI0dlQkgWUTfsjyvjsQmSE2unsFQXU_QquZYo',
    messenger: 'telegram', botToken: '', chatId: '',
    schedule: '0 9 * * *', burnerMode: false,
  };

  // In-memory message log
  const openClawMessages: { ts: number; role: string; text: string; model?: string }[] = [];
  let openClawGatewayUp = false;

  // Poll gateway health every 5s to update connected status
  async function checkOpenClawGateway() {
    const { host, port, authToken, deviceToken } = openClawConfig;
    const token = deviceToken || authToken;
    for (const ep of ['/__openclaw__/canvas/', '/health']) {
      try {
        const r = await fetch(`http://${host}:${port}${ep}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: AbortSignal.timeout(2000),
        });
        if (r.status < 500) { openClawGatewayUp = true; return; }
      } catch {}
    }
    openClawGatewayUp = false;
  }
  setInterval(checkOpenClawGateway, 5000);
  setTimeout(checkOpenClawGateway, 1000);

  app.get("/api/openclaw/config", (_req: any, res: any) => {
    res.json({ ...openClawConfig,
      authToken: openClawConfig.authToken ? '••••' + openClawConfig.authToken.slice(-4) : '',
      deviceToken: openClawConfig.deviceToken ? '••••' + openClawConfig.deviceToken.slice(-4) : '',
    });
  });

  app.post("/api/openclaw/config", (req: any, res: any) => {
    openClawConfig = { ...openClawConfig, ...req.body };
    checkOpenClawGateway();
    res.json({ ok: true });
  });

  app.get("/api/openclaw/status", (_req: any, res: any) => {
    res.json({ connected: openClawGatewayUp, host: openClawConfig.host, port: openClawConfig.port, messageCount: openClawMessages.length });
  });

  app.post("/api/openclaw/reconnect", async (_req: any, res: any) => {
    await checkOpenClawGateway();
    res.json({ ok: true, connected: openClawGatewayUp });
  });

  // Send message via openclaw CLI (guaranteed to work on same machine) 
  app.post("/api/openclaw/chat", async (req: any, res: any) => {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'text required' });
    openClawMessages.push({ ts: Date.now(), role: 'user', text });

    const isWin = process.platform === 'win32';
    // Try openclaw CLI: `openclaw agent -m "text" --local`
    // --local sends to the local gateway without needing the WS handshake
    const escaped = text.replace(/"/g, '\"').replace(/`/g, '\`');
    const cmd = isWin
      ? `openclaw agent -m "${escaped}" --local --timeout 60000`
      : `openclaw agent -m "${escaped}" --local --timeout 60000`;
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 65000,
        env: { ...process.env },
        shell: isWin ? 'cmd.exe' : '/bin/bash',
      });
      // Strip Qwen3/3.5 <think>...</think> reasoning tokens from output.
      // The HERETIC model outputs its internal chain-of-thought wrapped in these
      // tags before the actual answer. We strip the entire block server-side so
      // neither the CLI reply nor the message store ever contains the thinking noise.
      const rawReply = (stdout || '').trim();
      const reply = rawReply
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*/gi, '')
        .trim();
      if (reply) {
        openClawMessages.push({ ts: Date.now(), role: 'assistant', text: reply });
      }
      if (stderr && !reply) {
        openClawMessages.push({ ts: Date.now(), role: 'system', text: `CLI error: ${stderr.trim()}` });
      }
      return res.json({ ok: true, method: 'cli', reply });
    } catch (cliErr: any) {
      // CLI not available — try HTTP POST to canvas API as final fallback
      try {
        const { host, port, authToken, deviceToken } = openClawConfig;
        const token = deviceToken || authToken;
        const r = await fetch(`http://${host}:${port}/api/v1/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ message: text }),
          signal: AbortSignal.timeout(30000),
        });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          const reply = d.response || d.text || d.message || '';
          if (reply) openClawMessages.push({ ts: Date.now(), role: 'assistant', text: reply });
          return res.json({ ok: true, method: 'http', reply });
        }
      } catch {}
      openClawMessages.push({ ts: Date.now(), role: 'system', text: `⚠ Could not reach OpenClaw. Run: openclaw gateway` });
      return res.status(503).json({ ok: false, error: cliErr.message, hint: 'Run: openclaw gateway in a terminal' });
    }
  });

  // ── Switch model via CLI config set ──────────────────────────────────────────
  app.post("/api/openclaw/model", async (req: any, res: any) => {
    const { model } = req.body || {};
    if (!model) return res.status(400).json({ error: 'model required' });
    try {
      const { stdout } = await execAsync(
        `openclaw config set agents.defaults.model "${model}"`,
        { timeout: 10000, env: { ...process.env } }
      );
      return res.json({ ok: true, method: 'cli', output: stdout.trim() });
    } catch (e: any) {
      // Fallback: HTTP model switch
      const { host, port, deviceToken, authToken } = openClawConfig;
      const token = deviceToken || authToken;
      try {
        const r = await fetch(`http://${host}:${port}/api/v1/agent/model`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ model }),
          signal: AbortSignal.timeout(5000),
        });
        if (r.ok) return res.json({ ok: true, method: 'http' });
      } catch {}
      res.status(503).json({ error: e.message });
    }
  });

  app.get("/api/openclaw/messages", (_req: any, res: any) => {
    res.json({ messages: openClawMessages.slice(-100), connected: openClawGatewayUp });
  });

  app.delete("/api/openclaw/messages", (_req: any, res: any) => {
    openClawMessages.length = 0;
    res.json({ ok: true });
  });

  app.post("/api/openclaw/command", async (req: any, res: any) => {
    const { command } = req.body || {};
    if (!command) return res.status(400).json({ error: 'command required' });
    try {
      const { stdout, stderr } = await execAsync(`openclaw ${command}`, {
        timeout: 15000, env: { ...process.env },
      });
      res.json({ ok: true, stdout: stdout.trim(), stderr: stderr.trim() });
    } catch (e: any) {
      res.status(502).json({ ok: false, error: e.message });
    }
  });

  app.get("/api/openclaw/health", async (_req: any, res: any) => {
    await checkOpenClawGateway();
    const { host, port } = openClawConfig;
    res.json({ ok: openClawGatewayUp, wsConnected: openClawGatewayUp, host, port });
  });

  // ── OpenClaw workspace memory endpoints (for NexusClaw Direct Chat) ────────
  const WORKSPACE_DIR = process.env.USERPROFILE
    ? `${process.env.USERPROFILE}\\.openclaw\\workspace`
    : `${process.env.HOME}/.openclaw/workspace`;

  app.get("/api/openclaw/workspace/read", async (_req: any, res: any) => {
    try {
      const { readFileSync, existsSync } = await import('fs');
      const { join } = await import('path');
      const parts: string[] = [];
      // Read MEMORY.md
      const memPath = join(WORKSPACE_DIR, 'MEMORY.md');
      if (existsSync(memPath)) parts.push(readFileSync(memPath, 'utf8').slice(0, 3000));
      // Read today's daily note
      const today = new Date().toISOString().split('T')[0];
      const dayPath = join(WORKSPACE_DIR, 'memory', `${today}.md`);
      if (existsSync(dayPath)) parts.push(readFileSync(dayPath, 'utf8').slice(0, 1000));
      res.json({ content: parts.join('\n\n---\n\n'), ok: true });
    } catch (e: any) {
      res.json({ content: '', ok: false, error: e.message });
    }
  });

  app.post("/api/openclaw/workspace/write", async (req: any, res: any) => {
    try {
      const { writeFileSync, mkdirSync, existsSync, readFileSync } = await import('fs');
      const { join } = await import('path');
      const { summary } = req.body || {};
      if (!summary) return res.status(400).json({ error: 'summary required' });
      // Append to today's daily note
      const today = new Date().toISOString().split('T')[0];
      const memDir = join(WORKSPACE_DIR, 'memory');
      if (!existsSync(memDir)) mkdirSync(memDir, { recursive: true });
      const dayPath = join(memDir, `${today}.md`);
      const existing = existsSync(dayPath) ? readFileSync(dayPath, 'utf8') : '';
      const entry = `\n\n## NexusAI Direct Chat Summary — ${new Date().toLocaleTimeString()}\n${summary}`;
      writeFileSync(dayPath, existing + entry, 'utf8');
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
  // ── /api/server/config — read/write server config (port, token, etc.) ──────
  app.get("/api/server/config", async (req: any, res: any) => {
    let savedToken = "";
    try {
      const { readFile, access } = await import("fs/promises");
      const tp = path.join(process.cwd(), ".nexus_remote_token");
      await access(tp); savedToken = (await readFile(tp, "utf-8")).trim();
    } catch {}
    // Config is public (no token to read the config), token is masked
    res.json({
      port: actualPort,
      hasToken: !!savedToken,
      tokenPreview: savedToken ? savedToken.slice(0,4) + "****" + savedToken.slice(-4) : null,
      platform: process.platform,
      cwd: process.cwd(),
    });
  });

  app.post("/api/server/change-port", async (req: any, res: any) => {
    if (!await agentAuth(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { port: newPort } = req.body || {};
    if (!newPort || isNaN(Number(newPort))) { res.status(400).json({ error: "Invalid port" }); return; }
    // Write new port to .env file for next restart
    try {
      const { writeFile } = await import("fs/promises");
      await writeFile(path.join(process.cwd(), ".nexus_port"), String(newPort), "utf-8");
      res.json({ ok: true, message: `Port will change to ${newPort} on next restart` });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/server/set-token", async (req: any, res: any) => {
    if (!await agentAuth(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
    const { token: newToken } = req.body || {};
    try {
      const { writeFile } = await import("fs/promises");
      if (newToken) {
        await writeFile(path.join(process.cwd(), ".nexus_remote_token"), newToken.trim(), "utf-8");
        res.json({ ok: true, message: "Token updated" });
      } else {
        const { unlink } = await import("fs/promises");
        await unlink(path.join(process.cwd(), ".nexus_remote_token")).catch(() => {});
        res.json({ ok: true, message: "Token removed — server is now open" });
      }
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/server/token", async (req: any, res: any) => {
    if (!await agentAuth(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
    try {
      const { unlink } = await import("fs/promises");
      await unlink(path.join(process.cwd(), ".nexus_remote_token")).catch(() => {});
      res.json({ ok: true, message: "Token removed" });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });



  // ── Invoice generator ─────────────────────────────────────────────────────
  app.post("/api/invoice/generate", async (req: any, res: any) => {
    try {
      const {
        invoiceNumber = "INV-001",
        date          = new Date().toLocaleDateString("en-GB"),
        dueDate       = "",
        from          = {},   // { name, address, email, phone, vatNumber }
        to            = {},   // { name, address, email }
        items         = [],   // [{ description, qty, unitPrice }]
        notes         = "",
        currency      = "£",
        vatRate       = 0,    // percentage e.g. 20 for 20% VAT
        logoBase64    = "",   // optional base64 logo
        accentColor   = "2563EB",
        paid          = false,
      } = req.body;

      const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, ImageRun
      } = require("docx");

      const border = { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" };
      const borders = { top: border, bottom: border, left: border, right: border };
      const noBorders = { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };

      const mkCell = (text: string, opts: any = {}) => new TableCell({
        borders: opts.noBorder ? noBorders : borders,
        width: { size: opts.w || 2340, type: WidthType.DXA },
        shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 100, bottom: 100, left: 160, right: 160 },
        children: [new Paragraph({
          alignment: opts.align || AlignmentType.LEFT,
          children: [new TextRun({ text: String(text || ""), bold: !!opts.bold, size: opts.size || 20, color: opts.color || "333333", font: "Arial" })]
        })]
      });

      const txt = (t: string, opts: any = {}) => new TextRun({ text: String(t || ""), bold: opts.bold, size: opts.size || 22, color: opts.color || "333333", font: "Arial", italics: opts.italic });
      const para = (children: any[], opts: any = {}) => new Paragraph({ alignment: opts.align, spacing: { after: opts.after || 0, before: opts.before || 0 }, children });

      // Calc totals
      const subtotal = items.reduce((s: number, i: any) => s + (parseFloat(i.qty)||1) * (parseFloat(i.unitPrice)||0), 0);
      const vatAmount = subtotal * (vatRate / 100);
      const total = subtotal + vatAmount;
      const fmt = (n: number) => currency + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

      const children: any[] = [];

      // ── Header ──────────────────────────────────────────────────────────────
      children.push(para([txt("INVOICE", { bold: true, size: 72, color: accentColor })], { after: 120 }));
      if (from.name) children.push(para([txt(from.name, { bold: true, size: 28 })], { after: 40 }));
      if (from.address) { for (const line of from.address.split("\n")) { children.push(para([txt(line, { size: 20, color: "666666" })])); } }
      if (from.email)   children.push(para([txt(from.email, { size: 20, color: "666666" })]));
      if (from.phone)   children.push(para([txt(from.phone, { size: 20, color: "666666" })]));
      if (from.vatNumber) children.push(para([txt("VAT: " + from.vatNumber, { size: 20, color: "666666" })]));

      // Divider
      children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accentColor, space: 1 } }, spacing: { before: 240, after: 240 }, children: [] }));

      // Invoice meta + Bill To side by side (using a table)
      // Build left cell children
      const billToChildren: any[] = [
        para([txt("Bill To:", { bold: true, size: 20, color: "888888" })], { after: 40 }),
      ];
      if (to.name)    billToChildren.push(para([txt(to.name,  { bold: true, size: 24 })]));
      if (to.address) { for (const l of to.address.split("\n")) billToChildren.push(para([txt(l, { size: 20, color: "666666" })])); }
      if (to.email)   billToChildren.push(para([txt(to.email, { size: 20, color: "666666" })]));

      // Build right cell — invoice meta rows
      const metaFields: [string, string][] = [["Invoice #", invoiceNumber], ["Date", date]];
      if (dueDate) metaFields.push(["Due Date", dueDate]);
      const metaChildren: any[] = metaFields.map(([label, val]) =>
        new Table({ width: { size: 4560, type: WidthType.DXA }, columnWidths: [2280, 2280], rows: [
          new TableRow({ children: [
            new TableCell({ borders: noBorders, width: { size: 2280, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 0, right: 0 }, children: [para([txt(label, { bold: true, size: 20, color: "888888" })])] }),
            new TableCell({ borders: noBorders, width: { size: 2280, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 0, right: 0 }, children: [para([txt(val, { size: 20 })], { align: AlignmentType.RIGHT })] }),
          ]}),
        ] })
      );
      if (paid) metaChildren.push(para([txt("PAID", { bold: true, size: 24, color: "16A34A" })], { before: 120, align: AlignmentType.RIGHT }));

      children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4680, 4680],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders: noBorders, width: { size: 4680, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 120 }, children: billToChildren }),
            new TableCell({ borders: noBorders, width: { size: 4680, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 120, right: 0 }, children: metaChildren }),
          ]}),
        ],
      }));

      children.push(para([], { after: 240 }));

      // ── Items table ─────────────────────────────────────────────────────────
      const headerRow = new TableRow({ tableHeader: true, children: [
        mkCell("Description", { bg: accentColor, bold: true, color: "FFFFFF", size: 20, w: 4680 }),
        mkCell("Qty",         { bg: accentColor, bold: true, color: "FFFFFF", size: 20, w: 1200, align: AlignmentType.CENTER }),
        mkCell("Unit Price",  { bg: accentColor, bold: true, color: "FFFFFF", size: 20, w: 1740, align: AlignmentType.RIGHT }),
        mkCell("Amount",      { bg: accentColor, bold: true, color: "FFFFFF", size: 20, w: 1740, align: AlignmentType.RIGHT }),
      ]});

      const itemRows = items.map((item: any, idx: number) => {
        const qty = parseFloat(item.qty) || 1;
        const up  = parseFloat(item.unitPrice) || 0;
        const amt = qty * up;
        const bg  = idx % 2 === 0 ? "F8FAFC" : "FFFFFF";
        return new TableRow({ children: [
          mkCell(item.description || "", { bg, w: 4680 }),
          mkCell(String(qty),             { bg, w: 1200, align: AlignmentType.CENTER }),
          mkCell(fmt(up),                 { bg, w: 1740, align: AlignmentType.RIGHT }),
          mkCell(fmt(amt),                { bg, w: 1740, align: AlignmentType.RIGHT }),
        ]});
      });

      children.push(new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [4680, 1200, 1740, 1740], rows: [headerRow, ...itemRows] }));

      // ── Totals ──────────────────────────────────────────────────────────────
      children.push(para([], { after: 120 }));
      const totalsRows: any[] = [];
      if (vatRate > 0) {
        totalsRows.push([`Subtotal`, fmt(subtotal)]);
        totalsRows.push([`VAT (${vatRate}%)`, fmt(vatAmount)]);
      }
      totalsRows.push([`TOTAL`, fmt(total)]);

      children.push(new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [6120, 3240],
        rows: totalsRows.map(([label, val], idx) => {
          const isLast = idx === totalsRows.length - 1;
          const bg = isLast ? accentColor : "F8FAFC";
          const color = isLast ? "FFFFFF" : "333333";
          return new TableRow({ children: [
            mkCell("", { noBorder: true, w: 6120 }),
            new TableCell({ borders, width: { size: 3240, type: WidthType.DXA }, shading: { fill: bg, type: ShadingType.CLEAR }, margins: { top: 100, bottom: 100, left: 160, right: 160 }, children: [
              para([txt(label, { bold: isLast, color, size: isLast ? 24 : 20 }), txt("  " + val, { bold: true, color, size: isLast ? 24 : 20 })], { align: AlignmentType.RIGHT })
            ]})
          ]});
        })
      }));

      // ── Notes / bank details ─────────────────────────────────────────────────
      if (notes) {
        children.push(para([], { after: 280 }));
        children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD", space: 1 } }, spacing: { after: 120 }, children: [txt("Notes & Payment Details", { bold: true, size: 22, color: accentColor })] }));
        for (const line of notes.split("\n")) {
          children.push(para([txt(line, { size: 20, color: "555555" })], { after: 40 }));
        }
      }

      // ── Footer ──────────────────────────────────────────────────────────────
      children.push(para([], { before: 400 }));
      children.push(para([txt("Thank you for your business!", { size: 20, italic: true, color: "888888" })], { align: AlignmentType.CENTER }));

      const doc = new Document({
        styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
        sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1260, right: 1260, bottom: 1260, left: 1260 } } }, children }]
      });

      const buffer = await Packer.toBuffer(doc);
      const filename = `Invoice_${invoiceNumber.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch(e: any) {
      console.error("[Invoice]", e);
      res.status(500).json({ error: e.message });
    }
  });


  // ══════════════════════════════════════════════════════════════════════════════
  // BIOSUIT MONITOR — ESP32 sensor ingestion + history
  // ESP32s POST every second to /api/biosuit/live
  // ══════════════════════════════════════════════════════════════════════════════
  interface BioSuitReading {
    ts: number;
    // Temperature sensors (DS18B20 × 5)
    temp_torso:     number;
    temp_left_arm:  number;
    temp_right_arm: number;
    temp_left_leg:  number;
    temp_right_leg: number;
    // Heart rate + SpO2 (MAX30102 × 2)
    hr1: number;   spo2_1: number;   // sensor 1
    hr2: number;   spo2_2: number;   // sensor 2
    // Which ESP32 sent this (1, 2, or 3)
    esp32_id?: number;
    // Computed averages (filled server-side)
    avg_temp?: number;
    avg_hr?: number;
    avg_spo2?: number;
  }

  const biosuitHistory: BioSuitReading[] = [];
  const BIOSUIT_MAX_HISTORY = 3600; // 1 hour at 1 reading/sec
  let   biosuitLatest: BioSuitReading | null = null;
  let   biosuitAlerts: { ts: number; msg: string; severity: 'warn'|'critical' }[] = [];

  function checkBiosuitAlerts(r: BioSuitReading) {
    const now = Date.now();
    const temps = [r.temp_torso, r.temp_left_arm, r.temp_right_arm, r.temp_left_leg, r.temp_right_leg];
    const avgTemp = temps.reduce((a,b)=>a+b,0)/temps.length;
    const avgHr   = (r.hr1 + r.hr2) / 2;
    const avgSpo2 = (r.spo2_1 + r.spo2_2) / 2;

    if (avgTemp > 38.5)  biosuitAlerts.unshift({ ts: now, msg: `High body temp: ${avgTemp.toFixed(1)}°C`, severity: 'critical' });
    if (avgTemp < 35.5)  biosuitAlerts.unshift({ ts: now, msg: `Low body temp: ${avgTemp.toFixed(1)}°C`, severity: 'warn' });
    if (avgHr > 140)     biosuitAlerts.unshift({ ts: now, msg: `High heart rate: ${avgHr.toFixed(0)} bpm`, severity: 'critical' });
    if (avgHr < 45)      biosuitAlerts.unshift({ ts: now, msg: `Low heart rate: ${avgHr.toFixed(0)} bpm`, severity: 'warn' });
    if (avgSpo2 < 94)    biosuitAlerts.unshift({ ts: now, msg: `Low SpO2: ${avgSpo2.toFixed(1)}%`, severity: 'critical' });
    if (Math.max(...temps) - Math.min(...temps) > 3)
      biosuitAlerts.unshift({ ts: now, msg: `Temp imbalance: ${(Math.max(...temps)-Math.min(...temps)).toFixed(1)}°C spread`, severity: 'warn' });
    biosuitAlerts = biosuitAlerts.slice(0, 50);
  }

  app.post("/api/biosuit/live", (req: any, res: any) => {
    const body = req.body as Partial<BioSuitReading>;
    const reading: BioSuitReading = {
      ts:             Date.now(),
      temp_torso:     Number(body.temp_torso)     || 36.5,
      temp_left_arm:  Number(body.temp_left_arm)  || 36.2,
      temp_right_arm: Number(body.temp_right_arm) || 36.3,
      temp_left_leg:  Number(body.temp_left_leg)  || 35.8,
      temp_right_leg: Number(body.temp_right_leg) || 35.9,
      hr1:            Number(body.hr1)    || 72,
      spo2_1:         Number(body.spo2_1) || 98,
      hr2:            Number(body.hr2)    || 71,
      spo2_2:         Number(body.spo2_2) || 98,
      esp32_id:       body.esp32_id,
    };
    const temps = [reading.temp_torso, reading.temp_left_arm, reading.temp_right_arm, reading.temp_left_leg, reading.temp_right_leg];
    reading.avg_temp = temps.reduce((a,b)=>a+b,0)/5;
    reading.avg_hr   = (reading.hr1 + reading.hr2) / 2;
    reading.avg_spo2 = (reading.spo2_1 + reading.spo2_2) / 2;

    biosuitLatest = reading;
    biosuitHistory.push(reading);
    if (biosuitHistory.length > BIOSUIT_MAX_HISTORY) biosuitHistory.shift();
    checkBiosuitAlerts(reading);

    res.json({ ok: true, ts: reading.ts });
  });

  app.get("/api/biosuit/live", (_req: any, res: any) => {
    res.json({ latest: biosuitLatest, alerts: biosuitAlerts.slice(0, 10) });
  });

  app.get("/api/biosuit/history", (req: any, res: any) => {
    const mins = parseInt(req.query.mins as string) || 5;
    const since = Date.now() - mins * 60 * 1000;
    const slice = biosuitHistory.filter(r => r.ts >= since);
    // Downsample if too many points (max 300 for chart)
    let data = slice;
    if (slice.length > 300) {
      const step = Math.ceil(slice.length / 300);
      data = slice.filter((_, i) => i % step === 0);
    }
    res.json({ data, alerts: biosuitAlerts, count: biosuitHistory.length });
  });

  // CSV export
  app.get("/api/biosuit/export", (_req: any, res: any) => {
    const header = 'ts,temp_torso,temp_left_arm,temp_right_arm,temp_left_leg,temp_right_leg,avg_temp,hr1,hr2,avg_hr,spo2_1,spo2_2,avg_spo2\n';
    const rows = biosuitHistory.map(r =>
      `${r.ts},${r.temp_torso},${r.temp_left_arm},${r.temp_right_arm},${r.temp_left_leg},${r.temp_right_leg},${r.avg_temp?.toFixed(2)},${r.hr1},${r.hr2},${r.avg_hr?.toFixed(1)},${r.spo2_1},${r.spo2_2},${r.avg_spo2?.toFixed(1)}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="biosuit_' + Date.now() + '.csv"');
    res.send(header + rows);
  });

  // ── Jarvis Table AI ─────────────────────────────────────────────────────────
  // Raspberry Pi 5 with camera + Whisper STT + Piper TTS + Ollama on PC
  interface JarvisStatus { online: boolean; lastSeen: number; model: string; mode: string; }
  let jarvisStatus: JarvisStatus = { online: false, lastSeen: 0, model: 'gemma3:12b', mode: 'idle' };
  const jarvisLog: { ts: number; role: 'user'|'jarvis'; text: string }[] = [];
  const jarvisProjects: { id: string; name: string; description: string; files: string[] }[] = [];

  // Pi calls this to heartbeat + update status
  // ── ESP32 Node Registry (BioMesh, Voice I/O, Camera) ────────────────────────
  // Each ESP32 POSTs to /api/jarvis/node/register on boot and /api/jarvis/node/data
  // every interval. PC NexusAI serves as the central hub receiving all sensor data
  // and dispatching commands back to nodes. No Raspberry Pi in this architecture --
  // the PC IS the AI brain.
  const esp32Nodes: Map<string, {
    id: string; name: string; type: string; ip: string;
    online: boolean; rssi?: number; lastSeen: number; data: Record<string, any>;
  }> = new Map([
    ['biomesh', { id: 'biomesh', name: 'BioMesh ESP32',   type: 'biomesh', ip: '192.168.1.101', online: false, lastSeen: 0, data: {} }],
    ['voice',   { id: 'voice',   name: 'Voice I/O ESP32', type: 'voice',   ip: '192.168.1.102', online: false, lastSeen: 0, data: {} }],
    ['camera',  { id: 'camera',  name: 'ESP32-CAM',       type: 'camera',  ip: '192.168.1.103', online: false, lastSeen: 0, data: {} }],
  ]);

  // Mark nodes as offline after 10s with no heartbeat
  setInterval(() => {
    const now = Date.now();
    for (const node of esp32Nodes.values()) {
      if (node.online && now - node.lastSeen > 10000) {
        node.online = false;
      }
    }
  }, 5000);

  // ESP32 node registration (called on boot)
  app.post("/api/jarvis/node/register", (req: any, res: any) => {
    const { id, name, type, ip, rssi } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const existing = esp32Nodes.get(id) || { id, name: name || id, type: type || 'unknown', ip: ip || '', data: {} };
    esp32Nodes.set(id, { ...existing, name: name || existing.name, type: type || existing.type, ip: ip || existing.ip, online: true, rssi, lastSeen: Date.now() });
    console.log(`[jarvis] Node registered: ${id} (${type}) from ${ip}`);
    res.json({ ok: true, serverTime: Date.now() });
  });

  // ESP32 data POST (sensor readings)
  app.post("/api/jarvis/node/data", (req: any, res: any) => {
    const { id, data } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const node = esp32Nodes.get(id);
    if (node) {
      node.online = true;
      node.lastSeen = Date.now();
      node.data = { ...node.data, ...data };
    }
    res.json({ ok: true });
  });

  // Get all node statuses
  app.get("/api/jarvis/nodes", (_req: any, res: any) => {
    res.json({ nodes: Array.from(esp32Nodes.values()) });
  });

  // Send command to a specific ESP32 node
  app.post("/api/jarvis/node/command", async (req: any, res: any) => {
    const { nodeId, command, ...params } = req.body || {};
    const node = esp32Nodes.get(nodeId);
    if (!node) return res.status(404).json({ error: `Node ${nodeId} not registered` });
    try {
      // Forward command to ESP32 via HTTP POST to its IP
      const r = await fetch(`http://${node.ip}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, ...params }),
        signal: AbortSignal.timeout(3000),
      });
      res.json({ ok: r.ok, status: r.status });
    } catch (e: any) {
      res.status(502).json({ ok: false, error: e.message, hint: `Could not reach ESP32 at ${node.ip}` });
    }
  });

  app.post("/api/jarvis/heartbeat", (req: any, res: any) => {
    const { model, mode } = req.body || {};
    jarvisStatus = { online: true, lastSeen: Date.now(), model: model || jarvisStatus.model, mode: mode || 'idle' };
    res.json({ ok: true });
  });

  // Pi posts transcription results + Jarvis responses
  app.post("/api/jarvis/log", (req: any, res: any) => {
    const { role, text } = req.body || {};
    if (role && text) {
      jarvisLog.unshift({ ts: Date.now(), role, text });
      if (jarvisLog.length > 200) jarvisLog.pop();
    }
    res.json({ ok: true });
  });

  app.get("/api/jarvis/status", (_req: any, res: any) => {
    const online = jarvisStatus.online && (Date.now() - jarvisStatus.lastSeen) < 10000;
    res.json({ ...jarvisStatus, online, log: jarvisLog.slice(0, 50) });
  });

  app.post("/api/jarvis/command", async (req: any, res: any) => {
    const { text } = req.body || {};
    if (!text) { res.status(400).json({ error: 'text required' }); return; }
    // Forward to Ollama on local machine
    try {
      const ollamaUrl = "http://127.0.0.1:11434";
      const r = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: jarvisStatus.model, prompt: text, stream: false }),
        signal: AbortSignal.timeout(30000),
      });
      const d = await r.json() as any;
      const reply = d.response || '';
      jarvisLog.unshift({ ts: Date.now(), role: 'user', text });
      jarvisLog.unshift({ ts: Date.now(), role: 'jarvis', text: reply });
      res.json({ reply });
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/jarvis/projects", (_req: any, res: any) => res.json({ projects: jarvisProjects }));
  app.post("/api/jarvis/projects", (req: any, res: any) => {
    const { name, description } = req.body || {};
    if (!name) { res.status(400).json({ error: 'name required' }); return; }
    jarvisProjects.push({ id: Date.now().toString(), name, description: description||'', files: [] });
    res.json({ ok: true });
  });


  // 
  // BIOSUIT MONITOR ESP32 sensor data ingestion + history
  // 
  // In-memory ring buffer last 3600 readings (1hr at 1/sec)
  const MAX_BIO_HISTORY = 3600;
  const bioHistory: any[] = [];
  let bioLatest: any = null;

  app.post("/api/biosuit/live", (req: any, res: any) => {
    const data = {
      ts: Date.now(),
      ...req.body,
      // Expected shape from ESP32:
      // { espId: "esp32-1", torso: 36.7, leftArm: 36.2, rightArm: 36.4,
      // leftLeg: 35.9, rightLeg: 36.1, hr: 72, spo2: 98 }
    };
    bioLatest = data;
    bioHistory.push(data);
    if (bioHistory.length > MAX_BIO_HISTORY) bioHistory.shift();

    // Write to CSV log
    (async () => {
      try {
        const { appendFile } = await import("fs/promises");
        const logPath = path.join(process.cwd(), "biosuit_log.csv");
        const row = [
          data.ts, data.espId||'',
          data.torso||'', data.leftArm||'', data.rightArm||'',
          data.leftLeg||'', data.rightLeg||'',
          data.hr||'', data.spo2||''
        ].join(',') + '\n';
        // Write header if file doesn't exist
        try {
          const { access } = await import("fs/promises");
          await access(logPath);
        } catch {
          await appendFile(logPath, 'ts,espId,torso,leftArm,rightArm,leftLeg,rightLeg,hr,spo2\n');
        }
        await appendFile(logPath, row);
      } catch {}
    })();

    res.json({ ok: true, ts: data.ts });
  });

  app.get("/api/biosuit/history", (_req: any, res: any) => {
    // Return last N readings default 300 (5 min)
    const n = 300;
    res.json({ history: bioHistory.slice(-n), latest: bioLatest, count: bioHistory.length });
  });

  app.get("/api/biosuit/latest", (_req: any, res: any) => {
    res.json(bioLatest || { error: "No data yet" });
  });

  app.get("/api/biosuit/download", async (_req: any, res: any) => {
    try {
      const { readFile } = await import("fs/promises");
      const logPath = path.join(process.cwd(), "biosuit_log.csv");
      const data = await readFile(logPath);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=biosuit_log.csv");
      res.send(data);
    } catch { res.status(404).json({ error: "No log file yet" }); }
  });

  // 
  // JARVIS TABLE Raspberry Pi 5 AI desk assistant
  // 
  let jarvisConfig: any = {
    piUrl: "http://raspberrypi.local:5000",
    connected: false,
    lastSeen: null,
  };

  app.post("/api/jarvis/register", (req: any, res: any) => {
    jarvisConfig = { ...jarvisConfig, ...req.body, connected: true, lastSeen: Date.now() };
    res.json({ ok: true });
  });

  app.get("/api/jarvis/status", (_req: any, res: any) => {
    res.json(jarvisConfig);
  });

  app.post("/api/jarvis/command", async (req: any, res: any) => {
    const { command, text } = req.body;
    try {
      const r = await fetch(`${jarvisConfig.piUrl}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, text }),
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json();
      res.json(d);
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/jarvis/camera", async (req: any, res: any) => {
    try {
      const r = await fetch(`${jarvisConfig.piUrl}/camera/snapshot`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error("Camera error");
      const buf = await r.arrayBuffer();
      res.setHeader("Content-Type", "image/jpeg");
      res.send(Buffer.from(buf));
    } catch(e: any) { res.status(500).json({ error: e.message }); }
  });


  // (biosuit/live, biosuit/history, biosuit/latest, jarvis endpoints already declared above)

  // Cloudflare Tunnel management 
  let tunnelProcess: any = null;
  let tunnelUrl: string | null = null;

  app.post("/api/tunnel/start", async (req: any, res: any) => {
    if (tunnelProcess) { res.json({ ok: true, url: tunnelUrl, msg: "Already running" }); return; }
    try {
      const { spawn } = await import("child_process");
      const cf = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${actualPort}`], {
        shell: true, stdio: ["ignore", "pipe", "pipe"]
      });
      tunnelProcess = cf;
      let found = false;
      const timeout = setTimeout(() => {
        if (!found) res.status(408).json({ error: "Tunnel start timeout — is cloudflared installed?" });
      }, 20000);

      cf.stderr.on("data", (d: Buffer) => {
        const line = d.toString();
        // cloudflared prints the URL to stderr
        const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match && !found) {
          found = true;
          tunnelUrl = match[0];
          clearTimeout(timeout);
          res.json({ ok: true, url: tunnelUrl });
        }
      });
      cf.on("exit", () => { tunnelProcess = null; tunnelUrl = null; });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/tunnel/stop", (_req: any, res: any) => {
    if (tunnelProcess) { tunnelProcess.kill(); tunnelProcess = null; tunnelUrl = null; }
    res.json({ ok: true });
  });

  app.get("/api/tunnel/status", (_req: any, res: any) => {
    res.json({ running: !!tunnelProcess, url: tunnelUrl });
  });

  // Serve public/ folder (icons, manifest, connect.html, app.html) 
  app.use(express.static(path.join(__dirname, "public")));

  // /app dedicated phone/mobile web app (no Electron deps) 
  app.get("/app", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "app.html"));
  });
  app.get("/app.html", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "app.html"));
  });

  // Auto-redirect phones hitting root to /app 
  // If the request is from a mobile browser (not Electron), send /app directly
  app.use("/", (req: any, res: any, next: any) => {
    const ua = (req.headers["user-agent"] || "") as string;
    const isElectron  = ua.includes("Electron");
    const isLocalhost = req.hostname === "localhost" || req.hostname === "127.0.0.1";
    const isMobile    = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
    if (isMobile && !isElectron && !isLocalhost && req.path === "/") {
      res.sendFile(path.join(__dirname, "public", "app.html"));
      return;
    }
    next();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        host: '0.0.0.0',
        port: actualPort,
        allowedHosts: [
          'localhost',
          '127.0.0.1',
          'nexusais.app',
          '.nexusais.app',
          'nexusais.app.',
        ],
        hmr: {
          server: undefined
        }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // #region agent log
    debugLog('pre-fix','H1','server.ts:prod-static:init','Initializing production static paths',{
      cwd: process.cwd(),
      dirname: __dirname,
      distPath: path.join(__dirname, "dist"),
      indexPath: path.join(__dirname, "dist", "index.html"),
    });
    // #endregion
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        // #region agent log
        debugLog('post-fix','H2','server.ts:prod-static:skip-api','Skipping SPA fallback for API path',{
          path: req.path,
          method: req.method,
        });
        // #endregion
        next();
        return;
      }
      // #region agent log
      debugLog('pre-fix','H2','server.ts:prod-static:route','Serving SPA fallback index',{
        path: req.path,
        method: req.method,
      });
      // #endregion
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  // NexusLink auto-start: read saved settings and start on boot 
  // Phone app connects to this to use PC's Ollama + Gemini key
  app.get("/api/nexuslink/token", async (_req, res) => {
    try {
      const { readFile, access } = await import("fs/promises");
      const settingsPath = path.join(process.cwd(), ".nexus_remote_token");
      await access(settingsPath);
      const token = (await readFile(settingsPath, "utf-8")).trim();
      res.json({ token, port: nexusLinkPort });
    } catch { res.json({ token: null, port: nexusLinkPort }); }
  });

  app.post("/api/nexuslink/save-token", async (req, res) => {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: "token required" });
    const { writeFile } = await import("fs/promises");
    await writeFile(path.join(process.cwd(), ".nexus_remote_token"), token, "utf-8");
    res.json({ ok: true });
  });

  // Ollama models list used by phone app to populate model selector
  // /api/models Ollama model list, no auth required (local use) 
  app.get("/api/models", async (_req: any, res: any) => {
    try {
      const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new Error("Ollama not running");
      const data = await r.json() as any;
      const models = (data.models || []).map((m: any) => m.name);
      res.json({ models, default: 'mdq100/Gemma3-Instruct-Abliterated:12b' });
    } catch { res.json({ models: [], default: 'mdq100/Gemma3-Instruct-Abliterated:12b' }); }
  });

  app.get("/api/nexuslink/ollama-models", async (req: any, res) => {
    // Auth check
    let savedToken = "";
    try {
      const { readFile, access } = await import("fs/promises");
      const tp = path.join(process.cwd(), ".nexus_remote_token");
      await access(tp);
      savedToken = (await readFile(tp, "utf-8")).trim();
    } catch {}
    const incoming = (req.headers["x-nexus-token"] || req.query["nexus_token"]) as string;
    if (savedToken && incoming !== savedToken) { res.status(401).json({ error: "Unauthorized" }); return; }
    try {
      const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new Error("Ollama not running");
      const data = await r.json() as any;
      res.json({ models: (data.models || []).map((m: any) => m.name) });
    } catch { res.json({ models: [] }); }
  });

  // Ollama direct proxy on main port phone hits /ollama/* to use PC models
  // Auth via x-nexus-token header
  app.all("/ollama/*", async (req: any, res: any) => {
    try {
      // Read token
      let savedToken = "";
      try {
        const { readFile, access } = await import("fs/promises");
        const tp = path.join(process.cwd(), ".nexus_remote_token");
        await access(tp);
        savedToken = (await readFile(tp, "utf-8")).trim();
      } catch {}
      const incoming = (req.headers["x-nexus-token"] || req.query["nexus_token"]) as string;
      if (savedToken && incoming !== savedToken) {
        res.status(401).json({ error: "Invalid token" }); return;
      }
      const targetPath = req.path.replace(/^\/ollama/, "");
      const targetUrl = `http://127.0.0.1:11434${targetPath}`;
      const fetchRes = await fetch(targetUrl, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        body: ["GET","HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body),
      });
      res.status(fetchRes.status);
      res.setHeader("Content-Type", fetchRes.headers.get("content-type") || "application/json");
      res.end(Buffer.from(await fetchRes.arrayBuffer()));
    } catch (e: any) { res.status(502).json({ error: `Ollama proxy: ${e?.message}` }); }
  });

  // Gemini proxy on main port phone hits /gemini to use PC's API key
  app.post("/gemini", async (req: any, res: any) => {
    try {
      let savedToken = "";
      try {
        const { readFile, access } = await import("fs/promises");
        const tp = path.join(process.cwd(), ".nexus_remote_token");
        await access(tp);
        savedToken = (await readFile(tp, "utf-8")).trim();
      } catch {}
      const incoming = (req.headers["x-nexus-token"] || req.query["nexus_token"]) as string;
      if (savedToken && incoming !== savedToken) { res.status(401).json({ error: "Invalid token" }); return; }
      const { model = "gemini-3-flash-preview", prompt, systemPrompt } = req.body;
      // Get API key from nexus_settings file if possible
      let apiKey = process.env.GEMINI_API_KEY || "";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const body = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        generationConfig: { temperature: 0.9, topP: 0.95, maxOutputTokens: 8192 },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      };
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json() as any;
      if (!r.ok) throw new Error(data?.error?.message || `Gemini error ${r.status}`);
      res.json({ text: data?.candidates?.[0]?.content?.parts?.[0]?.text || "" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  let nexusLinkPort = 3000; // same port as main app after proxy routes above

  const server = app.listen(actualPort, "0.0.0.0", () => {
    const nets2 = networkInterfaces();
    let lanIp = '';
    for (const iface of Object.values(nets2)) {
      for (const net of (iface || [])) {
        if ((net as any).family === 'IPv4' && !(net as any).internal) { lanIp = (net as any).address; break; }
      }
      if (lanIp) break;
    }
    process.env.NEXUS_PORT = String(actualPort);
    console.log(`\n┌─────────────────────────────────────────────────┐`);
    console.log(`│  NexusAI v4.3.0  — running                      │`);
    console.log(`│  Local:   http://localhost:${actualPort}                │`);
    if (lanIp) {
    console.log(`│  LAN:     http://${lanIp}:${actualPort}           │`);
    console.log(`│  HTTPS:   https://${lanIp}:${actualPort + 1}         │`);
    console.log(`│  ↑ Use HTTPS URL on iPhone for STT to work!     │`);
    }
    console.log(`└─────────────────────────────────────────────────┘\n`);
    ensureStartupLoop();
    runStartupAuditGuarded("startup").catch((e: any) => {
      console.error("[startup] initial audit failed:", e?.message || e);
    });
  });

  // HTTPS server on port+1 required for Web Speech API on iPhone 
  // Safari blocks microphone on HTTP (non-localhost). Self-signed cert is enough
  // since we just need HTTPS, not a trusted CA. User will see "untrusted cert"
  // warning once, then it works permanently.
  (async () => {
    try {
      const { readFile, writeFile, access, mkdir } = await import("fs/promises");
      const certsDir = path.join(process.cwd(), ".certs");
      const keyPath  = path.join(certsDir, "key.pem");
      const certPath = path.join(certsDir, "cert.pem");

      // Generate self-signed cert if not exists
      let needsGen = false;
      try { await access(keyPath); await access(certPath); }
      catch { needsGen = true; }

      if (needsGen) {
        try {
          await mkdir(certsDir, { recursive: true });
          const { execSync } = require("child_process");
          // Try openssl first
          const nets3 = networkInterfaces();
          let lip = 'localhost';
          for (const iface of Object.values(nets3)) {
            for (const n of (iface || [])) {
              if ((n as any).family === 'IPv4' && !(n as any).internal) { lip = (n as any).address; break; }
            }
          }
          execSync(
            `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes ` +
            `-subj "/CN=${lip}" -addext "subjectAltName=IP:${lip},IP:127.0.0.1,DNS:localhost"`,
            { timeout: 15000, stdio: 'ignore' }
          );
          console.log('[HTTPS] Self-signed cert generated at', certsDir);
        } catch (e) {
          console.log('[HTTPS] openssl not found — HTTPS server skipped (install openssl for iPhone STT support)');
          return;
        }
      }

      const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)]);
      const httpsPort = actualPort + 1;
      const httpsServer = https.createServer({ key, cert }, app);
      httpsServer.listen(httpsPort, "0.0.0.0", () => {
        const nets3 = networkInterfaces();
        let lanIp2 = '';
        for (const iface of Object.values(nets3)) {
          for (const n of (iface || [])) {
            if ((n as any).family === 'IPv4' && !(n as any).internal) { lanIp2 = (n as any).address; break; }
          }
          if (lanIp2) break;
        }
        console.log(`[HTTPS] Server on port ${httpsPort} — https://${lanIp2}:${httpsPort}`);
        console.log(`[HTTPS] On iPhone: accept the untrusted cert warning once, then STT works!`);
      });

      // WebSocket support on HTTPS server too
      httpsServer.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url || '', `https://${request.headers.host}`).pathname;
        if (pathname === '/api/ws/terminal' || pathname === '/api/ws/ssh') {
          wss.handleUpgrade(request, socket as any, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        } else { socket.destroy(); }
      });

    } catch (e: any) {
      console.log('[HTTPS] Could not start HTTPS server:', e.message);
    }
  })();

  // WebSocket Server for Terminal & SSH
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

    if (pathname === '/api/ws/terminal' || pathname === '/api/ws/ssh') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req) => {
    const pathname = new URL(req.url || '', `http://${req.headers.host}`).pathname;

    if (pathname === '/api/ws/terminal') {
      console.log('Client connected to Local Terminal WS');
      const isWin = process.platform === 'win32';
      const shellCmd  = isWin ? 'cmd.exe'  : 'bash';
      const shellArgs = isWin ? []         : [];
      const shellEnv  = isWin
        ? { ...process.env }
        : { ...process.env, TERM: 'xterm-256color' };
      const shell = spawn(shellCmd, shellArgs, {
        env: shellEnv,
        cwd: process.cwd()
      });

      // Send a welcome banner
      const banner = isWin
        ? '\r\n\x1b[32m[NexusAI] Windows Terminal Connected\x1b[0m\r\n'
        : '\r\n\x1b[32m[NexusAI] Terminal Connected\x1b[0m\r\n';
      setTimeout(() => { try { ws.send(banner); } catch {} }, 200);

      // Register for terminal-inject
      const session = { shell, ws };
      terminalSessions.add(session);

      ws.on('message', (message) => {
        shell.stdin.write(message.toString());
      });

      shell.stdout.on('data', (data) => {
        ws.send(data.toString());
      });

      shell.stderr.on('data', (data) => {
        ws.send(data.toString());
      });

      shell.on('exit', () => {
        ws.close();
      });

      ws.on('close', () => {
        shell.kill();
        terminalSessions.delete(session);
      });
    } else if (pathname === '/api/ws/ssh') {
      console.log('Client connected to SSH WS');
      if (!SshClient) {
        ws.send(JSON.stringify({ type: 'error', message: 'SSH not available on this machine (ssh2 not installed). Use your main PC.' }));
        ws.close();
        return;
      }
      const conn = new SshClient();
      let stream: any = null;
      let isReady = false;

      // Handle incoming messages from WebSocket
      ws.on('message', (msg) => {
        // If we haven't connected yet, the first message MUST be the config
        if (!isReady) {
          try {
            const config = JSON.parse(msg.toString());
            // Basic validation
            if (!config.host || !config.username) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid SSH configuration' }));
                return;
            }

            console.log(`Connecting to SSH: ${config.host}:${config.port}`);
            
            conn.on('ready', () => {
              console.log('SSH Client Ready');
              isReady = true;
              ws.send(JSON.stringify({ type: 'status', status: 'connected' }));
              
              conn.shell({ term: 'xterm-256color' }, (err, s) => {
                if (err) {
                  ws.send(JSON.stringify({ type: 'error', message: 'Shell error: ' + err.message }));
                  return ws.close();
                }
                
                stream = s;
                
                stream.on('close', () => {
                  console.log('SSH Stream Closed');
                  ws.close();
                  conn.end();
                });
                
                stream.on('data', (data: any) => {
                  ws.send(data);
                });
                
                stream.stderr.on('data', (data: any) => {
                  ws.send(data);
                });
              });
            });

            conn.on('error', (err) => {
              console.error('SSH Connection Error:', err);
              ws.send(JSON.stringify({ type: 'error', message: err.message }));
              ws.close();
            });

            conn.on('close', () => {
                console.log('SSH Connection Closed');
                ws.close();
            });

            conn.connect(config);

          } catch (e) {
            console.error('Error parsing SSH config:', e);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid configuration format' }));
            ws.close();
          }
        } else {
          // We are connected, forward data to SSH stream
          if (stream) {
            stream.write(msg);
          }
        }
      });

      ws.on('close', () => {
        if (stream) stream.end();
        conn.end();
      });
    }
  });
}

startServer();

