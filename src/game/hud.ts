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

/** Updates a DOM element with a smoothed frames-per-second reading twice a second. */
export class FpsCounter {
  private readonly el: HTMLElement;
  private frames = 0;
  private elapsed = 0;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  /** Call every tick; pass `rendered` so idle ticks don't count as frames. */
  update(dt: number, rendered: boolean): void {
    if (rendered) this.frames++;
    this.elapsed += dt;
    if (this.elapsed < 0.5) return;
    this.el.textContent = this.frames === 0 ? 'idle' : `${Math.round(this.frames / this.elapsed)} FPS`;
    this.frames = 0;
    this.elapsed = 0;
  }
}
