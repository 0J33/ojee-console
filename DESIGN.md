---
name: ojee.console (ojee-ui v3)
description: A personal control console drawn as a modern tech product; dark is the hero, light is first-class, neutral greys with one electric-cyan accent and colour otherwise only for status.
colors:
  page: "#0a0a0a"
  panel: "#111112"
  raised: "#18181a"
  hover: "#1c1c1e"
  line: "#232325"
  line-2: "#2f2f32"
  fg: "#ededef"
  fg-2: "#a3a3aa"
  fg-3: "#8a8a92"
  inv-fg: "#0a0a0a"
  scrim: "rgba(0,0,0,.5)"
  accent: "#2fd8ee"
  on-accent: "#04141a"
  ok: "#3fcf7f"
  warn: "#f2b13c"
  err: "#ff6262"
  page-light: "#fafafa"
  panel-light: "#ffffff"
  raised-light: "#f4f4f5"
  hover-light: "#f0f0f1"
  line-light: "#e9e9eb"
  line-2-light: "#dcdcdf"
  fg-light: "#0b0b0c"
  fg-2-light: "#56565c"
  fg-3-light: "#6b6b72"
  inv-fg-light: "#fafafa"
  scrim-light: "rgba(10,10,12,.32)"
  accent-light: "#0e7490"
  ok-light: "#15803d"
  warn-light: "#b45309"
  err-light: "#d92d20"
  term: "#080808"
  term-light: "#0c0c0d"
  term-fg: "#d8d8dc"
  term-2: "#8c8c94"
  term-line: "#1d1d20"
  term-ok: "#3fcf7f"
  term-warn: "#f2b13c"
  term-err: "#ff6262"
  term-hl: "#2fd8ee"
typography:
  page-title:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  dialog-title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  section-title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "ss01"
  body-sm:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  control:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  meta:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
  metric:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  metric-lg:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "22px"
    fontWeight: 500
    letterSpacing: "-0.035em"
    fontFeature: "tnum"
  metric-xl:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "32px"
    fontWeight: 500
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
  wordmark:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
  terminal:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "-0.01em"
rounded:
  r-1: "4px"
  r-2: "6px"
  r-3: "8px"
  r-4: "10px"
  r-5: "14px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  page-x-narrow: "16px"
  page-x-mid: "28px"
  page-x-wide: "40px"
components:
  button:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg}"
    typography: "{typography.control}"
    rounded: "{rounded.r-2}"
    padding: "0 12px"
    height: "32px"
  button-hover:
    backgroundColor: "{colors.hover}"
  button-sm:
    rounded: "{rounded.r-2}"
    padding: "0 10px"
    height: "28px"
  button-primary:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.inv-fg}"
    rounded: "{rounded.r-2}"
    padding: "0 12px"
    height: "32px"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.r-2}"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fg-2}"
    rounded: "{rounded.r-2}"
    height: "32px"
  button-danger:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.err}"
    rounded: "{rounded.r-2}"
    height: "32px"
  icon-button:
    textColor: "{colors.fg-2}"
    rounded: "{rounded.r-2}"
    size: "32px"
  input:
    backgroundColor: "{colors.page}"
    textColor: "{colors.fg}"
    rounded: "{rounded.r-2}"
    padding: "0 10px"
    height: "32px"
  tag:
    textColor: "{colors.fg-2}"
    typography: "{typography.label}"
    rounded: "{rounded.r-1}"
    padding: "0 6px"
    height: "20px"
  chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg-2}"
    rounded: "{rounded.r-5}"
    padding: "0 10px"
    height: "28px"
  chip-pressed:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
  segmented:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg-3}"
    padding: "2px"
    height: "32px"
  segmented-indicator:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg}"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.r-3}"
  row:
    padding: "12px 16px"
  nav-item:
    textColor: "{colors.fg-2}"
    rounded: "{rounded.r-2}"
    padding: "0 8px"
    height: "34px"
  nav-item-active:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.fg}"
  tab-bar-item:
    textColor: "{colors.fg-3}"
    height: "58px"
  switch:
    backgroundColor: "{colors.line-2}"
    rounded: "{rounded.r-4}"
    width: "36px"
    height: "20px"
  switch-on:
    backgroundColor: "{colors.ok}"
  popover:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.r-4}"
  sheet-mobile:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.r-5}"
  terminal:
    backgroundColor: "{colors.term}"
    textColor: "{colors.term-fg}"
    typography: "{typography.terminal}"
    padding: "14px 16px"
