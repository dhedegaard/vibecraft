import { describe, expect, it } from 'vitest';
import { canCraft, craft, formatCost, isOwned, RECIPES, type Holdings, type Recipe } from './crafting';
import { Inventory } from './inventory';
import type { WeaponKind } from './weapons';

function recipe(id: Recipe['id']): Recipe {
  const found = RECIPES.find((r) => r.id === id);
  if (!found) throw new Error(`no recipe ${id}`);
  return found;
}

const holdings = (bow: boolean, stoneAxe: boolean): Holdings => ({
  isUnlocked: (kind: WeaponKind) => kind === 'axe' || bow,
  hasStoneAxe: stoneAxe,
});

describe('crafting', () => {
  it('defines the bow and arrow recipes', () => {
    expect(recipe('bow').output).toEqual({ kind: 'weapon', weapon: 'bow' });
    expect(recipe('arrows').output).toEqual({ kind: 'item', item: 'arrow', amount: 5 });
  });

  it('canCraft is false one item short and true at exactly the cost', () => {
    const inv = new Inventory();
    inv.add('log', 3);
    inv.add('bone', 1);
    expect(canCraft(recipe('bow'), inv)).toBe(false);
    inv.add('bone');
    expect(canCraft(recipe('bow'), inv)).toBe(true);
  });

  it('craft spends exactly the cost and returns the output', () => {
    const inv = new Inventory();
    inv.add('log', 4);
    inv.add('bone', 3);
    const result = craft(recipe('bow'), inv);
    expect(result).toEqual({ ok: true, output: { kind: 'weapon', weapon: 'bow' } });
    expect(inv.count('log')).toBe(1);
    expect(inv.count('bone')).toBe(1);
  });

  it('craft spends the arrows cost and returns 5 arrows', () => {
    const inv = new Inventory();
    inv.add('log', 1);
    inv.add('bone', 1);
    const result = craft(recipe('arrows'), inv);
    expect(result).toEqual({ ok: true, output: { kind: 'item', item: 'arrow', amount: 5 } });
    expect(inv.count('log')).toBe(0);
    expect(inv.count('bone')).toBe(0);
  });

  it('craft spends the torches cost and returns 2 torches', () => {
    const inv = new Inventory();
    inv.add('log', 1);
    inv.add('bone', 1);
    const result = craft(recipe('torches'), inv);
    expect(result).toEqual({ ok: true, output: { kind: 'item', item: 'torch', amount: 2 } });
    expect(inv.count('log')).toBe(0);
    expect(inv.count('bone')).toBe(0);
  });

  it('a failed craft changes nothing', () => {
    const inv = new Inventory();
    inv.add('log', 1);
    const result = craft(recipe('arrows'), inv);
    expect(result).toEqual({ ok: false, reason: 'unaffordable' });
    expect(inv.count('log')).toBe(1);
    expect(inv.count('arrow')).toBe(0);
  });

  it('formats a cost in item order', () => {
    expect(formatCost({ bone: 2, log: 3 })).toBe('3 Logs · 2 Bones');
    expect(formatCost({})).toBe('');
  });

  it('defines the stone axe as a one-time upgrade costing stone and logs', () => {
    expect(recipe('stoneAxe').output).toEqual({ kind: 'upgrade', upgrade: 'stoneAxe' });
    const inv = new Inventory();
    inv.add('log', 2);
    inv.add('stone', 3);
    expect(canCraft(recipe('stoneAxe'), inv)).toBe(false);
    inv.add('stone');
    expect(canCraft(recipe('stoneAxe'), inv)).toBe(true);
    expect(craft(recipe('stoneAxe'), inv)).toEqual({ ok: true, output: { kind: 'upgrade', upgrade: 'stoneAxe' } });
    expect(inv.count('log')).toBe(0);
    expect(inv.count('stone')).toBe(0);
  });

  it('reports one-time outputs as owned, never item outputs', () => {
    expect(isOwned(recipe('stoneAxe').output, holdings(false, true))).toBe(true);
    expect(isOwned(recipe('stoneAxe').output, holdings(false, false))).toBe(false);
    expect(isOwned(recipe('bow').output, holdings(true, false))).toBe(true);
    expect(isOwned(recipe('bow').output, holdings(false, false))).toBe(false);
    expect(isOwned(recipe('arrows').output, holdings(true, true))).toBe(false);
    expect(isOwned(recipe('torches').output, holdings(true, true))).toBe(false);
  });

  it('formats a stone cost after logs', () => {
    expect(formatCost({ stone: 4, log: 2 })).toBe('2 Logs · 4 Stones');
  });
});
