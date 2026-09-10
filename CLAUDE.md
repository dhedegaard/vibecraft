# vibecraft

A 3D browser game: a character moving around in a 3D world. Currently a grey
mouse on two legs (ears, snout, whiskers, tail) with arms and an axe on a flat
green plane dotted with trees and a house.
WASD movement, jumping, a mouse-orbit third-person camera, and trees that can
be chopped down. The player starts with an axe and can craft a bow (3 logs + 2
bones) and arrows (1 log + 1 bone → 5) in a panel toggled with C; holding F
draws the bow and releasing fires an arcing arrow that hurts skeletons but not
trees. Felled trees drop logs and seeds that are picked up by walking
over them into an inventory shown in the HUD. Sword-carrying skeletons wander the
world, chase the player when close and swing at them; two axe hits kill one and it
drops bones. The player has 10 hearts that slowly regenerate; at zero a game-over
overlay offers a restart. Characters collide with tree trunks, stumps and the
house on the ground plane; skeletons also avoid the player and each other.
A 2½-minute day/night cycle moves the sun and moon across the sky; nights are
moonlit. Torches (1 log + 1 bone → 2) are planted with T: a point light that
skeletons will not enter, burning for two in-game days before fading out.

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

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and build on pushes to main and PRs; check the latest run with `gh run list --branch main --limit 1` and follow it with `gh run watch <id> --exit-status`. A clean `npm run lint` prints nothing and exits 0.
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
  `Skeletons` has no unit tests (positions are private and seeded), so keep its
  logic in helper modules (`collision.ts`, `targeting.ts`) and test those.
  Declare test helpers (`makeCycle`, `hex`) at module scope; oxlint's
  `consistent-function-scoping` warns on functions nested in `describe`.
  Tuning constants (`CYCLE_SECONDS`, `START_PHASE`) change often: derive
  expected values in tests from the exported constants, never from literals.
- Browser automation (Playwright, Chrome DevTools MCP, Chrome extension) does
  not work in this environment. Ask the user to check visual changes at
  http://localhost:5173; a dev server is usually already running with HMR, so
  don't start a second one.

## Design

- Design specs live in `docs/superpowers/specs/` (untracked by the global gitignore); `2026-09-08-crafting-and-bow-design.md` (crafting panel, bow replaces gun, arcing arrows) and `2026-09-10-day-night-cycle-design.md` (2½-minute cycle, sun/moon path, palette, coarse-stepped sky) are implemented.
- Drop yields for balancing: a felled tree gives `2 + round(scale)` logs (~3) and 1–2 seeds; a skeleton drops 2–3 bones (`drops.ts`).
- `2026-09-10-torches-design.md` (craftable torches, pooled point lights, skeleton repel circles) is implemented.

## Layout

