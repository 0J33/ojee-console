---
name: ojee.console — Wireframe (ojee-ui v3, draft)
description: A personal control console that is modern and technical — true black, hairline panels, white line-art objects with hidden lines removed, and one accent taken from the owner's SNXS79 lume.
status: prototype in concepts/wireframe. Replaces "The Instrument Panel" (v2) only if approved.
colors:
  ground: "#000000"
  panel: "#060709"
  panel-2: "#0C0E11"
  panel-3: "#14171B"
  line: "rgba(214, 228, 245, 0.085)"
  line-2: "rgba(214, 228, 245, 0.15)"
  line-hi: "rgba(214, 228, 245, 0.32)"
  text: "#E9EEF3"
  text-2: "#A9B2BC"
  dim: "#75808B"
  faint: "#48505A"
  accent: "#5FE6EC"
  on-accent: "#001214"
  ok: "#3DDC97"
  warn: "#F5B841"
  err: "#FF5A5F"
  wheel: "#F2F1EC"
  wheel-ink: "#141414"
  wheel-sun: "#D0202A"
  wheel-sat: "#1F4FA8"
typography:
  display: { fontFamily: "Geist", fontSize: "2.75rem", fontWeight: 300, lineHeight: 1.04, letterSpacing: "-0.04em" }
  title: { fontFamily: "Geist", fontSize: "1.625rem", fontWeight: 500, letterSpacing: "-0.03em" }
  label: { fontFamily: "Geist", fontSize: "0.9375rem", fontWeight: 500 }
  body: { fontFamily: "Geist", fontSize: "0.9375rem", fontWeight: 400, lineHeight: 1.5 }
  meta: { fontFamily: "Geist", fontSize: "0.8125rem", fontWeight: 400 }
  data: { fontFamily: "Geist Mono", fontSize: "0.75rem", fontWeight: 500, note: "units, timestamps, scales" }
  reading: { fontFamily: "Geist Mono", fontWeight: "300–400", note: "unit readings 2.5rem, setpoint 4.75rem, signal 3.75rem" }
  clock: { fontFamily: "Geist", fontWeight: "200–300", fontFeature: "tnum", note: "4rem in the tile, up to 10rem idle" }
  wheel: { fontFamily: "Wheel Day / Wheel Num / Wheel Arabic", note: "the SNXS79 day-date only (Sweet Sans Pro Medium, Engravers Gothic Bold, Amiri; subset, from public/movement/fonts)" }
rounded: { s: "8px", m: "10px", l: "16px", xl: "22px", full: "999px" }
spacing: { s-1: "4px", s-2: "8px", s-3: "12px", s-4: "16px", s-5: "20px", s-6: "24px", s-7: "32px", s-8: "48px" }
---

# Design System: ojee.console — Wireframe

## Overview

Modern and technical, without the clutter of v1 and v2. The page is true black, so an
OLED switches those pixels off. Panels are barely lifted (`#060709`) and separated by
hairlines rather than fills. Every object is white line art with its hidden lines
removed. There is exactly one accent: `#5FE6EC`, the blue-cyan the owner's SNXS79 lume
actually glows.

The structure is the simple one from the earlier prototypes, kept because it worked:
- **Five destinations:** Now, Home, Machines, Agent, Me.
- **One sentence of status** with its lamp.
- **One unit per module:** a reading, a wireframe object, and a dot-matrix of its history.
- **Detail in sheets.**

## Rules

- **True black.** The ground is `#000`. Depth comes from 1px hairlines at 8.5%, 15% and
  32% of a cool white, never from grey fills or glow.
- **One accent.** Cyan marks the live second, the selected item, the one main action
  per screen, the latest dot in a matrix, and the parts of an object that are lit. Nothing
  decorative is cyan.
- **State is a dot and a word.** Green, amber and red only report state, and always sit
  beside the word that says it ("Running", "1 needs you", "Waiting for you").
- **Hidden lines removed.** Every 3D part is a depth-only occluder plus its edges. A
  wireframe where you can see through everything is a diagram; this is an object.
- **Real colours are content.** The SNXS79's lume and its white day-date wheel (SUN red,
  SAT blue), a host's state lamp, the router's lamps, the R86 HE's `#00FFFF` keys and the
  Echo Mini's red power key are drawn as they really are.
- **Mono means data.** Geist carries words. Geist Mono carries numbers, units,
  timestamps, scales and code. The big clocks use Geist with tabular figures, because
  mono colons leave holes at display size.

## The clock: Seiko 5 SNXS79 (7S26)

The clock is the owner's watch, drawn in line to the measurements in
`public/movement/calibre.js`.

**Case and bracelet:**
- A 37 mm case drawn as one lathe profile from caseback to bezel.
- 43 mm lug to lug: the flank simply continues into the lugs.
- 19 mm between the lugs, then a three-piece bracelet fading out.
- A knurled crown at four o'clock.

**Dial:**
- A dark sunburst, shown as 48 faint rays, with a sloping flange and a printed minute
  track whose hour marks are twice as long.
- Applied batons with lume set into them: a double baton at twelve and none at three.

**Hands and second hand:**
- Baton hands with a body that hides what they pass over and lume down the middle.
- The seconds hand steps six times a second, like the 7S26's 21,600 beats an hour.

