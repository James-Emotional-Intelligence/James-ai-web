import { Variants, Transition } from 'motion/react';
import { SpeakingGesture } from './robot-types';

export const bodySpring: Transition = {
  type: 'spring',
  stiffness: 115,
  damping: 17,
  mass: 1.1,
};

export const limbSpring: Transition = {
  type: 'spring',
  stiffness: 130,
  damping: 15,
  mass: 0.8,
};

export const snappySpring: Transition = {
  type: 'spring',
  stiffness: 170,
  damping: 14,
  mass: 0.6,
};

export const gentleSpring: Transition = {
  type: 'spring',
  stiffness: 75,
  damping: 19,
  mass: 1.2,
};

// Root float & breathing
export const rootVariants: Variants = {
  idle: {
    y: [0, -2.5, 0],
    transition: { repeat: Infinity, duration: 5.0, ease: 'easeInOut' },
  },
  attentiveIdle: {
    y: [0, -1.8, 0],
    transition: { repeat: Infinity, duration: 4.2, ease: 'easeInOut' },
  },
  attentiveWarning: {
    y: 0,
    transition: bodySpring,
  },
  acknowledge: {
    y: [0, -6, 0],
    transition: snappySpring,
  },
  listening: {
    y: -2,
    transition: bodySpring,
  },
  thinking: {
    y: [0, -2, 0],
    transition: { repeat: Infinity, duration: 4.5, ease: 'easeInOut' },
  },
  speaking: {
    y: [0, -2, 0],
    transition: { repeat: Infinity, duration: 3.6, ease: 'easeInOut' },
  },
  presenting: {
    y: 0,
    transition: bodySpring,
  },
  working: {
    y: [0, -1.2, 0],
    transition: { repeat: Infinity, duration: 2.8, ease: 'easeInOut' },
  },
  celebrating: {
    // Finite joyful celebratory motion that settles
    y: [0, 4, -14, -4, -8, 0],
    transition: { duration: 1.8, ease: [0.22, 1, 0.36, 1] },
  },
  encouraging: {
    y: [0, -2, 0],
    transition: { repeat: Infinity, duration: 4.0, ease: 'easeInOut' },
  },
  guiding: {
    y: -1,
    transition: bodySpring,
  },
  focused: {
    y: 0,
    transition: gentleSpring,
  },
  sleeping: {
    y: 3,
    transition: gentleSpring,
  },
  suspended: {
    y: 2,
    transition: gentleSpring,
  },
  poweredDown: {
    y: 4,
    transition: gentleSpring,
  },
  error: {
    y: 0,
    transition: bodySpring,
  },
};

// Torso / Waist articulation (Pivots at local waist (0,0))
export const torsoVariants: Variants = {
  idle: {
    rotate: [0, -0.8, 0.8, 0],
    transition: { repeat: Infinity, duration: 6.0, ease: 'easeInOut' },
  },
  attentiveIdle: {
    rotate: 0,
    transition: bodySpring,
  },
  attentiveWarning: {
    rotate: -1,
    transition: bodySpring,
  },
  acknowledge: {
    rotate: -1.5,
    transition: snappySpring,
  },
  listening: {
    rotate: -3.0,
    transition: bodySpring,
  },
  thinking: {
    rotate: 2.5,
    transition: bodySpring,
  },
  speaking: (gesture?: SpeakingGesture) => {
    switch (gesture) {
      case 'explainLeft':
        return { rotate: 3.0, transition: bodySpring };
      case 'explainRight':
        return { rotate: -3.0, transition: bodySpring };
      default:
        return { rotate: [0, -1, 1, 0], transition: { repeat: Infinity, duration: 4.0, ease: 'easeInOut' } };
    }
  },
  presenting: {
    rotate: 0,
    transition: bodySpring,
  },
  working: {
    rotate: 1.5,
    transition: bodySpring,
  },
  celebrating: {
    rotate: [0, -3, 3, -1, 0],
    transition: { duration: 1.8, ease: 'easeInOut' },
  },
  encouraging: {
    rotate: -2.0,
    transition: bodySpring,
  },
  guiding: {
    rotate: 2.0,
    transition: bodySpring,
  },
  focused: {
    rotate: 1.0,
    transition: gentleSpring,
  },
  sleeping: {
    rotate: 4.0,
    transition: gentleSpring,
  },
  suspended: {
    rotate: 2.0,
    transition: gentleSpring,
  },
  poweredDown: {
    rotate: 5.0,
    transition: gentleSpring,
  },
  error: {
    rotate: 0,
    transition: bodySpring,
  },
};

