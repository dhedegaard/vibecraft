import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  BODY_RADIUS,
  Cat,
  COLLAPSE_DURATION,
  DETECT_RANGE,
  MAX_HEALTH,
  POUNCE_CROUCH,
  POUNCE_DAMAGE,
  POUNCE_LEAP,
  SHELTER_RADIUS,
  SINK_DURATION,
  SWIPE_COOLDOWN,
  SWIPE_DAMAGE,
  SWIPE_DURATION,
  SWIPE_HIT_TIME,
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

/** A player standing 2 m in front of the cat, facing it. */
const IN_FRONT = new THREE.Vector3(0, 0, 2);
const FACING_CAT = new THREE.Vector3(0, 0, -1);

describe('Cat taking hits', () => {
  it('dies after MAX_HEALTH points of damage, however they are dealt', () => {
    const axe = make();
    for (let i = 0; i < MAX_HEALTH; i++) expect(axe.cat.hit(IN_FRONT, FACING_CAT, 1)).toBe(true);
    expect(axe.cat.dead).toBe(true);
    expect(axe.cat.hit(IN_FRONT, FACING_CAT, 1)).toBe(false);

    const stone = make();
    for (let i = 0; i < MAX_HEALTH / 2; i++) expect(stone.cat.hit(IN_FRONT, FACING_CAT, 2)).toBe(true);
    expect(stone.cat.dead).toBe(true);
  });

  it('is out of reach when the player faces away or stands too far', () => {
    const rig = make();
    expect(rig.cat.hit(IN_FRONT, new THREE.Vector3(0, 0, 1), 1)).toBe(false);
    expect(rig.cat.hit(new THREE.Vector3(0, 0, 6), FACING_CAT, 1)).toBe(false);
    expect(rig.cat.health).toBe(MAX_HEALTH);
  });

  it('takes an arrow through the body and ignores one passing beside it', () => {
    const rig = make();
    expect(rig.cat.shoot(new THREE.Vector3(BODY_RADIUS + 0.5, 0.8, 3), new THREE.Vector3(BODY_RADIUS + 0.5, 0.8, -3))).toBe(false);
    expect(rig.cat.shoot(new THREE.Vector3(0, 0.8, 3), new THREE.Vector3(0, 0.8, -3))).toBe(true);
    expect(rig.cat.health).toBe(MAX_HEALTH - 1);
  });

  it('wakes when shot in its sleep and cues a hurt yowl', () => {
    const rig = make();
    rig.cat.shoot(new THREE.Vector3(0, 0.8, 3), new THREE.Vector3(0, 0.8, -3));
    expect(rig.cat.awake).toBe(true);
    const sum = run(rig, fixed(0, DETECT_RANGE + 5), DT);
    expect(sum.sounds).toContain('catHurt');
    expect(sum.sounds).toContain('catYowl');
    expect(sum.animated).toBe(true);
  });

  it('keeps swiping when hit mid-swipe', () => {
    const rig = make();
    const player = fixed(0, 1.5);
    run(rig, player, WAKE_DURATION + DT);
    run(rig, player, 0.1);
    rig.cat.hit(IN_FRONT, FACING_CAT, 1);
    const sum = run(rig, player, SWIPE_DURATION);
    expect(sum.damage).toBe(SWIPE_DAMAGE);
  });

  it('collapses, reports the kill once, shelters the bed and then vanishes', () => {
    const rig = make();
    const player = fixed(0, DETECT_RANGE + 5);
    for (let i = 0; i < MAX_HEALTH; i++) rig.cat.hit(IN_FRONT, FACING_CAT, 1);
    expect(rig.cat.repellers).toHaveLength(1);
    const circle = rig.cat.repellers[0];
    if (!circle) throw new Error('no shelter');
    expect(circle.radius).toBe(SHELTER_RADIUS);
    expect(circle.position.x).toBe(BED.x);
    expect(circle.position.z).toBe(BED.z);
    expect(rig.cat.awake).toBe(false);

    const collapse = run(rig, player, COLLAPSE_DURATION);
    expect(collapse.sounds).toContain('catDeath');
    expect(collapse.killed).toBe(1);
    const sink = run(rig, player, SINK_DURATION);
    expect(sink.killed).toBe(0);
    expect(sink.animated).toBe(true);
    const after = run(rig, player, 1);
    expect(after.animated).toBe(false);
    expect(rig.cat.hit(IN_FRONT, FACING_CAT, 1)).toBe(false);
  });
});

