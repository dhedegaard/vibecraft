import { ITEM_KINDS, type ItemKind } from './items';

type Listener = (inventory: Inventory) => void;

export class Inventory {
  private readonly counts = new Map<ItemKind, number>(ITEM_KINDS.map((k) => [k, 0]));
  private readonly listeners: Listener[] = [];

  count(kind: ItemKind): number {
    return this.counts.get(kind) ?? 0;
  }

  add(kind: ItemKind, amount = 1): void {
    this.counts.set(kind, this.count(kind) + amount);
    this.emit();
  }

  onChange(listener: Listener): void {
    this.listeners.push(listener);
    listener(this);
  }

  private emit(): void {
    for (const l of this.listeners) l(this);
  }
}
