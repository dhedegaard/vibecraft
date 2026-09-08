import type * as THREE from 'three';

export type WeaponKind = 'axe' | 'gun';

/** Keyboard slot order: Digit1 selects the first, Digit2 the second. */
export const WEAPON_SLOTS: readonly WeaponKind[] = ['axe', 'gun'];

export const WEAPON_LABELS: Record<WeaponKind, string> = {
  axe: 'Axe',
  gun: 'Gun',
};

/**
 * What the player's right arm needs from a held weapon. The weapon owns its
 * action timing; the arm applies `angle` and holds it exactly while `armLocked`.
 */
export interface Weapon {
  /** Grip at the origin. Attached to the hand. */
  readonly model: THREE.Object3D;
  /** Shoulder angle (rotation.x) the holding arm should adopt this frame. */
  readonly angle: number;
  /** True while an action (swing, recoil) is in progress; a new one is refused. */
  readonly swinging: boolean;
  /** True when the arm should ignore the walk cycle and hold `angle` exactly. */
  readonly armLocked: boolean;
  /** Starts the action; returns false if one is already running. */
  swing(): boolean;
  /** Advances the action; returns true on the single frame it takes effect. */
  update(dt: number): boolean;
}
