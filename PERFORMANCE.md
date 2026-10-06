# Performance

The film is a port of `Teachers Day Film v3.dc.html` — a single 4,178-line
vanilla-Three.js file. This documents what was slow in the original, what
changed, and what did not apply.

**Read this first:** sections 1 to 4 are the original port and were written
from the source, without a browser; their counts are static. Sections 5 and 6
were measured in one - they are the frame rates, and the account of a second
pass that removed the hitches the first one left (and, in places, caused).
Add `?perf` to the URL to get the HUD.

---

## 1. Bottlenecks in the original

Found by reading the source. Ordered by expected impact.

### 1.1 A forced-reflow loop, running for the whole scroll

The scroll handler read layout on every scroll event:

```js
sc.addEventListener('scroll', () => {
  const max = sc.scrollHeight - sc.clientHeight;   // forces layout
  this.target = max > 0 ? clamp(sc.scrollTop / max, 0, 1) : 0;
}, { passive: true });
```

…while the rAF loop wrote roughly forty inline styles per frame in
`frameOverlays`, unconditionally, most of them unchanged from the frame before.
Style write → layout read → forced synchronous layout, continuously, for all
3200vh of travel. This is the most likely source of the reported stutter.

**Fixed by:** Lenis + a single GSAP ScrollTrigger, which caches the scroll
extent and recomputes it only on refresh. No layout is read in the scroll path.
Overlay writes go through `lib/domWrite.ts`, which keeps the last value per
element+property and skips unchanged writes.

### 1.2 Frame-rate-dependent scroll smoothing

```js
this.p += (this.target - this.p) * 0.055;   // no dt
```

The camera's approach speed scaled with refresh rate, and every dropped frame
changed its velocity. On a 144Hz monitor the camera ran ~2.4x fast; during a
hitch it lurched. This reads as stutter even when the average frame rate is
fine.

**Fixed by:** `damp()` in `lib/math.ts` —
`current + (target - current) * (1 - (1 - k)ᵈᵗ˙⁶⁰)`. Identical at 60fps,
correct everywhere else. `k` is unchanged at 0.055 (0.22 for reduced motion).

### 1.3 Boot long-tasks

~35 procedural canvases generated on the main thread behind two
`setTimeout(0)` yields — the moon alone is 1024×512 with 300 layered crater
gradients and 900 speckles, and the night environment map and day sky dome are
the same size again.

**Fixed by:** `textures/textureWorker.ts` renders the font-independent textures
on an `OffscreenCanvas` in a worker and transfers `ImageBitmap`s back. The
font-dependent ones (sign boards, name plates, five face moods per student)
stay on the main thread — worker `FontFaceSet` support is not portable and a
sign typeset in a fallback face is immediately obvious — but run after
`document.fonts.ready` and yield between students. There is a main-thread
fallback if `OffscreenCanvas` or `Worker` is unavailable.

### 1.4 Wasted multisampling

The renderer was created with `antialias: true` **and** an `EffectComposer`.
The composer renders to its own non-multisampled targets, so the MSAA buffer
was allocated and paid for every frame, then discarded.

**Fixed by:** `antialias: false`. The composer supersedes it.

### 1.5 Draw calls on repeated geometry

Counted from the source.

### 1.6 Per-frame work on invisible things

Every character ran its full animation every frame regardless of range, and
`camAt` rescanned all 88 keyframes from index 0 every frame.

**Fixed by:** the camera solver caches its segment index (normally zero
iterations); scene subsystems are hidden, and their updates stopped, outside
their scroll window (see 2.4 - they were unmounted at first, which turned out
to be the largest source of hitches in the port).

---

## 2. What changed, and by how much

### 2.1 Models — meshopt compression

`npm run compress:models` (`scripts/compress-models.mjs`, `@gltf-transform`).
Geometry only: the textures are left untouched, so the render is unchanged.
Originals are kept in `assets-src/uploads/`.

| | Before | After | |
|---|---|---|---|
| All 15 GLBs | 39.58 MB | **21.87 MB** | −44.7% |
| `timmy_web.glb` | 3.84 MB | 1.93 MB | −49.7% |
| `vanhxay_web.glb` | 3.72 MB | 1.79 MB | −51.8% |
| `nina_web.glb` | 5.70 MB | 3.69 MB | −35.3% |
| `timmy_lod.glb` | 0.33 MB | 0.20 MB | −39.3% |

