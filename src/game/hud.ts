import type { Inventory } from './inventory';
import { ITEM_KINDS, ITEM_LABELS } from './items';

export function bindInventoryHud(container: HTMLElement, inventory: Inventory): void {
  const rows = new Map(
    ITEM_KINDS.map((kind) => {
      const row = document.createElement('div');
      row.className = `item item-${kind}`;
      const label = document.createElement('span');
      label.textContent = ITEM_LABELS[kind];
      const count = document.createElement('strong');
      row.append(label, count);
      container.append(row);
      return [kind, count] as const;
    }),
  );

  inventory.onChange((inv) => {
    for (const [kind, el] of rows) el.textContent = String(inv.count(kind));
  });
}
