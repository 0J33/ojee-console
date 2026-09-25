---
name: ojee.console · cockpit concept
description: The console home as one wide glass cockpit panel. Portals on true black, status drawn as symbology.
colors:
  black: "#000000"
  ink-hi: "#ffffff"
  ink: "#e6e8e8"
  ink-2: "#a3aaae"
  dim: "#7b8388"
  ghost: "#1c2226"
  frame: "#232b30"
  rule: "#151b1f"
  corner: "#5d6d75"
  own-ship-cyan: "#00ffff"
  own-ship-cyan-dim: "#0b7f88"
  commanded-magenta: "#ff4fd8"
  normal-green: "#3dff7a"
  caution-amber: "#ffb000"
  warning-red: "#ff2d2d"
typography:
  display:
    fontFamily: "B612 Mono, ui-monospace, Menlo, monospace"
    fontSize: "min(8.5rem, calc(100cqi / 5.05))"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  wordmark:
    fontFamily: "Major Mono Display, ui-monospace, monospace"
    fontSize: "1.05rem"
    fontWeight: 400
    letterSpacing: "0.02em"
  readout:
    fontFamily: "B612 Mono, ui-monospace, Menlo, monospace"
    fontSize: "1.7rem"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "tnum"
  headline:
    fontFamily: "B612 Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.92rem"
    fontWeight: 400
    lineHeight: 1.3
  body:
    fontFamily: "B612 Mono, ui-monospace, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  soft-key:
    fontFamily: "Departure Mono, B612 Mono, ui-monospace, monospace"
    fontSize: "0.72rem"
    fontWeight: 400
    letterSpacing: "0.16em"
  label:
    fontFamily: "Departure Mono, B612 Mono, ui-monospace, monospace"
    fontSize: "0.7rem"
    fontWeight: 400
    letterSpacing: "0.2em"
rounded:
  none: "0px"
spacing:
  cell: "3px"
  panel-gap: "6px"
  inset-sm: "10px"
  inset-md: "14px"
  inset-lg: "22px"
  band: "46px"
components:
  soft-key:
    backgroundColor: "{colors.black}"
    textColor: "{colors.ink-2}"
    typography: "{typography.soft-key}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "30px"
  soft-key-selected:
    backgroundColor: "{colors.black}"
    textColor: "{colors.own-ship-cyan}"
    typography: "{typography.soft-key}"
    rounded: "{rounded.none}"
  soft-bar-key:
    backgroundColor: "{colors.black}"
    textColor: "{colors.ink-2}"
    typography: "{typography.soft-key}"
    height: "50px"
  master-lamp-unlit:
    backgroundColor: "{colors.black}"
    textColor: "{colors.ghost}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    width: "104px"
    height: "36px"
  master-caution-lit:
    backgroundColor: "{colors.caution-amber}"
    textColor: "{colors.black}"
    width: "104px"
    height: "36px"
  master-warning-lit:
    backgroundColor: "{colors.warning-red}"
    textColor: "{colors.black}"
    width: "104px"
    height: "36px"
  portal:
    backgroundColor: "{colors.black}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  callout:
    backgroundColor: "{colors.black}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.none}"
    padding: "7px 10px"
    width: "214px"
  readout-window:
    backgroundColor: "{colors.black}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "3px 7px"
  annunciator-unlit:
    backgroundColor: "{colors.black}"
    textColor: "{colors.ghost}"
    typography: "{typography.label}"
    height: "30px"
  annunciator-caution:
    backgroundColor: "{colors.caution-amber}"
    textColor: "{colors.black}"
  annunciator-warning:
    backgroundColor: "{colors.warning-red}"
    textColor: "{colors.black}"
---

# Design System: ojee.console · cockpit concept

> **Scope.** This file covers the cockpit concept in `concepts/cockpit/` only: a local demo on synthetic data, not deployed. It is not the console's design system. The incumbent system is ojee-ui (`public/ojee-ui.css`); this file does not describe it and does not override it. **Shared with ojee-ui:** the `ojee.console` wordmark in Major Mono Display, Departure Mono for micro-type, zero radius, the cyan accent. **Different here:** true `#000` ground instead of near-black, B612 Mono for data, the full cockpit colour law (cyan, green, amber, red, magenta, each with one meaning), soft-keys in place of buttons and tabs, and lamps as the only filled shapes.

## Overview

**Creative North Star: "The Glass Cockpit"**