Triangle counts are identical after compression (120,000 / 90,000 / 16,000 —
verified by re-parsing the output). `EXT_meshopt_compression` is decoded by
`MeshoptDecoder`, wired into both `GLTFLoader` call sites.

`level: 'medium'` is used deliberately. `'high'` filters normals and UVs
harder and is visibly lossy on skin.

### 2.2 Draw calls

Counted from the source versus the port. These are static counts, not measured
frames.

| Subsystem | Before | After | How |
|---|---:|---:|---|
| Cloud puffs | ~230 sprites | **1** | one instanced batch; billboard, drift, spin and breathing all in the vertex shader |
| Streetlamps | 126 meshes | **3** | poles and heads instanced, halos as one `Points` field |
| Garden lanterns | 70 meshes | **4** | four instanced batches |
| Garden petals | 90 sprites | **1** | `Points` + shader, GPU fall and recycle |
| Finale petals | 60 sprites | **1** | same |
| Music-box motes | 22 sprites | **1** | same |
| Gift-box motes | 30 sprites | **1** | same |
| Blossom trees | 88 meshes | **2** | merged wood, merged canopy |
| Marquee bulbs | 36 meshes | **1** | instanced |
| Arch ribs + beads | 22 meshes | **2** | merged |
| Pillar courses + caps | 18 meshes | **3** | merged by material |
| Street centre line | 29 meshes | **1** | merged |
| **Total** | **~820** | **~21** | |

Every sprite swarm also carried its own material instance; those collapse with
the draw calls.

### 2.3 Per-frame CPU

- All sprite-swarm motion moved to vertex shaders — the CPU no longer touches
  a petal or mote position.
- Wind: all 16 garden materials share **one** uniform object and one program
  (`customProgramCacheKey`). Two numbers written per frame drive the entire
  bed. Without the cache key, three.js compiles sixteen identical programs.
- Camera keyframe search caches its segment.
- Overlay writes are cached and skipped when unchanged.
- Scratch `Vector2`/`Vector3` are module-level and reused; the source allocated
  two `Vector2`s per frame for raycasts plus an array from `chars.map(...)`.
- Static geometry sets `matrixAutoUpdate = false`.

### 2.4 Scene lifetime

Everything is built once, behind the loader. Parts of the night that are out
of shot are hidden - `visible = false` on their group, per-frame updates
stopped - inside the windows in `config/timeline.ts` (`MOUNT`), driven by
`scenes/nightVisibility.ts`:

| Part | On stage |
|---|---|
| Gift box | until the lid opens, then unmounted for good |
| Sky (11,000 stars, 160-segment moon) | `p < 0.62` |
| Garden, gate, music box | `p < 0.70` |
| Students | `0.44 < p < 0.90` |
| Night world (updates) | `p < 0.92` |
| Day scene | always mounted, drawn from `p >= 0.903` |

These were mount windows in the first version of the port: each part was
built when the scroll reached it and torn down when it left. Section 6 is the
account of why that was replaced.

### 2.5 Model loading

- Downloads start as soon as the loader lifts, **one student at a time**, so the student
  about to be met is never queued behind four others.
- Geometry is decompressed in two module workers (`lib/meshoptWorker.ts`).
- Each model is uploaded and compiled *before* it is swapped in, one texture
  at a time, at moments a slow frame does not show (`lib/gpuQueue.ts`,
  `lib/modelPipeline.ts`).
- `THREE.LOD` swaps the 16k-triangle mesh in past 26 units. The detailed
  mesh's textures are already on the GPU by then, so the swap uploads nothing.
- Finale meshes ride the street queue: each is fetched straight after that
  student's street model. `DayScene` keeps a catch-up loader for anyone still
  unattached at `p >= 0.86`.
- A failed load leaves the built blocky figure in place and logs a warning; the
  film never blocks on the network.

### 2.6 Lighting and shadows

- Two shadow-casting lights in the night at most: the travelling street spot,
  and one of the two gate lanterns (the second was dropped — the difference is
  invisible and the cost is not).
- Streetlamps, gate bulbs and lit windows are emissive geometry plus additive
  halos with **no real lights at all**; bloom turns them into light.
- The focus rim and key are two shared lights moved to whoever is being framed,
  because only one student is ever in shot.

### 2.7 Adaptive quality

