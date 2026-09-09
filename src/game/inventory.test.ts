import { describe, expect, it, vi } from 'vitest';
import { Inventory } from './inventory';

describe('Inventory', () => {
  it('counts added items and calls listeners immediately and on change', () => {
    const inv = new Inventory();
    const listener = vi.fn();
    inv.onChange(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    inv.add('arrow', 5);
    expect(inv.count('arrow')).toBe(5);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('has() requires every kind in the cost, and an empty cost is always met', () => {
    const inv = new Inventory();
    inv.add('log', 3);
    inv.add('bone', 1);
    expect(inv.has({ log: 3, bone: 2 })).toBe(false);
    inv.add('bone');
    expect(inv.has({ log: 3, bone: 2 })).toBe(true);
    expect(inv.has({})).toBe(true);
  });

  it('remove() refuses when short, leaving the count and listeners untouched', () => {
    const inv = new Inventory();
    inv.add('arrow', 1);
    const listener = vi.fn();
    inv.onChange(listener);

    expect(inv.remove('arrow', 2)).toBe(false);
    expect(inv.count('arrow')).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    expect(inv.remove('arrow')).toBe(true);
    expect(inv.count('arrow')).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('spend() is all-or-nothing across kinds and emits once on success', () => {
    const inv = new Inventory();
    inv.add('log', 3);
    inv.add('bone', 1);
    const listener = vi.fn();
    inv.onChange(listener);

    expect(inv.spend({ log: 3, bone: 2 })).toBe(false);
    expect(inv.count('log')).toBe(3);
    expect(inv.count('bone')).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    inv.add('bone');
    expect(inv.spend({ log: 3, bone: 2 })).toBe(true);
    expect(inv.count('log')).toBe(0);
    expect(inv.count('bone')).toBe(0);
    // subscribe, add, spend
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