// Head Pose (Base posture per state; Gaze adds on top)
export const headPoseVariants: Variants = {
  idle: {
    rotate: [0, 1.2, -1.0, 0],
    transition: { repeat: Infinity, duration: 5.5, ease: 'easeInOut' },
  },
  attentiveIdle: {
    rotate: -1.0,
    transition: limbSpring,
  },
  attentiveWarning: {
    rotate: -3.0,
    transition: limbSpring,
  },
  acknowledge: {
    rotate: [0, -5, 3, 0],
    transition: snappySpring,
  },
  listening: {
    rotate: 6.0,
    transition: limbSpring,
  },
  thinking: {
    rotate: -8.0,
    transition: limbSpring,
  },
  speaking: (gesture?: SpeakingGesture) => {
    switch (gesture) {
      case 'explainLeft':
        return { rotate: -4.0, transition: limbSpring };
      case 'explainRight':
        return { rotate: 4.0, transition: limbSpring };
      case 'gentleNod':
        return { rotate: [0, 3.5, 0], transition: { repeat: Infinity, duration: 1.8, ease: 'easeInOut' } };
      default:
        return { rotate: [0, 1.5, -1.5, 0], transition: { repeat: Infinity, duration: 3.2, ease: 'easeInOut' } };
    }
  },
  presenting: {
    rotate: 0,
    transition: limbSpring,
  },
  working: {
    rotate: 2.5,
    transition: limbSpring,
  },
  celebrating: {
    rotate: [0, -5, 5, -2, 0],
    transition: { duration: 1.8, ease: 'easeInOut' },
  },
  encouraging: {
    rotate: 3.5,
    transition: limbSpring,
  },
  guiding: {
    rotate: -3.0,
    transition: limbSpring,
  },
  focused: {
    rotate: 2.0,
    transition: gentleSpring,
  },
  sleeping: {
    rotate: 10.0,
    transition: gentleSpring,
  },
  suspended: {
    rotate: 6.0,
    transition: gentleSpring,
  },
  poweredDown: {
    rotate: 12.0,
    transition: gentleSpring,
  },
  error: {
    rotate: [0, -10, 10, -7, 7, 0],
    transition: { duration: 0.65, ease: 'easeInOut' },
  },
};

// Left Shoulder Joint (Pivots at local (0,0))
export const leftShoulderVariants: Variants = {
  idle: {
    rotate: [0, 2.5, 0],
    transition: { repeat: Infinity, duration: 5.2, ease: 'easeInOut' },
  },
  attentiveIdle: {
    rotate: 2,
    transition: limbSpring,
  },
  attentiveWarning: {
    rotate: -10,
    transition: limbSpring,
  },
  acknowledge: {
    rotate: -40,
    transition: snappySpring,
  },
  listening: {
    rotate: -22,
    transition: limbSpring,
  },
  thinking: {
    rotate: -50,
    transition: limbSpring,
  },
  speaking: (gesture?: SpeakingGesture) => {
    switch (gesture) {
      case 'explainLeft':
        return { rotate: -60, transition: limbSpring };
      case 'openPalm':
        return { rotate: -35, transition: limbSpring };
      case 'explainRight':
        return { rotate: 8, transition: limbSpring };
      default:
        return { rotate: [-12, -24, -12], transition: { repeat: Infinity, duration: 3.6, ease: 'easeInOut' } };
    }
  },
  presenting: {
    rotate: -45,
    transition: limbSpring,
  },
  working: {
    rotate: -20,
    transition: limbSpring,
  },
  celebrating: {
    // Both arms raised high joyfully
    rotate: [0, 15, -115, -125, -118],
    transition: { duration: 1.8, ease: [0.22, 1, 0.36, 1] },
  },
  encouraging: {
    rotate: -48,
    transition: limbSpring,
  },
  guiding: {
    rotate: -42,
    transition: limbSpring,
  },
  focused: {
    rotate: 4,
    transition: gentleSpring,
  },
  sleeping: {
    rotate: 10,
    transition: gentleSpring,
  },
  suspended: {
    rotate: 6,
    transition: gentleSpring,
  },
  poweredDown: {
    rotate: 12,
    transition: gentleSpring,
  },
  error: {
    rotate: 14,
    transition: limbSpring,
  },
};

// Left Elbow Joint (Pivots at local (0,0))
export const leftElbowVariants: Variants = {
  idle: {
    rotate: [0, 4, 0],
    transition: { repeat: Infinity, duration: 5.2, ease: 'easeInOut' },
  },
  attentiveIdle: {
    rotate: 4,
    transition: limbSpring,
  },
  attentiveWarning: {
    rotate: -20,
    transition: limbSpring,
  },
  acknowledge: {
    rotate: -65,
    transition: snappySpring,
  },
  listening: {
    rotate: -48,
    transition: limbSpring,
  },
  thinking: {
    rotate: -80,
    transition: limbSpring,
  },
  speaking: (gesture?: SpeakingGesture) => {
    switch (gesture) {
      case 'explainLeft':
        return { rotate: -42, transition: limbSpring };
      case 'openPalm':
        return { rotate: -58, transition: limbSpring };
      default:
        return { rotate: [-18, -36, -18], transition: { repeat: Infinity, duration: 3.6, ease: 'easeInOut' } };
    }
  },
  presenting: {
    rotate: -52,
    transition: limbSpring,
  },
  working: {
    rotate: -35,
    transition: limbSpring,
  },
  celebrating: {
    rotate: [0, -10, -45, -55, -45],
    transition: { duration: 1.8, ease: 'easeInOut' },
  },
  encouraging: {
    rotate: -68,
    transition: limbSpring,
  },
  guiding: {
    rotate: -50,
    transition: limbSpring,
  },
  focused: {
    rotate: 6,
    transition: gentleSpring,
  },
  sleeping: {
    rotate: 14,
    transition: gentleSpring,
  },
  suspended: {
    rotate: 10,
    transition: gentleSpring,
  },
  poweredDown: {
    rotate: 16,
    transition: gentleSpring,
  },
  error: {
    rotate: 8,
    transition: limbSpring,
  },
};

