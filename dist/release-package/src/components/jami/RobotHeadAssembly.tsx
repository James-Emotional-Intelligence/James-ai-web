import React from 'react';
import { motion, MotionValue } from 'motion/react';
import { RobotVisualState, MouthShape } from './robot-types';
import { RobotMouth } from './RobotMouth';

interface RobotHeadAssemblyProps {
  instanceId: string;
  state: RobotVisualState;
  mouthShape: MouthShape;
  irisX: MotionValue<number>;
  irisY: MotionValue<number>;
  blinkProgress: number;
  isSpeaking: boolean;
  speechEnergy?: number;
  reducedMotion?: boolean;
}

export const RobotHeadAssembly: React.FC<RobotHeadAssemblyProps> = ({
  instanceId,
  state,
  mouthShape,
  irisX,
  irisY,
  blinkProgress,
  isSpeaking,
  speechEnergy = 0,
  reducedMotion = false,
}) => {
  const isError = state === 'error';
  const isWarning = state === 'presenting' || state === 'attentiveWarning';
  const isSleeping = state === 'sleeping';
  const isPoweredDown = state === 'poweredDown';
  const isThinking = state === 'thinking';
  const isWorking = state === 'working';
  const isListening = state === 'listening';
  const isAcknowledge = state === 'acknowledge';

  const ledColor = isError
    ? '#F43F5E'
    : isWarning
    ? '#F59E0B'
    : isPoweredDown
    ? '#52525B'
    : isSleeping
    ? '#15803D'
    : '#22C55E';

  const ledGlowColor = isError
    ? 'rgba(244, 63, 94, 0.6)'
    : isWarning
    ? 'rgba(245, 158, 11, 0.6)'
    : isPoweredDown
    ? 'rgba(82, 82, 91, 0.2)'
    : isSleeping
    ? 'rgba(21, 128, 61, 0.25)'
    : 'rgba(34, 197, 94, 0.65)';

  const lensClipId = `head-lens-clip-${instanceId}`;
  const effectiveShutterClose = isSleeping || isPoweredDown ? 1 : blinkProgress;

  return (
    <g id="camera-eye-module">
      <defs>
        <clipPath id={lensClipId}>
          <circle cx="0" cy="0" r="23" />
        </clipPath>
      </defs>

      {/* 1. Back Gunmetal Housing Offset (Creates 3D side depth) */}
      <circle cx="2" cy="3" r="37.5" fill="#0B120D" stroke="#050806" strokeWidth="1" />

      {/* 2. Main Silver Camera Pod Outer Casing (Radius 37) */}
      <circle
        cx="0"
        cy="0"
        r="37"
        fill={`url(#metal-silver-${instanceId})`}
        stroke="#88958F"
        strokeWidth="1.4"
      />

      {/* 3. Top-Left Specular Highlight Arc on Outer Pod */}
      <path
        d="M -26 -24 A 36 36 0 0 1 26 -24"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* 4. Recessed Dark Gunmetal Step Bezel (Radius 31) */}
      <circle cx="0" cy="0" r="31" fill="#151E19" stroke="#26342C" strokeWidth="1.2" />

      {/* 5. Inner Chamfered Silver Lens Collar (Radius 27.5) */}
      <circle
        cx="0"
        cy="0"
        r="27.5"
        fill={`url(#metal-highlight-${instanceId})`}
        stroke="#88958F"
        strokeWidth="1"
      />

      {/* 6. Precision Emerald LED Ring (Radius 25) */}
      <circle
        cx="0"
        cy="0"
        r="25"
        fill="none"
        stroke={ledColor}
        strokeWidth="2.0"
        strokeDasharray={isThinking ? '5 3' : 'none'}
        opacity={isPoweredDown ? 0.3 : 0.95}
        style={{
          filter: isPoweredDown ? 'none' : `drop-shadow(0px 0px 4px ${ledGlowColor})`,
        }}
      />

      {/* 7. Rotating Internal Aperture Disc (in Thinking / Working) */}
      {(isThinking || isWorking) && !reducedMotion && (
        <motion.g
          animate={{ rotate: isThinking ? 360 : -360 }}
          transition={{ repeat: Infinity, duration: isThinking ? 4 : 3, ease: 'linear' }}
        >
          <circle
            cx="0"
            cy="0"
            r="24"
            fill="none"
            stroke="#86EFAC"
            strokeWidth="0.8"
            strokeDasharray="3 6"
            opacity="0.85"
          />
        </motion.g>
      )}

      {/* 8. Dark Glass Lens Chamber (Deep Black Glass Radius 23) */}
      <circle cx="0" cy="0" r="23" fill={`url(#lens-glass-${instanceId})`} stroke="#0B120D" strokeWidth="1.2" />

      {/* 9. Clipped Interior: Iris, Specular Highlights, Shutters */}
      <g clipPath={`url(#${lensClipId})`}>
        {/* Subtle camera lens interior concentric reflections */}
        <circle cx="0" cy="0" r="18" fill="none" stroke="#22C55E" strokeWidth="0.4" opacity="0.25" />
        <circle cx="0" cy="0" r="13" fill="none" stroke="#86EFAC" strokeWidth="0.4" opacity="0.3" />

        {/* Dynamic Iris & Pupil that tracks Pointer Gaze */}
        <motion.g style={{ x: irisX, y: irisY }}>
          {/* Glowing Iris Disc */}
          <circle
            cx="0"
            cy="0"
            r={isAcknowledge ? 9.5 : isListening ? 8.5 : 7.5}
            fill={ledColor}
            opacity={isPoweredDown ? 0.2 : 0.88}
            style={{ filter: `drop-shadow(0px 0px 3px ${ledGlowColor})` }}
          />

          {/* Deep Dark Center Pupil */}
          <circle cx="0" cy="0" r={isAcknowledge ? 4.8 : isListening ? 4.2 : 3.6} fill="#010403" />

          {/* Core White Light Pip */}
          <circle cx="0" cy="0" r="1.4" fill={isPoweredDown ? '#71717A' : '#FFFFFF'} opacity="0.95" />

          {/* Glass Specular Glare Arc */}
          <path d="M -5 -6 Q 0 -8 5 -6 A 9 9 0 0 0 -5 -6 Z" fill="#FFFFFF" opacity="0.75" />
          <circle cx="4" cy="5" r="1.0" fill="#FFFFFF" opacity="0.5" />
        </motion.g>

        {/* Dual Mechanical Shutters (Top & Bottom) */}
        {/* Upper Shutter */}
        <motion.path
          d="M -30 -30 L 30 -30 L 30 0 Q 0 6 -30 0 Z"
          fill="#151E19"
          stroke="#26342C"
          strokeWidth="1"
          initial={{ y: -32 }}
          animate={{ y: -32 + effectiveShutterClose * 32 }}
          transition={{ duration: 0.1, ease: 'easeInOut' }}
        />
        <motion.path
          d="M -26 0 Q 0 6 26 0"
          fill="none"
          stroke="#88958F"
          strokeWidth="1.2"
          initial={{ y: -32 }}
          animate={{ y: -32 + effectiveShutterClose * 32 }}
          transition={{ duration: 0.1, ease: 'easeInOut' }}
        />

        {/* Lower Shutter */}
        <motion.path
          d="M -30 30 L 30 30 L 30 0 Q 0 -6 -30 0 Z"
          fill="#151E19"
          stroke="#26342C"
          strokeWidth="1"
          initial={{ y: 32 }}
          animate={{ y: 32 - effectiveShutterClose * 32 }}
          transition={{ duration: 0.1, ease: 'easeInOut' }}
        />
        <motion.path
          d="M -26 0 Q 0 -6 26 0"
          fill="none"
          stroke="#88958F"
          strokeWidth="1.2"
          initial={{ y: 32 }}
          animate={{ y: 32 - effectiveShutterClose * 32 }}
          transition={{ duration: 0.1, ease: 'easeInOut' }}
        />
      </g>

      {/* 10. Specular Curved Lens Glint */}
      <path
        d="M -16 -18 A 20 20 0 0 1 16 -18"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.65"
      />

      {/* 11. Sculpted Lower Chin Pod with Mechanical LED Mouth */}
      <g id="chin-pod" transform="translate(0, 31)">
        {/* Chin Support Bracket */}
        <path
          d="M -18 -4 L 18 -4 L 14 7 L -14 7 Z"
          fill={`url(#metal-silver-${instanceId})`}
          stroke="#88958F"
          strokeWidth="1"
        />
        {/* LED Mouth Component */}
        <RobotMouth
          instanceId={instanceId}
          shape={mouthShape}
          state={state}
          isSpeaking={isSpeaking}
          speechEnergy={speechEnergy}
          reducedMotion={reducedMotion}
        />
      </g>
    </g>
  );
};