---

# Design System: ojee.console (ojee-ui v3)

## Overview

**Creative North Star: "The Quiet Console"**

ojee.console is one person's control room for their machines, services and agents, drawn to the grade of Vercel, Cloudflare and Linear. It is a modern tech product, not a themed instrument: neutral grey planes separated by hairlines, a single electric-cyan accent that marks *where you are* and *what is focused*, and colour otherwise spent only on status (ok, warn, err). Dark is the hero theme and the one people see first; light is first-class and gets its own tuned values rather than an inversion. Everything is flat and two-dimensional: no 3D, no glass, no gradients as decoration.

Density is high but calm. The body is 14px Geist with most chrome at 12.5–13px; every number, ID, time and the wordmark is set in Geist Mono with tabular figures so values never jitter while they update. Surfaces sit on a 4px grid, corners step through five small radii (4/6/8/10/14), and motion is short and decelerating (120–200ms on `--ease-out`, 260–380ms on `--ease-drawer` for things that travel in from an edge).

The system lives in one vendored file, `public/ojee-ui3.css` (identical to the shared `ojee-ui/ojee-ui3.css`), plus self-hosted variable woff2 fonts and the `icons3.svg` sprite. `public/app.css` only places the shell's own pages. Modules never patch the shared file; they scope their own rules under their root.

**Key Characteristics:**
- Dark hero, first-class light; theme set by `<html data-theme>` or the OS.
- Neutral greys plus one accent (cyan `#2fd8ee` dark / `#0e7490` light); status colours ok/warn/err are the only other hues.
- Geist for UI, Geist Mono tabular for numbers, IDs, times and the wordmark.
- 1px hairlines (`--line`, `--line-2`) do the structural work; shadows are light and reserved for things that float.
- Radii 4/6/8/10/14, 4px grid, decelerating motion, no 3D.
- Layout by container queries on `app` (the `<body>`): 700 / 1000 / 1200.
- Lucide-style 16px line icons at stroke 1.75.

## Colors

A neutral grey stack in two tuned themes, one electric cyan accent, and three status hues; nothing else carries colour.

### Primary
- **Electric Cyan** (`#2fd8ee` dark / `#0e7490` light, `--acc`): the current-location and focus colour. The active nav icon, the active view-tab underline, the active tab-bar icon, the selected palette item's icon, the wordmark's bold letter, focus rings (`2px solid`, offset 2px) and the input focus halo (22% cyan wash). Text on a filled cyan button is Deep Cyan Ink (`#04141a`). Text selection is a 30% cyan wash.
- Alternate accents are opt-in via `data-accent`: orange (`#ff7a35` / `#c2410c`) and violet (`#a48bff` / `#6d3cf0`). They replace cyan wholesale; they never appear alongside it.

### Status
- **Signal Green** (`#3fcf7f` dark / `#15803d` light, `--ok`): healthy, done, switch-on.
- **Amber** (`#f2b13c` dark / `#b45309` light, `--warn`): degraded, needs attention, a module that is down in nav.
- **Alarm Red** (`#ff6262` dark / `#d92d20` light, `--err`): failure, destructive actions, unread badges.
- Status tints are always `color-mix(in srgb, <status> 13–16%, transparent)` backgrounds with the status colour as text (tags, counts, severity squares). The confirm strip uses an 8% warn wash over the panel.

