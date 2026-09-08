# vibecraft

A 3D browser game: a character moving around in a 3D world. Currently a grey
mouse on two legs (ears, snout, whiskers, tail) with arms and an axe on a flat
green plane dotted with trees and a house.
WASD movement, jumping, a mouse-orbit third-person camera, and trees that can
be chopped down. The player carries an axe and a gun, switched with 1/2; the gun
fires visible bullets that hurt skeletons but not trees. Felled trees drop logs and seeds that are picked up by walking
over them into an inventory shown in the HUD. Sword-carrying skeletons wander the
world, chase the player when close and swing at them; two axe hits kill one and it
drops bones. The player has 10 hearts that slowly regenerate; at zero a game-over
overlay offers a restart. No collision yet.

## Stack

- Vite + vanilla TypeScript (no framework)
- three.js for rendering
- npm (lockfile: `package-lock.json`)

## Commands

- `npm run dev` – dev server (Vite, default http://localhost:5173)
- `npm run build` – typecheck (`tsc`) then production build
- `npm run typecheck` – `tsc --noEmit` only
- `npm run preview` – serve the production build
- `npm test` – run the vitest suite once (`npm run test:watch` for watch mode)

No lint script exists yet. CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on pushes to main and PRs.

## Verification

- Verify with `npm run typecheck`, `npm test`, then `npm run build`; Vite's
  ">500 kB chunk" warning is expected (three.js) and can be ignored.
- Tests are vitest files co-located as `src/game/*.test.ts` and run in Node
  without a renderer; three.js math and `Object3D` work headless, so test game
  logic (timers, targeting, health, weapon keyframes, state machines) rather
  than rendering or the HUD DOM. Drive simulations with a fixed `dt = 1/60`
  and allow one extra step on frame counts: accumulated float steps land just
  short of the duration.
- Browser automation (Playwright, Chrome DevTools MCP, Chrome extension) does
  not work in this environment. Ask the user to check visual changes at
  http://localhost:5173; a dev server is usually already running with HMR, so
  don't start a second one.

## Layout

- `index.html` – single canvas (`#game`) plus HUD overlays (`#hud`, `#inventory`, `#hearts`, `#fps`, `#cpu-panel`, `#damage` tint, `#gameover` overlay)
- `src/main.ts` – bootstrap: renderer, game loop, resize handling
- `src/game/world.ts` – scene, ground plane, lights, fog; creates the `Forest` and calls `addProps`
- `src/game/props.ts` – house, seeded random helper, world layout (plants trees via `Forest`)
- `src/game/trees.ts` – `Forest`: tree meshes (unit geometry, uniformly scaled per tree), chop hit-testing, fall/sink animation, stumps
- `src/game/weapons.ts` – `Weapon` interface a character's arm drives (`model`, `angle`, `swinging`, `armLocked`, `swing`, `update`), `WeaponAction` (`strike` | `fire` with `origin`), `ActionTimer` (shared one-shot clock with `crossed(point)` for the hit frame), `WeaponKind`, slot order and labels
- `src/game/axe.ts` – axe model and swing keyframes (raise overhead, chop down in front); `update` returns `STRIKE` on the hit frame
- `src/game/gun.ts` – `Gun`: short rifle model (barrel along +Y, private `muzzle` marker) with an always-locked aim pose and recoil; `update` returns a `fire` action with the muzzle position on the firing frame
- `src/game/targeting.ts` – `nearestInCone` (closest target in the melee reach/facing cone) and the shared `MELEE_REACH`/`MELEE_FACING` constants used by trees and skeletons
- `src/game/topple.ts` – `beginTopple`/`applyTopple`: hinge-at-the-base fall animation shared by felled trees and dying skeletons
- `src/game/motion.ts` – `turnToward` (eased yaw), `stepForward`, `forwardOf`
- `src/game/signal.ts` – `ChangeSignal`: listener list behind `Health.onChange`/`Inventory.onChange`
- `src/game/mesh.ts` – `shadowed` helper and materials shared across modules (`woodMat`, `cutWoodMat`, `boneMat`, `BONE_COLOR`)
- `src/game/projectiles.ts` – `Projectiles`: bullets in flight; `update` returns each bullet's swept segment (`from`/`to`, `id`) for the caller to hit-test, `remove(id)` on a hit
- `src/game/items.ts` – `ItemKind` union and labels; add new item types here
- `src/game/drops.ts` – `Drops`: item meshes on the ground, pop/bounce physics, walk-over pickup
- `src/game/inventory.ts` – `Inventory` counts per item kind with change listeners
- `src/game/health.ts` – `Health`: player hearts with post-hit invulnerability and slow regen, change listeners
- `src/game/hud.ts` – binds inventory, hearts and weapon slots (`#weapon`) to their DOM panels; `DamageFlash` for the hurt tint; `FpsCounter` for `#fps`
- `src/game/perf.ts` – `CpuGraph`: measures main-thread busy time per tick (`begin`/`end`) and draws an idle-% sparkline into `#cpu`
- `src/game/player.ts` – mouse character mesh (body, head, ears, tail), movement, gravity/jump; holds every weapon in the hand (inactive ones `visible = false`), switching is ignored mid-swing; `update` returns `{ action, switched, active }`
- `src/game/legs.ts` – `Legs`: hip-pivot leg meshes with a speed-driven walk cycle
- `src/game/arms.ts` – `Arms`: shoulder-pivot arms; right hand holds an item and follows its pose
- `src/game/sword.ts` – `Sword`: model (grip at origin, blade along +Y) implementing `Weapon` like `Axe`, with a wrist rotation applied to the model during the strike and a `cancel` for staggers
- `src/game/skeletons.ts` – `Skeletons`: bone-styled rigs reusing `Legs`/`Arms`; behaviour state machine walk → rest → chase → attack (seed 7, 50 m square, detect 8 m / lose 14 m); `hit` uses `nearestInCone` like `Forest.chop`, `shoot(from, to)` is a segment-vs-cylinder test for bullets, both feed `applyHit`; hits flash red (per-skeleton cloned material whose `emissiveIntensity` is the flash) and rattle, dying skeletons (`health <= 0`) collapse and sink; `update` returns killed positions and damage dealt
- `src/game/camera.ts` – third-person follow camera (yaw/pitch orbit, mouse drag)
- `src/game/input.ts` – keyboard/mouse state, key → action mapping

## Conventions

- Strict TypeScript, no `any`. `noUncheckedIndexedAccess` is on, so guard
  array/index reads (`if (!x) continue`). `erasableSyntaxOnly` is on: no constructor
  parameter properties (`constructor(private x: T)`), enums, or namespaces.
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
- Eased animations must snap to their target when close (see `settle` in
  `legs.ts`); a pure `damp` never reaches rest and keeps the renderer awake.
- Y is up. The ground plane is at y = 0.
- Yaw is `rotation.y`; a character's forward is `(sin(yaw), 0, cos(yaw))`,
  i.e. local +Z. Attachments that should point forward go on local +Z.
  three.js `Cone`/`Cylinder`/`Capsule` geometries run along +Y; set
  `rotation.x = Math.PI / 2` to aim them forward. Curved parts (tails) are a
  `TubeGeometry` on a `CatmullRomCurve3`.
- Character rig: limbs hang along −Y from a pivot group (hip/shoulder) and are
  animated via the pivot's `rotation.x`; positive swings the limb backwards
  (−Z). Body-part heights derive from `Legs.HIP_HEIGHT`, not literals. Held
  items are children of the hand. All weapons (`Axe`, `Gun`, `Sword`) implement
  `Weapon` (`weapons.ts`): they own an `ActionTimer`, expose `angle`/`swinging`/
  `armLocked`, and the arm holds `angle` exactly while `armLocked` (the gun aims
  constantly, the axe only mid-swing). `update` returns a `WeaponAction` on the
  frame the action lands; `main.ts` switches on its `kind`. Add a new player
  weapon by implementing `Weapon`, registering it in `Player.weapons` and
  `WEAPON_SLOTS` (Digit keys map to slot indices automatically), and, only if it
  needs a new action kind, extending `WeaponAction` and the switch in `main.ts`.
  `Legs`/`Arms` accept a style object to swap materials; clone a shared material
  per instance when one object must tint alone.
- Held-item orientation: a weapon built with its long axis along +Y points
  straight forward when `model.rotation.x = Math.PI / 2 - armAngle`, where
  `armAngle` is the shoulder angle it is aimed at (`GRIP_ANGLE` in
  `axe.ts`/`gun.ts`). Mark spawn points (muzzle) with an empty `Object3D`
  and read `getWorldPosition` rather than computing offsets by hand.
- Swing keyframes: the shoulder angle is signed (negative = in front), so an
  overhead strike must keep every keyframe on the negative side; a lerp from a
  positive wind-up to a negative strike passes through the hanging pose and
  looks like an uppercut. Start swings from the current rest angle with a
  raise phase rather than jumping straight to the wind-up pose.
- `ActionTimer.crossed(point)` is true on the one step that reached `point`;
  `crossed(0)` fires on the first frame after `start` (the gun's shot), so no
  separate "pending" flag is needed.
- Input: held keys are polled with `isHeld`; one-shot presses (attack, weapon
  slots) are latched on `keydown` ignoring `e.repeat` and drained once per
  frame via a `consume*` method, so add new one-shot keys that way rather than
  polling. Digit1–9 are mapped to slot indices generically; `Player` decides
  which slots exist.
- World layout: spawn at origin, house at (12, 0, -10), trees inside a 120 m
  square (seed 42). The sun's shadow frustum covers ±70 m; scenery outside it
  casts no shadow.
- Share materials/geometries as module-level constants (see `drops.ts`,
  `trees.ts`) instead of allocating per instance; materials used by more than
  one module live in `mesh.ts`. Scenery that varies only in size shares unit
  geometry and scales its group. Keep per-frame scratch `Vector3`s as module or
  instance fields rather than allocating in `update`.
- Reusable mechanics live in small helper modules rather than being copied
  between systems: melee targeting (`targeting.ts`), falling over
  (`topple.ts`), turning/stepping (`motion.ts`), change listeners (`signal.ts`).
- Player-driven game events flow through return values from `update` (e.g.
  `Player.update` returns `{ action, switched, active }`, `Forest.update` returns
  felled trees, `Drops.update` returns picked-up items) and `main.ts` routes them,
  rather than modules referencing each other directly.
- Animated scenery uses small discriminated-union state machines (see `trees.ts`).
- HUD overlays toggled with the `hidden` attribute need an explicit
  `#id[hidden] { display: none }` rule if their base style sets `display`,
  or they render from page load (see `#gameover` in `style.css`).
- Null-narrowing of `querySelector` results in `main.ts` doesn't carry into
  the `frame` closure; copy to a typed const after the check
  (`const x: HTMLElement = el`) before using it there.

## Controls

- WASD / arrows: move
- Space: jump
- 1 / 2: select axe / gun (switching waits for the current swing to finish)
- F or left click (without dragging): attack with the held weapon. Axe: 3 hits fell a tree, 2 kill a skeleton (skeletons take priority when both are in reach). Gun: fires a bullet (40 m/s, 30 m range, one recoil-limited shot per 0.3 s) that deals one skeleton hit and ignores trees.
- Skeletons within 8 m chase you and swing when adjacent; each hit costs a heart, with 0.8 s invulnerability after. Hearts regen one per 5 s out of combat.
- Walk over logs/seeds/bones to pick them up
- Mouse drag: orbit camera
