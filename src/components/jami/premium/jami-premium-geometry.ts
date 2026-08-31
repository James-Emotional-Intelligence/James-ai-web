// Natural pixel coordinates for 839 x 1213 (Full) and 1254 x 1254 (Head) assets
export const JAMI_PREMIUM_ASPECT_RATIO = 839 / 1213; // ~0.69167

export type PremiumFaceMode = 'source' | 'mouth-only' | 'clean-dynamic';

export const JAMI_FULL_BODY_GEOMETRY = {
  naturalWidth: 839,
  naturalHeight: 1213,
  aspectRatio: 839 / 1213,

  // Anchors for floating effects in natural pixel coordinates
  headCenter: { x: 419.5, y: 340 },
  antennaCenter: { x: 419.5, y: 155 },
  speechAnchor: { x: 570, y: 170 },
  leftFoot: { x: 352, y: 1068 },
  rightFoot: { x: 487, y: 1068 },
  groundShadow: { cx: 419.5, cy: 1165, rx: 226, ry: 45 },

  // Precise bounding boxes for clean dynamic overlay when enabled
  faceVisor: {
    // Exact dark visor screen encompassing eyes and mouth with perspective tilt (~-10 deg)
    path: 'M 268 395 C 275 315, 345 272, 442 272 C 540 272, 608 315, 622 395 C 632 455, 595 540, 482 548 C 370 556, 260 475, 268 395 Z',
    center: { x: 445, y: 410 },
  },

  leftEye: { x: 366, y: 440, width: 64, height: 38 },
  rightEye: { x: 562, y: 398, width: 64, height: 38 },
  mouth: { x: 470, y: 485, width: 58, height: 26 },

  // Brand regions (for clean rebrand mode)
  foreheadBadge: {
    x: 375,
    y: 205,
    width: 90,
    height: 58,
  },
  chestBadge: {
    x: 395,
    y: 685,
    width: 170,
    height: 145,
  },
};

export const JAMI_HEAD_GEOMETRY = {
  naturalWidth: 1254,
  naturalHeight: 1254,
  aspectRatio: 1.0,

  headCenter: { x: 627, y: 627 },
  antennaCenter: { x: 627, y: 220 },
  speechAnchor: { x: 900, y: 250 },

  faceVisor: {
    path: 'M 350 560 C 360 420, 480 370, 627 370 C 774 370, 894 420, 904 560 C 914 700, 830 810, 627 810 C 424 810, 340 700, 350 560 Z',
    center: { x: 627, y: 590 },
  },

  leftEye: { x: 489, y: 574, width: 120, height: 75 },
  rightEye: { x: 765, y: 574, width: 120, height: 75 },
  mouth: { x: 627, y: 700, width: 130, height: 50 },

  foreheadBadge: {
    x: 527,
    y: 260,
    width: 200,
    height: 100,
  },
};