### Neutral (dark / light)
- **Page** (`#0a0a0a` / `#fafafa`): app background, sidebar, top bar.
- **Panel** (`#111112` / `#ffffff`): panels, popovers, buttons, chips.
- **Raised** (`#18181a` / `#f4f4f5`): segmented-control track, active nav, selected rows, dialog footers, table group rows.
- **Hover** (`#1c1c1e` / `#f0f0f1`): hover fill on buttons, icon buttons, nav; rows hover at 60% of it.
- **Line** (`#232325` / `#e9e9eb`): every hairline divider and panel border.
- **Line 2** (`#2f2f32` / `#dcdcdf`): control borders (buttons, inputs, tags, chips, kbd) and the border of every floating surface.
- **Foreground** (`#ededef` / `#0b0b0c`), **Fg 2** (`#a3a3aa` / `#56565c`), **Fg 3** (`#8a8a92` / `#6b6b72`): primary text, secondary text, labels and meta. The primary button inverts: background `--fg`, text `--inv-fg` (`#0a0a0a` / `#fafafa`).
- **Scrim** (`rgba(0,0,0,.5)` / `rgba(10,10,12,.32)`): behind sheets, palette, modals, the mobile inbox.
- Under `prefers-contrast: more`, `--line` becomes `--line-2` and `--fg-3` becomes `--fg-2`.

### Terminal
The terminal surface is dark in both themes: background `#080808` (dark) / `#0c0c0d` (light), text `#d8d8dc`, dim `#8c8c94`, divider `#1d1d20`. ANSI-like highlights are fixed literals so they read the same in either theme: ok `#3fcf7f`, warn `#f2b13c`, err `#ff6262`, highlight `#2fd8ee`. The on-screen key row uses `#0d0d0e` with keys `#1a1a1c` bordered `#2a2a2d`.

### Named Rules
**The One Accent Rule.** Cyan marks location and focus only. It is never a decorative fill, a chart series, or a second brand colour; the default primary action is the inverted neutral button, and `.btn.acc` is a rare exception.

**The Status-Only Colour Rule.** Any hue other than the accent means ok, warn or err. If something is coloured and is not a status, it is wrong.

**The Two Tuned Themes Rule.** Every neutral and status token has its own light value; light is never produced by inverting dark.

## Typography

**UI Font:** Geist (variable, self-hosted `fonts/Geist-Variable.woff2`, with ui-sans-serif, system-ui fallback), stylistic set `ss01` on.
**Mono Font:** Geist Mono (variable, self-hosted `fonts/GeistMono-Variable.woff2`), always with `font-variant-numeric: tabular-nums` and slight negative tracking.

**Character:** A clean grotesk for language, its mono sibling for anything that is a value. The pairing reads as engineered without becoming a code editor.

### Hierarchy
- **Page title** (600, 24px, 1.15, -0.025em): `.ph h1`, one per page, `text-wrap: balance`.
- **Login title / dialog title** (600, 18px login; 600, 15px for modal, sheet and inbox heads at 14px, -0.01em).
- **Section title** (600, 13px, -0.005em): `.sh h2`, the heading above a panel. Sentence case, no uppercase labels.
- **Body** (400, 14px, 1.45): default text, row titles at 500, service names at 600.
- **Small body** (13–13.5px): buttons, inputs, tables, feeds, palette items and inbox/toast titles (13.5px).
- **Meta** (12–12.5px, `--fg-3` or `--fg-2`): row descriptions, notes, table headers (12px, 500), small buttons, chips, segmented options (12.5px).
- **Label** (500, 11.5px, `--fg-3`): metric labels `.ml`, tags, captions, palette group heads. Tab-bar labels, counts and kbd go down to 11px.
- **Metric** (Geist Mono 500, 15px, -0.02em): `.mv`; 17px in system rows at ≥1200, 20px in host metrics, 22px `.lg`/cells, 32px `.xl`. Units `.u` sit at 0.78em in `--fg-3`.
- **Wordmark** (Geist Mono 600, 15px, -0.03em; 16px in the sidebar, 20px on login).
- **Terminal** (Geist Mono 400, 13px, 1.6).

The observed ramp is 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 20, 22, 24, 32px. Inputs go to 16px on coarse pointers to stop iOS zoom.

### Named Rules
**The Tabular Values Rule.** Numbers, IDs, times, durations and the wordmark are Geist Mono with tabular figures. Prose and labels are never mono.

