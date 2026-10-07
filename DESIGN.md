---
name: ojee.console — Instrument Panel (ojee-ui v2)
description: A private control console drawn as a monochrome instrument panel — white on black, one mono face, colour only for state.
colors:
  ground: "#000000"
  lift: "#0a0a0a"
  panel: "rgba(255, 255, 255, 0.03)"
  tint-2: "rgba(255, 255, 255, 0.05)"
  tint-3: "rgba(255, 255, 255, 0.12)"
  scrim: "rgba(0, 0, 0, 0.80)"
  ink: "#ffffff"
  ink-2: "#b3b3b3"
  dim: "#8a8a8a"
  on-accent: "#000000"
  line: "rgba(255, 255, 255, 0.12)"
  line-2: "#1c1c1c"
  line-strong: "#6a6a6a"
  line-hover: "#9a9a9a"
  accent: "#ffffff"
  accent-08: "rgba(255, 255, 255, 0.08)"
  accent-03: "rgba(255, 255, 255, 0.03)"
  ok: "#5fc26e"
  warn: "#d1a03a"
  err: "#e05555"
  err-line: "rgba(224, 85, 85, 0.55)"
  err-wash: "rgba(224, 85, 85, 0.10)"
  chart-1: "#ffffff"
  chart-2: "#d4d4d4"
  chart-3: "#b0b0b0"
  chart-4: "#909090"
  chart-5: "#757575"
  chart-6: "#5e5e5e"
  chart-7: "#4a4a4a"
  chart-8: "#3a3a3a"
  cell-0: "#141414"
  cell-1: "#2e2e2e"
  cell-2: "#5c5c5c"
typography:
  wordmark:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
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
  headline:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  reading:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.82rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  name:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.68rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.22em"
  caseline:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.72rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.14em"
  button:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "2px"
  chrome:
    fontFamily: "Geist Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.6rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.16em"
rounded:
  none: "0"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "16px"
  s-4: "24px"
  s-5: "40px"
  s-6: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.accent-03}"
    textColor: "{colors.accent}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.err}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-danger-hover:
    backgroundColor: "{colors.err}"
    textColor: "{colors.on-accent}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "11px 14px"
    height: "44px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.s-4}"
  topbar:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink-2}"
    typography: "{typography.chrome}"
    height: "56px"
  sidenav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    padding: "9px 10px"
    height: "38px"
  sidenav-item-active:
    backgroundColor: "{colors.accent-08}"
    textColor: "{colors.accent}"
  sidenav:
    width: "232px"
  module-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.none}"
    padding: "{spacing.s-3} 0"
  toggle-pressed:
    backgroundColor: "{colors.accent-08}"
    textColor: "{colors.accent}"
    rounded: "{rounded.none}"
---

# Design System: ojee.console — Instrument Panel (ojee-ui v2)

## Overview

**Creative North Star: "The Instrument Panel"**

The console is a monochrome instrument panel: a black field, white figures, grey
legends, and a lamp that only lights when something is in a state. It replaces the
Calibre world (cyan on near-black, a bloomed watch movement, brass/blued/ruby
materials, three mono faces). Nothing here is lit for effect. The page is one flat
black field, the chrome is opaque, and the only things that carry hue are a reading
that reports state and content the console is showing rather than drawing — album
art, a device's real LED colour.

The home page is a status board read top to bottom in the order a glance needs it:
what is wrong, then the clock and its rate, then one hairline-separated row per
module with that module's 3D object drawn small at the row's end as identification.
The objects are still white line art in one orthographic scene, but they no longer
glow and no longer perform: bloom is off, they turn slowly and sway, and the word
beside them always carries the fact.

The system is ojee-ui v2, shipped as `public/ojee-ui2.css`. It keeps v1's class
contract so every consumer is a drop-in, and changes the world underneath it. v1
(`public/ojee-ui.css`) stays in the repo **untouched** as the archive of the
previous world and for everything not migrated: the native app's offline page
(`native/www/`), the `themes/*.css` overlays (calibre, ember, paper), and the
`ojee-ui` repo itself, which still ships only v1. Each module repo carries its own
copy of `ojee-ui2.css` for its standalone page.

**Key Characteristics:**

