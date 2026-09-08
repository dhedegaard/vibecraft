export type Action = 'forward' | 'back' | 'left' | 'right' | 'jump';

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
};

export interface MouseDelta {
  x: number;
  y: number;
}

export class Input {
  private readonly held = new Set<Action>();
  private dragging = false;
  private delta: MouseDelta = { x: 0, y: 0 };

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      const action = keyBindings[e.code];
      if (action) {
        this.held.add(action);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      const action = keyBindings[e.code];
      if (action) this.held.delete(action);
    });
    window.addEventListener('blur', () => this.held.clear());

    target.addEventListener('mousedown', () => (this.dragging = true));
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.delta.x += e.movementX;
      this.delta.y += e.movementY;
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
}
