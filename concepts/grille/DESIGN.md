---
name: ojee.console — The Grille (ojee-ui v3, draft)
description: A personal control console made like 1960s German hi-fi in black — keys, lamps, a perforated grille that is also the display, and cream objects on a black shelf.
status: prototype in concepts/grille. Replaces "The Instrument Panel" (v2) only if approved.
colors:
  body: "#000000"
  unit: "#0C0C0D"
  unit-2: "#141415"
  key: "#222224"
  key-hi: "#2C2C2F"
  key-lo: "#18181A"
  seam: "#232325"
  hole: "#1B1B1D"
  cream: "#ECE6D8"
  cream-2: "#BDB7AA"
  grey: "#8C8A86"
  grey-2: "#5E5C59"
  on-key: "#0A0A0A"
  go: "#F2C230"
  run: "#63C26F"
  hold: "#F2C230"
  stop: "#F0592E"
  stop-bed: "#2A0E06"
typography:
  display: { fontFamily: "Archivo", fontSize: "2.75rem", fontWeight: 300, lineHeight: 1.02, letterSpacing: "-0.03em" }
  title: { fontFamily: "Archivo", fontSize: "1.75rem", fontWeight: 500, lineHeight: 1.1, letterSpacing: "-0.02em", textTransform: "lowercase" }
  section: { fontFamily: "Archivo", fontSize: "1rem", fontWeight: 600, textTransform: "lowercase" }
  label: { fontFamily: "Archivo", fontSize: "0.9375rem", fontWeight: 500, lineHeight: 1.3 }
  body: { fontFamily: "Archivo", fontSize: "0.9375rem", fontWeight: 400, lineHeight: 1.45 }
  legend: { fontFamily: "Archivo", fontSize: "0.75rem", fontWeight: 500, textTransform: "lowercase" }
  meta: { fontFamily: "Archivo", fontSize: "0.8125rem", fontWeight: 400, lineHeight: 1.35 }
  scale: { fontFamily: "Archivo", fontSize: "0.6875rem", fontWeight: 500 }
  numerals: { fontFamily: "Archivo", fontWeight: "200–400", fontFeature: "tnum, lnum", sizes: "1.375rem readout · 3rem unit · 4.5rem clock · 5.5rem setpoint · up to 11rem idle" }
  terminal: { fontFamily: "ui-monospace", fontSize: "0.8125rem", note: "terminals, journals and process names only" }
rounded: { key: "9px", well: "12px", unit: "18px", round: "50%" }
spacing: { s-1: "4px", s-2: "8px", s-3: "12px", s-4: "16px", s-5: "20px", s-6: "24px", s-7: "32px", s-8: "48px" }
components:
  key: { backgroundColor: "{colors.key}", textColor: "{colors.cream}", rounded: "{rounded.key}", height: "44px", note: "relief: 1px top light, 1px bottom shade; pressed sinks 1px with an inner shadow" }
  key-go: { backgroundColor: "{colors.go}", textColor: "{colors.on-key}", note: "one per screen" }
  unit: { backgroundColor: "{colors.unit}", rounded: "{rounded.unit}", edge: "1px {colors.seam} inset" }
  grille: { backgroundColor: "{colors.unit-2}", hole: "{colors.hole}", lit: "{colors.cream}", pitch: "10 units", radius: "3.2 units" }
---

# Design System: ojee.console — The Grille

## Overview

**Creative North Star: "The Grille."** The console is made like a piece of 1960s German
hi-fi, but in black: one panel of keys, lamps and a perforated speaker grille that is
also its display. Each module is a unit on that panel with a cream object, one large
numeral, and a grille whose lit holes are its last day of history.

