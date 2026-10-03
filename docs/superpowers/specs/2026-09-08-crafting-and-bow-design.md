# Crafting and the bow

Design spec. Written to be implemented from a fresh context together with
`CLAUDE.md`, which documents the codebase conventions this spec relies on
(weapon rig, `ActionTimer`, one-shot input, render gating, test style).

## Summary

Give logs and bones a purpose. The gun is removed; the player starts with only
the axe and must craft a **bow** from logs and bones to fight at range.
**Arrows** are crafted too, so wood and bone become an ongoing need. Crafting
happens in an overlay panel toggled with **C** while the game keeps running.
The bow is drawn by **holding attack** and fires an **arcing arrow** whose
range depends on how long it was drawn.

## Starting point (what exists today)

- `Player` (`src/game/player.ts`) holds `weapons: Record<WeaponKind, Weapon>`
  = `{ axe: Axe, gun: Gun }`, all models parented to the hand with inactive
  ones `visible = false`. `select(kind)` is refused mid-swing.
  `update(dt, input, cameraYaw)` returns `{ action, switched, active }`.
- `Weapon` (`src/game/weapons.ts`): `model`, `angle`, `swinging`,
  `armLocked`, `swing()`, `update(dt): WeaponAction | undefined`.
  `WeaponAction = { kind: 'strike' } | { kind: 'fire'; origin: Vector3 }`.
  `WeaponKind = 'axe' | 'gun'`, `WEAPON_SLOTS = ['axe', 'gun']`,
  `WEAPON_LABELS`. `ActionTimer` gives 0→1 progress and `crossed(point)`.
  Implementers: `Axe` (`axe.ts`), `Gun` (`gun.ts`), `Sword` (`sword.ts`,
  used by skeletons, has `cancel()`).
- `Gun` fires on `crossed(0)` and returns `{ kind: 'fire', origin }` from a
  `muzzle` marker; recoil lasts 0.3 s. Tested in `gun.test.ts`.
- `Projectiles` (`projectiles.ts`): straight bullets, `SPEED = 40`,
  `MAX_RANGE = 30`, sphere mesh. `fire(origin, direction)`; `update(dt)`
  returns `BulletPath[]` (`id`, `from`, `to`) for `Skeletons.shoot(from, to)`
  (segment-vs-cylinder, one hit); `remove(id)` on a hit.
- `Input` (`input.ts`): `isHeld(action)` for held keys; one-shot latches
  `consumeAttack()` (F keydown without `repeat`, or a left click whose drag
  distance stayed under 4 px, set on `mouseup`) and `consumeSlot()`
  (Digit1–9 → 0-based index). `'attack'` is also in the held set while F is
  down. Mouse button down is never in the held set; dragging orbits the camera.
- `ItemKind = 'log' | 'seed' | 'bone'` (`items.ts`), `ITEM_KINDS`,
  `ITEM_LABELS`. `Inventory` (`inventory.ts`): `count`, `add`, `onChange`.
  `Drops` (`drops.ts`) has `MODELS: Record<ItemKind, …>` for ground meshes.
- HUD (`hud.ts`): `bindInventoryHud`, `bindHealthHud`, `bindWeaponHud`
  (returns a setter highlighting the active slot with class `active`),
  `DamageFlash`, `FpsCounter`. Markup in `index.html`, styles in
  `src/style.css` (`#weapon .slot`, `#gameover[hidden] { display: none }`).
- `main.ts` wires everything: routes `strike` to skeletons then trees, `fire`
  to `projectiles.fire(origin, player.forward)`, and hit-tests bullet paths
  against skeletons.
- Drops: a felled tree yields `2 + round(scale)` logs (≈3) and 1–2 seeds; a
  skeleton drops 2–3 bones. Trees take 3 axe hits, skeletons 2 hits (axe or
  bullet).

## Goals

- A progression loop: chop and fight → gather → craft → fight better.
- A bow that feels different from the gun: drawn, arcing, ammo-limited.
- Reuse existing systems (inventory, HUD, projectiles, weapon interface)
  rather than adding parallel ones.

## Non-goals (v1)

- Draw-strength indicator in the HUD.
- Recovering fired arrows from the ground; arrows never appear as drops.
- Sound, crafting animations, a workbench/house location.
- Pausing the game while the panel is open.
- Keeping the gun as a third slot.

## Decisions and rationale

