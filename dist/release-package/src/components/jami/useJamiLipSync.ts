import { useState, useEffect, useRef, useCallback } from 'react';
import { MouthShape } from './robot-types';

interface UseJamiLipSyncOptions {
  isSpeaking: boolean;
  text?: string;
  rate?: number;
  remoteAudioElement?: HTMLAudioElement | null;
  remoteMediaStream?: MediaStream | null;
  reducedMotion?: boolean;
}

export interface UseJamiLipSyncResult {
  mouthShape: MouthShape;
  speechEnergy: number; // 0.0 to 1.0
  isPunctuationPause: boolean;
}

/**
 * Normalizes Vietnamese character to base phoneme for accurate visual mouth cue
 */
function getMouthShapeForChar(char: string): MouthShape {
  if (!char || !char.trim()) return 'rest';

  // Punctuation
  if (['.', '?', '!', '…'].includes(char)) return 'rest';
  if ([',', ';', ':', '-'].includes(char)) return 'rest';

  // Normalize Unicode combining diacritics
  const normalized = char
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const c = normalized[0];

  // Phonetic grouping
  if (['m', 'b', 'p'].includes(c)) return 'closed';
  if (['a', 'ă', 'â'].includes(c) || c === 'a') return 'wide';
  if (['e', 'ê', 'i', 'y'].includes(c)) return 'narrow';
  if (['o', 'ô', 'ơ'].includes(c) || c === 'o') return 'round';
  if (['u', 'ư'].includes(c) || c === 'u') return 'round';
  if (['f', 'v'].includes(c)) return 'small';
  if (['d', 'đ', 't', 'n', 'l', 's', 'x', 'r', 'c', 'k', 'g', 'h'].includes(c) || char.toLowerCase() === 'đ') {
    return 'small';
  }

  return 'small';
}

/**
 * Parses Vietnamese sentence into timed phonetic cues
 */
