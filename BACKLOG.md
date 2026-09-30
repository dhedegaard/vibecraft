# Backlog

Ideas and follow-ups, roughly in the order they seem worth doing. Each feature
gets a spec in `docs/superpowers/specs/` before work starts; tick or delete
entries here when they land.

## Next features

- [ ] **Night spawns** — skeletons spawn near the player after sunset and
      crumble at dawn, so the day cycle drives difficulty. Torches are the
      counterpart (`DayCycle.phase`, `Skeletons`, `sunElevation` already exist).
      Retune with it: skeleton detect/lose ranges at night vs day, and day
      length (`CYCLE_SECONDS` = 150) once nights have content.
- [ ] **Planting seeds** — a key plants a seed; a sapling grows through scaled
      stages into a choppable tree. Closes the log → seed → tree loop (seeds are
      collected but useless today). Unit-tree geometry already scales per tree.
- [ ] **Building** — place log blocks / wall segments: placement preview, grid
      snapping, colliders, maybe persistence. Bigger subsystem; needs a spec.
- [ ] **Cat boss** — a big cat, the natural predator of a mouse, with a lair in
      sight of the spawn so the player sees it from the start and chooses when
      to go fight it. Needs its own rig, attacks and a reward.
- [ ] **Boulders and stone axe** — boulders scattered in the world that the
      player can push around (a movable collider, unlike trunks and the house),
      and a stone axe tier that fells trees in fewer hits. Where stone comes
      from (chipping boulders?) is for the spec.
- [ ] **Pond** — a patch of water to break up the flat plane: a collider or
      slow-wading zone, reflections kept cheap. Fishing could follow.

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
- [ ] Grass and flowers: instanced ground foliage, budgeted so it doesn't cost
      the idle renderer anything.

## Tuning to revisit

- `TORCH_INTENSITY` (9) and `LIGHT_DISTANCE` (9 m) against the night palette
  once more scenery exists.
- Torch crackle follows `torches.repellers`, so a torch crackles at full level
  through its 30 s fade-out and then cuts; fade the voice with the light if the
  cut is noticeable.

## Known cosmetic limitations

- A trunk straddling a torch rim can push a skeleton back inside the light on
  the collider pass (bounded by `MAX_PASSES`; accepted).
- Nothing in the codebase disposes three.js materials or geometries on removal
  (`drops.ts`, `skeletons.ts`, `torches.ts`); fine at current object counts,
  revisit if churn grows.
- A blocked chaser stands still at a torch rim but keeps facing the player; a
  pacing or hesitating animation would read better.
- The camera has no collision: it clips through trunks and the house, more
  often when zoomed out.
