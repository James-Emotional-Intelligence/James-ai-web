import React from 'react';
import { motion, MotionValue } from 'motion/react';
import { RobotVisualState } from './robot-types';

interface RobotEyeProps {
  instanceId: string;
  state: RobotVisualState;
  irisX: MotionValue<number>;
  irisY: MotionValue<number>;
  blinkProgress: number; // 0 to 1
  reducedMotion?: boolean;
}

export const RobotEye: React.FC<RobotEyeProps> = ({
  instanceId,
  state,
  irisX,
  irisY,
  blinkProgress,
  reducedMotion = false,
}) => {
  // LED Ring & Core Colors based on state
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
    ? 'rgba(21, 128, 61, 0.3)'
    : 'rgba(34, 197, 94, 0.65)';

  const lensClipId = `eye-lens-clip-${instanceId}`;

  // Sleeping closes shutters completely
  const effectiveShutterClose = isSleeping ? 1 : blinkProgress;

  return (
    <g id="camera-eye-module">
      {/* Clip path specifically for the dark inner lens glass */}
      <defs>
        <clipPath id={lensClipId}>
          <circle cx="160" cy="95" r="28" />
        </clipPath>
      </defs>

      {/* 1. Outer Metallic Bezel Ring 1 (Silver White) */}
      <circle
        cx="160"
        cy="95"
        r="42"
        fill={`url(#metal-highlight-${instanceId})`}
        stroke="#8D9993"
        strokeWidth="1.2"
      />

      {/* 2. Outer Concentric Gunmetal Ring 2 */}
      <circle
        cx="160"
        cy="95"
        r="38.5"
        fill="#111A15"
        stroke="#26322C"
        strokeWidth="1"
      />

      {/* 3. Camera Lens Precision Metallic Stepped Ring */}
      <circle
        cx="160"
        cy="95"
        r="34"
        fill={`url(#metal-silver-${instanceId})`}
        stroke="#8D9993"
        strokeWidth="0.8"
      />

      {/* 4. Glowing Circular LED Aura Ring */}
      <circle
        cx="160"
        cy="95"
        r="30.5"
        fill="none"
        stroke={ledColor}
        strokeWidth="2.2"
        strokeDasharray={isThinking ? '6 3' : 'none'}
        opacity={isPoweredDown ? 0.3 : 0.95}
        style={{
          filter: isPoweredDown ? 'none' : `drop-shadow(0px 0px 4px ${ledGlowColor})`,
        }}
      />

      {/* 5. Thinking / Working Rotating Internal Aperture Dial */}
      {(isThinking || isWorking) && !reducedMotion && (
        <motion.g
          animate={{ rotate: isThinking ? 360 : -360 }}
          transition={{ repeat: Infinity, duration: isThinking ? 4 : 3, ease: 'linear' }}
          style={{ originX: '160px', originY: '95px' }}
        >
          <circle
            cx="160"
            cy="95"
            r="29.5"
            fill="none"
            stroke="#86EFAC"
            strokeWidth="0.8"
            strokeDasharray="4 8"
            opacity="0.8"
          />
        </motion.g>
      )}

      {/* 6. Dark Lens Chamber (Deep Black Glass) */}
      <circle
        cx="160"
        cy="95"
        r="28"
        fill={`url(#lens-glass-${instanceId})`}
        stroke="#111A15"
        strokeWidth="1.5"
      />

      {/* 7. Inside Lens (Clipped for mechanical shutters & iris movement) */}
      <g clipPath={`url(#${lensClipId})`}>
        {/* Subtle camera lens interior concentric reflections */}
        <circle cx="160" cy="95" r="22" fill="none" stroke="#22C55E" strokeWidth="0.5" opacity="0.2" />
        <circle cx="160" cy="95" r="16" fill="none" stroke="#86EFAC" strokeWidth="0.5" opacity="0.25" />

        {/* Dynamic Iris + Pupil + Gloss (Tracks pointer via motion values) */}
        <motion.g style={{ x: irisX, y: irisY }}>
          {/* Glowing Iris Disc */}
          <circle
            cx="160"
            cy="95"
            r={isAcknowledge ? 10.5 : isListening ? 9.5 : 8.5}
            fill={ledColor}
            opacity={isPoweredDown ? 0.2 : 0.85}
            style={{ filter: `drop-shadow(0px 0px 3px ${ledGlowColor})` }}
          />

          {/* Central Deep Pupil */}
          <circle
            cx="160"
            cy="95"
            r={isAcknowledge ? 5.5 : isListening ? 4.8 : 4.0}
            fill="#020605"
          />

          {/* Core Pupil Light Pip */}
          <circle
            cx="160"
            cy="95"
            r="1.6"
            fill={isPoweredDown ? '#71717A' : '#FFFFFF'}
            opacity="0.95"
          />

          {/* Specular Glare / Curved Glass Reflection */}
          <path
            d="M 154 88 Q 160 85 166 88 A 12 12 0 0 0 154 88 Z"
            fill="#FFFFFF"
            opacity="0.7"
          />
          <circle cx="165" cy="101" r="1.2" fill="#FFFFFF" opacity="0.5" />
        </motion.g>

        {/* 8. Dual Mechanical Eyelid Shutters (Top & Bottom) */}
        {/* Upper Mechanical Shutter (Slides Down) */}
        <motion.path
          d="M 125 60 L 195 60 L 195 95 Q 160 102 125 95 Z"
          fill="#111A15"
          stroke="#26322C"
          strokeWidth="1.2"
          initial={{ y: -38 }}
          animate={{ y: -38 + effectiveShutterClose * 38 }}
          transition={{ duration: 0.1, ease: 'easeInOut' }}
        />
        {/* Upper Shutter Armor Edge Lip */}
        <motion.path
          d="M 128 95 Q 160 102 192 95"
          fill="none"
          stroke="#8D9993"
          strokeWidth="1.5"
          initial={{ y: -38 }}
          animate={{ y: -38 + effectiveShutterClose * 38 }}
          transition={{ duration: 0.1, ease: 'easeInOut' }}
        />

        {/* Lower Mechanical Shutter (Slides Up) */}
        <motion.path
          d="M 125 130 L 195 130 L 195 95 Q 160 88 125 95 Z"
          fill="#111A15"
          stroke="#26322C"
          strokeWidth="1.2"
          initial={{ y: 38 }}
          animate={{ y: 38 - effectiveShutterClose * 38 }}
          transition={{ duration: 0.1, ease: 'easeInOut' }}
        />
        {/* Lower Shutter Armor Edge Lip */}
        <motion.path
          d="M 128 95 Q 160 88 192 95"
          fill="none"
          stroke="#8D9993"
          strokeWidth="1.5"
          initial={{ y: 38 }}
          animate={{ y: 38 - effectiveShutterClose * 38 }}
          transition={{ duration: 0.1, ease: 'easeInOut' }}
        />
      </g>

      {/* 9. Top Glass Specular Arc Glint */}
      <path
        d="M 140 70 A 24 24 0 0 1 180 70"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.6"
      />
    </g>
  );
};
