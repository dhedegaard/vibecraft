import { describe, expect, it, vi } from 'vitest';
import { Health } from './health';

function advance(health: Health, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) health.update(dt);
}

describe('Health', () => {
  it('starts full and alive', () => {
    const health = new Health();
    expect(health.hearts).toBe(Health.MAX);
    expect(health.dead).toBe(false);
  });

  it('loses hearts on damage and reports the loss', () => {
    const health = new Health();
    expect(health.damage()).toBe(true);
    expect(health.hearts).toBe(Health.MAX - 1);
  });

  it('ignores hits during the invulnerability window after a hit', () => {
    const health = new Health();
    health.damage();
    advance(health, 0.5);
    expect(health.damage()).toBe(false);
    expect(health.hearts).toBe(Health.MAX - 1);

    advance(health, 0.5);
    expect(health.damage()).toBe(true);
    expect(health.hearts).toBe(Health.MAX - 2);
  });

  it('dies at zero, never goes negative and takes no further damage', () => {
    const health = new Health();
    health.damage(Health.MAX + 5);
    expect(health.hearts).toBe(0);
    expect(health.dead).toBe(true);
    advance(health, 2);
    expect(health.damage()).toBe(false);
  });

  it('regenerates one heart per delay once out of combat', () => {
    const health = new Health();
    health.damage(3);
    // Nothing regenerates until the delay has passed, then one heart per delay.
    advance(health, 4.9);
    expect(health.hearts).toBe(Health.MAX - 3);
    advance(health, 5.2);
    expect(health.hearts).toBe(Health.MAX - 2);
    advance(health, 5);
    expect(health.hearts).toBe(Health.MAX - 1);
  });

  it('does not regenerate above the maximum', () => {
    const health = new Health();
    advance(health, 30);
    expect(health.hearts).toBe(Health.MAX);
  });

  it('does not regenerate when dead', () => {
    const health = new Health();
    health.damage(Health.MAX);
    advance(health, 30);
    expect(health.hearts).toBe(0);
  });

  it('taking damage restarts the regeneration delay', () => {
    const health = new Health();
    health.damage();
    advance(health, 4);
    health.damage();
    advance(health, 4);
    expect(health.hearts).toBe(Health.MAX - 2);
  });

  it('notifies listeners immediately and on every change', () => {
    const health = new Health();
    const listener = vi.fn();
    health.onChange(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(health);

    health.damage();
    expect(listener).toHaveBeenCalledTimes(2);

    // An ignored hit and idle ticks do not notify.
    health.damage();
    advance(health, 1);
    expect(listener).toHaveBeenCalledTimes(2);

    advance(health, 10);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
