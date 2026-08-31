import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, MotionValue } from 'motion/react';
import { RobotVisualState, MouthShape, RobotDisplayMode } from '../robot-types';
import {
  PremiumFaceMode,
  JAMI_FULL_BODY_GEOMETRY,
  JAMI_HEAD_GEOMETRY,
} from './jami-premium-geometry';
import { JamiAnimatedFaceOverlay } from './JamiAnimatedFaceOverlay';

export interface JamiPremiumRobotVisualProps {
  width: number;
  height: number;
  displayMode?: RobotDisplayMode;
  faceMode?: PremiumFaceMode;
  state: RobotVisualState;
  isHovered?: boolean;
  isDragging?: boolean;
  dragVelocityX?: number;
  dragVelocityY?: number;
  mouthShape: MouthShape;
  speechEnergy?: number;
  blinkProgress: number;
  irisX?: MotionValue<number> | number;
  irisY?: MotionValue<number> | number;
  headTiltX?: MotionValue<number> | number;
  headTiltY?: MotionValue<number> | number;
  isSpeaking: boolean;
  reducedMotion?: boolean;
  className?: string;
  onImageError?: () => void;
}

export const JamiPremiumRobotVisual: React.FC<JamiPremiumRobotVisualProps> = ({
  width,
  height,
  displayMode = 'full',
  faceMode = 'source',
  state,
  isHovered = false,
  isDragging = false,
  dragVelocityX = 0,
  dragVelocityY: _dragVelocityY = 0,
  mouthShape,
  speechEnergy = 0,
  blinkProgress,
  irisX,
  irisY,
  headTiltX: _headTiltX,
  headTiltY: _headTiltY,
  isSpeaking,
  reducedMotion = false,
  className,
  onImageError,
}) => {
  const isHead = displayMode === 'head';

  const primaryImageSrc = isHead
    ? '/robot/jami-robot-head-base.png'
    : '/robot/jami-robot-premium-base.png';

  const [currentSrc, setCurrentSrc] = useState(primaryImageSrc);

  // Sync image source whenever displayMode changes
  useEffect(() => {
    setCurrentSrc(primaryImageSrc);
  }, [primaryImageSrc]);

  const geom = isHead ? JAMI_HEAD_GEOMETRY : JAMI_FULL_BODY_GEOMETRY;

  const isListening = state === 'listening' || state === 'acknowledge';
  const isThinking = state === 'thinking';
  const isWorking = state === 'working';
  const isCelebrating = state === 'celebrating';

  // Dynamic tilt angle calculation (clamped ±1.5°)
  const tiltAngle = isDragging
    ? Math.max(-1.5, Math.min(1.5, dragVelocityX * 0.0025))
    : isListening
    ? 0.6
    : isThinking
    ? -0.6
    : 0;

  return (
    <div
      className={`relative flex items-center justify-center select-none overflow-visible font-sans ${className || ''}`}
      style={{
        width,
        height,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {/* 1. Dynamic Soft Ground Shadow (Full body mode only) */}
      {!isHead && (
        <motion.div
          className="absolute bottom-[1%] left-[50%] -translate-x-[50%] rounded-[50%] pointer-events-none"
          style={{
            width: width * 0.54,
            height: height * 0.075,
            background:
              'radial-gradient(ellipse at center, rgba(15, 23, 42, 0.48) 0%, rgba(15, 23, 42, 0) 70%)',
            filter: isDragging ? 'blur(8px)' : 'blur(4px)',
            opacity: isDragging ? 0.35 : 0.65,
          }}
          animate={
            reducedMotion
              ? {}
              : {
                  scale: isDragging ? 0.92 : [1, 1.025, 1],
                  y: isDragging ? 4 : [0, -1.5, 0],
                }
          }
          transition={{
            duration: isDragging ? 0.2 : 4.6,
            repeat: isDragging ? 0 : Infinity,
            ease: 'easeInOut',
          }}
        />
      )}

      {/* 2. Listening Pulse Rings Behind Head */}
      <AnimatePresence>
        {isListening && !reducedMotion && (
          <>
            <motion.div
              key="listen-ring-1"
              className="absolute rounded-full border border-cyan-400/60 pointer-events-none"
              style={{
                width: width * 0.62,
                height: width * 0.62,
                top: (height * geom.headCenter.y) / geom.naturalHeight - width * 0.31,
                left: (width * geom.headCenter.x) / geom.naturalWidth - width * 0.31,
                boxShadow: '0 0 18px rgba(6, 182, 212, 0.45)',
              }}
              initial={{ scale: 0.8, opacity: 0.8 }}
              animate={{ scale: [0.85, 1.22, 0.85], opacity: [0.8, 0.2, 0.8] }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              key="listen-ring-2"
              className="absolute rounded-full border border-emerald-400/40 pointer-events-none"
              style={{
                width: width * 0.8,
                height: width * 0.8,
                top: (height * geom.headCenter.y) / geom.naturalHeight - width * 0.4,
                left: (width * geom.headCenter.x) / geom.naturalWidth - width * 0.4,
                boxShadow: '0 0 22px rgba(34, 197, 94, 0.35)',
              }}
              initial={{ scale: 0.8, opacity: 0.5 }}
              animate={{ scale: [0.9, 1.32, 0.9], opacity: [0.5, 0.1, 0.5] }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </>
        )}
      </AnimatePresence>

      {/* 3. Main Character Host Container with Micro Motion */}
      <motion.div
        className="relative w-full h-full flex items-center justify-center overflow-visible"
        animate={
          reducedMotion
            ? {}
            : {
                y: isDragging
                  ? -2
                  : isHovered
                  ? -3
                  : isCelebrating
                  ? [0, -6, 0]
                  : [0, -1.8, 0, 1, 0],
                rotate: tiltAngle,
                scale: isDragging
                  ? 1.018
                  : isHovered
                  ? 1.012
                  : isCelebrating
                  ? 1.02
                  : 1,
              }
        }
        transition={{
          y: isDragging
            ? { duration: 0.15 }
            : isCelebrating
            ? { duration: 0.7, ease: 'easeInOut' }
            : { duration: 5.0, repeat: Infinity, ease: 'easeInOut' },
          rotate: { duration: 0.22, ease: 'easeOut' },
          scale: { duration: 0.18, ease: 'easeOut' },
        }}
      >
        {/* Inner Media Frame with Exact Aspect Ratio */}
        <div
          className="relative w-full h-full flex items-center justify-center"
          style={{
            aspectRatio: `${geom.naturalWidth} / ${geom.naturalHeight}`,
          }}
        >
          {/* Base Character Image */}
          <img
            src={currentSrc}
            alt=""
            draggable={false}
            onError={onImageError}
            className={`w-full h-full object-contain pointer-events-none select-none transition-filter duration-300 ${
              isHovered
                ? 'drop-shadow-[0_0_14px_rgba(6,182,212,0.4)]'
                : isListening
                ? 'drop-shadow-[0_0_16px_rgba(6,182,212,0.5)]'
                : isThinking
                ? 'drop-shadow-[0_0_14px_rgba(34,197,94,0.45)]'
                : state === 'error'
                ? 'drop-shadow-[0_0_12px_rgba(244,63,94,0.5)]'
                : 'drop-shadow-[0_4px_16px_rgba(6,182,212,0.2)]'
            }`}
            style={{
              WebkitUserDrag: 'none',
              userSelect: 'none',
            }}
          />

          {/* Animated Face & Overlay (when faceMode !== 'source' or debug enabled) */}
          <JamiAnimatedFaceOverlay
            displayMode={displayMode}
            faceMode={faceMode}
            state={state}
            mouthShape={mouthShape}
            irisX={irisX}
            irisY={irisY}
            blinkProgress={blinkProgress}
            isSpeaking={isSpeaking}
            speechEnergy={speechEnergy}
            reducedMotion={reducedMotion}
          />
        </div>

        {/* Thinking Floating Particles */}
        {isThinking && !reducedMotion && (
          <div className="absolute inset-0 pointer-events-none overflow-visible">
            <motion.div
              className="absolute w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_6px_#22d3ee]"
              style={{
                left: (width * geom.antennaCenter.x) / geom.naturalWidth - 12,
                top: (height * geom.antennaCenter.y) / geom.naturalHeight - 18,
              }}
              animate={{ y: [-2, -10, -2], opacity: [0.2, 0.9, 0.2] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"
              style={{
                left: (width * geom.antennaCenter.x) / geom.naturalWidth + 14,
                top: (height * geom.antennaCenter.y) / geom.naturalHeight - 26,
              }}
              animate={{ y: [-4, -14, -4], opacity: [0.3, 1.0, 0.3] }}
              transition={{ duration: 1.8, repeat: Infinity, delay: 0.3, ease: 'easeInOut' }}
            />
          </div>
        )}

        {/* Foot Thrusters in Working State (Full body mode) */}
        {!isHead && isWorking && !reducedMotion && (
          <div className="absolute inset-0 pointer-events-none overflow-visible">
            <motion.div
              className="absolute rounded-full bg-cyan-400 blur-[2px]"
              style={{
                left: (width * (geom as typeof JAMI_FULL_BODY_GEOMETRY).leftFoot.x) / geom.naturalWidth - 7,
                top: (height * (geom as typeof JAMI_FULL_BODY_GEOMETRY).leftFoot.y) / geom.naturalHeight,
                width: 14,
                height: 10,
                boxShadow: '0 4px 10px rgba(6, 182, 212, 0.9)',
              }}
              animate={{ opacity: [0.6, 1.0, 0.6], scaleY: [0.8, 1.2, 0.8] }}
              transition={{ duration: 0.3, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute rounded-full bg-cyan-400 blur-[2px]"
              style={{
                left: (width * (geom as typeof JAMI_FULL_BODY_GEOMETRY).rightFoot.x) / geom.naturalWidth - 7,
                top: (height * (geom as typeof JAMI_FULL_BODY_GEOMETRY).rightFoot.y) / geom.naturalHeight,
                width: 14,
                height: 10,
                boxShadow: '0 4px 10px rgba(6, 182, 212, 0.9)',
              }}
              animate={{ opacity: [0.6, 1.0, 0.6], scaleY: [0.8, 1.2, 0.8] }}
              transition={{ duration: 0.3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        )}
      </motion.div>
    </div>
  );
};
