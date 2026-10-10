import { canCraft, formatCost, RECIPES, type Recipe } from './crafting';
import { formatClock, sunElevation } from './daycycle';
import { Health } from './health';
import type { Inventory } from './inventory';
import { ITEM_KINDS, ITEM_LABELS } from './items';
import { WEAPON_LABELS, WEAPON_SLOTS, type WeaponKind } from './weapons';

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

export function bindHealthHud(container: HTMLElement, health: Health): void {
  const hearts = Array.from({ length: Health.MAX }, () => {
    const heart = document.createElement('span');
    heart.className = 'heart';
    heart.textContent = '♥';
    container.append(heart);
    return heart;
  });

  health.onChange((h) => {
    hearts.forEach((el, i) => el.classList.toggle('empty', i >= h.hearts));
  });
}

/** Renders the weapon slots; returns a setter that highlights the active one and re-reads lock state. */
export function bindWeaponHud(
  container: HTMLElement,
  initial: WeaponKind,
  isUnlocked: (kind: WeaponKind) => boolean,
): (kind: WeaponKind) => void {
  const slots = WEAPON_SLOTS.map((kind, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    const key = document.createElement('kbd');
    key.textContent = String(i + 1);
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = WEAPON_LABELS[kind];
    slot.append(key, label);
    container.append(slot);
    return [kind, slot] as const;
  });

  const set = (kind: WeaponKind): void => {
    for (const [k, el] of slots) {
      el.classList.toggle('active', k === kind);
      el.classList.toggle('locked', !isUnlocked(k));
    }
  };
  set(initial);
  return set;
}

/** Shows the in-game time with a sun or moon glyph; skips the DOM while the minute is unchanged. */
export function bindClock(el: HTMLElement): (phase: number) => void {
  let shown = '';
  return (phase: number): void => {
    const text = `${sunElevation(phase) >= 0 ? '☀' : '☾'} ${formatClock(phase)}`;
    if (text === shown) return;
    shown = text;
    el.textContent = text;
  };
}

/** Shows the speaker glyph for the mute state; returns a writer that skips the DOM when unchanged. */
export function bindMuteHud(el: HTMLElement, muted: boolean): (muted: boolean) => void {
  let shown: boolean | undefined;
  const set = (m: boolean): void => {
    if (m === shown) return;
    shown = m;
    el.textContent = m ? '🔇 M' : '🔊 M';
  };
  set(muted);
  return set;
}

/** Fills `meter` with the bow's draw fraction; hidden while nothing is drawn. Skips the DOM when unchanged. */
export function bindDrawMeter(meter: HTMLElement): (draw: number) => void {
  const fill = document.createElement('div');
  fill.className = 'fill';
  meter.append(fill);
  let shown = -1;
  return (draw: number): void => {
    if (draw === shown) return;
    shown = draw;
    meter.hidden = draw <= 0;
    fill.style.width = `${Math.round(draw * 100)}%`;
  };
}

/** Seconds the drained bar lingers after the kill before fading. */
const BOSS_LINGER_MS = 1000;

/**
 * Souls-style boss bar: a red fill with a pale ghost that drains after it, shown while the
 * boss is awake; on the kill the bar drains, lingers and fades, and the banner plays once.
 * Returns the per-frame update; it only touches the DOM when a value changed.
 */
export function bindBossHud(
  boss: HTMLElement,
  bar: HTMLElement,
  felled: HTMLElement,
): (health: number, max: number, awake: boolean, dead: boolean) => void {
  const ghost = document.createElement('span');
  ghost.className = 'ghost';
  const fill = document.createElement('span');
  fill.className = 'fill';
  bar.append(ghost, fill);
  felled.addEventListener('animationend', () => {
    felled.hidden = true;
  });

  let shownHealth = -1;
  let shownAwake = false;
  let shownDead = false;
  return (health: number, max: number, awake: boolean, dead: boolean): void => {
    if (health !== shownHealth) {
      const width = `${(100 * Math.max(0, health)) / max}%`;
      fill.style.width = width;
      if (health > shownHealth) {
        // Healing: the ghost must never lead the fill, so it jumps without its delayed transition.
        ghost.style.transition = 'none';
        ghost.style.width = width;
        void ghost.offsetWidth;
        ghost.style.transition = '';
      } else {
        ghost.style.width = width;
      }
      shownHealth = health;
    }
    if (!dead && awake !== shownAwake) {
      boss.classList.toggle('visible', awake);
      shownAwake = awake;
    }
    if (dead && !shownDead) {
      shownDead = true;
      fill.style.width = '0%';
      ghost.style.width = '0%';
      window.setTimeout(() => boss.classList.remove('visible'), BOSS_LINGER_MS);
      felled.hidden = false;
    }
  };
}

/** Full-screen tint that fades out; call `flash` when the player is hurt. */
export class DamageFlash {
  private readonly el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  flash(): void {
    // Restart the CSS animation even if it is already running.
    this.el.classList.remove('hurt');
    void this.el.offsetWidth;
    this.el.classList.add('hurt');
  }
}

export interface CraftingHud {
  toggle(): void;
  close(): void;
  readonly open: boolean;
}

/**
 * Renders one row per recipe whose one-time output is not already owned, re-rendering
 * whenever the inventory changes. `onCraft` applies the recipe; the panel
 * re-renders after it so a freshly owned weapon's or upgrade's row disappears.
 */
export function bindCraftingHud(
  panel: HTMLElement,
  list: HTMLElement,
  inventory: Inventory,
  owned: (recipe: Recipe) => boolean,
  onCraft: (recipe: Recipe) => void,
): CraftingHud {
  const render = (): void => {
    list.replaceChildren();
    for (const recipe of RECIPES) {
      if (owned(recipe)) continue;
      const row = document.createElement('div');
      row.className = 'recipe';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = recipe.label;
      const cost = document.createElement('span');
      cost.className = 'cost';
      cost.textContent = formatCost(recipe.cost);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Craft';
      button.disabled = !canCraft(recipe, inventory);
      button.addEventListener('click', () => {
        onCraft(recipe);
        render();
      });
      row.append(label, cost, button);
      list.append(row);
    }
  };

  const close = (): void => {
    panel.hidden = true;
  };

  inventory.onChange(render);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') close();
  });

  return {
    toggle: () => {
      panel.hidden = !panel.hidden;
    },
    close,
    get open() {
      return !panel.hidden;
    },
  };
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
