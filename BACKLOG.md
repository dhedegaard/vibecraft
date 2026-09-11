# Backlog

Ideas and follow-ups, roughly in the order they seem worth doing. Each feature
gets a spec in `docs/superpowers/specs/` before work starts; tick or delete
entries here when they land.

## Next features

- [ ] **Night spawns** — skeletons spawn near the player after sunset and
      crumble at dawn, so the day cycle drives difficulty. Torches are the
      counterpart (`DayCycle.phase`, `Skeletons`, `sunElevation` already exist).
- [ ] **Planting seeds** — a key plants a seed; a sapling grows through scaled
      stages into a choppable tree. Closes the log → seed → tree loop (seeds are
      collected but useless today). Unit-tree geometry already scales per tree.
- [ ] **Building** — place log blocks / wall segments: placement preview, grid
      snapping, colliders, maybe persistence. Bigger subsystem; needs a spec.
- [ ] **Sound** — Web Audio: footsteps, chop, bow twang, arrow hit, skeleton
      rattle, torch crackle. Big feel win, no game-logic test burden.

## Smaller ideas

- [ ] Campfire: a larger stationary light crafted from logs, no lifetime, rests
      near it heal faster.
- [ ] Torch in hand: slot 3 holds a torch so the player carries light (the
      light pool would need one reserved slot).
- [ ] Particles: wood chips on a chop, sparks on a torch, dust when a skeleton
      sinks. Keep them budgeted and `animating`-aware.
- [ ] Skeleton archers or a second enemy type using the existing `Weapon`
      interface.
- [ ] Shield / block on right click.
- [ ] Persistence: save inventory, torches, felled trees and time of day to
      `localStorage`; restore on load.
- [ ] Pause menu and a settings panel (mouse sensitivity, shadows on/off,
      key rebinding).
- [ ] Minimap or compass pointing home.
- [ ] Gamepad support via the Gamepad API.
- [ ] Weather: rain that dims the sky and drips off trees; wind that sways them.

## Tuning to revisit

- `TORCH_INTENSITY` (9) and `LIGHT_DISTANCE` (9 m) against the night palette
  once more scenery exists.
- Skeleton detect/lose ranges at night vs day if night spawns land.
- Day length (`CYCLE_SECONDS` = 150) once nights have content.

## Known cosmetic limitations

- A trunk straddling a torch rim can push a skeleton back inside the light on
  the collider pass (bounded by `MAX_PASSES`; accepted).
- The coarse-step test in `torches.test.ts` bounds steps with literals because
  `VISUAL_STEP` is private.
- Nothing in the codebase disposes three.js materials or geometries on removal
  (`drops.ts`, `skeletons.ts`, `torches.ts`); fine at current object counts,
  revisit if churn grows.
- A blocked chaser stands still at a torch rim but keeps facing the player; a
  pacing or hesitating animation would read better.