export function buildVietnameseCueSequence(
  text: string,
  rate = 1.0
): Array<{ shape: MouthShape; durationMs: number }> {
  if (!text || !text.trim()) return [];

  const clean = text.replace(/[*_#`[\]()]/g, '').trim();
  const cues: Array<{ shape: MouthShape; durationMs: number }> = [];
  const baseVowelDuration = Math.max(50, Math.round(90 / (rate || 1.0)));
  const baseConsonantDuration = Math.max(40, Math.round(65 / (rate || 1.0)));

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (['.', '?', '!', '…'].includes(ch)) {
      cues.push({ shape: 'rest', durationMs: 180 });
      continue;
    }
    if ([',', ';', ':'].includes(ch)) {
      cues.push({ shape: 'rest', durationMs: 100 });
      continue;
    }
    if (ch === ' ' || ch === '\n') {
      cues.push({ shape: 'rest', durationMs: 50 });
      continue;
    }

    const shape = getMouthShapeForChar(ch);
    const duration =
      shape === 'wide' || shape === 'round' || shape === 'narrow'
        ? baseVowelDuration
        : baseConsonantDuration;

    cues.push({ shape, durationMs: duration });
  }

  return cues;
}

export function useJamiLipSync({
  isSpeaking,
  text = '',
  rate = 1.0,
  remoteAudioElement,
  remoteMediaStream,
  reducedMotion = false,
}: UseJamiLipSyncOptions): UseJamiLipSyncResult {
  const [mouthShape, setMouthShape] = useState<MouthShape>('rest');
  const [speechEnergy, setSpeechEnergy] = useState<number>(0);
  const [isPunctuationPause, setIsPunctuationPause] = useState(false);

  // Cue animation references
  const cueIndexRef = useRef<number>(0);
  const cueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Web Audio Analyser references for remote WebRTC stream
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null);

  const clearTimers = useCallback(() => {
    if (cueTimerRef.current !== null) {
      clearTimeout(cueTimerRef.current);
      cueTimerRef.current = null;
    }
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // Web Audio Analyser Setup
  useEffect(() => {
    if (!isSpeaking || reducedMotion) {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try {
          audioCtxRef.current.close();
        } catch {}
        audioCtxRef.current = null;
      }
      return;
    }

    // Try setting up Web Audio API if remote media stream or element exists
    const stream = remoteMediaStream || (remoteAudioElement as any)?.srcObject;
    if (stream && typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.4;
        analyserRef.current = analyser;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        sourceNodeRef.current = source;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let smoothedEnergy = 0;

        const analyzeFrame = () => {
          if (!isSpeaking) {
            setSpeechEnergy(0);
            return;
          }

          analyser.getByteTimeDomainData(dataArray);

          // Calculate RMS amplitude
          let sumSquares = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const val = (dataArray[i] - 128) / 128;
            sumSquares += val * val;
          }
          const rms = Math.sqrt(sumSquares / dataArray.length);

          // Attack/Release smoothing
          const targetEnergy = Math.min(rms * 4.5, 1.0);
          if (targetEnergy > smoothedEnergy) {
            smoothedEnergy += (targetEnergy - smoothedEnergy) * 0.45; // Fast attack
          } else {
            smoothedEnergy += (targetEnergy - smoothedEnergy) * 0.18; // Soft release
          }

          setSpeechEnergy(smoothedEnergy);

          // Derive shape from audio energy if text is not available
          if (!text) {
            if (smoothedEnergy < 0.08) {
              setMouthShape('rest');
            } else if (smoothedEnergy < 0.35) {
              setMouthShape('small');
            } else if (smoothedEnergy < 0.7) {
              setMouthShape('narrow');
            } else {
              setMouthShape('wide');
            }
          }

          animFrameRef.current = requestAnimationFrame(analyzeFrame);
        };

        animFrameRef.current = requestAnimationFrame(analyzeFrame);
      } catch {
        // Fall back cleanly to text cues
      }
    }

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try {
          audioCtxRef.current.close();
        } catch {}
      }
    };
  }, [isSpeaking, remoteMediaStream, remoteAudioElement, text, reducedMotion]);

  // Procedural Vietnamese Cue Runner (Fallback 2 & Speech Synthesis sync)
  useEffect(() => {
    if (!isSpeaking || reducedMotion) {
      clearTimers();
      setMouthShape('rest');
      setSpeechEnergy(0);
      setIsPunctuationPause(false);
      return;
    }

    const cues = buildVietnameseCueSequence(text || 'A O E', rate);
    if (cues.length === 0) {
      setMouthShape('small');
      setSpeechEnergy(0.5);
      return;
    }

    cueIndexRef.current = 0;

    const playNextCue = () => {
      if (cueIndexRef.current >= cues.length) {
        // Loop cues gracefully if speech continues
        cueIndexRef.current = 0;
      }

      const currentCue = cues[cueIndexRef.current];
      setMouthShape(currentCue.shape);
      setIsPunctuationPause(currentCue.shape === 'rest' && currentCue.durationMs >= 100);

      // Procedural energy pulse
      const shapeEnergy =
        currentCue.shape === 'wide'
          ? 0.9
          : currentCue.shape === 'round'
          ? 0.75
          : currentCue.shape === 'narrow'
          ? 0.6
          : currentCue.shape === 'small'
          ? 0.4
          : currentCue.shape === 'closed'
          ? 0.2
          : 0;
      setSpeechEnergy(shapeEnergy);

      cueIndexRef.current++;

      cueTimerRef.current = setTimeout(playNextCue, currentCue.durationMs);
    };

    playNextCue();

    return () => {
      clearTimers();
      setMouthShape('rest');
      setSpeechEnergy(0);
    };
  }, [isSpeaking, text, rate, reducedMotion, clearTimers]);

  return {
    mouthShape: isSpeaking ? mouthShape : 'rest',
    speechEnergy: isSpeaking ? speechEnergy : 0,
    isPunctuationPause,
  };
}
