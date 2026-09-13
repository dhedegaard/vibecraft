import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Colliders } from './collision';
import type { Action, InputState, MouseDelta } from './input';
import { Inventory } from './inventory';
import { Player, type PlayerUpdate } from './player';
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

function step(player: Player, input: FakeInput, inventory: Inventory, colliders = new Colliders()): PlayerUpdate {
  return player.update(DT, input, 0, inventory, colliders);
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

  it('is held outside the house footprint', () => {
    const colliders = new Colliders();
    colliders.add({ kind: 'box', x: 0, z: -4, halfWidth: 3, halfDepth: 2.5, yaw: 0 });
    const pos = walkForward(colliders, 120);
    expect(pos.z).toBeCloseTo(-4 + 2.5 + 0.4, 3);
  });
});
