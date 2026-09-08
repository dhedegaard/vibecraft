# vibecraft

A 3D browser game: a character moving around in a 3D world. Currently a grey
mouse on two legs (ears, snout, whiskers, tail) with arms and an axe on a flat
green plane dotted with trees and a house.
WASD movement, jumping, a mouse-orbit third-person camera, and trees that can
be chopped down. Felled trees drop logs and seeds that are picked up by walking
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

No lint or test scripts exist yet.

## Verification

- Verify with `npm run typecheck` then `npm run build`; Vite's ">500 kB chunk"
  warning is expected (three.js) and can be ignored.
- Browser automation (Playwright, Chrome DevTools MCP, Chrome extension) does
  not work in this environment. Ask the user to check visual changes at
  http://localhost:5173; a dev server is usually already running with HMR, so
  don't start a second one.

## Layout

- `index.html` – single canvas (`#game`) plus HUD overlays (`#hud`, `#inventory`, `#hearts`, `#fps`, `#cpu-panel`, `#damage` tint, `#gameover` overlay)
- `src/main.ts` – bootstrap: renderer, game loop, resize handling
- `src/game/world.ts` – scene, ground plane, lights, fog; creates the `Forest` and calls `addProps`
- `src/game/props.ts` – house, seeded random helper, world layout (plants trees via `Forest`)
- `src/game/trees.ts` – `Forest`: tree meshes, chop hit-testing, fall/sink animation, stumps
- `src/game/axe.ts` – axe model and swing timing; exposes the shoulder `angle` the arm applies, reports the hit frame
- `src/game/items.ts` – `ItemKind` union and labels; add new item types here
- `src/game/drops.ts` – `Drops`: item meshes on the ground, pop/bounce physics, walk-over pickup
- `src/game/inventory.ts` – `Inventory` counts per item kind with change listeners
- `src/game/health.ts` – `Health`: player hearts with post-hit invulnerability and slow regen, change listeners
- `src/game/hud.ts` – binds inventory and hearts to their DOM panels; `DamageFlash` for the hurt tint; `FpsCounter` for `#fps`
- `src/game/perf.ts` – `CpuGraph`: measures main-thread busy time per tick (`begin`/`end`) and draws an idle-% sparkline into `#cpu`
- `src/game/player.ts` – mouse character mesh (body, head, ears, tail), movement, gravity/jump
- `src/game/legs.ts` – `Legs`: hip-pivot leg meshes with a speed-driven walk cycle
- `src/game/arms.ts` – `Arms`: shoulder-pivot arms; right hand holds an item and follows its pose
- `src/game/sword.ts` – `Sword`: model (grip at origin, blade along +Y) plus swing timing like `Axe`, with a wrist rotation applied to the model during the strike
- `src/game/skeletons.ts` – `Skeletons`: bone-styled rigs reusing `Legs`/`Arms`; behaviour state machine walk → rest → chase → attack (seed 7, 50 m square, detect 8 m / lose 14 m); `hit` mirrors `Forest.chop`; hits flash red (per-skeleton cloned material) and rattle, dying skeletons collapse and sink; `update` returns killed positions and damage dealt
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
  `FollowCamera.update` return, `Forest.animating`, `Drops.animating`); a new
  animated system must be added to the `render` condition in `main.ts` or it
  will appear frozen. Set `needsRender = true` for one-off redraws (resize).
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
  items are children of the hand. Weapons (`Axe`, `Sword`) own their swing
  timing and expose `angle`/`swinging`; the arm applies `angle` and locks to
  it while swinging. `Legs`/`Arms` accept a style object to swap materials;
  clone a shared material per instance when one object must tint alone.
- World layout: spawn at origin, house at (12, 0, -10), trees inside a 120 m
  square (seed 42). The sun's shadow frustum covers ±70 m; scenery outside it
  casts no shadow.
- Share materials/geometries as module-level constants (see `drops.ts`,
  `trees.ts`) instead of allocating per instance.
- Player-driven game events flow through return values from `update` (e.g.
  `Player.update` returns `{ hit, active }`, `Forest.update` returns
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
- F or left click (without dragging): swing axe; 3 hits fell a tree, 2 kill a skeleton (skeletons take priority when both are in reach)
- Skeletons within 8 m chase you and swing when adjacent; each hit costs a heart, with 0.8 s invulnerability after. Hearts regen one per 5 s out of combat.
- Walk over logs/seeds/bones to pick them up
- Mouse drag: orbit camera
