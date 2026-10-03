# Pond basin — design

Supersedes the rendering and terrain parts of `2026-09-30-pond-design.md`; the
wading, splash and keepout decisions there stand unless changed below.

## Goal

Make the pond actually contain water: today it is two flat discs floating 5 cm on
the grass. After this change the ground dips into a sandy bowl, the water surface
sits just below the grass rim, and the player, skeletons and boulders descend into
it (waist deep at the centre). Arrows land on the water. The renderer keeps idling:
everything added is static.

## Decisions

- **Shape:** a paraboloid bowl. With `r` the normalised ellipse radius (0 at the
  centre, 1 at the rim), the floor is `y = −DEPTH · (1 − r²)`, `DEPTH = 1.0` m. The
  floor is sand all the way to the rim, where it meets the grass at y = 0.
- **Water level:** `WATER_LEVEL = −0.2` m, a plane that cuts the bowl. The water is
  0.8 m deep at the centre (hip height is 0.61 m: waist deep). The shoreline is the
  plane–bowl intersection, at `r = √(1 − 0.2 / DEPTH) ≈ 0.894`; the outer ~10 % of
  each radius is exposed dry sand (~0.74 m on the 7 m axis, ~0.48 m on the 4.5 m
  one). The separate bank disc is removed.
- **Water look:** semi-transparent blue (`opacity` 0.7, `roughness` 0.3,
  `metalness` 0) so the sandy floor and submerged legs show through tinted. It could
  not be transparent before because the grid lines at y = 0 would have shown
  through; the grid is now cut out of the pond instead (below).
- **Ground:** the 400 m plane becomes a `ShapeGeometry` with one elliptical hole per
  pond. The hole is built from the *same* rim points as the bowl (not from
  `absellipse`, whose sampling density depends on `curveSegments` in a non-obvious
  way), so the two meshes share their rim vertices exactly and no sliver of sky
  shows at the seam.
- **Grid:** rebuilt as `LineSegments` from explicit segments, each grid line clipped
  against every pond (a quadratic per line and pond). Lines end at the rim, so the
  dry sand and the water are line-free.
- **Slowdown is depth-graded:** `speedFactor = 1 − (1 − WADE_SPEED_FACTOR) ·
  clamp(depth / WADE_DEPTH, 0, 1)` with `depth = surfaceAt − heightAt` and
  `WADE_DEPTH = 0.5` m. Full speed on the dry shore, `WADE_SPEED_FACTOR` (0.5) from
  0.5 m of water on. Still by position, grounded or airborne, so the held-jump
  loophole stays closed. This retires the "hard edge" limitation in `BACKLOG.md`.
- **Who follows the floor:** the player, living skeletons and boulders. Dropped items
  do not (they keep resting at y = 0, listed as a limitation: bones from a skeleton
  killed mid-pond hover above the water).
- **Torches:** refused on *water* (`surfaceAt > heightAt`), allowed on the dry shore;
  a placed torch stands at `heightAt`.
- **Layout unchanged:** one pond at `POND` (−9, −17), radii 7 × 4.5, yaw 0.6; tree and
  boulder keepouts as before.

## Terrain interface (`terrain.ts`)

```ts
export interface Terrain {
  /** Ground height under (x, z): 0 on the plain, negative in a pond. */
  heightAt(x: number, z: number): number;
  /** Where a falling thing stops: the water surface over water, else the ground. */
  surfaceAt(x: number, z: number): number;
  /** Fraction of normal walking speed at (x, z): 1 on dry land. */
  speedFactor(x: number, z: number): number;
}
export const FLAT_TERRAIN: Terrain = { heightAt: () => 0, surfaceAt: () => 0, speedFactor: () => 1 };
```

"In water" means `surfaceAt(x, z) > heightAt(x, z)`. "Wading" (for splash cues) stays
`speedFactor(x, z) < 1`, which is now true only where there is water under the feet.

## Ellipse maths (`ellipse.ts`, new, pure)

