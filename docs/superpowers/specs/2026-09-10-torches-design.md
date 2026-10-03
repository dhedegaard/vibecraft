# Torches — design

Status: approved 2026-09-10.

## Goal

Give the player a craftable, placeable light source that skeletons will not
enter. Torches are the defensive counterpart to the day/night cycle: a warm
point light in the world, carried in the inventory as an item and planted in
front of the player with `T`. They burn for two in-game days, dim over their
last half minute, then vanish.

## Item and recipe

- `items.ts`: new `ItemKind` `'torch'`, label `Torches`. Craft-only, so
  `DroppedKind` becomes `Exclude<ItemKind, 'arrow' | 'torch'>`.
- `crafting.ts`: new `RecipeId` `'torches'`, label `2 Torches`, cost
  `{ log: 1, bone: 1 }`, output `{ kind: 'item', item: 'torch', amount: 2 }`.
  The crafting panel and inventory HUD pick it up with no changes.

## Input

- `input.ts`: `KeyT` becomes `'place'`, a one-shot action latched on `keydown`
  (ignoring `e.repeat`) and drained by `consumePlace()`. Fast-forward moves
  from `T` to `Y` (`KeyY: 'fastForward'`, still polled with `isHeld`).
- `InputState` gains `consumePlace(): boolean`; `FakeInput` in tests gets a
  `place` flag.

## Torches module

New `src/game/torches.ts` exporting `Torches` and the tuning constants
`TORCH_LIFETIME`, `TORCH_DIM_SECONDS`, `MAX_TORCHES`, `TORCH_REPEL_RADIUS`,
`TORCH_SPACING`.

- **Mesh.** Each torch is a `THREE.Group` at ground level: a stick (shared
  `CylinderGeometry`, `woodMat`, ~1.2 m tall) and a flame (small
  `ConeGeometry` on top, `MeshBasicMaterial`, warm orange, cloned per torch so it
  can dim alone). The stick casts a shadow via `shadowed`; the flame does not.
- **Light pool.** three.js keys its shader programs on the number of point
  lights in the scene, so adding or removing a light recompiles every material
  (a visible hitch). `Torches` therefore creates `MAX_TORCHES = 8`
  `THREE.PointLight`s in its constructor, adds them all to the scene at once
  with `intensity = 0`, and hands a free one to each torch (parented to the
  torch group, returned to the pool with intensity 0 on removal). The light
  count is constant for the whole session and the cap is structural. Each
  light: colour `0xffa040`, `intensity` `TORCH_INTENSITY = 9` (physical units;
  a tuning value to be calibrated against the night palette in the browser),
  `distance` 9, `decay` 2, `castShadow = false`. The 9 m lit radius is
  deliberately larger than the 5 m repel radius so skeletons pacing at the
  rim stand in the light.
- **State.** `{ object, light, flame, remaining }` per torch, in placement
  order. `TORCH_LIFETIME = 2 * CYCLE_SECONDS` (300 s of real time).
  `TORCH_DIM_SECONDS = 30`: while `remaining < TORCH_DIM_SECONDS`, light
  intensity and flame scale are multiplied by `remaining / TORCH_DIM_SECONDS`.
  At `remaining <= 0` the torch is removed from the scene and the list.
- **`place(at: Vector3, colliders: Colliders): boolean`.** Refused (returns
  `false`, caller keeps the item) when `at` is within `TORCH_SPACING = 1` m of
  an existing torch or when `colliders.resolve(copy, 0.15)` reports a move
  (the spot is inside a trunk or the house). Otherwise a torch is added at
  `(at.x, 0, at.z)`; if the list already holds `MAX_TORCHES` the oldest is
  removed first. Sets `animating`.
- **`update(dt)`.** `dt` is already scaled by the caller (see Wiring), so a
  torch ages 40× under fast-forward and "two in-game days" stays true against
  the clock. Ticks every `remaining`. Visual changes are applied in coarse
  steps: an accumulator applies the dimming and removals every 0.5 s.
  `animating` is `true` only on a step that actually dimmed or removed a torch
  (a full-strength torch changes nothing for 270 s and must not wake the
  renderer), and on the frame after `place`. No per-frame flicker; it would
  keep the renderer awake.
- **`repellers`.** Read-only view `readonly Circle[]` (`Circle` from
  `repel.ts`: `{ position: Vector3; radius: number }`), radius
  `TORCH_REPEL_RADIUS = 5`, one entry per live torch, rebuilt on place/remove
  (not per frame).

## Skeleton avoidance

