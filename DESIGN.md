---
name: ojee.console — Calibre
description: A private control console drawn as one watch movement seen through its display back.
colors:
  plate-black: "#07090b"
  plate: "#0b0f12"
  plate-raised: "#101519"
  bridge: "#0d1216"
  ink: "#e9eef0"
  ink-2: "#9fb0b8"
  ink-hot: "#ffffff"
  dim: "#71848d"
  rhodium-hair: "rgba(190, 214, 222, 0.10)"
  rhodium-hair-faint: "rgba(190, 214, 222, 0.05)"
  rhodium-line: "#5f747e"
  rhodium-line-hover: "#86a0aa"
  rhodium-solid: "#46565e"
  steel: "#7d8b93"
  beat: "#00ffff"
  beat-wash: "rgba(0, 255, 255, 0.08)"
  on-beat: "#04181a"
  hot-value: "#dffcff"
  brass: "#ffbf3f"
  blued-steel: "#4a8fe0"
  ruby: "#ff4a6e"
  ok: "#5bffa5"
  warn: "#ffb000"
  err: "#ff2d2d"
  err-line: "rgba(255, 45, 45, 0.55)"
  perlage-dot: "rgba(160, 200, 210, 0.07)"
typography:
  wordmark:
    fontFamily: "Major Mono Display, ui-monospace, monospace"
    fontSize: "1.4rem"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "0.05em"
  figures:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "clamp(3.2rem, 16.5vw, 6rem)"
    fontWeight: 300
    lineHeight: 0.9
    letterSpacing: "-0.03em"
    fontFeature: "tabular-nums"
  figures-seated:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "clamp(1.5rem, 2.9vw, 2.3rem)"
    fontWeight: 300
    lineHeight: 0.9
    letterSpacing: "-0.03em"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.88rem"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  reading:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.78rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  engraving:
    fontFamily: "Departure Mono, Geist Mono, ui-monospace, monospace"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.14em"
  register-mark:
    fontFamily: "Departure Mono, Geist Mono, ui-monospace, monospace"
    fontSize: "0.68rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.24em"
rounded:
  none: "0"
  drawn-circle: "50%"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "16px"
  s-4: "24px"
  s-5: "40px"
  s-6: "64px"
components:
  bridge:
    backgroundColor: "{colors.bridge}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.s-4}"
  complication:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.none}"
    padding: "0"
    width: "196px"
  complication-seat-wing:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    width: "340px"
  complication-dial:
    backgroundColor: "transparent"
    rounded: "{rounded.drawn-circle}"
    height: "112px"
    width: "112px"
  crown:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.register-mark}"
    rounded: "{rounded.none}"
    padding: "5px 10px 5px 6px"
  crown-locked:
    backgroundColor: "{colors.beat-wash}"
    textColor: "{colors.beat}"
  button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
    height: "44px"
  button-hover:
    backgroundColor: "rgba(190, 214, 222, 0.08)"
    textColor: "{colors.beat}"
  jewel:
    backgroundColor: "{colors.ruby}"
    rounded: "{rounded.drawn-circle}"
    height: "7px"
    width: "7px"
  barrel-alert:
    backgroundColor: "transparent"
    textColor: "{colors.warn}"
    rounded: "{rounded.none}"
    padding: "0"
  verdict-line:
    backgroundColor: "{colors.bridge}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px {spacing.s-3}"
---

# Design System: ojee.console — Calibre

## Overview

**Creative North Star: "The Display Back"**

The console is one watch movement seen from behind the sapphire. The clock is the balance;
every module is a complication seated on the same plate; the alert is engraved beside the
barrel because in a movement the barrel is what everything downstream depends on. There is
no grid of status cards anywhere in this system, and that absence is the design: a repeating
panel per module is the arrangement this world exists to refuse.

Nothing is shaded and nothing is lit. Every three-dimensional part in the console is unlit
line art — `LineBasicMaterial` outlines, edge geometry, additive glow shells, expanding
discs for anything that pulses — with one bloom pass as the only light in the scene. Tone
is carried by **opacity**, not by value: the same rhodium line at 0.3 is background
structure and at 0.9 is the subject. The material ramp is metal rather than phosphor:
rhodium and steel carry structure, brass carries anything transmitting force, blued steel
is a hand, ruby is a bearing. Cyan is spent on one thing only — the second that is alive
right now.

