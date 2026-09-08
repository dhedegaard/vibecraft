/** Listener list for a value that changes over time. */
export class ChangeSignal<T> {
  private readonly listeners: ((value: T) => void)[] = [];

  /** Registers `listener` and calls it immediately with `current`. */
  subscribe(listener: (value: T) => void, current: T): void {
    this.listeners.push(listener);
    listener(current);
  }

  emit(value: T): void {
    for (const l of this.listeners) l(value);
  }
}