`collision.ts` already has the push-out geometry: `pushOutOfCircle(pos,
radius, circle)` and the bounded pass loop in `Colliders.resolve`. Export
`pushOutOfCircle` (and `MAX_PASSES`) rather than writing a second copy. New
`src/game/repel.ts` exports the `Circle` interface (`{ position: Vector3;
radius: number }`) and
`pushOutOfCircles(pos: Vector3, circles: readonly Circle[]): boolean`, which
calls `pushOutOfCircle(pos, 0, c)` for each circle and repeats up to
`MAX_PASSES` until nothing moves. A point exactly at the centre is pushed
along +X (whatever `pushOutOfCircle` does for a zero offset; the test pins it).
Returns whether it moved.

`Skeletons.update(dt, playerPos, colliders, repellers)` gains the fourth
parameter and passes it to the existing per-skeleton `pushOut` step, which
runs once for every living skeleton after the behaviour switch. Inside
`pushOut`, `pushOutOfCircles(pos, repellers)` runs first, then
`colliders.resolve`, then the `separate` calls, so the trunk and player rules
keep the last word:

- A chasing skeleton whose player is inside a torch circle advances, is pushed
  back to the rim in the same frame, and so stands at the rim; it gives up when
  the player is past `LOSE_RANGE` as today.
- A skeleton already inside a circle (a torch planted on top of it, or a
  torch placed while it rested there) is moved to the rim on its next update,
  whatever its behaviour, because `pushOut` runs for every behaviour. No
  special state is needed.
- A blocked chaser's legs run at `groundSpeed` (distance actually covered per
  second), so it stands still at the rim instead of walking in place. Only living
  skeletons heed the repel; a toppling corpse stays where it fell.
- Known limitation: a trunk straddling the rim can push a skeleton back into
  the circle on the collider pass. Bounded by `MAX_PASSES`, cosmetic, accepted.
- `attack` is unchanged: it needs `ATTACK_RANGE = 1.7` m, so a player more
  than 1.7 m inside the rim of a 5 m circle cannot be hit; at the rim they can.
- Walk targets are not filtered; a walk into a circle simply ends at the rim
  and times out via the existing `WALK_GRACE` budget.

## Wiring (`main.ts`)

```ts
const torches = new Torches(scene);
scenery.push(torches);
...
const fastForward = input.isHeld('fastForward');
if (input.consumePlace() && inventory.count('torch') > 0) {
  placeAt.copy(player.position).addScaledVector(player.forward, 1);
  if (torches.place(placeAt, colliders)) inventory.remove('torch');
}
torches.update(fastForward ? dt * FAST_FORWARD : dt);
...
dayCycle.update(dt, fastForward, ...);
const { killed, damage } = skeletons.update(dt, player.position, colliders, torches.repellers);
```

`placeAt` is a module-level scratch `Vector3`. Placement runs before
`skeletons.update` so a torch dropped on a skeleton pushes it out the same
frame.

## Day cycle

No coupling. The point light is additive, so a torch is dramatic at night and
barely visible at noon. Torches repel skeletons at every time of day.

## Tests

- `repel.test.ts`: a point outside all circles is untouched; a point inside
  one lands on the rim along the radial; a point inside two overlapping
  circles ends outside both within the pass budget; the exact-centre case
  moves along +X.
- `torches.test.ts` (headless `THREE.Scene`): the scene holds exactly
  `MAX_TORCHES` point lights before and after any number of placements and
  removals; `place` adds a torch and sets `animating`; a ninth placement
  removes the first and its light returns to intensity 0; placement within
  `TORCH_SPACING` or inside a collider is refused and returns `false`;
  `repellers` has one entry per torch with `TORCH_REPEL_RADIUS`; stepping
  `dt = 1/60` for `TORCH_LIFETIME - TORCH_DIM_SECONDS` seconds leaves full
  intensity and never sets `animating` after the placement frame, then
  intensity decreases monotonically to removal (allow one extra step) with
  `animating` true only on 0.5 s step frames; `update(dt * FAST_FORWARD)`
  ages a torch `FAST_FORWARD` times faster. Derive every expected value from
  the exported constants.
- `crafting.test.ts`: the torches recipe is affordable with 1 log and 1 bone
  and yields 2 torches.
- `input`/`player` tests: `FakeInput.consumePlace` added; no behaviour change
  to `Player`.

## Docs

CLAUDE.md: add `torches.ts` and `repel.ts` to the layout, the recipe to the
design section, `T` (place torch) and `Y` (fast-forward) to the controls, and
a convention note that point lights are a fixed pool created at startup
(changing the light count recompiles every shader) with `castShadow` off.
