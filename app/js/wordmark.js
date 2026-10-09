// StageView.SpelledWordmark: the opening screen's faint "songspot", typed
// letter by letter (0.085 s each) from the first frame while the game loads.
// Whole, it holds 0.45 s; still loading, it rubs out from the end at the same
// speed, waits 160 ms and spells again, so the game always opens on the whole
// word. Letters are placed by the time since the pass began, not by a chain
// of timers. Motion off: drawn whole at once. Then a 250 ms beat and a fade
// (easeOut 0.28) to the stage. The page under it is the flat stage colour.
const TYPE = 0.085, RUB = 0.085, LETTERS = 'songspot'.split('');

export const Splash = {
  node: null, shown: 0, ready: false, spelled: false, still: false, _raf: 0, _done: null,
  /** Put the opening name up (once); replaces the static boot wordmark. */
  start() {
    if (this.node) return this;
    let motion = true; try { motion = JSON.parse(localStorage.getItem('songspot.motion') ?? 'true') !== false; } catch (e) {}
    this.still = !motion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const n = document.createElement('div');
    n.className = 'splash'; n.setAttribute('role', 'img'); n.setAttribute('aria-label', 'songspot');
    n.innerHTML = `<div class="wordmark">${LETTERS.map(c => `<span>${c}</span>`).join('')}</div>`;
    document.body.appendChild(n);
    document.querySelector('#app .boot .wordmark')?.style.setProperty('visibility', 'hidden');
    this.node = n;
    const spans = [...n.querySelectorAll('span')];
    const paint = k => { if (k === this.shown) return; this.shown = k; spans.forEach((s, i) => s.classList.toggle('on', this.still || i < k)); };
    if (this.still) { paint(LETTERS.length); this.spelled = true; return this; }
    paint(0);
    let mode = 'type', t0 = performance.now();
    const step = now => {
      const e = (now - t0) / 1000, len = LETTERS.length;
      if (mode === 'type') {
        paint(Math.min(len, Math.floor(e / TYPE) + 1));
        if (this.shown >= len) { this.spelled = true; mode = 'hold'; t0 = now; }
      } else if (mode === 'hold') {
        if (this.ready) return;                  // whole, and the game is ready: stay
        if (e >= 0.45) { this.spelled = false; mode = 'rub'; t0 = now; }
      } else if (mode === 'rub') {
        paint(Math.max(0, len - Math.floor(e / RUB) - 1));
        if (this.shown <= 0) { mode = 'pause'; t0 = now; }
      } else if (mode === 'pause' && e >= 0.16) { mode = 'type'; t0 = now; }
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
    return this;
  },
  /** The game behind is ready: wait (≤ 2.5 s) for the whole word, a beat on it, then fade away. */
  async finish() {
    if (!this.node) return;
    if (this._done) return this._done;
    this.ready = true;
    this._done = (async () => {
      const by = performance.now() + 2500;
      while (!this.spelled && !this.still && performance.now() < by) await new Promise(r => setTimeout(r, 20));
      if (!this.still) await new Promise(r => setTimeout(r, 250));
      cancelAnimationFrame(this._raf);
      const n = this.node;
      n.classList.add('out');
      setTimeout(() => n.remove(), this.still ? 0 : 300);
    })();
    return this._done;
  },
};
