import type { Inventory } from './inventory';
import { ITEM_KINDS, ITEM_LABELS, type ItemCost, type ItemKind } from './items';
import type { WeaponKind } from './weapons';

export type RecipeId = 'bow' | 'arrows' | 'torches' | 'stoneAxe';

export type RecipeOutput =
  | { kind: 'item'; item: ItemKind; amount: number }
  | { kind: 'weapon'; weapon: WeaponKind }
  | { kind: 'upgrade'; upgrade: 'stoneAxe' };

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
  {
    id: 'stoneAxe',
    label: 'Stone Axe',
    cost: { log: 2, stone: 4 },
    output: { kind: 'upgrade', upgrade: 'stoneAxe' },
  },
];

/** What the player already has; the structural slice of `Player` that decides a one-time recipe is done. */
export interface Holdings {
  isUnlocked(kind: WeaponKind): boolean;
  readonly hasStoneAxe: boolean;
}

/** True for a weapon or upgrade the player already holds; item outputs can be crafted again. */
export function isOwned(output: RecipeOutput, holdings: Holdings): boolean {
  switch (output.kind) {
    case 'item':
      return false;
    case 'weapon':
      return holdings.isUnlocked(output.weapon);
    case 'upgrade':
      return holdings.hasStoneAxe;
    default: {
      const unreachable: never = output;
      throw new Error(`unknown recipe output ${String(unreachable)}`);
    }
  }
}

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
