// The clip player. Apple's 30-second previews are fetched and decoded into
// buffers so a 0.1-second clip is exactly 0.1 seconds: Web Audio schedules
// the start and the stop on the audio clock, not on a timer.
export class Player {
  constructor() {
    this.ctx = null; this.buffers = new Map(); this.loading = new Map();
    this.source = null; this.gain = null; this.volume = 0.28;
    this.playing = false; this.startedAt = 0; this.length = 0; this.onEnded = null; this.lastError = null;
    this.muted = false;
  }
  static couldNotLoad = "Couldn't load the clip. Check your connection and try again.";
  ensure() {
    // iPhone Safari mutes Web Audio when the ring/silent switch is on unless
    // the page says it is playing media, as the app's .playback session does.
    try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch (e) {}
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.gain = this.ctx.createGain(); this.gain.gain.value = this.muted ? 0 : this.volume; this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  setVolume(v) { this.volume = v; if (this.gain) this.gain.gain.value = this.muted ? 0 : v; }
  /** Silence everything (while an ad runs). */
  mute(on) { this.muted = on; if (this.gain) this.gain.gain.value = on ? 0 : this.volume; if (this.ui) this.ui.gain.value = on ? 0 : 0.3; }
  /** Fetch (and, once audio is allowed, decode) once; safe to call ahead of time for the next round. */
  prepare(id, url) {
    if (!url) return Promise.reject(new Error('no preview'));
    if (this.buffers.has(id)) return Promise.resolve(this.buffers.get(id));
    if (this.loading.has(id)) return this.loading.get(id);
    const p = (async () => {
      this.bytes = this.bytes || new Map();
      let data = this.bytes.get(id);
      if (!data) data = await Player.fetchClip(id, url);
      // Before the first tap there is no AudioContext (browsers refuse one): keep the bytes and decode on play.
      if (!this.ctx) { this.bytes.set(id, data); if (this.bytes.size > 6) this.bytes.delete(this.bytes.keys().next().value); return null; }
      this.bytes.delete(id);
      const ctx = this.ctx;
      const buf = await new Promise((res, rej) => { const q = ctx.decodeAudioData(data, res, rej); if (q && q.then) q.then(res, rej); });
      this.buffers.set(id, buf);
      if (this.buffers.size > 16) this.buffers.delete(this.buffers.keys().next().value);
      return buf;
    })().finally(() => this.loading.delete(id));
    this.loading.set(id, p);
    return p;
  }
  /** The clip's bytes. A preview that fails (moved, expired, a network
   *  blip) is retried once, then looked up fresh by its Apple id. */
  static async fetchClip(id, url) {
    const get = async u => { const r = await fetch(u, { mode: 'cors' }); if (!r.ok) throw new Error('preview ' + r.status); return r.arrayBuffer(); };
    try { return await get(url); } catch (e) {}
    try { return await get(url); } catch (e) {}
    const r = await fetch(`/api/itunes?id=${encodeURIComponent(id)}`).then(x => x.ok ? x.json() : null).catch(() => null);
    const fresh = r && r.songs && r.songs[0] && r.songs[0].preview;
    if (fresh && fresh !== url) return get(fresh);
    throw new Error('no clip');
  }
  /** Play `seconds` from `offset` into the clip. Resolves true once it has started; lastError says why not. */
  async play(id, url, seconds, offset = 0) {
    this.stop();
    this.lastError = null;
    let buf;
    const ctx = this.ensure();
    try { buf = await this.prepare(id, url); } catch (e) { this.lastError = Player.couldNotLoad; return false; }
    if (!buf) buf = await this.prepare(id, url).catch(() => null);
    if (!buf) { this.lastError = Player.couldNotLoad; return false; }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(this.gain);
    const at = ctx.currentTime + 0.005;
    const off = Math.max(0, Math.min(offset, buf.duration - 0.05));
    src.start(at, off);
    src.stop(at + Math.max(0.05, Math.min(seconds, buf.duration - off)));
    this.source = src; this.playing = true; this.startedAt = performance.now(); this.length = seconds; this.ctxStart = at; this.offset = off;
    src.onended = () => { if (this.source === src) { this.source = null; this.playing = false; this.onEnded && this.onEnded(); } };
    return true;
  }
  /** Skipping never cuts the clip: it runs on to the new stage's length. */
  extend(seconds) {
    if (!this.source || !this.playing) return;
    const buf = this.source.buffer;
    try { this.source.stop(this.ctxStart + Math.min(seconds, buf.duration - this.offset)); this.length = seconds; } catch (e) {}
  }
  /** Seconds since the clip started, while it plays. */
  get elapsed() { return this.playing ? (performance.now() - this.startedAt) / 1000 : 0; }
  stop() {
    if (this.source) { try { this.source.onended = null; this.source.stop(); } catch (e) {} this.source = null; }
    this.playing = false;
  }
}
