// ShazamGuard.swift on the web: the anti-Shazam rule, the same in ranked and
// in a party.
//
// Shazam has to hear the clip from outside the game. On a phone that is the
// Shazam app or Control Center's Music Recognition (the page goes hidden, or
// loses focus under the overlay); on a computer, another window or app. The
// iPhone's scene phases map to the page like this:
//   .background -> document.hidden (another tab or app, the phone locked)
//   .inactive   -> window blur while still visible (Control Center, the shade,
//                  another window on top on a computer)
//   .active     -> visible and focused again
// So:
// - Hidden while a round counts down or plays is leaving for real: that round
//   has no sound.
// - Focus away for GLANCE (1.0 s) or more is long enough to have tapped
//   Shazam: no sound for the rest of the round.
// - Anything shorter is a slip: the clip carries on.
// - The game's own prompts (the share sheet, a purchase, the review prompt)
//   never count: wrap them in OwnPrompt.during(...) or call OwnPrompt.mark().
// While the player stays on the page nothing here ever mutes a round.
//
// Use: const w = new ShazamWatch(); const off = watchScene(v => { ... }); with
// v one of 'covered' | 'slip' | 'left' | 'returned'. w.covered says whether an
// overlay that isn't ours is up right now (don't start a clip under one).
// ShazamWatch.TAIL (12 s): a clip that starts within this of a leave is muted.

export const TAIL = 12;
export const GLANCE = 1.0;

const now = () => performance.now() / 1000;

/** The game's own prompts, so the rule can tell them from a real leave. */
export const OwnPrompt = {
  _depth: 0, _markedAt: -Infinity, _endedAt: -Infinity,
  /** One of ours is up, was asked for a moment ago (4 s), or has only just closed (0.5 s). */
  get up() { const t = now(); return this._depth > 0 || t - this._markedAt < 4 || t - this._endedAt < 0.5; },
  /** A prompt that shows and closes by itself. */
  mark() { this._markedAt = now(); },
  /** Run `work` (a function returning a promise or a value) with our prompt up for all of it. */
  async during(work) {
    this._depth++;
    try { return await work(); } finally { this._depth--; this._endedAt = now(); }
  },
};

export class ShazamWatch {
  static TAIL = TAIL;
  static GLANCE = GLANCE;
  constructor() { this.coveredAt = null; this.ours = false; this.wentBackground = false; }
  /** Feed every scene change in: 'inactive' | 'background' | 'active'. `own`: one of our prompts is up. Returns the verdict. */
  scene(phase, own = false) {
    if (phase === 'inactive') {
      if (this.coveredAt != null) return 'none';
      this.coveredAt = now(); this.ours = own || OwnPrompt.up;
      return 'covered';
    }
    if (phase === 'background') {
      this.wentBackground = true; this.ours = false;
      if (this.coveredAt == null) this.coveredAt = now();
      return 'left';
    }
    if (phase === 'active') {
      const at = this.coveredAt, back = this.wentBackground, ours = this.ours;
      this.coveredAt = null; this.ours = false; this.wentBackground = false;
      if (at == null) return 'none';
      if (back) return 'returned';
      if (ours || own || OwnPrompt.up) return 'slip';
      return now() - at >= GLANCE ? 'left' : 'slip';
    }
    return 'none';
  }
  /** Under an overlay right now that isn't ours. */
  get covered() { return this.coveredAt != null && !this.ours; }
}

/** The page's scene phase now. */
export function scenePhase() {
  if (document.hidden) return 'background';
  return document.hasFocus() ? 'active' : 'inactive';
}

/**
 * Listen to the page's scene changes and feed them to `watch`; `onVerdict(v)` is called with
 * every verdict other than 'none'. Returns a function that stops listening.
 */
export function watchScene(watch, onVerdict, { own = () => false } = {}) {
  let last = scenePhase();
  const feed = () => {
    const p = scenePhase();
    if (p === last) return;
    // background -> active passes through nothing on the web: feed it straight.
    last = p;
    const v = watch.scene(p, own());
    if (v !== 'none') { try { onVerdict(v); } catch (e) { console.error(e); } }
  };
  // focus/blur arrive before visibilitychange on some browsers; read the phase after the event settles.
  const later = () => setTimeout(feed, 0);
  document.addEventListener('visibilitychange', feed);
  window.addEventListener('blur', later);
  window.addEventListener('focus', later);
  window.addEventListener('pagehide', feed);
  return () => {
    document.removeEventListener('visibilitychange', feed);
    window.removeEventListener('blur', later);
    window.removeEventListener('focus', later);
    window.removeEventListener('pagehide', feed);
  };
}
