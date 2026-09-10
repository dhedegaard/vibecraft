export type ItemKind = 'log' | 'seed' | 'bone' | 'arrow' | 'torch';

export const ITEM_KINDS: readonly ItemKind[] = ['log', 'seed', 'bone', 'arrow', 'torch'];

export const ITEM_LABELS: Record<ItemKind, string> = {
  log: 'Logs',
  seed: 'Seeds',
  bone: 'Bones',
  arrow: 'Arrows',
  torch: 'Torches',
};

/** Items that appear on the ground; arrows and torches are craft-only. */
export type DroppedKind = Exclude<ItemKind, 'arrow' | 'torch'>;

/** How many of each item a recipe consumes. */
export type ItemCost = Partial<Record<ItemKind, number>>;
