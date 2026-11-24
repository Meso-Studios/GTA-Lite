// Procedural + Data-Driven 3,240+ Unique Animation Catalog & Pose Synthesizer.
// Zero Three.js dependencies so the full 3,240+ clip library is deterministically unit-tested via node:test.

export type AnimationCategory =
  | 'locomotion'
  | 'urban_idle'
  | 'speaking'
  | 'tourist_beach'
  | 'combat_stance'
  | 'weapon_actions'
  | 'melee_combos'
  | 'hit_reactions'
  | 'panic_flee'
  | 'parkour_stunts'
  | 'vehicle_flight'
  | 'street_emotes';

export interface AnimationClip {
  readonly id: number;
  readonly name: string;
  readonly category: AnimationCategory;
  readonly baseAction: string;
  readonly variant: string;
  readonly cycleHz: number;
  readonly hipY: number;
  readonly hipBob: number;
  readonly hipSway: number;
  readonly spineLean: number;
  readonly spineTwist: number;
  readonly headPitch: number;
  readonly headYaw: number;
  readonly headBob: number;
  readonly armSwingL: number;
  readonly armSwingR: number;
  readonly armLiftL: number;
  readonly armLiftR: number;
  readonly armOutL: number;
  readonly armOutR: number;
  readonly elbowL: number;
  readonly elbowR: number;
  readonly legStride: number;
  readonly kneeLift: number;
  readonly gestureFreq: number;
  readonly asymmetry: number;
}

export interface EvaluatedPose {
  hipY: number;
  hipRoll: number;
  spineX: number;
  spineY: number;
  headX: number;
  headY: number;
  armLx: number;
  armLz: number;
  armRx: number;
  armRz: number;
  foreLx: number;
  foreRx: number;
  legLx: number;
  legRx: number;
  shinLx: number;
  shinRx: number;
}

interface ActionArchetype {
  base: string;
  hz: number;
  hipY: number;
  hipBob: number;
  hipSway: number;
  spineLean: number;
  spineTwist: number;
  headPitch: number;
  headYaw: number;
  headBob: number;
  armSwingL: number;
  armSwingR: number;
  armLiftL: number;
  armLiftR: number;
  armOutL: number;
  armOutR: number;
  elbowL: number;
  elbowR: number;
  legStride: number;
  kneeLift: number;
  gestureFreq: number;
}

interface CategoryBlueprint {
  category: AnimationCategory;
  actions: ActionArchetype[];
  styles: readonly string[];
  moods: readonly string[];
}

const STYLES_LOCO = ['natural', 'confident', 'relaxed', 'brisk', 'heavy', 'nimble', 'cautious'] as const;
const MOODS_LOCO = ['urban', 'coastal', 'street', 'tactical', 'weary'] as const;

const STYLES_IDLE = ['casual', 'restless', 'alert', 'cool', 'expressive', 'tired'] as const;
const MOODS_IDLE = ['morning', 'midday', 'sunset', 'night', 'crowd'] as const;

const STYLES_GEN = ['standard', 'emphatic', 'subtle', 'dynamic', 'sharp'] as const;
const MOODS_GEN = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'] as const;