/** Wakes the cat with the player at `playerAt` and runs the wake through. */
function wake(rig: Fixture, playerAt: () => THREE.Vector3): void {
  run(rig, playerAt, WAKE_DURATION + DT);
}

describe('Cat pouncing', () => {
  const LEAP_WINDOW = POUNCE_CROUCH + POUNCE_LEAP + 3 * DT;

  it('leaps onto a player parked in the pounce window and hits with knockback', () => {
    const rig = make();
    const player = fixed(0, 4.5);
    wake(rig, player);
    const sum = run(rig, player, LEAP_WINDOW);
    expect(sum.damage).toBe(POUNCE_DAMAGE);
    expect(sum.hitFrom).toBeDefined();
    expect(sum.sounds).toContain('catYowl');
    expect(distanceXZ(rig.cat.position, player())).toBeLessThan(2);
  });

  it('misses a player who sidesteps after the crouch', () => {
    const rig = make();
    const target = new THREE.Vector3(0, 0, 4.5);
    const player = (): THREE.Vector3 => target;
    wake(rig, player);
    // Aim is taken on the crouch's last frame; a few frames of slack keep this clear of it.
    run(rig, player, POUNCE_CROUCH + 4 * DT);
    target.x = 3;
    const sum = run(rig, player, POUNCE_LEAP + 2 * DT);
    expect(sum.damage).toBe(0);
    // It still landed where it aimed.
    expect(rig.cat.position.z).toBeGreaterThan(3.5);
    expect(Math.abs(rig.cat.position.x)).toBeLessThan(0.5);
  });

  it('misses a player in the air', () => {
    const rig = make();
    const player = fixed(0, 4.5, 1.5);
    wake(rig, player);
    const sum = run(rig, player, LEAP_WINDOW);
    expect(sum.damage).toBe(0);
  });

  it('is stopped short by a trunk and lands there', () => {
    const rig = make();
    rig.colliders.add({ kind: 'circle', x: 0, z: 2.5, radius: 0.4 });
    const player = fixed(0, 5);
    wake(rig, player);
    const sum = run(rig, player, LEAP_WINDOW);
    expect(sum.damage).toBe(0);
    // Held in front of the trunk: its centre never passed it.
    expect(rig.cat.position.z).toBeLessThan(2.5);
  });
});

describe('Cat swiping', () => {
  it('swipes a player standing on the bed right after the wake, then waits out the cooldown', () => {
    const rig = make();
    // 1.5 m: inside SWIPE_RANGE but clear of the contact distance (0.4 + 0.9), which can round either way.
    const player = fixed(0, 1.5);
    const waking = run(rig, player, WAKE_DURATION - DT);
    expect(waking.damage).toBe(0);
    const first = run(rig, player, 2 * DT + SWIPE_HIT_TIME + DT);
    expect(first.damage).toBe(SWIPE_DAMAGE);
    expect(first.sounds).toContain('catHiss');
    expect(first.hitFrom).toBeDefined();
    const waiting = run(rig, player, SWIPE_DURATION - SWIPE_HIT_TIME + SWIPE_COOLDOWN - 0.1);
    expect(waiting.damage).toBe(0);
    const second = run(rig, player, 0.1 + SWIPE_HIT_TIME + 2 * DT);
    expect(second.damage).toBe(SWIPE_DAMAGE);
  });

  it('misses a player who stepped back before the hit frame', () => {
    const rig = make();
    const target = new THREE.Vector3(0, 0, 1.5);
    const player = (): THREE.Vector3 => target;
    wake(rig, player);
    run(rig, player, 0.1);
    target.z = 4;
    const sum = run(rig, player, SWIPE_DURATION);
    expect(sum.damage).toBe(0);
  });
});
