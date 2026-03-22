# NexusAI v4.5.0 -- Complete Feature & Page Reference

This document covers every page, every feature, every system, and the full technical
architecture of NexusAI. Written for Cursor hand-off. Every section is production reality
as of v4.5.0 -- not planned features, not stubs.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | Electron (electron-main.cjs) -- custom TitleBar, drag region CSS |
| Frontend | React 18, TypeScript 5, Vite 6.4 |
| Styling | TailwindCSS 4 (JIT), lucide-react icons |
| Animation | motion/react (Framer Motion v11) |
| Backend | Express.js in server.ts, compiled live with tsx |
| Local AI | Ollama REST API -- localhost:11434 |
| Cloud AI | Google Gemini API (optional, via API key) |
| Voice Input | Browser Web Speech API, Whisper STT (backend) |
| Voice Output | ElevenLabs TTS, browser SpeechSynthesis |
| Agent System | OpenClaw CLI (openclaw agent -m "..." --local) |
| Hardware | ESP32 WiFi nodes via WebSocket/MQTT, nRF52840 BLE wrist straps |

**Primary AI Model:** `mdq100/Gemma3-Instruct-Abliterated:12b` (~8GB VRAM)
**OpenClaw AI Model:** `hf.co/mradermacher/Qwen3.5-9B-Claude-4.6-HighIQ-THINKING-HERETIC-UNCENSORED-i1-GGUF:Q4_K_M` (~6GB VRAM)

Both models are uncensored. The Qwen HERETIC model outputs `<think>...</think>` reasoning
tokens which are stripped by `stripThinkingTags()` in api.ts before anything reaches the UI.

---

## Project File Structure

```
nexusai/
|-- electron-main.cjs        Electron entry point. Creates BrowserWindow, auto-starts
|                            OpenClaw gateway on launch, handles app lifecycle.
|-- server.ts                Express backend. All /api/* endpoints. 1800+ lines.
|-- vite.config.ts           Build config. Excludes C:/Users/abdul/models from bundle.
|-- rebuild.bat              Full rebuild + launch (CRLF-only, no Unicode chars).
|-- sanitize_unicode.py      Pre-build cleaner -- strips dangerous Unicode punctuation
|                            from all .tsx/.ts files before vite runs. Prevents esbuild
|                            regex misparse errors.
|-- .env                     GEMINI_API_KEY here. Survives localStorage overwrites.
|-- src/
|   |-- App.tsx              Main router. Sidebar nav, mobile layout, auth gate,
|                            nexus-navigate event listener for Dashboard quick-nav.
|   |-- pages/               31 page components (see full list below)
|   |-- components/
|   |   |-- AISidebar.tsx    Floating overlay AI panel -- chat, voice, screen watch.
|   |   |-- AddonsTab.tsx    Hardware linking UI (ESP32 firmware, drone tunnel, etc.)
|   |   |-- NotesTab.tsx     Notes and reminders panel, label-filtered list.
|   |   |-- PersistentAI.tsx Always-on sidebar AI (red theme, uncensored, tab-style).
|   |   |-- Sidebar.tsx      Main navigation sidebar with all page links.
|   |   |-- TitleBar.tsx     Custom Electron window titlebar with drag region.
|   |   |-- NexusAssistant.tsx  Floating assistant widget.
|   |-- services/
|   |   |-- api.ts           All AI calls. getOllamaChatResponse(), getOllamaResponse(),
|   |                        askOllama(), getGeminiResponse(), stripThinkingTags(),
|   |                        extractThinking(). Resolves model names against Ollama tags.
|   |   |-- nexusTools.ts    130-tool registry. parseToolCalls(), executeTool(),
|   |                        processToolCalls(), getToolSystemPrompt(). XML tag format.
|   |   |-- elevenlabs.ts    ElevenLabs TTS API wrapper.
|   |-- context/
|       |-- SettingsContext.tsx  Global settings. providers.gemini key lives here.
|                                Mirrors to gemini_api_key in localStorage for compat.
```

---

## CRITICAL BUILD RULE FOR CURSOR

esbuild (inside Vite) has a parser bug where it misreads JSX as a regex when:
1. A `<div style={{` opens on one line but has no `>` closing the tag on that line.
2. Unicode punctuation chars (em dash, arrows, ellipsis, etc.) appear in comments or JSX text.

**The `sanitize_unicode.py` script runs automatically before every build** to fix #2.
For #1 -- **always write JSX tag openings on a single line in Cursor.**

Verify div balance before saving any page:
```bash
python3 -c "
import re,sys
c=open(sys.argv[1]).read()
d=sum(len(re.findall(r'<div[\s>]',l))-len(re.findall(r'<div[^>]*/>', l))-len(re.findall(r'</div>',l)) for l in c.splitlines())
print(f'depth={d}')
" src/pages/YourPage.tsx
```
Must print `depth=0`. Anything else = build failure.

---

---

# PAGES -- COMPLETE REFERENCE

---

## 1. Dashboard

**File:** `src/pages/Dashboard.tsx` | **Lines:** 310

The home screen. Shows live data polled every 15 seconds from 4 server endpoints.

**What it shows:**
- Service status pills -- Ollama (green/red with model count), OpenClaw gateway (green/red :18789), NexusAI server (always green :3000)
- Metric cards with animated number counters: CPU core count, RAM used % (free/total GB), VRAM active (which models are currently loaded), Node.js runtime version
- Active AI Config panel -- two cards showing: Primary model (Gemma3 Abliterated 12B, purple, no tools) and OpenClaw model (HERETIC 9B, red, tool-capable) with VRAM estimates
- Installed models list from Ollama -- active models highlighted with a star badge
- Quick Nav grid -- 8 buttons dispatching `window.dispatchEvent(new CustomEvent('nexus-navigate', {detail: 'pageid'}))` which App.tsx catches to navigate directly
- Rolling live system log -- last 20 entries, updates every 5 seconds

**Data sources:**
- `/api/agent/status` -- CPU, RAM, GPU name, platform, Node version
- `/api/models` -- Ollama model list (no auth required)
- `/api/ollama/loaded` -- models in VRAM right now via `GET localhost:11434/api/ps`
- `/api/openclaw/health` -- gateway status

---

## 2. Chat (Chat Studio)

**File:** `src/pages/Chat.tsx` | **Lines:** 495

The main AI conversation interface. The most feature-dense page in the app.

**Core conversation:**
- Full history maintained in state, last 8 messages sent as context window
- System prompt configurable: AI name (default "Nexus"), persona, custom instructions
- Auto-scrolling message list with timestamps
- Shift+Enter for newline, Enter to send

**Tool System (130 tools, injected into system prompt):**
- When `toolsEnabled` is ON (default), `getToolSystemPrompt()` is appended to the system prompt before every message. This tells the AI to emit `<nexus_tool name="tool_id" param="value">` XML tags in its responses.
- After receiving the AI response, `processToolCalls()` parses all `<nexus_tool>` tags, executes each tool (hitting `/api/tools/<id>` server-side or running `simulate()` fallback), and appends results as formatted blocks to the message.
- Tools work with: Qwen3 8B, Qwen2.5 7B, Qwen2.5-Coder 7B, GLM 4.7 Flash
- Tools do NOT work with: Gemma3 (any variant), Dolphin, LLaVA -- these models ignore XML instructions
- Toggle in toolbar: "Tools: ON (130)" / "Tools: OFF"

**Web Search:**
- "Search: Auto" mode -- search activates automatically when the model and query suggest it's needed (news, current events, "find", "latest", etc.)
- "Search: Force ON" mode -- every message triggers a Gemini web search grounding call regardless of content
- Uses GEMINI_TOOLS.googleSearch -- requires Gemini API key

