// The player, told in the stage's own words: one big figure set like the
// wordmark, where you usually name a song shown on the real clip bar, wins
// under the real tier pills, and the rest as a plain ledger. No tiles.
import { el, pushView, popView, esc, label, cap, TIER_COLOR, TIER_INK } from './ui.js';
import { TIERS, STAGES } from './pool.js';
import { PRICE, G } from './premium.js';

const CSS = new URL('../css/profile.css', import.meta.url);
function styles() { if (!document.querySelector('link[data-profile]')) document.head.appendChild(el(`<link rel="stylesheet" href="${CSS}" data-profile>`)); }

const X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const CAMERA = '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M9 4L7.5 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.5L15 4H9zm3 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/></svg>';
const PENCIL = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.3V21h3.7L17.8 9.9l-3.7-3.7L3 17.3zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7L20.7 7z"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9z"/></svg>';
const PERSON = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0H4z"/></svg>';

/** The stage's per-stage positions along the bar, in percent. */
const STAGE_POS = [1, 5.5, 24.3, 41.3, 100];
const n = v => (v || 0).toLocaleString();

/**
 * The iPhone's confirmation dialog: a small grey title and line of explanation
 * over the one destructive action, Cancel in its own card underneath, rising
 * over a dimmed screen. Resolves true on the action, false on cancel.
 */
export function confirm({ title = null, message = null, action, glyph = null }) {
  return new Promise(resolve => {
    const view = el(`<div class="view sheet confirm" role="alertdialog">
      <div class="scrim"></div>
      <div class="stackup">
        <div class="cardc">
          ${title || message ? `<div class="lead">${title ? `<b>${esc(title)}</b>` : ''}${message ? `<div>${esc(message)}</div>` : ''}</div>` : ''}
          <button class="act" data-press>${glyph || ''}${esc(action)}</button>
        </div>
        <div class="cardc"><button class="cancel" data-press>Cancel</button></div>
      </div>
    </div>`);
    const end = ok => { popView(view); document.removeEventListener('keydown', onKey); resolve(ok); };
    const onKey = e => { if (e.key === 'Escape') end(false); };
    view.querySelector('.scrim').addEventListener('click', () => end(false));
    view.querySelector('.cancel').addEventListener('click', () => end(false));
    view.querySelector('.act').addEventListener('click', () => end(true));
    document.addEventListener('keydown', onKey);
    pushView(view);
  });
}

/**
 * A profile picture is a small square JPEG, base64, small enough to travel
 * with a party's lobby message — the same bytes the apps make. Scale-fills
 * the picked image into 128×128 and takes the first quality under 14 000 bytes.
 */
export async function encodeAvatar(file, side = 128) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const c = document.createElement('canvas'); c.width = c.height = side;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, side, side);
    const s = Math.max(side / img.width, side / img.height), w = img.width * s, h = img.height * s;
    g.imageSmoothingQuality = 'high'; g.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
    for (const q of [0.72, 0.55, 0.4, 0.3, 0.2]) {
      const b64 = c.toDataURL('image/jpeg', q).split(',')[1];
      if (b64.length * 0.75 <= 14000 || q === 0.2) return b64;
    }
  } finally { URL.revokeObjectURL(url); }
}