| Decision | Alternatives considered | Why |
|---|---|---|
| Bow replaces the gun | Bow as an upgrade beside the gun; keep both | Cleanest progression: no ranged option until you craft one. |
| Arrows are an `ItemKind` in the inventory | Ammo counter inside the bow | Inventory panel and change signal already exist; crafting adds items the same way pickups do. |
| Hold attack to draw, release to fire | Fixed elevation, camera-pitch aiming | Player controls range by skill; no coupling to the orbit camera. |
| Arrows arc under gravity | Straight flight | Makes the bow distinct and gives draw time meaning. |
| One skeleton hit per arrow | One-shot kill | Keeps skeletons dangerous; ammo cost is the balance lever. |
| Panel is a DOM overlay, game keeps running | Pause; keyboard-only | No pause state in the loop; DOM clicks don't reach the canvas so they don't trigger attacks. |
| Mouse click fires a minimum-power shot | Mouse hold to draw | Holding the mouse is camera drag; F is the draw key. |
| Recipes: bow = 3 logs + 2 bones; 5 arrows = 1 log + 1 bone | — | One tree plus one axe kill unlocks the bow; arrows stay cheap. |

## Input (`src/game/input.ts`)

- `Action` gains `'craft'`; `KeyC` maps to it. A new one-shot latch
  `consumeCraftToggle(): boolean` is set on `keydown` when `!e.repeat`, like
  `consumeAttack`.
- `'attack'` held semantics are unchanged: true while F is down, never for the
  mouse. Click-without-drag still latches one `consumeAttack()` on `mouseup`.
- `Escape` is not routed through `Input`; the panel binding listens for it.

## Weapon interface (`src/game/weapons.ts`)

- `WeaponKind = 'axe' | 'bow'`; `WEAPON_SLOTS = ['axe', 'bow']`;
  `WEAPON_LABELS = { axe: 'Axe', bow: 'Bow' }`.
- `Weapon` gains:
  - `release(): void` — ends a held action. `Axe` and `Sword` implement it as
    a no-op.
  - `readonly ammo?: ItemKind` — item consumed per shot. Only `Bow` sets it.
- `WeaponAction` becomes
  `{ kind: 'strike' } | { kind: 'fire'; origin: THREE.Vector3; speed: number }`.
- Delete `src/game/gun.ts` and `src/game/gun.test.ts`.

## Bow (`src/game/bow.ts`, new)

`export class Bow implements Weapon`, `readonly ammo = 'arrow'`.

Constants (tune by eye in the running game; tests assert relative behaviour):

```ts
const REST_ANGLE = 0.35;      // hanging arm, same value as Axe's REST_ANGLE
const AIM_ANGLE = -1.35;      // arm raised forward, same as the old gun
const GRIP_ANGLE = Math.PI / 2 - AIM_ANGLE; // held-item formula from CLAUDE.md
const RAISE_TIME = 0.2;       // arm goes from rest to aim during the first part of the draw
const DRAW_TIME = 0.8;        // time to reach full draw
const RECOVER_TIME = 0.25;    // after release, before the next draw
const MIN_SPEED = 12;         // arrow speed at zero draw
const MAX_SPEED = 30;         // arrow speed at full draw
const STRING_PULL = 0.35;     // how far (m) the string/arrow slide back at full draw
```

State (discriminated union on `this.state`):

```ts
type BowState =
  | { kind: 'idle' }
  | { kind: 'drawing'; held: number }   // seconds since swing()
  | { kind: 'recovering'; timer: ActionTimer; shot: number | undefined }; // shot = speed to report once
```

Behaviour:

- `swinging` is true unless `idle`. `armLocked` is true unless `idle`
  (the axe pattern: locked only during an action).
- `swing()`: only from `idle` → `drawing` with `held = 0`. Ignored otherwise.
- `release()`: only from `drawing` → `recovering`, computing
  `f = min(held / DRAW_TIME, 1)` and `shot = lerp(MIN_SPEED, MAX_SPEED, f)`.
  Ignored otherwise.
- `update(dt)`:
  - `drawing`: `held += dt`. `angle` eases from `REST_ANGLE` to `AIM_ANGLE`
    over `RAISE_TIME` (quadratic ease-out), then holds. String midpoint and
    nocked arrow slide back by `STRING_PULL * f` along the bow's −Z (toward
    the archer when aimed). Returns `undefined`.
  - `recovering`: on the first update after `release()` return
    `{ kind: 'fire', origin, speed: shot }` with `origin` read from the nock
    marker's `getWorldPosition` and then clear `shot`. The string snaps to
    rest immediately; `angle` lerps from `AIM_ANGLE` back to `REST_ANGLE`
    over the recovery via the `ActionTimer`; when it completes, `state =
    idle` and `angle = REST_ANGLE` exactly (snap, per the settle rule).
  - `idle`: returns `undefined`; `angle` stays `REST_ANGLE` (the arm follows
    the walk cycle because `armLocked` is false).
