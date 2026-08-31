import { useState, useEffect, useRef, useCallback } from 'react';
import { RobotVisualState } from './robot-types';

interface UseNaturalBlinkOptions {
  state: RobotVisualState;
  reducedMotion?: boolean;
}

export interface UseNaturalBlinkResult {
  isBlinking: boolean;
  blinkProgress: number; // 0 (fully open) to 1 (fully closed shutter)
}

export function useNaturalBlink({
  state,
  reducedMotion = false,
}: UseNaturalBlinkOptions): UseNaturalBlinkResult {
  const [isBlinking, setIsBlinking] = useState(false);
  const [blinkProgress, setBlinkProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const triggerBlink = useCallback((isSecondOfDouble = false) => {
    if (!isMountedRef.current) return;

    const blinkDuration = 110 + Math.random() * 50; // 110-160ms

    setIsBlinking(true);
    setBlinkProgress(1);

    timerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setIsBlinking(false);
      setBlinkProgress(0);

      // Check for double blink (15% chance if not already in double blink)
      const shouldDoubleBlink = !isSecondOfDouble && Math.random() < 0.15;

      if (shouldDoubleBlink) {
        const doubleBlinkGap = 90 + Math.random() * 60; // 90-150ms
        timerRef.current = setTimeout(() => {
          triggerBlink(true);
        }, doubleBlinkGap);
      } else {
        // Schedule next standard blink between 2500ms and 6500ms
        scheduleNextBlink();
      }
    }, blinkDuration);
  }, []);

  const scheduleNextBlink = useCallback(() => {
    clearTimer();
    if (!isMountedRef.current) return;

    // Do not blink in sleeping, powered down, suspended, or reduced motion
    if (
      state === 'sleeping' ||
      state === 'poweredDown' ||
      state === 'suspended' ||
      reducedMotion
    ) {
      setIsBlinking(false);
      setBlinkProgress(0);
      return;
    }

    const nextDelay = 2500 + Math.random() * 4000; // 2500ms to 6500ms

    timerRef.current = setTimeout(() => {
      triggerBlink(false);
    }, nextDelay);
  }, [state, reducedMotion, clearTimer, triggerBlink]);

  useEffect(() => {
    isMountedRef.current = true;

    if (state === 'sleeping' || state === 'poweredDown' || state === 'suspended' || reducedMotion) {
      clearTimer();
      setIsBlinking(false);
      setBlinkProgress(0);
      return;
    }

    if (state === 'acknowledge') {
      clearTimer();
      setIsBlinking(false);
      setBlinkProgress(0);
      // Keep eye wide open after wake word
      timerRef.current = setTimeout(() => {
        scheduleNextBlink();
      }, 900);
      return;
    }

    scheduleNextBlink();

    return () => {
      clearTimer();
    };
  }, [state, reducedMotion, scheduleNextBlink, clearTimer]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  return {
    isBlinking,
    blinkProgress,
  };
}