Drei's `<PerformanceMonitor>` walks a three-tier ladder (`config/quality.ts`)
scaling DPR, star count (11,000 / 6,000 / 3,400), flower and grass density,
firefly and petal counts, shadows, character shadows, bloom resolution and
depth of field. It moves one step at a time with a two-second settle, so
quality never visibly pumps, and after three changes it stops and holds the low
tier. (Until section 6.4 the low tier only zeroed depth of field's aperture
and still ran the pass, and until section 6.5 the changes were miscounted.)

---

## 3. Brief items that did not apply

Stated plainly rather than quietly skipped.

| Asked for | Status |
|---|---|
| Draco compression | Superseded by **meshopt**, which is what these already-quantized meshes want. Same goal, better fit. |
| KTX2/Basis textures | **Not done.** The GLB textures are already WebP, and Basis is lossy on skin. Doing it would shrink the download further at a visible cost; say the word and it is a one-line change to the script. |
| Shared `AnimationMixer`, paused off-camera | **Not applicable.** The models carry no skins and no animation clips — verified by parsing every GLB. Characters are posed by transform writes on the blocky rig. |
| `useGLTF.preload` | Replaced by the explicit one-at-a-time queue above, which is stricter about ordering than a preload would be. |
| `frameloop="demand"` | **Not used.** Nothing in this film is ever static — the camera breathes, flowers move, fireflies blink. Claiming this would be a lie. It would apply under `prefers-reduced-motion`, where nothing moves between scroll events. |
| `<Detailed>` | Uses `THREE.LOD` directly, which the source already used and which the loader populates. |

---

## 4. Deliberate deviations from the source

| Change | Why |
|---|---|
| dt-corrected scroll smoothing | §1.2. Identical at 60fps. |
| Seeded RNG for all procedural placement | The source reshuffled the skyline and flower beds on every load. Seeding costs nothing visually and makes before/after comparisons meaningful. |
| Progress rail uses `scaleY`/`translateY` instead of `height`/`top` | The originals laid out the page twice per frame for the whole scroll. |
| Eyelid bars use `scaleY` instead of animated `height` | Same reason. |
| Finale card reads **"For Teacher Nok"** | The source still said "For Teacher Nueng" in `COPY`, in the markup and in the editor props. The project was handed over as *For-Teacher-Nok*. Flagged here so it is not mistaken for a typo. |
| Finale ring re-laid to an authored spec | Requested, and it replaces the source's layout wholesale. See below. |
| Depth of field kept on during the wake ramp on every tier | The source applies it unconditionally, including on mobile. Vision swimming into focus is the point of that cut, and it lasts about a second — the street's DOF is still tier-gated. |
| Three `props` fields added to the roster | `researcherProps`, `businessProps` and `aiProps` were written and never wired up — no roster entry set `props` for them, so a lab bench, a business set and a holographic display were dead code, and the AI holo-bar animation in the main loop drove nothing. Timmy is now `'ai'`, Namthip `'researcher'`, Nina `'business'`. Three lines, marked `ADDED` in `config/students.ts`. |

**The finale ring is authored, not ported.** Scene 7's layout comes from a
spec rather than from `buildDayScene()`. The lens is fov 75 at `(0, 0.5, 0)`
looking straight up; the five sit at 0/72/144/216/288 degrees from +Z, each
turned to face the lens and leaned 30 degrees forward from the hips, with every
head 1.5 m above the camera and 30 degrees off the optical axis. Seats live in
`config/students.ts` as `dayAngle`; everything else is a constant at the top of
`DayScene.tsx`, and the figure scale and ring radius are *derived* from those
two head numbers rather than typed in:

```
RING_SCALE  = (CAMERA_Y + 1.5) / (HIP_Y + HEAD_ABOVE_HIP * cos 30)   = 0.7213
RING_RADIUS = 1.5 * tan 30 + RING_SCALE * HEAD_ABOVE_HIP * sin 30    = 1.504 m
```

The radius is worth a note. `radius = headHeightAboveCamera * tan(30°)` = 0.87 m
places the **head**, and the 30 degree lean carries a head inward by its own
height above the hip — 0.64 m at this scale. Standing the feet at 0.87 m would
land the heads at 0.23 m, 8.8 degrees off the axis: all five bunched in the
middle of the frame on top of the closing text. So the feet are set back by
exactly what the lean takes away, which is what puts the head on the 30 degree
cone the formula asks for.

At 2560x1400 that projects to every head centre exactly 457 px from the frame
centre, worst outer edge at 0.79 of the half-frame — inside with 21% to spare.
The blocky stand-in figures, whose heads are a quarter of their body height,
land at 527 px and clip Timmy's chin by about 1%; that only shows if a GLB
failed to load, which `DayScene` now logs as an error.

