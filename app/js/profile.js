// The profile, as the iPhone app's ProfileView.swift draws it: the avatar in
// an accent ring, the name, the level bar, four stat cards two by two, the
// Friends row, the ranked player card in its rank's colour, the compact daily
// card, then titled sections — How fast you name them (five columns and the
// difficulty tiles, once something is named), Career (a list that leaves out
// what you haven't done) and Account. The album wall sits behind the header.
import { el, esc, pushView, popView, openSheet, cap, label, alpha, TIER_COLOR, TIERS } from './ui.js';
import { I } from './icons.js';
import { Level, Streak, dailyNumber } from './account.js';
import { Ladder } from './ladder.js';
import { CoverWall } from './coverwall.js';
import { spring } from './motion.js';
import { Haptics } from './haptics.js';
import { Friends } from './friends.js';

const STAGES = [0.1, 0.5, 2, 8, 15];
/** SF "target", which icons.js does not carry. */
const TARGET = `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>`;

/** Int.formatted(): the reader's own grouping, as the phone uses the device's. */
const fmt = n => Number(n || 0).toLocaleString();
/** SF "rosette", for the season badges. */
const ROSETTE = `<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="9" r="6.5"/><path d="M8.2 14.2L6.5 22l5.5-2.8L17.5 22l-1.7-7.8a8.4 8.4 0 0 1-7.6 0z"/><circle cx="12" cy="9" r="3.2" fill="rgba(0,0,0,.35)"/></svg>`;
/** weekday(.narrow) for a day `ago` days back. */
const weekday = ago => { const d = new Date(); d.setDate(d.getDate() - ago); return d.toLocaleDateString(undefined, { weekday: 'narrow' }); };
/** SF "stairs" and "star.fill", which icons.js does not carry. */
const STAIRS = `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20h5v-5h5v-5h5V5h3"/></svg>`;
const STAR = `<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>`;
const COLS = spring(0.55, 0.85), RANKBAR = spring(0.7, 0.9);
const pct = s => Math.round((s.roundsPlayed ? s.roundsWon / s.roundsPlayed : 0) * 100);