- Pure black ground (#000), opaque chrome, one flat field — no backdrop texture, no vignette.
- White/grey ink ramp; the accent is white. No cosmetic colour anywhere.
- Colour is state: ok green, warn amber, err red, and destructive actions take err.
- One face, Geist Mono, at every size; the old `--pixel`/`--hud` tokens survive and resolve to it.
- Zero radius on every box.
- No glow, bloom, blur, or gradient wash; the glow tokens exist and are transparent.
- Charts separate series by grey weight and end labels, never by hue.

## Colors

A luminance ladder from pure black to pure white, with three muted signal colours held
back for state.

### Primary
- **Panel White** (`{colors.accent}`): the one emphasis — selection, the focus ring,
  the active nav entry, a pressed toggle, the primary button's face, the rate pointer,
  the lit marks of the minute rail. Text placed on it is `{colors.on-accent}`.
  `{colors.accent-08}` and `{colors.accent-03}` are its washes for an active row and a
  hovered control.

### Tertiary (state only)
- **Signal Green** (`{colors.ok}`), **Signal Amber** (`{colors.warn}`), **Signal Red**
  (`{colors.err}`): muted from v1's neons — signals, not light sources. They appear only
  on a status mark, an alert, a module headline in that state, a degraded top-bar
  segment, a meter past its threshold, and destructive controls (`{colors.err-line}`
  border at rest, a solid `{colors.err}` face on hover, `{colors.err-wash}` behind a
  danger icon button). The `info` state is `{colors.ink-2}`: information is not a hue.

### Neutral
- **Ground** (`{colors.ground}`): the page, every bar, the idle display. On the OLED
  panels the idle display runs on for hours, black is a pixel that is off.
- **Lift** (`{colors.lift}`): the only raised surface — modals, toasts, menus.
- **Panel** (`{colors.panel}`, with `{colors.tint-2}` and `{colors.tint-3}`): the
  translucent white fills for a panel face, a table header, a hovered nav row.
- **Ink** (`{colors.ink}`): figures, headlines, values. **Ink 2** (`{colors.ink-2}`,
  10.3:1): names, labels, secondary lines. **Dim** (`{colors.dim}`, 5.7:1): micro-type
  in the chrome, separators, placeholders; it clears AA, so it may carry small text.
- **Lines**: `{colors.line}` and `{colors.line-2}` are decorative hairlines (row
  separators, table rules, panel edges) and deliberately near-invisible;
  `{colors.line-strong}` (3.7:1) is every control boundary, `{colors.line-hover}` its
  hover.
- **Chart ladder** (`{colors.chart-1}` … `{colors.chart-8}`): series 1 is always white,
  each further series a step darker. **Heat cells** (`{colors.cell-0}` → `{colors.cell-1}`
  → `{colors.cell-2}` → white) carry a numeric label on every cell, light on the dark
  steps and black on white.

### Named Rules

**The Colour Is State Rule.** A hue on screen means a state: ok, warn, err. Nothing is
coloured for variety, identity or emphasis — emphasis is white. If a new element wants
colour and is not reporting a state, it is grey.

**The Content Is Data Rule.** Colour the console shows rather than draws is allowed:
album art, a device's real LED colour as a swatch, a screen stream. It is data, so it
is not subject to the rule above.

**The Word And Shape Rule.** Every coloured state also changes its words or its shape:
a module that is down is struck through as well as tinted, the degraded top-bar
segment says "1 down", a row that needs attention grows and its headline says what
happened. Colour alone never carries the message.

**The Grey Ladder Rule.** A chart separates series by weight of grey and by an end
label, never by hue. If eight greys are not enough, the chart has too many series.

## Typography

**Body Font:** Geist Mono (with `ui-monospace, Menlo, monospace`), weights 300–900.
**Display / Label Font:** the same. `--pixel` and `--hud` survive as token names so
every rule and consumer still resolves; in v2 all three resolve to Geist Mono.

**Character:** one instrument face. Hierarchy comes from size, weight and tracking, and
from ink step — never from a second family. Figures are set at weight 300 with tabular
numerals so a changing digit never moves the line.

### Hierarchy
- **Figures** (300, `clamp(3.2rem, 16.5vw, 6rem)`, 0.9, -0.03em, tabular): the clock.
  On the status board it runs `clamp(2.4rem, 6vw, 4.6rem)`; on the idle display
  `clamp(3.4rem, 8vw, 8.5rem)`. Separators drop to dim, seconds to ink-2.
- **Wordmark** (400, 1.4rem, lowercase, 0.05em): "ojee.console", in the top bar only.
- **Headline** (400, 1rem, 1.35): a module row's headline fact; 1.12rem on the idle display.
- **Body** (400, 14px, 1.6): prose, alerts, tables.
- **Reading** (400, 0.82rem, tabular): a fact's value, right-aligned against a dotted leader.
- **Name** (400, 0.68rem, 0.22em, uppercase): a module's name on its row, and fact keys
  (0.7rem, 0.1em). It names the thing it sits on; it is the row's identity, not a
  category line.
- **Caseline** (400, 0.72rem, 0.14em, uppercase): date, zone and time source under the clock.
- **Button** (900, 0.75rem, 2px, uppercase): button faces; 0.65rem / 1.5px on a small button.
- **Chrome** (400, 0.6rem, 0.16em, uppercase): top-bar segments and `.meta`. This is
  the floor, and only the chrome sits on it.

### Named Rules

**The One Face Rule.** Geist Mono only. A display face, a pixel face, a serif for the
clock: none of them. The wordmark is the same face as a table cell.

**The Room Floor Rule.** The idle display is read from across a room: nothing under
0.8rem, names at 0.85rem, headlines in white, and no reading in dim.

## Layout

One opaque top bar (56px, `--nav-h`, plus the safe-area inset) carries the wordmark,
the state segments, the clock, Jump and Settings; it scrolls its own overflow rather
than widening the page, and segments that repeat the page give way under 1280px. At
1100px and up a 232px side rail lists every module and its views, Settings pinned to
its foot; the content column is `minmax(0, 1fr)` so one wide table can never widen
the page. Under 860px the rail and the top-bar links go and a fixed tab bar takes the
bottom edge.

The status board is a two-column grid: content (`minmax(0, 1fr)`) and the clock's
object column (`clamp(84px, 11vw, 148px)`), stacked as alerts → clock → now playing →
rate, caseline and controls → module rows. Each module row is a grid of reading plus a
`clamp(56px, 7vw, 96px)` object cell, separated from the next by a `{colors.line-2}`
hairline, never boxed. Under 900px everything becomes one column and the object drops
under the clock.

The idle display is two columns on one screen: clock, now playing and the watch on the
left (`1.1fr`), module rows on the right (`0.9fr`). On a phone it is the clock and the
watch only, centred; a row list nobody is close enough to read is removed, not shrunk.

Rhythm is the six-step 4/8/16/24/40/64 scale. Every control's hit area is 44px
(`--hit`); small buttons and icon buttons keep their drawn size and grow an invisible
hit area out to it.

## Elevation & Depth

Flat. The page is one black field and depth is tonal: `{colors.panel}` over ground for
a face, `{colors.lift}` for anything that comes up off the page (modal, toast, menu),
`{colors.scrim}` behind it. Edges are 1px hairlines; the border, not a shadow, says
where a surface ends. Chrome is opaque black — `--chrome-blur` is `none` and every
`--glow*` token resolves to `transparent`, so the v1 rule layer keeps its contract and
renders nothing.

The 3D scene agrees: unlit white/grey line art (`kit.js` palette — structure
`#5e5e5e`, secondary `#9a9a9a`, train `#d4d4d4`, hands and the live part white) on a
transparent clear, bloom at 0. Status colour reaches a model only through
`STATUS_HEX` (ok / warn / err; off is the structure grey).

### Named Rules

**The Opaque Chrome Rule.** Bars, rails and sheets are solid or absent. No frosted
glass, no translucency over content, no backdrop blur.

**The Nothing Glows Rule.** No `box-shadow`, `text-shadow` or bloom used as light or
lift. If a thing must read as forward, it gets a brighter ink or a stronger line.

## Shapes

Zero radius on every box: buttons, fields, panels, badges, toggles, the range thumb,
the status mark (an 8px square, 6px inside a badge). Lines are 1px. The watch dial and
the 3D objects are round because they are drawings of round things. Hard-stop
gradients are allowed only to *draw* marks — the crown's knurling, the rate scale's
graduations, the select caret — never to shade or wash a surface.

## Components

### Buttons
- **Shape:** square-cut (0), 1px border, 44px minimum height, `12px 24px`.
- **Primary:** white face, black text, 900 weight caps at 2px tracking. Hover inverts
  to a transparent face with white text and border.
- **Ghost:** transparent, ink text, `{colors.line-strong}` border; hover takes border and
  text to white over `{colors.accent-03}`.
- **Danger:** err text on an `{colors.err-line}` border; hover fills err with black text.
- **Disabled:** dim text, hairline border, struck through.
- **Focus:** the global 2px white outline at 2px offset.

### Toggles (crown, display switches)
- The crown holds the movement still; `12H`/`EN` switches change a label. Same 1px
  `{colors.line-strong}` box and caps, no radius.
- **Pressed:** white text, white border, `{colors.accent-08}` face; the crown's knurled
  stem turns white and pushes in 2px. The state word is the point of the control.

### Inputs / Fields
- **Style:** `{colors.panel}` face, 1px `{colors.line-strong}` border, 0 radius, 44px.
- **Focus:** border to white over `{colors.accent-03}`.
- **Error / Disabled:** err border with an err message line; 0.45 opacity.

### Panels
- **Background:** `{colors.panel}`; 1px `{colors.line-2}` border; `{spacing.s-4}` padding.
- **Hover:** border to `{colors.line-hover}`. Modules use panels for their own pages;
  the status board does not.

### Navigation
- **Top bar:** one opaque bar, hairline under it; segments in chrome caps, values in
  ink-2, a degraded segment in warn with its word.
- **Side rail:** 0.76rem items, ink-2; hover `{colors.panel}` face; active is white text
  on `{colors.accent-08}`; a down module dims, a sub-view indents 34px.
- **Tab bar (phones):** fixed, opaque, a 1px white top rule over the active item.

### Module Row (signature)
- **Character:** one line on a status board — name, headline, readings, object — not a
  card. Rows are divided by a hairline and never boxed.
- **Read:** a square status mark beside the name in caps; the headline in ink; each
  fact a key, a dotted leader and a tabular value right-aligned.
- **State:** warn/err recolour the headline and add 3px of padding so the cadence
  breaks where the priority does; down drops the row to 0.68 opacity and strikes the
  name.
- **Object:** the module's 3D object, small, in an open cell at the row's end.

### Alert Block
- Only present when something needs attention, and first on the page when it is: a
  count in signal caps ("4 things need attention"), then each item in ink with a dotted
  underline that follows the words.

### Rate Scale and Minute Rail
- **Rate:** a 14px scale with zero in the middle, 1px end rails, 9px graduations and a
  1px white pointer where this clock sits against true time.
- **Rail:** sixty marks, every fifth taller; elapsed marks white at 0.8, the last five
  set apart. The v1 flash, trail and pulse on the second are retired.

### The Scene (3D)
- One orthographic camera at 120px per world unit across the viewport; unlit line art;
  bloom 0. Objects idle-spin at 0.035 rad/s and sway on a 14s period; reduced motion
  stops both. A refused WebGL context loses no word or number.

## Do's and Don'ts

### Do:
- **Do** resolve every value to an ojee-ui2 token; a literal colour outside the token block is a bug.
- **Do** spend white on the one thing that is selected, focused, pressed or live.
- **Do** use ok / warn / err only for a state, and err for destructive actions.
- **Do** pair every coloured state with a word or shape change.
- **Do** draw charts on the `--chart-1..8` grey ladder with end labels.
- **Do** keep chrome opaque black with a 1px hairline edge.
- **Do** scope a module's CSS under its own prefix and ship its own copy of `ojee-ui2.css` for its standalone page.
- **Do** stay on the 4/8/16/24/40/64 rhythm and the 44px hit area.

### Don't:
- **Don't** add a hue for identity, decoration, a category or a chart series.
- **Don't** use glow, bloom, `text-shadow`, `backdrop-filter` blur, or a gradient wash.
- **Don't** load a second typeface, or point `--pixel` / `--hud` at one.
- **Don't** put a radius on a box.
- **Don't** box the status board's module rows or turn them into a card grid.
- **Don't** write a module stylesheet with `*` or bare design-system class names (`.panel`, `.btn`, `.label`) as selectors.
- **Don't** edit `ojee-ui.css`; v1 is the archive and the fallback for unmigrated surfaces.
- **Don't** let the 3D scene carry a fact the text does not also say.
