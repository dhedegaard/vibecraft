export type ItemKind = 'log' | 'seed' | 'bone' | 'arrow';

export const ITEM_KINDS: readonly ItemKind[] = ['log', 'seed', 'bone', 'arrow'];

export const ITEM_LABELS: Record<ItemKind, string> = {
  log: 'Logs',
  seed: 'Seeds',
  bone: 'Bones',
  arrow: 'Arrows',
};

/** Items that appear on the ground; arrows are craft-only. */
export type DroppedKind = Exclude<ItemKind, 'arrow'>;

/** How many of each item a recipe consumes. */
export type ItemCost = Partial<Record<ItemKind, number>>;
