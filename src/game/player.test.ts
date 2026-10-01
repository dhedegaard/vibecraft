import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Colliders, type CircleCollider } from './collision';
import type { Action, InputState, MouseDelta } from './input';
import { Inventory } from './inventory';
import { Player, type PlayerUpdate } from './player';
import { WADE_SPEED_FACTOR } from './ponds';
import { FLAT_TERRAIN, type Terrain } from './terrain';
import type { WeaponAction } from './weapons';

const DT = 1 / 60;

/** Scriptable stand-in for `Input`: set fields before a frame, the player consumes them. */
class FakeInput implements InputState {
  readonly held = new Set<Action>();
  attack = false;
  slot: number | undefined;

  isHeld(action: Action): boolean {
    return this.held.has(action);
  }
  consumeMouseDelta(): MouseDelta {
    return { x: 0, y: 0 };
  }
  consumeZoom(): number {
    return 0;
  }
  consumeAttack(): boolean {
    const out = this.attack;
    this.attack = false;
    return out;
  }
  consumeSlot(): number | undefined {
    const out = this.slot;
    this.slot = undefined;
    return out;
  }
  consumeCraftToggle(): boolean {
    return false;
  }
  consumePlace(): boolean {
    return false;
  }
  consumeMute(): boolean {
    return false;
  }
}

function step(
  player: Player,
  input: FakeInput,
  inventory: Inventory,
  colliders = new Colliders(),
  terrain: Terrain = FLAT_TERRAIN,
): PlayerUpdate {
  return player.update(DT, input, 0, inventory, colliders, terrain);
}

/** Presses attack, holds it for `holdSeconds`, releases, then runs on; returns every action produced. */
function attack(player: Player, input: FakeInput, inventory: Inventory, holdSeconds: number): WeaponAction[] {
  const actions: WeaponAction[] = [];
  const record = (): void => {
    const { action } = step(player, input, inventory);
    if (action) actions.push(action);
  };
  input.attack = true;
  input.held.add('attack');
  record();
  for (let t = DT; t < holdSeconds; t += DT) record();
  input.held.delete('attack');
  for (let i = 0; i < 90; i++) record();
  return actions;
}

describe('Player', () => {
  it('starts with the axe and the bow locked', () => {
    const player = new Player();
    expect(player.weapon).toBe('axe');
    expect(player.isUnlocked('axe')).toBe(true);
    expect(player.isUnlocked('bow')).toBe(false);
  });

  it('refuses to select a locked slot', () => {
    const player = new Player();
    const input = new FakeInput();
    input.slot = 1;
    const { switched } = step(player, input, new Inventory());
    expect(switched).toBe(false);
    expect(player.weapon).toBe('axe');
  });

  it('unlock() reports only the first unlock and enables the slot', () => {
    const player = new Player();
    expect(player.unlock('bow')).toBe(true);
    expect(player.unlock('bow')).toBe(false);
    const input = new FakeInput();
    input.slot = 1;
    const { switched } = step(player, input, new Inventory());
    expect(switched).toBe(true);
    expect(player.weapon).toBe('bow');
  });

  it('will not draw the bow without arrows', () => {
    const player = new Player();
    player.unlock('bow');
    const input = new FakeInput();
    input.slot = 1;
    const inventory = new Inventory();
    step(player, input, inventory);
    expect(attack(player, input, inventory, 0.5)).toHaveLength(0);
  });

  it('draws while attack is held and fires on release', () => {
    const player = new Player();
    player.unlock('bow');
    const input = new FakeInput();
    input.slot = 1;
    const inventory = new Inventory();
    inventory.add('arrow');
    step(player, input, inventory);
    const actions = attack(player, input, inventory, 0.5);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.kind).toBe('fire');
    // The player only reads the inventory; main.ts removes the arrow on the fire action.
    expect(inventory.count('arrow')).toBe(1);
  });

  it('fires exactly one click shot once the arm reaches aim, with no held frame', () => {
    const player = new Player();
    player.unlock('bow');
    const input = new FakeInput();
    input.slot = 1;
    const inventory = new Inventory();
    inventory.add('arrow');
    step(player, input, inventory);

    // A click: attack latches once but is never added to `held`, unlike attack().
    input.attack = true;
    const fired: WeaponAction[] = [];
    for (let i = 0; i < 90; i++) {
      const { action } = step(player, input, inventory);
      if (action) fired.push(action);
    }
    expect(fired).toHaveLength(1);
    expect(fired[0]?.kind).toBe('fire');
  });

  it('exposes the draw fraction only while the bow is being drawn', () => {
    const player = new Player();
    const input = new FakeInput();
    const inventory = new Inventory();
    inventory.add('arrow');
    expect(player.draw).toBe(0);

    player.unlock('bow');
    input.slot = 1;
    step(player, input, inventory);
    input.attack = true;
    input.held.add('attack');
    step(player, input, inventory);
    for (let t = DT; t < 0.4; t += DT) step(player, input, inventory);
    expect(player.draw).toBeGreaterThan(0.3);
    expect(player.draw).toBeLessThan(0.7);

    input.held.delete('attack');
    for (let i = 0; i < 60; i++) step(player, input, inventory);
    expect(player.draw).toBe(0);
  });

  it('still chops with the axe when the inventory is empty', () => {
    const player = new Player();
    const actions = attack(player, new FakeInput(), new Inventory(), 0);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.kind).toBe('strike');
  });

  it('whooshes only when a click starts a swing, not on a click mid-swing', () => {
    const player = new Player();
    const input = new FakeInput();
    const inventory = new Inventory();
    input.attack = true;
    expect(step(player, input, inventory).sounds.map((s) => s.kind)).toContain('axeSwing');
    input.attack = true;
    expect(step(player, input, inventory).sounds.map((s) => s.kind)).not.toContain('axeSwing');
  });

  it('upgrades the axe once and hits harder afterwards', () => {
    const player = new Player();
    const before = player.axeDamage;
    expect(player.hasStoneAxe).toBe(false);
    expect(player.upgradeAxe()).toBe(true);
    expect(player.hasStoneAxe).toBe(true);
    expect(player.axeDamage).toBeGreaterThan(before);
    expect(player.upgradeAxe()).toBe(false);
  });
});

