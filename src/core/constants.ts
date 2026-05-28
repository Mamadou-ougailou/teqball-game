/**
 * GAME CONSTANTS
 * All magic numbers defined here. Never hardcode values in code.
 * When tuning gameplay, change values here.
 */

// ============== PHYSICS ==============
export const GRAVITY = -9.81; // m/s²
export const BALL_MASS = 0.43; // kg (official teqball ball)
export const BALL_RADIUS = 0.105; // m (slightly larger ball for cleaner table bounces)
export const BALL_RESTITUTION = 0.75; // bounce 0-1
export const BALL_FRICTION = 0.3; // rolling friction
export const BALL_LINEAR_DAMPING = 0.02;
export const BALL_ANGULAR_DAMPING = 0.05;

export const CHARACTER_MASS = 70; // kg (average)
export const CHARACTER_FRICTION = 0.5;
export const CHARACTER_HEIGHT = 1.72; // m
export const CHARACTER_RADIUS = 0.28; // m (collision radius)

// ============== TABLE DIMENSIONS ==============
export const TABLE_LENGTH = 16.8; // m
export const TABLE_WIDTH = 2.55; // m
export const TABLE_HEIGHT = 0.75; // m above ground
export const NET_HEIGHT = 1.52; // m
export const NET_WIDTH = 2.55; // m

// ============== GAMEPLAY ==============
export const KICK_POWER_MIN = 50;
export const KICK_POWER_MAX = 150;
export const KICK_COOLDOWN = 0.3; // seconds between kicks
export const JUMP_HEIGHT = 1.2; // m
export const CHARACTER_SPEED = 8; // m/s

// ============== MATCH RULES ==============
export const POINTS_PER_SET = 12;
export const SETS_TO_WIN = 2;
export const MAX_TOUCHES_PER_PLAYER = 3; // consecutive touches
export const MAX_RALLIES = 500; // safety limit per match

// ============== ABILITIES ==============
export const GRAVITY_FLIP_DURATION = 3; // seconds
export const GRAVITY_FLIP_COOLDOWN = 15; // seconds
export const SPEED_BURST_MULTIPLIER = 3;
export const SPEED_BURST_DURATION = 2; // seconds
export const SPEED_BURST_COOLDOWN = 12; // seconds
export const BALL_FREEZE_DURATION = 1; // seconds
export const BALL_FREEZE_COOLDOWN = 20; // seconds
export const MEGA_BOUNCE_MULTIPLIER = 2.5;
export const MEGA_BOUNCE_COOLDOWN = 18; // seconds

// ============== UI ==============
export const HUD_UPDATE_RATE = 60; // Hz
export const POINT_ANNOUNCEMENT_DURATION = 2; // seconds
export const SCORE_ANIMATION_SPEED = 1; // seconds

// ============== CAMERA ==============
export const CAMERA_DEFAULT_DISTANCE = 15; // m
export const CAMERA_FOLLOW_SPEED = 0.1; // lerp factor
export const CAMERA_ZOOM_SPEED = 2; // for doubles mode

// ============== PERFORMANCE ==============
export const TARGET_FPS = 60;
export const MAX_SHADOW_CASCADES = 2;
export const PARTICLE_POOL_SIZE = 500;

// ============== ASSET SIZING ==============
export const MAX_MODEL_SIZE_MB = 10; // per .glb file
export const MAX_TEXTURE_SIZE_KB = 1024; // per texture
export const MAX_AUDIO_SIZE_MB = 5; // per music file

// ============== DEBUG ==============
export const DEBUG_MODE = false; // set to true to log physics events
export const DEBUG_DRAW_COLLISION = false;