**Voice Call Mode:**
- Click the phone icon to enter voice call mode
- Records audio via browser MediaRecorder API
- Streams to `/api/stt/transcribe` (Whisper on backend) for transcription
- AI response is spoken aloud via ElevenLabs or browser TTS
- Call timer, status display ("Listening...", "Thinking...", "Speaking...")

**Screen Watch:**
- Takes a screenshot of the current tab every N seconds
- Image is encoded as base64 and injected into the next message to the AI
- AI can comment on what changed on screen
- Uses LLaVA 7B for vision processing if the main model doesn't support images

**Reasoning Display:**
- When using a thinking model (Qwen HERETIC), `extractThinking()` pulls out the `<think>` block
- Shown as a collapsible faded italic section above the main response
- Allows you to see the AI's reasoning chain without it being part of the answer

**Model selector:**
- Dropdown with all installed Ollama models plus Gemini cloud options
- "no tools" badge shown on Gemma/Dolphin/LLaVA entries

---

## 3. NexusCentre

**File:** `src/pages/NexusCentre.tsx` | **Lines:** 464

Multi-specialist AI hub. Instead of one AI doing everything, queries are automatically routed to the most appropriate specialist persona based on the content.

**8 Specialists (all prompts editable in sidebar):**
- **General** (lightning bolt, indigo) -- Default. Direct and thorough.
- **Coder** (laptop, emerald) -- Expert software engineer. Returns production-ready code with explanations.
- **Reasoner** (brain, purple) -- Rigorous analytical thinker. Shows all reasoning steps, good for maths and logic.
- **Writer** (pen, yellow) -- Professional writer. Essays, emails, blog posts, stories.
- **Researcher** (search, blue) -- Searches web for current info, cites sources.
- **Agent** (robot, cyan) -- Autonomous agent. Executes commands on PC via `<exec>command</exec>` tags, loops up to 12 iterations.
- **OSINT** (detective, red) -- OSINT analyst. Web-searches for digital footprint, usernames, emails. Generates platform link grid.
- **Tutor** (graduation cap, pink) -- Patient teacher. Explains with examples and analogies.

**Auto-routing logic (`detectSpec()`):**
Regex matches on the user message to pick the specialist automatically. "who is", "find info on" -> OSINT. "python", "debug", "script" -> Coder. "write", "essay" -> Writer. "run", "terminal", "check my pc" -> Agent. Auto-route can be toggled off to manually lock to a specialist.

**Tool auto-selection:**
For Gemini model, web search and code execution tools activate based on query content -- no manual toggle needed. OSINT and researcher queries always get web search.

**Agent mode:**
PC execution loop. AI emits `<exec>command</exec>`, system runs it via `/api/agent/exec`, returns stdout/stderr, AI continues. Max 12 steps. Full output shown in message feed.

**Self-Improve panel:**
Select any source file (Chat.tsx, NexusClaw.tsx, server.ts, etc.), enter an instruction or leave blank for AI to decide, hit "Improve". Reads the file, sends to AI with "return complete improved file" instruction, writes result back to disk. The app can improve its own code.

**Memory system:**
Key-value store in localStorage. AI can read memory context (injected into system prompt). Add memories manually in sidebar or let the AI save them.

**PC Status panel:**
Pulls from `/api/agent/status` -- CPU cores, RAM %, GPU name, OS, Node version.

**OSINT Quick panel:**
Enter username, email, or IP. AI runs OSINT investigation. Results shown as text plus a grid of 10 direct platform links (GitHub, X, Instagram, TikTok, YouTube, Reddit, LinkedIn, etc.)

**Model selector:**
Fetches `/api/models` to populate dropdown. Shows all installed Ollama models plus Gemini cloud options grouped by category.

---

## 4. NexusClaw

**File:** `src/pages/NexusClaw.tsx` | **Lines:** 800

Dual-agent interface. Two completely different AI systems in one panel, plus AI-to-AI collaboration mode.

### Tab 1: OpenClaw (red theme)

Routes every message through the OpenClaw CLI:
```
openclaw agent -m "your message" --local --timeout 60000
```
The server (`/api/openclaw/chat`) shells this out and blocks until openclaw returns the full response as stdout. `d.reply` comes back directly in the HTTP response -- no polling needed.

OpenClaw has autonomous agent capabilities: web search, file operations, code execution, tool calling. It uses the Qwen3.5 HERETIC model which supports structured tool call JSON.

