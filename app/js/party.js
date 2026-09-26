// Party on the web: the iPhone app's PartyView screen for screen — the hub,
// the waiting room, the count, the round with its four answers, the answer
// and the board, the podium. The room, the rules and the wire live in
// partygame.js and speak the iPhone's own PartyMessage JSON, so a browser
// and an iPhone can sit in the same room. Sizes are the SwiftUI points.
import { PartyGame, MAX_PLAYERS, ROUND_OPTIONS, DIFFICULTIES, WINDOWS, YEARS, normaliseCode } from './partygame.js';
import { choiceGrid } from './choices.js';
import { confetti } from './confetti.js';
import { I } from './icons.js';
import { el, pushView, popView, openSheet, hueColor, shareText, esc, art, cap, TIER_COLOR, TIER_INK, PILL_FILL, PILL_INK } from './ui.js';

const SHAZAM_TAIL = 12;           // seconds a clip stays muted after the tab was away on the results screen
const STRIP_MAX = 10;
const RING_R = 98, RING_C = 2 * Math.PI * RING_R;

const dots = color => `<span class="pdots" style="color:${color}"><i></i><i></i><i></i></span>`;
const eq = () => '<span class="peq"><i></i><i></i><i></i><i></i><i></i></span>';

/** A face as the app draws it: the picture, the initial on the player's colour, or a person on grey. */
function avatar(name, pic, color, size) {
  const n = String(name || '').trim();
  const box = `width:${size}px;height:${size}px`;
  if (pic) return `<img class="pav" src="data:image/jpeg;base64,${esc(pic)}" alt="" style="${box}">`;
  if (!n) return `<span class="pav none" style="${box};font-size:${Math.round(size * 0.4)}px">${I.person}</span>`;
  return `<span class="pav" style="${box};background:${color};font-size:${(size * 0.44).toFixed(1)}px">${esc(n[0].toUpperCase())}</span>`;
}