- Draw fraction `f` is exposed as `readonly draw: number` (0 when not
  drawing) for tests and a future HUD indicator.

Model (grip at the origin, long axis along +Y, so `model.rotation.x =
GRIP_ANGLE` points the arrow forward when the arm is at `AIM_ANGLE`):

- Two limbs: one `TubeGeometry` on a `CatmullRomCurve3` bowing toward +Z
  (away from the archer), from `(0, −0.6, 0)` through `(0, 0, 0.12)` to
  `(0, 0.6, 0)`, radius 0.025, `woodMat` from `mesh.ts`. `castShadow`.
- Grip wrap: small `CylinderGeometry` around the origin, dark material.
- String: a thin `CylinderGeometry` (radius 0.006, dark) between the limb
  tips; while drawing it is replaced visually by two segments meeting at the
  nock point pulled back along −Z. Implement as two thin cylinders whose
  position/rotation/scale are recomputed each frame from the nock position
  (`lookAt`-style or `quaternion.setFromUnitVectors`).
- Nock marker: an `Object3D` at the string midpoint (moves back with the
  draw); arrows spawn at its world position.
- Nocked arrow: an instance of the shared arrow mesh (see Projectiles) as a
  child of the nock marker, pointing along +Z, visible only while `drawing`.
- Geometries and materials are module-level constants.

## Projectiles (`src/game/projectiles.ts`)

- Rename bullets to arrows: `ArrowPath` (was `BulletPath`), internal `Arrow`.
- `fire(origin: Vector3, direction: Vector3, speed: number)`: `direction` is
  the player's horizontal forward. Launch velocity = `direction` rotated
  upward by `LAUNCH_ELEVATION = 8°` (rotate about the horizontal axis
  perpendicular to `direction`, i.e. `direction × up`) times `speed`.
- `GRAVITY = -9.8` applied to `velocity.y` each `update`; position advanced
  by `velocity * dt`; mesh oriented along the velocity each frame with
  `quaternion.setFromUnitVectors(FORWARD, velocity.normalized)`.
- Removal when `position.y < 0` or `age > MAX_FLIGHT_TIME = 4` s. Drop the
  30 m `MAX_RANGE`.
- Expected reach (flat ground, ~1.5 m launch height): full draw ≈ 25 m,
  minimum ≈ 5 m. Not asserted exactly.
- Arrow mesh: `export function buildArrow(): THREE.Object3D` — shaft
  `CylinderGeometry(0.015, 0.015, 0.8)` in `woodMat`, cone head
  `ConeGeometry(0.03, 0.1)` in a dark metal material, both rotated so the
  arrow runs along +Z with the head at the front; shared geometries and
  materials at module level. Used by both `Projectiles` and `Bow`.
- `update` still returns each arrow's swept segment; `Skeletons.shoot` is
  unchanged and deals one hit per arrow (two arrows kill a skeleton).
- `animating` unchanged (`arrows.length > 0`).

## Items and inventory

`src/game/items.ts`:

```ts
export type ItemKind = 'log' | 'seed' | 'bone' | 'arrow';
export const ITEM_KINDS: readonly ItemKind[] = ['log', 'seed', 'bone', 'arrow'];
export const ITEM_LABELS: Record<ItemKind, string> = { log: 'Logs', seed: 'Seeds', bone: 'Bones', arrow: 'Arrows' };
/** Items that appear on the ground; arrows are craft-only. */
export type DroppedKind = Exclude<ItemKind, 'arrow'>;
export type ItemCost = Partial<Record<ItemKind, number>>;
```

- `Drops` keys `MODELS` and `Drop.item` by `DroppedKind`; `spawn` takes a
  `DroppedKind`. Picked-up items are still reported as `ItemKind` to `main`.
- `style.css` gains `#inventory .item-arrow::before` (a thin diagonal bar or
  `➶`-style glyph in the same style as the log/seed/bone pseudo-icons).

`src/game/inventory.ts` gains:

```ts
has(cost: ItemCost): boolean            // every listed kind has at least that many
remove(kind: ItemKind, amount = 1): boolean // false and no change when short; emits on success
spend(cost: ItemCost): boolean          // all-or-nothing remove of every kind in cost; one emit
```

## Crafting (`src/game/crafting.ts`, new)

