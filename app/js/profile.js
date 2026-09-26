// The profile, as the iPhone app's ProfileView.swift draws it: the avatar in
// an accent ring, the name, the level bar, four stat cards two by two, then
// the panels — Daily challenge, where you name it, per difficulty, ranked,
// stats and the account. A guest sees their local stats and a way to sign in.
import { el, esc, pushView, popView, openSheet, cap, label, alpha, TIER_COLOR, PILL_FILL, PILL_INK, TIERS } from './ui.js';
import { I } from './icons.js';
import { Level } from './account.js';

const STAGES = [0.1, 0.5, 2, 8, 15];
/** SF "target", which icons.js does not carry. */
const TARGET = `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>`;

/** Daily.number(): day one is 19 Sep 2026, UTC. */
const dailyNumber = (d = Date.now()) => Math.max(1, Math.floor((d - Date.UTC(2026, 8, 19)) / 864e5) + 1);
/** Ranked.rank */
const rankTier = r => (r < 1100 ? 'easy' : r < 1300 ? 'medium' : r < 1500 ? 'hard' : r < 1700 ? 'expert' : 'impossible');
const fmt = n => Number(n || 0).toLocaleString('en-US');
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

  const node = el(`<div class="view profile" role="dialog" aria-modal="true" aria-label="Profile">
    <div class="pf-bar"><div class="pf-barin"><h1>Profile</h1><button class="xbtn" data-act="close" data-press aria-label="Close">${I.x}</button></div></div>
    <div class="screen pf-screen"><div class="pf-body"></div></div>
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

  /** Where the phone has the Friends row; on the web a guest gets the way to sign in. */
  function signInRowHTML() {
    if (account.signedIn) return '';
    const g = TIER_COLOR.easy;
    return `<button class="pf-row" data-act="signin" data-press><span class="pf-tile" style="background:${alpha(g, 0.16)};color:${g}">${I.person}</span>
      <span class="pf-sv pf-rowtext"><b>Sign in</b><small style="color:${g}">Sign in to keep your stats on every device</small></span><span class="pf-chev">${I.chevron}</span></button>`;
  }

  const panel = (title, inner) => `<section class="pf-panel"><h2>${esc(title.toUpperCase())}</h2>${inner}</section>`;
  const figure = (value, name) => `<div class="pf-fig"><b class="${value === '—' ? 'dim' : ''}">${esc(value)}</b><small>${esc(name.toUpperCase())}</small></div>`;

  function dailyHTML(s) {
    const live = (s.lastDaily || 0) >= dailyNumber() - 1 ? (s.dailyStreak || 0) : 0;
    return `<div class="pf-figs"><div class="pf-fig"><span class="pf-dstreak"><span class="pf-flame" style="color:${live > 0 ? TIER_COLOR.hard : 'var(--dim)'}">${I.flame}</span><b>${live}</b></span><small>STREAK</small></div>
      ${figure(s.dailyPlayed ? String(s.dailyPlayed) : '—', 'Played')}
      ${figure(s.dailyWon ? String(s.dailyWon) : '—', 'Named')}
      ${figure(s.dailyBest ? String(s.dailyBest) : '—', 'Best')}</div>`;
  }

  /** Horizontal bars, the longest filling the row; the lit one in its colour, the rest sit back. */
  function barsHTML(items, lit) {
    const top = Math.max(1, ...items.map(it => it.count));
    return `<div class="pf-bars">${items.map((it, i) => {
      const on = lit == null ? it.count > 0 : i === lit;
      const fill = it.count === 0 ? 'var(--track)' : on ? it.tint : alpha(it.tint, 0.28);
      const ink = it.count === 0 ? 'var(--dim)' : on ? PILL_INK : 'var(--text)';
      const want = it.count === 0 ? '30px' : `max(34px, ${(100 * it.count / top).toFixed(2)}%)`;
      return `<div class="pf-barrow"><span class="pf-blabel">${esc(it.label)}</span><span class="pf-btrack"><span class="pf-bfill" data-w="${want}" style="background:${fill};color:${ink};transition-delay:${(0.05 * i).toFixed(2)}s">${it.count}</span></span></div>`;
    }).join('')}</div>`;
  }

  function distributionHTML(s) {
    const counts = STAGES.map((_, i) => (s.wonByStage && s.wonByStage[i]) || 0);
    const total = counts.reduce((a, b) => a + b, 0);
    let usual = null;
    if (total > 0) { usual = 0; counts.forEach((c, i) => { if (c > counts[usual]) usual = i; }); }
    return barsHTML(counts.map((c, i) => ({ label: label(STAGES[i]), count: c, tint: accent() })), usual);
  }

  const tiersHTML = s => barsHTML(TIERS.map(t => ({ label: cap(t), count: (s.winsByTier && s.winsByTier[t]) || 0, tint: PILL_FILL[t] })), null);

  const divider = '<div class="pf-div"></div>';
  const row = (lbl, value, { tint = null, last = false } = {}) => `<div class="pf-lrow"><span>${esc(lbl)}</span><b class="${!tint && value === '—' ? 'dim' : ''}"${tint ? ` style="color:${tint}"` : ''}>${esc(value)}</b></div>${last ? '' : divider}`;

  function rankedHTML(s) {
    const rating = s.rating || 1000, t = rankTier(rating), recent = (s.recentRanked || []).slice(-5);
    const dots = recent.map(r => `<i style="background:${r === 1 ? TIER_COLOR.easy : r === 0 ? TIER_COLOR.expert : 'var(--surface2)'}"></i>`).join('')
      + '<i class="empty"></i>'.repeat(Math.max(0, 5 - recent.length));
    return `<div class="pf-rk"><span class="pf-rkbadge" style="background:${PILL_FILL[t]}">${cap(t).toUpperCase()}</span>
      <span class="pf-sv"><b>${fmt(rating)}</b><small>${s.rankedPlayed ? `Rating · best ${fmt(s.bestRating)}` : 'Rating · play ranked to move it'}</small></span>
      <span class="pf-dots">${dots}</span></div>${divider}
      ${row('This season', s.rankedPlayed ? `${s.rankedWon} won of ${s.rankedPlayed}` : '—')}
      ${row('Ranked points', s.rankedPoints ? fmt(s.rankedPoints) : '—', { last: true })}`;
  }

  function ledgerHTML(s) {
    const inst = (s.wonByStage && s.wonByStage[0]) || 0;
    return row('Best streak', s.bestStreak ? `${s.bestStreak} in a row` : '—')
      + (s.streak > 1 ? row('Right now', `${s.streak} in a row`, { tint: accent() }) : '')
      + row('Instant hits', inst ? `${inst} at 0.1s` : '—')
      + row('Ladders climbed', s.laddersClimbed ? fmt(s.laddersClimbed) : '—')
      + row('Parties', s.partiesPlayed ? `${s.partiesWon} won of ${s.partiesPlayed}` : '—')
      + row('Party rounds named', s.partyRoundsWon ? fmt(s.partyRoundsWon) : '—')
      + row('Best party score', s.bestPartyScore ? fmt(s.bestPartyScore) : '—')
      + row('Party points', s.partyPoints ? fmt(s.partyPoints) : '—', { last: true });
  }

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
    const total = (s.wonByStage || []).reduce((a, b) => a + (b || 0), 0);
    node.style.setProperty('--pf-accent', accent());
    body.innerHTML = whoHTML() + levelHTML(s) + gridHTML(s) + signInRowHTML()
      + panel('Daily challenge', dailyHTML(s))
      + panel(total === 0 ? "Where you'll name it" : 'Where you name it', distributionHTML(s))
      + panel('Named per difficulty', tiersHTML(s))
      + panel('Ranked', rankedHTML(s))
      + panel('Stats', ledgerHTML(s))
      + panel('Account', accountHTML())
      + (deleteError ? `<p class="pf-err">${esc(deleteError)}</p>` : '');
    const f = body.querySelector('.pf-field');
    if (f) {
      f.value = draft ?? account.name;
      f.focus({ preventScroll: true });
      const at = caret ?? f.value.length; try { f.setSelectionRange(at, at); } catch (e) {}
      f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitName(); } });
    }
    // the bars grow in on first show (0.6 s, the stage's curve); later renders land at once
    const fills = body.querySelectorAll('[data-w]');
    if (first) {
      first = false;
      body.classList.add('pf-rise');
      setTimeout(() => fills.forEach(n => { n.style.width = n.dataset.w; }), 60);
    } else {
      fills.forEach(n => { n.style.transition = 'none'; n.style.width = n.dataset.w; });
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
  const off = account.onChange(() => { if (!closed) render(); });
  function close() { if (closed) return; closed = true; off(); document.removeEventListener('keydown', onKey); popView(node); }

  document.addEventListener('keydown', onKey);
  render();
  pushView(node);
  return { close };
}
