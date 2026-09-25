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

/** px per world unit. One number decides how big every object is on the
    page, so the models can be authored against a fixed world radius. */
const PPU = 120;
/** What the models are drawn to fit inside. */
const MODEL_R = 2.0;

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
      // A box too small to read an object in gets no object. Under about
      // thirty pixels these models are a smudge of lines, and a phone drops
      // its dials to a text label whose box is a few pixels tall — drawing
      // into it would put five smudges down the page.
      if (fit < 30) { slot.group.visible = false; continue; }
      slot.group.scale.setScalar(fit / (2 * MODEL_R * PPU));
    }
  };
  const queueSync = () => { if (!raf) raf = requestAnimationFrame(sync); };

  // Measured on a slow beat while the scene runs: fonts land, a module's
  // summary makes a card a line taller, a row is replaced wholesale. None of
  // those fire a resize, and all of them move a dial.
  let beat = 0;
  const onFrame = () => { beat = (beat + 1) % 6; if (!beat) sync(); };

  const ro = new ResizeObserver(queueSync);
  ro.observe(document.documentElement);
  window.addEventListener('scroll', queueSync, { passive: true });
  window.addEventListener('resize', queueSync);

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
      slots.set(id, {
        el,
        selector: typeof selector === 'string' ? selector : `[data-dial="${id}"]`,
        group,
        api: built,
        fill: opts.fill,
      });
      queueSync();
      return built;
    },

    /** Hand a model its module's live state. */
    setState(id, state) {
      const slot = slots.get(id);
      if (slot?.reserved) return;
      slot?.api?.setState?.(state);
    },

    /** The alert that rides the mainspring barrel. */
    setAlert(level) {
      const slot = slots.get('clock');
      if (!slot?.reserved) slot?.api?.setAlert?.(level);
    },

    sync: queueSync,

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
      window.removeEventListener('scroll', queueSync);
      window.removeEventListener('resize', queueSync);
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