The finale card is sized off the same geometry. The heads sit on a cone, so
their screen radius is `tan(30) / tan(fov/2) * height / 2` px on **both** axes
once the wider horizontal fov divides out — about 37vh whatever the monitor.
Subtract the heads' own width and the clear gap is roughly 48vh, so the text is
capped at `min(55vw, 48vh)` and scales with `vh`, not `vw`. On a 2560x1400
screen `55vw` alone is 1408px against a 690px gap.

**The finale lines are callouts, not bubbles, and they are permanent.** Each
student's line is now black Patrick Hand at the end of a curved leader drawn
out of a dot on their face, and once drawn it stays to the end of the film
rather than fading. Four things follow.

*It is the project's only SVG.* A curved leader with a draw-on reveal is not
reachable with the CSS-stalk trick used for the music-box hint
(`MusicBox.tsx:96`, a straight 1px gradient span). The layer has no `viewBox`,
so SVG user units are CSS pixels and the update loop writes screen coordinates
straight into `d`, `cx`, `cy` and the dash pair. `domWrite` gained `setAttr`
for those - they are attributes, not style properties, and the cache keys them
under `@name` so an SVG `opacity` attribute cannot collide with the CSS
`opacity` written to the same node. Its cache is keyed on `Element` now,
because `SVGElement` does not extend `HTMLElement`. Never put a CSS `filter` on
these paths: `d` changes re-raster the path, and a filter would re-blur the
whole layer every frame. The white halo is `text-shadow` on the HTML labels.

*Nothing reads layout, and nothing reads the ring.* Placement is derived from
the head's **projected** position each frame, not from Scene 7's constants.
That scene is art-directed and has been retuned repeatedly - the seats are not
evenly spaced, `dayRadius` puts the five at three different distances from the
lens, and the fov has moved - so a callout that read the ring would silently
misplace itself every time any of that changed. The sentence column is
**reserved** rather than measured: whatever room is left between the anchor and
the frame edge becomes its `max-width`, so it can never overflow and
`offsetWidth` is never read from the loop. That width is rounded to 8px,
because `max-width` is a layout property and the finale camera breathes -
without the rounding it would relayout five labels every frame.

*The leader is solved, not placed.* Each callout is a two-segment elbow -
straight out from the head, then a horizontal run into the words - and every
candidate is tested before it is drawn. The line starts outside the head's
collision circle, never on the face, and always points away from the middle of
the ring. If the straight-out placement is blocked it rotates outward in 14
degree steps up to 84 (never past 90, which would aim it back across the head),
then shortens, then turns the elbow toward the far screen edge instead of the
near one. If nothing clears, that message waits for the next frame rather than
drawing itself over a face.

Three details are load-bearing. The line has to start beyond the *guard* radius
(`HEAD_R * HEAD_PAD`), not beyond the head radius - starting at `headR + gap`
puts it inside its own collision circle and then nothing ever places, which is
exactly the bug the first version shipped with. The far-side elbow is a
fallback, not a preference: on a 4:3 frame the two widest students sit ~88px
from the frame edge with nothing outboard, so without it two of five messages
would silently never appear. And a column too narrow to hold its sentence in
`LINES` lines is rejected, which makes the solver prefer wider placements
instead of squeezing text into a gutter - it uses a rough advance-width
estimate, because measuring would mean a layout read from inside the loop.

Two sides are overridden in the roster with `dayLabelSide`: Timmy, who stands
left of centre and would otherwise write leftward, and Vanhxay, who stands
right of centre and would otherwise write rightward. Both are preferences and
not commands - the opposite side stays in the search, so a forced side that
cannot be placed falls back instead of dropping the message. Both are honoured
at every aspect checked.

The accepted candidate is remembered per student and retried first next frame,
so a line that is still clear does not hop between equally good answers and
shimmer while the camera breathes. Checked at 2560x1440, 1920x1080, 1600x900,
1440x900, 1024x768, 1280x1024, 1366x768, 2560x1080 and 3440x1440: all five
place on every one.

*The lines are Lao.* All five `finaleMsg` strings are Lao with a little Latin
mixed in, so the label stack is `Patrick Hand, Noto Sans Lao Looped` and the
browser picks per character. Two consequences: the line box is 1.6 rather than
1.3, because Lao stacks vowel signs above the consonant and tone marks above
those, and `overflow-wrap: break-word` is set, because Lao is written without
spaces between every word. The Lao face is loaded in its own `<link>` - a typo
in a family name makes Google Fonts reject the whole stylesheet, and that must
not be able to take Playfair and Poppins down with it.

