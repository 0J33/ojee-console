---
version: 1
slug: "public-app-js"
primary_target: "public/app.js"
related_targets: ["public/app.css","public/index.html","public/chrome.js"]
---

# Surface: ojee.console — the whole app

Scope: the launcher, the idle display, the chrome every module mounts inside, and each
module's own header, on desktop and phone. Mode: operate.

Audience/job: one person, on his own machines over his own tailnet, glancing to learn
whether everything is healthy, what needs him, and the exact second — he sets a mechanical
watch by this clock.

Pins from the user (these bind whatever the round chose):
- Black background, white text. No cyan, no blue, no cosmetic colour anywhere. The only
  colour that remains is what carries state: ok / warn / err, and the odd contextual cue
  (a power key, terminal ANSI in Remote) where the colour IS the information.
- Simple, clean layout. Mono or modern clean-tech type. Much less happening on screen.
- Full re-layout: every screen's information architecture is rethought, not just recoloured.
- All functionality survives. Nothing gets lost.
- The 3D models keep their geometry but get new white line versions; where a part needs
  colour for context it may keep it. The movement is secondary and calmer: status and
  readings lead, bloom goes to zero, idle spin is gentle or still.
- Flawless on phone and desktop.

Chosen direction: Monochrome (user-pinned). The former world — one calibre seen through its
display back, cyan beat, brass train, bloom — is the anti-reference. It was too flashy and
too busy; it is retired, and ojee-ui v1 stays as the archive it shipped as. The console
adopts a NEW design-system version (ojee-ui2) rather than rewriting v1 in place.

## Direction contract

THESIS: The console as a quiet black instrument panel — pure black ground, white mono type,
hairline rules, and state as the only colour. It refuses the glowing calibre and the
equally default grid of colourful status cards.

OWN-WORLD: #000 ground. White ink ramp to grey (white / #b3 / #8a / #5c). Geist Mono
throughout at a few weights. Zero radius, zero glow, zero gradient decoration. One accent,
white (black text on it). Status colours exist only inside a reading that reports state.

STORY: He opens it and reads: everything fine, or here is the one thing that needs him. He
sets his watch by the clock, opens the module that is amber, and closes the tab.

FIRST VIEWPORT: A single top bar (state, user, clock). Below it the overview as a status
board: alerts first, then one row per module — state dot, name, headline, key readings —
then the clock with its rate. The white 3D objects sit small and still at the right edge of
their rows as identification, never as the show. Nothing pulses.

FORM: Monochrome instrument panel, user-pinned world (the brief names the palette, type and
material; no roll), re-layout of every surface inside it.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review,
the verdict, DESIGN.md, and every shipping raster carrying its provenance
