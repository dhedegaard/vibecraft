# Cat boss — design

## Goal

Give the world a boss: a big cat, the mouse's natural predator, asleep in a
cave the player can see from the spawn. The player decides when to go and fight
it; killing it drops a trophy and turns the cave into a skeleton-free shelter.
It is a one-off: it never respawns.

## Decisions

- **Fight shape:** lair-bound ambusher. It sleeps until the player comes close
  or hits it, chases, pounces and swipes, and stalks back to its bed (healing)
  if the player gets far away or it strays too far from the bed. It cannot be
  chipped down for free: any hit wakes it or brings it back.
- **Reward:** 4 bones plus 1 *whisker* (a new ground item, nothing to craft
  from yet) and a permanent 6 m repel circle at the bed so skeletons never
  enter the emptied cave.
- **Health readout:** a souls-style boss bar at the bottom centre with a lagging
  "ghost" fill, and a "CAT FELLED" banner on the kill.
- **Demon eyes:** red unlit spheres with a faint halo, no point light (the pool
  is for torches). They glow dimly while asleep and flare on waking.
- **Sound:** five new synthesised cues (meow, yowl, hiss, hurt, death), all
  positioned at the cat. No cat footstep cue.
- **Torches and skeletons:** the cat ignores torch repel circles and skeletons;
  skeletons do not avoid the cat and the cat is not a `Blocker` for them, so a
  skeleton can push a boulder into the cat, which shoves it back the next frame.
  Accepted: the leash keeps the fight at the edge of their roam square.
- **Fast-forward (Y):** the cat runs on real time, like skeletons.
- **Game over / HMR:** the world freezes on death as today, the cat with it;
  HMR is a full reload, nothing to handle.

## The cave (`cave.ts`)

- `CAVE = { x: 0, z: -42 }` is the mound's centre, straight ahead of the spawn
  (the pond is ahead-left, the house ahead-right). The mouth faces +Z, toward
  the spawn; the sightline from the spawn (|x| < 4, −31 < z < −4) is tree-free
  with the current seed. Fog starts at 30–60 m, so the mound is clearly visible
  from the start by day and the eyes by night.
- `new Cave(scene, colliders)` builds a group and registers its colliders.
  Exposes `bed: { x: 0, z: -41, yaw: 0 }` for the cat (yaw 0 faces +Z, the
  spawn) and `contains(x, z, margin)` (a circle test of `CAVE_RADIUS` 7.5 from
  `CAVE` plus `margin`) so it can serve as a `Keepout`.
