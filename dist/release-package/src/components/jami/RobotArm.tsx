import React from 'react';
import { motion } from 'motion/react';
import { RobotVisualState, SpeakingGesture } from './robot-types';
import {
  leftShoulderVariants,
  leftElbowVariants,
  rightShoulderVariants,
  rightElbowVariants,
} from './robot-motion-variants';

interface RobotArmProps {
  side: 'left' | 'right';
  instanceId: string;
  state: RobotVisualState;
  currentGesture?: SpeakingGesture;
  reducedMotion?: boolean;
}

export const RobotArm: React.FC<RobotArmProps> = ({
  side,
  instanceId,
  state,
  currentGesture,
  reducedMotion = false,
}) => {
  const isLeft = side === 'left';
  const shoulderVariants = isLeft ? leftShoulderVariants : rightShoulderVariants;
  const elbowVariants = isLeft ? leftElbowVariants : rightElbowVariants;

  // Sign multiplier for horizontal mirroring
  const dir = isLeft ? -1 : 1;

  return (
    <motion.g
      id={`${side}-arm-at-shoulder`}
      variants={reducedMotion ? {} : shoulderVariants}
      custom={currentGesture}
      animate={state}
    >
      {/* 1. Shoulder Ball Gimbal (Radius 16) */}
      <circle cx="0" cy="0" r="16" fill={`url(#gunmetal-${instanceId})`} stroke="#0B120D" strokeWidth="1.4" />
      <circle cx="0" cy="0" r="9" fill="#26342C" stroke="#4B5A52" strokeWidth="1" />

      {/* 2. Sculpted Shoulder Outer Cap */}
      <path
        d={`M ${dir * -8} -14 Q ${dir * 18} -12 ${dir * 16} 12 L ${dir * -4} 14 Z`}
        fill={`url(#metal-highlight-${instanceId})`}
        stroke="#88958F"
        strokeWidth="1.2"
      />
      <path
        d={`M ${dir * -6} -12 Q ${dir * 16} -10 ${dir * 14} 10`}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.0"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* 3. Upper Arm Shell (Width 28, Length 78) */}
      {/* Inner Dark Hydraulic Piston Rod */}
      <rect
        x={isLeft ? -18 : 6}
        y="12"
        width="12"
        height="64"
        rx="5"
        fill="#0B120D"
        stroke="#151E19"
        strokeWidth="1"
      />
      <rect
        x={isLeft ? -16 : 8}
        y="24"
        width="8"
        height="40"
        rx="4"
        fill="#53635A"
      />

      {/* Outer White Armor Plate */}
      <path
        d={
          isLeft
            ? 'M -14 12 L 10 12 L 0 76 L -20 76 Z'
            : 'M -10 12 L 14 12 L 20 76 L 0 76 Z'
        }
        fill={`url(#metal-silver-${instanceId})`}
        stroke="#88958F"
        strokeWidth="1.3"
      />
      {/* Armor Side Bevel Line */}
      <line
        x1={isLeft ? -6 : 6}
        y1="18"
        x2={isLeft ? -12 : 12}
        y2="70"
        stroke="#88958F"
        strokeWidth="1.0"
        opacity="0.75"
      />

      {/* 4. Forearm Subsystem at Elbow (Pivots at [-24, 78] left / [24, 78] right) */}
      <g transform={`translate(${dir * 10}, 76)`}>
        <motion.g
          id={`${side}-forearm-at-elbow`}
          variants={reducedMotion ? {} : elbowVariants}
          custom={currentGesture}
          animate={state}
        >
          {/* Elbow Gimbal Disc (Radius 13) */}
          <circle cx="0" cy="0" r="13" fill={`url(#gunmetal-${instanceId})`} stroke="#0B120D" strokeWidth="1.4" />
          <circle cx="0" cy="0" r="7.5" fill={`url(#metal-highlight-${instanceId})`} stroke="#88958F" strokeWidth="1" />

          {/* Forearm Gauntlet Armor Shell (Width 32, Length 82) */}
          <path
            d={
              isLeft
                ? 'M -14 6 L 14 6 L 8 82 L -10 82 Z'
                : 'M -14 6 L 14 6 L 10 82 L -8 82 Z'
            }
            fill={`url(#metal-highlight-${instanceId})`}
            stroke="#88958F"
            strokeWidth="1.4"
          />

          {/* Forearm Bevel Highlight Facet */}
          <path
            d={
              isLeft
                ? 'M -12 8 L 0 8 L -4 80 L -8 80 Z'
                : 'M 0 8 L 12 8 L 8 80 L 4 80 Z'
            }
            fill={`url(#metal-silver-${instanceId})`}
            opacity="0.9"
          />
          <line
            x1="0"
            y1="10"
            x2="0"
            y2="78"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.75"
          />

          {/* Wrist Joint at (0, 84) */}
          <g transform="translate(0, 84)">
            <circle cx="0" cy="0" r="9" fill={`url(#gunmetal-${instanceId})`} stroke="#0B120D" strokeWidth="1.2" />

            {/* Sculpted Mechanical Hand (Palm + 3 Segmented Fingers) */}
            <g id={`${side}-hand-fingers`}>
              {/* Palm Plate */}
              <path
                d="M -9 4 L 9 4 L 7 24 L -7 24 Z"
                fill={`url(#metal-silver-${instanceId})`}
                stroke="#88958F"
                strokeWidth="1.1"
              />

              {/* Thumb */}
              <path
                d={
                  isLeft
                    ? 'M 8 6 Q 16 10 14 20 L 7 16 Z'
                    : 'M -8 6 Q -16 10 -14 20 L -7 16 Z'
                }
                fill="#26342C"
                stroke="#0B120D"
                strokeWidth="0.8"
              />

              {/* Finger Tips */}
              <rect x="-7" y="24" width="4" height="8" rx="2" fill="#151E19" stroke="#0B120D" strokeWidth="0.8" />
              <rect x="-2" y="24" width="4" height="9.5" rx="2" fill="#151E19" stroke="#0B120D" strokeWidth="0.8" />
              <rect x="3" y="24" width="4" height="8" rx="2" fill="#151E19" stroke="#0B120D" strokeWidth="0.8" />
            </g>
          </g>
        </motion.g>
      </g>
    </motion.g>
  );
};
