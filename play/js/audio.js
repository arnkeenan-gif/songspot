// The clip player. Apple's 30-second previews are fetched and decoded into
// buffers so a 0.1-second clip is exactly 0.1 seconds: Web Audio schedules
// the start and the stop on the audio clock, not on a timer.
export class Player {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();      // id -> AudioBuffer
    this.loading = new Map();      // id -> Promise
    this.source = null;
    this.gain = null;
    this.volume = 0.28;
    this.playing = false;
    this.onEnded = null;
    this.lastError = null;
  }
  static couldNotLoad = "Couldn't load the clip. Check your connection and try again.";
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.gain = this.ctx.createGain(); this.gain.gain.value = this.volume; this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  setVolume(v) { this.volume = v; if (this.gain) this.gain.gain.value = v; }
  /** Fetch + decode once; safe to call ahead of time for the next round. */
  prepare(id, url) {
    if (this.buffers.has(id)) return Promise.resolve(this.buffers.get(id));
    if (this.loading.has(id)) return this.loading.get(id);
    const p = (async () => {
      const ctx = this.ensure();
      const r = await fetch(url, { mode: 'cors' });
      if (!r.ok) throw new Error('preview ' + r.status);
      const buf = await ctx.decodeAudioData(await r.arrayBuffer());
      this.buffers.set(id, buf);
      if (this.buffers.size > 12) this.buffers.delete(this.buffers.keys().next().value);
      return buf;
    })().finally(() => this.loading.delete(id));
    this.loading.set(id, p);
    return p;
  }
  /** Play `seconds` from the clip's start. Resolves when the clip has started; lastError says why not. */
  async play(id, url, seconds, offset = 0) {
    this.stop();
    this.lastError = null;
    let buf;
    try { buf = await this.prepare(id, url); } catch (e) { this.lastError = Player.couldNotLoad; return false; }
    const ctx = this.ensure();
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(this.gain);
    const at = ctx.currentTime + 0.005;
    src.start(at, offset, seconds);
    this.source = src; this.playing = true;
    src.onended = () => { if (this.source === src) { this.source = null; this.playing = false; this.onEnded && this.onEnded(); } };
    return true;
  }
  stop() {
    if (this.source) { try { this.source.onended = null; this.source.stop(); } catch (e) {} this.source = null; }
    this.playing = false;
  }
}
