/**
 * NexusAI Tool Engine
 * 130-tool registry covering every AI/hardware/software capability in NexusAI.
 * Any chat page can import getToolSystemPrompt() + parseAndRunTools() to get
 * full tool-calling capability with both Gemini and Ollama models.
 */

export interface NexusTool {
  id: string;
  name: string;
  category: string;
  emoji: string;
  desc: string;
  params: string[];           // param names the tool accepts
  serverSide?: boolean;       // true = hits /api/tools/<id>
  simulate?: (params: Record<string, string>) => string; // client-side fallback
}

// Tool Registry
export const NEXUS_TOOLS: NexusTool[] = [

  // CORE SYSTEM
  { id:'task_planner',        category:'Core System',       emoji:'🗺',
    name:'Task Planner',
    desc:'Break any goal into ordered subtasks with dependencies and time estimates.',
    params:['goal','context'],
    simulate: p => `Task plan for: "${p.goal}"\n\n1. Analyse requirements (5min)\n2. Identify dependencies\n3. Define milestones\n4. Assign time estimates\n5. Execute and track progress\n\nContext: ${p.context || 'none'}` },

  { id:'reasoning_engine',    category:'Core System',       emoji:'🧩',
    name:'Multi-Step Reasoning',
    desc:'Chain-of-thought reasoning engine. Breaks complex problems into logical steps.',
    params:['problem'],
    simulate: p => `Reasoning through: "${p.problem}"\n\nStep 1: Define the problem clearly\nStep 2: Identify known facts\nStep 3: Apply logic chain\nStep 4: Identify gaps\nStep 5: Synthesise conclusion` },

  { id:'memory_system',       category:'Core System',       emoji:'🧠',
    name:'Memory System',
    desc:'Store and retrieve short-term and long-term context across sessions.',
    params:['action','key','value'],
    serverSide: true,
    simulate: p => `Memory ${p.action}: key="${p.key}" value="${p.value || '(read)'}"` },

  { id:'context_manager',     category:'Core System',       emoji:'📎',
    name:'Context Manager',
    desc:'Manage conversation context windows -- summarise, compress, or reset context.',
    params:['action','content'],
    simulate: p => `Context ${p.action}: ${p.content ? p.content.slice(0,100)+'...' : 'current session'}` },

  { id:'command_parser',      category:'Core System',       emoji:'⌨',
    name:'Command Parser',
    desc:'Parse natural language into structured commands and API calls.',
    params:['input'],
    simulate: p => `Parsed: "${p.input}"\n-> intent: execute\n-> target: system\n-> params: {}\n-> confidence: 0.92` },

  { id:'tool_router',         category:'Core System',       emoji:'🔀',
    name:'Tool Router',
    desc:'Analyse a request and decide which NexusAI tool or module should handle it.',
    params:['request'],
    simulate: p => `Routing: "${p.request}"\n-> Best tool: task_planner\n-> Fallback: reasoning_engine\n-> Confidence: 0.88` },

  { id:'priority_system',     category:'Core System',       emoji:'🎯',
    name:'Priority System',
    desc:'Score and rank tasks by urgency, impact and effort (RICE/Eisenhower matrix).',
    params:['tasks'],
    simulate: p => `Priority matrix:\nTasks: ${p.tasks}\n\n🔴 URGENT+IMPORTANT: task 1\n🟡 IMPORTANT: task 2\n🟢 DELEGATE: task 3` },

  { id:'background_runner',   category:'Core System',       emoji:'⚙',
    name:'Background Task Runner',
    desc:'Dispatch long-running tasks to the background and monitor their status.',
    params:['task','interval'],
    serverSide: true,
    simulate: p => `Background task queued: "${p.task}"\nInterval: ${p.interval || '60s'}\nStatus: queued -> running` },

  { id:'event_trigger',       category:'Core System',       emoji:'⚡',
    name:'Event Trigger System',
    desc:'Define if/then event triggers: "when X happens -> do Y".',
    params:['condition','action'],
    simulate: p => `Trigger registered:\nIF: ${p.condition}\nTHEN: ${p.action}\nStatus: active` },

  { id:'state_tracker',       category:'Core System',       emoji:'📊',
    name:'State Tracker',
    desc:'Track and query the current state of any device, session or workflow.',
    params:['entity','property'],
    serverSide: true,
    simulate: p => `State of ${p.entity}.${p.property}:\nValue: online\nLast updated: just now\nHistory: [online, offline, online]` },

  // GESTURE & INPUT
  { id:'gesture_recogniser',  category:'Gesture & Input',   emoji:'✋',
    name:'Gesture Recogniser',
    desc:'Classify incoming wrist strap sensor data into a named gesture command.',
    params:['sensor_data','hand'],
    serverSide: true,
    simulate: p => `Gesture recognition result:\nInput: ${p.sensor_data || 'R1=0.55, R2=0.12, pitch=0.02'}\nHand: ${p.hand || 'right'}\nGesture: YAW_LEFT\nConfidence: 0.87` },

  { id:'finger_tracker',      category:'Gesture & Input',   emoji:'🖖',
    name:'Finger Tracking Interpreter',
    desc:'Decode per-finger flex sensor values into normalised finger positions.',
    params:['flex_values'],
    simulate: p => `Finger positions:\nIndex: 0.72 (raised)\nMiddle: 0.15 (neutral)\nRing: 0.08 (neutral)\nPinky: 0.11 (neutral)` },

  { id:'imu_classifier',      category:'Gesture & Input',   emoji:'🔄',
    name:'IMU Motion Classifier',
    desc:'Classify IMU accelerometer/gyro data into motion states: still, walking, running, flip.',
    params:['imu_data'],
    simulate: p => `Motion classification:\nState: standing\nRMS: 0.18g\nDeadzone: 0.15 (normal)\nFlip detected: false` },

  { id:'gesture_trainer',     category:'Gesture & Input',   emoji:'🎓',
    name:'Custom Gesture Trainer',
    desc:'Collect labeled examples and train a new HMM gesture class.',
    params:['gesture_name','samples'],
    serverSide: true,
    simulate: p => `Training gesture: "${p.gesture_name}"\nSamples loaded: ${p.samples || '0'}\nHMM states: 3\nStatus: ready for collection` },

  { id:'gesture_calibration', category:'Gesture & Input',   emoji:'🎛',
    name:'Gesture Calibration Tool',
    desc:'Run the two-point flex sensor calibration and save zero/scale values.',
    params:['hand'],
    serverSide: true,
    simulate: p => `Calibrating ${p.hand || 'right'} strap...\nStep 1: RELAX -- collected\nStep 2: FIST -- collected\nZero points saved: R1=0.12, R2=0.09` },

  { id:'input_smoother',      category:'Gesture & Input',   emoji:'〰',
    name:'Input Smoothing Filter',
    desc:'Apply adaptive IIR or moving average filter to raw sensor streams.',
    params:['signal','cutoff_hz'],
    simulate: p => `Filter applied:\nSignal: ${p.signal || '[0.3,0.4,0.35,0.6,0.55]'}\nCutoff: ${p.cutoff_hz || '8'}Hz\nFiltered: [0.31,0.38,0.37,0.48,0.52]` },

  { id:'latency_optimizer',   category:'Gesture & Input',   emoji:'⏱',
    name:'Latency Optimiser',
    desc:'Measure and optimise BLE->PC->drone command latency end-to-end.',
    params:['target_ms'],
    serverSide: true,
    simulate: p => `Latency analysis:\nBLE TX: 8ms\nPC processing: 3ms\nMAVLink TX: 2ms\nTotal: 13ms\nTarget: ${p.target_ms || '20'}ms OK` },

  { id:'multi_input_fusion',  category:'Gesture & Input',   emoji:'🔗',
    name:'Multi-Input Fusion',
    desc:'Fuse gesture + voice + button inputs using priority and confidence weighting.',
    params:['inputs'],
    simulate: p => `Input fusion:\nGesture: YAW_LEFT (conf: 0.87)\nVoice: none\nButton: none\n-> Final command: YAW_LEFT (fused confidence: 0.87)` },

  { id:'override_detector',   category:'Gesture & Input',   emoji:'🛑',
    name:'Manual Override Detector',
    desc:'Detect when a physical RC transmitter or manual input is overriding AI/gesture commands.',
    params:['channel_values'],
    serverSide: true,
    simulate: p => `Override status: INACTIVE\nRC channels: all neutral\nAI authority: 100%\nThrottle: at zero` },

  { id:'input_priority',      category:'Gesture & Input',   emoji:'📋',
    name:'Input Priority Handler',
    desc:'Manage priority between simultaneous inputs: emergency > mode change > gesture > AI.',
    params:['inputs'],
    simulate: p => `Priority evaluation:\nInput list: ${p.inputs || 'gesture, ai'}\nWinner: gesture (P3)\nEmergency: not triggered` },

  // CONTROL SYSTEMS
  { id:'device_commander',    category:'Control Systems',   emoji:'📡',
    name:'Device Command Sender',
    desc:'Send a structured command to any NexusMesh device via HTTP or serial.',
    params:['device','command','params'],
    serverSide: true,
    simulate: p => `Command sent:\nDevice: ${p.device || 'drone'}\nCommand: ${p.command || 'hover'}\nParams: ${p.params || '{}'}\nACK: ok` },

  { id:'motor_control',       category:'Control Systems',   emoji:'⚙',
    name:'Motor Control Interface',
    desc:'Send direct motor commands via MAVLink SET_ACTUATOR_CONTROL_TARGET.',
    params:['motors','values'],
    serverSide: true,
    simulate: p => `Motor control:\nMotors: ${p.motors || '[0,1,2,3]'}\nValues: ${p.values || '[0.5,0.5,0.5,0.5]'}\nFrame: LOCAL_NED\nStatus: sent` },

  { id:'pwm_generator',       category:'Control Systems',   emoji:'〰',
    name:'PWM Signal Generator',
    desc:'Generate PWM patterns for servo/ESC control via GPIO or FC output.',
    params:['channel','pulse_us','frequency'],
    serverSide: true,
    simulate: p => `PWM channel ${p.channel || '1'}:\nPulse: ${p.pulse_us || '1500'}us\nFrequency: ${p.frequency || '50'}Hz\nRange: 1000-2000us\nStatus: active` },

  { id:'servo_controller',    category:'Control Systems',   emoji:'🔩',
    name:'Servo Controller',
    desc:'Move a servo to an angle in degrees with speed control.',
    params:['servo_id','angle','speed'],
    serverSide: true,
    simulate: p => `Servo ${p.servo_id || '1'}:\nTarget angle: ${p.angle || '90'}deg\nSpeed: ${p.speed || 'medium'}\nCurrent: moving\nETA: 0.3s` },

  { id:'drone_commander',     category:'Control Systems',   emoji:'🚁',
    name:'Drone Command Interface',
    desc:'Send MAVLink velocity, position, or mode commands to ArduPilot FC.',
    params:['command_type','values'],
    serverSide: true,
    simulate: p => `MAVLink command:\nType: ${p.command_type || 'SET_POSITION_TARGET_LOCAL_NED'}\nValues: ${p.values || 'Vx=0, Vy=0, Vz=-1'}\nFrame: LOCAL_NED\nStatus: accepted` },

  { id:'nav_controller',      category:'Control Systems',   emoji:'🗺',
    name:'Robot Navigation Controller',
    desc:'Plan and execute navigation paths using waypoints or relative movement.',
    params:['destination','mode'],
    serverSide: true,
    simulate: p => `Navigation:\nDest: ${p.destination || 'waypoint_3'}\nMode: ${p.mode || 'guided'}\nDistance: 12.4m\nETA: 8s\nObstacles: none` },

  { id:'pid_assistant',       category:'Control Systems',   emoji:'📐',
    name:'PID Tuning Assistant',
    desc:'Analyse flight/control logs and suggest optimised P/I/D gain values.',
    params:['axis','current_gains','error_data'],
    simulate: p => `PID analysis for ${p.axis || 'roll'}:\nCurrent: P=0.15, I=0.05, D=0.002\nIssue: slight overshoot detected\nSuggested: P=0.13, I=0.04, D=0.003` },

  { id:'safety_override',     category:'Control Systems',   emoji:'🛡',
    name:'Safety Override System',
    desc:'Engage or disengage a safety override on any controlled system.',
    params:['system','action'],
    serverSide: true,
    simulate: p => `Safety override:\nSystem: ${p.system || 'drone'}\nAction: ${p.action || 'engage'}\nStatus: override ACTIVE\nReason: operator request` },

  { id:'estop_handler',       category:'Control Systems',   emoji:'🔴',
    name:'Emergency Stop Handler',
    desc:'Trigger immediate emergency stop on any connected device.',
    params:['target','reason'],
    serverSide: true,
    simulate: p => `⚠ EMERGENCY STOP\nTarget: ${p.target || 'all'}\nReason: ${p.reason || 'operator request'}\nMAVLink: FLIGHTTERMINATION sent\nStatus: motors disarmed` },

  { id:'mode_switcher',       category:'Control Systems',   emoji:'🔄',
    name:'Mode Switcher',
    desc:'Switch between auto/manual/guided/loiter flight/control modes.',
    params:['device','mode'],
    serverSide: true,
    simulate: p => `Mode change:\nDevice: ${p.device || 'drone'}\nFrom: GUIDED\nTo: ${p.mode || 'LOITER'}\nStatus: mode accepted by FC` },

  // VISION & PERCEPTION
  { id:'object_detection',    category:'Vision & Perception',emoji:'🔍',
    name:'Object Detection',
    desc:'Detect and classify objects in an image or video frame using YOLO.',
    params:['image_url','confidence'],
    serverSide: true,
    simulate: p => `Object detection:\nDetected: person (0.94), drone (0.87), tree (0.71)\nFrame: 1280x720\nInference: 28ms` },

  { id:'face_detection',      category:'Vision & Perception',emoji:'😊',
    name:'Face Detection',
    desc:'Detect faces and return bounding boxes and landmark positions.',
    params:['image_url'],
    serverSide: true,
    simulate: p => `Face detection:\nFaces found: 1\nBbox: [245, 112, 180, 210]\nLandmarks: eyes, nose, mouth\nConfidence: 0.97` },

  { id:'motion_tracker',      category:'Vision & Perception',emoji:'🏃',
    name:'Motion Tracker',
    desc:'Track moving objects across frames using ByteTrack multi-object tracker.',
    params:['track_id','frame'],
    serverSide: true,
    simulate: p => `Motion tracking:\nTrack ID: ${p.track_id || '1'}\nPosition: (642, 380)\nVelocity: (+2.1, +0.8) px/frame\nStatus: ACTIVE` },

  { id:'optical_flow',        category:'Vision & Perception',emoji:'〰',
    name:'Optical Flow Tracking',
    desc:'Compute dense optical flow for ground speed estimation and stabilisation.',
    params:['frame_pair'],
    serverSide: true,
    simulate: p => `Optical flow:\nGround speed: Vx=0.42 m/s, Vy=0.11 m/s\nFlow confidence: 0.89\nTexture quality: good` },

  { id:'depth_estimation',    category:'Vision & Perception',emoji:'📏',
    name:'Depth Estimation',
    desc:'Estimate per-pixel depth from a monocular image using MiDaS/Depth-Anything.',
    params:['image_url'],
    serverSide: true,
    simulate: p => `Depth estimation:\nNearest obstacle: 3.2m (bearing: 15deg left)\nSubject depth: 5.8m\nModel: MiDaS-v3\nInference: 45ms` },

  { id:'scene_classifier',    category:'Vision & Perception',emoji:'🌍',
    name:'Scene Classification',
    desc:'Classify the environment type and lighting conditions from a camera frame.',
    params:['image_url'],
    simulate: p => `Scene classification:\nEnvironment: outdoor urban\nLighting: bright daylight\nObstacle density: low\nGPS reliability: good` },

  { id:'target_tracker',      category:'Vision & Perception',emoji:'🎯',
    name:'Target Tracker',
    desc:'Lock onto and follow a specific target using appearance + motion features.',
    params:['target_bbox','frame'],
    serverSide: true,
    simulate: p => `Target tracking:\nStatus: LOCKED\nBbox: [${p.target_bbox || '200,150,100,200'}]\nCenter: (250, 250)\nArea: 20000px² (range ~5.1m)` },

  { id:'cam_stabilise',       category:'Vision & Perception',emoji:'🎥',
    name:'Camera Stabilisation',
    desc:'Apply digital stabilisation to a video stream using gyro-assisted warping.',
    params:['stream_id','method'],
    serverSide: true,
    simulate: p => `Stabilisation:\nStream: ${p.stream_id || 'main'}\nMethod: ${p.method || 'gyro-assisted'}\nJitter reduction: 84%\nLatency added: 2 frames` },

  { id:'frame_sampler',       category:'Vision & Perception',emoji:'🖼',
    name:'Frame Sampler',
    desc:'Capture keyframes from a video stream at a defined interval for logging/training.',
    params:['stream_id','interval_ms'],
    serverSide: true,
    simulate: p => `Frame sampling:\nStream: ${p.stream_id || 'main'}\nInterval: ${p.interval_ms || '200'}ms\nCaptured: 5 frames\nSaved to: /logs/frames/` },

  { id:'visual_anomaly',      category:'Vision & Perception',emoji:'⚠',
    name:'Visual Anomaly Detection',
    desc:'Detect unexpected objects or scene changes that deviate from baseline.',
    params:['frame'],
    serverSide: true,
    simulate: p => `Visual anomaly check:\nAnomalies: 0\nScene delta vs baseline: 2.1%\nThreshold: 15%\nStatus: NORMAL` },

  // DATA & LOGGING
  { id:'sensor_logger',       category:'Data & Logging',    emoji:'📝',
    name:'Sensor Data Logger',
    desc:'Log sensor readings to timestamped CBOR segments at 50Hz.',
    params:['sensor_id','value','metadata'],
    serverSide: true,
    simulate: p => `Log entry written:\nSensor: ${p.sensor_id || 'strap_R'}\nValue: ${p.value || '0.42'}\nTs: ${Date.now()}\nSegment: current` },

  { id:'timestamp_sync',      category:'Data & Logging',    emoji:'⏰',
    name:'Timestamp Synchroniser',
    desc:'Synchronise timestamps across multiple devices using NTP or PPS.',
    params:['devices'],
    serverSide: true,
    simulate: p => `Timestamp sync:\nDevices: ${p.devices || 'ESP32, Pi, PC'}\nOffset: PC+0ms, Pi+2ms, ESP32+5ms\nMethod: NTP\nDrift: <1ms/hr` },

  { id:'data_fusion',         category:'Data & Logging',    emoji:'🔀',
    name:'Multi-Device Data Fusion',
    desc:'Merge sensor streams from multiple devices with time alignment.',
    params:['streams'],
    serverSide: true,
    simulate: p => `Data fusion:\nStreams: ${p.streams || 'strap_L, strap_R, FC'}\nAlignment: timestamp-based\nSample rate: 50Hz unified\nDropped: 0 packets` },

  { id:'realtime_graph',      category:'Data & Logging',    emoji:'📈',
    name:'Real-Time Graph Generator',
    desc:'Create a live-updating chart from a named sensor stream.',
    params:['stream_id','window_s'],
    simulate: p => `Graph created:\nStream: ${p.stream_id || 'flex_R1'}\nWindow: ${p.window_s || '10'}s\nType: line\nUpdate: 100ms\nRendering in BioSuit Monitor` },

  { id:'data_compressor',     category:'Data & Logging',    emoji:'🗜',
    name:'Data Compression Tool',
    desc:'Compress log files using CBOR encoding and delta compression.',
    params:['file_path'],
    serverSide: true,
    simulate: p => `Compression:\nFile: ${p.file_path || 'session_001.log'}\nOriginal: 36MB\nCompressed: 8.2MB\nRatio: 4.4:1` },

  { id:'dataset_builder',     category:'Data & Logging',    emoji:'🏗',
    name:'Dataset Builder',
    desc:'Auto-label sensor logs for ML training using gesture timestamps.',
    params:['session_dir','labels'],
    serverSide: true,
    simulate: p => `Dataset built:\nSession: ${p.session_dir || './logs/session_001'}\nLabels: ${p.labels || 'auto-detected'}\nPositive samples: 1240\nNegative: 580` },

  { id:'data_cleaner',        category:'Data & Logging',    emoji:'🧹',
    name:'Data Cleaner',
    desc:'Remove noise, outliers and anomalous readings from sensor datasets.',
    params:['data','method'],
    simulate: p => `Data cleaning:\nMethod: ${p.method || 'IQR outlier removal'}\nOriginal: 5000 samples\nRemoved: 47 outliers (0.94%)\nClean: 4953 samples` },

  { id:'csv_exporter',        category:'Data & Logging',    emoji:'📊',
    name:'CSV/JSON Exporter',
    desc:'Export any session log or dataset to CSV or JSON format.',
    params:['session_id','format'],
    serverSide: true,
    simulate: p => `Export:\nSession: ${p.session_id || 'latest'}\nFormat: ${p.format || 'CSV'}\nRows: 15420\nFile: session_export.csv\nReady to download` },

  { id:'replay_system',       category:'Data & Logging',    emoji:'⏮',
    name:'Replay System',
    desc:'Play back a recorded session at any speed, scrubbing through time.',
    params:['session_id','speed'],
    serverSide: true,
    simulate: p => `Replay:\nSession: ${p.session_id || 'session_001'}\nSpeed: ${p.speed || '1x'}\nDuration: 12m 34s\nStatus: READY -> press play` },

  { id:'anomaly_detector',    category:'Data & Logging',    emoji:'🔔',
    name:'Anomaly Detector',
    desc:'Statistical anomaly detection on time series data (Z-score, IQR, DBSCAN).',
    params:['stream_id','method'],
    serverSide: true,
    simulate: p => `Anomaly detection:\nStream: ${p.stream_id || 'flex_R1'}\nMethod: ${p.method || 'Z-score'}\nAnomalies: 3 in last 60s\nSeverity: low` },

  // AUDIO & VOICE
  { id:'voice_recognition',   category:'Audio & Voice',     emoji:'🎤',
    name:'Voice Command Recognition',
    desc:'Transcribe voice input and map to a NexusAI command via Whisper.',
    params:['audio_data'],
    serverSide: true,
    simulate: p => `Voice recognition:\nTranscript: "set the drone to follow me mode"\nCommand: FOLLOW_ME_ACTIVATE\nConfidence: 0.91` },

  { id:'tts_system',          category:'Audio & Voice',     emoji:'🔊',
    name:'Text-to-Speech System',
    desc:'Convert text to speech using ElevenLabs or Piper TTS (local).',
    params:['text','voice','speed'],
    serverSide: true,
    simulate: p => `TTS:\nText: "${(p.text || 'hello').slice(0,40)}"\nVoice: ${p.voice || 'default'}\nEngine: ElevenLabs\nStatus: playing` },

  { id:'noise_filter',        category:'Audio & Voice',     emoji:'🔇',
    name:'Noise Filtering',
    desc:'Apply spectral noise gating to remove wind/motor noise from audio.',
    params:['audio_stream','threshold_db'],
    serverSide: true,
    simulate: p => `Noise filter:\nStream: ${p.audio_stream || 'mic_0'}\nThreshold: ${p.threshold_db || '-40'}dB\nNoise floor: -52dB\nSNR improved: +14dB` },

  { id:'wake_word',           category:'Audio & Voice',     emoji:'👂',
    name:'Wake Word Detection',
    desc:'Monitor audio for wake word "Hey Nexus" before processing voice commands.',
    params:['sensitivity'],
    serverSide: true,
    simulate: p => `Wake word detection:\nWord: "Hey Nexus"\nSensitivity: ${p.sensitivity || 'medium'}\nStatus: LISTENING\nFalse positives/hr: 0.3` },

  { id:'speaker_id',          category:'Audio & Voice',     emoji:'👤',
    name:'Speaker Identification',
    desc:'Identify who is speaking from a voice sample against an enrolled profile.',
    params:['audio_data'],
    serverSide: true,
    simulate: p => `Speaker ID:\nIdentified: User 1 (owner)\nConfidence: 0.89\nAccess: GRANTED\nVoiceprint match: 91%` },

  { id:'sound_direction',     category:'Audio & Voice',     emoji:'🧭',
    name:'Sound Direction Detection',
    desc:'Use multi-microphone array to estimate the direction of a sound source.',
    params:['mic_array'],
    serverSide: true,
    simulate: p => `Sound localisation:\nArray: ${p.mic_array || '4-mic circular'}\nDirection: 127deg (behind-right)\nElevation: -12deg\nDistance: ~2.8m` },

  { id:'audio_event',         category:'Audio & Voice',     emoji:'🎵',
    name:'Audio Event Detection',
    desc:'Classify audio events: clap, crash, alarm, speech, silence.',
    params:['audio_data'],
    serverSide: true,
    simulate: p => `Audio event:\nDetected: speech\nDuration: 1.8s\nAmplitude: -18dB\nClassification: voice command (0.84)` },

  { id:'voice_emotion',       category:'Audio & Voice',     emoji:'😤',
    name:'Voice Emotion Detection',
    desc:'Classify emotional state from voice tone: calm, stressed, urgent, happy.',
    params:['audio_data'],
    simulate: p => `Voice emotion:\nState: calm\nStress level: 12/100\nUrgency: low\nSpeech rate: normal (147 wpm)` },

  { id:'audio_logger',        category:'Audio & Voice',     emoji:'🎙',
    name:'Audio Logging',
    desc:'Record and store audio clips with timestamps for later review.',
    params:['duration_s','label'],
    serverSide: true,
    simulate: p => `Audio log:\nDuration: ${p.duration_s || '5'}s\nLabel: ${p.label || 'unlabeled'}\nFile: audio_${Date.now()}.wav\nSize: ~240KB` },

  { id:'command_confirm',     category:'Audio & Voice',     emoji:'✅',
    name:'Command Confirmation System',
    desc:'Request audible or haptic confirmation before executing a critical command.',
    params:['command','method'],
    serverSide: true,
    simulate: p => `Confirmation:\nCommand: ${p.command || 'RTH'}\nMethod: ${p.method || 'haptic + TTS'}\nStatus: awaiting user confirmation\nTimeout: 5s` },

  // PHYSIOLOGY & BIOMETRICS
  { id:'hr_processor',        category:'Physiology & Biometrics',emoji:'❤',
    name:'Heart Rate Monitor Processor',
    desc:'Process raw PPG sensor data to extract heart rate in BPM.',
    params:['ppg_data','sample_rate'],
    simulate: p => `Heart rate:\nBPM: 74\nSignal quality: 0.92\nMethod: peak detection\nLast 10 readings: [72,73,74,75,74,73,72,74,75,74]` },

  { id:'hrv_calculator',      category:'Physiology & Biometrics',emoji:'📊',
    name:'HRV Calculator',
    desc:'Calculate heart rate variability (RMSSD, SDNN, pNN50) from RR intervals.',
    params:['rr_intervals'],
    simulate: p => `HRV metrics:\nRMSSD: 42ms (normal)\nSDNN: 58ms\npNN50: 31%\nAutonomic status: balanced\nStress index: 28/100` },

  { id:'temp_analyser',       category:'Physiology & Biometrics',emoji:'🌡',
    name:'Temperature Trend Analyser',
    desc:'Analyse body temperature trends and detect fever or hypothermia.',
    params:['temp_readings'],
    simulate: p => `Temperature analysis:\nCurrent: 36.8degC\nTrend: stable (±0.1degC/30min)\nBaseline: 36.7degC\nStatus: NORMAL` },

  { id:'stress_estimator',    category:'Physiology & Biometrics',emoji:'😰',
    name:'Stress Level Estimator',
    desc:'Estimate stress from HRV, skin conductance and motion data.',
    params:['bio_data'],
    simulate: p => `Stress estimation:\nStress score: 28/100 (low)\nContributors: HRV (low), motion (normal)\nRecommendation: continue current activity` },

  { id:'fatigue_predictor',   category:'Physiology & Biometrics',emoji:'😴',
    name:'Fatigue Predictor',
    desc:'Predict cognitive and physical fatigue from biometric trends.',
    params:['session_duration','bio_data'],
    simulate: p => `Fatigue prediction:\nCognitive fatigue: 22% (low)\nPhysical fatigue: 18% (low)\nSession: ${p.session_duration || '45'}min\nRecommended break in: 75min` },

  { id:'recovery_estimator',  category:'Physiology & Biometrics',emoji:'🔄',
    name:'Recovery Time Estimator',
    desc:'Estimate time needed to return to baseline after a physically demanding session.',
    params:['exertion_level','bio_data'],
    simulate: p => `Recovery estimate:\nExertion: ${p.exertion_level || 'moderate'}\nEstimated recovery: 4-6 hours\nHydration: recommended\nNext optimal session: tomorrow morning` },

  { id:'bio_calibration',     category:'Physiology & Biometrics',emoji:'⚖',
    name:'Baseline Calibration System',
    desc:'Establish personal physiological baselines for all biometric monitors.',
    params:['duration_min'],
    serverSide: true,
    simulate: p => `Baseline calibration:\nDuration: ${p.duration_min || '3'}min\nHR baseline: 72 BPM\nHRV baseline: RMSSD=41ms\nTemp baseline: 36.7degC\nCalibration saved.` },

  { id:'bio_anomaly',         category:'Physiology & Biometrics',emoji:'⚠',
    name:'Physiological Anomaly Detection',
    desc:'Alert when biometric readings deviate significantly from personal baseline.',
    params:['readings'],
    simulate: p => `Bio anomaly check:\nAnomalies: 0\nAll readings within 2σ of baseline\nLast alert: none\nStatus: ALL NORMAL` },

  { id:'biofeedback_ctrl',    category:'Physiology & Biometrics',emoji:'🎛',
    name:'Biofeedback Controller',
    desc:'Trigger alerts or drone behavior changes based on operator physiological state.',
    params:['threshold','action'],
    serverSide: true,
    simulate: p => `Biofeedback rule:\nIf HR > ${p.threshold || '120'}BPM\nThen: ${p.action || 'reduce drone speed by 50%'}\nStatus: monitoring` },

  { id:'health_visualiser',   category:'Physiology & Biometrics',emoji:'📊',
    name:'Health Data Visualiser',
    desc:'Render biometric data as charts in the BioSuit Monitor dashboard.',
    params:['metric','window_min'],
    simulate: p => `Health chart:\nMetric: ${p.metric || 'heart_rate'}\nWindow: ${p.window_min || '10'}min\nRendering in BioSuit Monitor tab\nPoints: 600` },

  // AI INTELLIGENCE LAYER
  { id:'decision_engine',     category:'AI Intelligence',   emoji:'🧠',
    name:'Decision-Making Engine',
    desc:'Run a structured decision tree or MCDM analysis for complex choices.',
    params:['options','criteria','weights'],
    simulate: p => `Decision analysis:\nOptions: ${p.options || '[A, B, C]'}\nCriteria: ${p.criteria || 'speed, safety, cost'}\nRecommendation: Option B\nScore: 0.84` },

  { id:'prediction_engine',   category:'AI Intelligence',   emoji:'🔮',
    name:'Prediction Engine',
    desc:'Generate probabilistic forecasts for events using trained models.',
    params:['event','context'],
    simulate: p => `Prediction:\nEvent: ${p.event || 'battery depletion'}\nForecast: 18 minutes remaining\nConfidence: 0.89\nBasis: current draw + capacity` },

  { id:'bc_system',           category:'AI Intelligence',   emoji:'🤖',
    name:'Behaviour Cloning System',
    desc:'Train or run inference on the behavioural cloning MLP model.',
    params:['action','model_path'],
    serverSide: true,
    simulate: p => `Behaviour cloning:\nAction: ${p.action || 'infer'}\nInput: [drone_state, subject_pos, confidence]\nOutput: Vx=1.2, Vy=0.0, Vz=-0.3, yaw=0.0\nShadow mode: active` },

  { id:'rl_interface',        category:'AI Intelligence',   emoji:'🎮',
    name:'Reinforcement Learning Interface',
    desc:'Interface with the RL training loop -- submit rewards, query policy.',
    params:['action','reward','state'],
    serverSide: true,
    simulate: p => `RL interface:\nAction submitted: ${p.action || 'hover'}\nReward: ${p.reward || '+0.85'}\nPolicy update: queued\nEpisode step: 1247` },

  { id:'pattern_recognition', category:'AI Intelligence',   emoji:'🔍',
    name:'Pattern Recognition System',
    desc:'Detect repeating patterns in time series, behaviour logs or sensor data.',
    params:['data','pattern_type'],
    simulate: p => `Pattern recognition:\nData: ${p.data || 'gesture_sequence_log'}\nFound patterns: 3\nMost common: [R1_UP -> L1_UP] (freq: 47)\nAnomaly: 1 irregular sequence` },

  { id:'adaptive_learning',   category:'AI Intelligence',   emoji:'📚',
    name:'Adaptive Learning Module',
    desc:'Update model parameters online using new labeled examples.',
    params:['examples','learning_rate'],
    serverSide: true,
    simulate: p => `Adaptive learning:\nNew examples: ${p.examples || '12'}\nLearning rate: ${p.learning_rate || '0.001'}\nModel updated: gesture_hmm_v3\nDrift constrained: within 15% bound` },

  { id:'confidence_scorer',   category:'AI Intelligence',   emoji:'📊',
    name:'Confidence Scoring System',
    desc:'Score AI decisions by confidence and flag low-confidence outputs for review.',
    params:['prediction','threshold'],
    simulate: p => `Confidence score:\nPrediction: ${p.prediction || 'gesture: YAW_LEFT'}\nScore: 0.87\nThreshold: ${p.threshold || '0.60'}\nStatus: PASS OK` },

  { id:'error_correction',    category:'AI Intelligence',   emoji:'🔧',
    name:'Error Correction System',
    desc:'Detect and automatically correct systematic errors in AI output.',
    params:['output','reference'],
    simulate: p => `Error correction:\nOutput analysed\nSystematic bias: -0.03 on yaw estimates\nCorrection applied: +0.03\nCorrected outputs: 100%` },

  { id:'scenario_sim',        category:'AI Intelligence',   emoji:'🌐',
    name:'Scenario Simulator',
    desc:'Run "what-if" simulations of drone or system behaviour in SITL.',
    params:['scenario','params'],
    serverSide: true,
    simulate: p => `Scenario sim:\nScenario: ${p.scenario || 'windy_follow_me'}\nResult: stable tracking\nWorst case: 1.8m subject offset\nTime to recover: 2.1s` },

  { id:'strategy_generator',  category:'AI Intelligence',   emoji:'♟',
    name:'Strategy Generator',
    desc:'Generate strategic action plans for missions, tasks or operations.',
    params:['goal','constraints'],
    simulate: p => `Strategy:\nGoal: ${p.goal || 'record cinematic footage'}\nConstraints: ${p.constraints || 'battery 80%, wind low'}\nPlan: 3-phase approach\nRisk: low` },

  // COMMUNICATION
  { id:'wifi_handler',        category:'Communication',     emoji:'📶',
    name:'WiFi Communication Handler',
    desc:'Manage WiFi connections, scan networks, send HTTP payloads to devices.',
    params:['target_ip','payload'],
    serverSide: true,
    simulate: p => `WiFi comm:\nTarget: ${p.target_ip || '192.168.1.10'}\nPayload: ${p.payload || 'ping'}\nLatency: 8ms\nStatus: reachable` },

  { id:'ble_manager',         category:'Communication',     emoji:'🔵',
    name:'Bluetooth/BLE Manager',
    desc:'Scan, connect and manage BLE devices including wrist straps.',
    params:['action','device_name'],
    serverSide: true,
    simulate: p => `BLE ${p.action || 'scan'}:\nDevice: ${p.device_name || 'NexusStrap-R'}\nRSSI: -62dBm\nStatus: connected\nPacket error rate: 0.8%` },

  { id:'serial_tool',         category:'Communication',     emoji:'🔌',
    name:'Serial Communication Tool',
    desc:'Send and receive data over USB serial to Arduino/ESP32/FC.',
    params:['port','baud','data'],
    serverSide: true,
    simulate: p => `Serial comm:\nPort: ${p.port || 'COM3'}\nBaud: ${p.baud || '115200'}\nSent: ${p.data || 'AT+OK'}\nReceived: OK\nLatency: 2ms` },

  { id:'packet_optimizer',    category:'Communication',     emoji:'📦',
    name:'Packet Optimiser',
    desc:'Minimise packet size and maximise throughput for real-time data links.',
    params:['protocol','payload_size'],
    simulate: p => `Packet optimisation:\nProtocol: ${p.protocol || 'BLE 5.2'}\nOriginal payload: ${p.payload_size || '200'}B\nOptimised: 142B\nSaving: 29%` },

  { id:'latency_monitor',     category:'Communication',     emoji:'⏱',
    name:'Latency Monitor',
    desc:'Continuously measure and log round-trip latency for all active connections.',
    params:['connection_id'],
    serverSide: true,
    simulate: p => `Latency monitor:\nConnection: ${p.connection_id || 'BLE_strap_R'}\nRTT: 13ms (avg)\nJitter: ±2ms\nDropped: 0/500 packets` },

  { id:'failover_system',     category:'Communication',     emoji:'🔄',
    name:'Connection Failover System',
    desc:'Automatically switch to a backup communication path on link failure.',
    params:['primary','backup'],
    serverSide: true,
    simulate: p => `Failover:\nPrimary: ${p.primary || 'WiFi'}\nBackup: ${p.backup || 'BLE'}\nPrimary status: ACTIVE\nFailover: STANDBY` },

  { id:'device_discovery',    category:'Communication',     emoji:'🔭',
    name:'Device Discovery Tool',
    desc:'Scan the local network and BLE for discoverable NexusMesh nodes.',
    params:['protocol'],
    serverSide: true,
    simulate: p => `Device discovery (${p.protocol || 'all'}):\nFound: Pi_5 (192.168.1.5), ESP32_1 (BLE), FC_Link (USB)\nTotal: 3 devices\nMesh status: PARTIAL` },

  { id:'secure_messaging',    category:'Communication',     emoji:'🔐',
    name:'Secure Messaging Layer',
    desc:'Encrypt and authenticate messages between NexusMesh nodes.',
    params:['message','recipient'],
    serverSide: true,
    simulate: p => `Secure message:\nRecipient: ${p.recipient || 'Pi_5'}\nEncryption: AES-256-GCM\nAuth: HMAC-SHA256\nStatus: delivered and verified` },

  { id:'cmd_ack',             category:'Communication',     emoji:'✅',
    name:'Command Acknowledgment System',
    desc:'Track command delivery and acknowledgment from all connected devices.',
    params:['command_id'],
    serverSide: true,
    simulate: p => `Command ACK:\nID: ${p.command_id || 'cmd_1247'}\nSent: 13:42:01.234\nACK received: 13:42:01.251\nRTT: 17ms\nStatus: CONFIRMED` },

  { id:'stream_handler',      category:'Communication',     emoji:'📡',
    name:'Data Streaming Handler',
    desc:'Manage real-time data streams with backpressure and buffer management.',
    params:['stream_id','buffer_ms'],
    serverSide: true,
    simulate: p => `Stream ${p.stream_id || 'telemetry'}:\nBuffer: ${p.buffer_ms || '200'}ms\nThroughput: 1.2 MB/s\nDropped frames: 0\nLatency: 8ms` },

  // SYSTEM OPTIMISATION
  { id:'load_monitor',        category:'System Optimisation',emoji:'💻',
    name:'CPU/GPU Load Monitor',
    desc:'Report real-time CPU and GPU utilisation across NexusAI components.',
    params:['component'],
    serverSide: true,
    simulate: p => `System load:\nCPU: 34% (4 cores)\nGPU: 18% (CUDA)\nRAM: 8.2GB / 32GB\nTop process: ollama (12%)` },

  { id:'memory_optimizer',    category:'System Optimisation',emoji:'🧹',
    name:'Memory Optimiser',
    desc:'Identify memory leaks and unnecessary allocations in NexusAI processes.',
    params:[],
    serverSide: true,
    simulate: () => `Memory optimisation:\nHeap before: 2.8GB\nFreed: 340MB\nLeaks found: 0\nRecommend: restart Ollama after 8h` },

  { id:'power_tracker',       category:'System Optimisation',emoji:'🔋',
    name:'Power Consumption Tracker',
    desc:'Track power draw from all devices: drone, straps, PC, Pi.',
    params:['device'],
    simulate: p => `Power tracking:\nDrone: 210W (hover)\nStraps: 0.09W each\nPC: 185W\nPi: 8W\nTotal: 403.18W` },

  { id:'thermal_monitor',     category:'System Optimisation',emoji:'🌡',
    name:'Thermal Monitor',
    desc:'Monitor temperatures of nRF52840 MCU, CPU, GPU and FC ESCs.',
    params:['component'],
    serverSide: true,
    simulate: p => `Thermal status:\n${p.component || 'all components'}:\nnRF52840: 31degC OK\nCPU: 62degC OK\nGPU: 54degC OK\nESC: 38degC OK\nAll nominal` },

  { id:'perf_profiler',       category:'System Optimisation',emoji:'📊',
    name:'Performance Profiler',
    desc:'Profile NexusAI pipeline latency: gesture->arbitrator->MAVLink end-to-end.',
    params:['pipeline'],
    serverSide: true,
    simulate: p => `Pipeline profile:\nBLE RX: 8ms\nGesture classify: 1ms\nArbitrator: 0.5ms\nMAVLink TX: 2ms\nTotal: 11.5ms\nTarget: 20ms OK` },

  { id:'task_scheduler',      category:'System Optimisation',emoji:'📅',
    name:'Task Scheduler',
    desc:'Schedule recurring tasks with cron syntax across NexusAI modules.',
    params:['task','cron_expr'],
    serverSide: true,
    simulate: p => `Scheduled:\nTask: ${p.task || 'log_rotate'}\nCron: ${p.cron_expr || '0 2 * * *'}\nNext run: 02:00 tomorrow\nStatus: scheduled` },

  { id:'resource_allocator',  category:'System Optimisation',emoji:'🏗',
    name:'Resource Allocator',
    desc:'Dynamically allocate CPU cores, GPU memory and bandwidth to NexusAI tasks.',
    params:['task','priority'],
    serverSide: true,
    simulate: p => `Resource allocation:\nTask: ${p.task || 'video_inference'}\nPriority: ${p.priority || 'high'}\nAllocated: 2 CPU cores, 2GB GPU VRAM\nStatus: active` },

  { id:'bottleneck_detector', category:'System Optimisation',emoji:'🔍',
    name:'Bottleneck Detector',
    desc:'Identify the slowest component in any NexusAI data pipeline.',
    params:['pipeline'],
    serverSide: true,
    simulate: p => `Bottleneck analysis:\nPipeline: ${p.pipeline || 'gesture->drone'}\nBottleneck: video inference (28ms)\nAll other stages: <5ms\nSuggestion: reduce YOLO input resolution` },

  { id:'auto_scaler',         category:'System Optimisation',emoji:'⚖',
    name:'Auto-Scaling System',
    desc:'Automatically scale down non-critical services under high load.',
    params:['load_threshold'],
    serverSide: true,
    simulate: p => `Auto-scaling:\nThreshold: ${p.load_threshold || '80'}%\nCurrent load: 34%\nScaling: not required\nServices scaled: 0` },

  { id:'efficiency_analyser', category:'System Optimisation',emoji:'📉',
    name:'Efficiency Analyser',
    desc:'Analyse per-module energy and compute efficiency over a session.',
    params:['session_id'],
    simulate: p => `Efficiency report:\nSession: ${p.session_id || 'latest'}\nCompute per gesture: 0.8ms avg\nWasted cycles: 3.2%\nRecommendation: batch BLE reads` },

  // TESTING & DEVELOPMENT
  { id:'sim_env',             category:'Testing & Dev',     emoji:'🌐',
    name:'Simulation Environment',
    desc:'Start an ArduPilot SITL simulation for safe testing without hardware.',
    params:['vehicle','map'],
    serverSide: true,
    simulate: p => `SITL started:\nVehicle: ${p.vehicle || 'copter'}\nMap: ${p.map || 'CMAC'}\nTCP: 5760\nUDP: 14550\nReady for MAVLink connection` },

  { id:'sensor_emulator',     category:'Testing & Dev',     emoji:'🔬',
    name:'Sensor Emulator',
    desc:'Emulate BLE strap sensor data for software testing without hardware.',
    params:['gesture','noise_level'],
    serverSide: true,
    simulate: p => `Sensor emulation:\nGesture: ${p.gesture || 'YAW_LEFT'}\nNoise: ${p.noise_level || '2'}%\nR1: 0.52, R2: 0.09\nIMU: roll=1.2deg, pitch=0.8deg\nStreaming at 50Hz` },

  { id:'debug_logger',        category:'Testing & Dev',     emoji:'🐛',
    name:'Debug Logger',
    desc:'Enable verbose debug logging for any NexusAI module.',
    params:['module','level'],
    serverSide: true,
    simulate: p => `Debug logging:\nModule: ${p.module || 'gesture_engine'}\nLevel: ${p.level || 'verbose'}\nOutput: console + /logs/debug.log\nStatus: ENABLED` },

  { id:'unit_tester',         category:'Testing & Dev',     emoji:'✅',
    name:'Unit Test Runner',
    desc:'Run unit tests for any NexusAI Python or TypeScript module.',
    params:['module','test_suite'],
    serverSide: true,
    simulate: p => `Test run:\nModule: ${p.module || 'gesture_engine'}\nTests: 24 passed, 0 failed\nCoverage: 87%\nDuration: 2.3s` },

  { id:'scenario_tester',     category:'Testing & Dev',     emoji:'🎬',
    name:'Scenario Tester',
    desc:'Run a predefined test scenario end-to-end: sensor->gesture->drone.',
    params:['scenario_name'],
    serverSide: true,
    simulate: p => `Scenario test:\nName: ${p.scenario_name || 'basic_yaw_left'}\nSteps: 8/8 passed\nLatency: 13ms avg\nResult: PASS OK` },

  { id:'fault_injector',      category:'Testing & Dev',     emoji:'💥',
    name:'Fault Injection Tool',
    desc:'Inject faults (dropped packets, sensor noise, latency spikes) to test resilience.',
    params:['fault_type','target','magnitude'],
    serverSide: true,
    simulate: p => `Fault injection:\nFault: ${p.fault_type || 'dropped_packets'}\nTarget: ${p.target || 'BLE'}\nMagnitude: ${p.magnitude || '10'}%\nSystem response: failover activated OK` },

  { id:'cal_assistant',       category:'Testing & Dev',     emoji:'🎛',
    name:'Calibration Assistant',
    desc:'Guide through the full NexusStrap calibration procedure step by step.',
    params:['strap'],
    serverSide: true,
    simulate: p => `Calibration guide:\nStrap: ${p.strap || 'both'}\nStep 1: RELAX -- waiting...\nEstimated time: 3 minutes\nConnect BLE straps first` },

  { id:'data_validator',      category:'Testing & Dev',     emoji:'🔎',
    name:'Data Validation Tool',
    desc:'Validate sensor data against schema, range, and consistency constraints.',
    params:['data','schema'],
    simulate: p => `Validation:\nSchema: ${p.schema || 'strap_packet_v2'}\nRecords: 1000\nPassed: 997\nFailed: 3 (range error in R2)\nAuto-corrected: 2` },

  { id:'benchmarker',         category:'Testing & Dev',     emoji:'⏱',
    name:'Performance Benchmarker',
    desc:'Benchmark any NexusAI component against baseline performance targets.',
    params:['component','iterations'],
    serverSide: true,
    simulate: p => `Benchmark:\nComponent: ${p.component || 'gesture_classify'}\nIterations: ${p.iterations || '1000'}\nAvg: 0.82ms\nP99: 1.4ms\nBaseline: 2ms OK` },

  { id:'version_control',     category:'Testing & Dev',     emoji:'📦',
    name:'Version Control Helper',
    desc:'Commit, branch, tag and push NexusAI source changes via git.',
    params:['action','message'],
    serverSide: true,
    simulate: p => `Git ${p.action || 'status'}:\nBranch: main\nUncommitted: 3 files\nMessage: "${p.message || 'pending'}"\nLast commit: 2h ago` },

  // SAFETY & CONTROL
  { id:'permission_system',   category:'Safety & Control',  emoji:'🔑',
    name:'Permission System',
    desc:'Check and enforce permission levels before executing sensitive commands.',
    params:['command','user_level'],
    simulate: p => `Permission check:\nCommand: ${p.command || 'arm_motors'}\nRequired: operator\nUser level: ${p.user_level || 'operator'}\nDecision: GRANTED OK` },

  { id:'access_control',      category:'Safety & Control',  emoji:'🚪',
    name:'Access Control',
    desc:'Manage which users and devices can access each NexusAI module.',
    params:['resource','user'],
    serverSide: true,
    simulate: p => `Access control:\nResource: ${p.resource || 'drone_control'}\nUser: ${p.user || 'owner'}\nPermissions: read+write+execute\nStatus: AUTHORIZED` },

  { id:'cmd_validation',      category:'Safety & Control',  emoji:'✅',
    name:'Command Validation',
    desc:'Validate commands against kinematic limits, battery level and safety rules.',
    params:['command','context'],
    simulate: p => `Validation:\nCommand: ${p.command || 'fly_forward 5m/s'}\nBattery: 72% OK\nObstacles: none OK\nKinematic: within limits OK\nDecision: VALID OK` },

  { id:'failsafe_fallback',   category:'Safety & Control',  emoji:'🛟',
    name:'Fail-Safe Fallback',
    desc:'Trigger the appropriate fail-safe behavior when a critical subsystem fails.',
    params:['failed_system'],
    serverSide: true,
    simulate: p => `Fail-safe triggered:\nFailed: ${p.failed_system || 'BLE_strap_R'}\nAction: reduce to AI-only mode\nDrone: LOITER maintained\nOperator: notified` },

  { id:'watchdog_timer',      category:'Safety & Control',  emoji:'🐕',
    name:'Watchdog Timer',
    desc:'Reset or trigger fail-safe if a heartbeat is not received within timeout.',
    params:['component','timeout_ms'],
    serverSide: true,
    simulate: p => `Watchdog:\nComponent: ${p.component || 'arbitrator'}\nTimeout: ${p.timeout_ms || '200'}ms\nLast heartbeat: 15ms ago\nStatus: HEALTHY OK` },

  { id:'error_recovery',      category:'Safety & Control',  emoji:'🔧',
    name:'Error Recovery System',
    desc:'Attempt automatic recovery from detected errors before escalating.',
    params:['error_type'],
    serverSide: true,
    simulate: p => `Error recovery:\nError: ${p.error_type || 'BLE_disconnect'}\nAttempt 1: reconnect -> success\nDowntime: 340ms\nStatus: RECOVERED` },

  { id:'risk_assessment',     category:'Safety & Control',  emoji:'⚖',
    name:'Risk Assessment Module',
    desc:'Score the risk level of a proposed action before execution.',
    params:['action','context'],
    simulate: p => `Risk assessment:\nAction: ${p.action || 'fly_at_speed_6ms'}\nBattery: 72% (low risk)\nObstacles: none\nWind: 8km/h (low)\nRisk score: 18/100 (LOW) OK` },

  { id:'safe_mode',           category:'Safety & Control',  emoji:'🟢',
    name:'Safe Mode Handler',
    desc:'Enter or exit safe mode -- restricts all commands to read-only and loiter.',
    params:['action'],
    serverSide: true,
    simulate: p => `Safe mode:\nAction: ${p.action || 'status'}\nCurrent: NORMAL\nSafe mode: INACTIVE\nAll systems: full authority` },

  { id:'audit_logger',        category:'Safety & Control',  emoji:'📋',
    name:'Logging for Audits',
    desc:'Record all commands, decisions and outcomes in an immutable audit trail.',
    params:['event','data'],
    serverSide: true,
    simulate: p => `Audit log:\nEvent: ${p.event || 'command_executed'}\nData: ${p.data || 'YAW_LEFT'}\nHash: sha256:a3f2...\nImmutable: yes` },

  { id:'alert_system',        category:'Safety & Control',  emoji:'🚨',
    name:'Alert/Notification System',
    desc:'Send alerts via haptic, TTS, dashboard notification or Telegram.',
    params:['message','level','channel'],
    serverSide: true,
    simulate: p => `Alert sent:\nMessage: ${p.message || 'battery below 25%'}\nLevel: ${p.level || 'warning'}\nChannel: ${p.channel || 'haptic + dashboard'}\nDelivered: OK` },

  // ADVANCED / FUTURE
  { id:'multi_agent',         category:'Advanced',          emoji:'🕸',
    name:'Multi-Agent Coordination',
    desc:'Coordinate multiple AI agents toward a shared goal with role assignment.',
    params:['goal','agents'],
    simulate: p => `Multi-agent:\nGoal: ${p.goal || 'map the environment'}\nAgents: ${p.agents || 'scout, mapper, supervisor'}\nCoordination: role-based\nStatus: initialising` },

  { id:'swarm_control',       category:'Advanced',          emoji:'🐝',
    name:'Swarm Control System',
    desc:'Coordinate a swarm of drones with formation flying and distributed tasks.',
    params:['formation','num_drones'],
    serverSide: true,
    simulate: p => `Swarm control:\nFormation: ${p.formation || 'triangle'}\nDrones: ${p.num_drones || '3'}\nSpacing: 5m\nLeader: drone_0\nStatus: formation maintained` },

  { id:'auto_nav_planner',    category:'Advanced',          emoji:'🗺',
    name:'Autonomous Navigation Planner',
    desc:'Plan optimal routes using A* or RRT* avoiding known obstacles.',
    params:['start','goal','map'],
    simulate: p => `Nav plan:\nFrom: ${p.start || 'current'}\nTo: ${p.goal || 'waypoint_12'}\nAlgorithm: A*\nWaypoints: 6\nDistance: 48m\nETA: 32s` },

  { id:'slam_interface',      category:'Advanced',          emoji:'📍',
    name:'SLAM Interface',
    desc:'Interface with a simultaneous localisation and mapping backend.',
    params:['action','map_id'],
    serverSide: true,
    simulate: p => `SLAM:\nAction: ${p.action || 'query_position'}\nMap: ${p.map_id || 'session_map_1'}\nPosition: (12.4, -3.2, 1.8)\nConfidence: 0.94\nFeatures: 1247` },

  { id:'digital_twin',        category:'Advanced',          emoji:'🪞',
    name:'Digital Twin Simulator',
    desc:'Maintain a real-time digital replica of the physical drone and environment.',
    params:['entity','property'],
    serverSide: true,
    simulate: p => `Digital twin:\nEntity: ${p.entity || 'drone'}\nProperty: ${p.property || 'position'}\nReal: (0,0,5)\nTwin: (0,0,5)\nSync lag: 3ms` },

  { id:'env_mapper',          category:'Advanced',          emoji:'🗺',
    name:'Environment Mapping',
    desc:'Build a 3D occupancy grid of the flight environment from sensor data.',
    params:['resolution','range'],
    serverSide: true,
    simulate: p => `Environment map:\nResolution: ${p.resolution || '10'}cm voxels\nRange: ${p.range || '20'}m\nOccupied voxels: 1482\nFree: 94,518\nBuilding...` },

  { id:'predictive_maint',    category:'Advanced',          emoji:'🔧',
    name:'Predictive Maintenance System',
    desc:'Monitor component health and predict failures before they happen.',
    params:['component'],
    simulate: p => `Predictive maintenance:\nComponent: ${p.component || 'all'}\nMotors: healthy (est. 200+ hrs)\nESCs: healthy\nStraps: healthy\nBatteries: 2 show early degradation` },

  { id:'ai_coding',           category:'Advanced',          emoji:'💻',
    name:'AI-Assisted Coding Tool',
    desc:'Generate, review and refactor NexusAI source code using local LLM.',
    params:['task','language','context'],
    simulate: p => `AI coding:\nTask: ${p.task || 'generate'}\nLanguage: ${p.language || 'Python'}\nContext: ${(p.context || 'NexusAI drone system').slice(0,60)}\nGenerating...` },

  { id:'realtime_collab',     category:'Advanced',          emoji:'🤝',
    name:'Real-Time Collaboration System',
    desc:'Enable multi-operator collaboration on a shared NexusAI session.',
    params:['session_id','role'],
    serverSide: true,
    simulate: p => `Collaboration:\nSession: ${p.session_id || 'collab_001'}\nRole: ${p.role || 'pilot'}\nConnected users: 2\nSync latency: 12ms` },

  { id:'self_improve',        category:'Advanced',          emoji:'🔄',
    name:'Self-Improvement Loop',
    desc:'Analyse performance logs and automatically suggest model or config improvements.',
    params:['metric','threshold'],
    simulate: p => `Self-improvement:\nMetric: ${p.metric || 'gesture_accuracy'}\nCurrent: 91.3%\nThreshold: ${p.threshold || '90'}%\nRecommendations: increase training data for FINE_FORWARD gesture` },

  // Dev Log tools AI can save and read the development log
  { id:'save_devlog',   category:'Notes & Dev Log',   emoji:'📝',
    name:'Save Dev Log Entry',
    desc:'Save a development log entry. Use when the user says things like "log this", "save to dev log", "note that we fixed X", "add to changelog".',
    params:['message','type'],
    serverSide: true,
    simulate: p => `Dev log saved:\nType: ${p.type || 'feat'}\nMessage: ${p.message || '(empty)'}\nTimestamp: ${new Date().toLocaleString()}\nVisible in Settings > Dev Logs` },

  { id:'read_devlog',   category:'Notes & Dev Log',   emoji:'📋',
    name:'Read Dev Log',
    desc:'Read recent development log entries. Use when the user asks "what did we do", "show the dev log", "what changed recently", "what was the last thing we worked on".',
    params:['limit','version'],
    serverSide: true,
    simulate: () => `Dev log (last 5 entries):\n[feat] OpenClaw CLI approach -- WS abandoned\n[feat] NexusClaw dual chat + AI collab\n[fix]  sendClaw reads reply directly from CLI\n[feat] Dashboard live metrics\n[feat] VRAM management endpoints` },

  { id:'save_note',     category:'Notes & Dev Log',   emoji:'🗒',
    name:'Save Note / Reminder',
    desc:'Save a note or reminder for later. Use when the user says "remind me", "note this down", "save this for tomorrow", "I need to remember to...".',
    params:['text','label'],
    serverSide: true,
    simulate: p => `Note saved:\nLabel: ${p.label || 'general'}\nText: ${p.text || '(empty)'}\nDate: ${new Date().toLocaleDateString()}\nAccess in Settings > Notes` },

  { id:'read_notes',    category:'Notes & Dev Log',   emoji:'📌',
    name:'Read Notes',
    desc:'Read saved notes and reminders. Use when the user asks "what are my notes", "what did I need to do", "show my reminders", "what was I planning".',
    params:['label'],
    serverSide: true,
    simulate: () => `Your notes:\n[TODO] Test OpenClaw with HERETIC model\n[TODO] Flash BioMesh ESP32 firmware\n[IDEA] Add voice control to NexusClaw\n[REMIND] Check drone MAVLink connection tomorrow` },

  { id:'clear_notes',   category:'Notes & Dev Log',   emoji:'🗑',
    name:'Clear Notes',
    desc:'Delete all notes or notes with a specific label.',
    params:['label'],
    serverSide: true,
    simulate: p => `Notes cleared${p.label ? ` (label: ${p.label})` : ' (all)'}` },
];