describe('Player knockback', () => {
  it('shoves the player about 2 m straight away from the source with a hop, then settles', () => {
    const player = new Player();
    const input = new FakeInput();
    const inventory = new Inventory();
    player.knockBack(new THREE.Vector3(0, 0, 1));
    let peak = 0;
    let last: PlayerUpdate | undefined;
    for (let i = 0; i < 120; i++) {
      last = step(player, input, inventory);
      peak = Math.max(peak, player.position.y);
    }
    expect(player.position.z).toBeCloseTo(-2, 1);
    expect(player.position.x).toBeCloseTo(0, 6);
    expect(peak).toBeGreaterThan(0.05);
    expect(player.position.y).toBe(0);
    expect(last?.active).toBe(false);
  });

  it('is stopped by a trunk behind the player', () => {
    const colliders = new Colliders();
    colliders.add({ kind: 'circle', x: 0, z: -1, radius: 0.3 });
    const player = new Player();
    player.knockBack(new THREE.Vector3(0, 0, 1));
    for (let i = 0; i < 120; i++) step(player, new FakeInput(), new Inventory(), colliders);
    expect(player.position.z).toBeCloseTo(-1 + 0.3 + 0.4, 3);
  });
});

describe('Player collision', () => {
  /** Walks toward -Z (camera yaw 0, 'forward') for `frames` frames against `colliders`. */
  function walkForward(colliders: Colliders, frames: number): THREE.Vector3 {
    const player = new Player();
    const input = new FakeInput();
    const inventory = new Inventory();
    input.held.add('forward');
    for (let i = 0; i < frames; i++) step(player, input, inventory, colliders);
    return player.position;
  }

  it('stops short of a trunk directly ahead', () => {
    const colliders = new Colliders();
    colliders.add({ kind: 'circle', x: 0, z: -3, radius: 0.3 });
    const pos = walkForward(colliders, 120);
    // Two seconds at 6 m/s would be 12 m without the tree; the trunk holds the player at its edge.
    expect(pos.z).toBeCloseTo(-3 + 0.3 + 0.4, 3);
    expect(pos.x).toBeCloseTo(0, 3);
  });

  it('slides past a trunk that is slightly off the path', () => {
    const colliders = new Colliders();
    colliders.add({ kind: 'circle', x: 0.2, z: -3, radius: 0.3 });
    const pos = walkForward(colliders, 120);
    expect(pos.z).toBeLessThan(-5);
    expect(pos.x).toBeLessThan(-0.3);
  });

  it('stops stepping and lets the renderer idle while pushing against a trunk', () => {
    const colliders = new Colliders();
    colliders.add({ kind: 'circle', x: 0, z: -3, radius: 0.3 });
    const player = new Player();
    const input = new FakeInput();
    const inventory = new Inventory();
    input.held.add('forward');
    let openSteps = 0;
    for (let i = 0; i < 20; i++) {
      if (step(player, input, inventory, colliders).sounds.some((s) => s.kind === 'footstep')) openSteps++;
    }
    expect(openSteps).toBeGreaterThan(0);

    // Reach the trunk and give the legs time to settle.
    for (let i = 0; i < 180; i++) step(player, input, inventory, colliders);
    let pushingSteps = 0;
    let last: PlayerUpdate | undefined;
    for (let i = 0; i < 60; i++) {
      last = step(player, input, inventory, colliders);
      if (last.sounds.some((s) => s.kind === 'footstep')) pushingSteps++;
    }
    expect(pushingSteps).toBe(0);
    expect(last?.active).toBe(false);
  });

  it('is held outside the house footprint', () => {
    const colliders = new Colliders();
    colliders.add({ kind: 'box', x: 0, z: -4, halfWidth: 3, halfDepth: 2.5, yaw: 0 });
    const pos = walkForward(colliders, 120);
    expect(pos.z).toBeCloseTo(-4 + 2.5 + 0.4, 3);
  });
});