*The labels stopped writing `left`/`top`.* The old bubbles set both as
percentages every frame - layout properties, in a file whose own header says to
write only `transform` and `opacity`. Position is one `transform: translate()`
now, with the anchoring half (`-100%` for a left-hand label, `0` for a
right-hand one) folded into the same string.

*`c.say` had to be decoupled.* It is written by `FloatingLines` on the
`overlay` stage and read by `DayScene` on `day` one stage later, where it
drives the grin and a 3 Hz torso bounce. It used to be the label's own opacity.
With a label that never fades that would leave every student ending the film
frozen mid-grin and shaking, so it is now its own pulse - up as the sentence
lands, gone shortly after.

**Known limitation: portrait.** Below about aspect 1.1 the finale camera puts
four of the five heads outside the frame entirely, so their leaders point off
screen and the callouts stack up against each other. This is Scene 7's own
framing - fov 74 with the ring at radius 3.9 - not the callouts; it is there
without them. Fixing it means changing the shot (a much wider lens, or a
second `dayRadius` set for narrow aspects), which is an art decision.

**The finale haze was four things, not one.** The wake ramp ran tone-mapping
exposure to 4.2x, bloom strength to 1.65, a defocus pass and a 30vmax white
inset vignette at 0.85 — all on `(1 - wake)`, so they covered p 0.905-0.945,
the first two thirds of the finale. Together they desaturated the sky to
grey-white and flattened the models into it. All four are halved: exposure
lift 3.2 -> 1.6, bloom lift 1.4 -> 0.7, aperture 0.0012 -> 0.0006, vignette
0.85 -> 0.42. The instantaneous white-out handover is untouched — that is a
cut, not haze.

**Trade-off in the sprite fields.** Collapsing the four swarms from ~200 draw
calls to four means they are `Points`, not `Sprite`s, and two things follow.
`gl_PointSize` is clamped by the driver (255 on Windows/ANGLE), so a petal
passing within about a unit of the lens stops growing — visible only in the
finale, where the camera sits inside the petal box. And a point is
frustum-culled at its centre rather than by its quad, so one can pop out at
the frame edge instead of sliding off. Both are worth the 200 draw calls, but
they are real differences from the original.

### Bugs found in our own port, since fixed

Recorded because they were live for a while and are easy to reintroduce.

- **The Scene 7 sky dome was `MeshStandardMaterial`.** The source uses
  `MeshBasicMaterial`. A lit 400-unit sphere rendered `BackSide` sums every
  light in the scene, so the sky clipped to white and took the finale text,
  the floating lines and the eye-blinks with it — they were near-white on
  white. One material class; most of the scene.
- **Rigs were rebuilt whenever the quality tier changed.** `characterShadows`
  was in the dependency list of the `useMemo` that builds the figures, so a
  single frame-rate dip discarded every loaded GLB and reverted the class to
  blocky stand-ins. Shadow casting is now applied as a per-mesh flag over the
  existing figures.
- **The model queue marked students done before they were.** Combined with the
  above, one interruption left a student as a placeholder permanently, because
  the retry skipped anyone already in the set. Now recorded only on success.
- **The day scene unmounted when scrolled back past p = 0.88**, re-downloading
  all five finale models on the way forward again. That window is sticky now.
- **The eyelid bars scaled a blurred element.** CSS applies `filter` before
  `transform`, so `scaleY` squashed the 12px blur to two or three pixels and
  the lid read as a hard sliding bar. The blur now lives on a wrapper.
- **The finale ring showed the class their own backs.** Seats were placed with
  `holder.lookAt(0, 0, 0)`, carried over from the source. `lookAt` aims an
  object's **-Z** at its target, but a figure's face is the **+Z** material of
  the head cube, so every student was turned away from the lens — and the
  forward tilt, being a positive rotation about local X, then leaned them
  further away rather than in. Seats are now an explicit `rotation.y` of
  `angle + π`, which puts +Z on the camera and makes the positive tilt mean
  what it says. Anyone reaching for `lookAt` here will reintroduce both halves
  at once.
