# Sound — design

Status: approved 2026-09-12.

## Goal

Give the game a procedural soundscape: every visible action makes a noise,
enemies and torches are audible where they are, and the day/night cycle has an
ambient bed. All sound is synthesised with Web Audio at runtime; there are no
audio asset files. A mute key silences everything and the choice persists
across reloads.

Not in scope: volume sliders or a settings panel (backlog), unit tests for the
audio layer (tuned by ear), sound for features that don't exist yet.

## Architecture

Sound follows the project's event convention: systems report what happened via
their `update` return values and `main.ts` routes it. No game module imports
Web Audio; only `audio.ts` and `synth.ts` touch it. Audio never sets
`animating`, so an idle scene still skips renders while loops keep playing on
the audio thread.

Three new modules:

- `src/game/sounds.ts` — pure types. `SoundKind` union and
  `SoundCue { kind: SoundKind; at?: THREE.Vector3; variation?: number }`.
  Systems import only this. `variation` overrides the random per-play
  variation when the source knows something (tree scale).
- `src/game/synth.ts` — one recipe function per `SoundKind` that builds a short
  node graph (oscillator or noise, gain envelope, optional filter) on a given
  `AudioContext` and connects it to a destination node. Shared helpers:
  `envelope`, `noise` (cached 1 s white-noise buffer), `sweep`. Recipes take a
  `variation` number so repeated cues differ slightly: random in [0, 1)
  unless the cue supplies one.
- `src/game/audio.ts` — `Audio` class owning the context, master gain, mute
  state, listener sync, positional panners, ambient and crackle loops.

Existing modules gain cue outputs (below), `input.ts` gains the mute key,
`hud.ts` gains `bindMuteHud`, and `index.html`/`style.css` gain a `#mute`
glyph in the top-right HUD.

## Sound kinds

`SoundKind =`
`'footstep' | 'jump' | 'land' | 'axeSwing' | 'chop' | 'treeCreak' | 'treeFall' |`
`'bowDraw' | 'bowFire' | 'arrowHit' | 'arrowMiss' | 'pickup' | 'torchPlace' |`
`'craft' | 'weaponSwitch' | 'skeletonStep' | 'skeletonSwing' | 'skeletonHurt' |`
`'skeletonCollapse' | 'playerHurt' | 'death'`.

Loops are not cues: `ambient` (day/night bed) and `crackle` (torches) are
driven from state inside `Audio.update`.

## Cue sources

Cues without `at` are the player's own or UI sounds and play unpanned.

**Player** — `PlayerUpdate` gains `sounds: SoundCue[]`.

- `footstep`: `Legs.update` returns `{ moved, stepped }` instead of a boolean;
  `stepped` is true on a frame where the walk phase crossed a multiple of π
  while grounded and moving (one foot planting). Callers that used the boolean
  read `moved`.
- `jump` on the frame `velocity.y` is set by the jump key; `land` on the frame
  `grounded` flips from false to true.
- `axeSwing` when the axe's `swing()` is accepted, `bowDraw` when the bow's
  draw starts. `Weapon` gains no new members: `Player` compares
  `weapon.swinging` before and after the swing call and picks the kind from
  `weaponKind`.
- `weaponSwitch` when `switched` is true.

**Forest** — `Forest.chop` returns `ChopResult = 'miss' | 'hit' | 'felled'`
instead of a boolean (`'felled'` is the hit that starts the fall). `main.ts`
plays `chop` for `'hit'` and `'felled'`, and `treeCreak` (unpanned; the tree is
within melee reach) for `'felled'`. `Forest.update` is unchanged: it already
returns the trees that landed this frame (falling → resting) as `FelledTree`s,
so `main.ts` plays `treeFall` at each `position` with `scale` as `variation`
so big trees thump lower.

