export type ItemKind = 'log' | 'seed';

export const ITEM_KINDS: readonly ItemKind[] = ['log', 'seed'];

export const ITEM_LABELS: Record<ItemKind, string> = {
  log: 'Logs',
  seed: 'Seeds',
};