The rut this avoids is the dark dashboard of cards and its opposite, the sci-fi cockpit
HUD (which the console's own v1 and v2 already were). It also stays clear of rep.'s
solid colour tiles: the two apps share a quality bar, not a look.

**The use scene:** the owner glances at it across a room, from a desk, and on his
phone, and sometimes leaves it full screen as a clock. True black (`#000`) means an
OLED switches those pixels off, so the panel reads as a few lit legends floating in the
dark, and the grilles and lamps are the brightest things on the page because they carry
state.

## Rules

- **The Off Pixel Rule.** The page body is `#000`. Units step up to `#0C0C0D` and keys to
  `#222224`; the eye reads depth from those steps and from key relief, never from grey
  fog or glass.
- **The Function Colour Rule.** Colour means a function, never a module. Yellow (`go`)
  is the one main key on a screen and the clock's second hand. Green (`run`) is running
  or on. Yellow-as-`hold` is waiting for you. Red-orange (`stop`) is needs you, failed or
  destructive. Every module is otherwise the same cream on black.
- **The Lamp-and-Word Rule.** A state colour never appears alone. A lamp always sits
  beside a word ("cooling", "1 needs you", "waiting for you").
- **The One Yellow Key Rule.** Each screen has at most one yellow key, and it is the
  thing the screen is for: "open" on an alert, "start session", "unlock", "open a chat",
  the play key.
- **The Lowercase Legend Rule.** Anything printed on the panel (keys, nav, unit
  names, section heads, scales) is lowercase, as on the equipment. Content (machine
  names, alert titles, song titles, sentences) keeps its own case.
- **The Glow Budget.** Only lamps and lit grille holes may glow (a 6px halo). Nothing
  else has a coloured shadow.

## Colors

| token | value | role |
|---|---|---|
| body | #000000 | page ground |
| unit | #0C0C0D | a unit's faceplate, sheets, palette |
| unit-2 | #141415 | recessed well: grille bed, inputs |
| key / key-hi / key-lo | #222224 / #2C2C2F / #18181A | key at rest / under the finger / pressed in |
| seam | #232325 | the 1px seam where two parts meet |
| hole | #1B1B1D | an unlit grille hole |
| cream | #ECE6D8 | primary legend and numerals (17.6:1) |
| cream-2 | #BDB7AA | secondary legend |
| grey | #8C8A86 | tertiary legend (6.3:1 on black) |
| grey-2 | #5E5C59 | disabled, scale ticks, quiet notes (never body copy) |
| go / hold | #F2C230 | main key, second hand / waiting |
| run | #63C26F | running, on |
| stop | #F0592E | needs you, failed, destructive |
| stop-bed | #2A0E06 | the faceplate of an alert or confirm |

## Typography

**Archivo**, one family, a workhorse grotesk in the spirit of the equipment's legends.
Numerals do the heavy lifting and go *light* as they grow: 400 on a unit (3rem), 300 for
the status sentence, the clock and the setpoint, 200 for the idle clock. Tabular lining
figures everywhere, so the clock never shifts. Units sit after a number at 0.4em in grey
("24 °c set", "-92 dbm"). Monospace appears only for terminals, journals and process
names.

## The grille (signature)

A unit's history is drawn as a perforated grille: a recessed bed of round holes, 10
units apart with a 3.2-unit radius, where each column is one reading and the lit holes
rise to its level.

- The **top** lit hole of a column is full cream; the holes under it are at 34%, so the
  outline of the data reads first and the area under it stays quiet.
- A column takes a function colour when the reading means something: red for a poor
  signal or a hot room, yellow for a fair signal or high CPU.
- **Scrub it:** pointer or finger across the grille lights that column and the readout
  under it changes from "-92 dBm now" to the value at that column.
- Short series are widened (each value repeated) so every grille keeps its hole size.
  Used on every module unit, on the network's signal history (8 rows, 1h/6h/24h/48h), and
  on each machine's CPU in its sheet.

## The objects (3D)

The 3D stays, redrawn as **cream industrial objects on a black shelf**, softly lit
(hemisphere fill, warm key from the upper left, cool rim from behind), in three
materials only: cream plastic, brushed aluminium and graphite, plus the function
colours for lamps and the yellow key. Every object shows something true:

| module | object | what it shows |
|---|---|---|
| clock | travel alarm clock | the console's own NTP time; quartz-tick yellow second hand |
| home | wall thermostat dial | turns to the AC setpoint; drag it (or arrow keys) to set |
| network | pocket radio with antenna | the router; grille front, tuning wheel, green lamp |
| machines | three-unit hi-fi stack | one lamp per machine, red when one needs you |
| remote | monitor on a stand | — |
| agent | calculator | the one yellow key |
| music | turntable | the record spins at 33⅓ only while music plays |
| desk | keyboard and mouse | — |
| LOQ / ojee-hp-zorin / disinteg | laptop / grille-front tower / four-drawer rack | each machine's state lamp |

Motion is a slow sway (about 0.05 Hz, ±0.16 to 0.28 rad); reduced motion stops it and
sets the hands without the tick travel. One WebGL canvas covers the window and is
scissored into each object's slot, clipped to the layer on top (page, sheet or idle
clock), so there is one GL context however many objects are on screen. If WebGL fails,
nothing is lost: every fact is also in words.

