import type * as THREE from 'three';

/** Every one-shot the game can ask the audio layer to play. Loops (ambient, crackle) are not cues. */
export type SoundKind =
  | 'footstep'
  | 'jump'
  | 'land'
  | 'axeSwing'
  | 'chop'
  | 'treeCreak'
  | 'treeFall'
  | 'bowDraw'
  | 'bowFire'
  | 'arrowHit'
  | 'arrowMiss'
  | 'pickup'
  | 'torchPlace'
  | 'craft'
  | 'weaponSwitch'
  | 'skeletonStep'
  | 'skeletonSwing'
  | 'skeletonHurt'
  | 'skeletonCollapse'
  | 'playerHurt'
  | 'death';

/**
 * A request to play one sound. Without `at` it plays unpanned (the player's own
 * sounds, UI). `variation` overrides the random per-play variation when the
 * source knows something meaningful (a felled tree's scale).
 */
export interface SoundCue {
  kind: SoundKind;
  at?: THREE.Vector3;
  variation?: number;
}