const BLUEPRINTS: CategoryBlueprint[] = [
  {
    // 12 * 7 * 5 = 420 locomotion animations
    category: 'locomotion',
    styles: STYLES_LOCO,
    moods: MOODS_LOCO,
    actions: [
      { base: 'walk_cruise', hz: 1.75, hipY: 0, hipBob: 0.036, hipSway: 0.032, spineLean: 0.05, spineTwist: 0.08, headPitch: 0, headYaw: 0.05, headBob: 0.02, armSwingL: 0.42, armSwingR: 0.42, armLiftL: 0, armLiftR: 0, armOutL: 0.08, armOutR: -0.08, elbowL: -0.22, elbowR: -0.22, legStride: 0.48, kneeLift: 0.45, gestureFreq: 1 },
      { base: 'walk_swagger', hz: 1.55, hipY: 0, hipBob: 0.05, hipSway: 0.07, spineLean: -0.03, spineTwist: 0.14, headPitch: -0.04, headYaw: 0.1, headBob: 0.04, armSwingL: 0.56, armSwingR: 0.44, armLiftL: 0.05, armLiftR: 0.04, armOutL: 0.18, armOutR: -0.16, elbowL: -0.34, elbowR: -0.28, legStride: 0.52, kneeLift: 0.42, gestureFreq: 1 },
      { base: 'walk_brisk', hz: 2.15, hipY: 0, hipBob: 0.042, hipSway: 0.04, spineLean: 0.1, spineTwist: 0.1, headPitch: 0.02, headYaw: 0.04, headBob: 0.025, armSwingL: 0.58, armSwingR: 0.58, armLiftL: 0.04, armLiftR: 0.04, armOutL: 0.1, armOutR: -0.1, elbowL: -0.45, elbowR: -0.45, legStride: 0.62, kneeLift: 0.55, gestureFreq: 1 },
      { base: 'jog_steady', hz: 2.65, hipY: -0.02, hipBob: 0.068, hipSway: 0.05, spineLean: 0.16, spineTwist: 0.14, headPitch: 0.04, headYaw: 0.04, headBob: 0.03, armSwingL: 0.78, armSwingR: 0.78, armLiftL: 0.12, armLiftR: 0.12, armOutL: 0.12, armOutR: -0.12, elbowL: -1.05, elbowR: -1.05, legStride: 0.78, kneeLift: 0.88, gestureFreq: 1 },
      { base: 'sprint_full', hz: 3.35, hipY: -0.05, hipBob: 0.088, hipSway: 0.075, spineLean: 0.28, spineTwist: 0.2, headPitch: 0.08, headYaw: 0.05, headBob: 0.04, armSwingL: 1.05, armSwingR: 1.05, armLiftL: 0.18, armLiftR: 0.18, armOutL: 0.16, armOutR: -0.16, elbowL: -1.32, elbowR: -1.32, legStride: 1.02, kneeLift: 1.12, gestureFreq: 1 },
      { base: 'sprint_tactical', hz: 3.1, hipY: -0.09, hipBob: 0.065, hipSway: 0.05, spineLean: 0.34, spineTwist: 0.12, headPitch: -0.08, headYaw: 0.03, headBob: 0.02, armSwingL: 0.65, armSwingR: 0.45, armLiftL: 0.45, armLiftR: 0.55, armOutL: 0.14, armOutR: -0.14, elbowL: -1.15, elbowR: -1.2, legStride: 0.94, kneeLift: 1.05, gestureFreq: 1 },
      { base: 'walk_limp', hz: 1.25, hipY: -0.04, hipBob: 0.06, hipSway: 0.11, spineLean: 0.14, spineTwist: 0.12, headPitch: 0.08, headYaw: 0.08, headBob: 0.05, armSwingL: 0.32, armSwingR: 0.18, armLiftL: 0, armLiftR: 0.15, armOutL: 0.22, armOutR: -0.1, elbowL: -0.25, elbowR: -0.58, legStride: 0.36, kneeLift: 0.3, gestureFreq: 1 },
      { base: 'sand_trudge', hz: 1.45, hipY: -0.05, hipBob: 0.055, hipSway: 0.075, spineLean: 0.16, spineTwist: 0.11, headPitch: 0.06, headYaw: 0.06, headBob: 0.03, armSwingL: 0.52, armSwingR: 0.52, armLiftL: 0.08, armLiftR: 0.08, armOutL: 0.18, armOutR: -0.18, elbowL: -0.42, elbowR: -0.42, legStride: 0.54, kneeLift: 0.78, gestureFreq: 1 },
      { base: 'beach_stroll', hz: 1.35, hipY: 0, hipBob: 0.028, hipSway: 0.055, spineLean: -0.02, spineTwist: 0.09, headPitch: -0.03, headYaw: 0.18, headBob: 0.03, armSwingL: 0.3, armSwingR: 0.3, armLiftL: 0, armLiftR: 0, armOutL: 0.12, armOutR: -0.12, elbowL: -0.18, elbowR: -0.18, legStride: 0.4, kneeLift: 0.38, gestureFreq: 0.8 },
      { base: 'crouch_walk', hz: 1.9, hipY: -0.34, hipBob: 0.032, hipSway: 0.05, spineLean: 0.32, spineTwist: 0.08, headPitch: -0.16, headYaw: 0.04, headBob: 0.02, armSwingL: 0.35, armSwingR: 0.35, armLiftL: 0.18, armLiftR: 0.18, armOutL: 0.16, armOutR: -0.16, elbowL: -0.68, elbowR: -0.68, legStride: 0.5, kneeLift: 0.85, gestureFreq: 1 },
      { base: 'strafe_combat', hz: 2.4, hipY: -0.14, hipBob: 0.04, hipSway: 0.08, spineLean: 0.14, spineTwist: 0.15, headPitch: -0.04, headYaw: 0.02, headBob: 0.015, armSwingL: 0.2, armSwingR: 0.2, armLiftL: 0.5, armLiftR: 0.5, armOutL: 0.14, armOutR: -0.14, elbowL: -0.8, elbowR: -0.8, legStride: 0.56, kneeLift: 0.62, gestureFreq: 1 },
      { base: 'backpedal_retreat', hz: 2.2, hipY: -0.08, hipBob: 0.045, hipSway: 0.06, spineLean: -0.08, spineTwist: 0.09, headPitch: 0.04, headYaw: 0.08, headBob: 0.02, armSwingL: 0.45, armSwingR: 0.45, armLiftL: 0.22, armLiftR: 0.22, armOutL: 0.2, armOutR: -0.2, elbowL: -0.5, elbowR: -0.5, legStride: -0.55, kneeLift: 0.58, gestureFreq: 1 },
    ],
  },
  {
    // 12 * 6 * 5 = 360 urban_idle animations
    category: 'urban_idle',
    styles: STYLES_IDLE,
    moods: MOODS_IDLE,
    actions: [
      { base: 'stand_breathe', hz: 0.55, hipY: 0, hipBob: 0.012, hipSway: 0.015, spineLean: 0.02, spineTwist: 0.03, headPitch: 0.02, headYaw: 0.14, headBob: 0.02, armSwingL: 0.04, armSwingR: 0.04, armLiftL: 0.02, armLiftR: 0.02, armOutL: 0.08, armOutR: -0.08, elbowL: -0.16, elbowR: -0.16, legStride: 0, kneeLift: 0, gestureFreq: 0.6 },
      { base: 'phone_text', hz: 0.9, hipY: 0, hipBob: 0.01, hipSway: 0.012, spineLean: 0.06, spineTwist: 0.02, headPitch: 0.34, headYaw: 0.05, headBob: 0.03, armSwingL: 0.06, armSwingR: 0.08, armLiftL: -0.68, armLiftR: -0.72, armOutL: -0.14, armOutR: 0.14, elbowL: -1.15, elbowR: -1.18, legStride: 0, kneeLift: 0, gestureFreq: 1.8 },
      { base: 'phone_call', hz: 0.75, hipY: 0, hipBob: 0.014, hipSway: 0.025, spineLean: 0.01, spineTwist: 0.06, headPitch: -0.02, headYaw: 0.16, headBob: 0.06, armSwingL: 0.18, armSwingR: 0.04, armLiftL: -0.25, armLiftR: -1.45, armOutL: 0.12, armOutR: -0.18, elbowL: -0.4, elbowR: -1.65, legStride: 0, kneeLift: 0, gestureFreq: 1.4 },
      { base: 'check_watch', hz: 0.8, hipY: 0, hipBob: 0.01, hipSway: 0.015, spineLean: 0.04, spineTwist: 0.05, headPitch: 0.28, headYaw: -0.18, headBob: 0.02, armSwingL: 0.05, armSwingR: 0.04, armLiftL: -0.82, armLiftR: 0.02, armOutL: -0.22, armOutR: -0.08, elbowL: -1.3, elbowR: -0.18, legStride: 0, kneeLift: 0, gestureFreq: 0.9 },
      { base: 'coffee_sip', hz: 0.65, hipY: 0, hipBob: 0.01, hipSway: 0.018, spineLean: 0.01, spineTwist: 0.04, headPitch: -0.06, headYaw: 0.12, headBob: 0.04, armSwingL: 0.05, armSwingR: 0.22, armLiftL: -0.1, armLiftR: -0.95, armOutL: 0.08, armOutR: 0.08, elbowL: -0.25, elbowR: -1.38, legStride: 0, kneeLift: 0, gestureFreq: 0.7 },
      { base: 'stretch_arms', hz: 0.5, hipY: 0.02, hipBob: 0.02, hipSway: 0.02, spineLean: -0.12, spineTwist: 0.06, headPitch: -0.18, headYaw: 0.06, headBob: 0.03, armSwingL: 0.12, armSwingR: 0.12, armLiftL: -2.25, armLiftR: -2.25, armOutL: 0.42, armOutR: -0.42, elbowL: -0.35, elbowR: -0.35, legStride: 0, kneeLift: 0, gestureFreq: 0.5 },
      { base: 'lean_cool', hz: 0.45, hipY: -0.04, hipBob: 0.008, hipSway: 0.03, spineLean: -0.09, spineTwist: 0.12, headPitch: 0.02, headYaw: 0.24, headBob: 0.02, armSwingL: 0.04, armSwingR: 0.04, armLiftL: -0.35, armLiftR: -0.35, armOutL: -0.22, armOutR: 0.22, elbowL: -1.1, elbowR: -1.1, legStride: 0.14, kneeLift: 0.1, gestureFreq: 0.5 },
      { base: 'window_shop', hz: 0.6, hipY: 0, hipBob: 0.012, hipSway: 0.02, spineLean: 0.08, spineTwist: 0.15, headPitch: -0.08, headYaw: 0.34, headBob: 0.04, armSwingL: 0.1, armSwingR: 0.15, armLiftL: -0.12, armLiftR: -0.45, armOutL: 0.08, armOutR: -0.1, elbowL: -0.3, elbowR: -0.75, legStride: 0, kneeLift: 0, gestureFreq: 0.8 },
      { base: 'look_around', hz: 0.7, hipY: 0, hipBob: 0.012, hipSway: 0.02, spineLean: 0.02, spineTwist: 0.18, headPitch: 0.0, headYaw: 0.52, headBob: 0.03, armSwingL: 0.08, armSwingR: 0.08, armLiftL: -0.08, armLiftR: -0.08, armOutL: 0.12, armOutR: -0.12, elbowL: -0.25, elbowR: -0.25, legStride: 0, kneeLift: 0, gestureFreq: 0.9 },
      { base: 'cross_arms', hz: 0.48, hipY: 0, hipBob: 0.01, hipSway: 0.016, spineLean: -0.03, spineTwist: 0.05, headPitch: 0.02, headYaw: 0.16, headBob: 0.02, armSwingL: 0.02, armSwingR: 0.02, armLiftL: -0.52, armLiftR: -0.52, armOutL: -0.34, armOutR: 0.34, elbowL: -1.42, elbowR: -1.42, legStride: 0, kneeLift: 0, gestureFreq: 0.5 },
      { base: 'sunglasses_adjust', hz: 0.85, hipY: 0, hipBob: 0.012, hipSway: 0.015, spineLean: -0.02, spineTwist: 0.05, headPitch: -0.05, headYaw: 0.12, headBob: 0.03, armSwingL: 0.05, armSwingR: 0.18, armLiftL: -0.06, armLiftR: -1.52, armOutL: 0.08, armOutR: -0.1, elbowL: -0.18, elbowR: -1.55, legStride: 0, kneeLift: 0, gestureFreq: 1.0 },
      { base: 'tap_foot_wait', hz: 1.4, hipY: 0, hipBob: 0.018, hipSway: 0.025, spineLean: 0.02, spineTwist: 0.04, headPitch: 0.04, headYaw: 0.22, headBob: 0.03, armSwingL: 0.06, armSwingR: 0.06, armLiftL: -0.18, armLiftR: -0.18, armOutL: 0.22, armOutR: -0.22, elbowL: -0.55, elbowR: -0.55, legStride: 0.08, kneeLift: 0.16, gestureFreq: 1.6 },
    ],
  },
  {
    // 10 * 5 * 6 = 300 speaking animations (played dynamically when NPCs talk via TTS API!)
    category: 'speaking',
    styles: STYLES_GEN,
    moods: MOODS_GEN,
    actions: [
      { base: 'chat_casual', hz: 1.4, hipY: 0, hipBob: 0.018, hipSway: 0.025, spineLean: 0.04, spineTwist: 0.1, headPitch: 0.04, headYaw: 0.18, headBob: 0.12, armSwingL: 0.28, armSwingR: 0.34, armLiftL: -0.48, armLiftR: -0.58, armOutL: 0.18, armOutR: -0.18, elbowL: -0.88, elbowR: -0.96, legStride: 0, kneeLift: 0, gestureFreq: 2.2 },
      { base: 'story_animated', hz: 1.8, hipY: 0, hipBob: 0.024, hipSway: 0.04, spineLean: 0.06, spineTwist: 0.16, headPitch: 0.02, headYaw: 0.22, headBob: 0.16, armSwingL: 0.48, armSwingR: 0.52, armLiftL: -0.78, armLiftR: -0.84, armOutL: 0.32, armOutR: -0.32, elbowL: -1.05, elbowR: -1.12, legStride: 0, kneeLift: 0, gestureFreq: 2.8 },
      { base: 'emphatic_point', hz: 1.6, hipY: 0, hipBob: 0.02, hipSway: 0.03, spineLean: 0.1, spineTwist: 0.14, headPitch: 0.03, headYaw: 0.12, headBob: 0.14, armSwingL: 0.18, armSwingR: 0.35, armLiftL: -0.32, armLiftR: -1.22, armOutL: 0.12, armOutR: -0.14, elbowL: -0.62, elbowR: -0.45, legStride: 0, kneeLift: 0, gestureFreq: 2.5 },
      { base: 'dismissive_wave', hz: 1.5, hipY: 0, hipBob: 0.015, hipSway: 0.035, spineLean: -0.04, spineTwist: 0.18, headPitch: -0.04, headYaw: 0.3, headBob: 0.08, armSwingL: 0.12, armSwingR: 0.45, armLiftL: -0.15, armLiftR: -0.95, armOutL: 0.1, armOutR: -0.38, elbowL: -0.35, elbowR: -0.85, legStride: 0, kneeLift: 0, gestureFreq: 2.4 },
      { base: 'laugh_nod', hz: 2.0, hipY: 0, hipBob: 0.032, hipSway: 0.04, spineLean: -0.08, spineTwist: 0.1, headPitch: -0.14, headYaw: 0.14, headBob: 0.22, armSwingL: 0.26, armSwingR: 0.26, armLiftL: -0.42, armLiftR: -0.42, armOutL: 0.22, armOutR: -0.22, elbowL: -0.92, elbowR: -0.92, legStride: 0, kneeLift: 0, gestureFreq: 3.1 },
      { base: 'radio_dispatch', hz: 1.2, hipY: 0, hipBob: 0.012, hipSway: 0.015, spineLean: 0.03, spineTwist: 0.08, headPitch: 0.12, headYaw: -0.18, headBob: 0.08, armSwingL: 0.06, armSwingR: 0.12, armLiftL: -1.18, armLiftR: -0.24, armOutL: -0.18, armOutR: -0.12, elbowL: -1.52, elbowR: -0.48, legStride: 0, kneeLift: 0, gestureFreq: 1.8 },
      { base: 'street_haggle', hz: 1.7, hipY: 0, hipBob: 0.022, hipSway: 0.035, spineLean: 0.09, spineTwist: 0.15, headPitch: 0.04, headYaw: 0.24, headBob: 0.14, armSwingL: 0.36, armSwingR: 0.4, armLiftL: -0.68, armLiftR: -0.74, armOutL: 0.28, armOutR: -0.28, elbowL: -0.96, elbowR: -1.04, legStride: 0, kneeLift: 0, gestureFreq: 2.6 },
      { base: 'shout_warning', hz: 2.2, hipY: 0, hipBob: 0.028, hipSway: 0.045, spineLean: 0.12, spineTwist: 0.12, headPitch: -0.08, headYaw: 0.16, headBob: 0.18, armSwingL: 0.42, armSwingR: 0.48, armLiftL: -1.35, armLiftR: -1.42, armOutL: 0.36, armOutR: -0.36, elbowL: -0.78, elbowR: -0.78, legStride: 0, kneeLift: 0, gestureFreq: 3.0 },
      { base: 'tourist_ask', hz: 1.3, hipY: 0, hipBob: 0.016, hipSway: 0.025, spineLean: 0.05, spineTwist: 0.14, headPitch: -0.05, headYaw: 0.26, headBob: 0.1, armSwingL: 0.22, armSwingR: 0.32, armLiftL: -0.45, armLiftR: -1.1, armOutL: 0.2, armOutR: -0.24, elbowL: -0.82, elbowR: -0.52, legStride: 0, kneeLift: 0, gestureFreq: 2.0 },
      { base: 'boast_swagger', hz: 1.45, hipY: 0, hipBob: 0.022, hipSway: 0.048, spineLean: -0.06, spineTwist: 0.16, headPitch: -0.08, headYaw: 0.2, headBob: 0.13, armSwingL: 0.34, armSwingR: 0.38, armLiftL: -0.58, armLiftR: -0.68, armOutL: 0.34, armOutR: -0.34, elbowL: -0.85, elbowR: -0.92, legStride: 0, kneeLift: 0, gestureFreq: 2.2 },
    ],
  },
  {
    // 8 * 5 * 6 = 240 tourist_beach animations
    category: 'tourist_beach',
    styles: STYLES_GEN,
    moods: MOODS_GEN,
    actions: [
      { base: 'snap_photo', hz: 0.9, hipY: 0, hipBob: 0.012, hipSway: 0.02, spineLean: 0.05, spineTwist: 0.1, headPitch: -0.08, headYaw: 0.12, headBob: 0.04, armSwingL: 0.05, armSwingR: 0.05, armLiftL: -1.35, armLiftR: -1.35, armOutL: -0.26, armOutR: 0.26, elbowL: -1.15, elbowR: -1.15, legStride: 0, kneeLift: 0, gestureFreq: 1.2 },
      { base: 'selfie_pose', hz: 1.0, hipY: 0, hipBob: 0.015, hipSway: 0.04, spineLean: -0.04, spineTwist: 0.18, headPitch: -0.1, headYaw: 0.2, headBob: 0.05, armSwingL: 0.08, armSwingR: 0.06, armLiftL: -0.55, armLiftR: -1.78, armOutL: 0.24, armOutR: -0.28, elbowL: -0.95, elbowR: -0.45, legStride: 0, kneeLift: 0, gestureFreq: 1.4 },
      { base: 'panoramic_pan', hz: 0.55, hipY: 0, hipBob: 0.01, hipSway: 0.03, spineLean: 0.02, spineTwist: 0.38, headPitch: -0.1, headYaw: 0.35, headBob: 0.02, armSwingL: 0.04, armSwingR: 0.04, armLiftL: -1.28, armLiftR: -1.28, armOutL: -0.22, armOutR: 0.22, elbowL: -0.95, elbowR: -0.95, legStride: 0, kneeLift: 0, gestureFreq: 0.6 },
      { base: 'shade_eyes', hz: 0.65, hipY: 0, hipBob: 0.012, hipSway: 0.018, spineLean: -0.03, spineTwist: 0.14, headPitch: -0.12, headYaw: 0.28, headBob: 0.03, armSwingL: 0.06, armSwingR: 0.06, armLiftL: -0.08, armLiftR: -1.85, armOutL: 0.1, armOutR: -0.22, elbowL: -0.2, elbowR: -1.62, legStride: 0, kneeLift: 0, gestureFreq: 0.8 },
      { base: 'wave_ocean', hz: 1.8, hipY: 0, hipBob: 0.022, hipSway: 0.035, spineLean: -0.02, spineTwist: 0.1, headPitch: -0.04, headYaw: 0.14, headBob: 0.06, armSwingL: 0.1, armSwingR: 0.45, armLiftL: -0.12, armLiftR: -2.35, armOutL: 0.12, armOutR: -0.48, elbowL: -0.25, elbowR: -0.55, legStride: 0, kneeLift: 0, gestureFreq: 2.6 },
      { base: 'admire_skyline', hz: 0.5, hipY: 0, hipBob: 0.01, hipSway: 0.02, spineLean: -0.1, spineTwist: 0.12, headPitch: -0.35, headYaw: 0.22, headBob: 0.02, armSwingL: 0.06, armSwingR: 0.14, armLiftL: -0.12, armLiftR: -0.82, armOutL: 0.14, armOutR: -0.16, elbowL: -0.35, elbowR: -0.55, legStride: 0, kneeLift: 0, gestureFreq: 0.7 },
      { base: 'map_read', hz: 0.75, hipY: 0, hipBob: 0.012, hipSway: 0.02, spineLean: 0.08, spineTwist: 0.12, headPitch: 0.26, headYaw: 0.22, headBob: 0.04, armSwingL: 0.08, armSwingR: 0.08, armLiftL: -0.88, armLiftR: -0.88, armOutL: 0.18, armOutR: -0.18, elbowL: -1.12, elbowR: -1.12, legStride: 0, kneeLift: 0, gestureFreq: 0.9 },
      { base: 'boardwalk_groove', hz: 1.9, hipY: -0.02, hipBob: 0.048, hipSway: 0.09, spineLean: 0.02, spineTwist: 0.2, headPitch: 0.04, headYaw: 0.16, headBob: 0.12, armSwingL: 0.42, armSwingR: 0.42, armLiftL: -0.75, armLiftR: -0.75, armOutL: 0.34, armOutR: -0.34, elbowL: -1.1, elbowR: -1.1, legStride: 0.12, kneeLift: 0.18, gestureFreq: 2.2 },
    ],
  },
  {
    // 10 * 5 * 6 = 300 combat_stance animations
    category: 'combat_stance',
    styles: STYLES_GEN,
    moods: MOODS_GEN,
    actions: [
      { base: 'pistol_weaver', hz: 0.9, hipY: -0.06, hipBob: 0.014, hipSway: 0.015, spineLean: 0.08, spineTwist: 0.12, headPitch: -0.02, headYaw: 0.02, headBob: 0.01, armSwingL: 0.03, armSwingR: 0.03, armLiftL: -1.32, armLiftR: -1.48, armOutL: -0.32, armOutR: 0.08, elbowL: -0.45, elbowR: -0.12, legStride: 0.2, kneeLift: 0.15, gestureFreq: 0.8 },
      { base: 'pistol_isosceles', hz: 0.85, hipY: -0.07, hipBob: 0.012, hipSway: 0.01, spineLean: 0.1, spineTwist: 0.04, headPitch: -0.02, headYaw: 0.0, headBob: 0.01, armSwingL: 0.02, armSwingR: 0.02, armLiftL: -1.42, armLiftR: -1.46, armOutL: -0.26, armOutR: 0.14, elbowL: -0.22, elbowR: -0.14, legStride: 0.18, kneeLift: 0.15, gestureFreq: 0.8 },
      { base: 'rifle_tactical', hz: 0.8, hipY: -0.09, hipBob: 0.015, hipSway: 0.012, spineLean: 0.14, spineTwist: 0.18, headPitch: 0.04, headYaw: -0.08, headBob: 0.01, armSwingL: 0.03, armSwingR: 0.03, armLiftL: -1.28, armLiftR: -1.45, armOutL: -0.44, armOutR: 0.06, elbowL: -0.78, elbowR: -0.28, legStride: 0.24, kneeLift: 0.18, gestureFreq: 0.8 },
      { base: 'rifle_low_ready', hz: 0.75, hipY: -0.05, hipBob: 0.014, hipSway: 0.016, spineLean: 0.09, spineTwist: 0.12, headPitch: 0.0, headYaw: 0.06, headBob: 0.015, armSwingL: 0.04, armSwingR: 0.04, armLiftL: -0.75, armLiftR: -0.82, armOutL: -0.32, armOutR: 0.08, elbowL: -0.85, elbowR: -0.55, legStride: 0.16, kneeLift: 0.12, gestureFreq: 0.8 },
      { base: 'shotgun_breach', hz: 0.95, hipY: -0.11, hipBob: 0.018, hipSway: 0.02, spineLean: 0.16, spineTwist: 0.22, headPitch: 0.02, headYaw: -0.1, headBob: 0.015, armSwingL: 0.04, armSwingR: 0.04, armLiftL: -1.18, armLiftR: -1.38, armOutL: -0.48, armOutR: 0.04, elbowL: -0.85, elbowR: -0.32, legStride: 0.28, kneeLift: 0.22, gestureFreq: 0.9 },
      { base: 'sniper_breath', hz: 0.4, hipY: -0.08, hipBob: 0.006, hipSway: 0.006, spineLean: 0.12, spineTwist: 0.24, headPitch: 0.06, headYaw: -0.12, headBob: 0.005, armSwingL: 0.01, armSwingR: 0.01, armLiftL: -1.36, armLiftR: -1.5, armOutL: -0.46, armOutR: 0.05, elbowL: -0.88, elbowR: -0.3, legStride: 0.22, kneeLift: 0.15, gestureFreq: 0.4 },
      { base: 'smg_hipfire', hz: 1.2, hipY: -0.08, hipBob: 0.02, hipSway: 0.025, spineLean: 0.12, spineTwist: 0.14, headPitch: 0.0, headYaw: 0.04, headBob: 0.02, armSwingL: 0.06, armSwingR: 0.06, armLiftL: -1.05, armLiftR: -1.25, armOutL: -0.36, armOutR: 0.08, elbowL: -0.92, elbowR: -0.45, legStride: 0.22, kneeLift: 0.18, gestureFreq: 1.3 },
      { base: 'rpg_shoulder', hz: 0.65, hipY: -0.12, hipBob: 0.015, hipSway: 0.018, spineLean: -0.06, spineTwist: 0.22, headPitch: -0.04, headYaw: -0.14, headBob: 0.01, armSwingL: 0.02, armSwingR: 0.02, armLiftL: -1.65, armLiftR: -1.72, armOutL: -0.35, armOutR: -0.18, elbowL: -1.12, elbowR: -1.05, legStride: 0.3, kneeLift: 0.24, gestureFreq: 0.6 },
      { base: 'revolver_duelist', hz: 0.85, hipY: -0.05, hipBob: 0.014, hipSway: 0.016, spineLean: 0.04, spineTwist: 0.25, headPitch: -0.02, headYaw: -0.16, headBob: 0.01, armSwingL: 0.04, armSwingR: 0.03, armLiftL: -0.22, armLiftR: -1.52, armOutL: 0.24, armOutR: 0.04, elbowL: -0.48, elbowR: -0.08, legStride: 0.22, kneeLift: 0.14, gestureFreq: 0.8 },
      { base: 'covert_silenced', hz: 0.7, hipY: -0.14, hipBob: 0.01, hipSway: 0.012, spineLean: 0.18, spineTwist: 0.12, headPitch: -0.04, headYaw: 0.04, headBob: 0.01, armSwingL: 0.02, armSwingR: 0.02, armLiftL: -1.35, armLiftR: -1.44, armOutL: -0.3, armOutR: 0.1, elbowL: -0.48, elbowR: -0.18, legStride: 0.24, kneeLift: 0.2, gestureFreq: 0.7 },
    ],
  },
  {
    // 9 * 5 * 6 = 270 weapon_actions animations
    category: 'weapon_actions',
    styles: STYLES_GEN,
    moods: MOODS_GEN,
    actions: [
      { base: 'draw_quick', hz: 2.8, hipY: -0.04, hipBob: 0.02, hipSway: 0.02, spineLean: 0.08, spineTwist: 0.16, headPitch: 0, headYaw: 0.05, headBob: 0.02, armSwingL: 0.2, armSwingR: 0.5, armLiftL: -0.6, armLiftR: -1.1, armOutL: 0.12, armOutR: -0.15, elbowL: -0.65, elbowR: -0.85, legStride: 0, kneeLift: 0, gestureFreq: 3.0 },
      { base: 'reload_tactical', hz: 1.9, hipY: -0.06, hipBob: 0.018, hipSway: 0.02, spineLean: 0.12, spineTwist: 0.14, headPitch: 0.18, headYaw: 0.08, headBob: 0.04, armSwingL: 0.35, armSwingR: 0.12, armLiftL: -0.95, armLiftR: -1.05, armOutL: -0.28, armOutR: 0.16, elbowL: -1.25, elbowR: -1.05, legStride: 0, kneeLift: 0, gestureFreq: 2.4 },
      { base: 'pump_rack', hz: 2.6, hipY: -0.08, hipBob: 0.025, hipSway: 0.02, spineLean: 0.14, spineTwist: 0.18, headPitch: 0.02, headYaw: -0.05, headBob: 0.03, armSwingL: 0.42, armSwingR: 0.08, armLiftL: -1.18, armLiftR: -1.32, armOutL: -0.44, armOutR: 0.06, elbowL: -0.95, elbowR: -0.35, legStride: 0, kneeLift: 0, gestureFreq: 3.2 },
      { base: 'bolt_cycle', hz: 2.2, hipY: -0.07, hipBob: 0.015, hipSway: 0.015, spineLean: 0.1, spineTwist: 0.2, headPitch: 0.06, headYaw: -0.08, headBob: 0.02, armSwingL: 0.06, armSwingR: 0.36, armLiftL: -1.32, armLiftR: -1.28, armOutL: -0.42, armOutR: -0.12, elbowL: -0.82, elbowR: -1.15, legStride: 0, kneeLift: 0, gestureFreq: 2.6 },
      { base: 'inspect_weapon', hz: 0.85, hipY: 0, hipBob: 0.01, hipSway: 0.018, spineLean: 0.04, spineTwist: 0.12, headPitch: 0.22, headYaw: -0.1, headBob: 0.03, armSwingL: 0.14, armSwingR: 0.18, armLiftL: -0.92, armLiftR: -1.05, armOutL: -0.22, armOutR: 0.18, elbowL: -1.15, elbowR: -1.2, legStride: 0, kneeLift: 0, gestureFreq: 1.1 },
      { base: 'chamber_check', hz: 1.4, hipY: -0.02, hipBob: 0.012, hipSway: 0.015, spineLean: 0.08, spineTwist: 0.1, headPitch: 0.2, headYaw: 0.05, headBob: 0.02, armSwingL: 0.24, armSwingR: 0.1, armLiftL: -1.02, armLiftR: -1.1, armOutL: -0.3, armOutR: 0.15, elbowL: -1.3, elbowR: -0.98, legStride: 0, kneeLift: 0, gestureFreq: 1.8 },
      { base: 'grenade_pin', hz: 2.0, hipY: -0.06, hipBob: 0.02, hipSway: 0.03, spineLean: 0.08, spineTwist: 0.24, headPitch: 0.08, headYaw: -0.1, headBob: 0.03, armSwingL: 0.22, armSwingR: 0.28, armLiftL: -1.05, armLiftR: -1.15, armOutL: -0.24, armOutR: 0.22, elbowL: -1.25, elbowR: -1.25, legStride: 0, kneeLift: 0, gestureFreq: 2.2 },
      { base: 'grenade_lob', hz: 3.0, hipY: -0.08, hipBob: 0.04, hipSway: 0.05, spineLean: 0.22, spineTwist: 0.45, headPitch: -0.12, headYaw: 0.15, headBob: 0.05, armSwingL: 0.35, armSwingR: 0.95, armLiftL: -0.5, armLiftR: -2.2, armOutL: 0.25, armOutR: -0.28, elbowL: -0.55, elbowR: -0.35, legStride: 0.3, kneeLift: 0.2, gestureFreq: 3.4 },
      { base: 'recoil_recover', hz: 3.5, hipY: -0.06, hipBob: 0.025, hipSway: 0.02, spineLean: -0.08, spineTwist: 0.1, headPitch: -0.12, headYaw: 0.04, headBob: 0.06, armSwingL: 0.14, armSwingR: 0.22, armLiftL: -1.48, armLiftR: -1.68, armOutL: -0.34, armOutR: 0.06, elbowL: -0.55, elbowR: -0.25, legStride: 0, kneeLift: 0, gestureFreq: 4.0 },
    ],
  },
  {
    // 8 * 5 * 6 = 240 melee_combos animations
    category: 'melee_combos',
    styles: STYLES_GEN,
    moods: MOODS_GEN,
    actions: [
      { base: 'jab_left', hz: 3.2, hipY: -0.08, hipBob: 0.03, hipSway: 0.04, spineLean: 0.14, spineTwist: -0.38, headPitch: 0.04, headYaw: 0.1, headBob: 0.03, armSwingL: 0.85, armSwingR: 0.15, armLiftL: -1.55, armLiftR: -0.95, armOutL: 0.08, armOutR: -0.18, elbowL: -0.18, elbowR: -1.35, legStride: 0.28, kneeLift: 0.2, gestureFreq: 3.5 },
      { base: 'cross_right', hz: 3.0, hipY: -0.1, hipBob: 0.035, hipSway: 0.05, spineLean: 0.18, spineTwist: 0.48, headPitch: 0.04, headYaw: -0.12, headBob: 0.04, armSwingL: 0.18, armSwingR: 0.98, armLiftL: -0.92, armLiftR: -1.62, armOutL: 0.18, armOutR: -0.08, elbowL: -1.35, elbowR: -0.16, legStride: 0.34, kneeLift: 0.24, gestureFreq: 3.4 },
      { base: 'uppercut_heavy', hz: 2.6, hipY: -0.16, hipBob: 0.07, hipSway: 0.06, spineLean: -0.06, spineTwist: 0.42, headPitch: -0.12, headYaw: -0.08, headBob: 0.06, armSwingL: 0.25, armSwingR: 1.05, armLiftL: -0.82, armLiftR: -1.95, armOutL: 0.22, armOutR: 0.12, elbowL: -1.25, elbowR: -0.95, legStride: 0.32, kneeLift: 0.28, gestureFreq: 2.9 },
      { base: 'bat_forehand', hz: 2.5, hipY: -0.1, hipBob: 0.04, hipSway: 0.06, spineLean: 0.14, spineTwist: 0.65, headPitch: 0.02, headYaw: -0.18, headBob: 0.04, armSwingL: 0.65, armSwingR: 0.95, armLiftL: -1.35, armLiftR: -1.55, armOutL: -0.25, armOutR: -0.45, elbowL: -0.58, elbowR: -0.42, legStride: 0.38, kneeLift: 0.26, gestureFreq: 2.8 },
      { base: 'bat_overhead', hz: 2.3, hipY: -0.08, hipBob: 0.05, hipSway: 0.04, spineLean: 0.24, spineTwist: 0.24, headPitch: 0.06, headYaw: 0.04, headBob: 0.05, armSwingL: 0.75, armSwingR: 0.92, armLiftL: -2.25, armLiftR: -2.35, armOutL: -0.18, armOutR: 0.18, elbowL: -0.45, elbowR: -0.42, legStride: 0.32, kneeLift: 0.24, gestureFreq: 2.6 },
      { base: 'katana_diag_slash', hz: 3.1, hipY: -0.14, hipBob: 0.045, hipSway: 0.07, spineLean: 0.22, spineTwist: 0.72, headPitch: 0.04, headYaw: -0.2, headBob: 0.04, armSwingL: 0.72, armSwingR: 1.08, armLiftL: -1.48, armLiftR: -1.88, armOutL: -0.35, armOutR: -0.38, elbowL: -0.52, elbowR: -0.32, legStride: 0.44, kneeLift: 0.34, gestureFreq: 3.4 },
      { base: 'katana_horiz_sweep', hz: 3.2, hipY: -0.15, hipBob: 0.035, hipSway: 0.08, spineLean: 0.16, spineTwist: 0.8, headPitch: 0.02, headYaw: -0.24, headBob: 0.03, armSwingL: 0.62, armSwingR: 1.02, armLiftL: -1.25, armLiftR: -1.35, armOutL: -0.42, armOutR: -0.52, elbowL: -0.45, elbowR: -0.22, legStride: 0.42, kneeLift: 0.3, gestureFreq: 3.5 },
      { base: 'katana_flourish', hz: 1.8, hipY: -0.06, hipBob: 0.02, hipSway: 0.04, spineLean: 0.04, spineTwist: 0.35, headPitch: -0.04, headYaw: 0.14, headBob: 0.03, armSwingL: 0.25, armSwingR: 0.65, armLiftL: -0.42, armLiftR: -1.42, armOutL: 0.28, armOutR: -0.42, elbowL: -0.68, elbowR: -0.48, legStride: 0.18, kneeLift: 0.14, gestureFreq: 2.2 },
    ],
  },
  {
    // 9 * 5 * 6 = 270 hit_reactions animations
    category: 'hit_reactions',
    styles: STYLES_GEN,
    moods: MOODS_GEN,
    actions: [
      { base: 'flinch_head', hz: 3.6, hipY: -0.06, hipBob: 0.03, hipSway: 0.05, spineLean: -0.32, spineTwist: 0.22, headPitch: -0.55, headYaw: 0.38, headBob: 0.15, armSwingL: 0.35, armSwingR: 0.35, armLiftL: -1.45, armLiftR: -1.35, armOutL: 0.35, armOutR: -0.35, elbowL: -1.35, elbowR: -1.25, legStride: 0.18, kneeLift: 0.15, gestureFreq: 3.6 },
      { base: 'flinch_chest', hz: 3.4, hipY: -0.1, hipBob: 0.04, hipSway: 0.04, spineLean: -0.38, spineTwist: 0.18, headPitch: -0.35, headYaw: 0.15, headBob: 0.12, armSwingL: 0.42, armSwingR: 0.42, armLiftL: -0.95, armLiftR: -0.95, armOutL: 0.45, armOutR: -0.45, elbowL: -0.82, elbowR: -0.82, legStride: 0.24, kneeLift: 0.2, gestureFreq: 3.4 },
      { base: 'flinch_gut', hz: 3.2, hipY: -0.18, hipBob: 0.04, hipSway: 0.03, spineLean: 0.48, spineTwist: 0.1, headPitch: 0.38, headYaw: 0.08, headBob: 0.1, armSwingL: 0.25, armSwingR: 0.25, armLiftL: -0.78, armLiftR: -0.78, armOutL: -0.3, armOutR: 0.3, elbowL: -1.45, elbowR: -1.45, legStride: 0.2, kneeLift: 0.28, gestureFreq: 3.2 },
      { base: 'flinch_shoulder_l', hz: 3.5, hipY: -0.08, hipBob: 0.03, hipSway: 0.07, spineLean: -0.16, spineTwist: -0.45, headPitch: -0.15, headYaw: -0.35, headBob: 0.1, armSwingL: 0.52, armSwingR: 0.24, armLiftL: -1.15, armLiftR: -0.65, armOutL: 0.55, armOutR: -0.25, elbowL: -1.1, elbowR: -0.75, legStride: 0.22, kneeLift: 0.18, gestureFreq: 3.5 },
      { base: 'flinch_shoulder_r', hz: 3.5, hipY: -0.08, hipBob: 0.03, hipSway: -0.07, spineLean: -0.16, spineTwist: 0.45, headPitch: -0.15, headYaw: 0.35, headBob: 0.1, armSwingL: 0.24, armSwingR: 0.52, armLiftL: -0.65, armLiftR: -1.15, armOutL: 0.25, armOutR: -0.55, elbowL: -0.75, elbowR: -1.1, legStride: 0.22, kneeLift: 0.18, gestureFreq: 3.5 },
      { base: 'stagger_back', hz: 2.6, hipY: -0.14, hipBob: 0.055, hipSway: 0.09, spineLean: -0.26, spineTwist: 0.28, headPitch: -0.22, headYaw: 0.22, headBob: 0.1, armSwingL: 0.55, armSwingR: 0.55, armLiftL: -0.85, armLiftR: -0.92, armOutL: 0.58, armOutR: -0.58, elbowL: -0.65, elbowR: -0.65, legStride: -0.42, kneeLift: 0.35, gestureFreq: 2.8 },
      { base: 'knee_buckle', hz: 2.8, hipY: -0.32, hipBob: 0.04, hipSway: 0.06, spineLean: 0.3, spineTwist: 0.15, headPitch: 0.25, headYaw: 0.12, headBob: 0.08, armSwingL: 0.3, armSwingR: 0.3, armLiftL: -0.55, armLiftR: -0.55, armOutL: 0.38, armOutR: -0.38, elbowL: -0.95, elbowR: -0.95, legStride: 0.26, kneeLift: 0.65, gestureFreq: 2.8 },
      { base: 'blast_brace', hz: 2.4, hipY: -0.26, hipBob: 0.03, hipSway: 0.05, spineLean: 0.28, spineTwist: 0.22, headPitch: 0.32, headYaw: -0.25, headBob: 0.06, armSwingL: 0.2, armSwingR: 0.2, armLiftL: -1.78, armLiftR: -1.78, armOutL: -0.24, armOutR: 0.24, elbowL: -1.55, elbowR: -1.55, legStride: 0.24, kneeLift: 0.45, gestureFreq: 2.4 },
      { base: 'graze_duck', hz: 3.1, hipY: -0.24, hipBob: 0.035, hipSway: 0.05, spineLean: 0.38, spineTwist: 0.2, headPitch: 0.22, headYaw: 0.25, headBob: 0.08, armSwingL: 0.28, armSwingR: 0.28, armLiftL: -1.25, armLiftR: -1.25, armOutL: 0.32, armOutR: -0.32, elbowL: -1.22, elbowR: -1.22, legStride: 0.22, kneeLift: 0.42, gestureFreq: 3.1 },
    ],
  },
  {
    // 8 * 5 * 6 = 240 panic_flee animations
    category: 'panic_flee',
    styles: STYLES_GEN,
    moods: MOODS_GEN,
    actions: [
      { base: 'sprint_terror', hz: 3.6, hipY: -0.08, hipBob: 0.09, hipSway: 0.09, spineLean: 0.32, spineTwist: 0.24, headPitch: -0.05, headYaw: 0.25, headBob: 0.08, armSwingL: 0.95, armSwingR: 0.95, armLiftL: -1.15, armLiftR: -1.15, armOutL: 0.42, armOutR: -0.42, elbowL: -1.35, elbowR: -1.35, legStride: 1.05, kneeLift: 1.15, gestureFreq: 3.8 },
      { base: 'hands_up_surrender', hz: 1.1, hipY: -0.04, hipBob: 0.018, hipSway: 0.03, spineLean: -0.06, spineTwist: 0.06, headPitch: 0.06, headYaw: 0.2, headBob: 0.05, armSwingL: 0.14, armSwingR: 0.14, armLiftL: -2.45, armLiftR: -2.45, armOutL: 0.38, armOutR: -0.38, elbowL: -0.48, elbowR: -0.48, legStride: 0, kneeLift: 0, gestureFreq: 1.6 },
      { base: 'crouch_cower', hz: 1.8, hipY: -0.42, hipBob: 0.025, hipSway: 0.04, spineLean: 0.44, spineTwist: 0.08, headPitch: 0.38, headYaw: 0.18, headBob: 0.08, armSwingL: 0.16, armSwingR: 0.16, armLiftL: -1.95, armLiftR: -1.95, armOutL: -0.18, armOutR: 0.18, elbowL: -1.62, elbowR: -1.62, legStride: 0.1, kneeLift: 0.85, gestureFreq: 2.4 },
      { base: 'glance_back_run', hz: 3.3, hipY: -0.06, hipBob: 0.08, hipSway: 0.08, spineLean: 0.26, spineTwist: 0.38, headPitch: 0.0, headYaw: 0.65, headBob: 0.06, armSwingL: 0.85, armSwingR: 0.85, armLiftL: -0.45, armLiftR: -0.45, armOutL: 0.28, armOutR: -0.28, elbowL: -1.22, elbowR: -1.22, legStride: 0.96, kneeLift: 1.02, gestureFreq: 3.3 },
      { base: 'shield_head_run', hz: 3.2, hipY: -0.14, hipBob: 0.07, hipSway: 0.07, spineLean: 0.36, spineTwist: 0.16, headPitch: 0.26, headYaw: 0.15, headBob: 0.05, armSwingL: 0.35, armSwingR: 0.35, armLiftL: -2.05, armLiftR: -2.05, armOutL: 0.22, armOutR: -0.22, elbowL: -1.48, elbowR: -1.48, legStride: 0.88, kneeLift: 0.95, gestureFreq: 3.2 },
      { base: 'wave_help', hz: 2.2, hipY: 0, hipBob: 0.03, hipSway: 0.05, spineLean: -0.02, spineTwist: 0.14, headPitch: -0.06, headYaw: 0.28, headBob: 0.08, armSwingL: 0.55, armSwingR: 0.55, armLiftL: -2.3, armLiftR: -2.3, armOutL: 0.55, armOutR: -0.55, elbowL: -0.45, elbowR: -0.45, legStride: 0.1, kneeLift: 0.1, gestureFreq: 3.0 },
      { base: 'freeze_shock', hz: 0.9, hipY: -0.06, hipBob: 0.012, hipSway: 0.02, spineLean: -0.08, spineTwist: 0.06, headPitch: -0.04, headYaw: 0.16, headBob: 0.04, armSwingL: 0.08, armSwingR: 0.08, armLiftL: -1.05, armLiftR: -1.05, armOutL: 0.34, armOutR: -0.34, elbowL: -1.18, elbowR: -1.18, legStride: 0, kneeLift: 0, gestureFreq: 1.4 },
      { base: 'frantic_zigzag', hz: 3.7, hipY: -0.09, hipBob: 0.085, hipSway: 0.14, spineLean: 0.3, spineTwist: 0.32, headPitch: 0.04, headYaw: 0.34, headBob: 0.07, armSwingL: 1.0, armSwingR: 1.0, armLiftL: -0.78, armLiftR: -0.78, armOutL: 0.45, armOutR: -0.45, elbowL: -1.28, elbowR: -1.28, legStride: 1.0, kneeLift: 1.08, gestureFreq: 3.8 },
    ],
  },
  {
    // 7 * 5 * 6 = 210 parkour_stunts animations
    category: 'parkour_stunts',
    styles: STYLES_GEN,
    moods: MOODS_GEN,
    actions: [
      { base: 'jump_launch', hz: 2.2, hipY: 0.06, hipBob: 0.04, hipSway: 0.02, spineLean: 0.16, spineTwist: 0.08, headPitch: -0.1, headYaw: 0.04, headBob: 0.02, armSwingL: 0.45, armSwingR: 0.45, armLiftL: -1.35, armLiftR: -1.35, armOutL: 0.32, armOutR: -0.32, elbowL: -0.75, elbowR: -0.75, legStride: 0.55, kneeLift: 0.95, gestureFreq: 2.2 },
      { base: 'air_tuck', hz: 1.8, hipY: -0.04, hipBob: 0.03, hipSway: 0.03, spineLean: 0.22, spineTwist: 0.1, headPitch: 0.08, headYaw: 0.06, headBob: 0.02, armSwingL: 0.28, armSwingR: 0.28, armLiftL: -0.88, armLiftR: -0.88, armOutL: 0.44, armOutR: -0.44, elbowL: -0.95, elbowR: -0.95, legStride: 0.58, kneeLift: 1.12, gestureFreq: 1.8 },
      { base: 'heavy_land', hz: 2.4, hipY: -0.36, hipBob: 0.04, hipSway: 0.03, spineLean: 0.36, spineTwist: 0.08, headPitch: 0.14, headYaw: 0.04, headBob: 0.05, armSwingL: 0.35, armSwingR: 0.35, armLiftL: -0.45, armLiftR: -0.45, armOutL: 0.48, armOutR: -0.48, elbowL: -0.75, elbowR: -0.75, legStride: 0.36, kneeLift: 0.92, gestureFreq: 2.4 },
      { base: 'combat_slide', hz: 1.5, hipY: -0.58, hipBob: 0.015, hipSway: 0.04, spineLean: -0.42, spineTwist: 0.22, headPitch: 0.24, headYaw: -0.1, headBob: 0.02, armSwingL: 0.12, armSwingR: 0.12, armLiftL: -0.75, armLiftR: -0.95, armOutL: 0.52, armOutR: -0.38, elbowL: -0.65, elbowR: -0.85, legStride: 0.95, kneeLift: 1.15, gestureFreq: 1.6 },
      { base: 'curb_vault', hz: 2.8, hipY: 0.02, hipBob: 0.05, hipSway: 0.06, spineLean: 0.38, spineTwist: 0.25, headPitch: -0.05, headYaw: 0.08, headBob: 0.03, armSwingL: 0.55, armSwingR: 0.45, armLiftL: -1.15, armLiftR: -0.85, armOutL: 0.28, armOutR: -0.36, elbowL: -0.55, elbowR: -0.75, legStride: 0.78, kneeLift: 1.18, gestureFreq: 2.8 },
      { base: 'sprint_pivot', hz: 3.0, hipY: -0.12, hipBob: 0.04, hipSway: 0.12, spineLean: 0.24, spineTwist: 0.36, headPitch: 0.02, headYaw: 0.24, headBob: 0.03, armSwingL: 0.65, armSwingR: 0.65, armLiftL: -0.35, armLiftR: -0.35, armOutL: 0.42, armOutR: -0.42, elbowL: -1.05, elbowR: -1.05, legStride: 0.68, kneeLift: 0.82, gestureFreq: 3.0 },
      { base: 'drop_crouch', hz: 2.2, hipY: -0.38, hipBob: 0.025, hipSway: 0.02, spineLean: 0.34, spineTwist: 0.1, headPitch: -0.14, headYaw: 0.06, headBob: 0.02, armSwingL: 0.2, armSwingR: 0.2, armLiftL: -0.48, armLiftR: -0.55, armOutL: 0.22, armOutR: -0.22, elbowL: -0.95, elbowR: -0.95, legStride: 0.25, kneeLift: 0.88, gestureFreq: 2.2 },
    ],
  },
  {
    // 7 * 5 * 6 = 210 vehicle_flight animations
    category: 'vehicle_flight',
    styles: STYLES_GEN,
    moods: MOODS_GEN,
    actions: [
      { base: 'steer_cruise', hz: 0.7, hipY: -0.4, hipBob: 0.01, hipSway: 0.02, spineLean: -0.05, spineTwist: 0.04, headPitch: 0.0, headYaw: 0.08, headBob: 0.02, armSwingL: 0.08, armSwingR: 0.08, armLiftL: -1.08, armLiftR: -1.08, armOutL: -0.18, armOutR: 0.18, elbowL: -0.68, elbowR: -0.68, legStride: 0.1, kneeLift: 1.38, gestureFreq: 0.8 },
      { base: 'steer_drift', hz: 1.4, hipY: -0.4, hipBob: 0.018, hipSway: 0.08, spineLean: 0.04, spineTwist: 0.18, headPitch: -0.02, headYaw: 0.24, headBob: 0.03, armSwingL: 0.26, armSwingR: 0.26, armLiftL: -1.18, armLiftR: -1.18, armOutL: -0.26, armOutR: 0.26, elbowL: -0.78, elbowR: -0.78, legStride: 0.1, kneeLift: 1.4, gestureFreq: 1.8 },
      { base: 'gear_shift', hz: 1.8, hipY: -0.4, hipBob: 0.012, hipSway: 0.03, spineLean: 0.04, spineTwist: 0.12, headPitch: 0.06, headYaw: 0.06, headBob: 0.02, armSwingL: 0.05, armSwingR: 0.32, armLiftL: -1.12, armLiftR: -0.68, armOutL: -0.16, armOutR: 0.24, elbowL: -0.65, elbowR: -0.92, legStride: 0.12, kneeLift: 1.38, gestureFreq: 2.0 },
      { base: 'horn_slam', hz: 2.2, hipY: -0.4, hipBob: 0.015, hipSway: 0.02, spineLean: 0.12, spineTwist: 0.06, headPitch: 0.02, headYaw: 0.05, headBob: 0.04, armSwingL: 0.08, armSwingR: 0.35, armLiftL: -1.1, armLiftR: -1.25, armOutL: -0.18, armOutR: 0.28, elbowL: -0.68, elbowR: -0.48, legStride: 0.1, kneeLift: 1.38, gestureFreq: 2.5 },
      { base: 'reverse_look', hz: 0.8, hipY: -0.4, hipBob: 0.01, hipSway: 0.04, spineLean: -0.04, spineTwist: 0.48, headPitch: 0.0, headYaw: 0.58, headBob: 0.02, armSwingL: 0.08, armSwingR: 0.08, armLiftL: -1.15, armLiftR: -0.58, armOutL: -0.2, armOutR: -0.45, elbowL: -0.62, elbowR: -0.55, legStride: 0.1, kneeLift: 1.38, gestureFreq: 0.9 },
      { base: 'flight_yoke_pull', hz: 0.9, hipY: -0.42, hipBob: 0.014, hipSway: 0.05, spineLean: -0.1, spineTwist: 0.08, headPitch: -0.08, headYaw: 0.12, headBob: 0.02, armSwingL: 0.12, armSwingR: 0.16, armLiftL: -0.95, armLiftR: -1.05, armOutL: -0.16, armOutR: 0.14, elbowL: -0.92, elbowR: -0.88, legStride: 0.12, kneeLift: 1.35, gestureFreq: 1.1 },
      { base: 'flight_bank_g', hz: 1.1, hipY: -0.42, hipBob: 0.016, hipSway: 0.12, spineLean: -0.06, spineTwist: 0.16, headPitch: -0.06, headYaw: 0.22, headBob: 0.03, armSwingL: 0.18, armSwingR: 0.18, armLiftL: -1.02, armLiftR: -1.08, armOutL: -0.22, armOutR: 0.22, elbowL: -0.95, elbowR: -0.85, legStride: 0.12, kneeLift: 1.35, gestureFreq: 1.3 },
    ],
  },
  {
    // 6 * 5 * 6 = 180 street_emotes animations
    category: 'street_emotes',
    styles: STYLES_GEN,
    moods: MOODS_GEN,
    actions: [
      { base: 'hype_dance', hz: 2.2, hipY: -0.04, hipBob: 0.065, hipSway: 0.12, spineLean: 0.05, spineTwist: 0.28, headPitch: 0.04, headYaw: 0.16, headBob: 0.16, armSwingL: 0.62, armSwingR: 0.62, armLiftL: -1.15, armLiftR: -1.15, armOutL: 0.48, armOutR: -0.48, elbowL: -1.25, elbowR: -1.25, legStride: 0.22, kneeLift: 0.32, gestureFreq: 2.6 },
      { base: 'clap_rhythm', hz: 2.4, hipY: 0, hipBob: 0.024, hipSway: 0.04, spineLean: 0.02, spineTwist: 0.08, headPitch: 0.02, headYaw: 0.1, headBob: 0.1, armSwingL: 0.25, armSwingR: 0.25, armLiftL: -1.05, armLiftR: -1.05, armOutL: -0.32, armOutR: 0.32, elbowL: -1.15, elbowR: -1.15, legStride: 0, kneeLift: 0, gestureFreq: 3.4 },
      { base: 'salute_crisp', hz: 0.9, hipY: 0, hipBob: 0.008, hipSway: 0.01, spineLean: -0.04, spineTwist: 0.04, headPitch: -0.04, headYaw: 0.04, headBob: 0.02, armSwingL: 0.02, armSwingR: 0.05, armLiftL: 0, armLiftR: -2.05, armOutL: 0.06, armOutR: -0.32, elbowL: -0.1, elbowR: -1.85, legStride: 0, kneeLift: 0, gestureFreq: 1.0 },
      { base: 'fist_pump', hz: 2.0, hipY: -0.02, hipBob: 0.042, hipSway: 0.05, spineLean: -0.05, spineTwist: 0.16, headPitch: -0.1, headYaw: 0.12, headBob: 0.12, armSwingL: 0.18, armSwingR: 0.62, armLiftL: -0.32, armLiftR: -2.18, armOutL: 0.18, armOutR: -0.28, elbowL: -0.65, elbowR: -0.82, legStride: 0.1, kneeLift: 0.12, gestureFreq: 2.5 },
      { base: 'shrug_confused', hz: 1.1, hipY: 0, hipBob: 0.015, hipSway: 0.03, spineLean: -0.02, spineTwist: 0.08, headPitch: 0.04, headYaw: 0.24, headBob: 0.06, armSwingL: 0.18, armSwingR: 0.18, armLiftL: -0.78, armLiftR: -0.78, armOutL: 0.48, armOutR: -0.48, elbowL: -1.08, elbowR: -1.08, legStride: 0, kneeLift: 0, gestureFreq: 1.4 },
      { base: 'cheer_crowd', hz: 2.3, hipY: 0.02, hipBob: 0.055, hipSway: 0.06, spineLean: -0.08, spineTwist: 0.14, headPitch: -0.14, headYaw: 0.14, headBob: 0.14, armSwingL: 0.48, armSwingR: 0.48, armLiftL: -2.42, armLiftR: -2.42, armOutL: 0.42, armOutR: -0.42, elbowL: -0.42, elbowR: -0.42, legStride: 0.12, kneeLift: 0.18, gestureFreq: 2.8 },
    ],
  },
];

