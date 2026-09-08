export type ItemKind = 'log' | 'seed' | 'bone';

export const ITEM_KINDS: readonly ItemKind[] = ['log', 'seed', 'bone'];

export const ITEM_LABELS: Record<ItemKind, string> = {
  log: 'Logs',
  seed: 'Seeds',
  bone: 'Bones',
};
