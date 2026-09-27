// Ads on the web: Google's H5 Games Ads (the Ad Placement API — adBreak /
// adConfig) under the same publisher as the app's AdMob. An interstitial
// after every five finished rounds (never before a new player's tenth), and
// a rewarded "5 more seconds" on a lost round, as on the phone. Premium sees
// none. Every call fails silently: until AdSense approves the site, or when a
// blocker eats the script, adBreak simply never shows anything and the game
// carries on. Our own audio is always stopped before an ad and muted during it.
const CLIENT = 'ca-pub-2183185085536179';
// The side banners on wide screens: an AdSense display unit ("Songspot side",
// vertical). Empty until the unit exists in AdSense — then paste its
// data-ad-slot number here and the rails appear for non-premium players.
const SIDE_SLOT = '';
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

export class Ads {
  constructor({ player, isPremium }) {
    this.player = player; this.isPremium = isPremium;
    this.loaded = false; this.showing = false;
    window.adsbygoogle = window.adsbygoogle || [];
    // The documented shim: calls queue until the library arrives.
    window.adBreak = window.adConfig = window.adBreak || function (o) { window.adsbygoogle.push(o); };
  }
  /** Load the library once, and only for players who will see ads. */
  sync() {
    if (this.loaded || this.isPremium()) return;
    if (local && !new URLSearchParams(location.search).has('ads')) return;   // no ad calls from a dev machine unless asked
    this.loaded = true;
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
    s.setAttribute('data-ad-client', CLIENT);
    s.setAttribute('data-ad-frequency-hint', '30s');
    if (local) s.setAttribute('data-adbreak-test', 'on');
    s.onerror = () => { this.loaded = false; };
    document.head.appendChild(s);
    try { window.adConfig({ preloadAdBreaks: 'on', sound: 'on', onReady: () => {} }); } catch (e) {}
    this.rails();
  }
  /** Skyscrapers either side of the game column, on screens wide enough to
   *  have empty space there. Never on phones, never for premium, never over
   *  the game. They hide the moment a player goes premium. */
  rails() {
    if (!SIDE_SLOT || this.railsOn || this.isPremium()) return;
    this.railsOn = true;
    const css = document.createElement('style');
    css.textContent = `.ad-rail{position:fixed;top:50%;transform:translateY(-50%);width:160px;height:600px;z-index:1;display:none}
      .ad-rail.l{right:calc(50% + 260px)}.ad-rail.r{left:calc(50% + 260px)}
      @media (min-width:1100px) and (min-height:640px){.ad-rail{display:block}}`;
    document.head.appendChild(css);
    for (const side of ['l', 'r']) {
      const box = document.createElement('div');
      box.className = `ad-rail ${side}`;
      box.innerHTML = `<ins class="adsbygoogle" style="display:inline-block;width:160px;height:600px" data-ad-client="${CLIENT}" data-ad-slot="${SIDE_SLOT}"></ins>`;
      document.body.appendChild(box);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    }
    setInterval(() => { if (this.isPremium()) document.querySelectorAll('.ad-rail').forEach(e => e.remove()); }, 3000);
  }
  get available() { return this.loaded && !this.isPremium(); }
  before() { this.showing = true; this.player.stop(); this.player.mute(true); }
  after() { this.showing = false; this.player.mute(false); }
  /** The ad break between rounds. Resolves when it is over, shown or not. */
  interstitial(name = 'round-break') {
    return new Promise(done => {
      if (!this.available) return done(false);
      let finished = false; const end = shown => { if (finished) return; finished = true; this.after(); done(shown); };
      const guard = setTimeout(() => end(false), 90000);
      try {
        window.adBreak({ type: 'next', name,
          beforeAd: () => this.before(),
          afterAd: () => this.after(),
          adBreakDone: info => { clearTimeout(guard); end(info && info.breakStatus === 'viewed'); } });
      } catch (e) { clearTimeout(guard); end(false); }
    });
  }
  /**
   * Ask for a rewarded ad. Resolves quickly with null when none is ready, or
   * with { show() → Promise<boolean rewarded>, skip() } when one is — the
   * stage then offers "Watch an ad, hear 5 more seconds".
   */
  rewarded(name = 'five-more-seconds') {
    return new Promise(resolve => {
      if (!this.available) return resolve(null);
      let offered = false, settle = null, rewarded = false;
      const timer = setTimeout(() => { if (!offered) resolve(null); }, 1500);
      try {
        window.adBreak({ type: 'reward', name,
          beforeAd: () => this.before(),
          afterAd: () => this.after(),
          beforeReward: showAdFn => {
            offered = true; clearTimeout(timer);
            resolve({
              show: () => new Promise(r => { settle = r; try { this.player.stop(); showAdFn(); } catch (e) { r(false); } }),
              skip: () => {},
            });
          },
          adViewed: () => { rewarded = true; },
          adDismissed: () => { rewarded = false; },
          adBreakDone: () => { clearTimeout(timer); this.after(); if (!offered) resolve(null); if (settle) settle(rewarded); } });
      } catch (e) { clearTimeout(timer); resolve(null); }
    });
  }
}
