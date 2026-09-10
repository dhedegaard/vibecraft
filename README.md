# vibecraft

A small 3D browser game built with [three.js](https://threejs.org/) and vanilla
TypeScript. You play a grey mouse on two legs wandering a flat green world of
low-poly pines and a lone house. Chop trees for logs and seeds, shoot with a
crafted bow or hack the sword-wielding skeletons that roam the woods, and try
not to lose all ten hearts.

## Features

- Third-person camera with mouse-drag orbit and camera-relative WASD movement
- An axe that fells trees in three hits, and a bow crafted from logs and bones
  that fires arcing arrows (hold to draw); arrows are crafted too
- Crafting panel (C) with recipes for the bow and arrows
- Trees shake, topple, rest and sink; felled trees drop logs and seeds
- Skeletons wander, chase you when close, swing swords, stagger when hit and
  collapse after two hits, dropping bones
- Hearts that regenerate slowly out of combat, a hurt flash, and a game-over
  screen with restart
- HUD with inventory counts, weapon slots, FPS and a main-thread idle graph
- Renders only when something changed, so an idle scene costs nothing

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrow keys | Move |
| `Space` | Jump |
| `1` / `2` | Select axe / bow (once crafted) |
| `F` or left click | Attack; hold F to draw the bow, release to fire |
| `C` | Toggle the crafting panel |
| `T` (hold) | Fast-forward the day/night cycle (the clock at the top shows in-game time) |
| Mouse drag | Orbit the camera |
| Walk over items | Pick up logs, seeds and bones |

## Getting started

Requires Node.js and npm.

```sh
npm install
npm run dev
```

Open http://localhost:5173.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm test` | Run the unit tests once with vitest (`npm run test:watch` to watch) |
| `npm run build` | Type-check, then build for production into `dist/` |
| `npm run preview` | Serve the production build locally |

Vite warns about a chunk over 500 kB on build. That is three.js and is expected.

CI runs typecheck, tests and build on every push to `main` and on pull requests.

## Project layout

```
index.html          canvas plus HUD overlays
src/main.ts         bootstrap: renderer, game loop, event routing
src/game/           one module per concern
  world.ts          scene, ground, lights, fog
  daycycle.ts       sun/moon path, lighting palette, sky objects
  props.ts          house and world layout (seeded)
  trees.ts          forest: chop, fall, stumps, drops
  skeletons.ts      enemy AI, hit and arrow tests
  player.ts         mouse character, movement, held weapons
  weapons.ts        Weapon interface, actions, shared swing timer
  axe.ts bow.ts sword.ts
  legs.ts arms.ts   character rig
  drops.ts inventory.ts items.ts crafting.ts
  health.ts hud.ts perf.ts
  camera.ts input.ts
  targeting.ts topple.ts motion.ts signal.ts mesh.ts collision.ts   shared helpers
```

Game systems communicate through the return values of their `update` methods,
which `main.ts` routes, rather than by referencing each other directly. See
`CLAUDE.md` for the full module list and coding conventions.

## Stack

- [Vite](https://vite.dev/) 8
- TypeScript 6 (strict, `noUncheckedIndexedAccess`)
- three.js 0.185
- vitest for unit tests of the game logic (no renderer needed)
- No framework