- **Meshes** (all `shadowed`, the boulders' `stoneMat` from `mesh.ts`):
  - left and right lobes: spheres of radius 3.2 at (±4.3, 0, −41.5), scale y
    0.9; their inner faces are 2.2 m apart at the bed;
  - back lump: sphere of radius 3.5 at (0, 0, −46), scale y 1.1 (the summit,
    ~3.9 m); its front face is at z ≈ −42.5, 1.5 m behind the bed;
  - lintel: a sphere of radius 3.2 at (0, 4.1, −41.5), scale (1.4, 0.5, 1): a
    roof over the mouth with 2.5 m of headroom at the centre (the cat's ears
    reach ~2.3 m);
  - the dark inset: a black `MeshBasicMaterial` (0x050505) box 2.4 wide, 2.4
    high and 1.6 deep centred at (0, 1.2, −42.0), filling the pocket behind the
    bed so the mouth reads as depth.
  Starting values; tune by eye in the browser so the lumps close every gap
  except the mouth.
- **Colliders:** three circles slightly inside the meshes, as boulders do
  (0.9× the mesh radius): (±4.3, −41.5) r 2.88 and (0, −46) r 3.15. The bed is 4.33 m from the
  lobe centres and 5.0 m from the back lump, so a body of `BODY_RADIUS` 0.9
  rests there without being pushed (3.8 and 4.0 m needed). The pocket is
  2.8 m wide between colliders at the bed and open toward +Z.
- **Keepouts:** `addProps` rejects tree samples with
  `cave.contains(x, z, TREE_CAVE_MARGIN)` (margin 1.5, i.e. 9 m from `CAVE`).
  To keep the rest of the forest where it is, a cave rejection still consumes
  the three `rand()` draws `Forest.plant` would have made (scale, leaf
  material, rotation) through a new `Forest.skip(rand)` (tested to draw exactly
  as many as `plant`; `Forest.count` reports the trees planted) and still
  counts toward the 60, so only the rejected trees vanish (one with the current
  seed, at (6.1, −38.3)) and every other tree and boulder stays put.
  `boulderSpots`' `water: Keepout` parameter becomes
  `keepouts: readonly Keepout[]` and `addProps` passes `[ponds, cave]`; the
  existing boulder margin applies to each. `createWorld` builds the cave before
  `addProps` (its colliders must exist for `boulderSpots`), passes it to
  `addProps(scene, forest, boulders, ponds, cave, colliders)` and returns it in
  `World` as `cave`.
- The cave's shadow pops in when the player comes within the ±40 m shadow
  frustum; expected, noted under accepted limitations.

## The cat (`cat.ts`)

### Rig

- A dark grey (0x2a2a2e) quadruped, one `THREE.Group` in the usual convention
  (yaw = `rotation.y`, forward = local +Z), scaled 1.5× so it is about twice the
  mouse's bulk and its ears still clear the lintel: a capsule body along +Z (1.0 m long, radius 0.32 before scale),
  a sphere head with two cone ears, a short muzzle and six whisker cylinders,
  and a tail on a `TubeGeometry`/`CatmullRomCurve3` like the mouse's.
- **Legs:** two `Legs` instances with a cat `LegStyle` (body material for leg
  and foot), the front pair under a `frontPivot` group at the shoulders and the
  back pair at the hips, both at `Legs.HIP_HEIGHT`. Both run the walk cycle at
  the cat's `groundSpeed`; their `stepped` flags are ignored (no step sound).
  The swipe animates `frontPivot.rotation.x`.
- **Eyes:** two spheres (radius 0.07 before scale) in a `MeshBasicMaterial`
  with `fog: false` (as the sun disc), colour `EYE_ASLEEP` 0x700000 while
  asleep and `EYE_AWAKE` 0xff2020 at scale 1.4 while awake, blended linearly
  over the wake. Each has a halo: a sphere of 2.5× its radius in a transparent
  `MeshBasicMaterial` (0xff2020, `depthWrite` false, opacity 0.15 asleep, 0.35
  awake) so the eyes read as two red points from the spawn at night. Unlit
  materials ignore the lights, so no intensity above 1 is needed and nothing
  clips to pink.
- **Hit flash:** a cloned body material whose `emissiveIntensity` flashes red
  for 0.3 s on a hit, as skeletons do.

### Constants

All exported from `cat.ts` so tests derive their expectations from them.

| name | value | meaning |
| --- | --- | --- |
| `MAX_HEALTH` | 8 | axe 1, stone axe 2, arrow 1 per hit |
| `BODY_RADIUS` | 0.9 | collision and arrow-hit radius (XZ) |
| `ARROW_HEIGHT` | 1.6 | arrow-hit cylinder height |
| `DETECT_RANGE` | 10 | player distance that wakes it (or re-engages a retreat) |
| `LOSE_RANGE` | 25 | player distance (from the cat) at which it gives up |
| `LEASH_RANGE` | 25 | distance from the bed beyond which it gives up |
| `LEASH_SLACK` | 5 | a retreat re-engages only inside `LEASH_RANGE − LEASH_SLACK` (hysteresis at the leash edge) |
| `WAKE_DURATION` | 0.8 s | rise from the sleep pose |
| `CHASE_SPEED` | 5 m/s | the player walks at 6 |
| `RETREAT_SPEED` | 3 m/s | walking back to the bed |
| `TURN_SPEED` | 4 | `turnToward` rate |
| `POUNCE_MIN` / `POUNCE_MAX` | 3 / 6 m | player distance window to pounce |
| `POUNCE_FACING` | 0.9 | min dot(forward, to player) to pounce |
| `POUNCE_CROUCH` | 0.4 s | crouch before the leap; aim is taken at its end |
| `POUNCE_LEAP` | 0.6 s | leap duration, 1.2 m hop |
| `POUNCE_HIT_RADIUS` | 1.5 m | player within this (XZ) of the landed cat takes the hit |
| `POUNCE_DAMAGE` | 2 hearts | with knockback |
| `POUNCE_COOLDOWN` | 3 s | starts at 0, so the first pounce is immediate |
| `SWIPE_RANGE` | 1.8 m | start a swipe |
| `SWIPE_DURATION` | 0.7 s | the whole swipe |
| `SWIPE_HIT_TIME` | 0.5 s | hit frame, seconds after the swipe starts |
| `SWIPE_REACH` | 2.2 m | player must still be this close on the hit frame |
| `SWIPE_DAMAGE` | 1 heart | with knockback |
| `SWIPE_COOLDOWN` | 1.2 s | starts at 0 |
| `HIT_MAX_PLAYER_Y` | 1.2 | a player higher than this (jumping) dodges both attacks, as with the sword |
| `HEAL_INTERVAL` | 2 s | 1 health per interval while retreating or asleep |
| `MEOW_MIN` / `MEOW_MAX` | 8 / 20 s | idle meow spacing while asleep |
| `COLLAPSE_DURATION` / `SINK_DURATION` | 0.9 / 1.2 s | death |
| `SHELTER_RADIUS` | 6 m | repel circle at the bed once dead |

Balance note: an axe swing is 0.75 s, so 8 wood-axe hits take ~6 s face to
face against a 1-heart swipe every ~2.4 s and 2-heart pounces; the player
should expect to lose 3–5 hearts the first time. Tune after the browser check.

### Behaviour

A discriminated union, as in `skeletons.ts`:

```ts
type Behaviour =
  | { kind: 'sleep'; meowIn: number }
  | { kind: 'wake'; t: number }
  | { kind: 'chase' }
  | { kind: 'pounce'; t: number; from: THREE.Vector3; to: THREE.Vector3 }
  | { kind: 'swipe'; t: number }
  | { kind: 'retreat' }
  | { kind: 'collapse'; t: number; topple: Topple }
  | { kind: 'sink'; t: number }
  | { kind: 'gone' };
```

`pounceCooldown`, `swipeCooldown` (both start at 0) and `healTimer` are
instance fields that tick in every living state. "Give up" below means: the
player is beyond `LOSE_RANGE` from the cat **or** the cat is beyond
`LEASH_RANGE` from the bed.

- **sleep:** at the bed, rig lowered by 0.3 m (the legs sink into the ground)
  and the head pitched down. `meowIn` counts down; at zero it queues a
  positioned `catMeow` and rerolls `MEOW_MIN`–`MEOW_MAX` (seeded random). Heals
  on `HEAL_INTERVAL`. Player within `DETECT_RANGE`, or any hit → **wake**.
  Not `animating` (a cue needs no render).
- **wake:** over `WAKE_DURATION` the rig rises, the head lifts and the eyes
  flare (eased); a `catYowl` on entry; `healTimer` reset. Then **chase**.
- **chase:** `turnToward` the player, `stepForward` at
  `CHASE_SPEED × terrain.speedFactor`. Position resolved with
  `colliders.resolve(pos, BODY_RADIUS, { blockers: this.blockers })`, where
  `blockers` is an instance array holding one `Blocker`
  `{ position: playerPos, radius: CHARACTER_RADIUS }` (its `position` is
  re-pointed each frame; no per-frame allocation), so it can shove a boulder but
  not into the player; then `separate(playerPos, CHARACTER_RADIUS, pos,
  BODY_RADIUS)` with the player as the anchor (never moved). Y snaps to
  `terrain.heightAt`. Legs run at `groundSpeed`. Transitions, in order: give up
  → **retreat**; within `SWIPE_RANGE` and swipe cooldown done → **swipe**;
  between `POUNCE_MIN` and `POUNCE_MAX`, facing dot ≥ `POUNCE_FACING` and
  pounce cooldown done → **pounce**.
- **pounce:** `t < POUNCE_CROUCH`: hold position, legs still, rig dips 0.2 m.
  At the end of the crouch `from` = own position and `to` = the player's
  position *now* (so the player can sidestep during the leap), clamped to
  `POUNCE_MAX` from `from`; `catYowl`. The leap moves by per-frame deltas, the
  `shoveStep` way: each frame adds `lerp(from, to, s(t + dt)) − lerp(from, to,
  s(t))` on XZ (linear `s`) and sets y to the terrain plus a 1.2 m sine hop,
  then resolves against colliders and separates from the player, so a trunk
  stops it short and it lands wherever it ended. On the step that completes the
  leap: if the player's XZ distance to the cat is within `POUNCE_HIT_RADIUS`
  and `playerPos.y < HIT_MAX_PLAYER_Y`, `POUNCE_DAMAGE` with `hitFrom` = cat
  position. Cooldown set; → **chase**. The pounce cannot be interrupted.
- **swipe:** `catHiss` on entry. `frontPivot.rotation.x` raises to −1.0 rad by
  0.3 s, slams to +0.2 at `SWIPE_HIT_TIME` and eases back to 0 by
  `SWIPE_DURATION` (keyframes lerped on `t`). On the step that crosses
  `SWIPE_HIT_TIME` (compare `t` before and after the step), if the player is
  within `SWIPE_REACH` and `playerPos.y < HIT_MAX_PLAYER_Y`: `SWIPE_DAMAGE`
  with `hitFrom`. At `SWIPE_DURATION`: cooldown set, → **chase**. Not
  interrupted by hits.
- **retreat:** walks to the bed at `RETREAT_SPEED` (same resolve/separate),
  healing on `HEAL_INTERVAL`. Player within `DETECT_RANGE`, or any hit →
  **chase** (no wake delay), but only while the cat is inside
  `LEASH_RANGE − LEASH_SLACK` of the bed; otherwise it keeps walking home (a
  player hovering at the leash edge would otherwise flap it between the two
  states every frame). Within 0.3 m of the bed → **sleep**: the position and
  the sleep pose snap (an eased settle is a backlog idea) and the yaw turns to
  the bed yaw with `turnToward` over the first sleep frames (~1.5 s); `turnToward` (`motion.ts`) gains a snap when within
  0.005 rad of its target, like `settle`, and returns whether it is still
  turning (existing callers ignore the return value), so the cat stops
  `animating` once it has settled.
- **hit** (`hit`/`shoot`): health −= damage, flash, `catHurt` queued; asleep →
  wake, retreating → chase (inside the leash slack), as above. No stagger and no knockback: attacks keep
  running. Health ≤ 0 → **collapse** (`beginTopple` away from the striker,
  `catDeath`). Hits on a cat already at 0 are ignored.
- **collapse → sink → gone:** `applyTopple` for `COLLAPSE_DURATION`, then sinks
  for `SINK_DURATION` and is hidden. Dying, it no longer resolves against
  colliders or the player (like a dying skeleton's `pushes: false`, just skip
  the resolve). The `killed` position is reported on the frame collapse ends
  (drops spawn there), as skeletons do.

### Public surface

```ts
class Cat {
  constructor(scene: THREE.Scene, bed: { x: number; z: number; yaw: number });
  readonly position: THREE.Vector3;          // the group's position
  get health(): number;
  get awake(): boolean;   // wake, chase, pounce, swipe, retreat
  get dead(): boolean;    // health <= 0
  get animating(): boolean;
  /** Empty while alive; one SHELTER_RADIUS circle at the bed once dead. */
  readonly repellers: readonly Circle[];
  hit(origin: THREE.Vector3, forward: THREE.Vector3, damage: number): boolean;
  shoot(from: THREE.Vector3, to: THREE.Vector3): boolean;
  update(dt: number, playerPos: THREE.Vector3, colliders: Colliders, terrain: Terrain): CatUpdate;
}
interface CatUpdate {
  damage: number;
  hitFrom: THREE.Vector3 | undefined;
  killed: THREE.Vector3 | undefined;
  sounds: SoundCue[];
}
```

- `hit` uses `nearestInCone` over the one-element list with the reach extended
  by `BODY_RADIUS` (`nearestInCone` gains an optional trailing `reach`
  parameter defaulting to `MELEE_REACH`).
- `shoot` uses `segmentHitsCylinder(from, to, centre, radius, height): number |
  undefined`, the segment-vs-cylinder test extracted from `Skeletons.shoot`
  into `targeting.ts`; it returns the segment parameter of the hit (which
  `Skeletons.shoot` needs to pick the nearest of several) or `undefined`.
- `hit`/`shoot` run before `update` in a frame; their cues are queued and
  flushed by the next `update`, like skeletons.

## Reward

- `items.ts`: `ItemKind` gains `'whisker'` (label "Whiskers"), a `DroppedKind`;
  `ITEM_KINDS` lists it; `style.css` gets an `#inventory .item-whisker::before`
  swatch (thin white line).
- `drops.ts`: a `whisker` model (a white cylinder 0.02 × 0.6 lying flat) and
  `spawnFromCat(position, outward)`: 4 bones + 1 whisker popped with a small
  pop (0.8) along `outward`, as `spawnFromBoulder` does, so a kill in the
  pocket doesn't fling items into the rock. `main.ts` passes the direction
  from the cat to the player (horizontal, normalised; +Z if degenerate).
- `Cat.repellers` becomes `[{ position: bed, radius: SHELTER_RADIUS }]` once
  dead. `main.ts` keeps a scratch array it refills each frame with the torch
  repellers plus the cat's and passes it to `skeletons.update`; `audio.update`
  keeps receiving `torches.repellers` only, so no crackle voice follows the
  cave. The eyes go out with the body.

## Boss bar (`index.html`, `style.css`, `hud.ts`)

- Markup: `<div id="boss"><div id="boss-name">Cat</div><div id="boss-bar"></div></div>` and
  `<div id="boss-felled" hidden>Cat felled</div>`; the binding creates the
  `.ghost` and `.fill` spans inside `#boss-bar`, as `bindDrawMeter` does.
- Style, souls-like: `#boss` fixed at bottom centre, `bottom` 100 px,
  `width: min(60vw, 720px)`, `opacity: 0` with `transition: opacity 0.3s`
  and `pointer-events: none`, shown by a `visible` class (opacity 1); no
  `hidden` attribute, so the fade always transitions. The name in small-caps
  serif, left-aligned above the bar; the bar 10 px tall, `position: relative`,
  near-black track with a 1 px pale border; `.fill` and `.ghost` are
  `display: block; position: absolute; inset: 0 auto 0 0` with a `width` in
  percent, `.fill` deep red (0xb01818) above `.ghost` pale yellow (0xe8d890).
  `.fill` has `transition: width 0.1s`; `.ghost` has
  `transition: width 0.5s ease-out 0.5s`, so each chunk of damage lingers in
  yellow and then drains. `#boss-felled`: large gold serif text centred on
  screen, a one-shot CSS keyframe animation that fades in over 0.5 s, holds and
  fades out by 3 s; `#boss-felled[hidden] { display: none }`.
- `bindBossHud(bossEl, barEl, felledEl)` returns `(health, max, awake, dead) => void`,
  called every frame from `main.ts`. It remembers the last values and only
  touches the DOM on change: fill and ghost widths as percentages (when health
  *rises*, the ghost is set with `transition: none` for that write and the
  transition restored on the next frame, so healing never shows a yellow lead);
  `visible` on when awake, off when asleep; on the first `dead` frame it sets
  both widths to 0, removes `visible` after 1 s (`setTimeout`), and shows the
  banner once (`hidden` off, `hidden` back on at `animationend`).
- `main.ts` closes the crafting panel (`crafting.close()`) on the frame the cat
  becomes awake, since the panel (right 12 px, bottom 60 px, 220 px wide)
  overlaps the bar on windows narrower than ~1180 px.

## Sound (`sounds.ts`, `synth.ts`)

New `SoundKind`s, all positioned at the cat through the positional bus:

- `catMeow` (idle, ~0.6 s): a sawtooth sliding 500 → 900 → 400 Hz with a
  little vibrato through a band-pass whose centre sweeps 800 → 2 400 → 900 Hz
  (the "ee-ow"), soft attack, quick release. `variation` shifts the pitch.
- `catYowl` (wake, pounce, ~1.0 s): the same shape an octave lower and harsher
  (a square mixed in, slower glide, longer sustain).
- `catHiss` (swipe wind-up, ~0.4 s): band-passed noise around 4 kHz with a
  fast attack.
- `catHurt` (~0.3 s): a short falling yowl.
- `catDeath` (~1.5 s): a long falling yowl with a tremolo tail.

With the positional bus's inverse rolloff a cue 40 m away plays at roughly
0.17 of its level before the bus gain (and no quieter beyond `maxDistance`
40 m), so a meow peaking like `skeletonHurt` is just audible from the spawn;
tune the recipe gains by ear. No unit tests, by convention.

## Wiring (`main.ts`, `world.ts`)

- `createWorld` builds `Cave` (before `addProps`) and returns it; `main.ts`
  creates `const cat = new Cat(scene, cave.bed)` and adds it to `scenery`.
- Strike priority becomes cat, skeleton, tree, boulder:
  `cat.hit(player.position, player.forward, player.axeDamage)` first. Arrow
  paths test `cat.shoot(from, to) || skeletons.shoot(from, to)`; either removes
  the arrow and plays `arrowHit`.
- Order in the frame: `skeletons.update`, then `cat.update(dt,
  player.position, colliders, ponds)`, then `boulders.update` (so a boulder
  either shoved is synced and rendered this frame).
- Damage: the cat's damage is applied first through its own
  `health.damage(catUpdate.damage)` call (bigger hit, its `hitFrom`), then the
  skeletons' through theirs; `Health.damage` already refuses a second hit
  inside the 0.8 s invulnerability window, so the two are never summed and at
  most one `player.knockBack` and one hurt/death cue happen per frame. The
  existing skeleton block becomes a small `applyDamage(amount, hitFrom)`
  helper called twice.
- `showBoss(cat.health, MAX_HEALTH, cat.awake, cat.dead)` each frame; `killed`
  → `drops.spawnFromCat(at, outward)`; the cat's sounds play like the
  skeletons'.

## Tests

- `cat.test.ts` (fixed `dt = 1/60`, a `Colliders` with no statics,
  `FLAT_TERRAIN`, scripted player positions, frame counts derived from the
  exported constants with one extra step allowed, cues filtered by `kind`):
  - asleep and `animating` false with the player 12 m away for 5 s; health
    stays at `MAX_HEALTH` (a seeded `meowIn` may fire a `catMeow` in that time,
    which is fine);
  - the player at 8 m wakes it: `awake` true, a `catYowl` cue, and after
    `WAKE_DURATION` it closes on the player (distance decreases monotonically);
  - an arrow (`shoot`) through a sleeping cat wakes it; an axe `hit` during a
    retreat puts it back in chase (distance to the player decreases again);
  - pounce: player parked 4.5 m ahead; a pounce starts, the cat lands near the
    player and `damage` is `POUNCE_DAMAGE` with `hitFrom` set; the same with
    the player teleported 3 m sideways after the crouch deals nothing; the same
    with `playerPos.y = 1.5` deals nothing;
  - swipe: player adjacent; `SWIPE_DAMAGE` on the hit frame, then no damage for
    `SWIPE_COOLDOWN`;
  - give up: after one `hit`, the player moved 30 m away mid-chase: the cat
    heads back toward the bed and heals 1 after `HEAL_INTERVAL`; back within
    `DETECT_RANGE` it chases again; left alone it reaches the bed, sleeps and
    `animating` becomes false within a second of arriving; the same when the
    player stays 8 m ahead but the cat is led past `LEASH_RANGE` from the bed;
  - damage: `hit` with damage 1 × 8 kills it, with damage 2 × 4 kills it;
    `shoot` through the body counts 1, past it misses; hits on a dead cat
    return false;
  - death: `killed` reported once, `repellers` empty before and one circle of
    `SHELTER_RADIUS` at the bed after; `catDeath` cued.
- `cave.test.ts`: `colliders.overlaps(bed, BODY_RADIUS)` is false (the cat
  rests on its bed); `overlaps` at (±4.3, −41.5) and (0, −46) is true;
  `contains` with margin grows the keepout.
- `targeting.test.ts`: `segmentHitsCylinder` hit/miss/height cases and that it
  returns the nearer parameter; `nearestInCone` honours a custom reach.
- `motion.test.ts`: `turnToward` snaps and returns false once within the
  threshold.
- `boulders.test.ts`: the three `boulderSpots` cases that pass `NO_WATER`/
  `water` positionally switch to a `keepouts` array, plus one case with two
  keepouts. `world.test.ts`'s "keeps every boulder clear of the water" gains
  "…and the cave", and a case that the tree count is 59 and the first boulder
  spot is unchanged from before (layout preserved).
- `drops.ts` has no tests (meshes); the drop counts are literals next to
  `spawnFromSkeleton`'s, so they are left untested.
- Keep `skeletons.test.ts` passing with the new `repellers` scratch array.

## Docs

- `CLAUDE.md`: game summary, Layout (`cave.ts`, `cat.ts`, boss HUD, whisker,
  `segmentHitsCylinder`, `turnToward`'s snap), Conventions (strike priority
  cat → skeleton → tree → boulder; `Cat.repellers`; the cat is not a `Blocker`),
  Controls (what the cat does), World layout (cave at (0, −42), 9 m tree
  clearance that consumes the draws, `boulderSpots` keepouts), the shadow
  pop-in under limitations.
- `BACKLOG.md`: tick the cat boss entry; add "craft something from whiskers",
  "cat sleep pose with folded legs" and "the cat as a boulder blocker for
  skeletons" as ideas.
