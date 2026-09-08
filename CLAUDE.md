# vibecraft

A 3D browser game: a character moving around in a 3D world. Currently a capsule
character with an axe on a flat green plane dotted with trees and a house.
WASD movement, jumping, a mouse-orbit third-person camera, and trees that can
be chopped down. Felled trees drop logs and seeds that are picked up by walking
over them into an inventory shown in the HUD. No collision yet.

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

## Layout

- `index.html` – single canvas (`#game`) plus a small HUD overlay
- `src/main.ts` – bootstrap: renderer, game loop, resize handling
- `src/game/world.ts` – scene, ground plane, lights, fog; creates the `Forest` and calls `addProps`
- `src/game/props.ts` – house, seeded random helper, world layout (plants trees via `Forest`)
- `src/game/trees.ts` – `Forest`: tree meshes, chop hit-testing, fall/sink animation, stumps
- `src/game/axe.ts` – axe mesh and swing animation; reports the hit frame
- `src/game/items.ts` – `ItemKind` union and labels; add new item types here
- `src/game/drops.ts` – `Drops`: item meshes on the ground, pop/bounce physics, walk-over pickup
- `src/game/inventory.ts` – `Inventory` counts per item kind with change listeners
- `src/game/hud.ts` – binds the inventory to the `#inventory` DOM panel
- `src/game/player.ts` – character mesh, movement, gravity/jump
- `src/game/camera.ts` – third-person follow camera (yaw/pitch orbit, mouse drag)
- `src/game/input.ts` – keyboard/mouse state, key → action mapping

## Conventions

- Strict TypeScript, no `any`.
- Game code lives under `src/game/`; each concern gets its own module with a
  small class or factory. `main.ts` only wires things together.
- Movement is camera-relative: `Player.update` takes the camera yaw so WASD
  moves relative to the view direction.
- Frame delta is clamped in the loop so tab-switching doesn't cause huge jumps.
- Y is up. The ground plane is at y = 0.
- Player-driven game events flow through return values from `update` (e.g.
  `Player.update` returns true on the axe hit frame, `Forest.update` returns
  felled trees, `Drops.update` returns picked-up items) and `main.ts` routes them,
  rather than modules referencing each other directly.
- Animated scenery uses small discriminated-union state machines (see `trees.ts`).

## Controls

- WASD / arrows: move
- Space: jump
- F or left click (without dragging): swing axe; 3 hits fell a tree
- Walk over logs/seeds to pick them up
- Mouse drag: orbit camera