The console home is one wide instrument panel of a fast jet. Separate displays (portals) sit in a single black panel, each a 1px stroke with brighter bezel corners, and every piece of status is drawn as symbology: lamps, tapes with lubber lines and bugs, vertical gauges, cell matrices, an annunciator panel, readout windows. A wireframe airframe in the centre portal carries the four modules as the four systems an aircraft really has, so a fault shows up where it lives on the airframe.

The density is avionics density: many small legends, tabular numerals, thin rules, nothing padded for comfort. Colour is law, not decoration. Text stays white or grey until it carries a state; then it takes that state's colour and nothing else. Nothing reflows when something goes wrong; lights come on in a mask that was already drawn.

The confirmed rejection is the rounded status-card grid: no card backgrounds, no grey fills, no gradients, no radius.

**Key Characteristics:**
- True black (`#000`) ground everywhere, in every mode.
- Portals are strokes, not surfaces; bezel corner marks separate the displays.
- A five-colour state law; white and grey for everything that has no state.
- B612 Mono for every value, Departure Mono for every legend and key.
- A fixed mask: unlit things are drawn as ghosts, lit things change colour, nothing changes size.
- Soft-keys on each portal's top edge are the only navigation.

## Colors

A black panel lit by avionics colours, where each hue means exactly one thing.

### Primary
- **Own-Ship Cyan** (`own-ship-cyan`): own-ship symbology and selection. The lubber line on the seconds tape, the box around a selected soft-key, the border of the selected system's readout and callouts on hover, the `.` in the wordmark, focus outlines, text selection, advisory legends.
- **Dim Own-Ship Cyan** (`own-ship-cyan-dim`): the leader lines from callouts to the airframe while their system has no state to show. The 3D hull is drawn in a slightly brighter dim cyan (`0x0e8f99`) so the lit systems read over it.

### Secondary
- **Commanded Magenta** (`commanded-magenta`): a commanded value or target, never a state. The hack mark (the next `:00`) on the seconds tape, the countdown seconds in HACK mode, the whole readout at the mark, the thermostat setpoint pointer and its `SET` window.

### Tertiary (the status lights)
- **Normal Green** (`normal-green`): normal. Lit lamps, lit gauge columns, running-service cells, `ALL NORMAL` in the band.
- **Caution Amber** (`caution-amber`): caution. Caution headlines, lit MASTER CAUTION, caution annunciators, crossed limit marks, missing-service cells (drawn as amber strokes).
- **Warning Red** (`warning-red`): warning. Warning headlines, lit MASTER WARNING, blinking warning lamps, lost links, down hosts.

### Neutral
- **Panel Black** (`black`): the only background. Every portal, callout, readout box, band and soft-bar is black.
- **Ink High** (`ink-hi`): the one value brighter than ink. Used only for the live seconds digits and the final five-second hack count, so the moving part of the time is the brightest text on the panel.
- **Ink** (`ink`): primary data and values.
- **Ink Two** (`ink-2`, 8.4:1 on black): secondary data, unselected soft-keys, healthy headlines, memo lines.
- **Dim** (`dim`, 5.2:1 on black): legends, fact keys, scale labels. **The floor for any text.**
- **Ghost** (`ghost`): anything unlit. Unlit master lamps, unlit annunciator legends, off cells and pips, the ghosted HH:MM in HACK mode. Never used for text that is supposed to be read.
- **Frame** (`frame`): portal strokes, readout-window strokes, gauge outlines, dashed ghost rules.
- **Rule** (`rule`): inner rules between rows and between soft-keys.
- **Bezel Corner** (`corner`): the 14px corner marks on each portal.

### Named Rules
**The Colour Law Rule.** Cyan is own-ship and selection, green is normal, amber is caution, red is warning, magenta is commanded. Each colour means one thing. Nothing is coloured for decoration, and no colour borrows another's meaning.

**The White Unless Stateful Rule.** Labels and data are ink-hi, ink, ink-2 or dim. Text takes a colour only to carry a state (or cyan when selected, magenta when commanded).

**The Ghost Rule.** Something that is off is drawn in ghost, not removed. An unlit lamp is a ghost of itself.

## Typography

**Data Font:** B612 Mono (with ui-monospace, Menlo, monospace)
**Legend / Key Font:** Departure Mono (with B612 Mono, ui-monospace)
**Wordmark Font:** Major Mono Display, for the `ojee.console` wordmark only

