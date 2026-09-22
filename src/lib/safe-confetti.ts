import confetti from 'canvas-confetti';

/**
 * Safe Confetti Utility for JAMI AI
 * Uses a non-worker instance (`useWorker: false`) to strictly prevent CSP violations
 * caused by Blob Web Workers, and respects `prefers-reduced-motion`.
 */
function getSafeConfetti() {
  if (typeof window === 'undefined') return null;
  try {
    const anyConfetti = confetti as any;
    if (typeof anyConfetti?.create === 'function') {
      return anyConfetti.create(undefined, {
        resize: true,
        useWorker: false,
        disableForReducedMotion: true,
      });
    }
    if (typeof anyConfetti === 'function') {
      return anyConfetti;
    }
  } catch {}
  return null;
}

let safeConfettiInstance: any = null;
try {
  safeConfettiInstance = getSafeConfetti();
} catch {}

export interface ConfettiOptions {
  particleCount?: number;
  spread?: number;
  startVelocity?: number;
  origin?: { x?: number; y?: number };
  colors?: string[];
  ticks?: number;
  scalar?: number;
}

export function fireSafeConfetti(options?: ConfettiOptions): void {
  if (typeof window === 'undefined') return;

  // Check reduced motion preference
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
  } catch {}

  try {
    if (safeConfettiInstance) {
      safeConfettiInstance({
        particleCount: options?.particleCount ?? 50,
        spread: options?.spread ?? 60,
        origin: options?.origin ?? { y: 0.7 },
        colors: options?.colors ?? ['#22C55E', '#16A34A', '#86EFAC', '#FACC15', '#38BDF8'],
        ...options,
      });
    }
  } catch (err) {
    // Fail silently without breaking UI if canvas context is unavailable
    console.debug('[SafeConfetti] Execution skipped or failed gracefully:', err);
  }
}

export default fireSafeConfetti;