/** Full-screen view over the stage. Returns a close function. */
export function mountProfile(ctx) {
  styles();
  const { account } = ctx;
  let editing = false, draft = '', deleting = false, deleteError = null, shown = false, lastWon = null;

  const view = el(`<div class="view profile" role="dialog" aria-label="Profile">
    <div class="column">
      <div class="bar"><h1>Profile</h1><button class="close" aria-label="Close" data-press>${X}</button></div>
      <div class="body"></div>
    </div>
  </div>`);
  const body = view.querySelector('.body');

  const paint = () => {
    const s = account.stats, premium = !!account.premium;
    const counts = [0, 1, 2, 3, 4].map(i => s.wonByStage?.[i] || 0), total = counts.reduce((a, b) => a + b, 0);
    const usual = counts.indexOf(Math.max(...counts));
    const since = account.memberSince ? account.memberSince.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : null;
    const rate = s.roundsPlayed ? Math.round(100 * s.roundsWon / s.roundsPlayed) : 0;
    const rows = [
      ['Best streak', s.bestStreak ? `${s.bestStreak} in a row` : '—'],
      s.streak > 1 ? ['Right now', `${s.streak} in a row`, true] : null,
      ['Instant hits', counts[0] ? `${n(counts[0])} at 0.1s` : '—'],
      ['Ladders climbed', s.laddersClimbed ? n(s.laddersClimbed) : '—'],
      ['Parties', s.partiesPlayed ? `${s.partiesWon} won of ${n(s.partiesPlayed)}` : '—'],
      ['Party rounds named', s.partyRoundsWon ? n(s.partyRoundsWon) : '—'],
      ['Best party score', s.bestPartyScore ? n(s.bestPartyScore) : '—'],
      ['Party points', s.partyPoints ? n(s.partyPoints) : '—'],
      ['Ranked rating', s.rankedPlayed ? `${n(s.rating)} · best ${n(s.bestRating)}` : '—'],
      ['Ranked', s.rankedPlayed ? `${s.rankedWon} won of ${n(s.rankedPlayed)}` : '—'],
    ].filter(Boolean);
    const rolled = lastWon !== null && lastWon !== s.roundsWon; lastWon = s.roundsWon;

    body.innerHTML = `
      <div class="who">
        <div class="pic" data-press title="Change photo">
          ${account.avatar ? `<img class="face" src="data:image/jpeg;base64,${account.avatar}" alt="">`
            : `<span class="face">${account.name.trim() ? esc(account.initial) : PERSON}</span>`}
          <span class="cam">${CAMERA}</span>
          <input type="file" accept="image/*">
        </div>
        <div class="me">
          ${editing
            ? `<div class="edit"><input type="text" maxlength="20" placeholder="Your name" value="${esc(draft)}" autocomplete="off" spellcheck="false"><button class="ok">Done</button></div>`
            : `<div class="name" data-act="edit"><b class="${account.name ? '' : 'empty'}">${esc(account.name || 'Your name')}</b>${PENCIL}</div>`}
          <div class="since">${since ? `<span>Since ${esc(since)}</span>` : ''}${premium ? '<span class="prem">PREMIUM</span>' : ''}</div>
          ${account.avatar ? '<button class="rm" data-act="remove">Remove photo</button>' : ''}
        </div>
      </div>
      <div class="figure"><b class="${rolled ? 'rise' : ''}">${n(s.roundsWon)}</b><span>${s.roundsPlayed ? `songs named · ${rate}% of ${n(s.roundsPlayed)} rounds` : 'songs named. Your first round starts the count.'}</span></div>
      <div class="naming">
        <span class="kicker">${total ? 'WHERE YOU USUALLY NAME IT' : "WHERE YOU'LL NAME IT"}</span>
        <div class="clipbar">
          <div class="trk">
            ${total ? `<div class="fill" style="width:${shown ? STAGE_POS[usual] : 0}%"></div>` : ''}
            ${[0, 1, 2, 3].filter(i => i !== usual && STAGE_POS[i] <= 45).map(i => `<i class="mark" style="left:${STAGE_POS[i]}%"></i>`).join('')}
          </div>
          ${total ? `<div class="caret" style="left:${STAGE_POS[usual]}%"><i></i><b class="mono">${label(STAGES[usual])}</b></div>` : ''}
        </div>
        <div class="counts">${counts.map((c, i) => `<div><b class="mono ${c ? '' : 'zero'}">${c}</b><span class="mono">${label(STAGES[i])}</span></div>`).join('')}</div>
      </div>
      <div class="rail">
        <span class="kicker">NAMED PER DIFFICULTY</span>
        <div class="row">${TIERS.map(t => { const c = s.winsByTier?.[t] || 0; return `<div><span class="pill ${c ? 'on' : ''}" style="--c:${TIER_COLOR[t]};--ink:${TIER_INK[t]}">${cap(t)}</span><b class="mono ${c ? '' : 'zero'}">${c}</b></div>`; }).join('')}</div>
      </div>
      <div class="ledger">${rows.map(([k, v, tint]) => `<div class="r"><span>${esc(k)}</span><b class="mono ${tint ? 'tint' : v === '—' ? 'zero' : ''}">${esc(v)}</b></div>`).join('')}</div>
      ${premium ? '' : `<button class="buy" data-act="buy" data-press>${G.crown}Go premium — ${PRICE}</button>`}
      <button class="out" data-act="signout">Sign out</button>
      <button class="del" data-act="delete" ${deleting ? 'disabled' : ''}>${deleting ? 'Deleting…' : 'Delete account'}</button>
      ${deleteError ? `<p class="err">${esc(deleteError)}</p>` : ''}`;

    // the bar fills once, after the first paint, like the stage's own
    if (!shown) { shown = true; const f = body.querySelector('.fill'); if (f) requestAnimationFrame(() => requestAnimationFrame(() => { f.style.width = STAGE_POS[usual] + '%'; })); }
    if (editing) { const i = body.querySelector('.edit input'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  };

  // ---- name
  const commit = () => { account.rename(draft); editing = false; paint(); };
  body.addEventListener('input', e => { if (e.target.matches('.edit input')) draft = e.target.value; });
  body.addEventListener('keydown', e => {
    if (!e.target.matches('.edit input')) return;
    if (e.key === 'Enter') commit(); else if (e.key === 'Escape') { editing = false; paint(); }
  });

  // ---- photo: tap picks, long-press or right-click offers to remove
  let hold = null, held = false;
  const removePhoto = async () => { if (account.avatar && await confirm({ action: 'Remove photo', glyph: TRASH })) account.setAvatar(null); };
  body.addEventListener('pointerdown', e => { if (e.target.closest('.pic')) { held = false; hold = setTimeout(() => { held = true; removePhoto(); }, 500); } });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => body.addEventListener(ev, () => clearTimeout(hold), true));
  body.addEventListener('contextmenu', e => { if (e.target.closest('.pic')) { e.preventDefault(); clearTimeout(hold); removePhoto(); } });
  body.addEventListener('change', async e => {
    if (!e.target.matches('.pic input')) return;
    const f = e.target.files?.[0]; if (!f) return;
    try { const b64 = await encodeAvatar(f); if (b64) account.setAvatar(b64); } catch (x) { ctx.toast("Couldn't read that picture."); }
  });

  // ---- everything else, by data-act
  body.addEventListener('click', async e => {
    if (e.target.closest('.pic')) { if (!held) body.querySelector('.pic input').click(); held = false; return; }
    if (e.target.closest('.ok')) return commit();
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'edit') { draft = account.name; editing = true; paint(); }
    else if (act === 'remove') removePhoto();
    else if (act === 'buy') ctx.openPremium(null);
    else if (act === 'signout') {
      if (await confirm({ title: 'Sign out of Songspot?', message: 'Your stats stay on your account. Sign in again any time to pick them up.', action: 'Sign out' })) { await account.signOut(); close(); }
    } else if (act === 'delete' && !deleting) {
      if (!await confirm({ title: 'Delete your account?', message: 'Your name, picture and every stat are erased from Songspot for good. This cannot be undone.', action: 'Delete account' })) return;
      deleting = true; deleteError = null; paint();
      try { await account.deleteAccount(); close(); }
      catch (x) { deleteError = "Couldn't delete your account. Check your connection and try again."; deleting = false; paint(); }
    }
  });

  const close = () => { off(); popView(view); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape' && !editing && !document.querySelector('.confirm')) close(); };
  view.querySelector('.close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  const off = account.onChange(() => paint());
  paint();
  pushView(view);
  return close;
}
