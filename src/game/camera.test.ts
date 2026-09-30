import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FollowCamera } from './camera';
import type { Action, InputState, MouseDelta } from './input';

const DT = 1 / 60;
const ORIGIN = new THREE.Vector3();

/** Feeds a wheel amount for one frame; everything else idle. */
class WheelInput implements InputState {
  zoom = 0;

  isHeld(action: Action): boolean {
    void action;
    return false;
  }
  consumeMouseDelta(): MouseDelta {
    return { x: 0, y: 0 };
  }
  consumeZoom(): number {
    const out = this.zoom;
    this.zoom = 0;
    return out;
  }
  consumeAttack(): boolean {
    return false;
  }
  consumeSlot(): number | undefined {
    return undefined;
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

function distance(cam: FollowCamera): number {
  return cam.camera.position.distanceTo(cam.focus);
}

/** Runs frames until the camera reports no movement; returns the distances seen on the way. */
function settleCamera(cam: FollowCamera, input: WheelInput): number[] {
  const seen: number[] = [];
  for (let i = 0; i < 600 && cam.update(input, ORIGIN, DT); i++) seen.push(distance(cam));
  return seen;
}

/** Scrolls `pixels` (positive = away from the player) then lets the zoom settle. */
function scroll(cam: FollowCamera, input: WheelInput, pixels: number): number[] {
  input.zoom = pixels;
  return settleCamera(cam, input);
}

describe('FollowCamera zoom', () => {
  it('starts at the default distance, focused a metre above the target', () => {
    const cam = new FollowCamera(1);
    const input = new WheelInput();
    expect(cam.update(input, ORIGIN, DT)).toBe(false);
    expect(cam.focus.y).toBeCloseTo(1);
    expect(distance(cam)).toBeCloseTo(8);
  });

  it('eases out on a scroll down and comes to rest', () => {
    const cam = new FollowCamera(1);
    const input = new WheelInput();
    cam.update(input, ORIGIN, DT);
    const start = distance(cam);
    const seen = scroll(cam, input, 100);

    expect(seen.length).toBeGreaterThan(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] ?? 0);
    expect(distance(cam)).toBeGreaterThan(start);
    expect(cam.update(input, ORIGIN, DT)).toBe(false);
  });

  it('eases in on a scroll up', () => {
    const cam = new FollowCamera(1);
    const input = new WheelInput();
    cam.update(input, ORIGIN, DT);
    const start = distance(cam);
    const seen = scroll(cam, input, -100);

    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1] ?? Infinity);
    expect(distance(cam)).toBeLessThan(start);
  });

  it('clamps to a close and a far limit', () => {
    const cam = new FollowCamera(1);
    const input = new WheelInput();
    scroll(cam, input, -100_000);
    const near = distance(cam);
    scroll(cam, input, -100);
    expect(distance(cam)).toBeCloseTo(near);
    expect(near).toBeGreaterThan(1);
    expect(near).toBeLessThan(8);

    scroll(cam, input, 100_000);
    const far = distance(cam);
    scroll(cam, input, 100);
    expect(distance(cam)).toBeCloseTo(far);
    expect(far).toBeGreaterThan(8);
  });

  it('zooms by the same factor near and far', () => {
    const cam = new FollowCamera(1);
    const input = new WheelInput();
    cam.update(input, ORIGIN, DT);
    const a = distance(cam);
    scroll(cam, input, 100);
    const b = distance(cam);
    scroll(cam, input, 100);
    const c = distance(cam);
    expect(b / a).toBeCloseTo(c / b);
  });
});
