// ElevenLabs TTS Sarah voice (warm, breathy, intimate)
let currentAudio: HTMLAudioElement | null = null;

export function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  try { speechSynthesis.cancel(); } catch {}
}

export async function speak(text: string, onComplete?: () => void, voiceIdOverride?: string) {
  stopSpeaking();
  if (!text?.trim()) { onComplete?.(); return; }

  const cleanText = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\n{2,}/g, '. ')
    .slice(0, 800);

  let apiKey = localStorage.getItem('elevenlabs_api_key');
  if (!apiKey) {
    try { const s = JSON.parse(localStorage.getItem('nexus_settings') || '{}'); apiKey = s?.providers?.elevenLabs || null; } catch {}
  }

  if (apiKey) {
    // Sarah XB0fDUnXU5powFXDhCwa warm, breathy, intimate, natural
    const voiceId = voiceIdOverride
      || localStorage.getItem('elevenlabs_voice_id')
      || 'XB0fDUnXU5powFXDhCwa';

    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
        body: JSON.stringify({
          text: cleanText,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.35,
            similarity_boost: 0.85,
            style: 0.45,
            use_speaker_boost: true,
          },
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;
        audio.onended = () => { onComplete?.(); URL.revokeObjectURL(url); currentAudio = null; };
        audio.onerror = () => { URL.revokeObjectURL(url); currentAudio = null; fallbackTTS(cleanText, onComplete); };
        await audio.play();
        return;
      }
    } catch {}
  }

  await fallbackTTS(cleanText, onComplete);
}

async function fallbackTTS(text: string, onComplete?: () => void) {
  try {
    const url = `https://api.streamelements.com/kappa/v2/speech?voice=Joanna&text=${encodeURIComponent(text.slice(0, 300))}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      currentAudio = audio;
      audio.onended = () => { onComplete?.(); URL.revokeObjectURL(audioUrl); currentAudio = null; };
      await audio.play();
      return;
    }
  } catch {}
  try {
    const utter = new SpeechSynthesisUtterance(text.slice(0, 200));
    const voices = speechSynthesis.getVoices();
    const v = voices.find(v => /Samantha|Karen|Victoria|Moira|Ava|Nova|Aria/i.test(v.name))
           || voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
           || voices.find(v => v.lang.startsWith('en')) || voices[0];
    if (v) utter.voice = v;
    utter.rate = 0.95; utter.pitch = 1.05; utter.volume = 1.0;
    utter.onend = () => onComplete?.();
    speechSynthesis.speak(utter);
  } catch { onComplete?.(); }
}