- **One student never finished arriving.** Each had an entrance ramp
  `sstep(enter, enter + 0.28, wake)` with `enter` up to 0.85, so the last seat's
  ramp ended at wake = 1.13 — past the end of the scroll. That student stayed
  part-scaled and part-posed, and `grp.visible = e > 0.01` hid another at the
  bottom of the ramp. The finale has no entrance ramp at all now: all five are
  present, opaque and at full size for every frame of the scene.
- **Reloading mid-film warped it to wherever you had been.** The page is
  3200vh of scroll spacer, so on reload the browser restored the old scroll
  offset - but `frame.opened`, `frame.p` and every scene mount start from zero,
  so Scene 1 rendered correctly over a document sitting at, say, 50%. Nothing
  looked wrong until the gift was opened: the scroll unlocked, Lenis synced to
  the restored offset on the first mouse move, and the film snapped to the
  middle. Fixed with `history.scrollRestoration = 'manual'` at module scope in
  `main.tsx` (an effect runs too late to beat the restore) plus a hard reset of
  document, Lenis, timeline proxy and `frame` together in `useLenisScroll` - on
  mount, on `load`, on bfcache `pageshow`, and once more at the moment the
  scroll is released. All four have to be reset together: zeroing the offset
  alone leaves the scrubbed proxy where it was, and zeroing the proxy alone
  leaves an offset for Lenis to sync back to.
- **Sprite fields used one hard-coded pixel scale.** `gl_PointSize` is in
  framebuffer pixels, so the right value is
  `bufferHeight / (2·tan(fov/2))` — different for each of the three cameras
  the four fields render through, and dependent on the viewport and DPR.
  Derived per field now, and recomputed on resize.

### Dead code not ported

Unreachable in the source; noted so nothing looks lost.

- `buildHuman()` (~80 lines) — zero call sites. The older capsule-based body.
- `dress()` (~120 lines) — called only from `buildHuman`. Its `switch` covers
  Doctor/Pilot/Nurse/Chef, which do not match this roster's roles.
- `outfitTex()` (~110 lines) — zero call sites. The blocky figures use flat
  surface colours, not patterned textures.
- `walkScrollLength`, `c.baseSignRot`, `c.signX`, the `loaderLabel` ref, and
  refs `L3`–`L8` — all written, never read.

---

## 5. Frame rates

Measured, not estimated - see section 6 for how, and for what changed between
the two columns. One laptop (AMD Radeon 860M, integrated, 120 Hz panel), Chrome 153, a 1587x807
window at device pixel ratio 2, production build served by `vite preview`. The film is
played start to end in 60 seconds with one mouse-wheel notch at a time, and
never stops, which is the worst case for anything that hides work in a pause.

"Before" is the port as it stood (commit `bc81af8`); "after" is section 6.
High tier is what a desktop starts on, low is what a phone or tablet does.

| Tier | Segment | `p` | Mean frame before | after | Worst frame before | after |
|---|---|---|---:|---:|---:|---:|
| high | Sky and title | 0 - 0.30 | 15.1 ms | 10.4 ms | 135 ms | 74 ms |
| high | Descent, garden, gate | 0.30 - 0.50 | 47.8 ms | 32.2 ms | 901 ms | 75 ms |
| high | Street | 0.50 - 0.90 | 29.0 ms | 23.6 ms | 438 ms | 78 ms |
| high | Finale | 0.90 - 1 | 16.6 ms | 11.8 ms | 191 ms | 51 ms |
| low | Sky and title | 0 - 0.30 | 9.7 ms | 9.3 ms | 50 ms | 63 ms |
| low | Descent, garden, gate | 0.30 - 0.50 | 20.6 ms | 16.8 ms | 503 ms | 46 ms |
| low | Street | 0.50 - 0.90 | 14.2 ms | 11.5 ms | 209 ms | 41 ms |
| low | Finale | 0.90 - 1 | 9.9 ms | 8.7 ms | 117 ms | 24 ms |

| Tier | | Frames over 50 ms | Frames over 100 ms | Loader |
|---|---|---:|---:|---:|
| high | before | 80 - 149 | 17 - 28 | 1.8 - 1.9 s |
| high | after | 9 - 29 | 0 | 2.8 - 3.1 s |
| low | before | 28 | 10 | 1.3 s |
| low | after | 1 - 2 | 0 | 2.6 s |

High tier: three runs of the old build and four of the new, alternated. Low
tier: one run of the old and two of the new. Means are averaged over the runs;
worst frames are the worst of any run. Each run is about 3,000 to 6,000 frames.