function hashSeed(n: number): number {
  let x = (n * 1664525 + 1013904223) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

function buildCatalog(): {
  clips: AnimationClip[];
  byName: Map<string, AnimationClip>;
  byCategory: Record<AnimationCategory, AnimationClip[]>;
} {
  const clips: AnimationClip[] = [];
  const byName = new Map<string, AnimationClip>();
  const byCategory: Record<AnimationCategory, AnimationClip[]> = {
    locomotion: [],
    urban_idle: [],
    speaking: [],
    tourist_beach: [],
    combat_stance: [],
    weapon_actions: [],
    melee_combos: [],
    hit_reactions: [],
    panic_flee: [],
    parkour_stunts: [],
    vehicle_flight: [],
    street_emotes: [],
  };

  let id = 0;
  for (const bp of BLUEPRINTS) {
    for (let ai = 0; ai < bp.actions.length; ai++) {
      const a = bp.actions[ai];
      for (let si = 0; si < bp.styles.length; si++) {
        const style = bp.styles[si];
        for (let mi = 0; mi < bp.moods.length; mi++) {
          const mood = bp.moods[mi];
          const r1 = hashSeed(id * 11 + 1) - 0.5;
          const r2 = hashSeed(id * 11 + 3) - 0.5;
          const r3 = hashSeed(id * 11 + 5) - 0.5;
          const r4 = hashSeed(id * 11 + 7) - 0.5;
          const styleMul = 0.84 + (si / Math.max(1, bp.styles.length - 1)) * 0.34;
          const moodMul = 0.88 + (mi / Math.max(1, bp.moods.length - 1)) * 0.24;
          const name = `${bp.category}_${a.base}_${style}_${mood}`;

          const clip: AnimationClip = {
            id,
            name,
            category: bp.category,
            baseAction: a.base,
            variant: `${style}_${mood}`,
            cycleHz: +(a.hz * styleMul * (0.94 + r1 * 0.14)).toFixed(3),
            hipY: +(a.hipY + r2 * 0.015).toFixed(4),
            hipBob: +(a.hipBob * moodMul).toFixed(4),
            hipSway: +(a.hipSway * styleMul).toFixed(4),
            spineLean: +(a.spineLean + r3 * 0.06).toFixed(4),
            spineTwist: +(a.spineTwist * styleMul).toFixed(4),
            headPitch: +(a.headPitch + r4 * 0.08).toFixed(4),
            headYaw: +(a.headYaw * moodMul + r1 * 0.06).toFixed(4),
            headBob: +(a.headBob * moodMul).toFixed(4),
            armSwingL: +(a.armSwingL * styleMul).toFixed(4),
            armSwingR: +(a.armSwingR * moodMul).toFixed(4),
            armLiftL: +(a.armLiftL + r2 * 0.12).toFixed(4),
            armLiftR: +(a.armLiftR + r3 * 0.12).toFixed(4),
            armOutL: +(a.armOutL + r4 * 0.06).toFixed(4),
            armOutR: +(a.armOutR - r4 * 0.06).toFixed(4),
            elbowL: +(a.elbowL + r1 * 0.12).toFixed(4),
            elbowR: +(a.elbowR + r2 * 0.12).toFixed(4),
            legStride: +(a.legStride * styleMul).toFixed(4),
            kneeLift: +(a.kneeLift * moodMul).toFixed(4),
            gestureFreq: +(a.gestureFreq * (0.9 + Math.abs(r3) * 0.35)).toFixed(3),
            asymmetry: +(r1 * 0.22).toFixed(4),
          };
          clips.push(clip);
          byName.set(name, clip);
          byCategory[bp.category].push(clip);
          id++;
        }
      }
    }
  }
  return { clips, byName, byCategory };
}

const CATALOG = buildCatalog();

export const ANIMATION_CLIPS: readonly AnimationClip[] = CATALOG.clips;
export const ANIMATION_COUNT = CATALOG.clips.length; // 3,240 unique animations!
export const ANIMATION_CATEGORIES: readonly AnimationCategory[] = Object.keys(CATALOG.byCategory) as AnimationCategory[];

export function getAnimationById(id: number): AnimationClip {
  const len = ANIMATION_CLIPS.length;
  return ANIMATION_CLIPS[((Math.floor(id) % len) + len) % len];
}

export function getAnimationByName(name: string): AnimationClip | undefined {
  return CATALOG.byName.get(name);
}

export function getAnimationsInCategory(cat: AnimationCategory): readonly AnimationClip[] {
  return CATALOG.byCategory[cat];
}

export interface AnimationContext {
  entitySeed: number;
  speed: number;
  isPlayer?: boolean;
  crouch?: boolean;
  slide?: boolean;
  airborne?: boolean;
  aim?: number;
  punch?: number;
  recoil?: number;
  flinch?: number;
  panic?: boolean;
  photo?: boolean;
  speaking?: boolean;
  inVehicle?: boolean;
  inAircraft?: boolean;
  onSand?: boolean;
  isTourist?: boolean;
  weaponKind?: string | null;
  idleEpoch?: number;
}

const CALM_NPC_IDLES = ['stand_breathe', 'look_around', 'cross_arms', 'lean_cool', 'tap_foot_wait'] as const;

/** Deterministically selects the best context-driven animation clip from the 3,240+ catalog. */
export function selectContextAnimation(ctx: AnimationContext): AnimationClip {
  const pick = (cat: AnimationCategory, filterPrefix?: string, offset = 0): AnimationClip => {
    const pool = CATALOG.byCategory[cat];
    const filtered = filterPrefix ? pool.filter((c) => c.baseAction.startsWith(filterPrefix)) : pool;
    const arr = filtered.length > 0 ? filtered : pool;
    const idx = Math.abs(Math.floor(ctx.entitySeed * 31 + offset * 7)) % arr.length;
    return arr[idx];
  };

  if (ctx.inAircraft) return pick('vehicle_flight', 'flight_');
  if (ctx.inVehicle) return pick('vehicle_flight', ctx.speed > 18 ? 'steer_drift' : 'steer_cruise');
  if ((ctx.flinch ?? 0) > 0.15) return pick('hit_reactions', undefined, ctx.idleEpoch ?? 0);
  if (ctx.slide) return pick('parkour_stunts', 'combat_slide');
  if (ctx.airborne) return pick('parkour_stunts', 'air_tuck');
  if ((ctx.punch ?? 0) > 0.01) {
    const pref = ctx.weaponKind === 'katana' ? 'katana_' : ctx.weaponKind === 'bat' ? 'bat_' : 'cross_';
    return pick('melee_combos', pref, ctx.idleEpoch ?? 0);
  }
  if ((ctx.recoil ?? 0) > 0.25) return pick('weapon_actions', 'recoil_recover');
  if ((ctx.aim ?? 0) > 0.25) {
    const w = ctx.weaponKind ?? 'pistol';
    const pref = w === 'rpg'
      ? 'rpg_'
      : w === 'sniper'
        ? 'sniper_'
        : w === 'shotgun' || w === 'autoshotgun'
          ? 'shotgun_'
          : w === 'rifle' || w === 'carbine' || w === 'lmg'
            ? 'rifle_'
            : w === 'smg'
              ? 'smg_'
              : w === 'revolver'
                ? 'revolver_'
                : w === 'silenced'
                  ? 'covert_'
                  : 'pistol_';
    return pick('combat_stance', pref);
  }
  if (ctx.panic) {
    return ctx.speed > 0.6
      ? pick('panic_flee', 'sprint_terror')
      : pick('panic_flee', 'hands_up');
  }
  if (ctx.photo) return pick('tourist_beach', 'snap_photo', ctx.idleEpoch ?? 0);
  if (ctx.speaking && ctx.speed < 1.2) return pick('speaking', undefined, ctx.idleEpoch ?? 0);
  if (ctx.speed > 0.28) {
    if (ctx.crouch) return pick('locomotion', 'crouch_walk');
    if (ctx.onSand && ctx.speed < 4.5) return pick('locomotion', 'sand_trudge');
    if (ctx.speed > 6.2) return pick('locomotion', 'sprint_full');
    if (ctx.speed > 3.6) return pick('locomotion', 'jog_steady');
    if (ctx.isTourist) return pick('locomotion', 'beach_stroll');
    return pick('locomotion', 'walk_');
  }
  if (ctx.crouch) return pick('parkour_stunts', 'drop_crouch');
  // Player always holds a calm, natural standing breathing/scan idle (never randomly loops emotes/stretches)
  if (ctx.isPlayer) return pick('urban_idle', 'stand_breathe', 0);
  if (ctx.isTourist) return pick('tourist_beach', 'admire_skyline', ctx.idleEpoch ?? 0);
  // Standing NPCs stick to calm, realistic urban postures without abrupt random dancing/stretching loops
  const calmAction = CALM_NPC_IDLES[Math.abs(ctx.entitySeed + (ctx.idleEpoch ?? 0)) % CALM_NPC_IDLES.length];
  return pick('urban_idle', calmAction, ctx.idleEpoch ?? 0);
}

/** Evaluates a clip at time `t` (seconds) into smooth anatomical joint rotations. */
export function evaluateAnimationPose(
  clip: AnimationClip,
  t: number,
  speedScale = 1,
  speakingBoost = 0,
): EvaluatedPose {
  const w = t * Math.PI * 2 * clip.cycleHz * Math.max(0.55, Math.min(1.85, speedScale));
  const gw = t * Math.PI * 2 * clip.gestureFreq;
  const s1 = Math.sin(w);
  const c1 = Math.cos(w);
  const s2 = Math.sin(w * 2);
  const sg = Math.sin(gw);
  const cg = Math.cos(gw * 0.73 + clip.asymmetry * 3.1);

  const stride = clip.legStride;
  const knee = clip.kneeLift;
  const hipBob = clip.hipBob * (stride > 0.05 ? Math.abs(s1) : 0.5 + 0.5 * s1);
  const hipRoll = clip.hipSway * s1;

  const legLx = stride * s1;
  const legRx = -stride * s1;
  const shinLx = stride > 0.05 ? Math.max(0, -c1) * knee : knee * 0.45;
  const shinRx = stride > 0.05 ? Math.max(0, c1) * knee : knee * 0.45;

  const speakWave = speakingBoost * (0.28 * Math.sin(t * 7.2) + 0.14 * Math.cos(t * 4.1));
  const armLx = clip.armLiftL - clip.armSwingL * s1 + sg * (stride < 0.05 ? clip.armSwingL * 0.65 : 0.04) - speakWave * 0.6;
  const armRx = clip.armLiftR + clip.armSwingR * s1 + cg * (stride < 0.05 ? clip.armSwingR * 0.65 : 0.04) + speakWave;

  const armLz = clip.armOutL + Math.abs(s1) * 0.04 + speakingBoost * 0.12 * Math.sin(t * 5.3);
  const armRz = clip.armOutR - Math.abs(s1) * 0.04 - speakingBoost * 0.12 * Math.cos(t * 4.8);

  const foreLx = clip.elbowL - (stride > 0.05 ? Math.max(0, s1) * 0.22 : Math.abs(sg) * 0.18) - speakingBoost * 0.18;
  const foreRx = clip.elbowR - (stride > 0.05 ? Math.max(0, -s1) * 0.22 : Math.abs(cg) * 0.18) - speakingBoost * 0.22;

  const spineX = clip.spineLean + s2 * 0.025;
  const spineY = clip.spineTwist * (stride > 0.05 ? -s1 : cg);

  const headX = clip.headPitch + clip.headBob * s2 + speakingBoost * 0.12 * Math.sin(t * 6.4);
  const headY = clip.headYaw * cg + speakingBoost * 0.14 * Math.sin(t * 2.9);

  return {
    hipY: clip.hipY + hipBob,
    hipRoll,
    spineX,
    spineY,
    headX,
    headY,
    armLx,
    armLz,
    armRx,
    armRz,
    foreLx,
    foreRx,
    legLx,
    legRx,
    shinLx,
    shinRx,
  };
}
