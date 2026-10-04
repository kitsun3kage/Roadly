let cachedVoice: SpeechSynthesisVoice | null = null;

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  // 1) polski, 2) dowolny
  cachedVoice =
    voices.find((v) => v.lang?.toLowerCase().startsWith('pl')) ??
    voices[0] ??
    null;
  return cachedVoice;
}

export function speak(text: string, opts?: { interrupt?: boolean }): void {
  if (!isSpeechSupported()) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  if (opts?.interrupt) {
    window.speechSynthesis.cancel();
  }

  const u = new SpeechSynthesisUtterance(trimmed);
  const voice = pickVoice();
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else {
    u.lang = 'pl-PL';
  }
  u.rate = 1.05;
  u.pitch = 1;
  u.volume = 1;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}

// Chrome ładuje głosy leniwie — odśwież cache gdy się pojawią
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    pickVoice();
  };
}