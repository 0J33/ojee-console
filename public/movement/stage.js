/* ============================================================
   movement/stage — one scene, bound to the layout.

   Every object in this console sits inside a box the CSS put on the
   page: the calibre in the clock's frame, each module's object in its
   complication's dial. There are two ways to do that and only one of
   them survives contact with a phone.

   The way that does not: a canvas per box. Six WebGL contexts, six
   render loops, and a browser that starts dropping the oldest once it
   has enough of them.

   The way this does: ONE canvas across the viewport, an orthographic
   camera whose frustum is the viewport measured in world units, and
   each object moved to the world coordinate its box occupies. Because
   the camera is orthographic that mapping is exact — a box at 240px
   from the left edge puts its object at 240px from the left edge, at
   any zoom, at any scroll offset. The text stays DOM text, crisp and
   selectable and readable by a screen reader, and the drawing stays
   in the canvas underneath it.

   Everything here degrades to nothing: if three.js does not arrive,
   `create` returns null, the host is marked, and the page keeps every
   word, number and control it had.
   ============================================================ */

const MODULES = {
  clock: () => import('./calibre.js'),
  home: () => import('./models/home.js'),
  router: () => import('./models/router.js'),
  fleet: () => import('./models/fleet.js'),
  remote: () => import('./models/remote.js'),
  agent: () => import('./models/agent.js'),
};

/** Whether there is an object for this id at all. A module the console was
    pointed at but this build has no model for gets no empty box reserved for
    one — the caller asks before it lays the box out, rather than leaving a
    hole where an import that was never going to resolve would have gone. */
export const has = (id) => Object.hasOwn(MODULES, id);

/** px per world unit. One number decides how big every object is on the
    page, so the models can be authored against a fixed world radius. */
const PPU = 120;
/** What the models are drawn to fit inside. */
const MODEL_R = 2.0;

/* What an object measures on the plate, in CSS pixels. It is the size every
   model's opacities were authored against, and it is the reference for the
   correction below. */
const REF_FIT = 118;

/**
 * Ink: how WIDE a model's lines are drawn, from how big it is on the screen.
 *
 * The floor is 1.3 rather than 1, because a GL line covers a whole pixel and
 * an instanced quad one pixel wide straddles two of them at half coverage —
 * measured against the old renderer, 1.3 is where a small object comes back
 * to the weight it had (22.8 before, 23.3 after; at 1.0 it was 20.3).
 *
 * A wireframe drawn small is brighter than the same wireframe drawn large,
 * and not because anything changed — its lines are simply closer together.
 * Every line here is半 transparent over black, so where lines crowd into the
 * same pixels they SUM, and a dense object reads as saturated cyan while the
 * identical object given three times the room reads as flat grey. It is the
 * same reason the bloom threshold caught one and not the other: not a
 * setting, a density.
 *
 * So the ink follows the size. An object at the plate's scale is left exactly
 * as drawn; one blown up to a module page gets its lines carried back up to
 * the weight they had when they were packed together.
 */
const inkFor = (fit) => Math.round(Math.min(3.0, Math.max(1.3, 1.3 * (fit / REF_FIT))) * 20) / 20;

