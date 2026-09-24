// Party on the web: the hub, the waiting room, the count, the round, the
// board and the podium — the apps' PartyView screen for screen, drawn with
// the stage's tokens. The room and the wire live in partygame.js; this file
// renders what the game says and tells it what was pressed.
import { PartyGame, MAX_PLAYERS, ROUND_OPTIONS, DIFFICULTIES, normaliseCode } from './partygame.js';
import { ERAS } from './pool.js';
import { matches } from './matcher.js';
import { confetti } from './confetti.js';
import { el, toast, pushView, popView, face, hueColor, TIER_COLOR, TIER_INK, cap, esc, art } from './ui.js';

const CSS = new URL('../css/party.css', import.meta.url).href;
const css = () => { if (!document.getElementById('party-css')) document.head.appendChild(el(`<link id="party-css" rel="stylesheet" href="${CSS}">`)); };

// SF Symbols, drawn — the glyphs the apps draw by hand.
const svg = (s, body, extra = '') => `<svg viewBox="0 0 20 20" width="${s}" height="${s}" aria-hidden="true" ${extra}>${body}</svg>`;
const line = (s, body, w = 2) => svg(s, body, `fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`);
const I = {
  x: (s, w = 2) => line(s, '<path d="M3 3l14 14M17 3L3 17"/>', w),
  chevron: s => line(s, '<path d="M6 2l8.4 8L6 18"/>'),
  check: (s, w = 3) => line(s, '<path d="M2 11l6 6L18.4 4"/>', w),
  plus: s => line(s, '<path d="M10 1v18M1 10h18"/>', 2.5),
  crown: s => svg(s, '<path fill="currentColor" d="M0 7l5.4 5.4L10 2.4l4.6 10L20 7l-2.8 13H2.8z"/>'),
  lock: s => svg(s, '<rect fill="currentColor" x="2.4" y="8.4" width="15.2" height="11" rx="2.4"/><path d="M5.5 9V6.5a4.5 4.5 0 0 1 9 0V9" fill="none" stroke="currentColor" stroke-width="2.6"/>'),
  people: s => `<svg viewBox="0 0 32 20" width="${s * 1.6}" height="${s}" aria-hidden="true" fill="currentColor"><circle cx="6.4" cy="5.2" r="3"/><path d="M.6 16a5.8 5.8 0 0 1 11.6 0z"/><circle cx="25.6" cy="5.2" r="3"/><path d="M19.8 16a5.8 5.8 0 0 1 11.6 0z"/><circle cx="16" cy="5.2" r="3.8"/><path d="M8.8 19a7.2 7.2 0 0 1 14.4 0z"/></svg>`,
  person: s => svg(s, '<circle fill="currentColor" cx="10" cy="5.6" r="4.4"/><path fill="currentColor" d="M1.6 19a8.4 8.4 0 0 1 16.8 0z"/>'),
  bolt: s => svg(s, '<path fill="currentColor" d="M12 0L3 11.6h6.6L7.6 20l10-12H11z"/>'),
  fwd: s => svg(s, '<path fill="currentColor" d="M0 0l14.4 10L0 20z"/><rect fill="currentColor" x="15.6" width="4.4" height="20"/>'),
  wifi: s => line(s, '<path d="M2 13a11.3 11.3 0 0 1 16 0M5.6 16.2a6.2 6.2 0 0 1 8.8 0M10 2.4v6.4"/><circle cx="10" cy="19" r=".7" fill="currentColor"/><circle cx="10" cy="11.6" r=".7" fill="currentColor"/>', 2.5),
  hash: s => line(s, '<path d="M7 1L4.4 19M15.6 1L13 19M1.6 7h17.4M1 13.6h17.4"/>'),
  bars: s => svg(s, '<rect fill="currentColor" x="1" y="11" width="4.8" height="9" rx="1"/><rect fill="currentColor" x="7.6" y="6" width="4.8" height="14" rx="1"/><rect fill="currentColor" x="14.2" width="4.8" height="20" rx="1"/>'),
  timer: s => line(s, '<circle cx="10" cy="11.6" r="7.6"/><path d="M10 11.6l3.6-4.4M8 1.2h4"/>', 1.8),
  cal: s => svg(s, '<rect x="1" y="2.4" width="18" height="17" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/><rect fill="currentColor" x="1" y="2.4" width="18" height="4.8"/><rect fill="currentColor" x="4" y="10" width="3.6" height="3.2"/><rect fill="currentColor" x="8.4" y="10" width="3.6" height="3.2"/><rect fill="currentColor" x="12.8" y="10" width="3.6" height="3.2"/>'),
  notes: s => svg(s, '<path d="M0 3h10M0 9h10M0 15h10M18 1v14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle fill="currentColor" cx="15.6" cy="16" r="2.8"/>'),
  share: s => line(s, '<path d="M4 8.4h2.8M4 8.4v10h12v-10h-2.8M10 12.8V1.6M6.4 5.2L10 1.6l3.6 3.6"/>', 2.6),
  search: s => line(s, '<circle cx="8.5" cy="8.5" r="6"/><path d="M13 13l6 6"/>', 2.2),
};
const dots = () => '<span class="dots"><i></i><i></i><i></i></span>';
const row = (icon, text) => `<div class="r"><i>${icon}</i>${esc(text)}</div>`;