**Skeletons** — `SkeletonsUpdate` gains `sounds: SoundCue[]`, all positioned at
the skeleton. `skeletonStep` from each skeleton's `Legs.stepped`;
`skeletonSwing` at both `sword.swing()` call sites (the chase → attack
transition and the repeat in the attack case). `applyHit` emits
`skeletonHurt` for a non-lethal hit (stagger) and `skeletonCollapse` for the
lethal one (collapse begins there). `hit` and `shoot` run before `update`
within a frame, so `applyHit` pushes its cue onto a pending list that `update`
flushes into `sounds`.

**Projectiles** — `Projectiles.update` returns `{ paths, landed }` where
`landed: THREE.Vector3[]` are the positions of arrows removed at y < 0 this
frame (timeouts are silent). `main.ts` plays `arrowMiss` at each and
`arrowHit` at `path.to` when `skeletons.shoot` connects.

**main.ts** plays from booleans it already has: `bowFire` on the `fire`
action, `pickup` per item from `Drops.update`, `torchPlace` when
`torches.place` succeeds, `craft` in the crafting callback when `craft`
returns `ok`, `playerHurt` when `health.damage` returns true, `death` once on
the frame `health.dead` first becomes true.

**Loops** read public state: the ambient blend from `sunElevation(dayCycle.phase)`,
crackle positions from `torches.repellers` (`Circle.position`).

## Audio class

```ts
class Audio {
  constructor(canvas: HTMLElement);       // installs the gesture listeners
  readonly muted: boolean;
  toggleMute(): boolean;                  // returns the new state
  play(cue: SoundCue): void;
  update(dt: number, camera: THREE.Camera, phase: number, torchPositions: readonly Circle[]): void;
}
```

- **Context creation.** Browsers refuse to start audio without a gesture. The
  constructor registers `keydown` and `pointerdown` listeners (`once`) that
  create the `AudioContext`, master `GainNode` and loops. Cues before then are
  dropped. If `context.state` is `suspended` later (tab switch), the next
  gesture calls `resume()`.
- **Master gain** 0.5. Mute sets it to 0 with a 50 ms ramp instead of
  suspending the context so loops stay in phase. State is stored in
  `localStorage` under `vibecraft.muted` (`'1'`/`'0'`), read in the
  constructor, wrapped in try/catch for private windows.
- **Listener.** `update` writes the camera's world position, forward and up
  into `context.listener` (`positionX/Y/Z`, `forwardX/Y/Z`, `upX/Y/Z`
  AudioParams, falling back to `setPosition`/`setOrientation` where the
  params are undefined).
- **Panning.** A cue with `at` gets a fresh `PannerNode`:
  `panningModel: 'equalpower'`, `distanceModel: 'inverse'`, `refDistance: 2`,
  `maxDistance: 40`, `rolloffFactor: 1`. Cues without `at` connect to master
  directly.
- **Node lifetime.** Every one-shot source schedules `stop` at the recipe's
  end and disconnects its subgraph on `ended`.
- **Per-frame cap.** At most 8 positional one-shots start per frame; extra
  cues that frame are dropped. Unpositioned cues are never dropped.