/** PartyAvatar.encode: a 144 square, filled and centred, JPEG stepped down to ≤14 kB. */
function encodeAvatar(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = 144, c = document.createElement('canvas'); c.width = c.height = side;
      const g = c.getContext('2d');
      const scale = Math.max(side / Math.max(1, img.naturalWidth), side / Math.max(1, img.naturalHeight));
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      g.fillStyle = '#000'; g.fillRect(0, 0, side, side);
      g.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
      for (const q of [0.72, 0.55, 0.4, 0.3]) {
        const b64 = c.toDataURL('image/jpeg', q).split(',')[1];
        if (b64.length * 0.75 <= 14000) return resolve(b64);
      }
      resolve(c.toDataURL('image/jpeg', 0.2).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

export function mountProfile(ctx) {
  const { account } = ctx;
  let editing = false, deleting = false, deleteError = null, sheetOpen = false, first = true, closed = false;

  // The album wall behind the header, fading out into the page (today's covers).
  const node = el(`<div class="view profile" role="dialog" aria-modal="true" aria-label="Profile">
    <div class="pf-wall">${CoverWall.html(CoverWall.covers(ctx.pool), 0.72)}</div>
    <div class="pf-bar"><div class="pf-barin"><h1>Profile</h1><button class="xbtn" data-act="close" data-press aria-label="Close">${I.x}</button></div></div>
    <div class="pf-scroll"><div class="screen pf-screen"><div class="pf-body"></div></div></div>
    <input class="pf-file" type="file" accept="image/*" hidden>
  </div>`);
  const body = node.querySelector('.pf-body');
  const file = node.querySelector('.pf-file');
  const accent = () => ctx.accent;

  // ---------- pieces ----------
  function avatarHTML() {
    const inner = account.avatar
      ? `<img src="data:image/jpeg;base64,${esc(account.avatar)}" alt="">`
      : account.initial ? `<span class="pf-init">${esc(account.initial)}</span>` : `<span class="pf-noone">${I.person}</span>`;
    return `<button class="pf-pic" data-act="photo" data-press aria-label="Change your picture">
      <span class="pf-ring"></span><span class="pf-disc">${inner}</span><span class="pf-cam">${I.camera}</span></button>`;
  }

  function whoHTML() {
    const since = account.memberSince ? `<span class="pf-since">Since ${esc(account.memberSince.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }))}</span>` : '';
    const prem = ctx.premium ? `<span class="pf-prem">PREMIUM</span>` : '';
    const nameRow = editing
      ? `<div class="pf-edit"><input class="pf-field" maxlength="20" placeholder="Your name" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Your name"><button class="pf-done" data-act="done" data-press>Done</button></div>`
      : `<button class="pf-name" data-act="edit" data-press aria-label="Change your name"><b class="${account.name ? '' : 'empty'}">${esc(account.name || 'Your name')}</b><span class="pf-pen">${I.pencil}</span></button>`;
    return `<div class="pf-who">${avatarHTML()}<div class="pf-me">${nameRow}${since || prem ? `<div class="pf-meta">${since}${prem}</div>` : ''}</div></div>`;
  }

  function levelHTML(s) {
    const n = s.roundsWon || 0, lv = Level.at(n);
    const right = lv.next ? `${fmt(lv.next.at - n)} to ${esc(lv.next.title)}` : 'Top of the ladder';
    return `<div class="pf-level"><div class="pf-lvtop"><span class="pf-lvname">${esc(lv.title.toUpperCase())}</span><span class="pf-lvnext">${right}</span></div>
      <div class="pf-lvtrack"><i data-w="${(lv.frac * 100).toFixed(2)}%"></i></div></div>`;
  }

  const statCard = (value, name, icon, tint) => `<div class="pf-stat"><span class="pf-tile" style="background:${alpha(tint, 0.16)};color:${tint}">${icon}</span>
    <span class="pf-sv"><b class="${value === '—' ? 'dim' : ''}">${esc(value)}</b><small>${esc(name)}</small></span></div>`;

  function gridHTML(s) {
    return `<div class="pf-grid">
      ${statCard(fmt(s.roundsWon), 'Songs named', I.note, accent())}
      ${statCard(s.roundsPlayed ? pct(s) + '%' : '—', 'Win rate', TARGET, TIER_COLOR.impossible)}
      ${statCard(String(s.streak || 0), 'Streak', I.flame, TIER_COLOR.hard)}
      ${statCard(String(s.bestStreak || 0), 'Best streak', I.trophy, TIER_COLOR.medium)}</div>`;
  }

  /** Friends: the phone's row — who's online, requests waiting, or Songbot to 1v1 now. A tap opens the list. */
  function friendsRowHTML() {
    const g = TIER_COLOR.easy, req = Friends.requests.length, online = Friends.onlineCount;
    const real = Friends.friends.length - 1;          // Songbot is always there
    const line = !account.signedIn ? 'Sign in to add friends'
      : req ? `${req} friend request${req === 1 ? '' : 's'}`
      : real === 0 ? 'Add friends, or 1v1 Songbot now'
      : online > 0 ? `${online} online now` : `${real} friend${real === 1 ? '' : 's'}`;
    const lit = account.signedIn && (online > 0 || req > 0);
    return `<button class="pf-row" data-act="friends" data-press><span class="pf-tile" style="background:${alpha(g, 0.16)};color:${g}">${I.people}</span>
      <span class="pf-sv pf-rowtext"><b>Friends</b><small${lit ? ` style="color:${g}"` : ''}>${line}</small></span><span class="pf-chev">${I.chevron}</span></button>`;
  }

  /** A section the iOS way: its title above, its content on one surface. */
  const section = (title, inner, note = null) => `<section class="pf-sec"><div class="pf-sechd"><h2>${esc(title)}</h2>${note ? `<span>${esc(note)}</span>` : ''}</div>${inner}</section>`;
  const divider = '<div class="pf-div"></div>';
  const mini = (value, name) => `<div class="pf-mini"><b class="${value === '—' ? 'dim' : ''}">${esc(value)}</b><small>${esc(name)}</small></div>`;

  /** The daily: your streak as a flame and a week of days, then the record once you have played. */
  function dailyHTML(s) {
    const today = dailyNumber();
    const streak = Streak.live(s, today);
    const playedToday = s.lastDaily === today;
    const end = playedToday ? today : today - 1;
    const hard = TIER_COLOR.hard, tint = streak > 0 ? hard : '#4a4a4a';
    const days = [0, 1, 2, 3, 4, 5, 6].map(k => {
      const day = today - 6 + k, lit = streak > 0 && day <= end && day > end - streak;
      return `<div class="pf-day${k === 6 ? ' today' : ''}"><span class="pf-dot${lit ? ' lit' : ''}">${lit ? I.check : ''}</span><small>${esc(weekday(6 - k))}</small></div>`;
    }).join('');
    const record = s.dailyPlayed ? `${divider}<div class="pf-minis">${mini(String(s.dailyPlayed), 'Played')}${mini(String(s.dailyWon || 0), 'Named')}${mini(String(s.dailyBest || 0), 'Best streak')}</div>` : '';
    return `<div class="pf-card pf-daily">
      <div class="pf-hero"><span class="pf-big" style="color:${tint};background:${alpha(tint, 0.14)}">${I.flame}</span>
        <span class="pf-herot"><em style="color:${tint}">DAILY CHALLENGE</em><b>${streak === 0 ? 'No streak yet' : `${streak}-day streak`}</b><small>${playedToday ? "Today's done. Back tomorrow." : streak > 0 ? 'Play today to keep it going' : "Name today's song to start one"}</small></span></div>
      <div class="pf-week">${days}</div>${record}</div>`;
  }

  /** Wins by stage as five columns, the one you name most at lit. */
  function speedHTML(s, counts, total) {
    const top = Math.max(1, ...counts);
    let usual = null;
    if (total > 0) { usual = 0; counts.forEach((c, i) => { if (c > counts[usual]) usual = i; }); }
    const cols = counts.map((c, i) => {
      const on = usual === i;
      const fill = total === 0 ? 'var(--track)' : on ? accent() : alpha(accent(), 0.28);
      return `<div class="pf-col"><b style="color:${on ? accent() : 'var(--muted)'}">${total === 0 ? '' : c}</b>
        <span class="pf-colbar" data-h="${Math.max(8, 96 * c / top).toFixed(2)}px" style="background:${fill};transition-delay:${(0.05 * i).toFixed(2)}s"></span>
        <small class="${on ? 'on' : ''}">${label(STAGES[i])}</small></div>`;
    }).join('');
    const foot = total === 0 ? 'Name songs and this fills in with how early you get them.' : `You usually name it at ${label(STAGES[usual])}.`;
    return `<div class="pf-card pf-pad pf-speed"><div class="pf-cols${total === 0 ? ' empty' : ''}">${cols}</div><p>${esc(foot)}</p></div>`;
  }

  /** Wins per difficulty as five tiles, each in its level's colour. */
  const difficultyHTML = s => `<div class="pf-tiers">${TIERS.map(t => {
    const n = (s.winsByTier && s.winsByTier[t]) || 0, c = TIER_COLOR[t];
    return `<div class="pf-tier" style="background:${alpha(c, n === 0 ? 0.04 : 0.1)}"><i style="background:${c}"></i><b style="color:${n === 0 ? 'var(--dim)' : c}">${n}</b><small>${t === 'impossible' ? 'Imposs.' : cap(t)}</small></div>`;
  }).join('')}</div>`;

  /** Your rank as a player card in its own colour: the name big, the RP and the road to the next rank, the record and season badges. */
  function rankedHTML(s) {
    const rp = s.rp || 0, p = Ladder.place(rp), tint = p.tier.color;
    const next = p.nextAt != null ? `${fmt(p.nextAt - rp)} RP to ${Ladder.place(p.nextAt).name}` : 'Top rank';
    const record = s.rankedPlayed ? `<b class="pf-wl">${s.rankedWon || 0}W · ${(s.rankedPlayed || 0) - (s.rankedWon || 0)}L</b>` : '';
    const badges = (s.badges || []).slice().reverse().map(b => {
      const i = b.indexOf(':'), key = i < 0 ? '' : b.slice(0, i), name = i < 0 ? b : b.slice(i + 1);
      const c = (Ladder.tiers.find(t => name.startsWith(t.name)) || {}).color || 'var(--muted)';
      return `<span class="pf-badge" style="color:${c}">${ROSETTE}${esc(`${Ladder.seasonName(key)} · ${name}`)}</span>`;
    }).join('');
    return `<div class="pf-rankwrap"><div class="pf-rank" style="--rc:${tint}">
      <div class="pf-rtop"><div class="pf-rname"><em>RANKED</em><b>${esc(p.name)}</b><span>${fmt(rp)} RP</span></div><span class="pf-crown">${I.crown}</span></div>
      <div class="pf-rtrack"><i data-w="max(6px, ${(p.fraction * 100).toFixed(2)}%)"></i></div>
      <div class="pf-rfoot"><span>${esc(next)}</span>${record}</div>
      ${badges ? `<div class="pf-badges">${badges}</div>` : ''}</div></div>`;
  }

  /** What you've done, as one clean list; nothing you haven't done yet. */
  function careerRows(s) {
    const inst = (s.wonByStage && s.wonByStage[0]) || 0;
    return [
      [s.roundsPlayed ? fmt(s.roundsPlayed) : '', 'Rounds played', I.play, TIER_COLOR.easy],
      [inst ? fmt(inst) : '', 'Named at 0.1s', I.bolt, TIER_COLOR.medium],
      [s.laddersClimbed ? fmt(s.laddersClimbed) : '', 'Ladders climbed', STAIRS, TIER_COLOR.hard],
      [s.partiesPlayed ? `${s.partiesWon} of ${s.partiesPlayed}` : '', 'Parties won', I.people, TIER_COLOR.impossible],
      [s.bestPartyScore ? fmt(s.bestPartyScore) : '', 'Best party score', STAR, TIER_COLOR.expert],
      [s.partyPoints ? fmt(s.partyPoints) : '', 'Party points', I.sparkles, '#4cc9f0'],
    ].filter(r => r[0]);
  }
  const careerHTML = rows => `<div class="pf-card pf-clist">${rows.map(([v, n, icon, c], i) => `${i ? '<div class="pf-cdiv"></div>' : ''}<div class="pf-crow">
      <span class="pf-ctile" style="color:${c};background:${alpha(c, 0.14)}">${icon}</span><span class="pf-cn">${esc(n)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;

  const setting = (act, lbl, value, { tint = null, chevron = false } = {}) => {
    const inner = `<span class="pf-sl">${esc(lbl)}</span><b${tint ? ` style="color:${tint}"` : ''}>${esc(value)}</b>${chevron ? `<span class="pf-chev">${I.chevron}</span>` : ''}`;
    return act ? `<button class="pf-set" data-act="${act}" data-press>${inner}</button>` : `<div class="pf-set">${inner}</div>`;
  };

  function accountHTML() {
    const p = [];
    p.push(setting('edit', 'Name', account.name || 'Add a name', { tint: account.name ? 'var(--text)' : 'var(--dim)', chevron: true }), divider);
    p.push(`<div class="pf-set"><span class="pf-sl">Photo</span>${account.avatar ? '<button class="pf-link muted" data-act="unphoto">Remove</button>' : ''}<button class="pf-link" data-act="photo" style="color:${accent()}">${account.avatar ? 'Change' : 'Choose'}</button></div>`, divider);
    if (ctx.premium) p.push(setting(null, 'Plan', 'Premium', { tint: TIER_COLOR.medium }), divider, setting('portal', 'Manage subscription', '', { chevron: true }));
    else p.push(setting('premium', 'Plan', 'Free · Go premium', { tint: accent(), chevron: true }));
    p.push(divider);
    if (account.signedIn) {
      p.push(setting('signout', 'Sign out', '', { chevron: true }), divider);
      p.push(`<button class="pf-set pf-del" data-act="delete" data-press ${deleting ? 'disabled' : ''}><span>${deleting ? 'Deleting…' : 'Delete account'}</span></button>`);
    } else {
      p.push(setting('signin', 'Sign in', 'Keep your stats', { tint: accent(), chevron: true }));
    }
    return p.join('');
  }

  // ---------- render ----------
  function render() {
    // keep a half-typed name through a re-render
    const f0 = body.querySelector('.pf-field');
    const draft = f0 ? f0.value : null, caret = f0 ? f0.selectionStart : null;
    const s = account.stats;
    const total = (s.wonByStage || []).slice(0, 5).reduce((a, b) => a + (b || 0), 0);
    node.style.setProperty('--pf-accent', accent());
    const counts = STAGES.map((_, i) => (s.wonByStage && s.wonByStage[i]) || 0);
    const career = careerRows(s);
    body.innerHTML = whoHTML() + levelHTML(s) + gridHTML(s) + friendsRowHTML()
      + rankedHTML(s) + dailyHTML(s)
      + (total > 0 ? section('How fast you name them', `<div class="pf-stack">${speedHTML(s, counts, total)}${difficultyHTML(s)}</div>`, `${fmt(total)} named`) : '')
      + (career.length ? section('Career', careerHTML(career)) : '')
      + section('Account', `<div class="pf-card pf-acct">${accountHTML()}</div>`)
      + (deleteError ? `<p class="pf-err">${esc(deleteError)}</p>` : '');
    const f = body.querySelector('.pf-field');
    if (f) {
      f.value = draft ?? account.name;
      f.focus({ preventScroll: true });
      const at = caret ?? f.value.length; try { f.setSelectionRange(at, at); } catch (e) {}
      f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitName(); } });
    }
    // the bars and columns grow in on first show (level: the stage's curve, 0.6 s;
    // columns: spring(0.55, 0.85); rank line: spring(0.7, 0.9) after 0.2 s); later renders land at once
    const grow = [...body.querySelectorAll('[data-w],[data-h]')];
    const land = n => { if (n.dataset.w) n.style.width = n.dataset.w; if (n.dataset.h) n.style.height = n.dataset.h; };
    if (first) {
      first = false;
      body.classList.add('pf-rise');
      body.querySelectorAll('.pf-colbar').forEach(n => { n.style.transition = `height ${COLS.css}`; });
      body.querySelectorAll('.pf-rtrack i').forEach(n => { n.style.transition = `width ${RANKBAR.css} .2s`; });
      body.querySelectorAll('.pf-colbar').forEach((n, i) => { n.style.transitionDelay = `${(0.05 * i).toFixed(2)}s`; });
      requestAnimationFrame(() => requestAnimationFrame(() => grow.forEach(land)));
    } else {
      grow.forEach(n => { n.style.transition = 'none'; land(n); });
    }
  }

  // ---------- actions ----------
  function commitName() {
    const f = body.querySelector('.pf-field');
    const v = f ? f.value : '';
    editing = false;
    account.rename(v);        // emits (and so re-renders) only when it changed
    render();
  }

  function confirm({ title, message, action, run }) {
    sheetOpen = true;
    const sh = openSheet(`<div class="pf-confirm"><h3>${esc(title)}</h3><p>${esc(message)}</p>
      <button class="btn pf-danger" data-go data-press>${esc(action)}</button>
      <button class="btn surface" data-no data-press>Cancel</button></div>`, { label: title, onClose: () => setTimeout(() => { sheetOpen = false; }, 0) });
    sh.body.querySelector('[data-no]').addEventListener('click', sh.close);
    sh.body.querySelector('[data-go]').addEventListener('click', () => { sh.close(); run(); });
  }

  async function openPortal() {
    try {
      const token = await (await import('./supabase.js')).auth.token();
      if (!token) throw new Error('no session');
      const r = await fetch('/api/portal', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error('portal ' + r.status);
      const { url } = await r.json();
      if (!url) throw new Error('no url');
      location.href = url;
    } catch (e) { ctx.toast("Couldn't open billing right now."); }
  }

  file.addEventListener('change', async () => {
    const f = file.files && file.files[0]; file.value = '';
    if (!f) return;
    try { account.setAvatar(await encodeAvatar(f)); } catch (e) { ctx.toast("Couldn't use that picture. Try another."); }
  });

  node.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    switch (b.dataset.act) {
      case 'close': return close();
      case 'edit': if (editing) return commitName(); editing = true; return render();
      case 'done': return commitName();
      case 'photo': return file.click();
      case 'unphoto': return account.setAvatar(null);
      case 'premium': close(); return ctx.openPremium(null);
      case 'portal': return openPortal();
      case 'signin': return ctx.signIn();
      case 'friends': Haptics.select();
        if (!account.signedIn) { ctx.toast('Sign in to add friends.'); return ctx.signIn(); }
        return ctx.openFriends();
      case 'signout': return confirm({ title: 'Sign out of Songspot?', message: 'Your stats stay on your account. Sign in again any time to pick them up.', action: 'Sign out',
        run: async () => { await account.signOut(); close(); ctx.toast('Signed out.'); } });
      case 'delete': return confirm({ title: 'Delete your account?', message: 'Your name, picture and every stat are erased from Songspot for good. This cannot be undone.', action: 'Delete account',
        run: async () => {
          deleting = true; deleteError = null; render();
          try { await account.deleteAccount(); deleting = false; close(); ctx.toast('Your account is deleted.'); }
          catch (err) { deleting = false; deleteError = 'Could not delete the account right now. Check your connection and try again.'; render(); }
        } });
    }
  });

  const onKey = e => {
    if (e.key !== 'Escape' || sheetOpen) return;
    if (editing) { e.preventDefault(); editing = false; render(); return; }
    close();
  };
  const offAccount = account.onChange(() => { if (!closed) render(); });
  // The Friends row's line: the list again as the profile opens (ProfileView's .task { refresh }).
  let friendsLine = '';
  const offFriends = Friends.onChange(() => {
    const row = body.querySelector('.pf-row[data-act="friends"]'); if (closed || !row) return;
    const html = friendsRowHTML(); if (html === friendsLine) return; friendsLine = html;
    row.replaceWith(el(html));
  });
  const off = () => { offAccount(); offFriends(); };
  function close() { if (closed) return; closed = true; off(); document.removeEventListener('keydown', onKey); popView(node); }

  document.addEventListener('keydown', onKey);
  render();
  pushView(node);
  if (account.signedIn) Friends.refresh();
  return { close };
}