// Right Shoulder Joint (Pivots at local (0,0))
export const rightShoulderVariants: Variants = {
  idle: {
    rotate: [0, -2.5, 0],
    transition: { repeat: Infinity, duration: 5.4, ease: 'easeInOut' },
  },
  attentiveIdle: {
    rotate: -2,
    transition: limbSpring,
  },
  attentiveWarning: {
    rotate: 10,
    transition: limbSpring,
  },
  acknowledge: {
    rotate: 12,
    transition: snappySpring,
  },
  listening: {
    rotate: 16,
    transition: limbSpring,
  },
  thinking: {
    rotate: 12,
    transition: limbSpring,
  },
  speaking: (gesture?: SpeakingGesture) => {
    switch (gesture) {
      case 'explainRight':
        return { rotate: 60, transition: limbSpring };
      case 'openPalm':
        return { rotate: 35, transition: limbSpring };
      case 'explainLeft':
        return { rotate: -8, transition: limbSpring };
      default:
        return { rotate: [12, 24, 12], transition: { repeat: Infinity, duration: 3.8, ease: 'easeInOut' } };
    }
  },
  presenting: {
    rotate: 45,
    transition: limbSpring,
  },
  working: {
    rotate: 20,
    transition: limbSpring,
  },
  celebrating: {
    // Both arms raised high joyfully
    rotate: [0, -15, 115, 125, 118],
    transition: { duration: 1.8, ease: [0.22, 1, 0.36, 1] },
  },
  encouraging: {
    rotate: 16,
    transition: limbSpring,
  },
  guiding: {
    rotate: 38,
    transition: limbSpring,
  },
  focused: {
    rotate: -4,
    transition: gentleSpring,
  },
  sleeping: {
    rotate: -10,
    transition: gentleSpring,
  },
  suspended: {
    rotate: -6,
    transition: gentleSpring,
  },
  poweredDown: {
    rotate: -12,
    transition: gentleSpring,
  },
  error: {
    rotate: -14,
    transition: limbSpring,
  },
};

// Right Elbow Joint (Pivots at local (0,0))
export const rightElbowVariants: Variants = {
  idle: {
    rotate: [0, -4, 0],
    transition: { repeat: Infinity, duration: 5.4, ease: 'easeInOut' },
  },
  attentiveIdle: {
    rotate: -4,
    transition: limbSpring,
  },
  attentiveWarning: {
    rotate: 20,
    transition: limbSpring,
  },
  acknowledge: {
    rotate: 28,
    transition: snappySpring,
  },
  listening: {
    rotate: 32,
    transition: limbSpring,
  },
  thinking: {
    rotate: 24,
    transition: limbSpring,
  },
  speaking: (gesture?: SpeakingGesture) => {
    switch (gesture) {
      case 'explainRight':
        return { rotate: 42, transition: limbSpring };
      case 'openPalm':
        return { rotate: 58, transition: limbSpring };
      default:
        return { rotate: [18, 36, 18], transition: { repeat: Infinity, duration: 3.8, ease: 'easeInOut' } };
    }
  },
  presenting: {
    rotate: 52,
    transition: limbSpring,
  },
  working: {
    rotate: 35,
    transition: limbSpring,
  },
  celebrating: {
    rotate: [0, 10, 45, 55, 45],
    transition: { duration: 1.8, ease: 'easeInOut' },
  },
  encouraging: {
    rotate: 18,
    transition: limbSpring,
  },
  guiding: {
    rotate: 45,
    transition: limbSpring,
  },
  focused: {
    rotate: -6,
    transition: gentleSpring,
  },
  sleeping: {
    rotate: -14,
    transition: gentleSpring,
  },
  suspended: {
    rotate: -10,
    transition: gentleSpring,
  },
  poweredDown: {
    rotate: -16,
    transition: gentleSpring,
  },
  error: {
    rotate: -8,
    transition: limbSpring,
  },
};

// Left Hip & Leg Joint
export const leftHipVariants: Variants = {
  idle: {
    rotate: [0, 1.0, 0],
    transition: { repeat: Infinity, duration: 5.6, ease: 'easeInOut' },
  },
  celebrating: {
    rotate: [0, 4, -8, 6, 0],
    transition: { duration: 1.8, ease: 'easeInOut' },
  },
};

// Right Hip & Leg Joint
export const rightHipVariants: Variants = {
  idle: {
    rotate: [0, -1.0, 0],
    transition: { repeat: Infinity, duration: 5.6, ease: 'easeInOut' },
  },
  celebrating: {
    rotate: [0, -4, 8, -6, 0],
    transition: { duration: 1.8, ease: 'easeInOut' },
  },
};
