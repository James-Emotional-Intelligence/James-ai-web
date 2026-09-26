import React, { useId, useState, useEffect, useRef } from 'react';
import { motion, MotionValue } from 'motion/react';
import { RobotVisualState, MouthShape, RobotDisplayMode, SpeakingGesture } from './robot-types';
import { RobotHeadAssembly } from './RobotHeadAssembly';
import { RobotTorso } from './RobotTorso';
import { RobotArm } from './RobotArm';
import { RobotLeg } from './RobotLeg';
import {
  rootVariants,
  torsoVariants,
  headPoseVariants,
} from './robot-motion-variants';

interface JamiRobotSvgProps {
  state: RobotVisualState;
  mouthShape: MouthShape;
  irisX: MotionValue<number>;
  irisY: MotionValue<number>;
  headTiltX: MotionValue<number>;
  headTiltY: MotionValue<number>;
  blinkProgress: number;
  isSpeaking: boolean;
  speechEnergy?: number;
  displayMode?: RobotDisplayMode;
  reducedMotion?: boolean;
  className?: string;
}

const SPEAKING_GESTURES: SpeakingGesture[] = [
  'openPalm',
  'explainLeft',
  'explainRight',
  'neutralTalk',
  'gentleNod',
];

export const JamiRobotSvg: React.FC<JamiRobotSvgProps> = ({
  state,
  mouthShape,
  irisX,
  irisY,
  headTiltX,
  headTiltY,
  blinkProgress,
  isSpeaking,
  speechEnergy = 0,
  displayMode = 'full',
  reducedMotion = false,
  className,
}) => {
  const rawId = useId();
  const instanceId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');

  // Natural gesture sequencing with varied timing and pauses
  const [currentGesture, setCurrentGesture] = useState<SpeakingGesture>('openPalm');
  const gestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isSpeaking || reducedMotion) {
      if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
      setCurrentGesture('openPalm');
      return;
    }

    let lastIdx = 0;
    const scheduleNextGesture = () => {
      const duration = 2200 + Math.random() * 1200; // 2.2s - 3.4s
      gestureTimerRef.current = setTimeout(() => {
        let nextIdx = Math.floor(Math.random() * SPEAKING_GESTURES.length);
        if (nextIdx === lastIdx) {
          nextIdx = (nextIdx + 1) % SPEAKING_GESTURES.length;
        }
        lastIdx = nextIdx;
        setCurrentGesture(SPEAKING_GESTURES[nextIdx]);
        scheduleNextGesture();
      }, duration);
    };

    scheduleNextGesture();

    return () => {
      if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    };
  }, [isSpeaking, reducedMotion]);

  // Head-only mode for avatars and compact widgets
  if (displayMode === 'head') {
    return (
      <svg
        viewBox="-46 -44 92 92"
        className={className || 'w-full h-full'}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`metal-highlight-${instanceId}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="45%" stopColor="#F1F5F3" />
            <stop offset="85%" stopColor="#C7D1CC" />
            <stop offset="100%" stopColor="#88958F" />
          </linearGradient>
          <linearGradient id={`metal-silver-${instanceId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="25%" stopColor="#E9EFEC" />
            <stop offset="75%" stopColor="#C7D1CC" />
            <stop offset="100%" stopColor="#88958F" />
          </linearGradient>
          <linearGradient id={`gunmetal-${instanceId}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#26342C" />
            <stop offset="60%" stopColor="#151E19" />
            <stop offset="100%" stopColor="#060A08" />
          </linearGradient>
          <radialGradient id={`lens-glass-${instanceId}`} cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="#0D1812" />
            <stop offset="65%" stopColor="#040806" />
            <stop offset="100%" stopColor="#010403" />
          </radialGradient>
        </defs>

        <RobotHeadAssembly
          instanceId={instanceId}
          state={state}
          mouthShape={mouthShape}
          irisX={irisX}
          irisY={irisY}
          blinkProgress={blinkProgress}
          isSpeaking={isSpeaking}
          speechEnergy={speechEnergy}
          reducedMotion={reducedMotion}
        />
      </svg>
    );
  }

  // Full-Body Robot (viewBox 0 0 360 640)
  return (
    <svg
      viewBox="0 0 360 640"
      className={className || 'w-full h-full'}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        {/* Metal High-Gloss Gradient */}
        <linearGradient id={`metal-highlight-${instanceId}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#F1F5F3" />
          <stop offset="85%" stopColor="#C7D1CC" />
          <stop offset="100%" stopColor="#88958F" />
        </linearGradient>

        {/* Silver Armor Shell Gradient */}
        <linearGradient id={`metal-silver-${instanceId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="25%" stopColor="#E9EFEC" />
          <stop offset="75%" stopColor="#C7D1CC" />
          <stop offset="100%" stopColor="#88958F" />
        </linearGradient>

        {/* Gunmetal Mechanical Joint Gradient */}
        <linearGradient id={`gunmetal-${instanceId}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#26342C" />
          <stop offset="60%" stopColor="#151E19" />
          <stop offset="100%" stopColor="#060A08" />
        </linearGradient>

        {/* Deep Black Glass Radial Gradient */}
        <radialGradient id={`lens-glass-${instanceId}`} cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#0D1812" />
          <stop offset="65%" stopColor="#040806" />
          <stop offset="100%" stopColor="#010403" />
        </radialGradient>
      </defs>

      {/* 1. Ground Dynamic Shadow */}
      <motion.ellipse
        cx="180"
        cy="616"
        rx="82"
        ry="11"
        fill="rgba(0, 0, 0, 0.48)"
        animate={
          reducedMotion
            ? {}
            : state === 'celebrating'
            ? { rx: [82, 60, 92, 70, 82], opacity: [0.48, 0.25, 0.5, 0.35, 0.48] }
            : { rx: [82, 77, 82], opacity: [0.48, 0.4, 0.48] }
        }
        transition={{ repeat: Infinity, duration: state === 'celebrating' ? 1.8 : 5.0, ease: 'easeInOut' }}
      />

      {/* 2. Main Robot Root Skeleton */}
      <motion.g
        id="robot-root-skeleton"
        variants={reducedMotion ? {} : rootVariants}
        animate={state}
      >
        {/* ==========================================
            PELVIS & LEGS SUBSYSTEM (Anchor at [180, 338])
            ========================================== */}
        <g id="pelvis-subsystem" transform="translate(180, 338)">
          {/* Left Leg at Hip Joint [-38, 12] (Global [142, 350]) */}
          <g transform="translate(-38, 12)">
            <RobotLeg side="left" instanceId={instanceId} state={state} reducedMotion={reducedMotion} />
          </g>

          {/* Right Leg at Hip Joint [38, 12] (Global [218, 350]) */}
          <g transform="translate(38, 12)">
            <RobotLeg side="right" instanceId={instanceId} state={state} reducedMotion={reducedMotion} />
          </g>

          {/* Pelvis Armor Shield Plate */}
          <path
            d="M -48 -14 L 48 -14 L 40 18 L 0 32 L -40 18 Z"
            fill={`url(#metal-highlight-${instanceId})`}
            stroke="#88958F"
            strokeWidth="1.5"
          />
          {/* Pelvis Center Inset Detail */}
          <path
            d="M -22 -14 L 22 -14 L 16 12 L 0 22 L -16 12 Z"
            fill={`url(#metal-silver-${instanceId})`}
            stroke="#88958F"
            strokeWidth="1.0"
          />
          <line x1="0" y1="-14" x2="0" y2="20" stroke="#FFFFFF" strokeWidth="1.2" opacity="0.8" />
        </g>

        {/* ==========================================
            TORSO, ARMS, NECK & HEAD SUBSYSTEM (Anchor at Waist [180, 318])
            ========================================== */}
        <g id="torso-subsystem" transform="translate(180, 318)">
          <motion.g
            id="torso-motion-group"
            variants={reducedMotion ? {} : torsoVariants}
            custom={currentGesture}
            animate={state}
          >
            {/* Torso & Chest Armor */}
            <RobotTorso instanceId={instanceId} state={state} />

            {/* Left Arm at Shoulder Joint [-74, -144] (Global [106, 174]) */}
            <g transform="translate(-74, -144)">
              <RobotArm
                side="left"
                instanceId={instanceId}
                state={state}
                currentGesture={currentGesture}
                reducedMotion={reducedMotion}
              />
            </g>

            {/* Right Arm at Shoulder Joint [74, -144] (Global [254, 174]) */}
            <g transform="translate(74, -144)">
              <RobotArm
                side="right"
                instanceId={instanceId}
                state={state}
                currentGesture={currentGesture}
                reducedMotion={reducedMotion}
              />
            </g>

            {/* Neck & Head Subsystem at [-230] (Global [180, 88]) */}
            <g transform="translate(0, -230)">
              {/* Head Pose Group (State Animation) */}
              <motion.g
                id="head-pose-group"
                variants={reducedMotion ? {} : headPoseVariants}
                custom={currentGesture}
                animate={state}
              >
                {/* Nested Head Gaze Group (Pointer Tracking Compose!) */}
                <motion.g
                  id="head-gaze-group"
                  style={{
                    x: reducedMotion ? 0 : headTiltX,
                    y: reducedMotion ? 0 : headTiltY,
                    rotate: reducedMotion ? 0 : headTiltX,
                  }}
                >
                  <RobotHeadAssembly
                    instanceId={instanceId}
                    state={state}
                    mouthShape={mouthShape}
                    irisX={irisX}
                    irisY={irisY}
                    blinkProgress={blinkProgress}
                    isSpeaking={isSpeaking}
                    speechEnergy={speechEnergy}
                    reducedMotion={reducedMotion}
                  />
                </motion.g>
              </motion.g>
            </g>
          </motion.g>
        </g>
      </motion.g>
    </svg>
  );
};