const pushable = (x: number, z: number): CircleCollider => ({ kind: 'circle', x, z, radius: 0.9, pushable: true });

/** Walks forward (−Z at camera yaw 0) for `frames` frames. */
function walkInto(player: Player, input: FakeInput, colliders: Colliders, frames: number): void {
  input.held.add('forward');
  for (let i = 0; i < frames; i++) step(player, input, new Inventory(), colliders);
  input.held.delete('forward');
}

describe('Player pushing a boulder', () => {
  it('shoves it along at walking pace and then goes idle', () => {
    const player = new Player();
    const input = new FakeInput();
    const colliders = new Colliders();
    const b = pushable(0, -3);
    colliders.add(b);

    walkInto(player, input, colliders, 60);
    expect(b.z).toBeLessThan(-3);
    // The player keeps contact distance (1.3 = boulder 0.9 + character 0.4).
    expect(Math.abs(player.position.z - b.z)).toBeCloseTo(1.3, 2);

    let last: PlayerUpdate | undefined;
    for (let i = 0; i < 120; i++) last = step(player, input, new Inventory(), colliders);
    expect(last?.active).toBe(false);
  });

  it('stops against a pinned boulder and then goes idle', () => {
    const player = new Player();
    const input = new FakeInput();
    const colliders = new Colliders();
    colliders.add({ kind: 'circle', x: 0, z: -8, radius: 0.5 });
    const b = pushable(0, -3);
    colliders.add(b);

    walkInto(player, input, colliders, 120);
    // Trunk at -8 (r 0.5) caps the boulder centre at -8 + 0.9 + 0.5.
    expect(b.z).toBeCloseTo(-8 + 0.9 + 0.5, 3);
    expect(Math.abs(player.position.z - b.z)).toBeCloseTo(1.3, 2);

    let last: PlayerUpdate | undefined;
    for (let i = 0; i < 120; i++) last = step(player, input, new Inventory(), colliders);
    expect(last?.active).toBe(false);
  });
});

const SHALLOWS: Terrain = { heightAt: () => 0, surfaceAt: () => 0, speedFactor: () => WADE_SPEED_FACTOR };

/** Holds `keys` for `frames` frames on `terrain`; returns the distance from the origin and every cue kind emitted. */
function trek(terrain: Terrain, frames: number, keys: Action[]): { distance: number; kinds: string[] } {
  const player = new Player();
  const input = new FakeInput();
  for (const key of keys) input.held.add(key);
  const kinds: string[] = [];
  for (let i = 0; i < frames; i++) {
    const { sounds } = step(player, input, new Inventory(), new Colliders(), terrain);
    kinds.push(...sounds.map((s) => s.kind));
  }
  return { distance: Math.hypot(player.position.x, player.position.z), kinds };
}

describe('Player wading', () => {
  it('covers WADE_SPEED_FACTOR of the dry distance', () => {
    const dry = trek(FLAT_TERRAIN, 60, ['forward']);
    const wet = trek(SHALLOWS, 60, ['forward']);
    expect(wet.distance / dry.distance).toBeCloseTo(WADE_SPEED_FACTOR, 2);
  });

  it('is slowed just as much when holding jump (the water cannot be hopped across)', () => {
    const dry = trek(FLAT_TERRAIN, 120, ['forward', 'jump']);
    const wet = trek(SHALLOWS, 120, ['forward', 'jump']);
    expect(wet.distance / dry.distance).toBeCloseTo(WADE_SPEED_FACTOR, 2);
  });

  it('splashes instead of stepping, and only in water', () => {
    const dry = trek(FLAT_TERRAIN, 120, ['forward']);
    const wet = trek(SHALLOWS, 120, ['forward']);
    expect(dry.kinds).toContain('footstep');
    expect(dry.kinds).not.toContain('splash');
    expect(wet.kinds).toContain('splash');
    expect(wet.kinds).not.toContain('footstep');
  });

  it('splashes instead of thudding when landing in water', () => {
    const dry = trek(FLAT_TERRAIN, 60, ['jump']);
    const wet = trek(SHALLOWS, 60, ['jump']);
    expect(dry.kinds).toContain('land');
    expect(dry.kinds).not.toContain('splash');
    expect(wet.kinds).toContain('splash');
    expect(wet.kinds).not.toContain('land');
  });

  it('lets the renderer idle after stopping in water', () => {
    const player = new Player();
    const input = new FakeInput();
    input.held.add('forward');
    for (let i = 0; i < 30; i++) step(player, input, new Inventory(), new Colliders(), SHALLOWS);
    input.held.delete('forward');
    let last: PlayerUpdate | undefined;
    for (let i = 0; i < 120; i++) last = step(player, input, new Inventory(), new Colliders(), SHALLOWS);
    expect(last?.active).toBe(false);
  });
});

