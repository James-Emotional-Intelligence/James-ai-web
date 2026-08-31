import React from 'react';
import { motion } from 'motion/react';
import { RobotVisualState } from './robot-types';
import { leftHipVariants, rightHipVariants } from './robot-motion-variants';

interface RobotLegProps {
  side: 'left' | 'right';
  instanceId: string;
  state: RobotVisualState;
  reducedMotion?: boolean;
}

export const RobotLeg: React.FC<RobotLegProps> = ({
  side,
  instanceId,
  state,
  reducedMotion = false,
}) => {
  const isLeft = side === 'left';
  const hipVariants = isLeft ? leftHipVariants : rightHipVariants;
  const dir = isLeft ? -1 : 1;

  return (
    <motion.g
      id={`${side}-leg-at-hip`}
      variants={reducedMotion ? {} : hipVariants}
      animate={state}
    >
      {/* 1. Hip Gimbal Joint (Radius 14.5) */}
      <circle cx="0" cy="0" r="14.5" fill={`url(#gunmetal-${instanceId})`} stroke="#0B120D" strokeWidth="1.4" />
      <circle cx="0" cy="0" r="8" fill="#26342C" stroke="#4B5A52" strokeWidth="1" />

      {/* 2. Sculpted Thigh Armor Shell (Width 36, Length 106) */}
      {/* Back Depth Plate */}
      <path
        d={
          isLeft
            ? 'M -18 8 L 16 8 L 10 106 L -16 106 Z'
            : 'M -16 8 L 18 8 L 16 106 L -10 106 Z'
        }
        fill="#0B120D"
        stroke="#151E19"
        strokeWidth="1.2"
      />

      {/* Outer Armor Plate */}
      <path
        d={
          isLeft
            ? 'M -16 8 L 14 8 L 8 106 L -14 106 Z'
            : 'M -14 8 L 16 8 L 14 106 L -8 106 Z'
        }
        fill={`url(#metal-silver-${instanceId})`}
        stroke="#88958F"
        strokeWidth="1.4"
      />

      {/* Front Thigh Ridge Highlight */}
      <path
        d={
          isLeft
            ? 'M -14 10 L 2 10 L -2 104 L -12 104 Z'
            : 'M -2 10 L 14 10 L 12 104 L 2 104 Z'
        }
        fill={`url(#metal-highlight-${instanceId})`}
        opacity="0.9"
      />
      <line
        x1={dir * -6}
        y1="14"
        x2={dir * -6}
        y2="100"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.75"
      />

      {/* 3. Knee Subsystem at (0, 106) */}
      <g transform="translate(0, 106)">
        {/* Knee Gimbal Disc (Radius 14) */}
        <circle cx="0" cy="0" r="14" fill={`url(#gunmetal-${instanceId})`} stroke="#0B120D" strokeWidth="1.5" />
        <circle cx="0" cy="0" r="8" fill={`url(#metal-highlight-${instanceId})`} stroke="#88958F" strokeWidth="1.2" />
        <circle cx="0" cy="0" r="3.5" fill="#151E19" />

        {/* 4. Shin & Calf Gauntlet Armor Shell (Width 34, Length 110) */}
        <g transform="translate(0, 8)">
          {/* Calf Shadow Plate */}
          <path
            d={
              isLeft
                ? 'M -16 0 L 16 0 L 12 102 L -12 102 Z'
                : 'M -16 0 L 16 0 L 12 102 L -12 102 Z'
            }
            fill="#0B120D"
            stroke="#151E19"
            strokeWidth="1.2"
          />

          {/* Shin Armor Shell */}
          <path
            d={
              isLeft
                ? 'M -14 0 L 14 0 L 10 102 L -10 102 Z'
                : 'M -14 0 L 14 0 L 10 102 L -10 102 Z'
            }
            fill={`url(#metal-highlight-${instanceId})`}
            stroke="#88958F"
            strokeWidth="1.4"
          />

          {/* Shin Center Bevel Facet */}
          <line
            x1="0"
            y1="4"
            x2="0"
            y2="98"
            stroke="#FFFFFF"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.8"
          />
          <line
            x1={dir * 6}
            y1="8"
            x2={dir * 4}
            y2="94"
            stroke="#88958F"
            strokeWidth="1.0"
            opacity="0.7"
          />

          {/* 5. Ankle & Foot Platform at (0, 102) */}
          <g transform="translate(0, 102)">
            {/* Ankle Connector Gimbal */}
            <circle cx="0" cy="0" r="8.5" fill={`url(#gunmetal-${instanceId})`} stroke="#0B120D" strokeWidth="1.2" />

            {/* Grounded Angular Mechanical Foot (Length 46, Height 18) */}
            <g id={`${side}-foot-platform`}>
              <path
                d={
                  isLeft
                    ? 'M -10 2 L 14 2 L 18 18 L -28 18 Q -16 8 -10 2 Z'
                    : 'M -14 2 L 10 2 L 28 18 L -18 18 Q -14 8 -14 2 Z'
                }
                fill={`url(#metal-silver-${instanceId})`}
                stroke="#88958F"
                strokeWidth="1.3"
              />
              {/* Sole Rubber Grip Pad */}
              <rect
                x={isLeft ? -26 : -16}
                y="16"
                width="42"
                height="5"
                rx="2"
                fill="#0B120D"
              />
            </g>
          </g>
        </g>
      </g>
    </motion.g>
  );
};
