export interface AnimConfig {
  contactFrame: number;              // frame to fire ball impulse
  contactWindow?: [number, number];  // optional valid frame window [start, end]
  startupTrimFrames?: number;        // optional leading frames to skip (e.g., T-pose frames)
  holdWindow?: [number, number];     // optional hold/carry frame window [start, end]
  tossFrame?: number;                // optional toss/release frame for serve-like clips
  clipLengthFrames?: number;         // total frame count
  serveHand?: 'left' | 'right';      // preferred hand for serve carry/toss
  activeBone: string;                // bone name near ball at contact
  reach: number;                     // max distance from root to hit (scene units)
  ballSpeed: number;                 // impulse power (raw preset value)
  ballLoft: number;                  // upward angle 0=flat 1=high
  mirrorSafe: boolean;               // can be flipped with scaling.x = -1
  preRotationY: number;              // correction in degrees before playing
  idleReturnRotY: number;            // correction in degrees when returning to idle
}

export const SPEED_PRESET = {
  NONE: 0,
  CONTROL: 220,
  LOW: 420,
  MEDIUM: 620,
  HIGH: 840,
  SUPER_HIGH: 980,
} as const;

const GLOBAL_STARTUP_TRIM_FRAMES = 3;

const shiftFrameValue = (frame: number | undefined, trim: number, min = 0): number | undefined => {
  if (frame === undefined) return undefined;
  if (!Number.isFinite(frame)) return frame;
  return Math.max(min, Math.round(frame - trim));
};

const shiftFrameWindow = (window: [number, number] | undefined, trim: number): [number, number] | undefined => {
  if (!window) return undefined;
  const start = Math.max(0, Math.round(window[0] - trim));
  const end = Math.max(start, Math.round(window[1] - trim));
  return [start, end];
};

const applyGlobalStartupTrim = (config: AnimConfig): AnimConfig => {
  const trim = GLOBAL_STARTUP_TRIM_FRAMES;
  return {
    ...config,
    startupTrimFrames: trim,
    contactFrame: Math.max(0, Math.round(config.contactFrame - trim)),
    contactWindow: shiftFrameWindow(config.contactWindow, trim),
    holdWindow: shiftFrameWindow(config.holdWindow, trim),
    tossFrame: shiftFrameValue(config.tossFrame, trim, 0),
    clipLengthFrames: shiftFrameValue(config.clipLengthFrames, trim, 1),
  };
};

