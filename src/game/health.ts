type Listener = (health: Health) => void;

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
  private readonly listeners: Listener[] = [];

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
    this.emit();
    return true;
  }

  /** Advances timers; returns true if the heart count changed. */
  update(dt: number): boolean {
    this.sinceDamage += dt;
    if (this.dead || this.current >= MAX_HEARTS || this.sinceDamage < REGEN_DELAY) return false;
    this.regenTimer += dt;
    if (this.regenTimer < REGEN_DELAY) return false;
    this.regenTimer = 0;
    this.current++;
    this.emit();
    return true;
  }

  onChange(listener: Listener): void {
    this.listeners.push(listener);
    listener(this);
  }

  private emit(): void {
    for (const l of this.listeners) l(this);
  }
}