**The Small Steps Rule.** Hierarchy comes from half-pixel size steps, weight (400/500/600) and the three foreground greys, not from big display type. Nothing in the app chrome exceeds 24px except a 32px hero metric.

## Layout

Layout is driven by **container queries on `app`**: `<body>` is `container-type: inline-size; container-name: app`, so the same CSS works inside the console and standalone. A nested region can opt in with `.ui3-root`. Breakpoints:

- **<700:** top bar (52px + safe-area) and bottom tab bar (58px, blurred 86% page, backdrop `blur(16px) saturate(160%)`); page padding 20px 16px; single-column metric grids; needs-you items stack actions under the body.
- **≥700:** page padding 28px; `.grid3` goes to 3 columns; system rows become a 4-column grid; toasts dock right at 380px wide.
- **≥1000:** `.grid4` goes to 4 columns; sheets become a right side sheet (viewport media query, 480px default).
- **≥1200:** the 232px sidebar replaces top bar and tab bar (one of the two is always on screen); page padding 28px 40px 72px; the inbox becomes a 440px popover.

The page is capped at 1640px and centred. Spacing is a **4px grid**: 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 40 are the values in use. Sections are 28px apart, a section head sits 10px above its panel, rows pad 12px 16px, cells 14px 16px, metric grids gap 12px. All safe-area insets are honoured on shell edges.

## Elevation & Depth

Depth is mostly tonal: page, panel and raised greys separated by 1px hairlines. Shadows exist in three steps and are reserved by role. Resting panels carry only `--sh-1`, which is near-invisible in dark. Anything that floats above the page (inbox, command palette, toast, sheet, modal) pairs a 1px `--line-2` border with `--sh-3`; that pairing is deliberate, since a dark shadow alone disappears on a near-black page and the border gives the edge.

### Shadow Vocabulary
- **Rest** (`--sh-1`: `0 1px 2px rgba(0,0,0,.4)` dark / `0 1px 2px rgba(0,0,0,.04)` light): panels.
- **Lift** (`--sh-2`: `0 10px 30px -8px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.02)` dark / `0 8px 24px -6px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.05)` light): available for menus and hovered floating cards.
- **Float** (`--sh-3`: `0 28px 70px -12px rgba(0,0,0,.75)` dark / `0 24px 60px -12px rgba(0,0,0,.22), 0 4px 12px rgba(0,0,0,.06)` light): inbox, palette, toast, sheet, modal.
- **Segment thumb** (`0 1px 2px rgba(0,0,0,.12), 0 0 0 1px var(--line-2)`): the sliding indicator in the segmented control.

### Named Rules
**The Border-Plus-Float Rule.** A popover always has both a `--line-2` border and `--sh-3`. Neither alone.

**The Flat Plane Rule.** No 3D, no perspective, no tilt, no glass on content surfaces. The only blur in the system is the mobile tab bar, and it drops to solid page under `prefers-reduced-transparency`.

## Shapes

Small, consistent corners from a five-step scale: **r-1 4px** (tags, kbd, toast close), **r-2 6px** (buttons, icon buttons, inputs, nav items, palette items, skeletons, the focus ring), **r-3 8px** (panels), **r-4 10px** (popovers: desktop inbox, palette, toast, modal; also the switch track), **r-5 14px** (the top corners of bottom sheets and the mobile inbox; chips use 14px as a pill at 28px height). Nested shapes derive their radius from the parent: the segmented track is 7px around 5px thumbs (2px inset); service icon tiles `.sic` are 7px. Dots, badges and the switch knob are circles; bars and grab handles are 2px-rounded.

Borders are always 1px. Panels use `--line`; interactive controls and floating surfaces use `--line-2`. The active view tab is the one 2px stroke: a cyan underline inset 10px from each side.

## Components