```ts
export type RecipeId = 'bow' | 'arrows';
export type RecipeOutput =
  | { kind: 'item'; item: ItemKind; amount: number }
  | { kind: 'weapon'; weapon: WeaponKind };
export interface Recipe { id: RecipeId; label: string; cost: ItemCost; output: RecipeOutput }

export const RECIPES: readonly Recipe[] = [
  { id: 'bow', label: 'Bow', cost: { log: 3, bone: 2 }, output: { kind: 'weapon', weapon: 'bow' } },
  { id: 'arrows', label: '5 Arrows', cost: { log: 1, bone: 1 }, output: { kind: 'item', item: 'arrow', amount: 5 } },
];

export type CraftResult = { ok: true; output: RecipeOutput } | { ok: false; reason: 'unaffordable' };
export function canCraft(recipe: Recipe, inventory: Inventory): boolean; // inventory.has(recipe.cost)
export function craft(recipe: Recipe, inventory: Inventory): CraftResult;  // spend on success
export function formatCost(cost: ItemCost): string; // "3 Logs · 2 Bones", in ITEM_KINDS order
```

`craft` does not apply the output; `main.ts` routes it (`item` →
`inventory.add(item, amount)`, `weapon` → `player.unlock(weapon)`), keeping
`crafting.ts` free of player/HUD references.

## Crafting panel (`hud.ts`, `index.html`, `style.css`)

`index.html`, after `#weapon`:

```html
<div id="crafting" hidden>
  <h2>Craft <kbd>C</kbd></h2>
  <div id="recipes"></div>
</div>
```

`style.css`: `#crafting[hidden] { display: none }` (required, see the
`#gameover` gotcha in CLAUDE.md). `#crafting` is a fixed panel on the right
above `#weapon` (e.g. `right: 12px; bottom: 60px; width: 220px`), dark
translucent background matching the other overlays, `pointer-events: auto`.
Rows: `.recipe` flex row with `.label`, `.cost` (muted), and a `button`;
`button:disabled` muted.

`hud.ts`:

```ts
export interface CraftingHud { toggle(): void; close(): void; readonly open: boolean }
export function bindCraftingHud(
  panel: HTMLElement,
  list: HTMLElement,
  inventory: Inventory,
  isUnlocked: (kind: WeaponKind) => boolean,
  onCraft: (recipe: Recipe) => void,
): CraftingHud
```

- Renders one `.recipe` row per recipe in `RECIPES` whose output is not an
  already-unlocked weapon. Button text `Craft`, disabled when
  `!canCraft(recipe, inventory)`.
- Rebuilds rows from `inventory.onChange` (fires immediately on subscribe)
  and again after `onCraft` returns (so the bow row disappears once
  unlocked).
- `toggle` flips `panel.hidden`; `close` sets it. A `keydown` listener on
  `window` for `Escape` calls `close`.
- Buttons are inside the overlay, so clicks never reach the canvas
  `mousedown` handler and do not latch attacks.

`bindWeaponHud` change: it also needs lock state. New signature
`bindWeaponHud(container, initial, isUnlocked): (kind: WeaponKind) => void`;
each call of the returned setter re-applies `active` and toggles class
`locked` per slot from `isUnlocked`. `style.css`: `#weapon .slot.locked`
dims text further (`opacity: 0.4`) and adds `text-decoration: line-through`
on the label only, not the `kbd`.

## Player (`src/game/player.ts`)

- `weapons = { axe: new Axe(), bow: new Bow() }`.
- `private readonly unlocked = new Set<WeaponKind>(['axe'])`.
- `unlock(kind): boolean` — adds; returns true if it was newly added.
- `isUnlocked(kind): boolean`.
- `select(kind)` additionally returns false when `!this.unlocked.has(kind)`.
- `update(dt, input, cameraYaw, inventory: Inventory)`:
  - On `consumeAttack()`: if `weapon.ammo !== undefined &&
    inventory.count(weapon.ammo) === 0`, do nothing; else `weapon.swing()`.
  - After that, if `weapon.swinging && !input.isHeld('attack')`, call
    `weapon.release()`. For the axe this is a no-op. For the bow: with F,
    release happens when the key comes up; with a click, `held` was never
    true so release happens on the same frame as the press (minimum-power
    shot).
  - `active` already covers swinging frames, which includes drawing.
- `Player` gets only read access to `Inventory` (it calls `count`); the
  arrow is removed by `main.ts` on the `fire` action so all mutation stays in
  one place.

## main.ts wiring

