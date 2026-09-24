// The three synthesised sounds, from the same recipe as the iPhone and
// Android: a click on every control, a chime on the reveal, the roulette
// tick. Nothing is sampled.
export class Sound {
  constructor(player) { this.player = player; this.enabled = true; this.noise = null; }
  get ctx() { return this.player.ensure(); }
  get out() { return this.player.gain; }
  click() {
    if (!this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(440, t); o.frequency.exponentialRampToValueAtTime(250, t + 0.038);
    g.gain.setValueAtTime(0.032, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.038);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.04);
  }
  reveal() {
    if (!this.enabled) return;
    const c = this.ctx, t = c.currentTime, dur = 0.32;
    const n = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.8);
    const s = c.createBufferSource(); s.buffer = n;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1300; hp.Q.value = 1;
    const g = c.createGain(); g.gain.setValueAtTime(0.07, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(hp).connect(g).connect(this.out); s.start(t);
    [[1280, 0], [1660, 0.055], [2050, 0.115]].forEach(([f, at]) => {
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      og.gain.setValueAtTime(0.03, t + at); og.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.075);
      o.connect(og).connect(this.out); o.start(t + at); o.stop(t + at + 0.08);
    });
  }
  tick() {
    if (!this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    if (!this.noise) { this.noise = c.createBuffer(1, Math.ceil(c.sampleRate * 0.4), c.sampleRate); const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = c.createBufferSource(); s.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500 * (0.88 + 0.24 * Math.random()); bp.Q.value = 1.3;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700; hp.Q.value = 1;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.095, t + 0.0006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    s.connect(bp).connect(hp).connect(g).connect(this.out); s.start(t, Math.random() * 0.388, 0.012);
  }
}