export async function create(host, o = {}) {
  let kit;
  try {
    kit = await import('./kit.js');
  } catch {
    host.dataset.fallback = 'true';
    return null;
  }

  const view = kit.mount(host, {
    ortho: PPU,
    onFrame: () => { onFrame(); o.onFrame?.(); },
    bloom: o.bloom ?? 0.85,
    drag: true,
    locked: o.locked,
    onLock: o.onLock,
  });
  if (!view) return null;

  const slots = new Map();   // id -> { selector, el, group, api, fill }
  let raf = 0;

  /** Place every bound object on the box its layout gave it. */
  const sync = () => {
    raf = 0;

    const hb = host.getBoundingClientRect();
    for (const slot of slots.values()) {
      if (slot.reserved) continue;
      if (!slot.el?.isConnected) slot.el = document.querySelector(slot.selector);
      if (!slot.el) { slot.group.visible = false; continue; }
      const r = slot.el.getBoundingClientRect();
      if (!r.width || !r.height) { slot.group.visible = false; continue; }
      // Off-screen by more than a screen: hidden, and its tick skipped.
      const off = r.bottom < -hb.height || r.top > hb.height * 2;
      slot.group.visible = !off;
      if (off) continue;
      const cx = r.left + r.width / 2 - (hb.left + hb.width / 2);
      const cy = r.top + r.height / 2 - (hb.top + hb.height / 2);
      slot.group.position.set(cx / PPU, -cy / PPU, 0);
      // fit is the diameter the box can hold; the models are authored to a
      // RADIUS, so the scale divides by twice it.
      const fit = Math.min(r.width, r.height) * (slot.fill ?? 0.46);

      /* Applied as a RATIO against whatever was applied last, so a model that
         sets an opacity of its own at runtime — a host that has gone down,
         a spring under tension — keeps it and has it scaled next time rather
         than being reset to what it was drawn with. */
      /* WIDTH, not brightness. The lines of an object given a page to itself
         are further apart than the same lines on the plate, and a wider line
         is the only thing that closes that distance: opacity makes a sparse
         line brighter and bloom makes it blurrier, and neither makes the gap
         between two of them any smaller. */
      const ink = inkFor(fit);
      if (slot.ink !== ink) {
        slot.ink = ink;
        slot.group.traverse((n) => {
          if (!n.material) return;
          for (const m of (Array.isArray(n.material) ? n.material : [n.material])) {
            if (m.isLineMaterial) { m.linewidth = ink; m.needsUpdate = true; }
          }
        });
      }
      // A box too small to read an object in gets no object. Under about
      // thirty pixels these models are a smudge of lines, and a phone drops
      // its dials to a text label whose box is a few pixels tall — drawing
      // into it would put five smudges down the page.
      if (fit < 30) { slot.group.visible = false; continue; }
      slot.group.scale.setScalar(fit / (2 * MODEL_R * PPU));
    }
    /* The scene renders at the density the models were DRAWN for. A model is
       one-pixel lines: draw it at twice the size and you do not get a bigger
       drawing, you get the same lines twice as far apart — which is why an
       object that reads as a dense glowing instrument on the plate reads as a
       thin technical diagram when it is given a page to itself. Rendering
       into fewer pixels and letting the browser scale the canvas up puts the
       lines back the distance apart they were meant to be. */
  };
  const queueSync = () => { if (!raf) raf = requestAnimationFrame(sync); };

  // Measured on a slow beat while the scene runs: fonts land, a module's
  // summary makes a card a line taller, a row is replaced wholesale. None of
  // those fire a resize, and all of them move a dial.
  //
  // While the page is actually moving under the scene that beat is far too
  // slow. Every box is measured in viewport coordinates, so a sync six frames
  // late is a model visibly swimming behind the dial it belongs to — and a
  // scrolling page is the normal state of this console on a phone, where the
  // plate stacks and the screenful is dropped. So scrolling puts the sync on
  // every frame, and it falls back to the beat a moment after the page stops.
  let moved = -Infinity;
  let beat = 0;
  const onFrame = () => {
    if (performance.now() - moved < 400) { sync(); return; }
    beat = (beat + 1) % 6;
    if (!beat) sync();
  };
  const onMove = () => { moved = performance.now(); queueSync(); };

  const ro = new ResizeObserver(queueSync);
  ro.observe(document.documentElement);
  window.addEventListener('scroll', onMove, { passive: true });
  window.addEventListener('resize', onMove);
  // The URL bar sliding away on a phone resizes the visual viewport and
  // nothing else: no resize event, no scroll event, and every dial a bar's
  // height out of place until something else happens to move.
  window.visualViewport?.addEventListener('resize', onMove);
  window.visualViewport?.addEventListener('scroll', onMove);

  return {
    view,
    get locked() { return view.locked; },
    setLocked(v) { view.setLocked(v); },

    /**
     * Give a DOM box an object.
     * @param {string} id   which model
     * @param {HTMLElement} el  the box it lives in
     * @param {object} opts     `fill` 0..1 of the box's short side
     */
    async bind(id, selector, opts = {}) {
      const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
      if (!el || slots.has(id)) return null;
      const load = MODULES[id];
      if (!load) return null;
      // The slot is claimed BEFORE the import is awaited. Two paints a frame
      // apart both reach here for the same model, and a guard that only runs
      // before the await lets both through — the second wins the slot and the
      // first is left in the scene forever at scale 1, which is a module's
      // object drawn across the whole screen.
      slots.set(id, { reserved: true, group: { visible: false, scale: { x: 1 }, position: {} } });
      let mod;
      try {
        mod = await load();
      } catch {
        // One model failing is one empty dial, never a broken page.
        slots.delete(id);
        el.dataset.fallback = 'true';
        return null;
      }
      const built = mod.build({ now: o.now });
      const group = built.group || built;
      view.add(group);
      ro.observe(el);
      // Whatever arrived while this was loading. A module's state is pushed
      // the moment the page paints, which is long before a dynamically
      // imported model exists — so it is held on the reservation and handed
      // over here, the instant there is something to hand it to.
      const pending = slots.get(id);
      slots.set(id, {
        el,
        selector: typeof selector === 'string' ? selector : `[data-dial="${id}"]`,
        group,
        api: built,
        fill: opts.fill,
        state: pending?.state,
        alert: pending?.alert,
      });
      if (pending?.state !== undefined) built.setState?.(pending.state);
      if (pending?.alert !== undefined) built.setAlert?.(pending.alert);
      queueSync();
      return built;
    },

    /**
     * Hand a model its module's live state.
     *
     * REMEMBERED, always — even when the model it is for does not exist yet.
     * This used to return early on a slot that was still loading, which threw
     * the state away without a word: the page pushes state as soon as it
     * paints, a model arrives a moment later over the network, and it arrived
     * with nothing. What you got was the model's default — a bare grey
     * wireframe with no lit AC, no signal arcs, no failing bars — until some
     * later repaint happened to push again. Which is exactly why it looked
     * right, and then wrong after a refresh, and right again twenty seconds
     * on when the poll came round.
     */
    setState(id, state) {
      const slot = slots.get(id);
      if (!slot) return;
      slot.state = state;
      if (slot.reserved) return;
      slot.api?.setState?.(state);
    },

    /** The alert that rides the mainspring barrel. Held the same way. */
    setAlert(level) {
      const slot = slots.get('clock');
      if (!slot) return;
      slot.alert = level;
      if (slot.reserved) return;
      slot.api?.setAlert?.(level);
    },

    sync: queueSync,
    setBloom(v) { view.setBloom?.(v); },

    /**
     * Give the scene back without destroying it.
     *
     * Every screen used to build its own: a new WebGL context, a new
     * composer, a fresh import of every model, on every navigation. A browser
     * keeps a small number of live contexts and reclaims the old ones when it
     * feels like it, so a few trips between screens and the newest scene is
     * the one that gets refused — objects that arrive late, or not at all.
     *
     * The scene is the console's, not the screen's. What changes between
     * screens is which objects are in it and which boxes they sit in.
     */
    reset() {
      for (const slot of slots.values()) {
        if (slot.reserved || !slot.group) continue;
        view.remove?.(slot.group);
        if (slot.el) ro.unobserve(slot.el);
      }
      slots.clear();
    },

    /**
     * Where a named part of a bound object is on the page right now, in
     * viewport coordinates. Returns null when the object is not in the scene
     * or has no such part, so a caller can simply hide whatever it was
     * pointing with.
     */
    partPoint(id, name) {
      const slot = slots.get(id);
      if (!slot || slot.reserved || !slot.group.visible) return null;
      const part = slot.group.userData?.parts?.[name];
      if (!part) return null;
      const pt = view.projectObject(part);
      if (!pt) return null;
      const hb = host.getBoundingClientRect();
      return { x: hb.left + pt.x, y: hb.top + pt.y, depth: pt.depth, facing: pt.facing };
    },

    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', onMove);
      window.removeEventListener('resize', onMove);
      window.visualViewport?.removeEventListener('resize', onMove);
      window.visualViewport?.removeEventListener('scroll', onMove);
      slots.clear();
      view.destroy();
    },
  };
}

/** Whether a stage should start locked: the machine's preference wins on
    first visit, the reader's choice wins after that. */
export function initialLock() {
  try {
    const saved = localStorage.getItem('ojee.console.lock');
    if (saved === '1') return true;
    if (saved === '0') return false;
  } catch { /* private mode: fall through to the machine's preference */ }
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function rememberLock(v) {
  try { localStorage.setItem('ojee.console.lock', v ? '1' : '0'); } catch { /* nothing to do */ }
}