/** Ground falling away along −Z at 1 in 4 from the origin, levelling out a metre down. */
const SLOPE: Terrain = {
  heightAt: (_x, z) => Math.max(-1, 0.25 * z),
  surfaceAt: (_x, z) => Math.max(-1, 0.25 * z),
  speedFactor: () => 1,
};
/** A metre-high ledge three metres ahead. */
const CLIFF: Terrain = {
  heightAt: (_x, z) => (z < -3 ? -1 : 0),
  surfaceAt: (_x, z) => (z < -3 ? -1 : 0),
  speedFactor: () => 1,
};

/** Runs `frames` frames holding `keys`; returns the cue kinds emitted. */
function hold(player: Player, input: FakeInput, terrain: Terrain, frames: number, keys: Action[]): string[] {
  input.held.clear();
  for (const key of keys) input.held.add(key);
  const kinds: string[] = [];
  for (let i = 0; i < frames; i++) {
    kinds.push(...step(player, input, new Inventory(), new Colliders(), terrain).sounds.map((s) => s.kind));
  }
  return kinds;
}

describe('Player on uneven ground', () => {
  it('walks down a slope glued to the ground: no landing, feet on the floor', () => {
    const player = new Player();
    const input = new FakeInput();
    const kinds = hold(player, input, SLOPE, 60, ['forward']);
    expect(player.position.z).toBeLessThan(-3);
    expect(player.position.y).toBeCloseTo(SLOPE.heightAt(player.position.x, player.position.z), 6);
    expect(kinds).not.toContain('land');
    expect(kinds).toContain('footstep');
  });

  it('walks back up just as smoothly', () => {
    const player = new Player();
    const input = new FakeInput();
    hold(player, input, SLOPE, 60, ['forward']);
    const kinds = hold(player, input, SLOPE, 60, ['back']);
    expect(player.position.z).toBeGreaterThan(-1);
    expect(player.position.y).toBeCloseTo(SLOPE.heightAt(player.position.x, player.position.z), 6);
    expect(kinds).not.toContain('land');
  });

  it('falls off a ledge and lands once on the lower ground', () => {
    const player = new Player();
    const input = new FakeInput();
    const kinds = hold(player, input, CLIFF, 90, ['forward']);
    expect(player.position.y).toBe(-1);
    expect(kinds.filter((k) => k === 'land')).toHaveLength(1);
  });

  it('can still jump off the slope and lands once', () => {
    const player = new Player();
    const input = new FakeInput();
    hold(player, input, SLOPE, 30, ['forward']);
    const jumped = hold(player, input, SLOPE, 1, ['forward', 'jump']);
    expect(jumped).toContain('jump');
    expect(player.position.y).toBeGreaterThan(SLOPE.heightAt(player.position.x, player.position.z));
    const kinds = hold(player, input, SLOPE, 90, ['forward']);
    expect(kinds.filter((k) => k === 'land')).toHaveLength(1);
    expect(player.position.y).toBeCloseTo(SLOPE.heightAt(player.position.x, player.position.z), 6);
  });

  it('a knockback hop leaves the slope', () => {
    const player = new Player();
    const input = new FakeInput();
    hold(player, input, SLOPE, 30, ['forward']);
    // Struck from behind (+Z), so the shove goes downhill and the ground falls away under the hop.
    player.knockBack(new THREE.Vector3(player.position.x, 0, player.position.z + 1));
    hold(player, input, SLOPE, 1, []);
    expect(player.position.y).toBeGreaterThan(SLOPE.heightAt(player.position.x, player.position.z));
    const kinds = hold(player, input, SLOPE, 60, []);
    expect(kinds.filter((k) => k === 'land')).toHaveLength(1);
  });

  it('idles after stopping on a slope', () => {
    const player = new Player();
    const input = new FakeInput();
    hold(player, input, SLOPE, 30, ['forward']);
    input.held.clear();
    let last: PlayerUpdate | undefined;
    for (let i = 0; i < 120; i++) last = step(player, input, new Inventory(), new Colliders(), SLOPE);
    expect(last?.active).toBe(false);
    expect(player.position.y).toBeCloseTo(SLOPE.heightAt(player.position.x, player.position.z), 6);
  });
});
