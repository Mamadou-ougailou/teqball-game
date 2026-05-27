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

// Raw frame data below is in the clip's native units (30 fps export from Blender).
// `applyGlobalStartupTrim` will subtract GLOBAL_STARTUP_TRIM_FRAMES from every
// frame reference before the values land in ANIM_CONFIG.
const RAW_ANIM_CONFIG: Record<string, AnimConfig> = {
  soleKickRight: {
    clipLengthFrames: 75,
    contactFrame: 23,
    contactWindow: [21, 26],
    activeBone: 'RightFootSocket',
    reach: 1.8,
    ballSpeed: SPEED_PRESET.HIGH,
    ballLoft: 0.15,
    mirrorSafe: true,
    preRotationY: -30,
    idleReturnRotY: 0,
  },
  header: {
    clipLengthFrames: 61,
    contactFrame: 24,
    contactWindow: [22, 27],
    activeBone: 'HeadSocket',
    reach: 1.5,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.6,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  chestKick: {
    clipLengthFrames: 67,
    contactFrame: 35,
    contactWindow: [33, 38],
    activeBone: 'ChestSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.LOW,
    ballLoft: 0.5,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  chestReception: {
    clipLengthFrames: 74,
    contactFrame: 51,
    contactWindow: [48, 54],
    activeBone: 'ChestSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.CONTROL,
    ballLoft: 0.7,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  closeTableLowHeader: {
    clipLengthFrames: 52,
    contactFrame: 24,
    contactWindow: [22, 27],
    activeBone: 'HeadSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.1,
    mirrorSafe: true,
    preRotationY: -30,
    idleReturnRotY: 0,
  },
  closeTableKickRight: {
    clipLengthFrames: 75,
    contactFrame: 23,
    contactWindow: [21, 26],
    activeBone: 'RightFootSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.LOW,
    ballLoft: 0.4,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  // headServeLeft = head serve where the left side of the head strikes the ball.
  // Right hand tosses; BLH=26, contact=73, total=121 frames (30 fps Blender export).
  headServeLeft: {
    clipLengthFrames: 121,
    holdWindow: [0, 26],
    tossFrame: 26,
    contactFrame: 73,
    contactWindow: [71, 76],
    serveHand: 'right',
    activeBone: 'HeadSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.4,
    mirrorSafe: true,
    preRotationY: -60,
    idleReturnRotY: 30,
  },
  // headServeRight = head serve where the right side of the head strikes the ball.
  // Left hand tosses; BLH=28, contact=69, total=104 frames.
  headServeRight: {
    clipLengthFrames: 104,
    holdWindow: [0, 28],
    tossFrame: 28,
    contactFrame: 69,
    contactWindow: [67, 72],
    serveHand: 'left',
    activeBone: 'HeadSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.4,
    mirrorSafe: true,
    preRotationY: -60,
    idleReturnRotY: 30,
  },
  // `serve` kept for back-compat; same data as headServeLeft.
  serve: {
    clipLengthFrames: 121,
    holdWindow: [0, 26],
    tossFrame: 26,
    contactFrame: 73,
    contactWindow: [71, 76],
    serveHand: 'right',
    activeBone: 'HeadSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.4,
    mirrorSafe: true,
    preRotationY: -60,
    idleReturnRotY: 30,
  },
  // serveLeft = foot serve with the LEFT foot (ServeLeftFoot clip).
  serveLeft: {
    clipLengthFrames: 120,
    holdWindow: [0, 21],
    tossFrame: 21,
    contactFrame: 65,
    contactWindow: [63, 68],
    serveHand: 'right',
    activeBone: 'LeftFootSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.HIGH,  // foot serves hit harder than head serves
    ballLoft: 0.4,
    mirrorSafe: true,
    preRotationY: -60,
    idleReturnRotY: 30,
  },
  // serveRight = foot serve with the RIGHT foot (ServeRightFoot clip).
  serveRight: {
    clipLengthFrames: 120,
    holdWindow: [0, 44],
    tossFrame: 44,
    contactFrame: 92,
    contactWindow: [90, 95],
    serveHand: 'left',
    activeBone: 'RightFootSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.HIGH,  // foot serves hit harder than head serves
    ballLoft: 0.4,
    mirrorSafe: true,
    preRotationY: -60,
    idleReturnRotY: 30,
  },
  highKickLeft: {
    clipLengthFrames: 85,
    contactFrame: 40,
    contactWindow: [38, 43],
    activeBone: 'LeftFootSocket',
    reach: 1.2,
    ballSpeed: SPEED_PRESET.SUPER_HIGH,
    ballLoft: 0.1,
    mirrorSafe: true,
    preRotationY: 60,
    idleReturnRotY: 0,
  },
  jogBack: {
    clipLengthFrames: 53,
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
    clipLengthFrames: 72,
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
    clipLengthFrames: 40,
    contactFrame: 0,
    activeBone: '',
    reach: 0,
    ballSpeed: SPEED_PRESET.NONE,
    ballLoft: 0,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  // bridgeReception1Left → innerrightfootreception (right foot reception clip).
  bridgeReception1Left: {
    clipLengthFrames: 72,
    contactFrame: 48,
    contactWindow: [45, 51],
    activeBone: 'RightFootSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.LOW,
    ballLoft: 0.8,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  // jumpingHeaderKick → rightheadkick.
  jumpingHeaderKick: {
    clipLengthFrames: 53,
    contactFrame: 16,
    contactWindow: [14, 19],
    activeBone: 'HeadSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.3,
    mirrorSafe: true,
    preRotationY: -60,
    idleReturnRotY: 0,
  },
  // toeReceptionRight → innerrightfootreception (same clip as bridgeReception1Left).
  toeReceptionRight: {
    clipLengthFrames: 72,
    contactFrame: 48,
    contactWindow: [45, 51],
    activeBone: 'RightFootSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.7,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  // knee1 → rightkneereception.
  knee1: {
    clipLengthFrames: 76,
    contactFrame: 40,
    contactWindow: [37, 43],
    activeBone: 'RightFootSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.MEDIUM,
    ballLoft: 0.7,
    mirrorSafe: true,
    preRotationY: 0,
    idleReturnRotY: 0,
  },
  // bicycleKickLeft → leftfootkick (same clip as highKickLeft & scissorKick).
  bicycleKickLeft: {
    clipLengthFrames: 85,
    contactFrame: 40,
    contactWindow: [38, 43],
    activeBone: 'LeftFootSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.SUPER_HIGH,
    ballLoft: 0.1,
    mirrorSafe: true,
    preRotationY: -60,
    idleReturnRotY: 180,
  },
  // scissorKick → leftfootkick.
  scissorKick: {
    clipLengthFrames: 85,
    contactFrame: 40,
    contactWindow: [38, 43],
    activeBone: 'LeftFootSocket',
    reach: 1.4,
    ballSpeed: SPEED_PRESET.SUPER_HIGH,
    ballLoft: 0.1,
    mirrorSafe: true,
    preRotationY: -60,
    idleReturnRotY: 180,
  },
  idle: {
    clipLengthFrames: 40,
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
  serveLeft: 'serveLeft',
  serveRight: 'serveRight',
  headServeLeft: 'headServeLeft',
  headServeRight: 'headServeRight',
  headerBall1: 'serveLeft',
  headerBall2: 'serveRight',
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
