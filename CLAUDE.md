# vibecraft

A 3D browser game: a mouse character with an axe in a world of trees, skeletons,
boulders and a pond, with a day/night cycle, crafting (bow, arrows, torches, stone axe)
and synthesised Web Audio. A big cat, Mittenz, sleeps in a rock cave 40 m straight ahead of the spawn, red eyes glowing in the mouth; come within 10 m or hit it and it wakes with a yowl, chases at 5 m/s, pounces (2 hearts) and swipes (1 heart), and stalks back to heal if you get 25 m away or lead it 25 m from its bed. It takes 8 axe hits (4 stone, arrows count 1) under a souls-style boss bar; dead, it drops bones and a whisker and skeletons never enter the cave again. Gameplay rules are under Controls; world layout under Conventions.

## Stack

- Vite + vanilla TypeScript (no framework)
- three.js for rendering
- npm (lockfile: `package-lock.json`)

## Commands

- `npm run dev` – dev server (Vite, default http://localhost:5173)
- `npm run build` – typecheck (`tsc`) then production build
- `npm run typecheck` – `tsc --noEmit` only
- `npm run lint` – oxlint with type-aware rules (`.oxlintrc.json`: correctness errors, suspicious warnings)
- `npm run preview` – serve the production build
- `npm test` – run the vitest suite once (`npm run test:watch` for watch mode)

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and build on pushes to main and PRs; check the latest run with `gh run list --branch main --limit 1` (the new run takes ~20 s to appear after the push; make sure the title matches your merge; the Bash tool blocks `sleep`, so wait with `until gh run list --branch main --limit 1 --json headSha --jq '.[0].headSha' | grep -q "$(git rev-parse HEAD)"; do sleep 3; done`) and follow it with `gh run watch <id> --exit-status`.
Vercel reports separately: `gh api repos/dhedegaard/vibecraft/commits/<sha>/status --jq '.statuses[] | select(.context=="Vercel") | .state'` (empty/`pending` for ~1 min after the push; poll). A clean `npm run lint` prints nothing and exits 0.
`gh run watch` prints little but annotations; confirm with `gh run list --branch main --limit 1 --json status,conclusion`.
Feature work goes on a branch and lands with `git merge --no-ff` into main (never squash); after pushing, watch CI with the commands above and delete the branch.

## Verification

- Verify with `npm run typecheck`, `npm run lint`, `npm test`, then `npm run build`; Vite's
  ">500 kB chunk" warning is expected (three.js) and can be ignored.
- Tests are vitest files co-located as `src/game/*.test.ts` and run in Node
  without a renderer; three.js math and `Object3D` work headless, so test game
  logic (timers, targeting, health, weapon keyframes, state machines) rather
  than rendering or the HUD DOM. Drive simulations with a fixed `dt = 1/60`
  and allow one extra step on frame counts: accumulated float steps land just
  short of the duration. Assert on behaviour relative to the instance (capture
  `angle`/`model.rotation.x` before acting, check sign and monotonicity) rather
  than exporting a module's private tuning constants for the test.
  Drive `Player` in tests with a scripted `FakeInput implements InputState`
  (see `player.test.ts`): set `attack`/`slot`/`held` before a frame, and keep
  attack out of `held` to exercise the click path.
  Where two eased phases overlap (the bow's raise ease-out under a linear
  draw), assert monotonicity within each phase, not across the boundary.
  Movement tests: hold `forward` with camera yaw 0 and the player walks along −Z
  at 6 m/s, so 120 frames cover ~12 m; pass a `Colliders` to `step` to test blocking.
  Collision tests: never put a character exactly at contact distance
  (`radius + 0.4` can round either way); start it 0.1 m clear or clearly
  overlapping, and hand-derive positions before running.
  `Skeletons` has almost no unit tests (positions are private and seeded;
  `skeletons.test.ts` only checks the scene groups' heights), so keep its logic
  in helper modules (`collision.ts`, `targeting.ts`) and test those.
  Declare test helpers (`makeCycle`, `hex`) at module scope; oxlint's
  `consistent-function-scoping` warns on functions nested in `describe`.
  The reverse also bites: a module-scope helper must not share a name with one
  nested in any `describe` in the file (`no-shadow`); grep the file first.
  `no-shadow` also fires on a module-scope scratch `const` (`forward`, `to`) that a function
  parameter in the same file reuses; name scratch vectors distinctly (`facingDir`, `offset`).
  Vitest does not typecheck: a test calling a changed signature fails at runtime
  (`x.contains is not a function`), not with a type error; run `npm run typecheck` too.
  Tuning constants (`CYCLE_SECONDS`, `START_PHASE`) change often: derive
  expected values in tests from the exported constants, never from literals.
  Mesh vertex positions are `Float32BufferAttribute`s (~1e-7 relative error,
  ~4e-7 m at radius 7), so compare world-space vertices with
  `toBeCloseTo(x, 5)`, never 9; call `updateMatrixWorld(true)` before
  `localToWorld`.
  Time-scaled tests (fast-forward): compute the frame count from the real
  `DT` (`frames = seconds / DT`) and call `update(dt * scale)` per frame;
  dividing by the scaled step cancels the scale and the test can never fail.
  Randomised tests use `seededRandom` from `props.ts`, never `Math.random`.
  To inspect a value (no `tsx`; vitest hides `console.log`), put a throwaway
  `src/game/zz-*.test.ts` that asserts on a string of it, read the failure
  output, then delete the file.
  Interface stubs in tests (`Terrain`, `Keepout`) list every member of the
  interface but take only the parameters they use (`_`-prefix a skipped leading
  one: `heightAt: (_x, z) => 0.25 * z`); `{ contains: (x) => x < 10 }` is
  assignable and passes `noUnusedParameters`.
  Lock in renderer idling: after motion settles, assert `PlayerUpdate.active`
  is false or `update` returns false (trunk-push and camera zoom tests).
  A new `consume*` method on `InputState` must be added to both test fakes:
  `FakeInput` in `player.test.ts` and `WheelInput` in `camera.test.ts`.
- Browser automation (Playwright, Chrome DevTools MCP, Chrome extension) does
  not work in this environment. Ask the user to check visual changes at
  http://localhost:5173; a dev server is usually already running with HMR, so
  don't start a second one.

## Design

- Design specs live in `docs/superpowers/specs/` and plans in `docs/superpowers/plans/` (the repo `.gitignore` un-ignores them; the global one excludes `docs/superpowers`, so older specs may still be untracked); `2026-09-08-crafting-and-bow-design.md` (crafting panel, bow replaces gun, arcing arrows) and `2026-09-10-day-night-cycle-design.md` (2½-minute cycle, sun/moon path, palette, coarse-stepped sky) are implemented; so are `2026-09-30-boulders-design.md` (pushable boulders, chip into stone, stone axe), `2026-09-30-pond-design.md` (wade-through pond, `Terrain` interface) and `2026-09-30-pond-basin-design.md` (basin, `heightAt`/`surfaceAt`, ground holes, clipped grid).
- Drop yields for balancing: a felled tree gives `2 + round(scale)` logs (~3) and 1–2 seeds; a skeleton drops 2–3 bones (`drops.ts`); a boulder (4 hit points) gives 1 stone per plain hit and 2 on the crumbling hit, so 5 at axe damage 1 and 3 at stone-axe damage 2 (`boulders.ts`).
- `2026-09-10-torches-design.md` (craftable torches, pooled point lights, skeleton repel circles) and `2026-09-12-sound-design.md` (synthesised Web Audio soundscape, `SoundCue` routing, positional bus, ambient bed) are implemented, as is `2026-10-03-cat-boss-design.md` (the cave, the cat's state machine, boss bar, whisker drop, cat cues).
- `BACKLOG.md` (tracked) lists feature ideas, tuning to revisit and accepted cosmetic limitations; offer it when asked what to build next and tick entries off when they land.

## Layout

- `index.html` – single canvas (`#game`) plus HUD overlays (`#hud`, `#clock`, `#inventory`, `#hearts`, `#weapon` slots, `#draw` meter, `#fps`, `#cpu-panel`, `#mute`, `#damage` tint, `#gameover` overlay, `#crafting` panel with `#recipes` list, `#boss` bar (bottom 100 px; `main.ts` closes `#crafting` when the cat wakes because they overlap under ~1180 px) and `#boss-felled` banner)
- Top-right HUD pills stack at `top` 12 px (`#fps`), 48 px (`#cpu-panel`,
  a 32 px canvas plus padding), 100 px (`#mute`); the next one goes at ~136 px.
- `src/main.ts` – bootstrap: renderer, game loop, resize handling
- `src/game/world.ts` – scene, lights, fog; owns the `Colliders` and the `DayCycle`, creates the `Forest`, the `Ponds`, the `Boulders` and the `Cave` (built before `addProps`; `createWorld` returns `{ scene, forest, boulders, ponds, cave, colliders, dayCycle }`) and calls `addProps`, then builds the ground and grid from `ground.ts` around the ponds
- `src/game/daycycle.ts` – `sunElevation(t)`/`sunDirection(t)` (tilted-plane sun path, day 60 % of the cycle), `lightingAt(elevation)` palette (sky/fog, sun, hemisphere, moon, fog range, star opacity, unlit brightness), `clockTime`/`formatClock` (06:00 sunrise, 18:00 sunset, 12 h per half-cycle), `DayCycle` owning sun/moon lights, background, fog, grid tint and the camera-centred sky group (discs, stars); `update(dt, fastForward, cameraPos, focus)` applies a visual step every 1/600 cycle and sets `animating` only then; one shadow caster at a time, handed over at the horizon
- `src/game/props.ts` – house (registers its footprint as a rotated box collider), seeded random helper, world layout (places the pond (`POND`: (−9, −17), radii 7 × 4.5 m, yaw 0.6), plants trees via `Forest` (samples within 1.5 m of the pond are rejected, as are those within 9 m of the cave (`TREE_CAVE_MARGIN` 1.5 + `CAVE_RADIUS` 7.5), which call `forest.skip(rand)` to consume the draws so the rest of the layout is unchanged), then places boulders from `boulderSpots` with its own `seededRandom(99)` stream); `addProps(scene, forest, boulders, ponds, cave, colliders)`
- `src/game/boulders.ts` – `Boulders`: pushable rock meshes (constructor `Boulders(scene, colliders, terrain)`; shared unit geometry, `pushable` circle colliders, radius 0.9 × scale, 4 hit points), `chip(origin, forward, damage)` returns `{ result: 'miss' } | { result: 'hit' | 'crumbled', at }`, `update` syncs meshes to colliders, runs wobble/crumble and returns the `StoneDrop`s queued by `chip` (1 stone per plain hit, 2 on the crumble); `boulderSpots(rand, colliders, house, keepouts)` is the pure seeded placement helper (`keepouts` is a list of `Keepout`s, `[ponds, cave]`, satisfied by `Ponds` and `Cave`); meshes sit at `terrain.heightAt` and follow it when pushed; `animating` is set when a collider moved, wobbles or crumbles; it is in `scenery` and `update` runs after `skeletons.update`
- `src/game/cave.ts` – `Cave`: the rock mound at `CAVE` (0, −42) (three lumps and a lintel in `stoneMat`, a black inset in the mouth), three circle colliders leaving the bed pocket open, `bed` (`BED` (0, −41), yaw 0 facing the spawn) and `contains(x, z, margin)` as a `Keepout`; built in `createWorld` before `addProps`, returned as `World.cave`
- `src/game/cat.ts` – `Cat`: the boss rig (two `Legs` pairs, the front under `frontPivot` for the swipe; unlit `MeshBasicMaterial` eyes with halos, `fog: false`, no point light) and behaviour union sleep → wake → chase → pounce/swipe → retreat (give up at `LOSE_RANGE` from the player or `LEASH_RANGE` from the bed, re-engage only within `DETECT_RANGE` and inside `LEASH_RANGE − LEASH_SLACK`; the retreat has a time budget (`RETREAT_GRACE` beyond the walk home) and the cat sleeps where it stands when it runs out, so the cave's corners can't wedge it; heals on `HEAL_INTERVAL` while retreating or asleep) → collapse → sink → gone; `hit(origin, forward, damage)` (reach `MELEE_REACH + BODY_RADIUS`) and `shoot` wake a sleeper and turn a retreater back, never stagger; `update(dt, playerPos, colliders, terrain)` returns `{ damage, hitFrom, killed, sounds }`; `repellers` is one `SHELTER_RADIUS` circle at the bed once dead; `awake` drives the boss bar; every tuning constant is exported for the tests
- `src/game/trees.ts` – `Forest`: tree meshes (unit geometry, uniformly scaled per tree), chop hit-testing, fall/sink animation, stumps; `chop` returns `'miss' | 'hit' | 'felled'`; `plant` registers a permanent trunk circle collider (the stump keeps it); `skip(rand)` consumes the draws a rejected spot's `plant` would have made; `count` is the number of trees planted
- `src/game/weapons.ts` – `Weapon` interface a character's arm drives (`model`, `angle`, `swinging`, `armLocked`, `swing`, `release`, `update`, optional `ammo`, `draw` and `offHandAngle`), `WeaponAction` (`strike` | `fire` with `origin` and `speed`), `ActionTimer` (shared one-shot clock with `crossed(point)` for the hit frame), `WeaponKind`, slot order and labels
- `src/game/axe.ts` – axe model and swing keyframes (raise overhead, chop down in front); `update` returns `STRIKE` on the hit frame; `tier` (`wood`/`stone`), `damage` (1/2) and `upgrade()` swap the head material; `Player.axeDamage` feeds `Forest.chop` and `Boulders.chip`
- `src/game/bow.ts` – `Bow`: limbs along model Z, arrow along +Y; state machine idle → drawing (hold) → recovering; `release` only freezes the draw fraction, `update` keeps raising the arm and fires with `{ kind: 'fire', origin, speed }` from the nock marker the moment it reaches aim (immediately for a release after the raise, on a later frame for a release mid-raise); `draw` exposes the 0–1 draw fraction, frozen at release
- `src/game/crafting.ts` – `RECIPES` (bow, arrows, torches, one-time stone axe), `canCraft`, `craft` (spends, returns a `CraftResult`; `main.ts` applies the output: item, weapon unlock or axe upgrade), `isOwned` (hides a one-time row), `formatCost`
- `src/game/targeting.ts` – `nearestInCone` (closest target in the melee reach/facing cone) and the shared `MELEE_REACH`/`MELEE_FACING` constants used by trees, skeletons and boulders; `nearestInCone` takes an optional trailing `reach` (default `MELEE_REACH`; the cat passes `MELEE_REACH + BODY_RADIUS`); `segmentHitsCylinder(from, to, base, radius, height)` is the shared arrow-vs-body test (returns the segment parameter or `undefined`), used by `Skeletons.shoot` and `Cat.shoot`
- `src/game/knockback.ts` – `shoveStep(distance, duration, t, dt)`: per-frame distance of an eased-out shove, differenced from a position curve so the steps sum to `distance` at any frame rate; used by the skeleton stagger and `Player.knockBack`
- `src/game/topple.ts` – `beginTopple`/`applyTopple`: hinge-at-the-base fall animation shared by felled trees and dying skeletons
- `src/game/motion.ts` – `turnToward` (eased yaw; snaps within 0.005 rad and returns whether it is still turning), `stepForward`, `forwardOf`, `groundSpeed` (walk-cycle speed from the distance a step actually covered, so a body held by a push-out stops its legs), `settle` (exponential ease that snaps onto its target)
- `src/game/collision.ts` – `Collider` (`circle` | rotated `box`, XZ only), `Colliders.resolve(pos, radius)` (iterated minimum-translation push-out of statics, returns whether the *character* moved; a `pushable` circle gives way first via `pushBoulder`: it is shifted by the overlap, stopped by statics, other boulders and optional `blockers`, and the pusher is pushed back for what it could not absorb; `{ pushes: false }` treats it as static), `separate(anchor, ra, other, rb)` for character pairs, `CHARACTER_RADIUS`; exports `pushOutOfCircle`, `MAX_PASSES` and `CircleCollider` for `repel.ts`. `overlaps(pos, radius)` is the side-effect-free probe (use it, not `resolve`, to ask "is this spot taken?"); `remove(collider)` drops one.
- `src/game/repel.ts` – `Circle` no-go zones and `pushOutOfCircles` (point push-out built on `collision.ts`'s exported `pushOutOfCircle`/`MAX_PASSES`)
- `src/game/terrain.ts` – `Terrain` (`heightAt` ground, `surfaceAt` water-or-ground, `speedFactor`) and `FLAT_TERRAIN`; `Player.update`, `Skeletons.update`, `Projectiles.update` and the `Boulders` constructor take a `Terrain` (required), `Torches.place` a defaulted one
- `src/game/ellipse.ts` – pure ellipse maths on XZ (`Ellipse`, `normalizedRadiusSq`, `contains` with margin, `outline(e, count)` rim points, `segmentCut` parametric clip), the `collision.ts` box yaw convention
- `src/game/ground.ts` – `buildGround(size, holes)`: the plain as a `ShapeGeometry` with a hole per pond traced by the pond's own `outline` points (shape y = −world z); `buildGrid(size, divisions, cuts)`: `GridHelper`'s layout as vertex-coloured `LineSegments`, every line clipped at the pond rims (`gridSegments`); `GROUND_SIZE` 400, `GRID_DIVISIONS` 200
- `src/game/ponds.ts` – `Ponds implements Terrain`: elliptical basins (`place(x, z, rx, rz, yaw)`, `contains`, `ellipses`); floor `heightAt = −DEPTH·(1 − r²)` (1 m at the centre), `surfaceAt = max(floor, WATER_LEVEL)` (`WATER_LEVEL` −0.2), `speedFactor` grades from 1 at the waterline to `WADE_SPEED_FACTOR` 0.5 at `WADE_DEPTH` 0.5 m of water; per pond a shared unit paraboloid bowl (sand, `RIM_SEGMENTS` 48 × 10 rings, last ring = rim in `outline` order) scaled (rx, 1, rz) and a see-through water disc at `WATER_LEVEL` whose overhang hides under the sand; receive shadows, cast none; no `animating`, not in `scenery`
- `src/game/torches.ts` – `Torches`: a pool of `MAX_TORCHES` point lights created at startup, torch meshes, `place(at, colliders, terrain = FLAT_TERRAIN)` (refused inside a collider, on water (`surfaceAt > heightAt`) or within `TORCH_SPACING`; stands at `at` including its y, which `main.ts` sets to `ponds.heightAt`; the water check runs before the cap, which otherwise puts the oldest out), `update(dt)` ages torches (caller scales `dt` for fast-forward) and dims/removes them in 0.5 s steps, `repellers` for skeletons (each repel circle's `position` *is* the torch group's `position` object, so moving the group moves the circle; repulsion is XZ-only)
- `src/game/signal.ts` – `ChangeSignal`: listener list behind `Health.onChange`/`Inventory.onChange`
- `src/game/mesh.ts` – `shadowed` helper and materials shared across modules (`woodMat`, `cutWoodMat`, `boneMat`, `BONE_COLOR`, `stoneMat`)
- `src/game/projectiles.ts` – `Projectiles`: arrows under gravity with an 8° launch, `buildArrow` shared with the bow, `ArrowPath` segments; `update` returns `{ paths, landed }` (`paths` is each arrow's swept segment — `from`/`to`, `id` — for the caller to hit-test, and `landed` ground hits — timeouts are silent), `remove(id)` on a hit; `update(dt, terrain)`: removed below `terrain.surfaceAt` (was y < 0) or after 4 s; `main.ts` plays `splash` when that surface is water
- `src/game/items.ts` – `ItemKind` (incl. craft-only `arrow`, `torch`) union and labels, `DroppedKind` for ground items, `ItemCost`; add new item types here and give each an `#inventory .item-<kind>::before` swatch in `style.css`; `stone` drops from boulders, `whisker` from the cat
- `src/game/drops.ts` – `Drops`: item meshes on the ground, pop/bounce physics, walk-over pickup; `spawnFromBoulder(position, outward, amount)` pops stones toward the hitter; `spawnFromCat(position, outward)` pops 4 bones and 1 whisker along `outward`
- `src/game/inventory.ts` – `Inventory` counts per item kind with change listeners
- `src/game/health.ts` – `Health`: player hearts with post-hit invulnerability and slow regen, change listeners
- `src/game/hud.ts` – binds inventory, hearts and weapon slots (`#weapon`) to their DOM panels, with a `locked` slot class for uncrafted weapons; `bindDrawMeter` fills `#draw` from `Player.draw` each frame (hidden at 0, skips the DOM when unchanged); `bindClock` writes a ☀/☾ glyph and `formatClock(phase)` into `#clock` when the minute changes; `bindCraftingHud` renders recipe rows (disabled when unaffordable, Escape closes); `bindMuteHud` writes the speaker glyph; `DamageFlash` for the hurt tint; `FpsCounter` for `#fps`; `bindBossHud` renders the boss bar (fill, delayed ghost fill, `visible` class, felled banner hidden again on `animationend`)
- `src/game/perf.ts` – `CpuGraph`: measures main-thread busy time per tick (`begin`/`end`) and draws an idle-% sparkline into `#cpu`
- `src/game/sounds.ts` – `SoundKind` union and `SoundCue { kind, at?, variation? }`; the only sound import game systems need
- `src/game/synth.ts` – `playRecipe(kind, ctx, destination, variation)`: one Web Audio graph per `SoundKind` (oscillator/noise, filter, envelope), returns the duration; cached noise buffer
- `src/game/audio.ts` – `Audio`: `AudioContext` created on the first key/pointer gesture, master gain (mute persisted under `vibecraft.muted`), listener at the player's head (`FollowCamera.focus`) facing the camera's way so zoom doesn't change loudness, `play(cue)` with a `PannerNode` per positioned cue (cap 8/frame) into a positional bus whose gain and rolloff keep the old camera-distance mix, ambient day/night bed crossfaded on `sunElevation`, pool of 4 torch crackle voices following the nearest torches
- `src/game/player.ts` – mouse character mesh (body, head, ears, tail), movement, gravity/jump; `knockBack(from)` shoves 2 m away over 0.3 s with a hop, added before the collider resolve; holds every weapon in the hand (inactive ones `visible = false`), switching is ignored mid-swing or for a locked slot (`unlock`/`isUnlocked` gate slot selection); `draw` exposes the held weapon's draw fraction for the HUD; `update` takes the `Inventory` to refuse an ammo-less draw and calls `release` when attack is not held, resolves the new position against the `Colliders`, and returns `{ action, switched, active, sounds }`; `update` also takes a required `Terrain`: the horizontal velocity scales by `speedFactor` at the player's position, grounded or airborne (a held jump can't hop the water), and `splash` replaces the footstep and land cues while wading; the player lands on `terrain.heightAt` and, while grounded, sticks to ground that drops by up to `STEP_DOWN` 0.35 m in a frame (slopes), leaving it only by jump, knockback or a taller ledge
- `src/game/legs.ts` – `Legs`: hip-pivot leg meshes with a speed-driven walk cycle; `update` returns `{ moved, stepped }`; `stepped` marks a foot planting for footstep sounds
- `src/game/arms.ts` – `Arms`: shoulder-pivot arms; right hand holds an item and follows its pose; an optional left angle locks the free arm (the bow's string pull)
- `src/game/sword.ts` – `Sword`: model (grip at origin, blade along +Y) implementing `Weapon` like `Axe`, with a wrist rotation applied to the model during the strike and a `cancel` for staggers
- `src/game/skeletons.ts` – `Skeletons`: bone-styled rigs reusing `Legs`/`Arms`; behaviour state machine walk → rest → chase → attack (seed 7, 50 m square, detect 8 m / lose 14 m); `hit` uses `nearestInCone` like `Forest.chop`, `shoot(from, to)` is a segment-vs-cylinder test for arrows, both feed `applyHit`; hits flash red (per-skeleton cloned material whose `emissiveIntensity` is the flash) and rattle, dying skeletons (`health <= 0`) collapse and sink; `update` takes the `Colliders` and pushes each skeleton out of torch repel circles (first, living ones only so a toppling corpse stays put), statics, the player and already-resolved skeletons (never moving the player), legs run at `groundSpeed` so a skeleton held at a rim doesn't walk in place, a walk has a time budget so a target inside a trunk doesn't pin it; returns killed positions, damage dealt, `hitFrom` (the last striker's position, for knockback), and `sounds` (step, swing, hurt, collapse; hurt/collapse from `hit`/`shoot` are queued and flushed by the next `update`); `pushOut` resolves with `blockers` (the player and already-resolved living skeletons) so a skeleton can push a boulder but yields rather than drive it into them, and dying skeletons pass `pushes: false`; `update` also takes a required `Terrain`: walk and chase speed scale with the factor at the skeleton's feet and a wading step is a positioned `splash`; living skeletons snap to `terrain.heightAt` after their push-out and sink from it
- `src/game/camera.ts` – `FollowCamera`: third-person orbit (yaw/pitch on mouse drag) around `focus`, a metre above the player; wheel zoom scales a target distance (2–25 m, multiplicative) that the camera `settle`s toward, and `update` returns true while it moves
- `src/game/input.ts` – `InputState` interface, keyboard/mouse state, key → action mapping, `consumeZoom` (wheel pixels, lines normalised, page scroll/pinch suppressed), `consumeCraftToggle`, `consumePlace`, `consumeMute`

## Conventions

- Strict TypeScript, no `any`. `noUncheckedIndexedAccess` is on, so guard
  array/index reads (`if (!x) continue`). `erasableSyntaxOnly` is on: no constructor
  parameter properties (`constructor(private x: T)`), enums, or namespaces.
  `exactOptionalPropertyTypes` is on: an optional interface member a class
  implements with a getter returning `T | undefined` must be declared
  `prop?: T | undefined`, not `prop?: T`.
  `noUnusedLocals`/`noUnusedParameters` are on: a stub method cannot keep a
  field or constant for a later commit; `void x` silences an unused parameter.
  `verbatimModuleSyntax` is on: type-only imports must be `import type`.
  An early `return` on `this.state.kind === 'x'` narrows the property for the rest of
  the method, so a later `case 'x'` in a `switch` on it is a TS error; handle it in the switch.
  `noPropertyAccessFromIndexSignature` is on: index-signature types (`Record`)
  are read with `rec['key']`, not `rec.key`; `noImplicitReturns`,
  `noImplicitOverride` and `noFallthroughCasesInSwitch` are on too.
  Imports are alphabetical by module path.
- Avoid narrowing `as` casts such as `Object.entries(rec) as [K, V][]`; oxlint's
  `typescript/no-unsafe-type-assertion` warns. Iterate a typed key list
  (`WEAPON_SLOTS`) and index the record instead.
- oxlint gotchas: `consistent-return` flags an exhaustive `switch` with no
  `default`; add `default: { const unreachable: never = x; throw … }`.
  `unicorn/no-array-sort` rejects `[...a].sort()`; use `toSorted` (ES2023
  browsers only, which is fine: older ones are not a target). `no-unnecessary-condition`
  flags guards on lib.dom members typed non-optional (Safari's missing
  `listener.positionX`); widen through a typed const
  (`const p: { positionX?: AudioParam } = listener`), never `as`.
- Game code lives under `src/game/`; each concern gets its own module with a
  small class or factory. `main.ts` only wires things together.
- Movement is camera-relative: `Player.update` takes the camera yaw so WASD
  moves relative to the view direction.
- Frame delta is clamped in the loop so tab-switching doesn't cause huge jumps.
- `CpuGraph.begin`/`end` wrap the whole tick (including skipped ticks) so the
  idle graph reflects real main-thread headroom; GPU time is invisible to it.
- The loop is capped at `MAX_FPS` (60) and skips `renderer.render` entirely
  when nothing changed. Each system reports activity (`PlayerUpdate.active`,
  `FollowCamera.update` return, an `animating` getter on scenery systems); a new
  animated system must expose `animating` and be added to the `scenery` list in
  `main.ts` or it will appear frozen. `animating` should be a flag computed
  during `update` (and set by spawn/chop-style mutators), not a per-frame scan.
  Mutators must set it because `main.ts` calls some of them after that
  system's `update` in the same frame (e.g. `spawnFromSkeleton`); when
  `update` clears the flag at its start, call it before that system's
  mutators (`torches.update` before the T-key handler).
  Set `needsRender = true` for one-off redraws (resize).
  The FPS counter shows "idle" when no frames were rendered.
- Slowly changing systems (the day cycle) must not report `animating` every
  frame: accumulate and apply visible changes in coarse steps (0.5 s) so an idle
  scene still skips renders. Drain a step accumulator with `%= STEP`, not
  `-= STEP`: a scaled `dt` larger than the step otherwise banks a backlog that
  fires the step every frame for seconds after fast-forward ends. Unlit materials (the grid's `LineBasicMaterial`,
  `MeshBasicMaterial`) ignore the lights, so dim them explicitly from the
  palette or they glow at night.
- Point lights are a fixed pool created at startup (`Torches`): three.js keys
  shader programs on the light count, so adding or removing a light recompiles
  every material. Reassign pooled lights (intensity 0 when free) instead, and
  keep `castShadow` off on them.
  The renderer has no tone mapping: `emissive` × `emissiveIntensity` above 1 per channel
  clips toward white (red goes pink). Glowing points are unlit `MeshBasicMaterial`
  (`fog: false` to stay visible at distance), as the sun disc is.
- Eased animations must snap to their target when close (`settle` in
  `motion.ts`); a pure `damp` never reaches rest and keeps the renderer awake.
- Timed displacements (knockback, stagger) move by `shoveStep`: the difference
  of an eased position curve between `t` and `t + dt`, so the total distance
  doesn't depend on the frame rate.
- Push-out maths must be a floating-point fixed point: `pushApart` overshoots
  `minDist` by a hair so a second resolve on the same position returns `false`;
  otherwise a character resting against a collider reports movement every
  frame and keeps the renderer awake.
- Y is up. The plain is at y = 0; read the ground height from
  `Terrain.heightAt` (negative in a pond).
- Yaw is `rotation.y`; a character's forward is `(sin(yaw), 0, cos(yaw))`,
  i.e. local +Z. Attachments that should point forward go on local +Z.
  three.js `Cone`/`Cylinder`/`Capsule` geometries run along +Y; set
  `rotation.x = Math.PI / 2` to aim them forward. Curved parts (tails) are a
  `TubeGeometry` on a `CatmullRomCurve3`. Rotating a local XZ offset by yaw into
  world space is `(lx·cos + lz·sin, −lx·sin + lz·cos)`; the inverse (world → local)
  swaps the sign of `sin`. `collision.ts` and its rotated-box test are the reference.
- Character rig: limbs hang along −Y from a pivot group (hip/shoulder) and are
  animated via the pivot's `rotation.x`; positive swings the limb backwards
  (−Z). Body-part heights derive from `Legs.HIP_HEIGHT`, not literals. Arms
  and legs are rigid (no elbow/knee), so a hand pose can match a target's reach
  or its height but not both; pick the axis the camera sees. Held
  items are children of the hand. All weapons (`Axe`, `Bow`, `Sword`) implement
  `Weapon` (`weapons.ts`): they own an `ActionTimer`, expose `angle`/`swinging`/
  `armLocked`, and the arm holds `angle` exactly while `armLocked` (the bow locks
  while drawing or recovering, the axe only mid-swing). `update` returns a `WeaponAction` on the
  frame the action lands; `main.ts` switches on its `kind`. Add a new player
  weapon by implementing `Weapon`, registering it in `Player.weapons` and
  `WEAPON_SLOTS` (Digit keys map to slot indices automatically), and, only if it
  needs a new action kind, extending `WeaponAction` and the switch in `main.ts`.
  `Legs`/`Arms` accept a style object to swap materials; clone a shared material
  per instance when one object must tint alone.
- Held actions: `Weapon.release()` ends a held action (`swing` begins it and returns whether it started, so callers key start-of-action sounds off it).
  `Player` calls `release` on any frame the weapon is swinging and attack is not
  held, so a click (never "held") releases immediately; for the bow that only
  freezes the draw fraction; the shot itself waits for `update` to bring the arm
  to its aim pose and fires there (a click mid-raise fires a minimum-power shot
  a few frames later, not on the release frame), so nothing snaps and there is
  no separate "pending" flag. The axe's no-op `release` is harmless. A weapon
  that needs the free arm sets `offHandAngle` (the bow: forward with the raise,
  swung back toward `PULL_ANGLE` with the draw, eased to rest after the shot);
  `Player` passes it to `Arms.update`, which otherwise walks the left arm. Weapons
  with `ammo` are refused a `swing` when the inventory count is zero; `main.ts`
  removes the item on the `fire` action so mutation stays in one place.
- Held-item orientation: a weapon built with its long axis along +Y points
  straight forward when `model.rotation.x = Math.PI / 2 - armAngle`, where
  `armAngle` is the shoulder angle it is aimed at (`GRIP_ANGLE` in
  `axe.ts`/`bow.ts`). Mark spawn points (the bow's nock) with an empty
  `Object3D` and read `getWorldPosition` rather than computing offsets by hand.
  `Player.update` runs `weapon.update` before `Arms.update`, so a marker sampled
  on the action frame reflects last frame's arm pose; fire only once the arm has
  already reached its pose (as the bow does), never on the frame it starts moving.
- Swing keyframes: the shoulder angle is signed (negative = in front), so an
  overhead strike must keep every keyframe on the negative side; a lerp from a
  positive wind-up to a negative strike passes through the hanging pose and
  looks like an uppercut. Start swings from the current rest angle with a
  raise phase rather than jumping straight to the wind-up pose.
- `ActionTimer.crossed(point)` is true on the one step that reached `point`;
  `axe.ts`/`sword.ts` use `crossed(HIT_POINT)` for the swing's hit frame.
  `crossed(0)` fires on the first step after `start`, for a weapon that needs
  to act on that very first frame.
- Input: held keys are polled with `isHeld`; one-shot presses (attack, weapon
  slots) are latched on `keydown` ignoring `e.repeat` and drained once per
  frame via a `consume*` method, so add new one-shot keys that way rather than
  polling. Digit1–9 are mapped to slot indices generically; `Player` decides
  which slots exist.
  `keydown` ignores events with Meta/Ctrl/Alt so browser shortcuts (Cmd+C) work;
  `keyup` must stay unguarded or a key released while a modifier is down sticks in
  the held set.
- World layout: spawn at origin, house at (12, 0, -10), trees inside a 120 m
  square (seed 42), 6 skeletons (`COUNT` in `skeletons.ts`) roaming a 50 m
  square, and a pool of `MAX_TORCHES` 8 point lights. 10 boulders (seed 99, `boulderSpots`) go in after the trees, 8 m
  clear of spawn and house and clear of trunks and each other, so changing the
  tree layout shifts the boulder spots. The pond sits at (−9, −17) (radii 7 × 4.5 m, yaw 0.6),
  placed before the trees, which keep 1.5 m from it; boulders keep out of it too. The shadow frustum is a ±40 m box that follows the player
  (`DayCycle.placeLight`, focus snapped to the shadow texel grid so edges don't
  shimmer); scenery farther than that casts no shadow. The renderer uses
  `PCFSoftShadowMap`.
  A new rejection test in `addProps`'s tree loop must still consume the draws `plant`
  makes (and count toward the 60) or every later tree and boulder spot moves.
  Fog starts at 60 m by day and 30 m at night (`daycycle.ts` keyframes); positional
  audio clamps at `MAX_DISTANCE` 40 m (~0.17 of the level at 40 m before the bus gain). The cave mound sits at (0, −42) with the bed at (0, −41), trees 9 m clear (one tree of seed 42 dropped, layout otherwise unchanged), boulders keep out of it; the cave's shadow pops in at the ±40 m frustum edge (accepted).
- Share materials/geometries as module-level constants (see `drops.ts`,
  `trees.ts`) instead of allocating per instance; materials used by more than
  one module live in `mesh.ts`. Scenery that varies only in size shares unit
  geometry and scales its group. Keep per-frame scratch `Vector3`s as module or
  instance fields rather than allocating in `update`.
- Reusable mechanics live in small helper modules rather than being copied
  between systems: melee targeting (`targeting.ts`), falling over
  (`topple.ts`), turning/stepping (`motion.ts`), change listeners (`signal.ts`),
  push-out collision (`collision.ts`).
- Collision is XZ-only circles and rotated boxes with no pathfinding: characters
  slide along obstacles, and a skeleton chasing around a tree hugs it. Register a
  new static obstacle with `Colliders.add` where it is built (`Forest.plant`,
  `addProps`); a new moving character resolves its own position after
  integrating movement and, if it must not overlap others, uses `separate` with
  the authoritative body (the player) as the anchor. Push-out against several
  colliders must iterate until nothing moves (bounded passes); one pass over two
  adjacent trunks leaves the character inside the first.
  Animation that implies motion (a walk cycle) must derive from the displacement
  left after push-out (`groundSpeed`), not the intended speed, or a body held
  against an obstacle runs on the spot and never lets the renderer idle.
  A pushable collider (boulder) is the one mutable obstacle: `resolve` has side effects on it, so never probe with `resolve`; ask `overlaps`. Boulders treat every other collider as static (no chains), ignore characters except through `blockers`, and strike priority in `main.ts` is cat, skeleton, tree, boulder; the cat is not a `Blocker` for skeletons (a boulder can be driven into it and shoved back next frame; accepted). Skeleton repellers are a scratch array of torch circles plus `cat.repellers`; `audio.update` keeps receiving only `torches.repellers`.
- Player-driven game events flow through return values from `update` (e.g.
  `Player.update` returns `{ action, switched, active, sounds }`, `Forest.update` returns
  felled trees, `Drops.update` returns picked-up items) and `main.ts` routes them,
  rather than modules referencing each other directly.
- Animated scenery uses small discriminated-union state machines (see `trees.ts`).
- HUD overlays toggled with the `hidden` attribute need an explicit
  `#id[hidden] { display: none }` rule if their base style sets `display`,
  or they render from page load (see `#gameover` in `style.css`).
- HUD text that derives from game state (`formatClock`) is a pure function in
  the game module, tested there; `hud.ts` bindings only write strings to the
  DOM and skip the write when unchanged. Derived display values (clock minutes)
  round to the nearest unit; flooring a float product like `12 * 0.15 / 0.6`
  shows one unit low.
- A body that should idle from the first frame (a sleeping boss) must be fully
  posed in its constructor, `position.y` included; otherwise the first `update`'s
  height sync reports movement and the renderer never gets its idle frame. Lock
  it in with a test that asserts `animating` is false on every frame from frame 0.
- Any "walk to a target" behaviour needs a time budget (`WALK_GRACE` in
  `skeletons.ts`, `RETREAT_GRACE` in `cat.ts`): sliding gets a body round one
  trunk but not out of a concave collider group (the cave), and a stuck walker
  keeps `animating` forever. Test it against the real `Cave` colliders, not a
  lone circle.
- `world.test.ts` pins the seeded layout (59 trees, the first boulder spot); a
  change to the sampling loop in `addProps` moves every later tree and boulder,
  so only change those numbers deliberately, after checking the loop still
  consumes the draws a rejected spot would have made.
- Layout bullets in this file are one sentence per module with `;`-separated
  clauses and no trailing period; extend an existing module's bullet rather than
  appending a second sentence or a second bullet.
- A `DirectionalLight.target` moved off the origin only takes effect if the
  target is added to the scene (its matrix is never updated otherwise). When a
  shadow frustum follows the player, snap the target in light space; the snapped
  point slides along the light ray, so test it with a cross product against the
  ray, not a position equality.
- Null-narrowing of `querySelector` results in `main.ts` doesn't carry into
  the `frame` closure; copy to a typed const after the check
  (`const x: HTMLElement = el`) before using it there.
- Sound: systems never import Web Audio. One-shot cues travel as `SoundCue`s in
  `update` return values (`sounds: SoundCue[]`) or are played by `main.ts` from
  the booleans it already routes; loops (ambient, crackle) read public state in
  `Audio.update`. Audio never sets `animating` and is not in `scenery`. The
  context exists only after the first gesture, so cues before it are dropped.
  The sound layer has no unit tests; tune recipes by ear in `synth.ts`.
  Web Audio rules: write params with `setValueAtTime`, never `.value`;
  `exponentialRampToValueAtTime` must never target 0 (ramp to 0.001, then
  `setValueAtTime(0)`); call `cancelScheduledValues` before re-ramping a
  param another path also drives (mute vs death fade); a random slice of a
  buffer is `source.start(when, offset)`, `loopStart` alone does nothing;
  tear one-shots down on the source's `ended` event, not `setTimeout` (audio
  time freezes while the context is suspended, wall time does not).
  Positional cues go through the `positional` bus, whose gain and rolloff keep
  the old camera-distance mix; the chirp re-routes to the day bed and bypasses
  it, so retune `CHIRP_GAIN` when changing either. Nodes without their own
  source (panners, buses) are torn down with `disconnectAt`.

## Controls

- WASD / arrows: move
- Space: jump
- 1 / 2: select axe / bow (bow locked until crafted)
- F or left click (without dragging): attack with the held weapon. Axe: 3 hits fell a tree, 2 kill a skeleton, the first knocking it back ~1.8 m (skeletons take priority when both are in reach). Boulders take 4 hit points (axe 1, stone axe 2) and drop stone; the stone axe (4 Stones + 2 Logs, C panel) fells a tree in 2 hits.
- hold F to draw the bow (a meter above the weapon slots shows the draw), release to fire (12–30 m/s over a 0.8 s draw, 8° arc); click fires a minimum shot; one skeleton hit per arrow
- C: crafting panel (Escape closes)
- T: plant a torch a metre ahead (needs a torch in the inventory; refused inside a trunk/house, on water or within 1 m of another torch). Skeletons stay 5 m from a torch; it burns two in-game days and fades over the last 30 s
- Y (hold): fast-forward time 40× (a full day in under 4 s) to check the sky; the top-centre clock shows the in-game time; torches age at the same rate
- Skeletons within 8 m chase you and swing when adjacent; each hit costs a heart and knocks you back ~2 m with a hop, with 0.8 s invulnerability after (no knockback while invulnerable). Hearts regen one per 5 s out of combat.
- The cat: wakes within 10 m or when hit; pounce 2 hearts (jump to dodge), swipe 1 heart; it gives up at 25 m and heals on the way home; 8 axe hits / 4 stone / 8 arrows; drops 4 bones + 1 whisker; its cave then repels skeletons.
- Walk over logs/seeds/bones/stones to pick them up
- Water: the pond is a basin; wading slows you and skeletons with depth, to half speed at 0.5 m of water (jumping doesn't help); torches can't be planted in the water
- Walk into a boulder to push it (skeletons push them too)
- Mouse drag: orbit camera
- Mouse wheel / trackpad pinch: zoom (2–25 m, starts at 8 m, not persisted)
- M: mute/unmute (persisted)
