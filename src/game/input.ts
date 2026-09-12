export type Action = 'forward' | 'back' | 'left' | 'right' | 'jump' | 'attack' | 'craft' | 'place' | 'fastForward' | 'mute';

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
  KeyC: 'craft',
  KeyT: 'place',
  KeyY: 'fastForward',
  KeyM: 'mute',
};

/** Digit keys select weapon slots; the player decides which slots exist. */
const SLOT_KEY = /^Digit([1-9])$/;

/** Mouse movement under this many pixels between down and up counts as a click, not a drag. */
const CLICK_TOLERANCE = 4;

export interface MouseDelta {
  x: number;
  y: number;
}

/** The read side of `Input`: what game systems (and tests) consume each frame. */
export interface InputState {
  isHeld(action: Action): boolean;
  /** Returns accumulated mouse drag since last call and resets it. */
  consumeMouseDelta(): MouseDelta;
  /** True once per attack request (F key or a click without drag). */
  consumeAttack(): boolean;
  /** Weapon slot index pressed since the last call (0-based), if any. */
  consumeSlot(): number | undefined;
  /** True once per press of the craft key. */
  consumeCraftToggle(): boolean;
  /** True once per press of the place key (a torch). */
  consumePlace(): boolean;
  /** True once per press of the mute key. */
  consumeMute(): boolean;
}

export class Input implements InputState {
  private readonly held = new Set<Action>();
  private dragging = false;
  private dragDistance = 0;
  private delta: MouseDelta = { x: 0, y: 0 };
  private attackRequested = false;
  private craftRequested = false;
  private placeRequested = false;
  private muteRequested = false;
  private slotRequested: number | undefined;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      // Leave OS/browser shortcuts (Cmd/Ctrl+C, Alt-tab, ...) alone.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const slot = SLOT_KEY.exec(e.code)?.[1];
      if (slot !== undefined) {
        if (!e.repeat) this.slotRequested = Number(slot) - 1;
        e.preventDefault();
        return;
      }
      const action = keyBindings[e.code];
      if (action) {
        if (action === 'attack' && !e.repeat) this.attackRequested = true;
        if (action === 'craft' && !e.repeat) this.craftRequested = true;
        if (action === 'place' && !e.repeat) this.placeRequested = true;
        if (action === 'mute' && !e.repeat) this.muteRequested = true;
        this.held.add(action);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      // No modifier guard here: a key released while a modifier is still down
      // (e.g. letting go of A after tapping Cmd) must still clear `held`, or
      // that action gets stuck on. Deleting an action never added is a no-op.
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

  /** True once per press of the craft key. */
  consumeCraftToggle(): boolean {
    const out = this.craftRequested;
    this.craftRequested = false;
    return out;
  }

  /** True once per press of the place key (a torch). */
  consumePlace(): boolean {
    const out = this.placeRequested;
    this.placeRequested = false;
    return out;
  }

  /** True once per press of the mute key. */
  consumeMute(): boolean {
    const out = this.muteRequested;
    this.muteRequested = false;
    return out;
  }
}
