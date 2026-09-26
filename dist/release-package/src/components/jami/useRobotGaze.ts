import React, { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, MotionValue } from 'motion/react';
import { RobotVisualState } from './robot-types';

interface UseRobotGazeOptions {
  robotRef: React.RefObject<HTMLDivElement | null>;
  state: RobotVisualState;
  reducedMotion?: boolean;
}

export interface UseRobotGazeResult {
  irisX: MotionValue<number>;
  irisY: MotionValue<number>;
  headTiltX: MotionValue<number>;
  headTiltY: MotionValue<number>;
}

export function useRobotGaze({
  robotRef,
  state,
  reducedMotion = false,
}: UseRobotGazeOptions): UseRobotGazeResult {
  // Raw target motion values
  const rawIrisX = useMotionValue(0);
  const rawIrisY = useMotionValue(0);
  const rawTiltX = useMotionValue(0);
  const rawTiltY = useMotionValue(0);

  // Damped spring motion values for smooth lag and realistic inertia
  const springConfig = { stiffness: 120, damping: 18, mass: 0.8 };
  const irisX = useSpring(rawIrisX, springConfig);
  const irisY = useSpring(rawIrisY, springConfig);
  const headTiltX = useSpring(rawTiltX, springConfig);
  const headTiltY = useSpring(rawTiltY, springConfig);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reducedMotion || state === 'sleeping' || state === 'poweredDown' || state === 'suspended') {
      rawIrisX.set(0);
      rawIrisY.set(0);
      rawTiltX.set(0);
      rawTiltY.set(0);
      return;
    }

    if (state === 'thinking') {
      // Thinking trajectory: look slightly upward and to the side
      rawIrisX.set(3.5);
      rawIrisY.set(-4.5);
      rawTiltX.set(3);
      rawTiltY.set(-2);
      return;
    }

    const resetToCenter = () => {
      rawIrisX.set(0);
      rawIrisY.set(0);
      rawTiltX.set(0);
      rawTiltY.set(0);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!robotRef.current) return;

      const rect = robotRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height * 0.2; // Head is located ~20% from top

      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const distance = Math.hypot(dx, dy);

      if (distance < 1) {
        resetToCenter();
        return;
      }

      // Max iris offset = 6.0 SVG units
      const maxIrisOffset = 6.0;
      const maxTiltAngle = 4.0; // Degrees

      // Normalization with ease clamp
      const strength = Math.min(distance / 500, 1.0);
      const angle = Math.atan2(dy, dx);

      const targetIrisX = Math.cos(angle) * maxIrisOffset * strength;
      const targetIrisY = Math.sin(angle) * maxIrisOffset * strength;

      const targetTiltX = (dx / (window.innerWidth || 1000)) * maxTiltAngle;
      const targetTiltY = (dy / (window.innerHeight || 800)) * maxTiltAngle;

      rawIrisX.set(targetIrisX);
      rawIrisY.set(targetIrisY);
      rawTiltX.set(targetTiltX);
      rawTiltY.set(targetTiltY);

      // Auto-recenter after 3 seconds of stillness
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        resetToCenter();
      }, 3000);
    };

    const handlePointerLeave = () => {
      resetToCenter();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('blur', handlePointerLeave);
    document.addEventListener('mouseleave', handlePointerLeave);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('blur', handlePointerLeave);
      document.removeEventListener('mouseleave', handlePointerLeave);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [robotRef, state, reducedMotion, rawIrisX, rawIrisY, rawTiltX, rawTiltY]);

  return {
    irisX,
    irisY,
    headTiltX,
    headTiltY,
  };
}