The plate is measured, not composed by eye. One orthographic camera spans the whole console
at 120 pixels per world unit, so its frustum *is* the viewport: an object's world position
lands on the pixel the layout put its dial at, and an assembly drawing gets no vanishing
point. The seat arrangement is chosen by measuring the room available, not by a media
query. Type is monospace throughout at three faces, boxes are square-cut at zero radius,
and the only circles in the system are the ones that are genuinely dials, wheels, jewels or
screw heads.

**Key Characteristics:**

- Unlit line art under one bloom pass; opacity is the tonal system, never shading.
- Near-black plate (#0b0f12) carrying perlage and a darkened case rim, never flat black.
- Cyan (#00ffff) reserved for the live beat and the focus ring; state wears green/amber/red.
- Zero radius on every box; circles exist only as drawn instrument geometry.
- Mono-only type: Geist Mono for figures and prose, Departure Mono for engraved micro-type,
  Major Mono Display for the wordmark.
- Depth from bevels, hairlines and emitted glow — no drop shadow anywhere.
- Arrangement decided by measurement (round ring or flanking wings), not by width.

## Colors

A metal ramp on a near-black plate: three weights of rhodium doing all the structural work,
four material colours that each mean one mechanical thing, and one electric cyan held in
reserve for the beating second.

### Primary
- **The Beat** (`{colors.beat}`): the live second — the seconds marker jumping on the true
  second, the rate pointer, the minute rail's lit marks, the locked crown, and every
  focus ring. Nothing else. Spend it on a heading and the second stops meaning anything.
- **Hot Value** (`{colors.hot-value}`): the one value in a frame that is hotter than ink;
  used in the 3D scene for a highlighted part, alongside `{colors.ink-hot}` in the DOM for
  the readout at the top of the minute and a hovered complication headline.

### Secondary
- **Brass** (`{colors.brass}`): the going train and anything transmitting force; also the
  chaton ring under every jewel.
- **Blued Steel** (`{colors.blued-steel}`): hands and screws in the scene, and the `info`
  state in the DOM.
- **Ruby** (`{colors.ruby}`): jewels at the pivots, and the system's list bullet.

### Tertiary
- **Ok** (`{colors.ok}`), **Warn** (`{colors.warn}`), **Err** (`{colors.err}`): state only,
  and only on a complication, an alert, or a nav entry that is actually in that state. Warn
  owns the barrel's leader, the alert count, a struck-through nav link and a degraded HUD
  pip; err replaces it at higher severity via `{colors.err-line}` on the dial ring.

### Neutral
- **Plate** (`{colors.plate}`): the page ground, with `{colors.plate-black}` at the rim and
  in the case gradient, `{colors.plate-raised}` for a raised machining, and
  `{colors.bridge}` for a bridge's own face.
- **Ink** (`{colors.ink}`): all figures, headlines and readings.
- **Ink 2** (`{colors.ink-2}`): register names, fact labels, secondary lines — the floor for
  anything small.
- **Dim** (`{colors.dim}`): large type and non-essential marks only (dial numerals, the
  colon separators in the readout). It measures 4.1:1 on the plate; it is not a text ink.
- **Rhodium hairline** (`{colors.rhodium-hair}`, `{colors.rhodium-hair-faint}`): bridge
  borders, dial rings, dotted leaders, the unlit minute rail.
- **Rhodium line** (`{colors.rhodium-line}`): every control boundary and drawn index mark;
  3.2:1, which is the WCAG 1.4.11 non-text floor. `{colors.rhodium-line-hover}` is its
  hover, `{colors.rhodium-solid}` and `{colors.steel}` its equivalents in the scene.
- **Perlage dot** (`{colors.perlage-dot}`): the graining field on the plate, drawn as two
  offset dot fields at 26px and 13px so it reads as circular graining rather than graph
  paper.

### Named Rules

**The Reserved Beat Rule.** Cyan belongs to the live second and the focused control. A
heading, a border, a hover, a chart series that is not the beat: none of them may take it.

**The Colour-Is-Never-The-Message Rule.** Every coloured state also changes its words or
its shape — the degraded HUD segment reads "2 down" as well as turning amber, a downed nav
link is struck through as well as coloured, the healthy verdict is a line and the unhealthy
one is a box. Contrast is verified: 20 checks, 0 failing.

**The One Meaning Per Material Rule.** Brass is force, blued steel is a hand, ruby is a
bearing, rhodium is structure. A part is not coloured for variety; if a new part needs a
colour, it inherits the material it mechanically is.

## Typography

**Display Font:** Major Mono Display (with `ui-monospace`) — the wordmark only.
**Body Font:** Geist Mono (with `ui-monospace, Menlo`) — everything read as prose or figures.
**Label/HUD Font:** Departure Mono (with Geist Mono fallback) — engraved micro-type.

**Character:** Instrumentation, not costume. A watch face would tempt a serif; this console
is read as measurement, so all three faces are monospaced and the figures are set at Geist
Mono's lightest weight (300) with tabular numerals, so a digit change never shifts the line.

### Hierarchy
- **Wordmark** (400, 1.4rem, lowercase, 0.05em): "ojee.console" in the nav only.
- **Figures** (300, `clamp(3.2rem, 16.5vw, 6rem)`, 0.9, -0.03em, tabular): the time readout.
  On the idle display it runs to `clamp(3rem, 6.2vw, 7rem)`; seated inside the movement's
  core it drops to `clamp(1.5rem, 2.9vw, 2.3rem)` so the calibre still leads.
- **Headline** (400, 0.88rem, 1.3): a complication's headline fact, in `{colors.ink}`;
  1.08rem in `{colors.ink-hot}` on the idle plate.
- **Body** (400, 14px, 1.6): all prose, alerts and table text.
- **Reading** (400, 0.78rem, tabular): a fact's value, right-aligned against a dotted
  leader; 0.95rem on the idle plate.
- **Engraving** (400, 0.72rem, 0.14em, uppercase): the caseline under the movement — date,
  zone, accuracy — plus the crown's state word (0.7rem) and the rate scale (0.64rem).
- **Register mark** (400, 0.68rem, 0.24em, uppercase): the module's name printed on its
  dial, the way a chronograph prints "minutes" on the register at nine.

### Named Rules

**The Eleven Pixel Floor Rule.** No type in this system is set below 0.68rem (~11px), and
nothing small is set in `{colors.dim}`. A name you have to lean in for is not a label.

**The Room Floor Rule.** The idle display is read from further away than anything else, so
it sets its own floor: nothing under 0.78rem (~12.5px), register names at 0.85rem, and
every reading off the dimmest ink.

**The No Eyebrow Rule.** A complication is a dial with its name *printed on it* and its
reading beside or beneath it. No tracked label sits above a heading anywhere in this system.

## Layout

The plate is one screenful, not a scrolling page: `min-height: max(520px, min(100dvh - 300px, 940px))`,
subtracting exactly the chrome above and below it. A movement you have to scroll to see the
bottom of is a page.

**Arrangement is chosen by measurement, not by width.** The script tries two arrangements in
order and takes the first that fits, measuring *inside* the arrangement being tested:
*round* is a true ring, a seat every 360/n from twelve on an ellipse; *wings* samples the
same ellipse only at its sides (205°–155° and -25°–25°) so the seats flank the movement and
nothing sits above or below it — which is what buys the calibre its height. Six seats, always:
the alert takes a seat on the barrel's side like any other complication, which also balances
the flanks. On a wing, seat width is *solved* from the clearance available and capped at
440px; the rejected arrangement is fully unwound before the next is tried.

Ringed, every child of the stage shares one grid cell so the movement's centre and the
ring's centre are the same point. When no arrangement fits, `.ov-stage:not(.is-ringed)`
stacks instead — what needs attention first, then the movement and its figures, then the
registers as engraved rows with a hairline above each, then the crown. **Every responsive
rule in the shell is keyed to that state, not to a breakpoint.** Only two width queries
exist on the plate: 900px resizes the stacked core, and 640px removes the complications'
drawn dials entirely (line art at 90px is noise) leaving the register name as the row's own
label. The scene agrees independently: an object whose box resolves under 30px is not drawn.

Rhythm is the six-step 4/8/16/24/40/64 scale; the shell adds no values of its own. Page
padding is `--s-4` with `env(safe-area-inset-*)` maxima; the sidebar rail appears at 1100px
as a 232px column; the module viewport is `minmax(0, 1fr)` so one wide table can never widen
the page.

## Elevation & Depth

**This system has no drop shadows.** A movement has no blur; it has edges catching light.
Depth comes from three things: the eight-point chamfer clipped into every bridge (four long
edges and four cut corners — geometry, not a silhouette approximation), hairline borders at
three rhodium weights, and light that is genuinely *emitted* by the part emitting it. The
page itself is depth-staged: perlage under a radial mask, then a case-rim vignette that
darkens toward the screen edge, then the canvas painting over the plate with pointer events
off, then the chrome.

### Shadow Vocabulary
Every `box-shadow` in this system is a glow — light from a lit thing, never a cast shadow,
never offset.

- **Glow** (`0 0 10px rgba(0,255,255,0.35)`): the standard cyan emission; `glow-faint`
  (4px/0.16), `glow-soft` (6px/0.22), `glow-mid` (14px/0.4) and `glow-strong` (22px/0.55)
  are its steps.
- **State glow** (`0 0 10px` at 0.35–0.4 in ok / warn / err): a jewel or a pip in state.
- **Jewel chaton** (`0 0 0 1px rgba(255,191,63,0.55)`): a hard 1px ring of brass around a
  ruby — a setting, not a shadow.

### Named Rules

**The No Cast Shadow Rule.** No `box-shadow` in this system has an X or Y offset and none
is used to lift a surface. If a part needs to read as forward, give it a brighter line or a
bevel.

**The Light Comes From The Part Rule.** Glow is emitted by the thing that is alive — the
beat, a jewel, a pip in state. An inert surface never glows.

## Shapes

Zero radius on every box, without exception: bridges, buttons, badges, fields, the crown,
the range thumb. Roundness is **drawn, never bordered** — the circles in this console are
dials, wheels, jewels and screw heads, expressed as a drawn ring plus four index marks
(`border-radius: 50%` appears only on those genuinely circular instrument parts and the
7px jewel). A box with a border is a card; a ring with indices is a dial.

The recurring silhouette is the chamfered plate: an eight-point `clip-path` cutting 10px
from each corner, held down by two drawn slotted screws at opposite corners (one screw
would let a bridge rotate). Côtes de Genève stripe across every bridge at 96° — swept a few
degrees so it is striping and not a hatch — kept under 0.04 alpha, because texture that
reads as content is a mistake. Lines are 1px everywhere; the leader from the alert to the
barrel is a 1px polyline with a 1px open circle at its landing point, redrawn every frame
onto the turning barrel.

## Components

### Bridges (containers)
- **Character:** a bevelled plate screwed to the movement. Nothing in this system is a card.
- **Shape:** eight-point chamfer, 10px cuts, zero radius; 1px hairline border.
- **Background:** a 158° gradient from `{colors.bridge}` to `{colors.plate}` at 62%, with
  côtes striping over it.
- **Hover:** border to `{colors.rhodium-line-hover}`, face lifts one step to `#0f161a`.
- **Internal padding:** `{spacing.s-4}`.
- **Screws:** `--screwed` adds a 9px drawn slotted screw head at the corners.

### Complications (the signature component)
- **Character:** a register — the module's object turning in its dial, the module's name
  printed on that dial, and what it reports read out beside or beneath it. Deliberately not
  a card: no panel, no border box, no label above a heading.
- **Shape:** a 112px dial (116/124px on a wing, 132px on the idle plate) drawn as a 1px
  ring with four inset index marks; the canvas paints the object into it from outside.
- **Reading:** each fact is a label in engraved caps, a dotted leader, and a tabular value
  right-aligned; values wrap rather than run out of the seat.
- **State:** `warn` and `err` recolour the dial's ring only; `down` drops the whole seat to
  0.68 opacity. Hover brightens the ring and the headline; focus draws a 2px cyan ring at
  6px offset.
- **Side:** a seat on the left mirrors — text right-aligned, facts reversed, dial ordered
  outward — so the reading always runs away from the movement.

### The Crown
- **Character:** the rotation lock, and it behaves like a crown. Knurled with real striping,
  two states: pulled out (free) and pushed in (locked, translated 2px).
- **Style:** 1px `{colors.rhodium-line}` border, transparent face, engraved caps state word
  at 0.7rem — the state word is the whole point of the control, so it is not micro-type.
- **Pressed:** cyan text, cyan border, `{colors.beat-wash}` face, cyan knurling.
- **Behaviour:** `aria-pressed`, `L` shortcut, persisted, and on by default under
  reduced motion. It sits on the caseline beside the markings, never floating in the field.

### The Barrel Alert
- **Character:** what needs attention, engraved beside the mainspring with a leader drawn to
  it. A full-width bordered banner is the admin-panel reflex this refuses.
- **Style:** an amber count in engraved caps, then each item as body type with a dotted
  underline at 4px offset; err severity swaps amber for red throughout.
- **Leader:** seated, a 1px SVG polyline redrawn every frame from the block to a named part
  of the turning barrel, with an open circle at the landing point; unseated, a 34px
  hairline with a 5px square terminal.
- **Width:** capped at `min(36ch, 34%)` free, `min(46ch, 30%)` on the idle plate, and the
  full seat width when seated.

### Buttons
- **Shape:** square-cut (0 radius), 1px `{colors.rhodium-line}`, 44px minimum hit height.
- **Primary:** a faint top-lit gradient (`rgba(190,214,222,0.05)` to transparent),
  `{colors.ink}` text, 0.14em tracking, `12px 24px`.
- **Hover:** face to `rgba(190,214,222,0.08)`, border and text to cyan.
- **Focus:** 2px cyan outline at 2px offset — the global focus treatment.

### The Rate Scale
- **Character:** how a watch is regulated — a scale with zero in the middle and a pointer
  where this clock actually sits against true time.
- **Style:** 14px tall, 1px end rails, a centre hairline, 9px repeating graduations, and a
  1px cyan pointer carrying `glow-soft`, eased over `--dur`; transition off under reduced
  motion.

### Jewels
- **Style:** a 7px ruby in a 1px brass chaton with a soft emission. This is the system's
  bullet: used where a list needs a mark and a dot would be anonymous.
- **Variants:** ok / warn / err recolour the stone and its glow; off is `{colors.dim}` with
  a hard ring and no glow.

### Verdict Line
- **Character:** healthy is one quiet line; the box is kept for when something needs looking
  at, so its appearance means something.
- **Style:** `{colors.bridge}` face, 1px border — hairline when ok, `{colors.warn}` when
  not. Ok state may also take an `{colors.ok}` border when it is the boxed variant.

### Browser Surfaces
Selection is a 24% cyan wash with hot ink, the caret and `accent-color` are cyan,
scrollbars are thin rhodium thumbs on a transparent track, and `:focus-visible` is a 2px
cyan outline at 2px offset. The parts nobody draws still carry the design.

### The Scene (3D)
- **Materials:** `LineBasicMaterial` outlines, `EdgesGeometry` on box solids, additive
  double-sided discs for rings of light, an opaque plate-coloured occluder so the far side
  of a wire object does not show through the near side, and `MeshBasicMaterial` beads for
  points of light. No lights, ever.
- **Camera:** one orthographic camera for the whole console at 120px per world unit; its
  frustum is the viewport. Models are authored to radius 2.0 and scaled to the short side
  of their box.
- **Bloom:** one `UnrealBloomPass` at 0.9 strength, 0.55 radius, 0.12 threshold.
- **Lifecycle:** `IntersectionObserver` plus the page-visibility API gate the loop, pixel
  ratio is clamped (1.5 under 720px, else 2), each object's own `tick` is told about reduced
  motion rather than only slowing the outer group, and a refused WebGL context sets
  `data-fallback` so the page keeps every word and number it had. Nothing in the scene is
  load-bearing for meaning.

## Do's and Don'ts

### Do:
- **Do** draw new parts as unlit line art and give them tone with opacity, in one of the
  six material colours.
- **Do** keep cyan for the live second and the focus ring; take green, amber or red for a
  state, and rhodium for structure.
- **Do** make every container a bridge: eight-point chamfer, hairline border, two screws,
  côtes under 0.04 alpha.
- **Do** print a register's name on its dial and read its facts beside it, with a dotted
  leader and tabular values.
- **Do** key responsive behaviour to the arrangement (`.ov-stage:not(.is-ringed)`) and let
  the script decide by measuring; reserve width queries for the two cases that are genuinely
  about physical size (300px core at 900px, dials dropped at 640px).
- **Do** reinforce every coloured state with a word or a shape change.
- **Do** stay on the 4/8/16/24/40/64 rhythm and set type at 0.68rem or larger (0.78rem on
  the idle plate).
- **Do** honour reduced motion in the part itself, and let the crown default to locked.

### Don't:
- **Don't** build a grid of status cards, or a panel-per-module repeat. That arrangement is
  what this world exists to refuse.
- **Don't** put a radius on a box. Circles are drawn instrument geometry — a dial, a wheel,
  a jewel, a screw head — never a rounded container.
- **Don't** add a `box-shadow` with an offset, or use blur for depth. Glow is emitted light
  from a live part; depth is bevel and hairline.
- **Don't** add a light to the scene, or a shaded/textured material. A shaded brass movement
  is a skeuomorph and fights the mono type above it.
- **Don't** spend cyan on a heading, a border, a hover or a decorative accent.
- **Don't** set a tracked micro-label above a heading. The register name goes on the dial.
- **Don't** introduce a non-mono face, or a fourth face at all.
- **Don't** set small type in `{colors.dim}` (4.1:1) — `{colors.ink-2}` is the floor for
  anything under body size.
- **Don't** let the scene carry meaning: every fact has to survive a dead WebGL context.
- **Don't** make the plate scroll. It is one screenful, with the chrome subtracted.