```ts
export interface Ellipse { x: number; z: number; radiusX: number; radiusZ: number; yaw: number }
/** (lx/rx)² + (lz/rz)² in the ellipse's frame: < 1 inside, 1 on the rim. */
export function normalizedRadiusSq(e: Ellipse, x: number, z: number, margin = 0): number;
export function contains(e: Ellipse, x: number, z: number, margin = 0): boolean;
/** `count` rim points (world XZ) at uniform angle steps, starting on the local +X axis, counter-clockwise in the local frame. */
export function outline(e: Ellipse, count: number): THREE.Vector2[];
/** Parametric range [t0, t1] ⊂ [0, 1] of segment a→b inside the ellipse, or undefined if it misses. */
export function segmentCut(e: Ellipse, ax: number, az: number, bx: number, bz: number): [number, number] | undefined;
```

- Frame convention as today (`collision.ts` boxes): `lx = dx·cos − dz·sin`,
  `lz = dx·sin + dz·cos` with `cos/sin` of `yaw`. `cos`/`sin` are computed per call
  (one pond, a handful of callers per frame; no caching struct).
- `segmentCut`: substitute `l(t) = l0 + t·d` into the ellipse equation, solve the
  quadratic, clamp the root interval to [0, 1]; `undefined` when the discriminant is
  negative or the clamped interval is empty. Tangent grazes (discriminant 0) return
  `undefined`.
- `outline` point `i` is the local point `(cos θᵢ · rx, sin θᵢ · rz)`, `θᵢ = 2πi / count`,
  mapped to world with the inverse of the frame transform (`x = lx·cos + lz·sin`,
  `z = −lx·sin + lz·cos`). The bowl rim ring uses the same formula in mesh-local
  space with the mesh's `rotation.y = yaw` and `scale (rx, 1, rz)` doing the mapping,
  so a test can assert the world positions agree to 1e-9.

## Ponds (`ponds.ts`)

- `Ponds(scene)` implements `Terrain`; `place(x, z, radiusX, radiusZ, yaw)` stores an
  `Ellipse` and adds two meshes; `contains(x, z, margin = 0)` delegates to
  `ellipse.ts`; `get ellipses(): readonly Ellipse[]` for the ground and grid.
- `heightAt`: 0 outside; `−DEPTH · (1 − r²)` inside, where `r² = normalizedRadiusSq`.
  Continuous at the rim. Overlapping ponds are out of scope (first hit wins).
- `surfaceAt`: 0 outside; `max(heightAt, WATER_LEVEL)` inside.
- `speedFactor`: the graded formula above. Exports: `WADE_SPEED_FACTOR` (0.5, kept),
  `DEPTH`, `WATER_LEVEL`, `WADE_DEPTH`, `RIM_SEGMENTS` (48).
- **Bowl mesh:** one shared unit geometry built once at module level: `RINGS` (10)
  concentric rings of `RIM_SEGMENTS` vertices plus a centre vertex, ring `k` at
  `r = k / RINGS`, `y = −DEPTH · (1 − r²)` (depth in metres is baked into the unit
  geometry; only X and Z scale per pond), indexed triangles, `computeVertexNormals`.
  Non-uniform scale is fine: three.js transforms normals with the normal matrix.
  Material: the existing sand `MeshStandardMaterial` (`roughness` 1). `receiveShadow`
  true, `castShadow` false. Positioned at `(x, 0, z)`, `scale (rx, 1, rz)`,
  `rotation.y = yaw`.
- **Water mesh:** the existing shared up-facing unit disc at `y = WATER_LEVEL`, same
  scale and yaw as the bowl. The part of the disc outside the waterline lies beneath
  the sand and is hidden by the depth test, so the disc needs no shrinking and the
  shoreline is exact. Material: `transparent: true, opacity: 0.7`, blue, `roughness`
  0.3, `metalness` 0, `receiveShadow` true, `castShadow` false, default `depthWrite`.
  Order of `root.add`: bowl, then water (tests rely on it).