What the numbers do not say: the high tier is still GPU-bound through the
gate and the street on this machine (30 to 40 fps at this size). That is the
picture itself - every light, the lantern glass, bloom at full strength - and
the brief for section 6 was that the picture does not change. The quality
ladder is what handles a GPU that cannot keep up; what was removed is
everything that stopped the frame outright. No phone or tablet has been
measured: the low-tier rows are a desktop GPU running the phone's settings,
which shows the hitches are gone but says nothing about a phone's frame rate.

---

## 6. Hitches: the second pass

The report was that the film stuttered whenever the camera moved and froze
for a moment every so often, on phones, tablets and desktops alike. The
constraint was that the picture must not change: no effect, light, texture
size or resolution traded away.

Measuring the port as it stood (the "before" columns above) gave one long
frame after another, each landing on the same scroll position in every run:

| `p` | Frame | What landed on it |
|---|---:|---|
| 0.441 | 0.4 - 4.8 s | the street mounting: five rigs built, 18 shader programs compiled, 35 textures uploaded |
| 0.621 | 0.2 - 3.0 s | the sky unmounting; every lit material recompiled for two fewer lights |
| 0.701 | 0.2 - 1.8 s | the garden and gate unmounting; recompiled again for ten fewer |
| 0.52 - 0.79 | 0.1 - 0.25 s, five times | each student's model: three 2048-square textures at once, on the frame the detailed mesh was first drawn |
| 0.606, 0.664, 0.793 | 0.1 - 0.23 s | each student's letter being fitted to its card: eight layouts in one frame |
| 0.900 - 0.931 | 0.1 - 0.57 s, six times | the street unmounting, the day scene compiling, then one finale model uploading per frame as the faces came in |

Almost none of that is the film being expensive to draw. It is work being
done at the wrong moment, and nearly all of it was created by an earlier
optimisation - unmounting whatever was out of shot (2.4, as first written).

### 6.1 Build once, hide, never unmount

`scenes/nightVisibility.ts`. The sky, the garden and the street are built at
boot and hidden outside their windows. three does not draw an invisible
subtree or count its lights, their per-frame updates are gated on the same
flag (`useNightUpdate`), and `park()` stops the matrix walk into them, so
hidden costs what unmounted did. State that used to be reset by being rebuilt
is reset on the show/hide edge instead (`useNightEdge`).

This also closed a leak. Unmounting the street disposed the rigs but never the
models' textures, so scrolling back up fetched, decoded and uploaded all five
again on top of the first set. Scrolling back, and Replay, now cost nothing.

### 6.2 Prewarm behind the loader

`scenes/prewarm.ts`. Which lights are on is baked into every lit material's
shader, so each combination of sky, garden and street is a different program
for everything in view. Before the loader lifts, the film is drawn once in
each of the five combinations it passes through, then the finale, then the
gift box - culling off, through the real post chain, twice each. That
compiles every program, uploads every texture and buffer and allocates every
render target while nothing can be seen. `window.__perfLog.long` is the
check: in the runs behind section 5, none of the new build's 25 longest frames
in either direction had a program or a texture created on it. In the old
build most of them did.

It costs a little over a second of loader on the test machine. When the
quality ladder turns shadows on or off, every lit program's key changes again;
the combinations are then re-drawn off screen, one per `gpuQueue` job.

### 6.3 Models arrive without a dropped frame

`lib/modelPipeline.ts`, `lib/gpuQueue.ts`, `lib/meshoptWorker.ts`.

- Geometry is decompressed in workers. (three's own `useWorkers` builds its
  worker by stringifying functions and referring to them by name, which does
  not survive minification - it starts a worker that dies on its first
  message. This one is a real module worker.)
- A 2048-square texture upload is one synchronous call of 20 - 45 ms on the
  test machine and cannot be split. So each is a job in a queue, and the
  renderer runs jobs where a slow frame does not show: under the white-out,
  while the camera is at rest, or - for someone who never stops scrolling -
  one at a time, well apart. Downloads start as the loader lifts, so most of
  it happens on the gift box, which is a nearly still frame waiting on a click.
- A model is swapped in only after its textures and buffers are up and its
  shaders compiled for every stage combination it will be seen in.
- The finale's fifteen textures go up ahead of the cut instead of during it.
  On a phone or tablet they wait until the street is mostly walked, and the
  street's own detailed textures are released once the night is over, so the
  two sets overlap as briefly as possible. A portrait frame never shows the
  ring and never uploads them.