/** Open the party over the stage. Returns the view; its X pops it, leaves the room and stops the audio. */
export function mountParty(ctx) {
  const { pool, player, sound, account } = ctx;
  css();
  const game = new PartyGame(pool);
  const view = el('<div class="view party"><div class="pv"></div></div>');
  const pv = view.querySelector('.pv');
  let screen = null, key = '', raf = 0, recorded = '', clip = { round: -1, error: null }, tick = -1;

  const pf = (p, size) => face(p.name, game.avatarOf(p), hueColor(p.hue), size);
  const myColor = () => hueColor(game.mine?.hue || 1);
  /** A big room can't put every face between the margins: as many as fit and a count of the rest. */
  const strip = (big, small) => { const n = game.players.length, shown = n <= 10 ? game.players : game.players.slice(0, 9); return { size: n > 6 ? small : big, tight: n > 6, shown, rest: n - shown.length }; };
  const overflow = (s) => s.rest ? `<span class="ov" style="width:${s.size}px;height:${s.size}px;font-size:${Math.round(s.size * .34)}px">+${s.rest}</span>` : '';
  const genreCounts = (() => { const c = new Map(); for (const s of pool.songs) if (!s.sceneOnly) c.set(s.category, (c.get(s.category) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1]); })();

  // ---- the frame: one screen a phase, crossfaded ----
  const paint = () => {                                    // the round's tier colours the whole view
    const t = ['countdown', 'playing', 'result'].includes(game.phase) ? game.tier : 'easy';
    pv.style.setProperty('--pc', TIER_COLOR[t]); pv.style.setProperty('--pc-ink', TIER_INK[t]);
  };
  const show = () => {
    paint();
    if (game.phase !== key) { key = game.phase; swap(SCREENS[key]()); onPhase(key); }
    else screen.update?.();
  };
  const swap = s => {
    const old = screen; screen = s; pv.appendChild(s.node);
    requestAnimationFrame(() => s.node.classList.add('in'));
    if (old) { old.gone?.(); old.node.classList.remove('in'); old.node.style.pointerEvents = 'none'; setTimeout(() => old.node.remove(), 280); }
  };
  const onPhase = k => {
    if (k === 'countdown') { player.stop(); clip = { round: -1, error: null }; tick = -1; if (game.song) player.prepare(game.song.id, game.song.preview).catch(() => {}); }
    else if (k === 'playing') startClip();
    else if (k === 'result') { player.stop(); sound.reveal(); }
    else if (k === 'finished') { player.stop(); record(); }
    else player.stop();
  };
  /** The clip from the preview's start at roundStartedAt, wherever this browser joins in — everyone hears the same bar. */
  const startClip = async () => {
    const s = game.song; if (!s || game.phase !== 'playing' || clip.round === game.round) return;
    clip = { round: game.round, error: null };
    try { await player.prepare(s.id, s.preview); } catch (e) {}
    const at = game.elapsed;
    if (game.phase !== 'playing' || game.song?.id !== s.id || at >= game.window) return;
    if (!await player.play(s.id, s.preview, game.window - at, at)) clip.error = player.lastError;
  };
  const replay = async () => {
    const s = game.song; if (!s || game.phase !== 'playing' || player.playing) return;
    sound.click(); clip.error = null;
    const at = game.elapsed; if (at >= game.window) return;
    if (!await player.play(s.id, s.preview, game.window - at, at)) clip.error = player.lastError;
  };
  // 60 fps: the countdown number, the ring, the seconds.
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (game.phase === 'countdown') { const n = game.countdown; if (n !== tick) { tick = n; screen.count?.(n); if (n > 0) sound.tick(); } }
    else if (game.phase === 'playing') { if (clip.round !== game.round) startClip(); screen.time?.(game.progress, game.secondsLeft, player.playing, clip.error); }
  };
  /** Bank the party once per game, for everyone. */
  const record = () => {
    const me = game.mine; if (!me || !game.gameId || recorded === game.gameId) return;
    recorded = game.gameId;
    account.recordParty(game.sorted[0]?.id === game.sid, me.score, me.roundsWon);
  };
  const off = () => { cancelAnimationFrame(raf); unGame(); unAcc(); screen?.gone?.(); player.stop(); };
  const close = () => { off(); popView(view); game.leave(); };

  const needName = () => { if (account.name.trim()) return false; ctx.openProfile(); return true; };
  const hostParty = () => {
    sound.click(); if (needName()) return;
    if (!ctx.premium) toast('Hosting is for premium members in the apps. Open here while the web is private.');
    game.host(account.name.trim(), account.avatar);
  };
  const joinParty = code => { sound.click(); if (needName()) return; game.join(code, account.name.trim(), account.avatar); };

  // ---- entry ----
  function hub() {
    const name = account.name.trim(), prem = !!ctx.premium;
    const who = name ? face(name, account.avatar, TIER_COLOR.easy, 46) : `<span class="face" style="width:46px;height:46px;background:rgba(255,255,255,.06);color:var(--muted)">${I.person(18)}</span>`;
    const node = el(`<div class="pscreen hub">
      <div class="pbar"><h1>Party</h1>${prem ? '' : `<button class="prem-pill" data-press>${I.crown(11)}Premium</button>`}<button class="closedot" aria-label="Close">${I.x(13)}</button></div>
      <h2 class="ptitle">Play with friends</h2>
      <p class="psub">Everyone hears the same clip at the same moment. The fastest right answer scores the most.</p>
      <button class="whoami" data-press>${who}<span class="who"><span class="k">PLAYING AS</span><b class="${name ? '' : 'dim'}">${esc(name || 'Add your name')}</b></span><span class="hint">${account.avatar ? 'Edit' : 'Add a photo'}</span><i class="chev">${I.chevron(11)}</i></button>
      <button class="hostcard${prem ? ' prem' : ''}" data-press><span class="ic">${prem ? I.people(17) : I.lock(16)}</span><span class="txt"><b>Host a party</b><span>${prem ? 'Get a code, invite up to 49 friends.' : 'For premium members in the apps. Open here while the web is private.'}</span></span>${prem ? `<i class="chev">${I.chevron(13)}</i>` : '<span class="badge">PREMIUM</span>'}</button>
      <div class="or"><i></i><span>or</span><i></i></div>
      <form class="coderow" autocomplete="off"><input class="code mono" placeholder="ROOM CODE" maxlength="5" autocapitalize="characters" autocorrect="off" spellcheck="false" aria-label="Room code"><button type="submit" class="join">Join</button></form>
      <div class="grow"></div></div>`);
    const form = node.querySelector('.coderow'), input = node.querySelector('.code');
    input.addEventListener('input', () => { input.value = normaliseCode(input.value); form.classList.toggle('ready', input.value.length === 5); });
    form.addEventListener('submit', e => { e.preventDefault(); if (input.value.length === 5) joinParty(input.value); });
    node.querySelector('.closedot').onclick = close;
    node.querySelector('.prem-pill')?.addEventListener('click', () => { sound.click(); ctx.openPremium ? ctx.openPremium('party') : toast('Hosting is a premium perk in the apps.'); });
    node.querySelector('.whoami').onclick = () => { sound.click(); ctx.openProfile(); };
    node.querySelector('.hostcard').onclick = hostParty;
    return { node };
  }

  function connecting() {
    const node = el(`<div class="pscreen center"><div class="grow"></div><div class="pulse"><i></i><b></b></div><p class="mut" style="margin:0;font-size:15px;font-weight:600">${game.isHost ? 'Opening your room…' : 'Finding the party…'}</p><div class="grow"></div><button class="cancel">Cancel</button></div>`);
    node.querySelector('.cancel').onclick = close;
    return { node };
  }

  // ---- the waiting room ----
  function lobby() {
    const node = el(`<div class="pscreen lobby">
      <div class="pbar"><h1>Waiting room</h1><button class="closedot" aria-label="Close">${I.x(13)}</button></div>
      <div class="scroll">
        <div class="codeblock"><span class="kicker">Room code</span><div class="bigcode mono">${game.code}</div><button class="share" data-press>${I.share(12)}Share the code</button></div>
        <div class="countrow"><span class="who"></span><span class="room">room for ${MAX_PLAYERS}</span></div>
        <div class="seats"></div>
        <div class="card settings"${game.isHost ? ' data-press' : ''}></div>
        <div style="height:16px"></div>
      </div>
      <div class="foot"></div></div>`);
    const seats = node.querySelector('.seats'), who = node.querySelector('.who'), card = node.querySelector('.settings'), foot = node.querySelector('.foot');
    const seen = new Set(game.players.map(p => p.id)); let sig = '';
    node.querySelector('.closedot').onclick = close;
    node.querySelector('.share').onclick = async () => {
      sound.click();
      const text = `Join my Songspot party — open Songspot, tap Party and enter the code ${game.code}`;
      if (navigator.share) { try { await navigator.share({ text }); } catch (e) {} }
      else { try { await navigator.clipboard.writeText(game.code); toast('Code copied'); } catch (e) { toast(game.code); } }
    };
    if (game.isHost) card.onclick = () => { sound.click(); openSettings(); };
    const update = () => {
      const ps = game.players, n = ps.length, s = game.settings;
      who.innerHTML = `<b class="mono n">${n}</b> ${n === 1 ? 'player' : 'players'}`;
      // Newcomers pop in; the empty seats after them wait for the next one.
      const k = ps.map(p => p.id + p.name + p.hue + p.host).join('|') + '|' + game.presence.size;
      if (k !== sig) {
        sig = k;
        const empty = n < MAX_PLAYERS ? Math.max(1, 4 - n) : 0;
        seats.innerHTML = ps.map(p => {
          const me = p.id === game.sid, fresh = !seen.has(p.id); seen.add(p.id);
          return `<div class="seat${me ? ' me' : ''}${fresh ? ' pop' : ''}" style="--c:${hueColor(p.hue)}"><div class="av">${pf(p, 60)}<i class="ring"></i>${p.host ? `<span class="crown">${I.crown(10)}</span>` : ''}</div><span class="nm">${esc(p.name)}</span><span class="sub">${me ? 'you' : p.host ? 'host' : ''}</span></div>`;
        }).join('') + `<div class="seat empty"><div class="av">${I.plus(14)}</div><span class="nm">waiting</span><span class="sub">${dots()}</span></div>`.repeat(empty);
      }
      card.innerHTML = (game.isHost ? `<div class="hd">GAME SETTINGS<span class="edit">Edit</span><i class="chev">${I.chevron(10)}</i></div>` : '')
        + row(I.hash(12), `${s.rounds} rounds`) + row(I.bars(12), s.difficulty === 'mixed' ? 'Easy to Impossible' : cap(s.difficulty))
        + row(I.timer(12), `${game.window} seconds a song`) + row(I.cal(12), s.era === 'all' ? 'Any year' : 'The ' + s.era) + row(I.notes(12), game.songsLabel);
      if (game.isHost) {
        const can = game.canStart;
        foot.innerHTML = `<button class="start${can ? ' on' : ''}"${can ? ' data-press' : ' disabled'}>${can ? 'Start the party' : 'Waiting for players'}</button>`;
        foot.querySelector('.start').onclick = () => { sound.click(); if (!game.start()) toast('Not enough songs for those settings.'); };
      } else foot.innerHTML = `<div class="waitline">${dots()}Waiting for ${esc(game.host?.name || 'the host')} to start</div>`;
    };
    update();
    return { node, update };
  }

  /** The host's controls, on their own sheet so a full room never buries them. */
  function openSettings() {
    const sheet = el(`<div class="view sheet"><div class="scrim"></div><div class="sheet-body psheet" style="--pc:${TIER_COLOR.easy};--pc-ink:${TIER_INK.easy}"><div class="grip"></div><div class="shead"><h2>Game settings</h2><button class="done">Done</button></div><div class="card pickers"></div></div></div>`);
    const body = sheet.querySelector('.pickers');
    const picker = (title, opts, value, k) => `<div class="picker" data-k="${k}"><span class="k">${title}</span><div class="opts">${opts.map(([v, l]) => `<button data-v="${v}"${String(v) === String(value) ? ' class="on"' : ''}>${l}</button>`).join('')}</div></div>`;
    const render = () => {
      const s = game.settings;
      body.innerHTML = picker('Rounds', ROUND_OPTIONS.map(n => [n, n]), s.rounds, 'rounds')
        + picker('Difficulty', DIFFICULTIES, s.difficulty, 'difficulty')
        + picker('Years', [['all', 'Any'], ...ERAS.map(e => [e, e.length > 3 ? e.slice(2) : e])], s.era, 'era')
        + `<button class="songsrow" data-press><i>${I.notes(13)}</i>Songs<b>${esc(game.songsLabel)}</b><i class="chev">${I.chevron(11)}</i></button>`;
      body.querySelectorAll('.picker button').forEach(b => b.onclick = () => { sound.click(); const k = b.closest('.picker').dataset.k; game.setSettings({ [k]: k === 'rounds' ? Number(b.dataset.v) : b.dataset.v }); render(); });
      body.querySelector('.songsrow').onclick = () => { sound.click(); openGenres(render); };
    };
    render();
    const done = () => { sound.click(); popView(sheet); };
    sheet.querySelector('.done').onclick = done; sheet.querySelector('.scrim').onclick = done;
    pushView(sheet);
  }

  /** Genres, biggest first, with a search box — presented from inside the settings sheet, as on the phone. */
  function openGenres(onPick) {
    const sheet = el(`<div class="view sheet"><div class="scrim"></div><div class="sheet-body psheet" style="--pc:${TIER_COLOR.easy};--pc-ink:${TIER_INK.easy}"><div class="grip"></div><div class="shead"><h2>Songs</h2><button class="done">Done</button></div><div class="gsearch">${I.search(12)}<input placeholder="Search genres" autocomplete="off" spellcheck="false" aria-label="Search genres"></div><div class="glist"></div></div></div>`);
    const list = sheet.querySelector('.glist'), input = sheet.querySelector('input');
    const render = () => {
      const q = input.value.trim().toLowerCase();
      const rows = (q ? [] : [['all', null, 'All genres']]).concat(genreCounts.filter(([c]) => c.toLowerCase().includes(q)).map(([c, n]) => [c, n, c]));
      list.innerHTML = rows.map(([k, n, l]) => `<button class="genre${game.settings.category === k ? ' on' : ''}" data-k="${esc(k)}"><span>${esc(l)}</span>${n == null ? '' : `<b class="mono">${n}</b>`}</button>`).join('');
      list.querySelectorAll('.genre').forEach(b => b.onclick = () => { sound.click(); game.setSettings({ category: b.dataset.k }); onPick(); popView(sheet); });
    };
    input.oninput = render; render();
    const done = () => { sound.click(); popView(sheet); };
    sheet.querySelector('.done').onclick = done; sheet.querySelector('.scrim').onclick = done;
    pushView(sheet);
  }

  // ---- the round ----
  const rhead = (extra = '') => `<div class="rhead"><div class="rnum"><span class="kicker">Round</span><div><b class="mono">${game.round + 1}</b><span class="mono of">/ ${game.settings.rounds}</span></div></div><span class="tierpill">${cap(game.tier)}</span>${extra}</div>`;

  /** Its own screen between rounds: nothing of the round shows until the count hits zero. The number slams in on every tick. */
  function countdown() {
    const s = strip(36, 28);
    const node = el(`<div class="pscreen count">${rhead()}<div class="grow"></div><span class="getready">${game.round === 0 ? 'GET READY' : 'NEXT UP'}</span><div class="cnum">3</div><p class="hint">${cap(game.tier)} · listen, then name it</p><div class="grow"></div><div class="strip${s.tight ? ' tight' : ''}">${s.shown.map(p => pf(p, s.size)).join('')}${overflow(s)}</div></div>`);
    return { node, count(n) { node.querySelector('.cnum').replaceWith(el(`<div class="cnum${n ? '' : ' go'}">${n || 'GO'}</div>`)); } };
  }

  function playing() {
    const C = 2 * Math.PI * 93;
    const node = el(`<div class="pscreen play">${rhead(`<button class="closedot" aria-label="Close">${I.x(12)}</button>`)}<div class="grow"></div>
      <button class="tring" aria-label="Replay the clip"><svg viewBox="0 0 196 196"><circle class="track" cx="98" cy="98" r="93"/><circle class="arc" cx="98" cy="98" r="93" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><div class="inner"><div class="eqslot"><div class="eq"><i></i><i></i><i></i><i></i><i></i></div></div><div class="secs">${game.window}</div><span class="rlbl">tap to replay</span></div></button>
      <div class="strip answered"></div><div class="grow"></div><div class="bottom"></div>${game.isHost ? `<button class="skipbtn">${I.fwd(11)}Skip this one</button>` : ''}</div>`);
    const arc = node.querySelector('.arc'), secs = node.querySelector('.secs'), lbl = node.querySelector('.rlbl'), eqslot = node.querySelector('.eqslot'), eq = node.querySelector('.eq'), ans = node.querySelector('.answered'), bottom = node.querySelector('.bottom');
    node.querySelector('.closedot').onclick = close;
    node.querySelector('.tring').onclick = replay;
    node.querySelector('.skipbtn')?.addEventListener('click', () => { sound.click(); game.skip(); });
    let lastSec = -1, lastLbl = '', scope = null, locked = false, ansSig = '';
    // Suggestions come from this round's difficulty, years and genre, plus the answer itself, so it is always in the list.
    const scopeSongs = () => { if (!scope) { scope = pool.filter(game.tier, game.settings.era, game.settings.category); const a = game.answerRow; if (a && !scope.includes(a)) scope = [...scope, a]; } return scope; };

    const guessRow = () => {
      bottom.innerHTML = `<div class="guessrow"><form class="field" autocomplete="off">${I.search(15)}<input placeholder="Name that track" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Your guess"></form><button class="guessbtn empty">Guess</button><div class="hits" hidden></div></div>`;
      const form = bottom.querySelector('.field'), input = form.querySelector('input'), btn = bottom.querySelector('.guessbtn'), hits = bottom.querySelector('.hits');
      let found = [];
      const refresh = () => {
        const q = input.value.trim(); btn.classList.toggle('empty', !q);
        found = q ? pool.search(q, 5, scopeSongs()) : []; hits.hidden = !found.length;
        hits.innerHTML = found.map((s, i) => `<div class="hit" data-i="${i}"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></div>`).join('');
      };
      const wrong = () => { sound.click(); node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake'); input.value = ''; refresh(); };
      const right = () => { sound.click(); game.submit(game.song.id, input.value.trim()); input.blur(); lockedIn(); };
      const pick = s => { const a = game.answerRow; if (!s || !a) return; (s.id === a.id || matches(s, a)) ? right() : wrong(); };
      // Judged the way the solo search judges: the best match for what was typed is the answer, so a near-miss still counts.
      const typed = () => { const t = input.value.trim(), a = game.answerRow; if (!t || !a) return; const best = t.length >= 3 ? pool.search(t, 1, scopeSongs())[0] : null; (matches(t, a) || best?.id === a.id) ? right() : wrong(); };
      input.oninput = refresh;
      hits.onpointerdown = e => { const h = e.target.closest('.hit'); if (h) { e.preventDefault(); pick(found[+h.dataset.i]); } };
      form.onsubmit = e => { e.preventDefault(); typed(); };
      btn.onclick = typed;
      setTimeout(() => input.focus(), 300);
    };
    const lockedIn = () => {
      locked = true; const pts = game.myPoints;
      bottom.innerHTML = `<div class="locked" style="--c:${myColor()}"><span class="ic">${I.check(18, 3)}</span><span class="txt"><b>Locked in</b><span class="w"></span></span>${pts == null ? '' : `<b class="pts mono">+${pts}</b>`}</div>`;
      patchLocked();
    };
    const patchLocked = () => {
      const w = bottom.querySelector('.locked .w'); if (w) w.textContent = game.answered.length < game.players.length ? 'Waiting for the others…' : "Everyone's in!";
      const p = bottom.querySelector('.pts'), pts = game.myPoints;
      if (p && pts != null && p.textContent !== '+' + pts) p.textContent = '+' + pts;     // the host's word replaces my estimate
    };
    const update = () => {
      // Everyone's picture; the ones who have answered light up.
      const s = strip(34, 26), ids = s.shown.map(p => p.id).join() + '|' + s.rest + '|' + game.presence.size;
      if (ids !== ansSig) {
        ansSig = ids; ans.className = `strip answered${s.tight ? ' tight' : ''}`;
        ans.innerHTML = s.shown.map(p => `<span class="a" style="--c:${hueColor(p.hue)}">${pf(p, s.size)}<i class="tick">${I.check(6, 2.5)}</i></span>`).join('') + overflow(s);
      }
      s.shown.forEach((p, i) => ans.children[i]?.classList.toggle('done', !!p.answered));
      if (game.iAnswered && !locked) lockedIn(); else if (locked) patchLocked();
    };
    const time = (progress, left, live, err) => {
      arc.style.strokeDashoffset = C * progress;
      if (left !== lastSec) { lastSec = left; secs.textContent = left; }
      eqslot.classList.toggle('on', live); eq.classList.toggle('on', live);
      const l = live ? 'listening' : err ? 'no sound — tap to retry' : 'tap to replay';
      if (l !== lastLbl) { lastLbl = l; lbl.textContent = l; lbl.className = 'rlbl' + (live ? ' live' : err ? ' bad' : ''); }
    };
    guessRow(); update();
    return { node, update, time };
  }

  // ---- between rounds ----
  function result() {
    const s = game.song || {}, pts = game.mine?.gained || 0, c = pts > 0 ? myColor() : '#a8a8a8', url = art(s.artwork, 300);
    const node = el(`<div class="pscreen result"><div class="rhead"><span class="kicker">Round ${game.round + 1} of ${game.settings.rounds}</span><button class="closedot" aria-label="Close">${I.x(12)}</button></div>
      <div class="hero">${url ? `<div class="artbox"><img class="bloom" src="${esc(url)}" alt=""><img class="cover" src="${esc(url)}" alt=""></div>` : ''}<div class="txt"><span class="itwas">IT WAS_</span><b>${esc(s.title || '')}</b><span class="ar">${esc(s.artist || '')}</span></div></div>
      <div class="verdict" style="--c:${c}">${pts > 0 ? I.bolt(13) : I.x(13, 2.5)}<span>${pts > 0 ? 'You scored' : 'Missed it'}</span><b class="mono">+${pts}</b></div>
      <div class="board"></div><div class="grow"></div><div class="foot"></div></div>`);
    node.querySelector('.closedot').onclick = close;
    const board = node.querySelector('.board'), foot = node.querySelector('.foot');
    let revealed = false, sig = '';
    const update = () => {
      // The top of the board plus your own row is what anyone actually looks for.
      const ps = game.sorted, top = Math.max(1, ...ps.map(p => p.score)), cut = 8, vis = ps.slice(0, cut);
      const mi = ps.findIndex(p => p.id === game.sid); if (mi >= cut) vis.push(ps[mi]);
      const ids = vis.map(p => p.id).join();
      if (ids !== sig) {
        sig = ids;
        board.innerHTML = vis.map((p, i) => `<div class="brow${i === 0 ? ' first' : ''}${p.id === game.sid ? ' me' : ''}" style="--c:${hueColor(p.hue)}"><span class="rk mono">${ps.indexOf(p) + 1}</span>${pf(p, 30)}<div class="txt"><div class="line"><span class="nm">${esc(p.name)}</span><span class="gain mono"></span><span class="sc mono"></span></div><div class="bar"><i style="--w:0%"></i></div></div></div>`).join('')
          + (ps.length > cut ? `<div class="more">+${ps.length - cut} more</div>` : '');
      }
      // Bars sit at last round's totals until the reveal, then grow to this round's; the gains slide in.
      board.classList.toggle('revealed', revealed);
      vis.forEach((p, i) => {
        const r = board.children[i], shown = revealed ? p.score : p.score - p.gained;
        r.querySelector('.sc').textContent = shown; r.querySelector('.gain').textContent = p.gained > 0 ? '+' + p.gained : '';
        r.querySelector('.bar i').style.setProperty('--w', Math.round(100 * shown / top) + '%');
      });
      if (foot.firstChild) return;
      if (game.isHost) { foot.innerHTML = `<button class="pbtn" data-press>${game.round + 1 >= game.settings.rounds ? 'See the podium' : 'Next round'}</button>`; foot.querySelector('.pbtn').onclick = () => { sound.click(); game.next(); }; }
      else foot.innerHTML = `<div class="waitfoot">${dots()}Waiting for the host</div>`;
    };
    update();
    const t = setTimeout(() => { revealed = true; update(); }, 650);
    return { node, update, gone: () => clearTimeout(t) };
  }

  // ---- the end ----
  function finished() {
    const ranked = game.sorted, win = ranked[0];
    const title = win ? (win.id === game.sid ? 'You win!' : `${esc(win.name)} wins!`) : 'Game over';
    const H = [96, 132, 72], D = [300, 550, 750];                    // by rank: 1st, 2nd, 3rd
    const pod = i => { const p = ranked[i]; if (!p) return ''; const av = i === 0 ? 56 : 44;
      return `<div class="pod" style="--c:${hueColor(p.hue)};--h:${H[i]}px;--d:${D[i]}ms"><div class="av">${pf(p, av)}<i class="ring"></i>${i === 0 ? `<span class="crown">${I.crown(16)}</span>` : ''}</div><span class="nm">${esc(p.name)}</span><span class="sc mono">${p.score}</span><div class="blk">${i + 1}</div></div>`; };
    const node = el(`<div class="pscreen fin"><div class="pbar"><h1>Results</h1><button class="closedot" aria-label="Close">${I.x(13)}</button></div>
      <h2 class="ptitle wintitle">${title}</h2>
      <div class="podium">${pod(1)}${pod(0)}${pod(2)}</div>
      ${ranked.length > 3 ? `<div class="rest">${ranked.slice(3).map((p, i) => `<div class="r"><span class="rk mono">${i + 4}</span>${pf(p, 26)}<span class="nm">${esc(p.name)}</span><span class="sc mono">${p.score}</span></div>`).join('')}</div>` : ''}
      <div class="grow"></div><div class="foot">${game.isHost ? `<button class="pbtn" data-press style="--pc:${TIER_COLOR.easy};--pc-ink:${TIER_INK.easy}">Play again</button>` : ''}<button class="leave">Leave the party</button></div></div>`);
    node.querySelector('.closedot').onclick = close; node.querySelector('.leave').onclick = close;
    node.querySelector('.pbtn')?.addEventListener('click', () => { sound.click(); game.playAgain(); });
    // The podium rises after a beat; the title and the confetti, in the winner's colour, land once it is up.
    const timers = [
      setTimeout(() => node.querySelectorAll('.pod').forEach(p => p.classList.add('up')), 150),
      setTimeout(() => { if (!node.isConnected) return; node.querySelector('.wintitle').classList.add('up'); sound.reveal(); const c = hueColor(win?.hue || 1); confetti(innerWidth / 2, innerHeight * .34, [c, '#ffffff', c], 140); }, 1050),
    ];
    return { node, gone: () => timers.forEach(clearTimeout) };
  }

  function error() {
    const node = el(`<div class="pscreen center err"><div class="grow"></div><span class="wifi">${I.wifi(30)}</span><p>${esc(game.error || 'Something went wrong.')}</p><button class="back" data-press>Back</button><div class="grow"></div></div>`);
    node.querySelector('.back').onclick = () => { sound.click(); game.leave(); };
    return { node };
  }

  const SCREENS = { hub, connecting, lobby, countdown, playing, result, finished, error };
  const unGame = game.onChange(show);
  const unAcc = account.onChange(() => { if (game.phase === 'hub') { key = ''; show(); } });   // a new name or picture shows at once
  pushView(view); show(); loop();
  return view;
}
