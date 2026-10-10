import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  Cat,
  DETECT_RANGE,
  MAX_HEALTH,
  WAKE_DURATION,
} from './cat';
import { Colliders } from './collision';
import type { SoundKind } from './sounds';
import { FLAT_TERRAIN } from './terrain';

const DT = 1 / 60;
const BED = { x: 0, z: 0, yaw: 0 };

interface Summary {
  damage: number;
  hitFrom: THREE.Vector3 | undefined;
  killed: number;
  sounds: SoundKind[];
  /** True if any frame reported `animating`. */
  animated: boolean;
}

interface Fixture {
  cat: Cat;
  colliders: Colliders;
}

function make(): Fixture {
  return { cat: new Cat(new THREE.Scene(), BED), colliders: new Colliders() };
}

/** Runs `seconds` of frames (plus one) with the player at `playerAt()` each frame, summing what the cat reported. */
function run(rig: Fixture, playerAt: () => THREE.Vector3, seconds: number): Summary {
  const sum: Summary = { damage: 0, hitFrom: undefined, killed: 0, sounds: [], animated: false };
  const frames = Math.round(seconds / DT) + 1;
  for (let i = 0; i < frames; i++) {
    const u = rig.cat.update(DT, playerAt(), rig.colliders, FLAT_TERRAIN);
    sum.damage += u.damage;
    if (u.hitFrom) sum.hitFrom = u.hitFrom;
    if (u.killed) sum.killed++;
    for (const cue of u.sounds) sum.sounds.push(cue.kind);
    if (rig.cat.animating) sum.animated = true;
  }
  return sum;
}

const fixed = (x: number, z: number, y = 0): (() => THREE.Vector3) => {
  const p = new THREE.Vector3(x, y, z);
  return () => p;
};

const distanceXZ = (a: THREE.Vector3, b: THREE.Vector3): number => Math.hypot(a.x - b.x, a.z - b.z);

describe('Cat asleep', () => {
  it('sleeps on its bed, not animating, with the player out of range', () => {
    const rig = make();
    const sum = run(rig, fixed(0, DETECT_RANGE + 2), 5);
    expect(rig.cat.awake).toBe(false);
    expect(rig.cat.dead).toBe(false);
    expect(rig.cat.health).toBe(MAX_HEALTH);
    expect(sum.animated).toBe(false);
    expect(sum.damage).toBe(0);
    expect(rig.cat.position.x).toBe(BED.x);
    expect(rig.cat.position.z).toBe(BED.z);
    expect(sum.sounds.every((k) => k === 'catMeow')).toBe(true);
  });

  it('meows now and then while asleep', () => {
    const rig = make();
    const sum = run(rig, fixed(0, DETECT_RANGE + 2), 40);
    expect(sum.sounds.filter((k) => k === 'catMeow').length).toBeGreaterThanOrEqual(1);
  });

  it('has no repel circle while alive', () => {
    const rig = make();
    expect(rig.cat.repellers).toHaveLength(0);
  });
});

describe('Cat waking', () => {
  it('wakes with a yowl when the player comes close and then closes in', () => {
    const rig = make();
    const player = fixed(0, DETECT_RANGE - 2);
    const first = run(rig, player, DT);
    expect(rig.cat.awake).toBe(true);
    expect(first.sounds).toContain('catYowl');
    expect(first.animated).toBe(true);

    run(rig, player, WAKE_DURATION);
    const before = distanceXZ(rig.cat.position, player());
    run(rig, player, 0.2);
    const after = distanceXZ(rig.cat.position, player());
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });
});
