import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOULDER_COUNT } from './boulders';
import { WADE_SPEED_FACTOR } from './ponds';
import { POND } from './props';
import { createWorld } from './world';

describe('createWorld', () => {
  it('builds headless with a dry spawn and a wadeable pond', () => {
    const { ponds } = createWorld();
    expect(ponds.speedFactor(0, 0)).toBe(1);
    expect(ponds.speedFactor(POND.x, POND.z)).toBe(WADE_SPEED_FACTOR);
  });

  it('keeps every boulder clear of the water', () => {
    const { boulders, ponds } = createWorld();
    expect(boulders.snapshot).toHaveLength(BOULDER_COUNT);
    for (const b of boulders.snapshot) expect(ponds.contains(b.x, b.z, b.radius)).toBe(false);
  });

  it('draws the grid as a single clipped line set', () => {
    const { scene } = createWorld();
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(lines).toHaveLength(1);
  });
});