## Layout

**Five destinations**, the same on every screen: now · home · machines · agent · me.

- **Desktop (1920 × 1080):** a 236px rail (wordmark, "ask odysseus", five station keys,
  the mini-player). The Now page is one screen with no scrolling: the status sentence
  and alerts beside the clock unit, then a 3 × 2 grid of module units beside the
  "today" column (activity, now playing, the turntable).
- **Phone (iPhone 13 Pro Max, 428 × 926):** one column with a 16px gutter and safe
  areas; the units stack. At the bottom, a mini-player and a row of five station keys;
  the current key is pressed in with a yellow icon. Detail opens in bottom sheets that
  drag to close.

Where everything went (nothing removed): watch → the clock unit and idle mode · music →
mini-player and sheet · home → home · peripherals → home › desk · router →
machines › network · fleet → machines (machines, services) · remote → desktop,
terminal and files keys on every machine · agent → agent (claude, workflows,
assistant, services) · settings → me (notifications routing, clock, trusted devices,
modules, sign out).

## Components

- **Key:** 44px (36 small), 9px corners, a 1px top light and 1px bottom shade. Pressed,
  it sinks 1px into an inner shadow. Variants: go (yellow), ghost (seam outline), danger
  (red legend; solid red for the confirming press).
- **Round key:** 52/40px, used for the AC's −/+, player transport and quick actions.
  "On" is pressed in with a green legend.
- **Selector keys (chips):** a row of keys. The chosen one is pressed in with a 6px
  yellow lamp before its legend. Used for sub-views (`role=tab`) and filters.
- **Slide switch:** a 48 × 28 recessed track with a cream square thumb; a small lamp in
  the track lights green when on.
- **Segmented keys:** keys in a recessed well; the chosen segment is raised, with a
  yellow icon.
- **Lamp:** 7px (12px in the status sentence), glowing, and always next to a word.
- **Unit:** an 18px faceplate with a seam edge. Legend row (icon, lowercase name,
  lamp + state), then the numeral and meta line beside the object, then the grille. The
  whole unit is a link; one optional round quick key sits top right.
- **Alert:** a stop-bed faceplate with a red lamp, the title, its source, then
  restart · mute 1 h · **open** (the yellow key).
- **Rows:** in a unit or a seam-outlined group, separated by 1px seams. A 30px icon in
  grey (or a function colour), title over meta, then an end slot (value, state, switch,
  key or chevron).
- **Sheet:** a 560px right panel on desktop, a bottom sheet on the phone, with a 72%
  black scrim.
- **Confirm in place:** restarting the router and revoking a device confirm in a red
  strip inside the list, never in a modal.
- **Palette:** "jump to…" (`/` or `⌘K`) reaches pages, machines, scenes, AC power,
  restarting a service, the clock, the player and the desk devices.
- **Idle clock:** full black, the alarm clock at up to 380px, the time at up to 11rem
  weight 200, a 60-dot seconds row, the NTP facts, and keys for 12 h, Arabic numerals,
  hold still (`L`) and full screen. Keeps the screen awake.
- **Toast:** a key-shaped bar with a green check that says what happened.

## Motion

Mechanical, not springy. A key travels 1px in 90ms; state changes take 180ms on
`cubic-bezier(.2,.8,.2,1)`; sheets slide in 360ms on the same curve. A page fades in once
on navigation. The only continuous motion belongs to the objects (sway, the second
hand, the record), and reduced motion stops all of it.

## Copy

Calm and exact. State what is measured and where it came from ("ntp ±43 ms",
"OwnTracks · ±12 m · seen 2 min ago"). Keys name their action ("restart", "mute 1 h",
"vacuum journal"), and the toast says the result ("terraria-api restarted").