- No `animating`; not in `scenery`.

## Ground and grid (`ground.ts`, new)

```ts
export const GROUND_SIZE = 400;
export const GRID_DIVISIONS = 200;
export function groundShape(size: number, holes: readonly Ellipse[]): THREE.Shape;
export function buildGround(size: number, holes: readonly Ellipse[]): THREE.Mesh;
export function gridSegments(size: number, divisions: number, cuts: readonly Ellipse[]): number[];
export function buildGrid(size: number, divisions: number, cuts: readonly Ellipse[]): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
```

- `groundShape`: a square `Shape` of `size` centred on the origin; per hole a
  `THREE.Path` built from `outline(e, RIM_SEGMENTS)` points **mapped to shape
  coordinates `(x, −z)`**, because the mesh gets `rotation.x = −π/2`, which sends local
  +Y to world −Z. A `Path` of line curves yields exactly its points from
  `getPoints`, whatever `curveSegments` is; `ShapeUtils` fixes hole winding itself.
- `buildGround`: `ShapeGeometry(shape)`, green `MeshStandardMaterial` (0x3fa34d, as
  today), `rotation.x = −π/2`, `receiveShadow`. The long triangles earcut produces
  from the hole to the corners are fine on a flat, uniformly lit plane.
- `gridSegments`: for each of the `divisions + 1` lines along X and along Z (as
  `GridHelper` lays them out), start with the full segment and subtract
  `segmentCut` for every pond; emit the remaining pieces as `[x0, 0, z0, x1, 0, z1, …]`.
- `buildGrid`: `LineSegments` with a position attribute from `gridSegments`, a
  `color` attribute filled with the grid colour (0x2e7d3a) and
  `LineBasicMaterial({ vertexColors: true, toneMapped: false })`, mirroring
  `GridHelper`, so `DayCycle`'s `grid.material.color.setScalar(unlit)` keeps dimming
  it. `DayCycle`'s `grid` parameter and field widen to
  `THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>`; a `GridHelper`
  (used in `daycycle.test.ts`) is still assignable.

## World (`world.ts`)

Order: scene, fog, lights → `colliders`, `forest`, `ponds`, `boulders(scene, colliders,
ponds)` → `addProps` → `buildGround(GROUND_SIZE, ponds.ellipses)` and
`buildGrid(GROUND_SIZE, GRID_DIVISIONS, ponds.ellipses)` added to the scene →
`DayCycle(scene, sun, hemisphere, fog, grid)`. `World` is unchanged in shape.

## Movement

### Player (`player.ts`)

- Replace the `y <= 0` landing with a ground test after the collider resolve:

  ```ts
  const ground = terrain.heightAt(px, pz);
  const sticks = this.grounded && py - ground <= STEP_DOWN;   // grounded: not jumped/knocked this frame
  if (py <= ground || sticks) { py = ground; velocity.y = 0; grounded = true; }
  ```

  `STEP_DOWN = 0.35` m. Walking down the bowl (≤ ~0.03 m per frame at 6 m/s on the
  steepest slope) keeps the player grounded, so legs animate and no `land` fires;
  stepping off a real ledge (> 0.35 m) goes airborne and lands normally. A jump sets
  `grounded = false` before this test, so it always leaves the ground;
  `knockBack` does the same.
- Landing cue: `splash` when wading, `land` otherwise (unchanged). Wading (`pace`) is
  still read once at the start of the frame.
- Everything else (camera focus at `position.y + 1`, listener, sword reach
  `playerPos.y < 1.2`, pickup `y < 1.5`) tolerates the ≤ 1 m dip without change.

### Skeletons (`skeletons.ts`)

- After `pushOut`, a living skeleton's `object.position.y = terrain.heightAt(x, z)`.
- `sink`: `position.y = terrain.heightAt(x, z) − 1.5 · k` (the corpse does not move
  in XZ during collapse/sink, so the height is stable).
