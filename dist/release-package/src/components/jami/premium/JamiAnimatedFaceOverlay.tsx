import React, { useId, useState, useEffect } from 'react';
import { motion, MotionValue } from 'motion/react';
import { RobotVisualState, MouthShape, RobotDisplayMode } from '../robot-types';
import {
  PremiumFaceMode,
  JAMI_FULL_BODY_GEOMETRY,
  JAMI_HEAD_GEOMETRY,
} from './jami-premium-geometry';

interface JamiAnimatedFaceOverlayProps {
  displayMode: RobotDisplayMode;
  faceMode?: PremiumFaceMode;
  state: RobotVisualState;
  mouthShape: MouthShape;
  irisX?: MotionValue<number> | number;
  irisY?: MotionValue<number> | number;
  blinkProgress: number;
  isSpeaking: boolean;
  speechEnergy?: number;
  reducedMotion?: boolean;
}

export const JamiAnimatedFaceOverlay: React.FC<JamiAnimatedFaceOverlayProps> = ({
  displayMode,
  faceMode = 'source',
  state,
  mouthShape,
  irisX: _irisX,
  irisY: _irisY,
  blinkProgress,
  isSpeaking,
  speechEnergy = 0,
  reducedMotion = false,
}) => {
  const rawId = useId();
  const instanceId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');

  const [isDebug, setIsDebug] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const debugMode =
        window.location.search.includes('jamiRobotDebug=1') ||
        localStorage.getItem('jami.robot.debug') === '1';
      setIsDebug(debugMode);
    }
  }, []);

  const isHead = displayMode === 'head';
  const geom = isHead ? JAMI_HEAD_GEOMETRY : JAMI_FULL_BODY_GEOMETRY;

  // In source mode, do not render any face or brand overlays unless debug boxes are enabled
  if (faceMode === 'source' && !isDebug) {
    return null;
  }

  const isError = state === 'error';
  const isWarning = state === 'presenting' || state === 'attentiveWarning';
  const isSleeping = state === 'sleeping';
  const isPoweredDown = state === 'poweredDown';
  const isCelebrating = state === 'celebrating' || state === 'encouraging';

  const eyeColor = isError
    ? '#F43F5E'
    : isWarning
    ? '#F59E0B'
    : isPoweredDown
    ? '#3F3F46'
    : isSleeping
    ? '#15803D'
    : isCelebrating
    ? '#4ADE80'
    : '#22D3EE';

  const glowColor = isError
    ? 'rgba(244, 63, 94, 0.7)'
    : isWarning
    ? 'rgba(245, 158, 11, 0.7)'
    : isPoweredDown
    ? 'transparent'
    : isSleeping
    ? 'rgba(21, 128, 61, 0.3)'
    : 'rgba(34, 211, 238, 0.75)';

  const effectiveClose = isSleeping || isPoweredDown ? 1.0 : blinkProgress;

  // Mouth shape dimension calculation in natural pixels
  const getMouthDimensions = (s: MouthShape) => {
    const baseW = geom.mouth.width;
    const baseH = geom.mouth.height;
    switch (s) {
      case 'closed':
        return { w: baseW * 0.9, h: baseH * 0.25, rx: 2 };
      case 'small':
        return { w: baseW * 0.7, h: baseH * 0.65, rx: 4 };
      case 'wide':
        return { w: baseW * 1.3, h: baseH * 1.15, rx: 7 };
      case 'narrow':
        return { w: baseW * 1.1, h: baseH * 0.45, rx: 3 };
      case 'round':
        return { w: baseW * 0.65, h: baseH * 1.3, rx: 9 };
      case 'smile':
        return { w: baseW * 1.15, h: baseH * 0.7, rx: 5 };
      case 'rest':
      default:
        return { w: baseW * 0.85, h: baseH * 0.32, rx: 2.5 };
    }
  };

  const activeShape: MouthShape = isSpeaking
    ? mouthShape
    : isCelebrating
    ? 'smile'
    : 'rest';

  const mouthDim = getMouthDimensions(activeShape);
  const energyScale = 1.0 + (isSpeaking ? speechEnergy * 0.18 : 0);

  const visorClipId = `visor-clip-${instanceId}`;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none select-none z-10"
      viewBox={`0 0 ${geom.naturalWidth} ${geom.naturalHeight}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={visorClipId}>
          <path d={geom.faceVisor.path} />
        </clipPath>

        <linearGradient id={`visor-grad-${instanceId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B1E2E" />
          <stop offset="35%" stopColor="#06121E" />
          <stop offset="85%" stopColor="#02080E" />
          <stop offset="100%" stopColor="#010408" />
        </linearGradient>

        <linearGradient id={`plate-grad-${instanceId}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F8FAFC" />
          <stop offset="45%" stopColor="#E2E8F0" />
          <stop offset="85%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#64748B" />
        </linearGradient>
      </defs>

      {/* 1. Full Visor Assembly (Only in clean-dynamic mode) */}
      {faceMode === 'clean-dynamic' && (
        <g id="jami-visor-assembly">
          {/* Base Visor Glass Covering Entire Screen */}
          <path
            d={geom.faceVisor.path}
            fill={`url(#visor-grad-${instanceId})`}
            stroke="#1E3A5F"
            strokeWidth={3}
          />

          {/* Curved Specular Glare Arc */}
          <path
            d={
              isHead
                ? 'M 400 460 Q 627 380 850 460'
                : 'M 300 320 Q 442 280 580 320'
            }
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={isHead ? 6 : 4}
            strokeLinecap="round"
            opacity="0.45"
          />

          {/* Clipped Dynamic Eyes & Mouth */}
          <g clipPath={`url(#${visorClipId})`}>
            {/* Left Eye */}
            <g transform={`translate(${geom.leftEye.x}, ${geom.leftEye.y})`}>
              {effectiveClose >= 0.95 ? (
                <line
                  x1={-geom.leftEye.width / 2}
                  y1={0}
                  x2={geom.leftEye.width / 2}
                  y2={0}
                  stroke={eyeColor}
                  strokeWidth={isHead ? 6 : 4}
                  strokeLinecap="round"
                  opacity="0.8"
                />
              ) : (
                <motion.rect
                  x={-geom.leftEye.width / 2}
                  y={-(geom.leftEye.height * (1 - effectiveClose)) / 2}
                  width={geom.leftEye.width}
                  height={geom.leftEye.height * (1 - effectiveClose)}
                  rx={Math.max(4, (geom.leftEye.height * (1 - effectiveClose)) / 2)}
                  fill={eyeColor}
                  opacity={isPoweredDown ? 0.2 : 0.95}
                  style={{
                    filter: isPoweredDown ? 'none' : `drop-shadow(0px 0px 8px ${glowColor})`,
                  }}
                />
              )}
            </g>

            {/* Right Eye */}
            <g transform={`translate(${geom.rightEye.x}, ${geom.rightEye.y})`}>
              {effectiveClose >= 0.95 ? (
                <line
                  x1={-geom.rightEye.width / 2}
                  y1={0}
                  x2={geom.rightEye.width / 2}
                  y2={0}
                  stroke={eyeColor}
                  strokeWidth={isHead ? 6 : 4}
                  strokeLinecap="round"
                  opacity="0.8"
                />
              ) : (
                <motion.rect
                  x={-geom.rightEye.width / 2}
                  y={-(geom.rightEye.height * (1 - effectiveClose)) / 2}
                  width={geom.rightEye.width}
                  height={geom.rightEye.height * (1 - effectiveClose)}
                  rx={Math.max(4, (geom.rightEye.height * (1 - effectiveClose)) / 2)}
                  fill={eyeColor}
                  opacity={isPoweredDown ? 0.2 : 0.95}
                  style={{
                    filter: isPoweredDown ? 'none' : `drop-shadow(0px 0px 8px ${glowColor})`,
                  }}
                />
              )}
            </g>

            {/* Mouth */}
            <g transform={`translate(${geom.mouth.x}, ${geom.mouth.y})`}>
              <motion.rect
                x={-(mouthDim.w * energyScale) / 2}
                y={-(mouthDim.h * energyScale) / 2}
                width={mouthDim.w * energyScale}
                height={mouthDim.h * energyScale}
                rx={mouthDim.rx}
                fill={eyeColor}
                opacity={isPoweredDown ? 0.15 : isSpeaking ? 0.95 : 0.75}
                animate={
                  reducedMotion
                    ? {}
                    : {
                        width: mouthDim.w * energyScale,
                        height: mouthDim.h * energyScale,
                        x: -(mouthDim.w * energyScale) / 2,
                        y: -(mouthDim.h * energyScale) / 2,
                      }
                }
                transition={{ duration: 0.065, ease: 'easeOut' }}
                style={{
                  filter: isPoweredDown ? 'none' : `drop-shadow(0px 0px 6px ${glowColor})`,
                }}
              />
            </g>
          </g>
        </g>
      )}

      {/* 2. Localized Mouth-Only Overlay */}
      {faceMode === 'mouth-only' && (
        <g id="jami-mouth-patch" transform={`translate(${geom.mouth.x}, ${geom.mouth.y})`}>
          {/* Subtle dark backing patch over raster mouth */}
          <rect
            x={-geom.mouth.width * 0.65}
            y={-geom.mouth.height * 0.75}
            width={geom.mouth.width * 1.3}
            height={geom.mouth.height * 1.5}
            rx={geom.mouth.height * 0.4}
            fill="#06121E"
            opacity="0.95"
          />
          {/* Animated LED mouth strip */}
          <motion.rect
            x={-(mouthDim.w * energyScale) / 2}
            y={-(mouthDim.h * energyScale) / 2}
            width={mouthDim.w * energyScale}
            height={mouthDim.h * energyScale}
            rx={mouthDim.rx}
            fill={eyeColor}
            opacity={isPoweredDown ? 0.15 : isSpeaking ? 0.95 : 0.75}
            style={{
              filter: isPoweredDown ? 'none' : `drop-shadow(0px 0px 6px ${glowColor})`,
            }}
          />
        </g>
      )}

      {/* 3. Debug Overlay (?jamiRobotDebug=1) */}
      {isDebug && (
        <g id="jami-debug-overlay">
          {/* Natural Frame Boundary */}
          <rect
            x={0}
            y={0}
            width={geom.naturalWidth}
            height={geom.naturalHeight}
            fill="none"
            stroke="#06B6D4"
            strokeWidth={2}
            strokeDasharray="8 8"
          />
          {/* Visor Bounds */}
          <path
            d={geom.faceVisor.path}
            fill="none"
            stroke="#EC4899"
            strokeWidth={3}
            strokeDasharray="6 6"
          />
          {/* Eye Markers */}
          <circle cx={geom.leftEye.x} cy={geom.leftEye.y} r={12} fill="none" stroke="#F59E0B" strokeWidth={2} />
          <circle cx={geom.rightEye.x} cy={geom.rightEye.y} r={12} fill="none" stroke="#F59E0B" strokeWidth={2} />
          {/* Mouth Marker */}
          <circle cx={geom.mouth.x} cy={geom.mouth.y} r={10} fill="none" stroke="#10B981" strokeWidth={2} />
          {/* Label */}
          <text
            x={20}
            y={50}
            fill="#38BDF8"
            fontSize={24}
            fontFamily="monospace"
            fontWeight="bold"
          >
            Mode: {faceMode} | ViewBox: {geom.naturalWidth}x{geom.naturalHeight}
          </text>
        </g>
      )}
    </svg>
  );
};
