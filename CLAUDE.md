# vibecraft

A 3D browser game: a character moving around in a 3D world. Currently a capsule
character on a flat green plane with WASD movement, jumping, and a mouse-orbit
third-person camera.

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
- `src/game/world.ts` – scene, ground plane, lights, fog
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

## Controls

- WASD / arrows: move
- Space: jump
- Mouse drag: orbit camera
