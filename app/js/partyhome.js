// The Party tab (iOS Home/PartyHome.swift), GeoGuessr-style: the crew
// celebrating under the play-button balloon, then the two ways in — start a
// room (a premium perk) or join one with its five-letter code (free for
// everyone). JoinCodeSheet is the code's bottom sheet. Sizes are SwiftUI points.
//
//   mountPartyHome(container, ctx) -> { destroy() }   the tab page (tabs.js)
//   openJoinCode(ctx, onJoin)                          the "ENTER CODE" sheet on its own
import { el, esc, pushView, popView, settings } from './ui.js';
import { Haptics } from './haptics.js';
import { normaliseCode } from './partygame.js';

const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.2 7.6l4.6 3.6L12 4.6l4.2 6.6 4.6-3.6-1.7 10.6H4.9zM5 19.6h14v2H5z"/></svg>';
/** Code letters scattered across the join button, as GeoGuessr scatters digits: letter, x, y, rotation, size. */
const MARKS = [['B', 0.06, 0.28, -14, 26], ['7', 0.15, 0.74, 10, 30], ['K', 0.28, 0.2, 8, 20], ['Q', 0.74, 0.22, -8, 22],
  ['4', 0.86, 0.7, 12, 30], ['M', 0.95, 0.3, -10, 24], ['2', 0.66, 0.84, 6, 18], ['X', 0.36, 0.86, -6, 18]];
const haptics = () => settings.get('haptics', true) !== false;

export function mountPartyHome(container, ctx) {
  let season = null, backdrop = null, gone = false, sheet = null;
  const crewName = () => (season?.Season?.on ? 'party-crew' + season.Season.suffix : 'party-crew');
  const canHost = () => !!ctx.premium;
  container.classList.add('phome-page');
  const node = el(`<div class="phome">
    <h1 class="tabtitle">PARTY</h1>
    <div class="phome-col">
      <div class="phome-crew" aria-hidden="true"><i class="glow"></i><img alt="" src="/app/img/games/${crewName()}.webp"></div>
      <button class="phome-create" data-press data-act="create">
        <img class="pop" alt="" src="/app/img/games/game-icon-popper.webp">
        <span class="tx"><b>CREATE A GAME</b><small class="sub"></small></span>
      </button>
      <button class="phome-join" data-press data-act="join">
        <span class="marks" aria-hidden="true">${MARKS.map(([c, x, y, r, s]) => `<i style="left:${x * 100}%;top:${y * 100}%;font-size:${s}px;transform:translate(-50%,-50%) rotate(${r}deg)">${c}</i>`).join('')}</span>
        <span class="tx"><b>JOIN A GAME</b><small>Enter code</small></span>
      </button>
    </div></div>`);
  container.appendChild(node);
  const paintSub = () => {
    node.querySelector('.phome-create .sub').innerHTML = canHost() ? 'Get a code · up to 50 players' : `<i class="crown">${CROWN}</i>Premium · up to 50 players`;
  };
  paintSub();
  // The season's crew and backdrop (SeasonBackdrop), when the season engine is there.
  import('./season.js').then(m => {
    if (gone) return;
    season = m;
    node.querySelector('.phome-crew img').src = `/app/img/games/${crewName()}.webp`;
    node.querySelector('.phome-crew').classList.toggle('season', !!m.Season?.on);
    try { backdrop = m.mountBackdrop?.(container); if (backdrop?.node) { backdrop.node.classList.add('phome-backdrop'); container.prepend(backdrop.node); } } catch (e) {}
  }).catch(() => {});
  node.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'create') {
      if (haptics()) Haptics.press?.(0.7);
      // Without premium Create opens the premium sheet on the hosting perk (StageView.createParty).
      if (!canHost()) ctx.openPremium('host'); else ctx.openParty({ host: true });
    }
    if (b.dataset.act === 'join') {
      if (haptics()) Haptics.press?.(0.6);
      sheet = openJoinCode(ctx, code => ctx.openParty({ join: code }), () => { sheet = null; });
    }
  });
  const offAccount = ctx.account?.onChange ? ctx.account.onChange(paintSub) : () => {};
  // Localhost knob: ?showJoinCode opens the code sheet at once (the iPhone's tap on JOIN A GAME).
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && new URLSearchParams(location.search).has('showJoinCode')) setTimeout(() => node.querySelector('.phome-join')?.click(), 300);
  return {
    destroy() { gone = true; offAccount?.(); sheet?.close(); try { backdrop?.destroy?.(); } catch (e) {} node.remove(); container.classList.remove('phome-page'); },
  };
}

/**
 * Five letters and Join: "ENTER CODE", the box (filtered live to the code's alphabet, capitals, 5 letters), Cancel
 * and JOIN. The keyboard waits for a tap on the box (c6a4d78). The code goes out once the sheet has gone.
 */
export function openJoinCode(ctx, onJoin, onClosed) {
  let code = '', pending = null, closed = false;
  const view = el(`<div class="view sheet pjoin-sheet" role="dialog" aria-modal="true" aria-label="Enter code"><div class="scrim"></div>
    <div class="sheet-body"><i class="grab"></i><div class="in">
      <h2>ENTER CODE</h2>
      <label class="box"><input class="code mono" placeholder="ABCDE" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="5" enterkeyhint="join" aria-label="Room code"></label>
      <div class="btns"><button class="cancel" data-press data-act="cancel">Cancel</button><button class="go" data-press data-act="go" disabled>JOIN</button></div>
    </div></div></div>`);
  const input = view.querySelector('.code'), go = view.querySelector('.go'), box = view.querySelector('.box');
  const paint = () => { const full = code.length === 5; box.classList.toggle('full', full); go.classList.toggle('on', full); go.disabled = !full; };
  const close = () => {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey);
    input.blur();
    popView(view);
    // The code is handed over only after the sheet has gone (pendingCode in onDismiss).
    setTimeout(() => { onClosed?.(); if (pending) { const c = pending; pending = null; onJoin(c); } }, 260);
  };
  const join = () => { if (code.length !== 5) return; pending = code; close(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  input.addEventListener('input', () => { const n = normaliseCode(input.value); if (n !== input.value) input.value = n; code = n; paint(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
  view.addEventListener('click', e => {
    if (e.target.classList.contains('scrim')) { close(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    ctx.sound?.click?.();
    if (b.dataset.act === 'cancel') close();
    if (b.dataset.act === 'go') join();
  });
  document.addEventListener('keydown', onKey);
  pushView(view);
  return { node: view, close };
}
