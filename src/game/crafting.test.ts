import { describe, expect, it } from 'vitest';
import { canCraft, craft, formatCost, RECIPES, type Recipe } from './crafting';
import { Inventory } from './inventory';

function recipe(id: Recipe['id']): Recipe {
  const found = RECIPES.find((r) => r.id === id);
  if (!found) throw new Error(`no recipe ${id}`);
  return found;
}

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
});
