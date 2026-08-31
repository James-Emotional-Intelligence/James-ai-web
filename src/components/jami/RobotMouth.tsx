import React from 'react';
import { motion } from 'motion/react';
import { MouthShape, RobotVisualState } from './robot-types';

interface RobotMouthProps {
  instanceId: string;
  shape: MouthShape;
  state: RobotVisualState;
  isSpeaking: boolean;
  speechEnergy?: number;
  reducedMotion?: boolean;
}

export const RobotMouth: React.FC<RobotMouthProps> = ({
  instanceId: _instanceId,
  shape,
  state,
  isSpeaking,
  speechEnergy = 0,
  reducedMotion = false,
}) => {
  const isError = state === 'error';
  const isPoweredDown = state === 'poweredDown';
  const isCelebrating = state === 'celebrating';
  const isEncouraging = state === 'encouraging';

  const ledColor = isError ? '#F43F5E' : isPoweredDown ? '#52525B' : '#86EFAC';
  const glowColor = isError
    ? 'rgba(244, 63, 94, 0.6)'
    : isPoweredDown
    ? 'transparent'
    : 'rgba(34, 197, 94, 0.75)';

  const effectiveShape: MouthShape = isSpeaking
    ? shape
    : isCelebrating || isEncouraging
    ? 'smile'
    : 'rest';

  const getShapeDimensions = (s: MouthShape) => {
    switch (s) {
      case 'closed':
        return { width: 16, height: 1.6, rx: 0.8 };
      case 'small':
        return { width: 14, height: 4.2, rx: 2.1 };
      case 'wide':
        return { width: 24, height: 7.2, rx: 3.6 };
      case 'narrow':
        return { width: 22, height: 3.2, rx: 1.6 };
      case 'round':
        return { width: 11, height: 8.5, rx: 4.5 };
      case 'smile':
        return { width: 20, height: 4.5, rx: 2.2 };
      case 'rest':
      default:
        return { width: 17, height: 2.2, rx: 1.1 };
    }
  };

  const dim = getShapeDimensions(effectiveShape);
  const energyScale = 1.0 + (isSpeaking ? speechEnergy * 0.25 : 0);

  return (
    <g id="camera-mouth-module">
      {/* Recessed Mouth Slot Bezel (Width 28, Height 8) */}
      <rect
        x="-14"
        y="-4"
        width="28"
        height="8"
        rx="4"
        fill="#0B120D"
        stroke="#26342C"
        strokeWidth="0.9"
      />

      {/* Internal LED Chamber */}
      <rect
        x="-12.5"
        y="-2.5"
        width="25"
        height="5"
        rx="2.5"
        fill="#010403"
      />

      {/* Active LED Mouth Shape */}
      <motion.rect
        x={-(dim.width * energyScale) / 2}
        y={-(dim.height * energyScale) / 2}
        width={dim.width * energyScale}
        height={dim.height * energyScale}
        rx={dim.rx}
        fill={ledColor}
        opacity={isPoweredDown ? 0.2 : 0.95}
        animate={
          reducedMotion
            ? {}
            : {
                width: dim.width * energyScale,
                height: dim.height * energyScale,
                x: -(dim.width * energyScale) / 2,
                y: -(dim.height * energyScale) / 2,
              }
        }
        transition={{ duration: 0.065, ease: 'easeOut' }}
        style={{
          filter: isPoweredDown ? 'none' : `drop-shadow(0px 0px 3px ${glowColor})`,
        }}
      />
    </g>
  );
};