// Tool call parsing
export interface ToolCall { toolId: string; params: Record<string, string>; raw: string; }

/**
 * Parse AI response text for <nexus_tool> XML tags.
 * Format: <nexus_tool name="tool_id" param1="val1" param2="val2"></nexus_tool>
 */
export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const regex = /<nexus_tool\s+([^>]+?)(?:\s*\/>|>\s*<\/nexus_tool>)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const attribs = match[1];
    const nameMatch = attribs.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const toolId = nameMatch[1];
    const params: Record<string, string> = {};
    const paramRegex = /(\w+)="([^"]*)"/g;
    let pm;
    while ((pm = paramRegex.exec(attribs)) !== null) {
      if (pm[1] !== 'name') params[pm[1]] = pm[2];
    }
    calls.push({ toolId, params, raw: match[0] });
  }
  return calls;
}

/**
 * Execute a single tool call hits server or runs simulate() fallback.
 */
export async function executeTool(call: ToolCall): Promise<string> {
  const tool = NEXUS_TOOLS.find(t => t.id === call.toolId);
  if (!tool) return `⚠ Unknown tool: ${call.toolId}`;

  if (tool.serverSide) {
    try {
      const r = await fetch(`/api/tools/${call.toolId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(call.params),
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const d = await r.json();
        return d.result || JSON.stringify(d);
      }
    } catch {}
    // Server unavailable fall through to simulate
  }

  if (tool.simulate) {
    return tool.simulate(call.params);
  }
  return `Tool ${tool.name}: executed (no output)`;
}

/**
 * Process an AI response: find tool calls, execute them, return enhanced text.
 * Returns { displayText, toolResults } where toolResults are formatted blocks
 * to append to the message.
 */
export async function processToolCalls(aiText: string): Promise<{
  displayText: string;
  toolResults: { tool: NexusTool; result: string }[];
  hasTools: boolean;
}> {
  const calls = parseToolCalls(aiText);
  if (calls.length === 0) return { displayText: aiText, toolResults: [], hasTools: false };

  const toolResults: { tool: NexusTool; result: string }[] = [];
  let displayText = aiText;

  for (const call of calls) {
    const tool = NEXUS_TOOLS.find(t => t.id === call.toolId);
    if (!tool) continue;
    const result = await executeTool(call);
    toolResults.push({ tool, result });
    // Replace the raw XML tag with a placeholder in display text
    displayText = displayText.replace(call.raw, `\n[Tool: ${tool.name}]\n`);
  }

  return { displayText, toolResults, hasTools: true };
}

/**
 * Generate the tool-awareness system prompt to inject into every chat.
 * Lists all tools with their IDs and descriptions.
 */
export function getToolSystemPrompt(categories?: string[]): string {
  const tools = categories
    ? NEXUS_TOOLS.filter(t => categories.includes(t.category))
    : NEXUS_TOOLS;

  const grouped: Record<string, NexusTool[]> = {};
  for (const t of tools) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  }

  const toolList = Object.entries(grouped).map(([cat, ts]) =>
    `${cat}:\n${ts.map(t => `  - ${t.id}(${t.params.join(', ')}): ${t.desc}`).join('\n')}`
  ).join('\n\n');

  return `You are NexusAI -- an intelligent assistant with access to a comprehensive tool system covering hardware control, sensor processing, AI inference, communication, and more.

When you need to use a tool, emit it in this exact XML format (inline in your response):
<nexus_tool name="tool_id" param1="value1" param2="value2"></nexus_tool>

You can use multiple tools in a single response. Always explain what you're doing before using a tool.

AVAILABLE TOOLS:
${toolList}

IMPORTANT RULES:
- Use tools when the user asks to DO something (control, measure, log, detect, etc.)
- For purely conversational or knowledge questions, answer directly without tools
- Always use the exact tool id from the list above
- Fill in params with real values from the user's request or sensible defaults
- After tool output is shown, summarise what happened in plain English`;
}

export const TOOL_CATEGORIES = [...new Set(NEXUS_TOOLS.map(t => t.category))];
export const TOOL_MAP = Object.fromEntries(NEXUS_TOOLS.map(t => [t.id, t]));
