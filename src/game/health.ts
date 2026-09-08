import { ChangeSignal } from './signal';

const MAX_HEARTS = 10;
/** Seconds after taking damage during which further hits are ignored. */
const INVULNERABLE_DURATION = 0.8;
/** Seconds without damage before regeneration starts, and between regenerated hearts. */
const REGEN_DELAY = 5;

/** Player hit points in whole hearts, with post-hit invulnerability and slow regeneration. */
export class Health {
  static readonly MAX = MAX_HEARTS;
  private current = MAX_HEARTS;
  private sinceDamage = Infinity;
  private regenTimer = 0;
  private readonly changed = new ChangeSignal<Health>();

  get hearts(): number {
    return this.current;
  }

  get dead(): boolean {
    return this.current <= 0;
  }

  /** Applies damage unless invulnerable or dead; returns true if hearts were lost. */
  damage(amount = 1): boolean {
    if (this.dead || this.sinceDamage < INVULNERABLE_DURATION) return false;
    this.current = Math.max(0, this.current - amount);
    this.sinceDamage = 0;
    this.regenTimer = 0;
    this.changed.emit(this);
    return true;
  }

  /** Advances the invulnerability and regeneration timers. */
  update(dt: number): void {
    this.sinceDamage += dt;
    if (this.dead || this.current >= MAX_HEARTS || this.sinceDamage < REGEN_DELAY) return;
    this.regenTimer += dt;
    if (this.regenTimer < REGEN_DELAY) return;
    this.regenTimer = 0;
    this.current++;
    this.changed.emit(this);
  }

  /** Registers `listener`, calling it immediately with the current state. */
  onChange(listener: (health: Health) => void): void {
    this.changed.subscribe(listener, this);
  }
}
