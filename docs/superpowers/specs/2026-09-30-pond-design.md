# Pond — design

## Goal

Break up the flat plane with a pond: a patch of water the player and skeletons can
wade through at half speed. It adds terrain texture and a little tactics (slowing
through water hurts when chased), and it is the prerequisite for the Fish idea in
`BACKLOG.md`. Rendering stays cheap and the renderer keeps idling.

## Decisions

- **Role:** a wade-through slow zone. Not a barrier, not a refuge.
- **Shape and count:** one large landmark pond, an ellipse roughly 14 × 9 m, placed
  where the player sees it from the start.
- **Who is slowed:** the player and living skeletons, both to 50 %, **by position,
  grounded or airborne**. Jumping does not help: a held Space re-jumps on every
  landing and would otherwise cross water at ~98 % speed, defeating the slowdown
  (skeletons cannot jump).
- **Look:** a static glossy surface. No ripples, no animation, no environment-map
  reflections; the sun/moon/torch highlights a low-roughness material already picks
  up are all the shine it gets.
- **Other things:** torches cannot be planted on water; boulders, drops and arrows
  ignore the pond (cosmetic, noted as a limitation).

## Terrain interface (`terrain.ts`, new)

```ts
export interface Terrain {
  /** Fraction of normal walking speed at ground position (x, z): 1 on dry land. */
  speedFactor(x: number, z: number): number;
}
export const FLAT_TERRAIN: Terrain = { speedFactor: () => 1 };
```

- `Player`, `Skeletons` and `Torches` import this small module, not the mesh code.
- Movement and torch code only ever use `speedFactor`; "wading" means
  `speedFactor(x, z) < 1`. `Ponds.contains` exists for layout code (trees, boulders)
  and tests.

## Ponds (`ponds.ts`, new)

- `Ponds(scene)` implements `Terrain`. `place(x, z, radiusX, radiusZ, yaw)` adds a
  pond; `contains(x, z, margin = 0): boolean` is the ellipse test with both radii
  grown by `margin`; `speedFactor(x, z)` returns `WADE_SPEED_FACTOR` (exported,
  0.5) inside and 1 outside.