### Buttons
Restrained and precise; they press rather than glow.
- **Shape:** 6px corners, 32px tall (`.sm` 28px, `.lg` 40px), 12px horizontal padding, 13px/500 Geist, 6px icon gap.
- **Default:** `--panel` fill, 1px `--line-2` border, `--fg` text; hover fills `--hover`.
- **Primary (`.pri`):** inverted neutral, `--fg` fill with `--inv-fg` text and no border; hover mixes 14% page in. This is the main call to action.
- **Accent (`.acc`):** cyan fill, `#04141a` text. Rare.
- **Ghost (`.ghost`):** transparent, `--fg-2` text; hover `--fg` on `--hover`.
- **Danger (`.danger`):** default button with `--err` text; `.danger.solid` is an `--err` fill with white text for the final step of a destructive action.
- **Icon button (`.ib`):** 32px (28px `.sm`) square, `--fg-2` icon, `.on` uses `--raised`.
- **Press:** every button, icon button, chip and key scales to 0.97 on `:active` over 120ms `--ease-out` (disabled under reduced motion). Disabled is 50% opacity; busy is 70%.

### Segmented control
A `--raised` track (2px padding, 7px radius, `--line` border) with a sliding `--panel` thumb (`.ind`) positioned by `ui3.placeSegs()`; it moves on `transform`/`width` over 200ms `--ease-out`. Options are 26px (22px `.sm`), 12.5px/500, `--fg-3` becoming `--fg` when pressed. Without JS the pressed button draws its own thumb.

### Tags, chips, counts, dots
- **Tag:** 20px, 4px radius, 11.5px/500, `--line-2` outline in `--fg-2`; status/accent tags drop the border for a 14% wash of their colour.
- **Chip:** 28px pill filter, `--line-2` border on `--panel`; pressed is `--raised` with a `--fg-3` border.
- **Count (`.cnt`):** 18px mono pill on `--raised`; err/warn variants use a 16% wash.
- **Status dot:** 7px circle in a status colour; `.live` adds a 2s ping ring. Badges are 8px err dots with a 2px page ring.
- **Severity square (`.sev`):** 28px, 6px radius, 13% status wash with the status icon.

### Panels, rows and lists
- **Panel:** `--panel`, 1px `--line`, 8px radius, `--sh-1`; `.pad` is 16px, `.clip` hides overflow for edge-to-edge rows.
- **Rows:** 12px 16px, divided by `--line` hairlines; title 500, description 12.5px `--fg-3`. Interactive rows hover at 60% `--hover`.
- **Needs-you list (`.need`):** a severity square, title, two-line description, time and actions; on ≥700 it collapses to one line with actions on the right.
- **System rows (`.srow`):** service name with icon tile, 2 to 4 metrics, a sparkline and a chevron; the whole row is one link via a stretched `::after`, with quick-action chips above it.
- **Settings rows (`.set`):** title plus description on the left, control on the right; `.wrap` stacks below 520px.
- **Feed (`.ev`):** time column, 1px rail with dots, text.

### Metrics, sparklines, bars
`.ml` label (11.5px `--fg-3`) above `.mv` value (Geist Mono tabular, status-tintable through `--c`). Sparklines are 32px SVGs: 1.5px line, 10% area fill, dashed threshold line, and a 5px end dot ringed in panel colour. Bars are 4px tracks in `--line` with a 2px-rounded fill that animates width over 300ms.

### Tables
13px, header 12px/500 `--fg-3` over a `--line` rule, cells 10px 16px with hairline row dividers, numerics right-aligned and tabular, group rows on `--raised` at 12px/600. Wide tables scroll inside `.scroll`; the settings kinds table reflows to cards below 900px.

### Inputs and switch
- **Input / select / textarea:** 32px, 6px radius, `--line-2` border on `--page`, 13px; focus turns the border cyan with a 3px 22% cyan halo. Numeric inputs are 72px, right-aligned mono. Labels are 12px/500 `--fg-2`.
- **Switch:** 36 by 20px track in `--line-2`, white 16px knob that slides 16px over 180ms `--ease-out`; on is `--ok` green.

### Navigation
- **Sidebar (≥1200):** 232px, page background with a `--line` right border; wordmark, a search button showing the ⌘K kbd, 34px nav items (`--fg-2`, 500) with 16px icons. Active is `--raised` fill, `--fg` text and a cyan icon. A module that is down is struck through with an amber icon; an asleep module is quiet `--fg-3`.
- **Top bar and tab bar (<1200):** 52px top bar with wordmark and icon buttons; 58px bottom tab bar, 20px icons over 11px labels, the active tab's icon in cyan.
- **View tabs:** 36px text tabs on a hairline with a 2px cyan underline for the active one.

