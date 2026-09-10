import type { Inventory } from './inventory';
import { ITEM_KINDS, ITEM_LABELS, type ItemCost, type ItemKind } from './items';
import type { WeaponKind } from './weapons';

export type RecipeId = 'bow' | 'arrows' | 'torches';

export type RecipeOutput =
  | { kind: 'item'; item: ItemKind; amount: number }
  | { kind: 'weapon'; weapon: WeaponKind };

export interface Recipe {
  readonly id: RecipeId;
  readonly label: string;
  readonly cost: ItemCost;
  readonly output: RecipeOutput;
}

export const RECIPES: readonly Recipe[] = [
  { id: 'bow', label: 'Bow', cost: { log: 3, bone: 2 }, output: { kind: 'weapon', weapon: 'bow' } },
  { id: 'arrows', label: '5 Arrows', cost: { log: 1, bone: 1 }, output: { kind: 'item', item: 'arrow', amount: 5 } },
  { id: 'torches', label: '2 Torches', cost: { log: 1, bone: 1 }, output: { kind: 'item', item: 'torch', amount: 2 } },
];

export type CraftResult = { ok: true; output: RecipeOutput } | { ok: false; reason: 'unaffordable' };

export function canCraft(recipe: Recipe, inventory: Inventory): boolean {
  return inventory.has(recipe.cost);
}

/** Spends the cost. Applying the output is the caller's job (items → inventory, weapons → player). */
export function craft(recipe: Recipe, inventory: Inventory): CraftResult {
  if (!inventory.spend(recipe.cost)) return { ok: false, reason: 'unaffordable' };
  return { ok: true, output: recipe.output };
}

/** "3 Logs · 2 Bones", in `ITEM_KINDS` order. */
export function formatCost(cost: ItemCost): string {
  const parts: string[] = [];
  for (const kind of ITEM_KINDS) {
    const amount = cost[kind];
    if (amount !== undefined) parts.push(`${amount} ${ITEM_LABELS[kind]}`);
  }
  return parts.join(' · ');
}