**VRAM guard:** Before firing the CLI, sendClaw() checks `loadedModels[]` state. If any Ollama model is loaded (e.g. Gemma from Direct Chat), it calls `/api/ollama/unload` first (sets `keep_alive: 0` on Ollama's API, immediate VRAM eviction). Shows "Freeing VRAM..." system message. Waits 600ms for eviction to complete. This prevents two 8-12GB models being in VRAM simultaneously which would cause OOM on consumer GPUs.

**Offline banner:** Shows when gateway is unreachable, with retry button and note to use Direct Chat for Gemma models.

### Tab 2: Direct Chat (purple theme)

Talks to Ollama directly, bypassing OpenClaw entirely. Designed for models that don't support tool calling (Gemma3 Abliterated, Dolphin, LLaVA).

- Reads OpenClaw workspace memory (`/api/openclaw/workspace/read` -- `~/.openclaw/workspace/MEMORY.md` + today's daily note) and injects it as context
- Writes session summaries back every 10 messages via `/api/openclaw/workspace/write`
- History persisted to localStorage key `nexusclaw_direct` (last 100 messages)
- Think tags stripped automatically

### AI Collab Mode (toggle inside Direct Chat banner)

The two AIs work together on a task autonomously:

1. You enter a task description and set max turns (2 / 4 / 6 / 8 / 10)
2. **Gemma (purple)** acts as the Planner. Its system prompt tells it to write `[TO_OPENCLAW]: instruction` to send tasks to OpenClaw, or `[TASK_COMPLETE]: summary` when done.
3. System extracts the instruction and forwards it to OpenClaw via `/api/openclaw/chat`
4. Polls `/api/openclaw/messages` for up to 30 seconds waiting for an assistant reply
5. **OpenClaw (red)** executes the instruction (web search, code, file ops) and returns results
6. Gemma reads the reply and plans the next step
7. Loop continues until [TASK_COMPLETE] or max turns
8. Stop button (`collabStop.current = true`) halts immediately

Messages displayed as purple Gemma bubbles vs red OpenClaw bubbles. Max turns slider. Collab task suggestion chips on empty screen.

### Tab 3: Net Scan

Ping scanner. Target input field, quick IP buttons (192.168.1.1, 127.0.0.1, 8.8.8.8, 1.1.1.1), runs `ping -n 2 -w 1000 <target>` via `/api/agent/exec`.

### Tab 4: Terminal

Full command line interface. Input bar, scrolling output with color-coded stdout (cyan prompt, emerald output, red error). Runs commands via `/api/agent/exec`.

### Tab 5: Status

OpenClaw gateway connection details, active model card with VRAM info and tool capability badge, workspace memory display (first 400 chars), quick action buttons that navigate to the Terminal tab with suggested commands.

### Model Dropdown

Groups models into:
- **For OpenClaw tab** (tool-capable): HERETIC 9B (6GB, starred), Qwen3 8B, Qwen2.5 7B, Qwen2.5-Coder 7B, GLM 4.7 Flash
- **For Direct Chat tab** (no tools): Gemma3 Abliterated 12B, Gemma3 12B/4B, Dolphin, LLaVA, Dolphin Mistral

Each entry shows VRAM estimate in GB. Switching model calls `/api/openclaw/model` which runs `openclaw config set agents.defaults.model "model"`.

---

## 5. NexusCode

**File:** `src/pages/NexusCode.tsx` | **Lines:** 459

AI-powered code editor. Black/emerald theme (bg-black, text-emerald-400). Think VS Code but the AI writes everything.

**Left panel -- File Tree:**
- Folder tree with collapse/expand
- Click file to open in editor
- Supports LOCAL target (this PC) and KALI target (SSH to Kali machine)
- New file button, delete button per file

**Centre -- Editor:**
- Inline textarea editor (not read-only) with emerald text on black background
- Tab key inserts 2 spaces
- Ctrl+S saves file to disk via `/api/agent/write`
- Language detection (Python, JS, TS, HTML, CSS, etc.) shown in status bar

**Right panel -- AI Chat + Terminal:**

Chat tab: AI agent mode for code tasks.
- System prompt: "You are the NexusCode AI Agent -- an expert software engineer..."
- AI writes complete files using `FILE: filename.ext` block syntax: everything between `FILE: name` and the next `FILE:` or end of response is extracted as file content
- Multi-file projects: AI can generate 5-10 files in one response, each correctly separated
- Results shown as clickable file list, click to open in editor

Terminal tab: Embedded xterm.js terminal.
- Dynamically imported (`await import('xterm')`) to avoid SSR issues
- xterm theme: black background, #10b981 cursor, green/purple/blue ANSI palette
- FitAddon for proper terminal resizing
- Connected to shell via `/api/agent/exec` stream

**Preview tab:** iframe for HTML/web output

**TODO panel:** In-editor task tracking for the current project

---

## 6. NexusPersonalAI

**File:** `src/pages/NexusPersonalAI.tsx` | **Lines:** 508

Uncensored personal AI companion. Deep red/black theme (#0a0005 background, #dc2626 red accents). No content filters. Always-on.

**Models offered:**
- Dolphin LLaMA3 8B (primary uncensored)
- Dolphin Mistral 7B
- WizardVicuna 13B
- Dolphin Mixtral 8x7B
- LLaVA 7B (vision support)

**Features:**
- Persistent conversation memory across sessions (localStorage)
- Screen watch -- takes screenshots and sends to AI as vision input
- Voice input/output (wake word detection, Whisper STT, TTS response)
- Right sidebar shows live screen capture feed
- Copy individual messages
- Loading animation (3 red bouncing dots) -- keyframes injected via useEffect (avoids esbuild issue)
- Online/offline indicator with pulsing green dot
- Uncensored system prompt: no topic restrictions, no safety caveats

---

## 7. AIMaker

**File:** `src/pages/AIMaker.tsx` | **Lines:** 536

Build custom AI characters with specific personalities and system prompts.

**6 Archetype templates:**
- Personal Assistant -- helpful, proactive, task-focused
- Domain Expert -- deep technical knowledge in a specific field
- Unrestricted -- zero filters, raw model
- Creative Partner -- imaginative, expressive
- Roleplay Character -- stays in character always
- (Custom) -- blank slate

**Builder sections:**
- Custom system prompt (raw textarea with character count)
- Name and personality fields
- Rules editor -- add specific behavioral rules as a list
- Design tab -- avatar selection, color theme, greeting message

**AI-powered system prompt generation:**
"Generate for me" button -- describe what you want in plain English, AI generates a complete optimised system prompt. Uses Gemma 3 12B Abliterated.

**Test panel:**
Chat directly with your created AI before saving. Instant feedback.

**Save/export:**
Creates a JSON profile that can be loaded into any chat page.

---

## 8. Agents

**File:** `src/pages/Agents.tsx` | **Lines:** 396

Multi-agent swarm orchestration. Multiple specialized AI agents working in sequence to complete complex objectives.

**Agent roles:**
Agents are defined by their system prompts. The swarm includes a Strategist, Coder, and Reviewer working in sequence. Each reads the previous agent's output before writing its own.

**6 preset objectives:**
- Python App -- "Build a Python web scraper that fetches and parses..."
- Business Plan -- "Create a detailed business plan for..."
- Security Audit -- "Design a comprehensive security audit framework..."
- Data Analysis -- "Write a Python script to analyze..."
- API Server -- multi-endpoint REST API
- AI Pipeline -- ML training and inference pipeline

**Step-by-step execution:**
Each agent's thought process, action, and result shown as color-coded log entries (think/action/result/pass/error/done). Max steps configurable. PC execution enabled/disabled toggle.

**Custom objective:**
Free-text field for any task. Model selector for which Ollama model runs the swarm.

---

## 9. NexusAITools

**File:** `src/pages/NexusAITools.tsx` | **Lines:** 382

Visual interface for all 135 tools in the NexusTools registry.

**Tool categories (13 groups):**
Core System, Gesture & Input, Control Systems, Vision & Perception, Data & Logging, Audio & Voice, Physiology & Biometrics, AI Intelligence, Communication, System Optimisation, Testing & Dev, Safety & Control, Advanced, Notes & Dev Log

**Left panel -- Category tree:**
Collapsible categories with emoji icons, color-coded badges, tool count per category. Click category to expand and see all tools.

**Tool card:**
- Tool name, emoji, category badge
- Description (what it does, when the AI will call it)
- Parameter input form -- one input per parameter
- AI Mode toggle -- instead of filling params manually, describe what you want in plain English and the AI interprets it
- Quick fill buttons with example values

**Execution:**
- Server-side tools: POSTs to `/api/tools/<id>` with params as JSON body
- Simulate fallback: if server endpoint not found, runs the JS `simulate()` function with the params to generate realistic mock output
- Result shown in output panel with copy button

**Notes & Dev Log tools (callable by AI in Chat):**
- `save_note(text, label)` -- AI saves a reminder
- `read_notes(label)` -- AI reads your notes back
- `save_devlog(message, type)` -- AI logs a change
- `read_devlog(limit, version)` -- AI reads recent changes
- `clear_notes(label)` -- AI deletes notes

---

## 10. BusinessHub

**File:** `src/pages/BusinessHub.tsx` | **Lines:** 1564

Full AI-powered business management suite. The largest page in the app.

### AI Receptionist
A fully configurable AI phone receptionist for a local business.
- Customise: business name, type, address, greeting script, behavior instructions
- Live voice call simulation: records your audio, transcribes via Whisper, AI responds as the receptionist, speaks response via ElevenLabs
- Call log with full transcript
- Call timer, status display
- Pre-built greeting template that auto-fills the business name
- Multiple AI voice options (ElevenLabs voice IDs)

### Proposal Generator
Enter a business/lead name and type, AI writes a complete professional sales proposal for the AI Receptionist service ($335/mo pricing built-in). Exports as formatted text.

### Website Outreach
Cold email generator for website leads. Enter business info, AI writes a personalised cold email offering website design services ($500-1500). Ready to send.

### Lead Manager
- **Lead generation**: Enter a business type and location, radius. AI generates a list of local businesses that likely have no website (small, family-owned, older). Real-world prospect data.
- **Lead cards**: Each lead has name, type, address, phone, status (new/contacted/quoted/closed), priority (hot/warm/cold), notes
- **Pipeline stats**: Revenue, addresses found, hot leads, close rate, call volume -- updates live
- **Actions per lead**: Generate proposal, draft outreach email, call with AI receptionist, view on map

### Invoice System
- Create professional invoices with line items, quantity, unit price
- Automatic VAT calculation (configurable rate)
- Total calculation with margins shown
- Export to PDF (uses browser print)
- Invoice numbering, date, client details

### Profit Calculator
Real-time margin calculator. Enter your cost and the client price, see profit and margin percentage update instantly. Pre-set at $335 client price for the receptionist service.

---

## 11. LifeHub

**File:** `src/pages/LifeHub.tsx` | **Lines:** 990

Personal AI productivity suite. Multiple tools in one page, tab-switched.

### Flashcards (SRS system)
- Create decks of flashcards (front/back)
- Spaced repetition scheduling: each card has `due` timestamp, `interval` (days), `ease` (1.3-2.5), `reps` count
- Study mode: shows front, you flip to reveal back, rate: Easy (+2 days * ease), Hard (+1 day), Fail (reset to 1 day)
- AI generates flashcard decks: enter a topic, AI returns 10-20 front/back pairs as JSON
- Due count badge shows how many cards need review today
- Deck browser with card counts and last-studied date

### Notes / Knowledge Base
- Markdown notes with title, tags, pinned status
- AI-powered actions: Summarise (compress long notes), Improve (rewrite for clarity), Expand (add more detail), Explain (ELI5), Quiz (generate questions from note content)
- Tag filtering, pin to top, search
- Created/updated timestamps

### Tasks
- Todo items with priority (low/medium/high), category, due date
- Focus mode: single-task view with timer
- Category filtering (work, personal, project, health, etc.)
- AI generates task lists from a description

### Habits
- Daily habit tracking with streak counter
- Visual calendar grid showing completion history
- Add habits with icon and color
- Streak fires emoji animation on completion

### Budget
- Income/expense tracking with category labels
- Monthly summary: total income, total expenses, net
- Chart showing spending by category
- AI spending analysis: "You spent 40% on food this month..."

### Mind Map
- Text-based mind map generator
- Enter a topic, AI generates structured branches
- Rendered as nested expandable tree

---

## 12. YouTubeCenter

**File:** `src/pages/YouTubeCenter.tsx` | **Lines:** 799

AI toolkit for YouTube content creators.

**Dashboard:** Channel stats mock display, recent video performance grid, quick action buttons.

**Script Writer:**
- Enter video topic, target audience, tone (educational/entertaining/both), video length
- AI generates full video script with sections: hook, intro, main content beats, outro, CTA
- Generates chapter timestamps
- SEO-optimised title suggestions (5 variants)
- Description copy (with keywords)
- Hashtag recommendations (30 tags)

**Thumbnail Ideas:**
- Enter video topic and style preference
- AI generates 5 thumbnail concepts with: text overlay idea, background description, focal element, color scheme
- Each concept rated for CTR potential

**SEO Analyser:**
- Paste any YouTube video title/description
- AI scores it (0-100) for: title click-through, description keyword density, tag relevance
- Specific improvement suggestions

**Video Editor (AI-assisted):**
- Timeline view of a video project
- AI suggests cut points, B-roll ideas, transition effects based on script content

**File Manager:**
- Organise YouTube project files (scripts, thumbnails, assets)
- Upload and categorise

---

## 13. MediaStudio

**File:** `src/pages/MediaStudio.tsx` | **Lines:** 414

AI image generation interface. Connects to ComfyUI (offline) or DALL-E/Stability AI (online).

**Prompt Builder:**
- 5 style presets: Photorealistic, Anime, Illustration, Cinematic, Fantasy
- Each preset injects a quality prefix (score_9, score_8_up, etc.) automatically
- Positive prompt input with character count
- Negative prompt (what to avoid)
- Aspect ratio selector: 1:1, 16:9, 9:16, 4:3, 3:4
- Steps, CFG scale, sampler selector (Euler a, DPM++ 2M Karras, etc.)

**Offline mode (ComfyUI):**
- Connects to local ComfyUI at localhost:8188
- Sends generation request as ComfyUI workflow JSON
- Polls `/api/comfyui/history` for completion
- Displays generated image inline

**Online mode:**
- DALL-E 3 via OpenAI API (requires key)
- Stability AI via API (requires key)
- Selectable model, quality, style

**Gallery:**
- Grid of all generated images in this session
- Click to expand, download button per image
- Prompt shown below each image

---

## 14. LLMLibrary

**File:** `src/pages/LLMLibrary.tsx` | **Lines:** 491

Model browser and Ollama model manager.

**Model catalogue:**
Curated list of 25+ models across categories: text generation, coding, reasoning, uncensored, vision. Each entry shows:
- Model name, short description
- Size on disk (GB)
- VRAM required
- Ollama pull tag
- "Featured" badge for recommended models
- Category badge

**Install flow:**
Click "Install" -> runs `ollama pull <tag>` via `/api/agent/exec` -> real-time stdout shown -> completion confirmation.

**Installed models view:**
List of all locally installed models (from `/api/models`). Shows: name, size (GB), parameter count, quantization level, family. Delete button calls `ollama rm <name>`.

**Search:**
Filter by name, category, or description text.

---

## 15. ModelManager

**File:** `src/pages/ModelManager.tsx` | **Lines:** 327

Cross-platform model catalog. Goes beyond just Ollama.

**Sections:**
- **Library** -- your installed Ollama models with management controls
- **All** -- all available models in the catalogue
- **Discover** -- recommended models by use case
- **Loaded** -- models currently in VRAM right now (from `/api/ollama/loaded`)

**Model type categories:**
Text Generation, Text-to-Speech, Text-to-Image, Image-to-Text, Text-to-Video, Text-to-3D, Image-to-3D

Includes non-Ollama models: ComfyUI models for image, Bark/Piper for TTS, OpenAI Whisper for STT -- install scripts for each.

---

## 16. ModelTrainer

**File:** `src/pages/ModelTrainer.tsx` | **Lines:** 433

Fine-tuning pipeline for creating custom Ollama models.

**Dataset Generator:**
- Enter a topic, target style, number of examples
- Generates batches of instruction/response pairs using Gemma 12B
- Returns structured JSON: `[{instruction: "...", response: "..."}, ...]`
- Progress log shows batch-by-batch generation
- Saves dataset to `~/nexusai-datasets/<name>/dataset.jsonl` on disk

**Model base selector:**
Choose base model to fine-tune: LLaMA 3.2 3B, LLaMA 3.1 8B, Mistral 7B, HERETIC 9B, DeepSeek R1 7B, Phi-4 14B

**Training via Unsloth (WSL2):**
- Generates a complete Python training script using Unsloth library
- WSL status check (confirms WSL2 + Ubuntu accessible)
- Runs training inside WSL: `wsl python3 train.py`
- Loss curve visualisation (bar chart, live updating)
- Training log panel

**Export:**
- Converts trained LoRA adapter to GGUF format
- Creates Modelfile for Ollama
- Registers with Ollama: `ollama create <name> -f Modelfile`
- Model appears in Ollama's model list after success

**Jobs list:**
History of training runs with status (pending/running/done/error), dataset name, base model, timestamps.

---

## 17. NexusOSINT

**File:** `src/pages/NexusOSINT.tsx` | **Lines:** 632

Open Source Intelligence tool. Finds public digital footprint of a person, username, email, or IP.

**Investigation modes:**
- **Username** -- checks 28 platforms simultaneously via server proxy
- **Email** -- breach check, domain analysis, associated accounts
- **Phone** -- carrier lookup, region identification, associated services
- **Google Dork** -- generates targeted dork queries for the subject
- **Name** -- social media presence, professional profiles

**28 platforms checked (username mode):**
GitHub, X/Twitter, Instagram, TikTok, YouTube, Reddit, LinkedIn, Facebook, Telegram, Steam, Twitch, Snapchat, Pinterest, Medium, Dev.to, Behance, Dribbble, Keybase, SoundCloud, Substack, Pastebin, HackerNews, GitLab, BitBucket, Spotify, Fiverr, Etsy, Replit

Each platform checked in batches via `/api/osint/check` which pings the profile URL. Returns HTTP status -- 200 = found, 404 = not found.

**AI analysis:**
After platform checks, AI runs a full OSINT investigation report:
1. Confirmed active accounts with direct links
2. Digital footprint assessment (consistent username = likely same person)
3. Inferred information (location clues, professional background, interests)
4. Recommended next investigation steps

**Results display:**
Platform cards with found/not found status, direct links to found profiles, AI report in full below.

---

## 18. KaliVM

**File:** `src/pages/KaliVM.tsx` | **Lines:** 591

SSH interface to a remote Kali Linux machine. Security testing command library.

**Connection:**
SSH config stored in Settings (IP, username, password, port 22). Connection tested on page load. Connected/offline status indicator.

**SSH Terminal:**
Full terminal with command input, scrolling output, stdin/stdout/stderr color differentiation. Commands run via `/api/kali/exec` which SSHes to the configured Kali machine.

**5 command categories (21+ preloaded commands):**

*Recon:* nmap, whois, dig, theHarvester, recon-ng, subfinder, amass

*Web:* nikto, gobuster, dirb, sqlmap, wfuzz, whatweb

*Network:* netdiscover, arp-scan, tcpdump, wireshark, responder

*Password:* hydra, john, hashcat, crunch, cewl, medusa

*Exploit:* msfconsole, searchsploit, meterpreter, exploit/multi/handler, post/multi/manage/shell_to_meterpreter

Each command has a description and a `TARGET` placeholder. Click a command to insert it into the terminal with the target pre-filled from the target input field.

**Target management:**
Target IP/domain field at top. All preloaded commands reference `TARGET` which gets substituted.

---

## 19. BioSuitMonitor

**File:** `src/pages/BioSuitMonitor.tsx` | **Lines:** 659

Real-time biometric dashboard for the ESP32 BioMesh suit.

**5 body zones:**
Torso, Left Arm, Right Arm, Left Leg, Right Leg. Each zone has:
- Heart rate sensor (BPM)
- Body temperature (deg C)
- IMU (accelerometer X/Y/Z, gyroscope X/Y/Z)
- SpO2 oxygen saturation (%)
- Skin conductance (stress indicator)

**Visual body map:**
SVG human silhouette with colored overlay per zone. Zone color indicates status: green (normal), amber (elevated), red (critical alert). Click zone to see detailed readings.

**Live charts:**
Time-series charts for each metric. Rolling 60-second window. Line charts with smooth curves. Data comes from `/api/jarvis/node/data` (ESP32 BioMesh pushes here every 100ms).

**Alert system:**
Configurable thresholds per metric. When exceeded, zone turns red and alert log entry appears. Alert sound via Web Audio API. Critical alert sends command to BioMesh ESP32 to activate buzzer.

**Architecture tab:**
Data flow diagram showing ESP32 -> PC pipeline. Documents the protocol (MQTT or WebSocket), topics, and command format.

---

## 20. BioSuit

**File:** `src/pages/BioSuit.tsx` | **Lines:** 569

BioMesh suit configuration and calibration page.

**Sensor calibration:**
Individual calibration wizards per sensor type. HR calibration takes 30 seconds of resting data to set baseline. Temperature calibration against a known reference. IMU zero-point calibration.

**Threshold editor:**
Set alert thresholds for each metric per zone. E.g. HR > 150bpm in torso = critical. Temperature > 38degC = elevated.

**Firmware update:**
Download latest BioMesh firmware, flash to ESP32 via esptool (calls `/api/agent/exec` with esptool command).

**Status overview:**
All sensor online/offline status, last data received timestamps, battery level per ESP32 node.

---

## 21. JarvisTable

**File:** `src/pages/JarvisTable.tsx` | **Lines:** 675

AI workbench hub. PC is the AI brain. ESP32 nodes are dumb sensor edges.

**Architecture (correct):**
```
PC (Gemma 12B -- all computation)
  |-- BioMesh ESP32 (192.168.1.101)
  |     UP: HR, temp, IMU, SpO2 at 50Hz
  |     DOWN: LED, buzzer, haptic commands
  |-- Voice I/O ESP32 (192.168.1.102)
  |     UP: mic PCM audio -> PC Whisper STT
  |     DOWN: TTS audio bytes -> I2S speaker
  |-- ESP32-CAM (192.168.1.103)
        UP: MJPEG video stream
        DOWN: flash, pan/tilt commands
```

No Raspberry Pi. The PC IS the hub.

**Tab 1: Chat**
AI conversation with live sensor context injected into system prompt. If BioMesh is online, current HR and temp are included: "Live sensor data: HR=72bpm, Temp=36.8degC". AI responses automatically sent to Voice ESP32 for TTS playback if it's online. Suggestion chips on empty screen.

**Tab 2: Nodes**
Per-node status cards (online/offline, IP, last seen, RSSI). Each node type has specific controls:
- BioMesh: LED on/off, buzz alert pattern, calibrate button. MQTT topic list.
- Voice I/O: listen, mute, test TTS ("Jarvis online"), volume controls. Data flow explanation.
- Camera: snapshot, flash on/off, reboot. Stream URL display.

**Tab 3: Architecture**
Visual data-flow diagram showing the PC/ESP32 system. Bidirectional arrows with UP/DOWN labels. Key principles listed: ESP32s are dumb edges, PC is the only brain, modular, safe boundaries, 30-50ms latency.

**Tab 4: Projects**
Project manager for workbench projects. Name, description, file list, quick prompts per project. Active project context injected into Chat system prompt.

**Settings drawer:**
Protocol selector (WebSocket recommended vs MQTT), MQTT broker IP, Camera stream URL, AI model selector, per-node IP configuration.

---

## 22. DroneRef

**File:** `src/pages/DroneRef.tsx` | **Lines:** 1320

Full interactive technical reference for the Hybrid Gesture-Control Drone System. 9 parts, 39 subsections covering the entire hardware and software architecture.

**9 Parts:**

**Part 1 -- PCB Hardware Design**
1.1 PCB Layout (28x18mm two-layer board, JST-SH connectors, analog/digital ground split)
1.2 Connector System (strain relief, vibration resistance, hot-swap capability)
1.3 IMU Placement (distance from motor traces, decoupling capacitors)
1.4 Flex Sensor Fatigue (bend radius limits, expected cycle life)
1.5 Battery Architecture (LiPo sizing, charging IC, protection circuit)
1.6 Thermal Management (heat dissipation, component placement)

**Part 2 -- Sensor Processing**
2.1 IIR Filter on nRF52840 Cortex-M4F HW FPU (<2us per sample, 8Hz/500Hz coefficients)
2.2 Adaptive Filtering (dynamic cutoff based on motion state)
2.3 Confidence Scoring (signal quality metric per gesture)
2.4 Temporal Features (velocity, acceleration from sensor data)
2.5 Cross-Sensor Anomaly (consistency check between redundant sensors)
2.6 Temperature Compensation (flex sensor resistance drift correction)

**Part 3 -- Gesture Recognition**
3.1 Two-Layer Architecture (fast threshold SM for common gestures + HMM for complex)
3.2 Vocabulary Expansion (how to add new gestures without retraining)
3.3 Online Adaptation (drift correction during flight)

**Part 4 -- AI Autopilot**
4.1 Gesture-Aware State Machine (modes: idle, gesture-control, autonomous, failsafe)
4.2 Predictive Blend (gesture command + velocity feedforward + position hold)
4.3 AI Behavior Modes (aggressive/sport/cinematic response profiles)
4.4 Follow-Me Improvements (ByteTrack tracking + depth fusion + Lucas-Kanade velocity)
4.5 Behavioral Cloning (dataset format for training from human demonstrations)

**Part 5 -- MAVLink Control**
Unified 50Hz SET_POSITION_TARGET_LOCAL_NED stream. Active hover heartbeat. GCS timeout failsafe.

**Parts 6-9 -- Safety, RF, Monitoring, System Health**

**Navigation:**
Sidebar with all 9 parts collapsible. Prev/Next subsection arrows. Active section highlighted. Part badges (PCB, Sensor, Gesture, AI, MAVLink, Safety, RF, Monitoring, Health).

**Download:**
Single button generates `drone-gesture-system.zip` containing 11 real implementation files: arbitrator.py (50Hz blend), gesture_engine.py (SM+HMM), ble_receiver.py, follow_me.py, mavlink_bridge.py, sensor_config.h, iir_filter.h, arducopter.param, calibrate.py, log_analyzer.py, ground station script.

---

## 23. NexusMesh (3D)

**File:** `src/pages/NexusMesh.tsx` | **Lines:** 521

3D mesh generation from text descriptions or images.

**3 backends:**

**HunyuanDiT 2.1 (best quality):**
Sends prompt to local ComfyUI HunyuanDiT workflow. Returns 3D mesh as OBJ file. Uses `/api/comfyui/hunyuan3d` endpoint. Best for organic shapes, characters, props.

**LLaMA-Mesh (offline, fastest):**
Sends prompt directly to Ollama with LLaMA-Mesh model loaded. AI generates raw OBJ text format (vertex list, face list). Parsed and rendered in Three.js canvas. Instant but simpler geometry.

**Gemini (cloud, online):**
Uses Gemini API with vision capabilities to interpret 2D image and generate 3D mesh description, then generates OBJ from that. Requires Gemini API key.

**3D Viewer:**
Three.js canvas embedded in page. WebGL render with orbit controls (rotate, zoom, pan). Wireframe toggle. Export button downloads OBJ file. Material editor (color, metalness, roughness).

**Prompt enhancer:**
"Enhance prompt" button uses AI to expand a simple description into a detailed technical 3D model prompt with topology guidance, material hints, and polygon budget targets.

---

## 24. SmartHome

**File:** `src/pages/SmartHome.tsx` | **Lines:** 643

Home automation control panel. Connects to Home Assistant via REST API.

**Sections:**
- **Lights** -- toggle, brightness slider, color picker per light
- **Climate** -- thermostat control, temperature display, fan speed
- **Security** -- lock/unlock doors, arm/disarm alarm, camera feeds
- **Energy** -- power usage charts, per-device consumption
- **Sensors** -- all sensor readings (temperature, humidity, motion, door/window)
- **HA Integration** -- Home Assistant token input, test connection

**Scene system:**
3 pre-built scenes: Movie Night (dim lights, lower temp), Work Mode (full brightness), Away (all off, security on). Custom scene builder: name, icon, set of device actions.

**InfluxDB logging:**
Sensor data streamed to InfluxDB at configurable interval. Historical charts pull from InfluxDB. Profile -> Long-Lived Access Tokens workflow documented.

**AI control:**
Type natural language commands: "Turn off all lights in the bedroom" or "Set the thermostat to 22 degrees" -- AI parses and dispatches the correct Home Assistant API calls.

---

## 25. Doomcase OS / Doomcase

**File:** `src/pages/Doomcase.tsx` | **Lines:** 775

System monitor and build guide for the custom Doomcase ITX PC.

**Sections:**
- **OS** -- current Doomcase OS status, version info, installed packages list
- **Build** -- PCB assembly guide, component list, wiring diagrams
- **Procure** -- parts list with prices, vendor links, stock status
- **Assembly** -- step-by-step hardware assembly with images
- **Online** -- network config, remote access setup
- **Power** -- power management, battery stats (if mobile build), charge cycles
- **AI** -- Ollama status, loaded models, VRAM usage, performance benchmarks
- **Comms** -- networking (WiFi, Ethernet, Tailscale), port status
- **Tools** -- diagnostic utilities (CPU stress test, RAM test, disk benchmark)
- **Survival** -- offline mode guide, what works without internet

**Live stats panel:**
Battery charge %, solar input (if equipped), system temperature (degC), storage used (%). All pulled from PC hardware APIs.

**Doomcase OS Builder integration:**
Links to Settings -> Addons -> Doomcase OS section for ISO build guide.

---

## 26. OSBuilder

**File:** `src/pages/OSBuilder.tsx` | **Lines:** 1490

AI-assisted custom operating system design tool.

**6 OS base types:**
- Scratch -- bare metal, total control
- Linux-based -- custom Arch/Debian/Alpine derivative
- Android-based -- AOSP fork
- Windows-like -- Win32 compatibility layer
- RTOS/Embedded -- FreeRTOS / Zephyr for microcontrollers
- Jetson Orin -- NVIDIA Jetson-specific, CUDA-optimised AI OS

**Build targets:**
Desktop, Server, Mobile, Embedded/IoT, AI Workstation, Gaming, Security/Pentest

**4 AI agent roles (work in sequence):**
- Architect -- designs system structure, decides base distro, package manager, init system
- UI Engineer -- designs desktop environment, compositor, theming
- Security -- hardens the OS, configures firewall, disk encryption, secure boot
- (Generalist) -- handles any uncategorised system configuration

**Project workflow:**
1. Choose OS base and build target
2. Describe your requirements in natural language
3. AI agents generate: base configuration, package list, kernel patches needed, desktop config, security hardening steps
4. Complete build script generated (bash for Linux, batch for Windows-like)
5. Save project (persisted to localStorage)

**Quick prompts per OS type:**
Contextual example prompts that make sense for each base -- e.g. for Jetson Orin: "Optimise for real-time AI inference with CUDA 12.x and TensorRT 10" 

---

## 27. UncensoredModels

**File:** `src/pages/UncensoredModels.tsx` | **Lines:** 600

Curated catalogue of uncensored AI models with install guides.

**19 models catalogued across categories:**
- Language: WizardLM Vicuna Uncensored, WizardLM 7B, Dolphin Mistral, Dolphin LLaMA 3, Nous Hermes 2 Mistral, LLaMA 3 SpeakEasy, SOLAR Uncensored 10.7B, Mistral 7B Raw
- Image: Flux Uncensored, Juggernaut XL (CivitAI), Animagine XL 3.1, Realistic Vision V6
- Code: DeepSeek Coder uncensored, Code LLaMA uncensored
- Custom: HERETIC Qwen3.5 9B (your primary OpenClaw model), Abliterated Gemma 12B (your primary model)

**Per-model entry:**
Name, description, VRAM requirement, size, Ollama pull command or download URL, notes on capabilities and content policy (what it will/won't refuse).

**Install guide (7 steps):**
Platform-specific Ollama install, model pull commands with VRAM requirements, test commands, NexusAI integration, Modelfile parameter tuning (temperature, top_p, repeat_penalty), GPU acceleration setup (NVIDIA CUDA, AMD ROCm, Apple Metal), troubleshooting common errors.

---

## 28. Settings

**File:** `src/pages/Settings.tsx` | **Lines:** 886

**8 tabs:**

**General:** AI name (default "Nexus"), AI persona textarea, Ollama URL, default model dropdown (fetches from `/api/models`), fallback model, prefer Ollama toggle, max tokens (8192), auto-search toggle.

**AI Models:** Full Ollama model management. Pull new models, see installed models with size/params, set default, quick-switch between models. Status indicators per model.

**API Keys:** 
- Gemini API key (password field, show/hide toggle, copy button). Note: store in `.env` as `GEMINI_API_KEY` to prevent localStorage collision.
- ElevenLabs API key + voice ID selector
- OpenClaw section: host/port (strips http:// and :port on input), auth token, messenger bridge (Telegram/WhatsApp/Slack), bot token, chat ID, cron schedule (presets: every 9am, hourly, every 30min), burner mode toggle, test connection button

**Voice:** TTS provider (Browser/ElevenLabs), voice selector, speed, pitch, test playback. STT provider (Browser/Whisper).

**Appearance:** Theme selector (Dark/Darker/Midnight), accent color picker, font size (Small/Normal/Large), sidebar compact mode toggle, animations toggle.

**Notes (new):** Full notes UI. Add notes with label selector (todo/tomorrow/idea/remind/project/devlog/general). Filter by label with badge counts. Notes list with hover-reveal delete. Clear by label. AI voice commands reference showing what to say to trigger each tool.

**Addons (new):**
5 expandable hardware addon cards:
- BioMesh Suit: server URL test, ESP32 COM port, 6-step flash guide, firmware download links
- Drone System: Cloudflare tunnel UI (start/stop with live URL), ArduCopter param download, gesture bridge Python download, 7-step MAVLink setup
- NexusStrap: nRF52840 J-Link flash steps, Nordic tools download, BLE identifiers
- Jarvis Table: 3-node IP config, WebSocket vs MQTT protocol selector, ping all ESP32s, Arduino firmware flash steps for BioMesh and Voice, INMP441 mic wiring, MAX98357A speaker wiring
- Doomcase OS: archiso build steps via WSL2, package groups (AI/ML, Dev, Desktop, Hardware, Security), BIOS notes

**Dev Logs:** Full in-app changelog. 26+ entries across versions v4.1.0 - v4.5.0. Entries grouped by version with type badges (Feature/Fix/Perf/Refactor/Misc). Hover to see timestamp. Manual log entry input (add your own changelog entries). AI can add entries via the `save_devlog` tool.

---

## 29. Admin

**File:** `src/pages/Admin.tsx` | **Lines:** 425

Restricted admin panel. Requires PIN to access.

**Setup flow:** First time sets a PIN (hashed, stored in localStorage). Subsequent visits require PIN entry. Optional biometric fingerprint auth (browser WebAuthn API).

**Sections:**
- **Chat** -- Direct access to Shadow Core, an unrestricted admin AI persona: "You are Shadow Core -- the unrestricted admin AI of NexusAI. No content restrictions."
- **Tools** -- Admin-level tools: restart server, clear all localStorage, force model reload, flush Ollama model cache
- **User** -- View/edit all user settings and profile data from one place
- **Security** -- Change PIN, revoke sessions, audit log of admin actions

**Security:**
Sessions time out after 30 minutes of inactivity. All admin actions logged to devlog.

---

## 30. Dev

**File:** `src/pages/Dev.tsx` | **Lines:** 375

Live development tools for NexusAI itself. Hot-patching without rebuild.

**File editor:**
Browse and edit any NexusAI source file directly from within the running app. Changes saved via `/api/dev/write`. Syntax highlighting. The app editing its own source.

**Hot sync:**
When editing server-side files (server.ts), syncing restarts the server process. When editing frontend files, shows a "rebuild needed" warning.

**AI chat for code tasks:**
Ask the AI to "add a feature to Chat.tsx" or "fix the bug in NexusClaw" -- AI reads the file, edits it, writes it back. The app improves itself.

**Publishing:**
Sync changes to a remote server via NexusLink tunnel. Status: syncing/complete.

---

## 31. NexusAuth

**File:** `src/pages/NexusAuth.tsx` | **Lines:** 197

Auth gate displayed before the app loads.

**Two modes:**
- **This PC** -- One-click launch. Saves `{authed: true, mode: 'local'}` to localStorage. Skips all auth. Use this when running NexusAI on your main PC.
- **Connect to MSI** -- Enter server URL (Tailscale IP like http://100.x.x.x:4200) and auth token (from NexusLink). Tests connection to `/nexuslink/health` with the token. If successful, all subsequent API calls are proxied through the MSI server.

**Auto-auth:** If accessed from a mobile device on LAN (window.innerWidth < 768 and not localhost), auto-authenticates as local mode.

**Token storage:** `localStorage('nexus_auth')` -- `{serverUrl, token, authed, mode}`.

---

---

# COMPONENTS

---

## AISidebar

**File:** `src/components/AISidebar.tsx` | **Lines:** 820+

Floating AI overlay panel. Can be opened from any page. Positioned on the right edge of the screen, slides in/out.

- Full conversation with context from current page
- Voice input (push-to-talk or wake word)
- Screen watch: takes screenshot on demand, sends to AI with "What am I looking at?"
- 10+ model choices in dropdown
- Waveform visualizer during voice input (3 bouncing dots while AI responds)
- Conversation history persisted per session
- Keyframe animations injected via useEffect (avoids esbuild `<style>` backtick bug)

## PersistentAI

**File:** `src/components/PersistentAI.tsx`

Always-on AI panel that appears as a 36px tab on the right edge of the screen. Click to expand to 260px sidebar. Deep red theme. Uses uncensored models. Full conversation, copy messages, mute toggle. Independent of main Chat page -- separate conversation history. Loading animation via useEffect-injected keyframes.

## AddonsTab

**File:** `src/components/AddonsTab.tsx` | **Lines:** 762

Hardware system linking component (used inside Settings). Contains 5 expandable addon cards. See Settings section above for full detail.

## NotesTab

**File:** `src/components/NotesTab.tsx`

Notes and reminders component (used inside Settings). Textarea + label selector, filter chips, notes list with hover delete. References AI voice commands.

---

---

# SERVER ENDPOINTS REFERENCE

```
# Health & Config
GET  /api/health                  -- Simple health check
GET  /api/models                  -- Ollama model list (no auth)
GET  /api/network-info            -- LAN IP, port, primary URL

# Ollama VRAM Management
POST /api/ollama/unload {model}   -- Evict model (keep_alive:0)
GET  /api/ollama/loaded           -- Models in VRAM right now

# Agent / PC Execution
POST /api/agent/exec {command}    -- Run shell command, stream stdout
POST /api/agent/write {filePath, content} -- Write file to disk
POST /api/agent/read {filePath}   -- Read file from disk
GET  /api/agent/status            -- CPU, RAM, GPU, Node version

# OpenClaw
POST /api/openclaw/chat {text}    -- Shell out to openclaw CLI
POST /api/openclaw/model {model}  -- openclaw config set model
GET  /api/openclaw/messages       -- All stored messages
GET  /api/openclaw/status         -- Gateway connected/offline
POST /api/openclaw/reconnect      -- Restart gateway
GET  /api/openclaw/workspace/read -- Read ~/.openclaw/workspace/MEMORY.md
POST /api/openclaw/workspace/write {summary} -- Append to daily note

# Notes System
GET  /api/notes                   -- All notes (?label= filter)
POST /api/notes {text, label}     -- Save note
DELETE /api/notes                 -- Delete by ?id= or ?label= or all

# NexusTools (AI tool executors)
POST /api/tools/save_note {text, label}
POST /api/tools/read_notes {label?}
POST /api/tools/save_devlog {message, type}
POST /api/tools/read_devlog {limit?, version?}
POST /api/tools/clear_notes {label?}
POST /api/tools/<any_tool_id>     -- Generic tool executor

# Dev Log
GET  /api/dev-log                 -- All changelog entries
POST /api/dev-log {msg, type, version} -- Add entry

# JarvisTable ESP32 Nodes
POST /api/jarvis/node/register {id, name, type, ip, rssi}
POST /api/jarvis/node/data {id, data}
GET  /api/jarvis/nodes
POST /api/jarvis/node/command {nodeId, command, ...params}
POST /api/jarvis/command {node, command, text} -- Legacy

# Drone System
GET  /api/drone/params            -- ArduCopter .param file download
GET  /api/drone/gesture-bridge    -- Python MAVLink bridge download
GET  /api/drone/command           -- Gesture command poll (for bridge)
POST /api/drone/command           -- Send gesture command from UI

# NexusLink Remote Access
POST /api/remote/start            -- Start NexusLink tunnel
POST /api/remote/stop             -- Stop tunnel
GET  /api/remote/status           -- Tunnel running?
GET  /api/nexuslink/ollama-models -- Ollama models (auth required)
```

---

---

# API KEYS LOCATIONS

| Key | Where Stored | Where Read |
|---|---|---|
| Gemini | localStorage `gemini_api_key` AND `nexus_settings.providers.gemini` AND `.env GEMINI_API_KEY` | `getGeminiKey()` in api.ts -- checks env first, then localStorage |
| ElevenLabs | localStorage `elevenlabs_api_key` | services/elevenlabs.ts |
| OpenClaw token | localStorage `nexus_settings.openClawAuthToken` | server.ts openClawConfig |
| NexusLink token | localStorage `nexus_auth.token` | App.tsx proxy layer |

**IMPORTANT:** Due to a settings store conflict (Settings.tsx uses AppSettings schema, SettingsContext.tsx uses a different Settings schema, both writing to `nexus_settings`), Gemini keys can get wiped when one store overwrites the other. **Permanent fix: use `.env` file.** Create `C:\Users\abdul\nexusai\.env` with `GEMINI_API_KEY=AIza...`. This is read first and never gets overwritten.

---

---

# NEXUSTOOLS -- 135 TOOLS

Tools are XML-callable by any AI model in Chat (when tools are enabled). The AI emits `<nexus_tool name="tool_id" param1="value1">` tags. `processToolCalls()` finds and executes them.

**Categories and tool IDs:**

Core System (10): task_planner, reasoning_engine, memory_system, context_manager, decision_engine, strategy_generator, multi_agent, prediction_engine, state_tracker, tool_router

Gesture & Input (10): gesture_recogniser, gesture_calibration, gesture_trainer, finger_tracker, input_smoother, input_priority, confidence_scorer, multi_input_fusion, override_detector, mode_switcher

Control Systems (10): drone_commander, motor_control, servo_controller, pwm_generator, pid_assistant, nav_controller, auto_nav_planner, cmd_validation, cmd_ack, command_confirm

Vision & Perception (10): object_detection, face_detection, depth_estimation, optical_flow, scene_classifier, visual_anomaly, motion_tracker, target_tracker, frame_sampler, cam_stabilise

Data & Logging (10): sensor_logger, data_fusion, csv_exporter, data_validator, data_cleaner, data_compressor, timestamp_sync, audit_logger, replay_system, dataset_builder

Audio & Voice (10): wake_word, voice_recognition, speaker_id, tts_system, audio_logger, audio_event, sound_direction, voice_emotion, noise_filter, stream_handler

Physiology & Biometrics (10): hr_processor, hrv_calculator, temp_analyser, imu_classifier, stress_estimator, fatigue_predictor, biofeedback_ctrl, bio_anomaly, bio_calibration, recovery_estimator

AI Intelligence (10): adaptive_learning, rl_interface, realtime_graph, health_visualiser, digital_twin, scenario_sim, scenario_tester, realtime_collab, ai_coding, self_improve

Communication (10): device_commander, device_discovery, ble_manager, wifi_handler, secure_messaging, serial_tool, packet_optimizer, bc_system, alert_system, event_trigger

System Optimisation (10): load_monitor, memory_optimizer, latency_monitor, latency_optimizer, perf_profiler, bottleneck_detector, resource_allocator, auto_scaler, efficiency_analyser, power_tracker

Testing & Dev (10): unit_tester, fault_injector, sensor_emulator, sim_env, benchmarker, debug_logger, error_correction, error_recovery, version_control, background_runner

Safety & Control (10): estop_handler, failsafe_fallback, safe_mode, safety_override, watchdog_timer, failover_system, priority_system, permission_system, risk_assessment, command_parser

Advanced (10): swarm_control, slam_interface, env_mapper, predictive_maint, pattern_recognition, anomaly_detector, thermal_monitor, access_control, data_validator (adv), cal_assistant

Notes & Dev Log (5): save_note, read_notes, save_devlog, read_devlog, clear_notes

---

---

# VERSION HISTORY

| Version | Key Changes |
|---|---|
| v4.5.0 | NexusClaw dual chat + AI collab, 130-tool registry, VRAM management, HERETIC model, Dashboard live metrics, Notes system, Settings addons tab, JarvisTable ESP32 rewrite, DroneRef 9-part reference, all build errors fixed |
| v4.4.0 | OpenClaw CLI integration (WS abandoned), NexusCode black/emerald theme, BioSuit Monitor, DoomCase page, NexusPersonalAI |
| v4.3.0 | DroneRef page, KaliVM SSH interface, NexusMesh 3D generation |
| v4.2.0 | BusinessHub full suite, YouTubeCenter, ModelTrainer pipeline |
| v4.1.0 | NexusCentre multi-specialist, AIMaker, Agents swarm |
| v3.0 | Initial release: Chat, Settings, LLMLibrary, SmartHome |

---

---

# FUTURE PLANS (priority order)

### Fix Now
1. **Notes persistence** -- Server restart clears notes. Write to `~/.nexusai/notes.json`.
2. **Settings unification** -- Merge `AppSettings` and `Settings` schemas. One store, one schema. Fix the key-wiping bug permanently.
3. **NexusPersonalAI remaining multilines** -- L397 and L414 still have multiline style divs (documented in NEXUSAI_DEV_LOG.txt). Fix by collapsing to single line in Cursor.

### Short Term
4. **BioMesh live streaming** -- Wire `POST /api/jarvis/node/data` to push via SSE to BioSuitMonitor charts in real-time. Currently BioSuitMonitor polls but has no live data source.
5. **Voice ESP32 WebSocket handler** -- Implement the full audio stream endpoint in server.ts: ESP32 connects via WS, streams PCM audio, server pipes to Whisper, returns transcript, TTS audio sent back.
6. **Cloudflare tunnel auto-start** -- Add `cloudflared tunnel --url http://192.168.1.103:5760` to electron-main.cjs startup alongside OpenClaw gateway.
7. **HERETIC model pull guide** -- The exact pull command in Addons -> Addons tab and UncensoredModels page needs updating to confirm the hf.co path resolves correctly after `ollama pull`.

### Medium Term
8. **NexusClaw collab sessions** -- Persist collab turn-by-turn logs to the Notes system as `devlog` entries so you can review what the AIs decided.
9. **DroneRef live telemetry** -- Connect `/api/ws/drone` MAVLink WebSocket to DroneRef page. Overlay live attitude/GPS/battery data on the technical diagrams.
10. **NexusOSINT real checks** -- Replace the HTTP probe method with OpenClaw-executed Sherlock (`sherlock username`) for accurate results. OpenClaw can run Python tools.
11. **ModelTrainer Unsloth pipeline** -- Dataset generation works. The WSL2 Python training script generation works. The `wsl python3 train.py` execution and GGUF export are stubbed -- wire them up.
12. **Dev page hot-reload** -- When server.ts is edited and saved via the Dev page, auto-trigger `tsx server.ts` restart without requiring manual rebuild.

### Long Term
13. **SQLite persistent memory** -- Replace in-memory notes/conversations with `better-sqlite3`. Full conversation history search, cross-session memory, export.
14. **Multi-PC NexusMesh** -- Extend NexusMesh to coordinate multiple PC instances over NexusLink. Route: complex queries to high-VRAM PC, fast queries to low-power PC.
15. **BioSuit -> AI feedback loop** -- When HR exceeds threshold, AI interrupts current task and speaks via Voice ESP32: "Your heart rate is elevated -- take a break." Fully closed loop.
16. **Doomcase ISO** -- Complete the archiso profile. All dependencies pre-installed, Ollama + Gemma pulled on first boot, NexusAI auto-starts as a desktop app.
17. **PWA mobile app** -- `public/app.html` phone interface needs proper PWA manifest, service worker for offline, install prompt. Makes NexusAI installable on iPhone/Android.
18. **NexusClaw collab improvements** -- Show token count per turn, turn-level timeout warning, ability to inject messages mid-collab ("no, tell it to do X instead").

---

*NEXUSAI_DEV_LOG.txt contains 463 lines of detailed session-by-session history including every bug, root cause analysis, and thought process. Read it first in any new Cursor session.*
