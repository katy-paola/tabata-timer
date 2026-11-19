export interface Prefs {
  sound: boolean;
  vibration: boolean;
}

const PREFS_KEY = 'tabata.prefs.v1';
let prefs: Prefs = { sound: true, vibration: true };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      prefs = { sound: parsed.sound !== false, vibration: parsed.vibration !== false };
    }
  } catch {
    // Preferencias corruptas: se usan los valores por defecto.
  }
  return { ...prefs };
}

export function setPrefs(next: Prefs): void {
  prefs = { ...next };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Sin almacenamiento disponible: las preferencias duran solo esta sesión.
  }
}

/* ---------- Sonido (Web Audio) ---------- */

let audioCtx: AudioContext | null = null;

function ensureAudio(): AudioContext | null {
  if (!prefs.sound) return null;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    return audioCtx;
  } catch {
    return null;
  }
}

type ToneStep = { freq: number; duration: number; gap?: number; gain?: number; type?: OscillatorType };

function schedule(ctx: AudioContext, steps: ToneStep[]): void {
  let t = ctx.currentTime;
  for (const step of steps) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = step.type ?? 'sine';
    osc.frequency.setValueAtTime(step.freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(step.gain ?? 0.22, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + step.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + step.duration + 0.02);
    t += step.duration + (step.gap ?? 0);
  }
}

function withAudio(play: (ctx: AudioContext) => void): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  if (ctx.state === 'running') {
    play(ctx);
  } else {
    ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running') play(ctx);
      })
      .catch(() => {});
  }
}

/**
 * Desbloquea el contexto de audio. Debe llamarse con un gesto del usuario
 * (obligatorio en iOS): al iniciar el entrenamiento.
 */
export function unlockAudio(): void {
  const ctx = ensureAudio();
  if (ctx && ctx.state !== 'running') {
    ctx.resume().catch(() => {});
  }
}

/** Reintenta activar el audio al volver a la app (iOS no lo hace solo). */
export function resumeAudio(): void {
  if (audioCtx && audioCtx.state !== 'running') {
    audioCtx.resume().catch(() => {});
  }
}

export type PhaseSound = 'prep' | 'work' | 'rest' | 'seriesRest';

/** Sonido distintivo al entrar en una fase. */
export function playPhaseSound(phase: PhaseSound): void {
  withAudio((ctx) => {
    switch (phase) {
      case 'prep':
        schedule(ctx, [
          { freq: 440, duration: 0.12, gap: 0.04, gain: 0.2 },
          { freq: 554, duration: 0.16, gain: 0.22 },
        ]);
        break;
      case 'work':
        schedule(ctx, [
          { freq: 880, duration: 0.18, gap: 0.03, gain: 0.24, type: 'triangle' },
          { freq: 988, duration: 0.12, gain: 0.18, type: 'triangle' },
        ]);
        break;
      case 'rest':
      case 'seriesRest':
        schedule(ctx, [
          { freq: 523, duration: 0.18, gap: 0.03, gain: 0.18 },
          { freq: 440, duration: 0.22, gain: 0.16 },
        ]);
        break;
    }
  });
}

/** Sonido al completar todo el entrenamiento. */
export function playCompleteSound(): void {
  withAudio((ctx) => {
    schedule(ctx, [
      { freq: 523, duration: 0.12, gap: 0.03, gain: 0.2 },
      { freq: 659, duration: 0.12, gap: 0.03, gain: 0.22 },
      { freq: 784, duration: 0.28, gain: 0.24 },
    ]);
  });
}

/**
 * Sonido sutil al mostrar las estrellas del resumen.
 * Toca una nota suave por estrella, sincronizada con su animación (120 ms).
 */
export function playStarsSound(count: number): void {
  const notes = [659.25, 783.99, 987.77]; // Mi5, Sol5, Si5
  const n = Math.max(1, Math.min(3, count));
  withAudio((ctx) => {
    const start = ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const t = start + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(notes[i], t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.1, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);

      // Armónico suave para un brillo discreto.
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(notes[i] * 2, t);
      gain2.gain.setValueAtTime(0.0001, t);
      gain2.gain.exponentialRampToValueAtTime(0.03, t + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc2.connect(gain2).connect(ctx.destination);
      osc2.start(t);
      osc2.stop(t + 0.4);
    }
  });
}

/** Tick corto para la cuenta regresiva (últimos segundos). */
export function playCountdownTick(): void {
  withAudio((ctx) => {
    schedule(ctx, [{ freq: 1000, duration: 0.06, gain: 0.12, type: 'square' }]);
  });
}

/* ---------- Vibración (solo donde hay soporte: Android) ---------- */

export function vibrate(): void {
  if (!prefs.vibration) return;
  try {
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
  } catch {
    // El navegador no permite vibrar: se ignora.
  }
}

/* ---------- Wake Lock (mantener la pantalla encendida) ---------- */

let sentinel: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // El sistema rechazó el bloqueo (batería, ajustes): se ignora.
  }
}

export function releaseWakeLock(): void {
  const current = sentinel;
  sentinel = null;
  current?.release().catch(() => {});
}
