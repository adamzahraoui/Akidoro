let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

/**
 * Play a gentle two-note completion chime with the Web Audio API.
 * No audio asset is needed and it respects the user's volume preference.
 */
export type ChimeType = 'bell' | 'beep' | 'synth';

export function playCompletionChime(volume: number, kind: 'focus' | 'break' = 'focus', chime: ChimeType = 'bell'): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = Math.min(1, Math.max(0, volume));
  master.connect(ctx.destination);

  // A warm major-ish interval. Breaks resolve downward to feel restful.
  const frequencies =
    chime === 'beep' ? (kind === 'focus' ? [880, 660] : [392, 313]) :
    chime === 'synth' ? (kind === 'focus' ? [523, 659, 784] : [392, 330, 262]) :
    (kind === 'focus' ? [660, 880] : [520, 392]);
  const oscillatorType = chime === 'beep' ? 'square' : chime === 'synth' ? 'sawtooth' : 'sine';
  const notes = frequencies;

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + i * 0.18;
    const duration = 0.5;
    osc.type = oscillatorType;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.9, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  });
}

export function playTick(volume: number): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 1000;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.min(1, Math.max(0, volume)) * 0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.08);
}

/** Call once from a user gesture to unlock audio in Safari/iOS. */
export function primeAudio(): void {
  const ctx = getContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}