- Spawns inside the pond are fine: the first update snaps them down. A small
  `skeletons.test.ts` pins the snap (below); positions stay private, the test reads
  the groups under the `Skeletons` root in the scene.

### Boulders (`boulders.ts`)

- `Boulders(scene, colliders, terrain: Terrain)` (**required**). `place` sets
  `group.position.y = terrain.heightAt(x, z)`. `update`: when the collider moved, set
  x, z **and** `y = heightAt`; a crumble uses `heightAt − 0.5 · scale · k`. The mesh
  is not tilted on the slope and does not roll.

### Arrows (`projectiles.ts`, `main.ts`)

- `Projectiles.update(dt, terrain: Terrain)` (**required**): an arrow lands when
  `position.y < terrain.surfaceAt(x, z)`; `landed` gets the position with
  `y = surfaceAt`. `main.ts` plays `splash` when the landing is on water
  (`ponds.surfaceAt(at.x, at.z) > ponds.heightAt(at.x, at.z)`), else `arrowMiss`.
  Arrows striking the dry shore are ordinary misses.

### Torches (`torches.ts`, `main.ts`)

- `place` refuses when `terrain.surfaceAt(at.x, at.z) > terrain.heightAt(at.x, at.z)`
  (was `speedFactor < 1`), still before the `MAX_TORCHES` eviction. The torch group is
  positioned at `at` **including `at.y`** (today `y` is forced to 0); `main.ts` sets
  `placeAt.y = ponds.heightAt(placeAt.x, placeAt.z)` so a torch on the shore stands
  on the sand.

## Tests

Conventions as in `CLAUDE.md`: constants imported, not literals; `dt = 1/60` with a
frame of slack; module-scope helpers and stubs; stubs list only the members they use
via `Terrain` typing (`{ heightAt: () => 0, surfaceAt: () => 0, speedFactor: () => 1 }`
stays complete; a partial object is not assignable, so update the existing
`SHALLOWS`/`WATER` stubs in `player.test.ts` and `torches.test.ts` to all three
members).

- `ellipse.test.ts` (new): `contains` inside/outside/just-either-side and with a
  margin on unrotated and rotated ellipses (move the ellipse cases from
  `ponds.test.ts`, keeping `Ponds.contains` covered by one delegating case);
  `normalizedRadiusSq` is 0 at the centre and 1 on a rim point; `outline` points
  all satisfy `normalizedRadiusSq ≈ 1`, count is right, point 0 is at
  `centre + rx · (cos yaw, −sin yaw)`; `segmentCut`: a chord through the centre
  gives symmetric `t`s, a segment fully inside gives `[0, 1]`, a miss and a tangent
  give `undefined`, a segment ending inside clamps `t1 = 1`.
- `ponds.test.ts`: `heightAt` is 0 outside, `−DEPTH` at the centre, ~0 just inside
  the rim, and decreases monotonically toward the centre along a radius;
  `surfaceAt` is `WATER_LEVEL` at the centre, `heightAt` on the dry shore (a point at
  `r = 0.97`), 0 outside; `speedFactor` is `WADE_SPEED_FACTOR` at the centre, 1 on the
  dry shore, strictly between the two at a point of water depth `WADE_DEPTH / 2`, and
  never below `WADE_SPEED_FACTOR`; `FLAT_TERRAIN` returns 0/0/1; meshes: two per pond
  in the order bowl then water, water at `y = WATER_LEVEL` with `transparent` true,
  bowl rim vertices (the outermost ring, in world space via `localToWorld` after
  `updateMatrixWorld`) have `y ≈ 0` and coincide with `outline(e, RIM_SEGMENTS)` to
  1e-9, the centre vertex is at `y = −DEPTH`, both meshes receive and don't cast
  shadows.
