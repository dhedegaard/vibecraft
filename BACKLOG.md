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

## Smaller ideas

- [ ] Pond polish: make the water read as water (a sky-tinted surface and cheap
      animation that still lets the renderer idle; the basin, shoreline and
      transparency exist), and place a few ponds of different sizes instead of
      the single landmark one (`Ponds` already supports several; `POND` in
      `props.ts`, the keepouts for trees, boulders and torches, and the
      start-view visibility need revisiting).
- [ ] Fish: fish in the pond(s) that can be caught (a rod crafted from logs, or
      speared with the axe) and eaten to heal; a campfire could cook them for
      more. The pond exists (`ponds.ts`).
- [ ] Campfire: a larger stationary light crafted from logs, no lifetime, rests
      near it heal faster.
- [ ] Torch in hand: slot 3 holds a torch so the player carries light (the
      light pool would need one reserved slot).
- [ ] Particles: wood chips on a chop, stone chips on a boulder hit and dust
      when it crumbles, sparks on a torch, dust when a skeleton sinks. Keep them
      budgeted and `animating`-aware.
- [ ] Skeleton archers or a second enemy type using the existing `Weapon`
      interface.
- [ ] Shield / block on right click.
- [ ] Persistence: save inventory, the stone axe, torches, felled trees, boulder
      positions and time of day to `localStorage`; restore on load.
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
- Stone axe strength: damage 2 is 1.5× on trees (3 hit points → 2 hits), 2× on
  boulders and 1× on skeletons. Raising tree hit points to 4 makes it a clean
  2× on trees; hitting skeletons harder would make it one-shot them and skip
  the first-hit stagger. It also yields less stone per boulder (3 vs 5), and
  its grey head reads as duller than the steel one.
- Boulder layout: 10 boulders, the nearest ~17 m from the spawn and most
  38–62 m out, with only 2 inside the ±25 m skeleton roam area. Count, extent
  or a few placed in sight of the spawn may need raising (`BOULDER_COUNT`,
  `boulderSpots`).
- Boulder sounds (`stoneHit`, `crumble`) and `splash` are first-pass; `crumble`
  ignores `variation`, so every crumble is identical, and `splash` (peak 0.35)
  is louder than a footstep (0.25).
- Pond balance: a wading player (3 m/s) moves at a chasing skeleton's dry-land
  speed, so crossing water while chased doesn't gain distance; tune
  `WADE_SPEED_FACTOR`. The water's look at night and at 25 m zoom was only
  checked by eye once.

## Small code follow-ups

- `Colliders.resolve` allocates its default `{}` options on every call; hoist a
  constant.
- `Boulders.chip` targets the mesh position, which trails the collider by a
  frame after a push (at most ~0.1 m); read the collider instead.
- `boulderSpots` has no attempt cap; fine while the world is seeded, but an
  over-constrained layout would loop forever.
- The `boulderSpots` keepout test stub ignores its margin, so a boulder's
  margin against the water isn't pinned (use `contains: (x, _z, m) => x < 10 + m`
  and assert `s.x - boulderRadius(s.scale) >= 10`); one torch test hard-codes a
  3 m spacing instead of deriving it from `TORCH_SPACING`.
- Untested paths in `collision.test.ts`: a boulder wedged between two statics
  after `MAX_PASSES`, `pushes: false` combined with blockers, and the
  free-push fixed point.

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
- Boulders: a tree beats a boulder when both are in reach of a swing (priority
  is skeleton, tree, boulder), so a boulder beside a tree is hard to chip. A
  boulder pushed into a corner or against a trunk can wedge permanently, and
  skeletons can drift boulders out of useful places.
- Boulders slide over planted torches and ground drops (neither has a collider),
  and arrows pass through them.
- Shoving a boulder can squeeze a skeleton into a trunk or wall, as shoving a
  skeleton directly already could (the player stays authoritative).
- A boulder's collision radius is 0.9 × scale against a ~1 × scale mesh, so
  characters clip about 0.1 m into the rock.
- Dropped items ignore the pond: they rest at y = 0, so bones from a skeleton
  killed mid-pond hover above the water. Boulders follow the basin floor but
  don't tilt or roll on the slope. When a boulder is pushed onto the pond wall
  near the rim, the rock stays level while the floor falls away, showing a gap
  on the downhill side.
- At or below ~20 fps one knockback step can exceed a small boulder's contact
  distance and carry the player past its centre.