const RAW_ANIM_CONFIG: Record<string, AnimConfig> = {
  soleKickRight: {
    clipLengthFrames: 68,
    contactFrame: 38,
    contactWindow: [36, 40],
    activeBone: 'RightFootSocket',
    reach: 1.8,
    ballSpeed: SPEED_PRESET.HIGH,
    ballLoft: 0.15,
    mirrorSafe: true,
    preRotationY: -30,
    idleReturnRotY: 0,
  },
  header: {
    clipLengthFrames: 82,
    contactFrame: 47,
    contactWindow: [44, 53],
    activeBone: 'HeadSocket',
    reach: 1.5,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.6,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  chestKick: {
    clipLengthFrames: 66,
    contactFrame: 34,
    contactWindow: [28, 40],
    activeBone: 'ChestSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.LOW,
    ballLoft: 0.5,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  chestReception: {
    clipLengthFrames: 26,
    contactFrame: 13,
    contactWindow: [12, 16],
    activeBone: 'ChestSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.CONTROL,
    ballLoft: 0.7,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  closeTableLowHeader: {
    clipLengthFrames: 72,
    contactFrame: 39,
    contactWindow: [29, 51],
    activeBone: 'HeadSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.1,
    mirrorSafe: true,
    preRotationY: -30,
    idleReturnRotY: 0,
  },
  closeTableKickRight: {
    clipLengthFrames: 72,
    contactFrame: 26,
    contactWindow: [23, 31],
    activeBone: 'LeftFootSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.LOW,
    ballLoft: 0.4,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  serve: {
    clipLengthFrames: 146,
    holdWindow: [4, 4],
    tossFrame: 4,
    contactFrame: 58,
    contactWindow: [58, 71],
    serveHand: 'left',
    activeBone: 'HeadSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.4,
    mirrorSafe: true,
    preRotationY: -60,
    idleReturnRotY: 30,
  },
  highKickLeft: {
    clipLengthFrames: 92,
    contactFrame: 47,
    contactWindow: [44, 53],
    activeBone: 'LeftFootSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.SUPER_HIGH,
    ballLoft: 0.1,
    mirrorSafe: true,
    preRotationY: 60,
    idleReturnRotY: 0,
  },
  jogBack: {
    clipLengthFrames: 62,
    contactFrame: 0,
    activeBone: '',
    reach: 0,
    ballSpeed: SPEED_PRESET.NONE,
    ballLoft: 0,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  jogForward: {
    clipLengthFrames: 70,
    contactFrame: 0,
    activeBone: '',
    reach: 0,
    ballSpeed: SPEED_PRESET.NONE,
    ballLoft: 0,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  strafeRight: {
    clipLengthFrames: 128,
    contactFrame: 0,
    activeBone: '',
    reach: 0,
    ballSpeed: SPEED_PRESET.NONE,
    ballLoft: 0,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  bridgeReception1Left: {
    clipLengthFrames: 40,
    contactFrame: 22,
    contactWindow: [20, 23],
    activeBone: 'RightFootSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.LOW,
    ballLoft: 0.8,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  bridgeReception2Left: {
    clipLengthFrames: 40,
    contactFrame: 22,
    contactWindow: [20, 23],
    activeBone: 'RightFootSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.LOW,
    ballLoft: 0.8,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  jumpingHeaderKick: {
    clipLengthFrames: 102,
    contactFrame: 35,
    contactWindow: [28, 37],
    activeBone: 'HeadSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.3,
    mirrorSafe: true,
    preRotationY: -60,
    idleReturnRotY: 0,
  },
  toeReceptionRight: {
    clipLengthFrames: 46,
    contactFrame: 30,
    contactWindow: [29, 33],
    activeBone: 'RightFootSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.7,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  knee1: {
    clipLengthFrames: 46,
    contactFrame: 30,
    contactWindow: [29, 33],
    activeBone: 'RightFootSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.7,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  bicycleKickLeft: {
    clipLengthFrames: 114,
    contactFrame: 45,
    contactWindow: [43, 48],
    activeBone: 'LeftFootSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.SUPER_HIGH,
    ballLoft: 0.1,
    mirrorSafe: true,
    preRotationY: -60,
    idleReturnRotY: 180,
  },
  scissorKick: {
    clipLengthFrames: 114,
    contactFrame: 45,
    contactWindow: [43, 48],
    activeBone: 'LeftFootSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.SUPER_HIGH,
    ballLoft: 0.1,
    mirrorSafe: true,
    preRotationY: -60,
    idleReturnRotY: 180,
  },
  idle: {
    clipLengthFrames: 48,
    contactFrame: 0,
    activeBone: '',
    reach: 0,
    ballSpeed: SPEED_PRESET.NONE,
    ballLoft: 0,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
};

export const ANIM_CONFIG: Record<string, AnimConfig> = Object.fromEntries(
  Object.entries(RAW_ANIM_CONFIG).map(([key, config]) => [key, applyGlobalStartupTrim(config)]),
);

const ACTION_TO_CONFIG_KEY: Record<string, keyof typeof ANIM_CONFIG> = {
  serve: 'serve',

  header: 'header',
  kickHead: 'header',
  kickCloseHead: 'closeTableLowHeader',
  kickJumpHead: 'jumpingHeaderKick',

  chest: 'chestKick',
  kickChest: 'chestKick',
  receptionChest: 'chestReception',
  prepChest: 'chestReception',

  knee: 'knee1',
  receptionToe: 'toeReceptionRight',
  receptionInnerRight: 'bridgeReception1Left',
  prepInnerRight: 'bridgeReception1Left',
  kickCloseRightFoot: 'closeTableKickRight',
  kickSoleRight: 'soleKickRight',
  kickHighLeft: 'highKickLeft',
  kickBicycleLeft: 'bicycleKickLeft',
  scissor: 'scissorKick',
};

const CLIP_TO_CONFIG_KEY: Record<string, keyof typeof ANIM_CONFIG> = {
  header: 'header',
  closeTableLowHeader: 'closeTableLowHeader',
  jumpingHeaderKick: 'jumpingHeaderKick',

  chestKick: 'chestKick',
  chestReception: 'chestReception',

  bridgeReception1Left: 'bridgeReception1Left',
  bridgeReception2Left: 'bridgeReception2Left',

  knee1: 'knee1',
  toeReceptionRight: 'toeReceptionRight',
  closeTableKickRight: 'closeTableKickRight',
  soleKickRight: 'soleKickRight',
  highKickLeft: 'highKickLeft',
  bicycleKickLeft: 'bicycleKickLeft',
  scissorKick: 'scissorKick',
  jogBack: 'jogBack',
  jogForward: 'jogForward',
  strafeRight: 'strafeRight',
  idle: 'idle',
  serve: 'serve',
  serveLeft: 'serve',
  serveRight: 'serve',
  headerBall1: 'serve',
  headerBall2: 'serve',
};

export const ANIM_CONFIG_FPS = 30;

export function resolveAnimBallSpeedValue(config: AnimConfig | null, fallback: number): number {
  if (!config) return fallback;
  if (!Number.isFinite(config.ballSpeed)) return fallback;
  return Math.max(0, config.ballSpeed);
}

export function resolveAnimReachUnits(config: AnimConfig | null, fallbackUnits: number): number {
  if (!config) return fallbackUnits;
  if (!Number.isFinite(config.reach) || config.reach <= 0) return fallbackUnits;
  return config.reach;
}

export function getContactFrameRatio(config: AnimConfig | null, defaultRatio = 0.5): number {
  if (!config) return defaultRatio;

  const contactFrame = config.contactWindow
    ? 0.5 * (config.contactWindow[0] + config.contactWindow[1])
    : config.contactFrame;

  const clipLength = config.clipLengthFrames ?? Math.max(1, Math.round(contactFrame + 1));
  if (!Number.isFinite(clipLength) || clipLength <= 0) return defaultRatio;

  const ratio = contactFrame / clipLength;
  return Math.max(0, Math.min(1, ratio));
}

export function getAnimConfigForAction(action: string): AnimConfig | null {
  const key = ACTION_TO_CONFIG_KEY[action];
  return key ? ANIM_CONFIG[key] : null;
}

export function getAnimConfigForClip(clipKey: string): AnimConfig | null {
  const key = CLIP_TO_CONFIG_KEY[clipKey];
  return key ? ANIM_CONFIG[key] : null;
}