- Ellipse test: rotate the offset into the pond's frame with the same convention as
  `collision.ts` boxes (`lx = dx·cos − dz·sin`, `lz = dx·sin + dz·cos`,
  `cos/sin` of `yaw`; this is the exact inverse of three's `rotation.y`), then
  `(lx/rx)² + (lz/rz)² ≤ 1`. A pond with `yaw = π/2` has its long axis along Z.
- Mesh per pond: two flat discs sharing **one unit `CircleGeometry(1, 48)` with
  `rotateX(−π/2)` baked in once** (the wrong sign faces the disc down, where it is
  back-face culled and invisible from above). Each mesh is scaled `(rx, 1, rz)` and
  given `rotation.y = yaw`. A **sandy bank** at y = 0.03 uses radii `rx + 0.5` and
  `rz + 0.5` (an even ring, not a proportional scale) under the **water** at
  y = 0.05 using `rx`, `rz`. Both are opaque, because `GridHelper` lines at y = 0
  ignore the lights and would otherwise show through. Materials are module-level
  constants:
  - water `MeshStandardMaterial`: blue, `roughness` ~0.3, `metalness` 0 (with no
    environment map, metalness only removes diffuse light, and a mirror-like
    surface would almost never catch the sun from the start view);
  - bank `MeshStandardMaterial`: sand, `roughness` 1.
- Shadows: both discs `receiveShadow = true` and `castShadow = false` (do not use
  `shadowed()`: a flat caster that also receives, with no shadow bias anywhere,
  gets shadow acne; and a non-receiving bank would lose tree and player shadows).
- No per-frame work and no `animating`: `Ponds` is not in `scenery`. The 2 cm and
  4 cm offsets are fine for the camera's near/far (0.1 / 500); check once by eye at
  25 m zoom and at night (hold Y to fast-forward) that the water reads.
- World layout: one pond at **(−9, −17)**, radii **7 × 4.5**, yaw **0.6**. That is
  ~19 m from the spawn, ahead-left of the start view and nearer its centre than a
  pond further left (the house is ahead-right), ~22 m from the house, with its long
  side turned toward the camera. The spawn is dry.

## Movement and skeletons

- `Player.update(dt, input, cameraYaw, inventory, colliders, terrain)` (**required**
  parameter; a forgotten hookup in `main.ts` would silently make the pond cosmetic):
  - the horizontal velocity is multiplied by `terrain.speedFactor` at the player's
    position at the start of the frame, grounded or not; knockback is not scaled.
  - leg-cycle speed already derives from the velocity and displacement
    (`groundSpeed`), so the walk animation slows with no extra work.
  - a footstep taken while wading pushes `splash` instead of `footstep`, and
    landing in water pushes `splash` instead of `land` (both unpositioned, like the
    player's other sounds).
- `Skeletons.update(dt, playerPos, colliders, repellers, terrain)` (**required**):
  - walk and chase speeds passed to `advance` are multiplied by the factor at the
    skeleton's own position. The `speed` fed to `groundSpeed` needs no scaling:
    `groundSpeed` already caps the intended speed by the covered distance.
  - stagger is not scaled.
  - a step while wading pushes a positioned `splash` instead of `skeletonStep`
    (the check uses the position after `pushOut`, where the existing cue is pushed).
  - a walk may time out early while wading (the time budget assumes full speed);
    it then rests and re-picks, which is harmless.
- `Torches.place(at, colliders, terrain = FLAT_TERRAIN)`: refuses a spot where
  `terrain.speedFactor(at.x, at.z) < 1`. The refusal goes **before** the
  `MAX_TORCHES` eviction, so a refused placement at the cap puts no torch out.
- `main.ts` passes `ponds` to all three.

## World layout (`props.ts`, `world.ts`, `boulders.ts`)

- `createWorld` builds `Ponds` and returns it in `World`; `addProps` takes it.
- The pond is placed before the trees. The tree loop rejects a sample within
  `1.5 m` of the pond (`ponds.contains(x, z, 1.5)`), the same `continue` pattern
  as the spawn and house clearances. If the seed-42 layout has a trunk there, the
  trees after it shift (and the boulder spots with them); that is accepted and
  nothing pins the exact layout. The implementer reports whether it shifts.
- `boulderSpots(rand, colliders, house, water)` gains a required fourth parameter
  `water: { contains(x: number, z: number, margin: number): boolean }`; a spot is
  rejected when `water.contains(x, z, boulderRadius(scale) + PLACE_MARGIN)`. Call
  sites in tests pass a stub.

## Sound

New `SoundKind` `splash` in `sounds.ts`, with a recipe in `synth.ts`: a bandpassed
noise burst sweeping down plus a short falling sine, about 0.12 s, tuned by ear.
The exhaustive `never` default in `playRecipe` forces the recipe.

## Tests

Expected values derive from exported constants (`WADE_SPEED_FACTOR`), not literals;
simulations at `dt = 1/60` with one frame of slack; helpers and stub terrains at
module scope (oxlint `consistent-function-scoping`), stubs written `() => k` (no
unused parameters).

- `ponds.test.ts`: inside/outside points on an unrotated and a rotated pond
  (`yaw = π/2` swaps the long axis); points just inside and just outside each
  radius; `contains` with a margin; `speedFactor` is `WADE_SPEED_FACTOR` inside and
  1 outside; `FLAT_TERRAIN` is 1 everywhere; `place` adds two meshes per pond and
  a second pond works.
- `player.test.ts` (the `step()` helper gains a `terrain` parameter defaulting to
  `FLAT_TERRAIN`): with a stub terrain of factor `WADE_SPEED_FACTOR` the player
  covers about that fraction of the dry distance over the same frames; holding
  forward and jump in water covers clearly less than on dry ground (the jump
  loophole stays closed); walking in water emits `splash` and no `footstep`, on dry
  land the reverse; landing in water emits `splash` and no `land`; `active` goes
  false after stopping in water (idle rendering).
- `torches.test.ts`: `place` is refused on a stub water terrain and accepted on dry
  land; with `MAX_TORCHES` torches placed, a refused water placement leaves the
  count unchanged.
- `boulders.test.ts`: `boulderSpots` with a stub `water` that covers a large area
  puts every spot outside it; existing calls pass a never-contains stub.
- `world.test.ts` (new): `createWorld()` runs headless (nothing in world, daycycle,
  props, trees or boulders touches `document`/`window`); the spawn is dry
  (`speedFactor(0, 0) === 1`); every boulder in `boulders.snapshot` satisfies
  `!ponds.contains(b.x, b.z, b.radius)`.
- `Skeletons` has no unit tests; its wading logic is one multiplication and the
  factor itself is tested through `Ponds`.

## Docs

- `CLAUDE.md`: layout entries for `terrain.ts` and `ponds.ts`, the intro sentence,
  the `Player`/`Skeletons`/`Torches` update/place signatures (terrain parameter),
  the world-layout line (pond at (−9, −17), trees reject 1.5 m around it),
  `boulderSpots`'s `water` parameter, and the pond spec in the implemented-specs
  list under Design.
- `BACKLOG.md`: remove the Pond entry (the Fish entry, which exists in the working
  tree's uncommitted edit, stays and loses its "needs the pond first" caveat; do
  not stage over it blindly); add limitations: boulders, drops and arrows ignore
  the pond.

## Out of scope

Ripples or any animated water, environment-map reflections, swimming or drowning,
a depth gradient, fish, drops that sink or float, boulders blocked or sunk by
water, a refuge effect, more than one pond, and pinning the exact tree layout.
