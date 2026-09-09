import type * as THREE from 'three';
import type { ItemKind } from './items';

export type WeaponKind = 'axe' | 'bow';

/** Keyboard slot order: Digit1 selects the first, Digit2 the second. */
export const WEAPON_SLOTS: readonly WeaponKind[] = ['axe', 'bow'];

export const WEAPON_LABELS: Record<WeaponKind, string> = {
  axe: 'Axe',
  bow: 'Bow',
};

/** What a weapon did on the frame its action takes effect. `speed` is the projectile launch speed (m/s). */
export type WeaponAction = { kind: 'strike' } | { kind: 'fire'; origin: THREE.Vector3; speed: number };

export const STRIKE: WeaponAction = { kind: 'strike' };

/**
 * What a character's right arm needs from a held weapon. The weapon owns its
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
  /** Item consumed per action; absent for weapons that need no ammo. */
  readonly ammo?: ItemKind;
  /** Held-action progress 0–1 (a bow's draw); absent for weapons that cannot be held. */
  readonly draw?: number;
  /** Shoulder angle for the free arm while it takes part (pulling a string); undefined lets it follow the walk. */
  readonly offHandAngle?: number | undefined;
  /** Starts the action; ignored while one is already running. */
  swing(): void;
  /** Ends a held action (a drawn bow fires). No-op for weapons that cannot be held. */
  release(): void;
  /** Advances the action; returns what happened on the single frame it takes effect. */
  update(dt: number): WeaponAction | undefined;
}

/**
 * Clock for a one-shot action. Progress runs 0 → 1 over `duration` and the
 * timer stops itself on completion. Before the first step progress counts as
 * −1, so `crossed(0)` is true on the first frame after `start`.
 */
export class ActionTimer {
  private elapsed = -1;
  private prev = -1;
  private t = -1;

  get active(): boolean {
    return this.elapsed >= 0;
  }

  start(): void {
    this.elapsed = 0;
    this.prev = -1;
    this.t = -1;
  }

  stop(): void {
    this.elapsed = -1;
  }

  /** Advances by `dt`; returns progress in [0, 1]. */
  advance(dt: number, duration: number): number {
    this.prev = this.t;
    this.elapsed += dt;
    this.t = Math.min(this.elapsed / duration, 1);
    if (this.t >= 1) this.stop();
    return this.t;
  }

  /** True on the single step in which progress reached `point`. */
  crossed(point: number): boolean {
    return this.prev < point && this.t >= point;
  }
}