**Character:** B612 Mono was drawn for cockpit displays and reads at a glance. Departure Mono's pixel face gives the legends and keys the look of an MFD's built-in character set. All numerals are tabular (`font-variant-numeric: tabular-nums` on the body).

### Hierarchy
- **Display** (400, `min(8.5rem, 100cqi / 5.05)`, 0.95, −0.02em): the clock readout only, sized to its portal's inline size. HH and MM in ink-2, separators dim, seconds in ink-hi. In idle it grows to 10rem.
- **Readout** (400, 1.7rem, 1): big instrument values. Below it: instrument readouts and tape numerals at 1.05rem, readout-window values and clock facts at 0.95rem, service and stack counts at 0.92rem, gauge values at 0.82rem.
- **Headline** (400, 0.92rem, 1.3, two-line clamp): system headlines in the ICAWS slots, the same size in every state. Severity changes only the colour and the order of the slots.
- **Body** (400, 13px, 1.45): facts. Dense runs (callout text, the readout box's title and body, log rows, legends, bar labels) sit at 0.72rem; memo lines at 0.74rem.
- **Soft-key** (Departure Mono, 0.72rem, 0.16em, uppercase): every soft-key.
- **Label** (Departure Mono, 0.7rem, 0.12 to 0.2em, uppercase): fact keys, scale units, page titles, master-lamp legends, annunciator legends. **0.7rem is the size floor.**

### Named Rules
**The Two Voices Rule.** Values are set in B612 Mono and legends in Departure Mono, always. If it can change, it's in B612; if it names something, it's in Departure. Major Mono Display appears only in the wordmark.

**The Bound Number Rule.** Headlines and callout text go through the non-breaking pass. A number is bound to the word next to it (`12 services`, `3 days`), a `·` separator is bound to the word before it so it ends its line rather than starting one, and the space after a separator stays breakable. No number is ever split from its unit, and no token grows wider than a narrow callout.

**The Centred Colon Rule.** B612 Mono draws its colon at the left of the cell, so every colon in a time is shifted right by 0.14em to sit centred. This applies to every time on the panel, not only the clock.

## Layout

**Desktop panel.** A sticky 46px band sits on top: the wordmark and SIM DATA tag on the left, MASTER CAUTION, status line and MASTER WARNING in the centre, the SIM keys, IDLE and UTC on the right. Below it the panel fills the rest of the viewport (`100dvh − band`) as a grid with 6px gaps. There are three portals across (clock `30fr` min 320px, own-ship `45fr`, ICAWS `25fr` min 330px) above a full-width instrument strip `clamp(168px, 22vh, 230px)` tall, split into four equal portals (ECS·HOME, ENG·FLEET, DLNK·REMOTE, MSN·AGENT). Nothing on the panel scrolls except the ICAWS body.

**Phone (≤860px).** Portals stack in reading order (clock, own-ship, ICAWS, instruments). The band gives up the wordmark and keeps only the two master lamps and a short status line, so it still says whether all is well. Soft-keys for the portals move to a fixed five-key soft-bar at the bottom (50px keys, safe-area padded), which marks the portal in view. The own-ship portal is `min(112vw, 460px)` tall. Callouts shrink to 150px and grow only as far as their text needs (up to three lines, no ellipsis). The instrument strip goes to two columns, and to one column at ≤460px.

**Idle.** True black with the clock and airframe side by side (`44fr / 56fr`) and the instrument strip below. Portal strokes go transparent while the bezel corners stay as ghosts. The band floats transparent and keeps only the master lamps and status, so a fault still outranks the clock. The cursor hides after 2.6s still. Full-screen and leave controls fade in on movement. Portrait or phone idle stacks the portals.

**Rhythm.** Spacing steps are 3px (cells), 6px (panel gap, fact rows), 10px (soft-key and callout insets), 14px (ICAWS and readout insets) and 22px (clock inset). Rows are divided by 1px rules, never by gaps or fills.

### Named Rules
**The Fixed Mask Rule.** Every slot, row, callout and cell is drawn at its full size whether it is lit or not. Each ICAWS slot holds a lamp, a code, a two-line headline and exactly three fact rows; a missing row is a dashed ghost rule. Severity reorders slots and lights them, but never resizes them. The services matrix is always 39 cells and the stack always 6, lit or ghosted. In HACK mode the HH:MM stay in place, ghosted. Nothing on the panel jumps when a caution arrives.

**The Billing Rule.** ICAWS is four slots of fixed height, ordered by severity: warning, then caution, then normal. A system that needs attention is billed: its slot moves up and its headline and lamp take its state colour. A healthy one stays in ink-2. Billing never changes size.

## Elevation & Depth

The panel is flat. There are no shadows, no layering tints and no raised surfaces. Depth comes from strokes (a portal is a 1px frame, bezel corners are brighter than the frame) and from the 3D airframe, which is the only object with real depth. The only glow is emitted light: a lit lamp, a lit master lamp, the magenta mark and the airframe's bloom glow because they are lights, not because they are raised.

### Shadow Vocabulary
- **Lamp glow, normal** (`box-shadow: 0 0 6px color-mix(in srgb, #3dff7a 60%, transparent)`)
- **Lamp glow, caution** (`box-shadow: 0 0 8px color-mix(in srgb, #ffb000 70%, transparent)`)
- **Lamp glow, warning** (`box-shadow: 0 0 10px color-mix(in srgb, #ff2d2d 80%, transparent)`)
- **Master caution lit** (`box-shadow: 0 0 16px color-mix(in srgb, #ffb000 55%, transparent)`)
- **Master warning lit** (`box-shadow: 0 0 18px color-mix(in srgb, #ff2d2d 65%, transparent)`)
- **Hack mark** (`box-shadow: 0 0 30px color-mix(in srgb, #ff4fd8 55%, transparent)`)

### Named Rules
**The Light Not Shadow Rule.** Glow belongs only to something that is lit, is centred on it (zero offset) and uses the light's own colour. Nothing casts a shadow.

## Shapes

Everything is square (0px radius). A box is a 1px stroke on black. Each portal carries two 14px bezel corner marks, top-left and bottom-right, in the brighter corner grey, so each one reads as its own display set into one panel. The one filled shape is the lamp (a 9px square), because it is a light. Lit annunciators, lit cells, pips and gauge columns fill for the same reason. Pointers and bugs are triangles, lubber and setpoint marks are bars, and fault halos on the airframe are expanding circles. These are instrument symbology, not surfaces.

### Named Rules
**The Stroke Is The Surface Rule.** A container is its stroke. Only a light fills.

## Components

### Soft-keys (buttons and navigation)
They behave like MFD bezel buttons and sit in a row on each portal's top edge.
- **Shape:** square cells divided by 1px rules, min 46px wide and 30px tall, Departure Mono 0.72rem uppercase in ink-2. The row ends in the portal's page title (dim label, right-aligned: TIME, OWN-SHIP, ICAWS), which names the page the way an MFD does.
- **Hover:** text goes to ink.
- **Selected:** text turns cyan and a 1px cyan box is drawn inset (5px by 4px) inside the key, the way an MFD boxes its selected option. `aria-pressed` / `aria-current` drives it.
- **Solo key** (IDLE): the same key with its own 1px frame. The SIM group is framed as one unit with a dim `SIM` legend.
- **Phone soft-bar:** the same keys in a fixed five-column bar, 50px tall.
- **Focus:** 1px cyan outline, 2px offset, on every interactive element.

### Master Caution / Master Warning
- **Unlit:** a 104×36px box with its two-line legend drawn in ghost, with a ghost stroke.
- **Lit:** filled amber or red with black legend and centred glow.
- **New:** a newly lit master lamp flashes (0.7s, stepped) until it is pressed. It alternates between lit and a black box with its legend in its own state colour: amber for caution, red for warning. Pressing acknowledges: the flash and the fill stop, while the caution itself stays on the ICAWS page and the airframe. A cleared caution forgets its acknowledgement.
- Phone: 70×34px.

### Portals (cards / containers)
- **Corner Style:** square (0px), 14px bezel corner marks.
- **Background:** black.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px frame. Instrument portals in caution or warning mix their stroke toward amber (60%) or red (70%).
- **Internal Padding:** 10–22px depending on the instrument.

### Lamps
A 9px square. Unlit, it's a ghost stroke on black. Lit, it fills with its state colour and glows. A warning lamp blinks (0.9s, stepped). Lamps sit before every system code, headline and legend entry.

### ICAWS page
Three soft-key pages: SYS (four fixed-height slots, sorted by severity, with the same 0.92rem headline in every state), CAUT (a message list with level, code, text and age, or `NO ACTIVE CAUTIONS · ALL NORMAL`), and LOG. Slots are clickable (Enter/Space too) and select that system on the airframe.

### Own-ship airframe (signature)
A wireframe jet drawn in code (three.js, with bloom) in the centre portal. The mapping is fixed: **ECS = Home** (intakes and ducts), **ENG = Fleet** (engine, nozzle, and a plume that pulses in Fleet's state colour), **DLNK = Remote** (blade antennas and link arcs), **MSN = Agent** (radome and radar face). Each system's lines take its module's status colour. Caution lines breathe and warning lines pulse. A caution or warning also gets an expanding halo at its location, so a fault on a small part like the antennas can't be missed. Callouts are HTML buttons in four fixed corner slots (214px, stroked in state colour when not normal; code and module name are carried in the button's accessible label), joined to their anchors by 1px leaders. Dragging turns the airframe, and when it's left alone it turns slowly on its own. Choosing a soft-key or callout turns it the short way round to present that system, dims the others to about 20%, and replaces the callouts with one cyan-bordered readout box.

### Instruments
- **Seconds tape:** a heading-style tape that runs continuously under a fixed cyan lubber line with a cyan pointer, with ticks every second, longer ones every five, and labels every five. The magenta bug is the next `:00`. It shows ±11 seconds.
- **Linear scale:** a baseline with minor and major ticks, dim labels, and triangle pointers (ink for measured, dim for secondary). A magenta bar marks a setpoint.
- **Log latency tape:** one logarithmic scale (1 ms to 1k) carrying one bug per link. A lost link's bug is red and parked at the end of the scale.
- **Vertical gauges:** a 12px stroked column per host with side ticks. The fill is green, amber at 70, and red at 85 or when the host is down. The limit mark is drawn in frame grey and **lights amber only once it is crossed**.
- **Cell matrices:** fixed grids of square cells. A lit cell fills green, a missing one is an amber stroke, and an off one is a ghost stroke.
- **Annunciator panel:** a 3-column grid of legend cells drawn unlit in ghost. Normal lights them as a green stroke and legend, memo in ink, and caution or warning as a solid fill with black legend.
- **Readout windows:** a value in a 1px stroked box with a dim Departure legend, the way a gauge carries its digits. A commanded window's value is magenta.
- **Facts:** key and value rows (dim Departure key, ink value right-aligned) divided by 1px rules.

### Motion
Tapes, pointers, bugs and gauge fills move continuously (1.2s linear between samples). Lamps and master lamps flash in steps, never with fades. Soft-key page swaps are instant. State colour transitions take 120ms. With reduced motion, the seconds tape steps once per second, the airframe snaps to its presented attitude and stops turning on its own, and every animation runs once at near-zero duration.

## Do's and Don'ts

### Do:
- **Do** keep the ground true black (`#000`) in every portal, overlay, callout and mode.
- **Do** give every colour exactly one meaning from the colour law, and leave text in ink, ink-2 or dim until it carries a state.
- **Do** draw the full mask up front: ghost lamps, ghost legends, ghost cells, dashed ghost rules for missing rows. Let state light them, never resize them.
- **Do** set values in B612 Mono with tabular numerals and legends in Departure Mono uppercase, never below 0.7rem or dimmer than `dim`.
- **Do** run headlines and callouts through the non-breaking pass (numbers bound to words, separators bound to the word before them).
- **Do** centre every colon in a time.
- **Do** mark selection with the inset cyan box on a soft-key and a cyan stroke on a callout or readout.
- **Do** keep a lit master lamp flashing until it is pressed, and let the press acknowledge it without clearing the caution.
- **Do** keep the master lamps and status line visible in idle and on phone.
- **Do** mark every surface that shows synthetic values as simulated (the `SIM DATA` tag and the `sim` source lines).

### Don't:
- **Don't** give a container a fill, a tint or a gradient. Only a light (lamp, lit annunciator, lit cell, gauge column) fills.
- **Don't** round anything.
- **Don't** cast shadows. Glow is only for lit things, centred and in the light's own colour.
- **Don't** use cyan for status or green, amber or red for selection or decoration.
- **Don't** let a state change reflow the panel: no slot grows, no row appears, no callout resizes.
- **Don't** use Major Mono Display for anything but the wordmark.
- **Don't** fade a caution or warning in. Warning light is stepped.

## Known gaps

These came from the finish review (disposition: ship). They are open, non-blocking ceiling notes, not rules:
- Idle still carries the instrument strip. It could reduce further to the clock, the airframe and the master lamps.
- The soft-keys read more as tab strips than as MFD bezel buttons: a row of labelled cells along the top edge rather than keys set into a bezel.