- `ground.test.ts` (new): `groundShape` hole `getPoints(1)` equals the outline mapped
  to `(x, −z)`; `buildGround` mesh has `rotation.x = −π/2` and `receiveShadow`;
  `gridSegments` with no ponds has `2 · (divisions + 1)` segments spanning `±size/2`;
  with one pond, no segment endpoint lies strictly inside it and every endpoint that
  is not on the outer border satisfies `normalizedRadiusSq ≈ 1`; a line through the
  pond centre yields two pieces; `buildGrid` has `vertexColors` and a `color`
  attribute.
- `player.test.ts`: on a slope stub (`heightAt: (_x, z) => Math.max(−1, 0.25 · z)`,
  `surfaceAt` the same, `speedFactor` 1) walking along −Z for 60 frames ends with
  `position.y ≈ heightAt(x, z)`, no `land` cue after the first frame and legs moving
  (`active`); walking back up tracks too; a cliff stub (`heightAt: (_x, z) => z < −3 ? −1 : 0`)
  produces exactly one `land` and ends at y = −1; a jump on the slope leaves the
  ground (`y > heightAt` on the next frame) and lands with one `land`; the existing
  wading tests pass with the stubs completed.
- `boulders.test.ts`: construct with `FLAT_TERRAIN`; on a slope stub a pushed
  boulder's mesh `y` equals `heightAt` at its collider after `update`; a crumble on a
  stub of height −1 sinks from −1.
- `projectiles.test.ts`: `update(dt, FLAT_TERRAIN)` lands at y = 0 as before; with
  `surfaceAt: () => 5` an arrow fired from y = 1 lands on the first frame with
  `landed[0].y === 5`.
- `torches.test.ts`: `WATER` = `{ heightAt: () => −1, surfaceAt: () => WATER_LEVEL,
  speedFactor: () => WADE_SPEED_FACTOR }` refused; a dry-shore stub
  (`heightAt = surfaceAt = −0.1`, `speedFactor` 1) accepted.
- `skeletons.test.ts` (new): `new Skeletons(scene)`, one `update(1/60, farPlayer,
  new Colliders(), [], SUNKEN)` with `SUNKEN = { heightAt: () => −1, surfaceAt: () => −1,
  speedFactor: () => 1 }`: every child group of the skeletons' root has `position.y === −1`.
- `world.test.ts`: spawn dry (`heightAt(0, 0) === 0`, `speedFactor` 1); pond centre has
  `heightAt === −DEPTH` and `surfaceAt === WATER_LEVEL`; boulders clear of water as
  before; the scene contains exactly one `LineSegments`.
- `daycycle.test.ts`: unchanged (a `GridHelper` still satisfies the widened type).

## Docs

- `CLAUDE.md`: intro sentence (a sandy basin, waist deep, arrows land on the water);
  layout entries for `ellipse.ts` and `ground.ts`; rewrite the `ponds.ts` entry
  (bowl + transparent water, `heightAt`/`surfaceAt`, graded slowdown, `ellipses`);
  `terrain.ts` (three members); `world.ts` (ground and grid built after the ponds
  from `ground.ts`); `Boulders` constructor and `Projectiles.update` take a
  `Terrain`; `Torches.place` refuses water by `surfaceAt > heightAt`; `Player`
  follows `heightAt` with the step-down rule; `Skeletons` snap to `heightAt`;
  add this spec to the implemented list under Design; verification tip: a stub
  `Terrain` must list all three members.
- `BACKLOG.md`: in "Pond polish" drop the "flat glossy blue disc" and "shoreline"
  wording (keep sky tint, cheap animation and several ponds); remove the "hard edge"
  limitation; reword the drops limitation (drops rest at y = 0 and hover over the
  water; boulders and arrows now follow the basin); remove "The water's look at
  night and at 25 m zoom was only checked by eye once" only if re-checked.
- Ask the user to check by eye at http://localhost:5173: the rim seam (no sky sliver),
  the shoreline, the grid ending at the rim, wading depth, and the water at night.

## Out of scope

Ripples or animated water, environment-map reflections, a sky-tinted surface,
swimming or drowning, drops that float or sink, boulders rolling or tilting on the
slope, fish, several ponds, overlapping ponds, and camera collision with the bowl.