### Inbox, toast, sheet, palette, modal
All floating surfaces share `--panel`, a `--line-2` border, `--sh-3` and a scrim.
- **Inbox:** a bottom drawer with a grab handle and 14px top corners on narrow screens (380ms `--ease-drawer`); a 440px popover with 10px corners at ≥1200 (scale 0.97 to 1, 180ms). Grouped items, collapsible folds, a `--raised` footer.
- **Toast:** 10px radius card, status dot, 13.5px title, actions; enters from below with `@starting-style` over 260ms `--ease-drawer`, stacks bottom-right at ≥700.
- **Sheet:** bottom sheet with 14px corners on phones; a full-height side sheet with a left `--line-2` border at ≥1000 (260ms `--ease-out`).
- **Command palette:** 620px, 10px radius, 50px input row at 15px, 38px items, `--raised` selection with cyan icon, kbd hints in a `--raised` footer. It opens and closes **without animation** because it is used hundreds of times.
- **Modal:** 440px, 10px radius, 15px/600 head, `--raised` footer; pops from 0.97 over 200ms.

### Empty states and loading
Empty states are centred, 13px `--fg-3` with a 20px icon (green when the empty state is good news), a 14px/500 title and an optional button. Skeletons shimmer between `--raised` and `--hover` over 1.4s; the spinner is a 14px 1.5px ring.

### Terminal
`.term` is the dark terminal surface described in Colors (13px/1.6 mono, 14px 16px padding), with a scrollable row of 36px on-screen keys beneath it.

### Icons
Lucide-style line icons from the `icons3.svg` sprite, used as `<svg class="i"><use href="#i-name"/></svg>`: 16px default (14 `.s`, 18 `.l`, 20 in the tab bar and empty states, 24 `.xl`), `stroke: currentColor`, stroke width 1.75, round caps and joins, no fill.

## Do's and Don'ts

### Do:
- **Do** take every colour from a token (`--page`, `--panel`, `--raised`, `--hover`, `--line`, `--line-2`, `--fg`, `--fg-2`, `--fg-3`, `--acc`, `--ok`, `--warn`, `--err`) so both themes and all three accents work.
- **Do** set numbers, IDs, times and durations in Geist Mono with tabular figures (`.m`, `.mv`, `.num`).
- **Do** use the inverted neutral `.btn.pri` for the primary action and keep cyan for location and focus.
- **Do** give every floating surface a 1px `--line-2` border plus `--sh-3`.
- **Do** write layout queries as `@container app (min-width: 700px | 1000px | 1200px)`, not viewport media queries (sheets excepted).
- **Do** keep radii on the 4/6/8/10/14 scale and spacing on the 4px grid.
- **Do** animate only `transform` and `opacity` on `--ease-out` (`cubic-bezier(.23,1,.32,1)`) for UI and `--ease-drawer` (`cubic-bezier(.32,.72,0,1)`) for edge-entering surfaces, and provide a reduced-motion path.
- **Do** self-host fonts and icons; vendor `ojee-ui3.css`, `fonts/` and `icons3.svg` rather than fetching them.
- **Do** add module fixes in the module's own scoped CSS; never edit `ojee-ui3.css` to solve a module problem.

### Don't:
- **Don't** introduce a second accent or any decorative hue; colour other than cyan means ok, warn or err.
- **Don't** add 3D, perspective, tilt, glassmorphism on content, or decorative gradients.
- **Don't** use uppercase tracked labels or eyebrow text above headings; section titles are 13px/600 sentence case.
- **Don't** set prose or labels in mono, or numbers in proportional figures.
- **Don't** use filled or glyph icons (text characters standing in for icons); use the line sprite.
- **Don't** rely on a shadow alone to separate a floating surface from a dark page.
- **Don't** animate the command palette, or animate layout properties (width/height/top) outside the segmented indicator and bar fill.
- **Don't** produce the light theme by inverting dark values.
