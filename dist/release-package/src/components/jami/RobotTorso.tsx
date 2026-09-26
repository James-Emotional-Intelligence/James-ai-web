import React from 'react';
import { RobotVisualState } from './robot-types';

interface RobotTorsoProps {
  instanceId: string;
  state: RobotVisualState;
}

export const RobotTorso: React.FC<RobotTorsoProps> = ({
  instanceId,
  state,
}) => {
  const isError = state === 'error';
  const isWarning = state === 'presenting' || state === 'attentiveWarning';
  const isPoweredDown = state === 'poweredDown';

  const coreColor = isError ? '#F43F5E' : isWarning ? '#F59E0B' : '#22C55E';
  const coreGlow = isError
    ? 'rgba(244,63,94,0.7)'
    : isWarning
    ? 'rgba(245,158,11,0.7)'
    : 'rgba(34,197,94,0.8)';

  return (
    <g id="torso-at-waist">
      {/* 1. Abdomen Mechanical Spine & Hydraulic Side Cylinders (y: -40 to 0) */}
      {/* Left Hydraulic Cylinder */}
      <rect x="-34" y="-38" width="8" height="34" rx="4" fill="#0B120D" stroke="#151E19" strokeWidth="1" />
      <rect x="-32.5" y="-28" width="5" height="20" rx="2.5" fill="#53635A" />

      {/* Right Hydraulic Cylinder */}
      <rect x="26" y="-38" width="8" height="34" rx="4" fill="#0B120D" stroke="#151E19" strokeWidth="1" />
      <rect x="27.5" y="-28" width="5" height="20" rx="2.5" fill="#53635A" />

      {/* Central Segmented Vertebrae Column */}
      <rect x="-20" y="-38" width="40" height="36" rx="4" fill={`url(#gunmetal-${instanceId})`} stroke="#0B120D" strokeWidth="1.2" />
      <line x1="-16" y1="-26" x2="16" y2="-26" stroke="#4B5A52" strokeWidth="1.8" />
      <line x1="-16" y1="-14" x2="16" y2="-14" stroke="#4B5A52" strokeWidth="1.8" />

      {/* 2. Main Sculpted Chest Armor Shell (Top width: 132, Bottom width: 82, y: -148 to -40) */}
      {/* Back Depth Shadow Plate */}
      <path
        d="M -67 -144 L 67 -144 L 43 -36 L -43 -36 Z"
        fill="#0B120D"
        stroke="#151E19"
        strokeWidth="1.5"
      />

      {/* Left Angled Side-Wing Armor Plate (Lit Top-Left) */}
      <path
        d="M -66 -144 L -36 -144 L -20 -38 L -41 -38 Z"
        fill={`url(#metal-highlight-${instanceId})`}
        stroke="#88958F"
        strokeWidth="1.2"
      />

      {/* Right Angled Side-Wing Armor Plate (Shadowed) */}
      <path
        d="M 36 -144 L 66 -144 L 41 -38 L 20 -38 Z"
        fill={`url(#metal-silver-${instanceId})`}
        stroke="#88958F"
        strokeWidth="1.2"
      />

      {/* Central Breastplate Shell */}
      <path
        d="M -36 -144 L 36 -144 L 20 -38 L -20 -38 Z"
        fill={`url(#metal-silver-${instanceId})`}
        stroke="#88958F"
        strokeWidth="1.4"
      />

      {/* Chest Top Bevel Highlight Rim */}
      <path
        d="M -64 -142 L 64 -142"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Mechanical Chest Panel Seam Lines */}
      <path
        d="M -36 -144 L -18 -82 L 18 -82 L 36 -144"
        fill="none"
        stroke="#88958F"
        strokeWidth="1.1"
        opacity="0.8"
      />
      <line x1="-18" y1="-82" x2="-20" y2="-38" stroke="#88958F" strokeWidth="1.1" opacity="0.8" />
      <line x1="18" y1="-82" x2="20" y2="-38" stroke="#88958F" strokeWidth="1.1" opacity="0.8" />

      {/* 3. Center Sternum Recess & Glowing Jami Core Reactor (at y = -82) */}
      <circle cx="0" cy="-82" r="10" fill="#0B120D" stroke="#26342C" strokeWidth="1.4" />
      <circle cx="0" cy="-82" r="7.5" fill="#151E19" stroke="#15803D" strokeWidth="0.8" />

      {/* Core Glowing Emerald Pip */}
      <circle
        cx="0"
        cy="-82"
        r="5"
        fill={coreColor}
        opacity={isPoweredDown ? 0.3 : 0.95}
        style={{
          filter: isPoweredDown ? 'none' : `drop-shadow(0px 0px 4px ${coreGlow})`,
        }}
      />
      <circle cx="0" cy="-82" r="2.2" fill="#FFFFFF" opacity="0.95" />

      {/* 4. Collar & Neck Base Gimbal (at y = -148 to -164) */}
      <path
        d="M -18 -148 L 18 -148 L 14 -164 L -14 -164 Z"
        fill={`url(#gunmetal-${instanceId})`}
        stroke="#151E19"
        strokeWidth="1.2"
      />
      <ellipse cx="0" cy="-164" rx="14" ry="4" fill={`url(#metal-highlight-${instanceId})`} stroke="#88958F" strokeWidth="1" />
    </g>
  );
};
