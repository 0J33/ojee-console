---
name: ojee.console — Halo (ojee-ui v3, concept draft)
description: The console in the Health app's Halo language. AMOLED black tiles, colour only as a grainy glow rising from one corner (one hue per module), dot-matrix readings, and the 3D object sitting in the glow as the tile's emblem, drawn as wire or as liquid chrome.
status: prototype in concepts/halo with a concept switch (A Wire, B Chrome, C Matrix). Built on concepts/wireframe; replaces nothing until one is chosen.
sources: ~/Documents/Backups/ui-overhaul/options/07-halo and 09-halo-2 (screens.html, BRIEF-2.md, BRIEF-3.md)
colors:
  ground: "#000000"
  tile: "#0B0B0C"
  line: "rgba(255,255,255,.075)"
  text: "#F2F0EB"
  dim: "#8F8B85"
  key: "#F2F0EB (primary action, selected chip, on toggle)"
  lume: "#5FE6EC (the live second only)"
  hues: { clock: "95,230,236", home: "255,150,64", network: "92,164,255", machines: "56,214,160", remote: "150,124,255", agent: "255,112,92", desk: "196,232,92", music: "255,74,140", alert: "255,90,95" }
typography:
  words: "Instrument Sans 400–600"
  status: "Newsreader 400, 2.375rem; first sentence bright, the rest dim"
  readings: "Doto 800 (dot matrix) — or Geist 300 in the plain variant"
  data: "Geist 500, tabular"
  wheel: "Wheel Day / Wheel Num / Wheel Arabic (the SNXS79 day-date only)"
rounded: { tile: "22px", group: "20px", buttons: "999px", sheet: "28px" }
---

# ojee.console — Halo

## What was taken from Halo and Halo 2

- **The halo.** Every unit is a black tile. Its module's colour rises from one corner as a
  radial glow, and fine grain (SVG `feTurbulence`) is masked to the same corner. Halo 2's
  rule holds: grain never sits behind a label, a number or an icon. The corner is where
  the 3D object lives, so the object stands in its own light.
- **Dot matrix.** Readings use Doto, the dot-matrix face, sparingly: the big number on
  each unit, the setpoint, the signal, the clock. Everything else is Instrument Sans or
  Geist. The history under each unit is a dot-matrix chart in the module's hue: bright top
  dot, the column body at 22%, scrub to read.
- **Colour per family.** Each module has one hue, read before the words. The hue appears
  only as the glow, the matrix and the label icon. State (green, amber, red) is still a
  dot plus a word. A machine that needs you turns its tile's glow red.
- **Serif status.** As on Halo's Today, the status is one sentence in Newsreader. It opens
  with what matters, and the explanation follows dimmed.
- **Halo 2's keys.** A round, softly translucent profile key at the top right (Me). On the
  phone, four tabs in a pill plus a separate round warm-white key at the right end, which
  here is Ask Odysseus.
- **Warm-white primary.** The primary action, the selected chip and an on toggle are warm
  white (`#F2F0EB`) with dark text, never a hue, because hues belong to the modules.

## The three concepts

Use the switch at the bottom right (on the phone it sits above the dock). The axes can be
mixed freely.

| | A · Wire | B · Chrome | C · Matrix |
|---|---|---|---|
| 3D objects | white line art, hidden lines removed | liquid metal reflecting a studio with the tile's hue in it | none on Now tiles (the watch, the AC dial and the sheets keep theirs) |
| icons | line, 1.75 px | turned-steel chips, glyph etched, rimmed in the hue | line |
| readings | Doto dot matrix | Geist light | Doto, larger |
| grain | on | on | on |

- **A** is the closest to the Wireframe direction you approved: techy, line-drawn, with
  Halo's colour.
- **B** tests the metallic look you liked but weren't sure about. The metal lives on the
  objects, where the bodies have room to catch light. The small icons can be metal too,
  but at 16–20 px the etched glyph reads less crisply than a line icon. Try Chrome objects
  with Line icons.
- **C** is the calmest version: the matrix is the picture.

## The watch

The Seiko 5 SNXS79 from the Wireframe direction is unchanged:
- the case, the dial, the 6-beat seconds hand;
- the EN/AR day-date wheel (Me › Clock and the idle clock).

In B it is rendered in chrome on a dark dial with lume batons. The clock tile glows in
lume cyan from its top-left corner, behind the watch.

## Implementation notes

- **Glow:**
  - `.glow` plus a corner class (`c-tr`, `c-tl`, `c-br`, `c-bl`) and a family class
    (`f-home`, `f-net`, …).
  - `--gr` is the glow radius, `--nr` the grain radius and `--ga` the glow strength.
  - Turn grain off with `html[data-grain="off"]`.
- **Switch attributes:** the concept switch writes `data-objects`, `data-icons`,
  `data-num` and `data-grain` on `<html>`. Never use `data-obj` on `<html>`: `[data-obj]`
  marks 3D slots and carries `contain: strict`.
- **Chrome rendering (`objects.js`):**
  - Chrome is `MeshStandardMaterial({ metalness: 1, roughness: .16 })`.
  - Its environment is an equirect canvas: soft boxes, a horizon line, and a band of the
    tile's `--h`, prefiltered by PMREM once per hue.
  - `Stage.rebuild()` rebuilds the scenes when the mode changes.
- **Everything else** carries over from `concepts/wireframe`:
  - routes, sheets, palette, idle clock, the actions, sample data;
  - one WebGL canvas.