### 6.4 Work that changed nothing

- **The bokeh pass at zero aperture.** It re-rendered the whole scene for
  depth and took 41 samples per pixel, to blur by nothing - for all of the
  film outside `0.52 < p < 0.88`, and on the low tier everywhere. It is now
  replaced, whenever the aperture is zero, by a one-sample copy that sets
  alpha to 1. The alpha matters and is why the pass cannot simply be skipped:
  additive sprites push alpha past 1 in the half-float buffer, and bloom
  weights itself by the alpha it is given.
- **Shadow maps for dark lights**, and a second copy of every shadow map each
  frame from the bokeh pass's own depth render.
- **The letter fit.** Solved one layout per frame while the card is face
  down, and cached per letter and card size.

### 6.5 The quality ladder stopped punishing a smooth frame rate

`PerfTools.tsx`. The ladder was configured with drei's `flipflops={3}` and a
fallback to the low tier. drei counts every incline and every decline it
reports toward that limit, including the ones that change nothing - and a
machine holding its refresh rate on the top tier "inclines" every 2.5 seconds.
Four of those, ten seconds of running well, and the film dropped to the lowest
tier for good, with a rebuild as it went.

It mattered here because of the rest of this section: with the bokeh waste
gone the sky runs fast enough on the test machine to trip it, where before it
did not, and the film fell to low about ten seconds in. The limit is now
kept on tier changes that were actually made. On the test machine the ladder
then does what it did before - steps down twice as the camera reaches the gate,
where this GPU cannot hold the top tier - and on a machine that can hold it, it
stays there. That last part is a change in behaviour: such a machine used to
end up on low regardless.

### 6.6 Checking that the picture did not change

`?perf` exposes `window.__frameDebug.freezeTime`, which pins the film's clock
while the damped values still settle. With the clock pinned and the quality
tier held (`?perf&tier=high`), the canvas was captured at eleven scroll
positions from each build and compared channel by channel.

On the low tier the baseline reproduces itself exactly - not one pixel differs
between two captures of it at ten of the eleven positions (the eleventh has a
shooting star in it, which runs on its own clock). Against that:

- at nine positions no channel of any pixel differs by more than 2 levels in
  255, and by 2 on under 0.002% of pixels; 4 - 11% of pixels differ by 1;
- at `p = 0.93`, where the bokeh pass still runs in both builds, the captures
  are identical;
- at `p = 0.89`, the over-exposed frame just before the white-out, the largest
  difference is 4 levels, and 3.4% of pixels differ by 2 or more.

The difference is the old bokeh pass's own rounding. Averaging 41 samples of
one value does not return that value exactly on this GPU; the copy that
replaced it does. Where both builds run the real pass there is no difference
at all, and at 0.89 the same error is multiplied by an exposure of about 8.

The high tier agrees (largest difference 3 levels, 7 at `p = 0.89`) except at
three street positions where a few hundred scattered pixels differ by much
more - and there two captures of the baseline differ from each other on more
pixels than the new build differs from either, so those positions say nothing
about the change. What makes the baseline unstable there was not tracked down.

### 6.7 Measuring it yourself

- `?perf` - the HUD, plus `window.__perfLog`: every frame's duration, the long
  ones with their scroll position and how many programs and textures were
  created on them.
- `?perf=log` - the log without the HUD, whose own drawing is otherwise in
  every frame it measures.
- `?perf&tier=low` - holds one quality tier. The ladder moves with the frame
  rate, so without this two runs of one build are not comparable.

### 6.8 Looked at and left alone

- **The CSS layers over the canvas** - the multiplied vignette, the grain, the
  backdrop blurs. Each is a full-screen blend on top of WebGL at the device's
  full pixel ratio, and on a phone that may well be a real cost. Removing the
  blend mode changes the corners by about one percent, so it is outside this
  pass; it is the first thing to try if a phone still struggles.
- **The lantern glass.** `transmission` makes three render every opaque object
  a second time into a multisampled buffer while the gate is in view.
- **Lights at zero intensity.** A dark light still costs its BRDF per
  fragment. Hiding them would be pixel-identical and would need a program per
  extra combination.
- **The scroll's feel.** Lenis eases the wheel and the camera then damps
  toward it, about 0.3 s between them. That is latency, not dropped frames,
  and it is the film's pacing as authored.
- **One animation-frame loop instead of two.** Checked: GSAP's ticker already
  steps the scroll before R3F renders, on every frame sampled.
