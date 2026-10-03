# Boulders and stone axe — design

## Goal

Break up the flat plane with boulders the player (and skeletons) can push around,
and give the axe a stone tier. Stone comes from chipping boulders with the axe,
so pushing and mining pull against each other: a boulder you have pushed
somewhere useful is one you lose by mining it.

## Decisions

- **Stone source:** chip boulders with the axe. Each hit drops stone; the last hit
  crumbles the boulder.
- **Push feel:** direct displacement. Walking into a boulder shifts it by exactly
  the overlap, so it moves as fast as the pusher and stops when they stop. No
  velocity, no sliding, no slowdown while pushing.
- **Who pushes:** the player and living skeletons, through the same code path.
  Statics (trunks, stumps, the house), other boulders and, for a skeleton's push,
  the player and already-resolved skeletons block a boulder (see Collision).
- **Stone axe:** an in-place upgrade of the axe in slot 1, crafted once. Keys and
  HUD slots do not change; the slot label stays "Axe".

## Collision (`collision.ts`)

- `CircleCollider` gains an optional `pushable?: boolean`. Only boulders set it.
  Doc comments that call colliders "static" (`Collider`, `Colliders`,
  `World.colliders`) are updated.
- `Colliders.resolve(pos, radius, options?)` gains
  `options: { blockers?: readonly Blocker[]; pushes?: boolean }` with
  `Blocker = { position: THREE.Vector3; radius: number }`. Defaults: no blockers,
  `pushes: true`. The return value keeps its meaning: whether the *character*
  moved.
- For a pushable circle overlapping the character, when `pushes` is true:
  1. The boulder moves away from the character by the overlap, with the usual
     1e-12 overshoot so a second resolve reads `false` (float fixed point).
  2. The boulder is then resolved against every *other* collider (statics and
     other boulders, all treated as static: no recursive pushing, so a boulder
     against a boulder is a block, not a chain) and against the `blockers`,
     using the same iterated pass loop (`MAX_PASSES`). It skips itself; without
     that, coincident centres would fling it along +X on every pass.
  3. Whatever overlap the boulder could not absorb pushes the character back,
     exactly like a static circle. A boulder left overlapping a static after
     `MAX_PASSES` is accepted: nothing resolves it again until it is pushed.
  With `pushes: false` the boulder is an ordinary static circle.
- **Who passes what** (this resolves the ordering problem of two characters on
  either side of one boulder):
  - `Player.update` resolves first, with no blockers. It is the anchor, and a
    boulder it shoves into a not-yet-resolved skeleton is allowed to overlap it.
  - `Skeletons.update` resolves each living skeleton with
    `blockers = [player, ...already-resolved living skeletons]`. A skeleton that
    pushes a boulder toward the player, or toward a skeleton already resolved,
    is stopped by that blocker and yields instead. A boulder the player shoved
    into a skeleton therefore pushes the skeleton out rather than bouncing back.
  - Dying skeletons (`health <= 0`) pass `pushes: false`, so a toppling corpse
    cannot shove a boulder.
  - The player is never moved by a boulder except through step 3, so the
    "player is authoritative" rule in `skeletons.ts` still holds.
- New `Colliders.overlaps(pos, radius): boolean`: side-effect-free probe.
  `Torches.place` currently probes with `colliders.resolve`, which would shove a
  boulder; it switches to `overlaps`. Boulder placement uses it too.
- New `Colliders.remove(collider)` for a crumbled boulder, called outside
  `resolve`. The collider goes the moment the crumble starts, so nothing is
  blocked by a vanishing rock.
- Collider x/z are plain numbers while the push helpers take a `Vector3`; a
  module-level scratch vector is used instead of allocating inside `resolve`.
- Boulder motion does not flow through `resolve`'s return value. `Boulders`
  detects it by comparing each collider with the last synced mesh position.

## Boulders (`boulders.ts`)

- `Boulders(scene, colliders)`; `place(x, z, scale)` builds a mesh (shared unit
  rock geometry, uniformly scaled, a rough grey material), registers a pushable
  circle collider (radius 0.9 × scale) and starts it at 4 hit points (an
  exported constant).
- `chip(origin, forward, damage): ChipOutcome` with
  `ChipOutcome = { result: 'miss' } | { result: 'hit' | 'crumbled'; at: THREE.Vector3 }`;
  `at` is the boulder's position (a copy), present only when not a miss. Only intact boulders are targeted (crumbling
  ones are filtered, as `Forest.chop` filters `standing`), via `nearestInCone`.
  A hit starts a 0.3 s wobble. The crumbling hit removes the collider and
  shrinks/sinks the mesh over 0.4 s, then removes the mesh.
- Stone drops: `chip` queues a `StoneDrop` `{ position, outward, amount }`, which the next
  `update` returns — the same frame, because `chip` runs before `update` (below).
  A plain hit yields `amount: 1`; the crumbling hit yields `amount: 2` (1 for
  the hit plus 1 bonus). `position` is on the boulder's rim facing the hitter
  (`center − away · radius`), so stones are not hidden inside the rock or out of
  pickup reach. `outward` is the unit horizontal vector from the boulder toward
  the hitter (stones pop along it). A boulder yields 5 stone at damage 1 (three plain hits, then the
  crumble) and 3 at damage 2.
- `update(dt)` syncs mesh positions from collider positions, advances wobbles and
  crumbles, and returns the queued drops. `animating` is derived from state —
  a wobble or crumble in progress, or any collider differing from its mesh this
  sync — not a flag cleared at the start, so a `chip` earlier in the frame needs
  no ordering trick. `Boulders` joins the `scenery` list in `main.ts`.
