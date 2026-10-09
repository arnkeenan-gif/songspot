// The menu behind the ☰ on Home: Drawer.swift. Settings, and nothing else.
// Where to play is the Games tab and you are the Profile tab; this is how the
// game on Home is set up and how the app looks and feels everywhere. A drawer
// from the left over a dimmed stage: Game, Display, General, a short note
// after Game and Display, each row a glyph in the level's colour on a dark
// square washed with it.
//
// Web only (platform differences, kept): Sounds and the volume (the app has
// the phone's own volume), Phone size on a desktop (view.js), Privacy choices
// through Google's consent message, Get the app, and the Privacy / Support
// links. The Apple Music row is iOS only.
import { el, esc, settings, LINKS, LevelTheme, TIER_COLOR, TIER_INK, mix } from './ui.js';
import { I } from './icons.js';
import { Haptics } from './haptics.js';
import { desktop, viewMode, setViewMode } from './view.js';
import { albumDisplayName } from './games.js';
import { SeasonTheme } from './season.js';

const glyph = name => `<i class="dr-glyph" style="--g:url('/app/img/glyphs/glyph-${name}.png')"></i>`;
const svgTile = svg => `<span class="dr-tile dr-svg" aria-hidden="true">${svg}</span>`;

export async function openDrawer(ctx) {
  if (document.querySelector('.drawer-wrap')) return;
  const { game, sound, account } = ctx;
  const wrap = el(`<div class="drawer-wrap"><div class="scrim"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="Settings"><div class="dr-scroll"></div><i class="dr-fade" aria-hidden="true"></i></aside></div>`);
  const d = wrap.querySelector('.drawer'), body = wrap.querySelector('.dr-scroll');
  const S = (k, def) => settings.get(k, def);
  let restoring = false;

  const tile = name => `<span class="dr-tile" aria-hidden="true">${glyph(name)}</span>`;
  const label = t => `<p class="dr-label">${esc(t.toUpperCase())}</p>`;
  const note = t => `<p class="dr-note">${t}</p>`;
  const line = '<i class="dr-line" aria-hidden="true"></i>';
  const group = rows => `<div class="dr-group">${rows.filter(Boolean).join(line)}</div>`;
  const toggleRow = (key, title, t, on) => `<div class="dr-row" role="switch" tabindex="0" aria-checked="${on}" aria-label="${esc(title)}" data-toggle="${key}">${t}<span class="dr-title">${esc(title)}</span><i class="dr-sw ${on ? 'on' : ''}"></i></div>`;
  const linkRow = (act, title, t, { value = null, locked = false, href = null } = {}) => {
    const end = (locked ? `<i class="dr-lock">${glyph('crown')}</i>` : value != null ? `<span class="dr-value">${esc(value)}</span>` : '') + `<span class="dr-chev">${I.chevron}</span>`;
    const aria = esc(value != null && !locked ? `${title}, ${value}` : title);
    return href ? `<a class="dr-row" href="${href}" target="_blank" rel="noopener" aria-label="${aria}">${t}<span class="dr-title">${esc(title)}</span>${end}</a>`
      : `<div class="dr-row" role="button" tabindex="0" aria-label="${aria}" data-act="${act}">${t}<span class="dr-title">${esc(title)}</span>${end}</div>`;
  };
  const seasonOn = () => SeasonTheme.enabled;

  const render = () => {
    const accent = TIER_COLOR[game.difficulty], ink = TIER_INK[game.difficulty];
    wrap.style.setProperty('--accent', accent); wrap.style.setProperty('--accent-ink', ink);
    // Theme.page mixed 3% with the accent, then 94% with #161616.
    d.style.setProperty('--dr-bg', mix(mix(LevelTheme.page(), accent, 0.03), '#161616', 0.94));
    const locked = !ctx.premium;
    const album = game.album?.name;
    const privacy = !ctx.premium && window.googlefc && typeof window.googlefc.showRevocationMessage === 'function';
    body.innerHTML = `
      <div class="dr-head"><h2>Settings</h2><button class="dr-x" data-press data-act="close" aria-label="Close">${I.x}</button></div>
      ${ctx.premium ? '' : `<button class="dr-premium" data-press data-act="premium">${glyph('crown')}<span>Go Premium</span></button>`}
      ${label('Game')}
      ${group([
        linkRow('genres', 'Genre', tile('genre'), { value: game.category === 'all' ? 'All genres' : game.category }),
        linkRow('artist', 'Artist', tile('artist'), { value: game.artist || 'Any artist', locked }),
        linkRow('album', 'Album', tile('artwork'), { value: album ? albumDisplayName(album) : 'Any album', locked }),
        toggleRow('hint', 'Hint', tile('hint'), S('hint', false)),
        toggleRow('easySearch', 'Easy search', tile('search'), S('easySearch', true)),
      ])}
      ${note('Level and years are picked on Home. Hint gives one free artist hint a round; easy search suggests only songs in play.')}
      ${label('Display')}
      ${group([
        toggleRow('artwork', 'Reveal artwork', tile('artwork'), S('artwork', true)),
        toggleRow('motion', 'Animations', tile('animations'), S('motion', true)),
        toggleRow('levelColours', 'Level colours', tile('colours'), LevelTheme.enabled),
        toggleRow('seasonTheme', 'Seasonal theme', tile('colours'), seasonOn()),
        toggleRow('glow', 'Accent glow', tile('glow'), S('glow', false)),
        toggleRow('spotlight', 'Spotlight', tile('spotlight'), S('spotlight', 'off') !== 'off'),
        toggleRow('cleanDisplay', 'Clean display', tile('clean'), S('cleanDisplay', false)),
        desktop() ? toggleRow('phoneView', 'Phone size', svgTile(I.phone), viewMode() === 'phone') : '',
      ])}
      ${note('Clean display is for streams: only the game on screen.')}
      ${label('General')}
      ${group([
        toggleRow('haptics', 'Haptics', tile('haptics'), S('haptics', true)),
        toggleRow('sounds', 'Sounds', svgTile(I.sound), S('sounds', true)),
        `<div class="dr-row dr-vol">${svgTile(I.sound)}<input type="range" min="0" max="1" step="0.02" value="${S('volume', 0.28)}" aria-label="Volume" data-vol></div>`,
        linkRow('faq', 'How to play', tile('howto')),
        ctx.premium ? '' : linkRow('restore', restoring ? 'Restoring…' : 'Restore purchases', tile('restore')),
        privacy ? linkRow('privacy', 'Privacy choices', tile('privacy')) : '',
        linkRow('getapp', 'Get the app', svgTile(I.apple), { href: LINKS.get }),
      ])}
      <p class="dr-note dr-links"><a href="/privacy" target="_blank" rel="noopener">Privacy</a><span aria-hidden="true">·</span><a href="/support" target="_blank" rel="noopener">Support</a></p>`;
  };

  render();
  document.body.appendChild(wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('in')));
  const offAccount = account.onChange(() => render());
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  let closing = false;
  const close = then => {
    if (closing) return; closing = true; offAccount(); document.removeEventListener('keydown', onKey);
    wrap.classList.remove('in');
    setTimeout(() => { wrap.remove(); ctx.tabs?.refresh(); then && then(); }, 260);
  };
  wrap.querySelector('.scrim').addEventListener('click', () => close());

  function flip(k) {
    switch (k) {
      case 'levelColours': LevelTheme.enabled = !LevelTheme.enabled; break;
      case 'spotlight': settings.set('spotlight', S('spotlight', 'off') === 'off' ? 'simple' : 'off'); break;
      case 'seasonTheme': {
        // Off is the plain green app all year: the palette, banners and snow go (season.js re-applies itself).
        SeasonTheme.enabled = !SeasonTheme.enabled;
        break;
      }
      case 'phoneView': setViewMode(viewMode() === 'phone' ? 'pc' : 'phone'); break;
      case 'cleanDisplay': {
        const v = !S('cleanDisplay', false); settings.set('cleanDisplay', v);
        // Clean display was switched on: the menu gets out of the way.
        if (v) { close(); ctx.toast('Clean display. Tap the faint eye in the corner to bring everything back.', 5); }
        break;
      }
      default: settings.set(k, !S(k, { hint: false, easySearch: true, artwork: true, motion: true, glow: false, haptics: true, sounds: true }[k]));
    }
    sound.enabled = S('sounds', true);
    ctx.refresh(); ctx.tabs?.refresh();
    if (k === 'sounds' && S('sounds', true)) sound.click();
  }

  body.addEventListener('click', e => {
    const tg = e.target.closest('[data-toggle]');
    // A tap gives Haptics.select, with the setting as it was.
    if (tg) { Haptics.select(); flip(tg.dataset.toggle); if (!closing) render(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act !== 'close' && act !== 'premium') Haptics.select();
    if (act === 'close') close();
    else if (act === 'premium') close(() => ctx.openPremium(null));
    else if (act === 'genres') close(() => ctx.openGenres());
    else if (act === 'artist') ctx.premium ? close(() => ctx.openArtists()) : close(() => ctx.openPremium('artist'));
    else if (act === 'album') ctx.premium ? close(() => ctx.openAlbums()) : close(() => ctx.openPremium('album'));
    else if (act === 'faq') close(() => ctx.openFAQ());     // (iOS shows it over the menu; on the web sheets sit under it)
    else if (act === 'restore') restore();
    else if (act === 'privacy') { try { window.googlefc.showRevocationMessage(); } catch (err) {} }
  });
  body.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-toggle], [data-act]')) { e.preventDefault(); e.target.click(); } });
  body.addEventListener('input', e => { if (e.target.dataset.vol !== undefined) { settings.set('volume', +e.target.value); ctx.player.setVolume(+e.target.value); } });
  async function restore() {
    if (restoring) return;
    if (!account.signedIn) { ctx.toast('Sign in with the account you bought premium on.'); return close(() => ctx.signIn()); }
    restoring = true; render();
    let has = false;
    try { has = await account.refreshPremium(); } catch (err) {}
    restoring = false;
    ctx.toast(has ? 'Premium restored.' : 'No premium was found for this account.');
    ctx.refresh(); render();
  }
  return { close };
}
