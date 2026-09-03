import React, { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue } from 'motion/react';
import {
  RobotPosition,
  clampPositionToViewport,
  loadSavedRobotPosition,
  saveRobotPosition,
} from './jami-floating-position';

interface JamiFloatingRobotStageProps {
  children: (props: {
    isDragging: boolean;
    dragVelocityX: number;
    dragVelocityY: number;
  }) => React.ReactNode;
  robotWidth?: number;
  robotHeight?: number;
  className?: string;
}

export const JamiFloatingRobotStage: React.FC<JamiFloatingRobotStageProps> = ({
  children,
  robotWidth = 148,
  robotHeight = 214,
  className,
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dragVelocity, setDragVelocity] = useState({ vx: 0, vy: 0 });

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const suppressNextClickRef = useRef(false);
  const dragStartRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    robotStartX: number;
    robotStartY: number;
    hasMoved: boolean;
  } | null>(null);

  const lastPosRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });
  const lastVelocityUpdateRef = useRef<number>(0);

  // Check if any modal is currently open to hide floating elements
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const checkModal = () => {
      const hasModal = document.body.getAttribute('data-modal-open') === 'true';
      setIsModalOpen(hasModal);
    };

    checkModal();

    const observer = new MutationObserver(checkModal);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-modal-open'] });

    return () => observer.disconnect();
  }, []);

  // Initialize position on client mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const initialPos = loadSavedRobotPosition(vw, vh, robotWidth, robotHeight);

    x.set(initialPos.x);
    y.set(initialPos.y);
    setIsInitialized(true);

    const handleResize = () => {
      const currentX = x.get();
      const currentY = y.get();
      const clamped = clampPositionToViewport(
        { x: currentX, y: currentY },
        window.innerWidth,
        window.innerHeight,
        robotWidth,
        robotHeight
      );
      x.set(clamped.x);
      y.set(clamped.y);
      saveRobotPosition(clamped);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [robotWidth, robotHeight, x, y]);

  // Pointer drag handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // Ignore drag start if initiated from interactive controls or exclusion markers
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('a') ||
      target.closest('[data-no-robot-drag]')
    ) {
      return;
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_err) {
      // Ignore pointer capture errors
    }

    dragStartRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      robotStartX: x.get(),
      robotStartY: y.get(),
      hasMoved: false,
    };

    lastPosRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || dragStartRef.current.pointerId !== e.pointerId) return;

    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    const dist = Math.hypot(dx, dy);

    const isMobile = window.innerWidth < 768;
    const threshold = isMobile ? 8 : 5;

    if (!dragStartRef.current.hasMoved) {
      if (dist >= threshold) {
        dragStartRef.current.hasMoved = true;
        suppressNextClickRef.current = true;
        setIsDragging(true);
      } else {
        return;
      }
    }

    // Throttle velocity state update to 30fps
    const now = Date.now();
    const dt = Math.max(1, now - lastPosRef.current.time);
    const vx = ((e.clientX - lastPosRef.current.x) / dt) * 1000;
    const vy = ((e.clientY - lastPosRef.current.y) / dt) * 1000;

    if (now - lastVelocityUpdateRef.current > 32) {
      setDragVelocity({ vx, vy });
      lastVelocityUpdateRef.current = now;
    }

    lastPosRef.current = { x: e.clientX, y: e.clientY, time: now };

    const rawX = dragStartRef.current.robotStartX + dx;
    const rawY = dragStartRef.current.robotStartY + dy;

    const clamped = clampPositionToViewport(
      { x: rawX, y: rawY },
      window.innerWidth,
      window.innerHeight,
      robotWidth,
      robotHeight
    );

    x.set(clamped.x);
    y.set(clamped.y);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || dragStartRef.current.pointerId !== e.pointerId) return;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (_err) {
      // Ignore
    }

    if (dragStartRef.current.hasMoved) {
      const finalPos: RobotPosition = { x: x.get(), y: y.get() };
      saveRobotPosition(finalPos);
    }

    dragStartRef.current = null;
    setIsDragging(false);
    setDragVelocity({ vx: 0, vy: 0 });
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    handlePointerUp(e);
  };

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressNextClickRef.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressNextClickRef.current = false;
    }
  };

  return (
    <motion.div
      className={`fixed top-0 left-0 z-40 touch-none select-none jami-floating-robot-stage transition-opacity duration-200 ${className || ''}`}
      aria-hidden={isModalOpen ? true : undefined}
      style={{
        x,
        y,
        width: robotWidth,
        height: robotHeight,
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isInitialized && !isModalOpen ? 1 : 0,
        pointerEvents: isInitialized && !isModalOpen ? 'auto' : 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClickCapture={handleClickCapture}
    >
      {children({
        isDragging,
        dragVelocityX: dragVelocity.vx,
        dragVelocityY: dragVelocity.vy,
      })}
    </motion.div>
  );
};