- Frame order in `main.ts`: `boulders.chip` with the strike handling (like
  `forest.chop`), and `boulders.update` *after* `skeletons.update`, so pushes made
  by skeletons are synced and rendered in the same frame.
- A read-only accessor exposes boulder positions and remaining hit points for
  tests, since the collider objects are otherwise private.
- Placement: a pure helper `boulderSpots(rand, colliders, house)` returns the
  spots; `addProps` calls it and `Boulders.place`s each. 10 boulders from a fresh
  `seededRandom(99)` stream (the tree layout from seed 42 is unchanged), scale
  0.7–1.2, inside the 120 m square. Rejected within 8 m of the spawn or of the
  house, or if `colliders.overlaps` reports a trunk within the boulder's radius
  plus 0.5 m. Placed after the trees so their colliders exist.
- Wiring: `createWorld` builds `Boulders` and returns it in the `World`
  interface; `addProps` takes it as a parameter; `main.ts` destructures it.

## Stone (`items.ts`, `drops.ts`, `style.css`)

- `ItemKind` and `ITEM_KINDS` gain `stone`, label `Stones`; `DroppedKind` already
  covers it (only `arrow` and `torch` are excluded), and the `Record<DroppedKind,…>`
  `MODELS` map in `drops.ts` forces the model.
- `Drops` gains a stone model (small grey rock, `restHeight` from its radius) and
  `spawnFromBoulder(position, outward, amount)`, with an outward pop.
- `#inventory .item-stone::before` swatch in `style.css`.

## Stone axe

- Recipe `stoneAxe`: 4 stone, 2 logs. `RecipeOutput` gains
  `{ kind: 'upgrade'; upgrade: 'stoneAxe' }`. `craft` still spends and returns the
  output; `main.ts` switches on `output.kind` and applies an upgrade with
  `player.upgradeAxe()`.
- One-time: `bindCraftingHud` replaces its `isUnlocked` parameter with a single
  `owned(recipe)` predicate covering the bow and the upgrade, and hides an owned
  row (as the bow row is hidden today). `canCraft` stays cost-only.
- `Axe` gets a tier (`'wood' | 'stone'`): stone swaps the steel head and blade
  for a rough grey material and raises `damage` from 1 to 2. `WeaponKind` stays
  `axe`. `Player` keeps the `Axe` in its own typed field (the `weapons` record is
  typed `Weapon`) and exposes `upgradeAxe()` and `axeDamage`.
- `Forest.chop(origin, forward, damage)` subtracts `damage` from a tree's 3 hit
  points: the stone axe fells a tree in 2 hits. `Boulders.chip` takes the same
  `damage`: a boulder with 4 hit points takes 2 stone-axe hits. Skeletons stay at
  damage 1, so two hits still kill and the first-hit knockback still matters.
- Strike priority in `main.ts`: skeleton, then tree, then boulder.

## Sound

New `SoundKind`s `stoneHit` (clink) and `crumble` (low rumble), both positioned at
the `at` returned by `chip`, played from `main.ts`. The exhaustive `never`
default in `synth.ts` forces a recipe for each; tune by ear (the sound layer has
no unit tests). Stone pickups reuse `pickup`; pushing is silent.

## Tests

Expected values derive from exported constants (hit points, damage per tier,
`MAX_PASSES`), not literals. Simulations run at `dt = 1/60` with one frame of
slack.

- `collision.test.ts`:
  - a push moves the boulder by the overlap;
  - a boulder against a trunk or the house blocks, and the character is pushed
    out;
  - a boulder against another boulder blocks without moving it;
  - a second resolve returns `false` (fixed point), and a pinned boulder does not
    creep over repeated frames;
  - **sandwich regression:** player and skeleton on either side of one boulder,
    resolved in frame order (player, then skeleton with the player as a blocker),
    neither passes through it and the boulder stops moving once both stop;
  - `pushes: false` leaves the boulder where it is;
  - `overlaps` does not move anything; `remove` drops the collider.
- `player.test.ts`: walking into a boulder pushes it; after the player stops,
  `PlayerUpdate.active` is false (idle lock-in); a pinned boulder stops the
  player.
- `boulders.test.ts`: hit points, drop amounts (1 per plain hit, 2 on the
  crumble, derived from the constants), drop position on the rim, collider
  removal on crumble, a miss outside the cone, crumbling boulders not
  targetable, `animating` false once settled (after a push and after a crumble),
  and `boulderSpots` clear of spawn, house and trunks.
- `axe.test.ts`: damage per tier. `crafting.test.ts`: stone-axe cost and the
  upgrade output. `torches.test.ts`: placing next to a boulder does not move it.
- `Skeletons` has no unit tests, so skeleton-driven pushing is covered at the
  `Colliders` level above.

## Docs

- `CLAUDE.md`: layout entries for `boulders.ts` and the new collision API
  (`blockers`, `pushes`, `overlaps`, `remove`), the stone axe recipe, and the
  gotcha that `resolve` has side effects on pushable colliders (probe with
  `overlaps`).
- `BACKLOG.md`: tick off "Boulders and stone axe"; add known limitations:
  - a tree beats a boulder when both are in reach;
  - a boulder pushed into a corner can wedge permanently;
  - skeletons can drift boulders;
  - arrows pass through boulders;
  - at or below ~20 fps a knockback step can exceed a small boulder's contact
    distance and carry the player past its centre.

## Out of scope

Slowing the player while pushing, a push sound, persistence, boulders damaging
characters, skeletons attacking boulders, arrow-boulder collision, substepping
large displacements, and a shared nearest-target pick between trees and boulders.
