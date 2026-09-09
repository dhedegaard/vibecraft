import { ITEM_KINDS, type ItemCost, type ItemKind } from './items';
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

  /** True when every kind listed in `cost` is held in at least that amount. */
  has(cost: ItemCost): boolean {
    for (const kind of ITEM_KINDS) {
      const needed = cost[kind];
      if (needed !== undefined && this.count(kind) < needed) return false;
    }
    return true;
  }

  /** Takes `amount` of `kind`; returns false and changes nothing when short. */
  remove(kind: ItemKind, amount = 1): boolean {
    if (this.count(kind) < amount) return false;
    this.counts.set(kind, this.count(kind) - amount);
    this.changed.emit(this);
    return true;
  }

  /** Takes every kind in `cost` at once, or nothing if any is short. */
  spend(cost: ItemCost): boolean {
    if (!this.has(cost)) return false;
    for (const kind of ITEM_KINDS) {
      const needed = cost[kind];
      if (needed !== undefined) this.counts.set(kind, this.count(kind) - needed);
    }
    this.changed.emit(this);
    return true;
  }

  /** Registers `listener`, calling it immediately with the current state. */
  onChange(listener: (inventory: Inventory) => void): void {
    this.changed.subscribe(listener, this);
  }
}
