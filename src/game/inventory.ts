import type { ItemKind } from './items';
import { ChangeSignal } from './signal';

export class Inventory {
  private readonly counts = new Map<ItemKind, number>();
  private readonly changed = new ChangeSignal<Inventory>();

  count(kind: ItemKind): number {
    return this.counts.get(kind) ?? 0;
  }

  add(kind: ItemKind, amount = 1): void {
    this.counts.set(kind, this.count(kind) + amount);
    this.changed.emit(this);
  }

  /** Registers `listener`, calling it immediately with the current state. */
  onChange(listener: (inventory: Inventory) => void): void {
    this.changed.subscribe(listener, this);
  }
}