```ts
const { action, switched, active } = player.update(dt, input, followCamera.yawAngle, inventory);
if (switched) showWeapon(player.weapon);
if (action?.kind === 'fire') {
  inventory.remove('arrow');
  projectiles.fire(action.origin, player.forward, action.speed);
}
if (input.consumeCraftToggle()) crafting.toggle();
```

- `crafting = bindCraftingHud(craftingEl, recipesEl, inventory, (k) => player.isUnlocked(k), (recipe) => { const r = craft(recipe, inventory); if (!r.ok) return; if (r.output.kind === 'item') inventory.add(r.output.item, r.output.amount); else if (player.unlock(r.output.weapon)) showWeapon(player.weapon); })`.
- Add `#crafting`/`#recipes` to the element lookup and the missing-element
  check; copy to typed consts if used inside `frame`.
- The panel is DOM, so opening it needs no `needsRender`.
- Hint text in `#hud`: `WASD move · Space jump · 1/2 axe or bow · F or click
  to attack, hold F to draw the bow · C craft · walk over drops to pick up ·
  drag mouse to look`.

## Tests (vitest, headless, `dt = 1/60`, allow one extra step on counts)

- `crafting.test.ts`: `canCraft` is false when one ingredient is short by
  one and true at exactly the cost; `craft` spends exactly the cost and
  returns `ok` with the recipe's output; a failed `craft` leaves counts
  unchanged and returns `{ ok: false, reason: 'unaffordable' }`;
  `formatCost({ log: 3, bone: 2 })` is `"3 Logs · 2 Bones"`.
- `inventory.test.ts`: `remove` refuses and returns false when short, and
  does not emit; `spend` is all-or-nothing across two kinds; `has` with a
  multi-item cost.
- `bow.test.ts`: `swing` sets `swinging`/`armLocked` and `angle` moves toward
  `AIM_ANGLE` (more negative each step, captured relative to the start);
  `release` after holding for `DRAW_TIME` yields a `fire` whose `speed` is
  greater than after releasing on the first frame; `origin` is a `Vector3`;
  `release` while idle does nothing; `swing` during recovery is ignored (no
  second `fire`); `swinging` becomes false and `angle === REST_ANGLE` after
  `RECOVER_TIME` (+1 step); `draw` is clamped to 1.
- `projectiles.test.ts`: after `fire`, the first returned path has `to.y >
  from.y`; later a path has `to.y < from.y`; the arrow is removed
  (`animating` false, no paths) within `MAX_FLIGHT_TIME`; a `speed` of 30
  lands farther from the origin (horizontal distance of the last path) than
  a speed of 12.
- `player.test.ts`: `select`-via-slot is refused while the bow is locked
  (`weapon` stays `'axe'`, `switched` false); allowed after `unlock('bow')`;
  with the bow selected and zero arrows, an attack leaves the weapon not
  `swinging`; with one arrow it starts drawing. Drive `Player.update` with a
  minimal fake `Input` (`isHeld`, `consumeAttack`, `consumeSlot`,
  `consumeCraftToggle`, `consumeMouseDelta`) — construct via an object
  literal typed as the `Input` public surface, or extract an `InputState`
  interface from `input.ts` for `Player.update` to accept.
- Update `weapons.test.ts` if it references the gun or slot list.

## Documentation to update in the same change

- `CLAUDE.md`: overview paragraph (bow instead of gun, crafting), layout list
  (`bow.ts`, `crafting.ts`, `items.ts` `DroppedKind`/`ItemCost`, `hud.ts`
  crafting panel, `projectiles.ts` arcs), conventions (hold/release weapon
  actions, `ammo`, unlockable slots), controls.
- `README.md`: controls and module list.

## Verification

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Then ask the
user to check at http://localhost:5173: start with axe only and slot 2 greyed;
C opens the panel; chop a tree and kill a skeleton, craft the bow, slot 2
unlocks; craft arrows; hold F to draw and release to shoot an arc; click for a
short shot; arrows hit skeletons (two kills one) and vanish on the ground;
zero arrows refuses to draw; Escape closes the panel.

## Rollout

Single branch, no data migration. Delete `gun.ts`/`gun.test.ts` and remove
the implementation plan under `docs/superpowers/plans/` when the feature is
done (keep this spec).

## Status

Design approved by the user on 2026-09-08. Next step: invoke the
`superpowers:writing-plans` skill against this spec to produce the
implementation plan, then implement with TDD. The spec file is untracked on
purpose (`docs/superpowers` is in the user's global gitignore).