- `index.html` – single canvas (`#game`) plus HUD overlays (`#hud`, `#clock`, `#inventory`, `#hearts`, `#weapon` slots, `#draw` meter, `#fps`, `#cpu-panel`, `#damage` tint, `#gameover` overlay, `#crafting` panel with `#recipes` list)
- `src/main.ts` – bootstrap: renderer, game loop, resize handling
- `src/game/world.ts` – scene, ground plane, grid, lights, fog; owns the `Colliders` and the `DayCycle`, creates the `Forest` and calls `addProps`
- `src/game/daycycle.ts` – `sunElevation(t)`/`sunDirection(t)` (tilted-plane sun path, day 60 % of the cycle), `lightingAt(elevation)` palette (sky/fog, sun, hemisphere, moon, fog range, star opacity, unlit brightness), `clockTime`/`formatClock` (06:00 sunrise, 18:00 sunset, 12 h per half-cycle), `DayCycle` owning sun/moon lights, background, fog, grid tint and the camera-centred sky group (discs, stars); `update(dt, fastForward, cameraPos, focus)` applies a visual step every 1/600 cycle and sets `animating` only then; one shadow caster at a time, handed over at the horizon
- `src/game/props.ts` – house (registers its footprint as a rotated box collider), seeded random helper, world layout (plants trees via `Forest`)
- `src/game/trees.ts` – `Forest`: tree meshes (unit geometry, uniformly scaled per tree), chop hit-testing, fall/sink animation, stumps; `plant` registers a permanent trunk circle collider (the stump keeps it)
- `src/game/weapons.ts` – `Weapon` interface a character's arm drives (`model`, `angle`, `swinging`, `armLocked`, `swing`, `release`, `update`, optional `ammo`, `draw` and `offHandAngle`), `WeaponAction` (`strike` | `fire` with `origin` and `speed`), `ActionTimer` (shared one-shot clock with `crossed(point)` for the hit frame), `WeaponKind`, slot order and labels
- `src/game/axe.ts` – axe model and swing keyframes (raise overhead, chop down in front); `update` returns `STRIKE` on the hit frame
- `src/game/bow.ts` – `Bow`: limbs along model Z, arrow along +Y; state machine idle → drawing (hold) → recovering; `release` only freezes the draw fraction, `update` keeps raising the arm and fires with `{ kind: 'fire', origin, speed }` from the nock marker the moment it reaches aim (immediately for a release after the raise, on a later frame for a release mid-raise); `draw` exposes the 0–1 draw fraction, frozen at release
- `src/game/crafting.ts` – `RECIPES`, `canCraft`, `craft` (spends, returns a `CraftResult`; `main.ts` applies the output), `formatCost`
- `src/game/targeting.ts` – `nearestInCone` (closest target in the melee reach/facing cone) and the shared `MELEE_REACH`/`MELEE_FACING` constants used by trees and skeletons
- `src/game/topple.ts` – `beginTopple`/`applyTopple`: hinge-at-the-base fall animation shared by felled trees and dying skeletons
- `src/game/motion.ts` – `turnToward` (eased yaw), `stepForward`, `forwardOf`
- `src/game/collision.ts` – `Collider` (`circle` | rotated `box`, XZ only), `Colliders.resolve(pos, radius)` (iterated minimum-translation push-out of statics, returns whether it moved), `separate(anchor, ra, other, rb)` for character pairs, `CHARACTER_RADIUS`
- `src/game/repel.ts` – `Circle` no-go zones and `pushOutOfCircles` (point push-out built on `collision.ts`'s exported `pushOutOfCircle`/`MAX_PASSES`)
- `src/game/torches.ts` – `Torches`: a pool of `MAX_TORCHES` point lights created at startup, torch meshes, `place(at, colliders)` (refused inside a collider or within `TORCH_SPACING`; over the cap the oldest goes out), `update(dt)` ages torches (caller scales `dt` for fast-forward) and dims/removes them in 0.5 s steps, `repellers` for skeletons
- `src/game/signal.ts` – `ChangeSignal`: listener list behind `Health.onChange`/`Inventory.onChange`
- `src/game/mesh.ts` – `shadowed` helper and materials shared across modules (`woodMat`, `cutWoodMat`, `boneMat`, `BONE_COLOR`)
- `src/game/projectiles.ts` – `Projectiles`: arrows under gravity with an 8° launch, `buildArrow` shared with the bow, `ArrowPath` segments; `update` returns each arrow's swept segment (`from`/`to`, `id`) for the caller to hit-test, `remove(id)` on a hit, removed at y < 0 or after 4 s
- `src/game/items.ts` – `ItemKind` (incl. craft-only `arrow`) union and labels, `DroppedKind` for ground items, `ItemCost`; add new item types here
- `src/game/drops.ts` – `Drops`: item meshes on the ground, pop/bounce physics, walk-over pickup
- `src/game/inventory.ts` – `Inventory` counts per item kind with change listeners
- `src/game/health.ts` – `Health`: player hearts with post-hit invulnerability and slow regen, change listeners
- `src/game/hud.ts` – binds inventory, hearts and weapon slots (`#weapon`) to their DOM panels, with a `locked` slot class for uncrafted weapons; `bindDrawMeter` fills `#draw` from `Player.draw` each frame (hidden at 0, skips the DOM when unchanged); `bindClock` writes a ☀/☾ glyph and `formatClock(phase)` into `#clock` when the minute changes; `bindCraftingHud` renders recipe rows (disabled when unaffordable, Escape closes); `DamageFlash` for the hurt tint; `FpsCounter` for `#fps`
- `src/game/perf.ts` – `CpuGraph`: measures main-thread busy time per tick (`begin`/`end`) and draws an idle-% sparkline into `#cpu`
- `src/game/player.ts` – mouse character mesh (body, head, ears, tail), movement, gravity/jump; holds every weapon in the hand (inactive ones `visible = false`), switching is ignored mid-swing or for a locked slot (`unlock`/`isUnlocked` gate slot selection); `draw` exposes the held weapon's draw fraction for the HUD; `update` takes the `Inventory` to refuse an ammo-less draw and calls `release` when attack is not held, resolves the new position against the `Colliders`, and returns `{ action, switched, active }`
- `src/game/legs.ts` – `Legs`: hip-pivot leg meshes with a speed-driven walk cycle
- `src/game/arms.ts` – `Arms`: shoulder-pivot arms; right hand holds an item and follows its pose; an optional left angle locks the free arm (the bow's string pull)
- `src/game/sword.ts` – `Sword`: model (grip at origin, blade along +Y) implementing `Weapon` like `Axe`, with a wrist rotation applied to the model during the strike and a `cancel` for staggers
- `src/game/skeletons.ts` – `Skeletons`: bone-styled rigs reusing `Legs`/`Arms`; behaviour state machine walk → rest → chase → attack (seed 7, 50 m square, detect 8 m / lose 14 m); `hit` uses `nearestInCone` like `Forest.chop`, `shoot(from, to)` is a segment-vs-cylinder test for arrows, both feed `applyHit`; hits flash red (per-skeleton cloned material whose `emissiveIntensity` is the flash) and rattle, dying skeletons (`health <= 0`) collapse and sink; `update` takes the `Colliders` and pushes each living skeleton out of torch repel circles (first), statics, the player and already-resolved skeletons (never moving the player), a walk has a time budget so a target inside a trunk doesn't pin it; returns killed positions and damage dealt
- `src/game/camera.ts` – third-person follow camera (yaw/pitch orbit, mouse drag)
- `src/game/input.ts` – `InputState` interface, keyboard/mouse state, key → action mapping, `consumeCraftToggle`, `consumePlace`

## Conventions

- Strict TypeScript, no `any`. `noUncheckedIndexedAccess` is on, so guard
  array/index reads (`if (!x) continue`). `erasableSyntaxOnly` is on: no constructor
  parameter properties (`constructor(private x: T)`), enums, or namespaces.
  `exactOptionalPropertyTypes` is on: an optional interface member a class
  implements with a getter returning `T | undefined` must be declared
  `prop?: T | undefined`, not `prop?: T`.
- Avoid narrowing `as` casts such as `Object.entries(rec) as [K, V][]`; oxlint's
  `typescript/no-unsafe-type-assertion` warns. Iterate a typed key list
  (`WEAPON_SLOTS`) and index the record instead.
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
  system's `update` in the same frame (e.g. `spawnFromSkeleton`).
  Set `needsRender = true` for one-off redraws (resize).
  The FPS counter shows "idle" when no frames were rendered.
- Slowly changing systems (the day cycle) must not report `animating` every
  frame: accumulate and apply visible changes in coarse steps (0.5 s) so an idle
  scene still skips renders. Unlit materials (`GridHelper` lines,
  `MeshBasicMaterial`) ignore the lights, so dim them explicitly from the
  palette or they glow at night.
- Point lights are a fixed pool created at startup (`Torches`): three.js keys
  shader programs on the light count, so adding or removing a light recompiles
  every material. Reassign pooled lights (intensity 0 when free) instead, and
  keep `castShadow` off on them.
- Eased animations must snap to their target when close (see `settle` in
  `legs.ts`); a pure `damp` never reaches rest and keeps the renderer awake.
- Y is up. The ground plane is at y = 0.
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
- Held actions: `Weapon.release()` ends a held action (`swing` begins it).
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
  square (seed 42). The shadow frustum is a ±40 m box that follows the player
  (`DayCycle.placeLight`, focus snapped to the shadow texel grid so edges don't
  shimmer); scenery farther than that casts no shadow. The renderer uses
  `PCFSoftShadowMap`.
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
- Player-driven game events flow through return values from `update` (e.g.
  `Player.update` returns `{ action, switched, active }`, `Forest.update` returns
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
- A `DirectionalLight.target` moved off the origin only takes effect if the
  target is added to the scene (its matrix is never updated otherwise). When a
  shadow frustum follows the player, snap the target in light space; the snapped
  point slides along the light ray, so test it with a cross product against the
  ray, not a position equality.
- Null-narrowing of `querySelector` results in `main.ts` doesn't carry into
  the `frame` closure; copy to a typed const after the check
  (`const x: HTMLElement = el`) before using it there.

## Controls

- WASD / arrows: move
- Space: jump
- 1 / 2: select axe / bow (bow locked until crafted)
- F or left click (without dragging): attack with the held weapon. Axe: 3 hits fell a tree, 2 kill a skeleton (skeletons take priority when both are in reach).
- hold F to draw the bow (a meter above the weapon slots shows the draw), release to fire (12–30 m/s over a 0.8 s draw, 8° arc); click fires a minimum shot; one skeleton hit per arrow
- C: crafting panel (Escape closes)
- T: plant a torch a metre ahead (needs a torch in the inventory; refused inside a trunk/house or within 1 m of another torch). Skeletons stay 5 m from a torch; it burns two in-game days and fades over the last 30 s
- Y (hold): fast-forward time 40× (a full day in under 4 s) to check the sky; the top-centre clock shows the in-game time; torches age at the same rate
- Skeletons within 8 m chase you and swing when adjacent; each hit costs a heart, with 0.8 s invulnerability after. Hearts regen one per 5 s out of combat.
- Walk over logs/seeds/bones to pick them up
- Mouse drag: orbit camera