- **Death.** The frame loop stops once `health.dead`, so `update` no longer
  runs: playing `death` also schedules a `linearRampToValueAtTime` on master
  gain to 0 over 1.5 s (the cue's length) so loops fade out without per-frame
  help. Restart reloads the page, which recreates everything.

## Loops

- **Ambient.** Two sub-mixes on always-running nodes, crossfaded by
  `w = clamp(sunElevation / 0.2, 0, 1)`: day gain `w`, night gain `1 − w`,
  each ramped over 0.2 s when the target changes. Day: lowpassed (400 Hz)
  noise at low gain with slow random gain wobble (wind), plus a two-note sine
  chirp every 3–8 s at a random pan. Night: 4 kHz sine amplitude-modulated at
  ~40 Hz in 0.3 s bursts (crickets) plus fainter wind. Holding Y fast-forward
  sweeps the blend quickly because it follows `phase` directly.
- **Torch crackle.** A pool of 4 loop voices, each highpassed noise at very
  low gain with random 20–50 ms gain pops, routed through its own panner. Each
  `update` sorts torches by distance to the camera and assigns the nearest 4
  to voices; a voice whose torch left the set fades out over 0.3 s before
  being reassigned. Voice-to-torch identity is by the circle's centre, so a
  torch that stays in the set keeps its voice (identity by the circle's
  `position` reference).

## Synth recipes

Starting values; all tuned by ear.

| Kind | Recipe |
| --- | --- |
| footstep | bandpass noise ~300 Hz, 60 ms, soft |
| skeletonStep | two 30 ms highpassed (2 kHz) clicks per stride with a faint 1.2 kHz tick |
| jump | sine sweep 300 → 600 Hz, 120 ms |
| land | lowpassed noise thud, 80 ms |
| axeSwing | bandpass noise sweep 400 → 1200 Hz, 150 ms (whoosh) |
| chop | 40 ms noise burst plus a 120 Hz sine knock |
| skeletonSwing | shorter, brighter whoosh |
| treeCreak | sawtooth 90 → 60 Hz with slow vibrato, 0.6 s, lowpassed |
| treeFall | 200 ms lowpassed noise plus a 50 Hz sine thump, louder/lower with `variation` (tree scale) |
| bowDraw | filtered noise rising in pitch, 0.4 s |
| bowFire | 1 ms noise snap plus a triangle 800 → 200 Hz sweep over 80 ms |
| arrowHit | short knock, higher than chop |
| arrowMiss | soft thud |
| pickup | two sine notes 660 then 880 Hz, 100 ms |
| craft | three ascending sine notes |
| weaponSwitch | single click |
| torchPlace | short whoosh plus a crackle burst |
| skeletonHurt | three rapid clicks plus a short noise burst |
| skeletonCollapse | slow rattle over 0.5 s ending in a lowpassed thud |
| playerHurt | square 220 → 110 Hz sweep, 150 ms |
| death | sine 440 → 55 Hz over 1.5 s, unpanned |

## Input and HUD

- `input.ts`: `KeyM: 'mute'`, a one-shot latched on `keydown` (ignoring
  `e.repeat`) and drained by `consumeMute()`; `InputState` gains
  `consumeMute(): boolean` and `FakeInput` in tests gets a `mute` flag.
- `hud.ts`: `bindMuteHud(el, muted)` returns a `(muted: boolean) => void`
  writer that sets `🔊`/`🔇` and skips the DOM when unchanged.
- `index.html`: `<div id="mute">` added to the top-right stack, below `#fps`
  (top 12 px) and `#cpu-panel` (top 48 px), so `style.css` gives it
  `top: 84px; right: 12px` and the shared pill styling of `#clock`/`#fps`.
  The `#hud` help line gains `M mute`.

## main.ts wiring

```ts
const audio = new Audio(canvas);
const showMute = bindMuteHud(muteEl, audio.muted);
…
if (input.consumeMute()) showMute(audio.toggleMute());
for (const cue of playerUpdate.sounds) audio.play(cue);
const chopped = action?.kind === 'strike' && !skeletons.hit(…) ? forest.chop(…) : 'miss';
if (chopped !== 'miss') audio.play({ kind: 'chop' });
if (chopped === 'felled') audio.play({ kind: 'treeCreak' });
for (const felled of forest.update(dt)) {
  drops.spawnFromTree(felled);
  audio.play({ kind: 'treeFall', at: felled.position, variation: felled.scale });
}
…
audio.update(dt, followCamera.camera, dayCycle.phase, torches.repellers);
```

`audio.update` runs after `followCamera.update` so the listener matches the
rendered view.

## Docs

- CLAUDE.md: add `sounds.ts`, `synth.ts`, `audio.ts` to Layout; add a
  Conventions note (cues via return values, loops read state, audio never
  touches `animating`, context created on first gesture, no sound tests); add
  M to Controls; mention the `Legs.update`, `Forest.chop` and
  `Projectiles.update` return shape changes.
- BACKLOG.md: tick Sound.
