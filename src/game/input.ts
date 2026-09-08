export type Action = 'forward' | 'back' | 'left' | 'right' | 'jump' | 'attack' | 'slot1' | 'slot2';

const keyBindings: Record<string, Action> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  KeyF: 'attack',
  Digit1: 'slot1',
  Digit2: 'slot2',
};

const SLOT_ACTIONS: Partial<Record<Action, number>> = { slot1: 0, slot2: 1 };

/** Mouse movement under this many pixels between down and up counts as a click, not a drag. */
const CLICK_TOLERANCE = 4;

export interface MouseDelta {
  x: number;
  y: number;
}

export class Input {
  private readonly held = new Set<Action>();
  private dragging = false;
  private dragDistance = 0;
  private delta: MouseDelta = { x: 0, y: 0 };
  private attackRequested = false;
  private slotRequested: number | undefined;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      const action = keyBindings[e.code];
      if (action) {
        if (!e.repeat) {
          if (action === 'attack') this.attackRequested = true;
          const slot = SLOT_ACTIONS[action];
          if (slot !== undefined) this.slotRequested = slot;
        }
        this.held.add(action);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      const action = keyBindings[e.code];
      if (action) this.held.delete(action);
    });
    window.addEventListener('blur', () => this.held.clear());

    target.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.dragDistance = 0;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this.dragging) return;
      this.dragging = false;
      if (this.dragDistance < CLICK_TOLERANCE) this.attackRequested = true;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.delta.x += e.movementX;
      this.delta.y += e.movementY;
      this.dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
    });
  }

  isHeld(action: Action): boolean {
    return this.held.has(action);
  }

  /** Returns accumulated mouse drag since last call and resets it. */
  consumeMouseDelta(): MouseDelta {
    const out = { ...this.delta };
    this.delta = { x: 0, y: 0 };
    return out;
  }

  /** True once per attack request (F key or a click without drag). */
  consumeAttack(): boolean {
    const out = this.attackRequested;
    this.attackRequested = false;
    return out;
  }

  /** Weapon slot index pressed since the last call (0-based), if any. */
  consumeSlot(): number | undefined {
    const out = this.slotRequested;
    this.slotRequested = undefined;
    return out;
  }
}
