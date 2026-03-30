param(
  [ValidateSet("watchdog", "startup", "manual")]
  [string]$Mode = "watchdog"
)

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $rootDir "logs"
$logFile = Join-Path $logDir "nexusai-24x7-watchdog.log"
$startupDir = Join-Path $rootDir ".nexus_startup"
$auditStampPath = Join-Path $startupDir "watchdog-audit.stamp"
$statusUrl = "http://127.0.0.1:3000/api/startup/autopilot/status"
$runCheckUrl = "http://127.0.0.1:3000/api/startup/run-check"
$nodeExeDefault = "C:\Program Files\nodejs\node.exe"
$tsxCli = Join-Path $rootDir "node_modules\tsx\dist\cli.mjs"

if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
if (!(Test-Path $startupDir)) { New-Item -ItemType Directory -Path $startupDir -Force | Out-Null }

function Write-Log {
  param([string]$Message)
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $logFile -Value "[$stamp][$Mode] $Message"
}

function Get-NodeExe {
  if (Test-Path $nodeExeDefault) { return $nodeExeDefault }
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "Node.js executable not found."
}

function Ensure-ServiceRunning {
  param([string]$Name)
  $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (!$svc) {
    Write-Log "Service '$Name' not found (skipping)."
    return
  }
  if ($svc.StartType -ne "Automatic") {
    try {
      Set-Service -Name $Name -StartupType Automatic -ErrorAction Stop
      Write-Log "Service '$Name' startup type set to Automatic."
    } catch {
      Write-Log "WARN: could not set '$Name' startup type: $($_.Exception.Message)"
    }
  }
  if ($svc.Status -ne "Running") {
    try {
      Start-Service -Name $Name -ErrorAction Stop
      Write-Log "Service '$Name' started."
      Start-Sleep -Seconds 2
    } catch {
      Write-Log "WARN: failed to start '$Name': $($_.Exception.Message)"
    }
  } else {
    Write-Log "Service '$Name' already running."
  }
}

function Ensure-OllamaRunning {
  $ollama = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq "ollama.exe" } | Select-Object -First 1
  if ($ollama) {
    Write-Log "Ollama already running (PID $($ollama.ProcessId))."
    return
  }
  try {
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden -ErrorAction Stop | Out-Null
    Write-Log "Ollama started."
  } catch {
    Write-Log "WARN: could not start Ollama: $($_.Exception.Message)"
  }
}

function Test-NexusHealth {
  try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 4
    return ($res.status -eq "ok")
  } catch {
    return $false
  }
}

function Get-NexusServerProcesses {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -eq "node.exe" -and
      $_.CommandLine -match "nexusai\\node_modules\\tsx\\dist\\cli\.mjs" -and
      $_.CommandLine -match "server\.ts"
    }
}

function Restart-NexusServer {
  $nodeExe = Get-NodeExe
  if (!(Test-Path $tsxCli)) {
    throw "tsx CLI not found at $tsxCli"
  }

  $existing = @(Get-NexusServerProcesses)
  foreach ($proc in $existing) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      Write-Log "Stopped stale NexusAI process PID $($proc.ProcessId)."
    } catch {
      Write-Log "WARN: failed stopping PID $($proc.ProcessId): $($_.Exception.Message)"
    }
  }

  $env:NODE_ENV = "production"
  $env:VITE_MODELS_PATH = "C:\Users\abdul\models"
  $env:NODE_OPTIONS = "--max-old-space-size=4096"

  $proc = Start-Process -FilePath $nodeExe -ArgumentList "`"$tsxCli`" server.ts" -WorkingDirectory $rootDir -WindowStyle Hidden -PassThru
  Write-Log "Started NexusAI server process PID $($proc.Id)."

  $healthy = $false
  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Milliseconds 800
    if (Test-NexusHealth) { $healthy = $true; break }
  }
  if ($healthy) {
    Write-Log "NexusAI health check passed after restart."
  } else {
    throw "NexusAI health check failed after restart."
  }
}

function Run-StartupAuditIfDue {
  $shouldRun = $false
  $autopilotRunning = $false
  try {
    $status = Invoke-RestMethod -Uri $statusUrl -TimeoutSec 5
    $autopilotRunning = [bool]$status.running
    if ($autopilotRunning) {
      Write-Log "Startup audit skipped: /api/startup/autopilot/status reports running (reason=$($status.inFlightReason))."
      return
    }
  } catch {
    Write-Log "WARN: could not read autopilot status endpoint: $($_.Exception.Message)"
  }

  if (!(Test-Path $auditStampPath)) {
    $shouldRun = $true
  } else {
    $last = (Get-Item $auditStampPath).LastWriteTime
    if (((Get-Date) - $last).TotalMinutes -ge 10) { $shouldRun = $true }
  }
  if (!$shouldRun) {
    Write-Log "Startup audit skipped (not due yet)."
    return
  }

  try {
    Invoke-RestMethod -Method Post -Uri $runCheckUrl -ContentType "application/json" -Body '{"reason":"watchdog"}' -TimeoutSec 12 | Out-Null
    Set-Content -Path $auditStampPath -Value (Get-Date -Format "o") -Encoding UTF8
    Write-Log "Startup audit completed via /api/startup/run-check."
  } catch {
    Write-Log "WARN: startup audit failed: $($_.Exception.Message)"
  }
}

try {
  Write-Log "Watchdog tick started."
  Ensure-ServiceRunning -Name "cloudflared-nexusai"
  Ensure-OllamaRunning

  if (!(Test-NexusHealth)) {
    Write-Log "NexusAI health failed. Restarting server."
    Restart-NexusServer
  } else {
    Write-Log "NexusAI already healthy."
  }

  Run-StartupAuditIfDue
  Write-Log "Watchdog tick finished OK."
  exit 0
}
catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  exit 1
}