export function mountParty(ctx, opts = {}) {
  const { pool, player, sound, account } = ctx;
  const game = new PartyGame(pool);
  // The raw wire, for anyone checking it from the console.
  const wire = (window.__partyWire = []);
  game.transport.tap = (dir, m) => { wire.push({ dir, t: Date.now(), m: JSON.parse(JSON.stringify(m)) }); if (wire.length > 400) wire.shift(); };
  window.__party = game;

  const view = el('<div class="view party" role="dialog" aria-label="Party"><div class="screen pt"></div></div>');
  const scr = view.querySelector('.pt');
  let codeEntry = normaliseCode(opts.join || '');
  let key = '', raf = 0, closed = false;
  let clip = { round: -1, started: false, error: null, muted: false };
  let wentAwayAt = null, countN = -1, secsShown = -1;
  let scoresBefore = {}, revealed = false, recordedGame = false, podiumTimer = 0;
  let settingsSheet = null, songsSheet = null;

  const tier = () => (['countdown', 'playing', 'result'].includes(game.phase) ? game.tier(game.round) : 'easy');
  const accent = () => TIER_COLOR[tier()];
  const ink = () => TIER_INK[tier()];
  const myColor = () => hueColor(game.me?.hue ?? 0);
  const pav = (p, size) => avatar(p.name, p.avatar, hueColor(p.hue), size);
  const name = () => (account.name || '').trim();
  const strip = () => { const ps = game.sortedByHue; return ps.length <= STRIP_MAX ? ps : ps.slice(0, STRIP_MAX - 1); };
  const overflow = (shown, size) => { const n = game.players.length; return n > shown ? `<span class="pover" style="width:${size}px;height:${size}px;font-size:${(size * 0.34).toFixed(1)}px">+${n - shown}</span>` : ''; };
  const xbtn = (size = 35) => `<button class="xbtn" data-press data-act="close" aria-label="Close" style="width:${size}px;height:${size}px">${I.x}</button>`;
  const bar = (title, premium = false) => `<div class="pbar"><h1>${esc(title)}</h1><div class="sp"></div>${premium && !ctx.premium ? `<button class="pcrown" data-press data-act="premium">${I.crown}<span>Premium</span></button>` : ''}${xbtn()}</div>`;
  const tierPill = () => `<span class="ptier" style="background:${PILL_FILL[tier()]};color:${PILL_INK}">${cap(tier())}</span>`;
  const roundHead = withClose => `<div class="pthead"><div class="rnd"><small>ROUND</small><div><b class="mono">${game.round + 1}</b><span class="mono">/ ${game.settings.rounds}</span></div></div><div class="sp"></div>${tierPill()}${withClose ? `<button class="xbtn sm" data-press data-act="close" aria-label="Leave">${I.x}</button>` : ''}</div>`;

  // ---------- screens ----------
  function entry() {
    const premium = ctx.premium, n = name();
    return `${bar('Party', true)}
      <h2 class="ptitle">Play with friends</h2>
      <p class="plead">Everyone hears the same clip at the same moment. The fastest right answer scores the most.</p>
      <button class="prow card" data-press data-act="profile">
        ${avatar(n, account.avatar, TIER_COLOR.easy, 46)}
        <span class="who"><small>PLAYING AS</small><b class="${n ? '' : 'none'}">${esc(n || 'Add your name')}</b></span>
        <span class="edit">${account.avatar ? 'Edit' : 'Add a photo'}</span><i class="chev">${I.chevron}</i>
      </button>
      <button class="phost ${premium ? 'on' : ''}" data-press data-act="host">
        <span class="ic">${premium ? I.people : I.lock}</span>
        <span class="tx"><b>Host a party</b><small>${premium ? 'Get a code, play live with up to 50 people.' : 'Hosting is a premium perk. Joining a party is free for everyone.'}</small></span>
        ${premium ? `<i class="chev">${I.chevron}</i>` : '<span class="ptag">PREMIUM</span>'}
      </button>
      <div class="por"><i></i><span>or</span><i></i></div>
      <div class="pjoin">
        <input class="pcode ${codeEntry.length === 5 ? 'full' : ''}" value="${esc(codeEntry)}" placeholder="ROOM CODE" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="5" aria-label="Room code" enterkeyhint="go">
        <button class="pgo ${codeEntry.length === 5 ? 'on' : ''}" data-press data-act="join" ${codeEntry.length === 5 ? '' : 'disabled'}>Join</button>
      </div>
      <div class="flex"></div>`;
  }
  const connecting = () => `<div class="flex"></div><div class="pconn"><span class="pulse" style="color:${accent()}"><i></i><b></b></span><p>${game.isHost ? 'Opening your room…' : 'Finding the party…'}</p></div><div class="flex"></div><button class="pquiet" data-act="close">Cancel</button>`;

  function lobby() {
    const n = game.players.length, empty = n < MAX_PLAYERS ? Math.max(1, 4 - n) : 0;
    const tiles = game.players.map(p => {
      const c = hueColor(p.hue), me = p.id === game.myID;
      return `<div class="ptile"><span class="ring" style="outline:${me ? 3 : 2}px solid ${c};outline-offset:${me ? 1.5 : 2}px">${pav(p, 60)}${p.isHost ? `<i class="crownb">${I.crown}</i>` : ''}</span>
        <b class="${me ? 'me' : ''}">${esc(p.name)}</b><small style="color:${me ? c : 'var(--dim)'}">${me ? 'you' : p.isHost ? 'host' : '&nbsp;'}</small></div>`;
    }).join('') + Array.from({ length: empty }, () => `<div class="ptile seat"><span class="dash">${I.plus}</span><b>waiting</b>${dots('var(--dim)')}</div>`).join('');
    const s = game.settings;
    const row = (icon, text) => `<div class="srow"><i style="color:${accent()}">${icon}</i><span>${esc(text)}</span></div>`;
    const summary = `${game.isHost ? `<div class="shead"><small>GAME SETTINGS</small><div class="sp"></div><span style="color:${accent()}">Edit</span><i class="chev">${I.chevron}</i></div>` : ''}
      ${row(I.hash, `${s.rounds} rounds`)}${row(I.bars, s.difficulty === 'mixed' ? 'Easy to Impossible' : cap(s.difficulty))}
      ${row(I.timer, `${Math.round(s.guessWindow)} seconds a song`)}${row(I.calendar, s.era === 'all' ? 'Any year' : `The ${s.era}`)}
      ${row(I.search, s.easySearch ? 'Easy search' : 'Hard search')}${row(s.artist ? I.mic : I.genres, game.songsLabel)}`;
    const foot = game.isHost
      ? `<button class="pstart ${game.canStart ? 'on' : ''}" data-press data-act="start" ${!game.canStart || game.preparingSongs ? 'disabled' : ''}>${game.preparingSongs ? 'Getting the songs ready…' : game.canStart ? 'Start the party' : 'Waiting for players'}</button>`
      : `<div class="pwait">${dots('var(--muted)')}<span>Waiting for ${esc(game.hostName || 'the host')} to start</span></div>`;
    return `${bar('Waiting room')}
      <div class="pscroll">
        <div class="pcodeblock"><small>ROOM CODE</small><div class="big mono" style="color:${accent()}">${esc(game.code)}</div>
          <button class="pshare" data-press data-act="share">${I.share}<span>Share the code</span></button></div>
        <div class="pcount"><span><b class="mono">${n}</b> ${n === 1 ? 'player' : 'players'}</span><small>room for ${MAX_PLAYERS}</small></div>
        <div class="pgrid">${tiles}</div>
        ${game.isHost ? `<button class="psum card" data-press data-act="settings">${summary}</button>` : `<div class="psum card">${summary}</div>`}
      </div>
      ${foot}`;
  }

  function countdown() {
    const size = game.players.length > 6 ? 28 : 36, shown = strip();
    return `${roundHead(false)}<div class="flex"></div>
      <div class="pcount-screen"><small>${game.round === 0 ? 'GET READY' : 'NEXT UP'}</small>
        <div class="num" style="color:${accent()}"><span class="n"></span></div>
        <p>${cap(tier())} · listen, then pick it</p></div>
      <div class="flex"></div>
      <div class="pstrip" style="gap:${game.players.length > 6 ? 6 : 10}px;padding-bottom:44px">${shown.map(p => pav(p, size)).join('')}${overflow(shown.length, size)}</div>`;
  }

  function playing() {
    const n = game.players.length, size = n > 6 ? 26 : 34, shown = strip();
    const answered = shown.map(p => {
      const done = game.answered.includes(p.id);
      return `<span class="pans ${done ? 'done' : ''}">${pav(p, size)}${done ? `<i class="ck" style="color:${hueColor(p.hue)}">${I.checkCircle}</i>` : ''}</span>`;
    }).join('');
    let bottom;
    if (game.currentChoices.length) {
      const cap2 = game.myPick == null ? 'One tap. Wrong loses the round.' : game.answered.length < n ? 'Locked in. Waiting for the others…' : "Everyone's in!";
      bottom = `<div class="pchoices"><p style="color:${game.myPick == null ? 'var(--muted)' : myColor()}">${cap2}</p>${choiceGrid(game.currentChoices, { picked: game.myPick })}</div>`;
    } else if (game.iAnswered) {
      bottom = `<div class="plocked" style="border-color:${myColor()}80"><span class="ic" style="background:${myColor()}29;color:${myColor()}">${I.check}</span>
        <span class="tx"><b>Locked in</b><small>${game.answered.length < n ? 'Waiting for the others…' : "Everyone's in!"}</small></span>
        ${game.myPoints != null ? `<b class="pts mono" style="color:${myColor()}">+${game.myPoints}</b>` : ''}</div>`;
    } else {
      bottom = `<div class="pguess"><div class="hits"></div><div class="row"><input class="gin" placeholder="Name that track" autocomplete="off" spellcheck="false" enterkeyhint="send"><button class="gbtn" data-press data-act="guess" style="background:${accent()};color:${ink()}">Guess</button></div></div>`;
    }
    return `${roundHead(true)}<div class="flex"></div>
      <button class="pring" data-act="replay" aria-label="Replay the clip">
        <svg viewBox="0 0 196 196"><circle cx="98" cy="98" r="${RING_R}" class="trk"/><circle cx="98" cy="98" r="${RING_R}" class="arc" style="stroke:${accent()}" stroke-dasharray="${RING_C}" stroke-dashoffset="0" transform="rotate(-90 98 98)"/></svg>
        <span class="in"><span class="eqw" style="color:${accent()}">${eq()}</span><b class="secs"></b><small class="lbl"></small></span>
      </button>
      <div class="pstrip answered" style="gap:${n > 6 ? 6 : 10}px">${answered}${overflow(shown.length, size)}</div>
      <div class="flex"></div>
      ${bottom}
      ${game.isHost ? `<button class="pskip" data-press data-act="skip">${I.skip}<span>Skip this one</span></button>` : ''}`;
  }

  function result() {
    const a = game.lastAnswer, pts = game.lastGained[game.myID] || 0;
    const ranked = game.sortedPlayers, top = Math.max(1, ...ranked.map(p => p.score)), cut = 8;
    let visible = ranked.slice(0, cut).map((p, i) => [i, p]);
    const mi = ranked.findIndex(p => p.id === game.myID); if (mi >= cut) visible.push([mi, ranked[mi]]);
    const rows = visible.map(([i, p]) => {
      const shown = revealed ? p.score : (scoresBefore[p.id] || 0), gained = game.lastGained[p.id] || 0, c = hueColor(p.hue);
      return `<div class="sbrow" data-id="${esc(p.id)}"><span class="rk mono" style="color:${i === 0 ? 'var(--medium)' : 'var(--dim)'}">${i + 1}</span>${pav(p, 30)}
        <div class="mid"><div class="top"><b class="${p.id === game.myID ? 'me' : ''}">${esc(p.name)}</b><div class="sp"></div>${gained > 0 ? `<span class="gain mono" style="color:${c}">+${gained}</span>` : ''}<span class="sc mono" data-from="${scoresBefore[p.id] || 0}" data-to="${p.score}">${shown}</span></div>
        <div class="trackbar"><i style="background:${c};width:max(6px, ${(100 * shown / top).toFixed(2)}%)" data-w="${(100 * p.score / top).toFixed(2)}"></i></div></div></div>`;
    }).join('');
    const last = game.round + 1 >= game.settings.rounds;
    const verdictCol = pts > 0 ? myColor() : 'var(--muted)';
    return `<div class="pthead"><small class="rof">ROUND ${game.round + 1} OF ${game.settings.rounds}</small><div class="sp"></div><button class="xbtn sm" data-press data-act="close" aria-label="Leave">${I.x}</button></div>
      ${a ? `<div class="phero">${a.artwork ? `<span class="cov"><img class="bloom" src="${esc(art(a.artwork, 300))}" alt=""><img class="art" src="${esc(art(a.artwork, 300))}" alt=""></span>` : ''}
        <span class="tx"><small style="color:${accent()}">IT WAS_</small><b>${esc(a.title)}</b><span>${esc(a.artist)}</span></span></div>` : ''}
      <div class="pverdict" style="color:${verdictCol};background:${pts > 0 ? myColor() + '1f' : 'rgba(168,168,168,.12)'}"><i>${pts > 0 ? I.bolt : I.x}</i><span>${pts > 0 ? 'You scored' : game.wrong.has(game.myID) ? 'Wrong answer' : 'Missed it'}</span><div class="sp"></div><b class="mono">+${pts}</b></div>
      <div class="pboard ${revealed ? 'rev' : ''}">${rows}${ranked.length > cut ? `<small class="more">+${ranked.length - cut} more</small>` : ''}</div>
      <div class="flex"></div>
      ${game.isHost ? `<button class="pnext" data-press data-act="next" style="background:${accent()};color:${ink()}">${last ? 'See the podium' : 'Next round'}</button>`
        : `<div class="pwait h54">${dots('var(--muted)')}<span>Waiting for the host</span></div>`}`;
  }

  function finished() {
    const ranked = game.sortedPlayers, first = ranked[0];
    const order = [1, 0, 2].filter(i => i < ranked.length), heights = [132, 96, 72], delays = [0.55, 0.3, 0.75];
    const podium = order.map(i => {
      const p = ranked[i], c = hueColor(p.hue);
      return `<div class="pod" style="animation-delay:${delays[i]}s"><span class="ring" style="outline:2.5px solid ${c};outline-offset:1.75px">${pav(p, i === 0 ? 56 : 44)}${i === 0 ? `<i class="crown">${I.crown}</i>` : ''}</span>
        <b>${esc(p.name)}</b><span class="sc mono" style="color:${c}">${p.score}</span>
        <div class="blk" style="--h:${heights[i]}px;background:linear-gradient(${c}e6, ${c}59);animation-delay:${delays[i]}s"><span>${i + 1}</span></div></div>`;
    }).join('');
    const rest = ranked.slice(3).map((p, i) => `<div class="restrow"><span class="rk mono">${i + 4}</span>${pav(p, 26)}<b>${esc(p.name)}</b><div class="sp"></div><span class="mono">${p.score}</span></div>`).join('');
    return `${bar('Results')}
      <h2 class="pwin">${first ? (first.id === game.myID ? 'You win!' : `${esc(first.name)} wins!`) : 'Game over'}</h2>
      <div class="podium">${podium}</div>
      ${rest ? `<div class="rest">${rest}</div>` : ''}
      <div class="flex"></div>
      ${game.isHost ? '<button class="pagain" data-press data-act="again">Play again</button>' : ''}
      <button class="pquiet" data-act="close">Leave the party</button>`;
  }

  const errorCard = () => `<div class="flex"></div><div class="perr"><i>${I.wifi}</i><p>${esc(game.error || 'Something went wrong.')}</p><button data-press data-act="back">Back</button></div><div class="flex"></div>`;

  // ---------- drawing ----------
  function render(force = false) {
    if (closed) return;
    const k = [game.phase, game.round, game.players.length, force ? Math.random() : ''].join('|');
    const screens = { idle: entry, connecting, lobby, countdown, playing, result, finished, error: errorCard };
    const phaseChanged = !key.startsWith(game.phase + '|');
    // Keep a typed guess or code through a redraw.
    const typed = scr.querySelector('.gin')?.value;
    scr.className = 'screen pt ph-' + game.phase;
    scr.style.setProperty('--pa', accent()); scr.style.setProperty('--pa-ink', ink());
    scr.innerHTML = (screens[game.phase] || entry)();
    if (typed && scr.querySelector('.gin')) { scr.querySelector('.gin').value = typed; refreshHits(); }
    if (phaseChanged) { scr.classList.add('fade'); requestAnimationFrame(() => scr.classList.remove('fade')); }
    key = k;
    countN = -1; secsShown = -1;
    frame();
  }

  function onPhase(prev) {
    const p = game.phase;
    if (p === 'countdown' || (p === 'playing' && prev !== 'countdown')) {
      clip = { round: game.round, started: false, error: null, muted: document.hidden };
      scoresBefore = Object.fromEntries(game.players.map(x => [x.id, x.score]));
      revealed = false;
      player.stop();
      songFor(game.current?.songID).then(s => { if (s?.preview) player.prepare(s.id, s.preview).catch(() => {}); });
    }
    if (p === 'playing') startClipIfDue();
    if (p === 'result') {
      player.stop(); sound.reveal();
      setTimeout(() => { if (game.phase !== 'result' || closed) return; revealed = true; revealBoard(); }, 650);
    }
    if (p === 'finished') {
      player.stop(); wentAwayAt = null;
      if (!recordedGame) {
        recordedGame = true;
        const mine = game.me?.score || 0, won = game.sortedPlayers[0]?.id === game.myID;
        try { account.recordParty(won, mine, game.myRoundsWon); } catch (e) {}
      }
      clearTimeout(podiumTimer);
      podiumTimer = setTimeout(() => {
        if (game.phase !== 'finished' || closed) return;
        sound.reveal();
        const c = hueColor(game.sortedPlayers[0]?.hue ?? 0), r = scr.querySelector('.podium')?.getBoundingClientRect();
        confetti(innerWidth / 2, r ? r.top + 40 : innerHeight * 0.34, [c, '#ffffff', c], 140);
      }, 1050);
    }
    if (p === 'lobby') { wentAwayAt = null; recordedGame = false; }
    if (p === 'error' || p === 'idle') player.stop();
  }

  /** The board: bars grow from last round's totals to this round's and the numbers count up. */
  function revealBoard() {
    const b = scr.querySelector('.pboard'); if (!b) return;
    b.classList.add('rev');
    b.querySelectorAll('.trackbar i').forEach(i => { i.style.width = `max(6px, ${i.dataset.w}%)`; });
    const t0 = performance.now();
    const step = now => {
      const f = Math.min(1, (now - t0) / 750), e = 1 - Math.pow(1 - f, 3);
      b.querySelectorAll('.sc[data-to]').forEach(s => { const a = +s.dataset.from, z = +s.dataset.to; s.textContent = Math.round(a + (z - a) * e); });
      if (f < 1 && b.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  async function songFor(id) {
    if (!id) return null;
    const s = pool.byId.get(String(id));
    if (s) return s;
    try { return await ctx.lookupSong(id); } catch (e) { return null; }
  }

  /** The clip, on the host's clock: a phone that arrives late hears it from where the room is. */
  async function startClipIfDue(replay = false) {
    if (game.phase !== 'playing' || !game.current) return;
    if (!replay) {
      if (clip.started && clip.round === game.round) return;
      clip.round = game.round; clip.started = true;
      // Away when the clip is due, or away on the results screen a moment ago: no sound this round.
      if (document.hidden || (wentAwayAt && (Date.now() - wentAwayAt) / 1000 < SHAZAM_TAIL)) clip.muted = true;
      wentAwayAt = null;
      if (clip.muted) return;
    }
    const round = game.round, s = await songFor(game.current.songID);
    if (closed || game.phase !== 'playing' || game.round !== round || clip.muted) return;
    if (!s?.preview) { clip.error = 'no sound'; return; }
    const offset = replay ? 0 : Math.max(0, game.now - game.roundStartedAt);
    const seconds = Math.max(0.5, game.roundSeconds - offset);
    clip.error = null;
    const ok = await player.play(s.id, s.preview, seconds, offset);
    if (!ok) clip.error = player.lastError || 'no sound';
    else if (player.ctx && player.ctx.state !== 'running') clip.error = 'blocked';
  }

  /** 60 fps: the count, the ring, the seconds, the ring's words. */
  function frame() {
    cancelAnimationFrame(raf);
    if (closed) return;
    if (game.phase === 'countdown') {
      const n = Math.ceil(Math.max(0, game.roundStartedAt - game.now));
      if (n !== countN) {
        countN = n;
        const box = scr.querySelector('.num');
        if (box) { box.innerHTML = `<span class="n ${n > 0 ? '' : 'go'}">${n > 0 ? n : 'GO'}</span>`; }
        if (n > 0) sound.tick();
      }
    } else if (game.phase === 'playing') {
      const elapsed = Math.max(0, game.now - game.roundStartedAt), win = Math.max(1, game.roundWindow);
      const progress = Math.min(1, elapsed / win), left = Math.max(0, Math.ceil(game.roundWindow - elapsed));
      const arc = scr.querySelector('.pring .arc');
      if (arc) arc.setAttribute('stroke-dashoffset', (RING_C * progress).toFixed(2));
      if (left !== secsShown) { secsShown = left; const s = scr.querySelector('.pring .secs'); if (s) s.textContent = left; }
      const lbl = scr.querySelector('.pring .lbl'), eqw = scr.querySelector('.pring .eqw');
      if (lbl) {
        const on = player.playing;
        const txt = on ? 'listening' : clip.muted ? 'muted this round' : clip.error ? 'no sound — tap to retry' : 'tap to replay';
        if (lbl.textContent !== txt) { lbl.textContent = txt; lbl.style.color = clip.muted ? 'var(--dim)' : clip.error ? 'var(--expert)' : on ? accent() : 'var(--dim)'; }
        eqw.classList.toggle('on', on);
      }
      if (!clip.started) startClipIfDue();
    }
    raf = requestAnimationFrame(frame);
  }

  // ---------- the typed guess (only for an older host that sends no answers) ----------
  function refreshHits() {
    const inp = scr.querySelector('.gin'), box = scr.querySelector('.pguess .hits'); if (!inp || !box) return;
    const t = inp.value.trim();
    let hits = [];
    if (t) {
      if (game.catalogue.length) { const q = t.toLowerCase(); hits = game.catalogue.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)).slice(0, 5); }
      else {
        let scope = null;
        if (game.settings.easySearch) {
          scope = pool.filter(game.tier(game.round), game.settings.era || 'all', game.settings.category || 'all');
          const c = game.current && pool.byId.get(game.current.songID); if (c && !scope.includes(c)) scope = scope.concat([c]);
        }
        hits = pool.search(t, 5, scope);
      }
    }
    box.innerHTML = hits.map(s => `<button class="hit" data-act="hit" data-id="${esc(s.id)}" data-title="${esc(s.title)}"><b>${esc(s.title)}</b><span>${esc(s.artist)}</span></button>`).join('');
    box.classList.toggle('on', hits.length > 0);
  }
  const normT = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  function wrongShake() { scr.classList.remove('shake'); void scr.offsetWidth; scr.classList.add('shake'); const i = scr.querySelector('.gin'); if (i) i.value = ''; refreshHits(); }
  function submitTyped() {
    const inp = scr.querySelector('.gin'); if (!inp || !game.current) return;
    const t = inp.value.trim(); if (!t) return;
    sound.click();
    const c = game.current;
    const exact = normT(t) === normT(c.title) || normT(t) === normT(`${c.title} ${c.artist}`);
    const best = game.catalogue.length ? null : pool.search(t, 1)[0];
    if (exact || best?.id === c.songID) { inp.value = ''; refreshHits(); game.submit(c.songID, t); } else wrongShake();
  }

  // ---------- the host's settings ----------
  function pickerHTML(title, options, value, field) {
    return `<div class="ppick"><small>${esc(title.toUpperCase())}</small><div class="opts">${options.map(([v, l]) =>
      `<button data-field="${field}" data-v="${esc(v)}" class="${String(v) === String(value) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div></div>`;
  }
  function settingsBody() {
    const s = game.settings;
    return `<div class="grab"></div><div class="pshead"><h3>Game settings</h3><button class="done" data-press data-sact="done">Done</button></div>
      <div class="psettings card">
        ${pickerHTML('Rounds', ROUND_OPTIONS.map(r => [r, String(r)]), s.rounds, 'rounds')}
        ${pickerHTML('Difficulty', DIFFICULTIES, s.difficulty, 'difficulty')}
        ${pickerHTML('Time per song', WINDOWS.map(w => [w, w + 's']), Math.round(s.guessWindow), 'window')}
        ${pickerHTML('Years', YEARS, s.era, 'era')}
        ${pickerHTML('Search', [['easy', 'Easy'], ['hard', 'Hard']], s.easySearch ? 'easy' : 'hard', 'search')}
        <button class="psongs" data-press data-sact="songs"><i style="color:var(--easy)">${s.artist ? I.mic : I.genres}</i><span class="l">Songs</span><div class="sp"></div><b>${esc(game.songsLabel)}</b><i class="chev">${I.chevron}</i></button>
      </div>`;
  }
  function openSettings() {
    if (settingsSheet) return;
    settingsSheet = openSheet(settingsBody(), { cls: 'party-sheet', label: 'Game settings', onClose: () => { settingsSheet = null; } });
    settingsSheet.body.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.sact === 'done') { sound.click(); settingsSheet.close(); return; }
      if (b.dataset.sact === 'songs') { sound.click(); openSongs(); return; }
      const f = b.dataset.field; if (!f) return;
      sound.click();
      const v = b.dataset.v, s = game.settings;
      if (f === 'rounds') s.rounds = parseInt(v, 10) || 10;
      if (f === 'difficulty') s.difficulty = v;
      if (f === 'window') { s.guessWindow = parseInt(v, 10) || 20; s.clipSeconds = s.guessWindow; }
      if (f === 'era') s.era = v;
      if (f === 'search') s.easySearch = v === 'easy';
      settingsSheet.body.innerHTML = settingsBody();
      game.pushSettings(); render();
    });
  }
  function openSongs() {
    if (songsSheet) return;
    let tab = game.settings.artist ? 1 : 0, q = '';
    const draw = () => {
      const s = game.settings, typed = q.trim().toLowerCase();
      let list;
      if (tab === 0) {
        const hits = typed ? pool.categoryCounts.filter(c => c.name.toLowerCase().includes(typed)) : pool.categoryCounts;
        const rowG = (label, count, k) => { const on = !s.artist && s.category === k; return `<button class="gr ${on ? 'on' : ''}" data-genre="${esc(k)}"><span>${esc(label)}</span>${count != null ? `<small class="mono">${count}</small>` : ''}</button>`; };
        list = (typed ? '' : rowG('All genres', null, 'all')) + hits.map(c => rowG(c.name, c.count, c.name)).join('');
      } else {
        const hits = pool.artists.filter(a => a.count >= 4 && (!typed || a.name.toLowerCase().includes(typed))).sort((a, b) => b.count - a.count).slice(0, 60);
        list = (s.artist && !typed ? `<p class="playing">${I.checkCircle}<span>Playing ${esc(s.artist)} — ${game.catalogue.length} song${game.catalogue.length === 1 ? '' : 's'}</span></p>` : '')
          + (hits.length ? '<small class="sec">IN THE GAME · PLAYS INSTANTLY</small>' : '')
          + hits.map(a => `<button class="ar ${s.artist === a.name ? 'on' : ''}" data-artist="${esc(a.name)}"><span class="t"><b>${esc(a.name)}</b><small>${a.count} ready</small></span><i style="color:var(--easy)">${I.bolt}</i></button>`).join('');
      }
      return `<div class="grab"></div><div class="pshead"><h3 class="big">Songs</h3><button class="done" data-press data-sact="done">Done</button></div>
        <div class="ptabs">${['Genre', 'Artist'].map((t, i) => `<button data-tab="${i}" class="${tab === i ? 'on' : ''}">${t}</button>`).join('')}</div>
        <label class="ptsearch">${I.search}<input value="${esc(q)}" placeholder="${tab === 0 ? 'Search genres' : esc(s.artist || 'Search any artist')}" autocomplete="off" spellcheck="false"></label>
        <div class="ptlist">${list}</div>`;
    };
    songsSheet = openSheet(draw(), { cls: 'party-sheet tall', label: 'Songs', onClose: () => { songsSheet = null; } });
    const body = songsSheet.body;
    const redraw = () => { const had = document.activeElement?.tagName === 'INPUT'; body.innerHTML = draw(); if (had) { const i = body.querySelector('input'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
    body.addEventListener('input', e => { if (e.target.tagName === 'INPUT') { q = e.target.value; redraw(); } });
    body.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.sact === 'done') { sound.click(); songsSheet.close(); return; }
      if (b.dataset.tab != null) { sound.click(); tab = +b.dataset.tab; q = ''; redraw(); return; }
      if (b.dataset.genre != null) { sound.click(); await game.setCategory(b.dataset.genre); redraw(); refreshSettings(); return; }
      if (b.dataset.artist != null) {
        sound.click();
        const a = b.dataset.artist, songs = pool.songs.filter(s => s.artist === a && s.preview);
        await game.setArtist(a, songs); refreshSettings();
        songsSheet.close();
      }
    });
  }
  const refreshSettings = () => { if (settingsSheet) settingsSheet.body.innerHTML = settingsBody(); render(); };

  // ---------- actions ----------
  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf); clearTimeout(podiumTimer);
    player.stop();
    settingsSheet?.close(); songsSheet?.close();
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('keydown', onKey);
    off();
    game.leave().catch(() => {}).finally(() => player.stop());
    popView(view);
  }
  function host() {
    if (!ctx.premium) { ctx.openPremium('host'); return; }
    player.ensure();
    game.host(account.displayName, account.avatar);
  }
  function join() {
    if (codeEntry.length !== 5) return;
    player.ensure();
    game.join(codeEntry, account.displayName, account.avatar);
  }
  function share() {
    const c = game.code;
    shareText(`Join my Songspot party — open Songspot, tap Party and enter the code ${c}. Or play in your browser: https://songspotapp.com/?party=${c}`, 'Copied. Send it to your friends.');
  }

  view.addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-choice]'); if (!b || b.disabled) return;
    const choice = b.dataset.choice;
    if (choice != null) { sound.click(); game.pick(choice); return; }
    const act = b.dataset.act;
    if (act !== 'replay') sound.click();
    switch (act) {
      case 'close': close(); break;
      case 'premium': ctx.openPremium('host'); break;
      case 'profile': ctx.openProfile ? ctx.openProfile() : null; break;
      case 'host': host(); break;
      case 'join': join(); break;
      case 'share': share(); break;
      case 'settings': openSettings(); break;
      case 'start': game.start(); break;
      case 'skip': game.skipRound(); break;
      case 'next': game.nextRound(); break;
      case 'again': game.playAgain(); break;
      case 'back': game.leave(); break;
      case 'guess': submitTyped(); break;
      case 'hit': {
        const c = game.current; if (!c) break;
        if (b.dataset.id === c.songID) { game.submit(c.songID, b.dataset.title); scr.querySelector('.gin').value = ''; refreshHits(); } else wrongShake();
        break;
      }
      case 'replay':
        player.ensure();
        if (game.phase === 'playing' && !player.playing && !clip.muted) { sound.click(); startClipIfDue(true); }
        break;
    }
  });
  view.addEventListener('input', e => {
    if (e.target.classList.contains('pcode')) {
      const n = normaliseCode(e.target.value);
      if (n !== e.target.value) e.target.value = n;
      codeEntry = n;
      e.target.classList.toggle('full', n.length === 5);
      const go = scr.querySelector('.pgo'); go.disabled = n.length !== 5; go.classList.toggle('on', n.length === 5);
    }
    if (e.target.classList.contains('gin')) refreshHits();
  });
  view.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.classList.contains('pcode')) join();
    if (e.target.classList.contains('gin')) submitTyped();
  });
  const onKey = e => { if (e.key === 'Escape' && !settingsSheet && !songsSheet && document.querySelector('#views > .view:last-child') === view) close(); };
  document.addEventListener('keydown', onKey);
  // Leaving the tab silences the clip for the rest of the round (a phone's Shazam lives one swipe away).
  const onVis = () => {
    if (!document.hidden) { if (wentAwayAt) wentAwayAt = Date.now(); return; }
    if (game.phase === 'countdown' || game.phase === 'playing') { player.stop(); clip.muted = true; wentAwayAt = Date.now(); render(); }
    else if (game.phase === 'result' || game.phase === 'finished') wentAwayAt = Date.now();
  };
  document.addEventListener('visibilitychange', onVis);

  let lastPhase = game.phase;
  const offGame = game.onChange(() => {
    const prev = lastPhase; lastPhase = game.phase;
    if (prev !== game.phase) onPhase(prev);
    render();
  });
  const offAccount = account.onChange ? account.onChange(() => { if (game.phase === 'idle') render(); }) : () => {};
  const off = () => { offGame(); offAccount(); };

  pushView(view);
  render();
  // A party link: straight into the room.
  if (opts.join && codeEntry.length === 5) setTimeout(join, 0);
  return view;
}
