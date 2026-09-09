import { canCraft, formatCost, RECIPES, type Recipe } from './crafting';
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
 * Renders one row per recipe whose output is not already unlocked, re-rendering
 * whenever the inventory changes. `onCraft` applies the recipe; the panel
 * re-renders after it so a freshly unlocked weapon's row disappears.
 */
export function bindCraftingHud(
  panel: HTMLElement,
  list: HTMLElement,
  inventory: Inventory,
  isUnlocked: (kind: WeaponKind) => boolean,
  onCraft: (recipe: Recipe) => void,
): CraftingHud {
  const render = (): void => {
    list.replaceChildren();
    for (const recipe of RECIPES) {
      if (recipe.output.kind === 'weapon' && isUnlocked(recipe.output.weapon)) continue;
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

  inventory.onChange(render);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') panel.hidden = true;
  });

  return {
    toggle: () => {
      panel.hidden = !panel.hidden;
    },
    close: () => {
      panel.hidden = true;
    },
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