**Day-date window, at three:**
- Shape: 2.73 : 1, with the day on 56% of the width.
- Wheel: white, printed black, Sunday red, Saturday blue.
- Typefaces: Sweet Sans for the English day, Engravers Gothic for the date, Amiri for
  the Arabic day (with the hamza).
- Language: switch English or Arabic in Me › Clock, or in the idle clock. It follows the
  console's real `dayLang` preference.
- No brand name is printed on the dial, as before: the shape is the reference.

The clock appears on the Now page's clock unit. Opened full screen (idle mode), it
shows:
- The watch beside the time.
- The NTP date, zone, source, offset and rate.
- Controls for 12-hour time, the EN/AR day wheel, Hold still (`L`) and full screen.

Idle mode keeps the screen awake and dims between 23:00 and 06:00 if that preference is
on.

## The other objects

| object | stands for | what it shows |
|---|---|---|
| split AC unit | Home | the flap opens and dashed airflow runs when the AC is on |
| rotary encoder | the setpoint | turns to the setpoint, with its arc lit in cyan; drag or use the arrow keys |
| 5G CPE column | Network | three lamps on its face |
| three towers | Machines | one lamp per machine, red when one needs you |
| monitor | Remote | a desktop with a cyan window |
| chip | Agent | the die in lume |
| Snowsky Echo Mini | Music | reels that turn only while music plays, red power key |
| R86 HE + V5 | Desk | the keyboard's keys in `#00FFFF`, the mouse as a wire sphere |
| laptop / tower / rack | LOQ / ojee-hp-zorin / disinteg | each machine's state lamp |

Motion is a slow sway (about 0.05 Hz). Reduced motion stops the sway, the airflow and the
reels, and lets the seconds hand step once a second. One WebGL canvas covers the window
and is scissored into each object's slot, clipped to the top layer, so there is one GL
context in total. If WebGL fails, the page loses nothing it needs to read.

## The matrix

A unit's history is drawn as a dot matrix, one column per reading:
- **Colour:** the top dot of each column is cyan (the edge of the data) and the dots
  under it are white at 22%. A column turns amber or red only when the reading means
  something (fair or poor signal, a hot room, high CPU).
- **Scrub it:** run a pointer or finger across it and the readout shows that column's
  value.

It appears on every unit, on the network's signal history (1 h, 6 h, 24 h, 48 h) and on
each machine's CPU.

## Components

- **Buttons:** 40px (34 small), 10px corners, a 1px hairline. Variants:
  - **Primary:** solid cyan with dark text, at most one per screen.
  - **Ghost:** a quieter hairline.
  - **Danger:** red text on a red hairline, solid red for the confirming press.
- **Chips:** 36px pills. Selected is a cyan wash with a cyan hairline and text. They
  serve as sub-view tabs and filters.
- **Segmented control:** a hairline track; the selected segment is raised with a cyan
  icon. Used for AC mode and fan, the EN/AR day wheel, and the desk devices' settings.
- **Toggle:** a 42 × 24 hairline track; on is a cyan wash with a cyan thumb.
- **Unit:** a 16px panel with a 1px hairline. Hovering a unit shows small corner marks.
  Each unit has:
  - a label row: icon, name, and state with its lamp;
  - the reading in mono beside the object;
  - the dot matrix underneath.
  The whole unit is a link, with one optional round quick action at the top right.
- **Alert:** a red wash, a red lamp, the title and its source, then Restart, Mute 1 h
  and **Open** (primary).
- **Rows:** in panels, separated by hairlines, with a 30px outlined icon, a title over a
  meta line, and an end slot.
- **Sheet:** a 560px right panel on desktop, a bottom sheet with a drag handle on the
  phone.
- **Inline confirm:** destructive actions confirm in place in a red strip, never in a
  modal.
- **Palette:** Jump (`/` or ⌘K) reaches pages, machines and actions.
- **Toast:** a panel with a cyan check that says what happened.

## Layout

- **Desktop (1920 × 1080):** a 240px rail with:
  - the wordmark, with a small dial whose cyan hand ticks every second;
  - Ask Odysseus;
  - the five destinations;
  - the mini-player.

  The Now page fits one screen with no scrolling: the status sentence and alerts beside
  the clock unit, then a 3 × 2 grid of module units beside the Today column.
- **Phone (iPhone 13 Pro Max, 428 × 926):** one column with a 16px gutter and safe
  areas. At the bottom sit the mini-player and a floating, blurred tab bar with a
  sliding indicator. Idle mode stacks the watch above the time.

## Where everything is

Nothing was removed:
- **Watch:** the clock unit and idle mode.
- **Music:** the mini-player and its sheet.
- **Home:** Home.
- **Peripherals:** Home › Desk.
- **Router:** Machines › Network.
- **Fleet:** Machines › Machines and Services.
- **Remote:** Desktop, Terminal and Files buttons on every machine.
- **Agent:** Agent › Claude, Workflows, Assistant and Services.
- **Settings:** Me › Notifications, Clock (12-hour, day wheel EN/AR, night dimming, NTP),
  Trusted devices, Modules, Sign out.
