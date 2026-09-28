// FriendsView.swift: your code to share (with its QR), a box for theirs,
// requests, and everyone you've added with who's online. An online friend —
// and Songbot, always — can be challenged to a 1v1, which opens a two-player
// party they are invited to. FriendQRSheet is here too; the web doesn't scan.
import { esc, morph, openSheet, shareText, toast, PARTY_PALETTE } from './ui.js';
import { I } from './icons.js';
import { Haptics } from './haptics.js';
import { Ladder } from './ladder.js';
import { Friends, isBot, isOnline, seenLabel, accepted, friendLink } from './friends.js';

/** SF "cpu", "qrcode" and "doc.on.doc", which icons.js does not carry. */
const CPU = `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5"/><rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="currentColor" stroke="none"/><path d="M9.5 2.5v3M14.5 2.5v3M9.5 18.5v3M14.5 18.5v3M2.5 9.5h3M2.5 14.5h3M18.5 9.5h3M18.5 14.5h3"/></svg>`;
const QR = `<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M3 3h8v8H3zm2 2v4h4V5zM13 3h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4z"/><rect x="6" y="6" width="2" height="2"/><rect x="16" y="6" width="2" height="2"/><rect x="6" y="16" width="2" height="2"/><rect x="13" y="13" width="3" height="3"/><rect x="18" y="13" width="3" height="3"/><rect x="15.5" y="15.5" width="3" height="3"/><rect x="13" y="18" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/></svg>`;
const COPY = `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 5.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8.5a2 2 0 0 0 2 2h.5"/></svg>`;

const GREEN = 'var(--easy)';
const hueOf = id => [...String(id)].reduce((a, ch) => a + ch.codePointAt(0), 0) % 7;

/** A friend's face: Songbot's chip, their picture, or the initial on their colour; the online dot on accepted friends. */
function avatar(f, size) {
  let inner;
  if (isBot(f)) inner = `<span class="fv-face bot" style="width:${size}px;height:${size}px;font-size:${(size * 0.4).toFixed(1)}px">${CPU}</span>`;
  else if (f.avatar) inner = `<img class="fv-face" src="data:image/jpeg;base64,${esc(f.avatar)}" alt="" style="width:${size}px;height:${size}px">`;
  else inner = `<span class="fv-face" style="width:${size}px;height:${size}px;background:${PARTY_PALETTE[hueOf(f.id)]};font-size:${(size * 0.42).toFixed(1)}px">${esc(((f.name || '?').trim()[0] || '?').toUpperCase())}</span>`;
  const dot = accepted(f) ? `<i class="fv-dot ${isOnline(f) ? 'on' : ''}" style="width:${(size * 0.28).toFixed(1)}px;height:${(size * 0.28).toFixed(1)}px"></i>` : '';
  return `<span class="fv-av">${inner}${dot}</span>`;
}

// Test knob, this machine only (the app's -demoFriends): ?friendsDemo=1 fills the list with sample friends.
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
function demoFriends() {
  const ago = m => new Date(Date.now() - m * 60000).toISOString();
  Friends.code = 'K7QX4M'; Friends.loaded = true;
  Friends.list = [
    { id: 'd1', name: 'Mia', avatar: null, rating: 1180, last_active: ago(0), status: 'accepted', incoming: false },
    { id: 'd2', name: 'Noah', avatar: null, rating: 980, last_active: ago(0), status: 'accepted', incoming: false },
    { id: 'd3', name: 'Liv', avatar: null, rating: 760, last_active: ago(180), status: 'accepted', incoming: false },
    { id: 'd4', name: 'Theo', avatar: null, rating: 900, last_active: null, status: 'pending', incoming: true },
    { id: 'd5', name: 'Sofia', avatar: null, rating: 900, last_active: null, status: 'pending', incoming: false },
  ];
}

export function openFriends(ctx) {
  const { account } = ctx;
  if (document.querySelector('.friends-sheet')) return;
  const demo = local && new URLSearchParams(location.search).has('friendsDemo');
  if (demo) demoFriends();
  const signedIn = () => demo || account.signedIn;
  let entry = '', note = null, adding = false, copied = false, closed = false, confirmOpen = false, signingIn = false;
  // The QR drawn inline in the desktop layout's side panel (the phone keeps it behind the QR button).
  let qrInline = '', qrFor = null;
  const wide = () => document.documentElement.classList.contains('xwide');

  const sh = openSheet(`<div class="friends-v"><div class="fv-head"><span class="fv-title">Friends</span><button class="xbtn" data-press data-act="close" aria-label="Close">${I.x}</button></div><div class="fv-main"></div></div>`,
    { cls: 'tall friends-sheet', label: 'Friends', onClose: () => {
      closed = true; cleanup();
      // A friend's link, turned down: don't reopen Friends on every visit. Kept through a sign-in.
      if (!signedIn() && !signingIn) Friends.pendingCode = null;
    } });
  const main = sh.body.querySelector('.fv-main');
  const label = t => `<p class="fv-label">${esc(t)}</p>`;
  const grouped = (items, row) => `<div class="fv-group">${items.map(row).join('')}</div>`;

  const codeCard = () => {
    const c = Friends.code;
    if (c && wide() && qrFor !== c) {
      qrFor = c;
      qrSVG(friendLink(c)).then(svg => { qrInline = svg; render(); }, () => {});
    }
    return `<div class="fv-code" data-k="code">
      <div class="fv-codehd">${label('Your friend code')}<small>Share it so friends can add you</small></div>
      <div class="fv-coderow"><span class="fv-codev ${c ? '' : 'none'}">${esc(c || '······')}</span>
      ${c ? `<button class="fv-cbtn" data-press data-act="qr" aria-label="Show my QR code">${QR}</button>
        <button class="fv-cbtn ${copied ? 'copied' : ''}" data-press data-act="copy" aria-label="Copy my friend code">${copied ? I.check : COPY}</button>
        <button class="fv-cbtn" data-press data-act="share" aria-label="Share my friend code">${I.share}</button>` : ''}</div>
      ${c && qrInline && qrFor === c ? `<div class="fv-qrin"><div class="fv-qrbox" role="img" aria-label="QR code to add me">${qrInline}</div><small>Or let them scan it with their camera</small></div>` : ''}</div>`;
  };
  const addBox = () => `<div class="fv-add" data-k="add"><div class="fv-addrow">
      <input class="fv-in" value="${esc(entry)}" placeholder="Add a friend's code" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="send" aria-label="Add a friend's code">
      <button class="fv-addbtn ${entry.length === 6 || adding ? 'on' : ''}" data-press data-act="add" ${entry.length !== 6 || adding ? 'disabled' : ''}>${adding ? '<span class="fv-spin"></span>' : 'Add'}</button></div>
      ${note ? `<p class="fv-note">${esc(note)}</p>` : ''}</div>`;
  const friendRow = f => `<div class="fv-row" data-k="f-${esc(f.id)}" data-id="${esc(f.id)}">${avatar(f, 44)}
      <span class="fv-tx"><b>${esc(f.name)}</b><small><span class="${isOnline(f) ? 'on' : ''}">${isBot(f) ? 'Bot' : esc(seenLabel(f))}</span><span class="dim">${isBot(f) ? ' · always ready' : ` · ${esc(Ladder.place(f.rating).name)}`}</span></small></span>
      ${isOnline(f) ? `<button class="fv-chal" data-press data-act="challenge" data-id="${esc(f.id)}" ${Friends.inParty ? 'disabled' : ''}>${I.bolt}<span>Challenge</span></button>` : ''}
</div>`;
  const requestRow = f => `<div class="fv-row" data-k="r-${esc(f.id)}">${avatar(f, 40)}
      <span class="fv-tx"><b>${esc(f.name)}</b><small>Wants to be friends</small></span>
      <button class="fv-no" data-press data-act="decline" data-id="${esc(f.id)}" aria-label="Decline">${I.x}</button>
      <button class="fv-yes" data-press data-act="accept" data-id="${esc(f.id)}">Accept</button></div>`;
  const sentRow = f => `<div class="fv-row sent" data-k="s-${esc(f.id)}">${avatar(f, 36)}
      <span class="fv-tx"><b>${esc(f.name)}</b></span><small class="fv-wait">Waiting</small>
      <button class="fv-cancel" data-press data-act="unsend" data-id="${esc(f.id)}">Cancel</button></div>`;
  const skeleton = n => `<div class="fv-skel" data-k="skel">${Array.from({ length: n }, (_, i) => `<div><i class="c"></i><span><i style="width:${[120, 96, 140][i % 3]}px"></i><i style="width:${[70, 90, 60][i % 3]}px"></i></span></div>`).join('')}</div>`;

  function render() {
    if (closed) return;
    if (!signedIn()) {
      morph(main, `<div class="fv-empty" data-k="out"><span class="fv-etile">${I.people}</span><b>Sign in to add friends</b><p>Your friends, who's online and a 1v1 with any of them, in one place.</p><button class="fv-get" data-press data-act="signin">Sign in</button></div>`);
      return;
    }
    const fr = Friends.friends, req = Friends.requests, sent = Friends.sent;
    // Two groups: your code, theirs and the requests (a side panel on a desktop), then the
    // list. On a phone both are display: contents, so the page reads top to bottom as before.
    morph(main, `<div class="fv-scroll" data-k="in"><div class="fv-side" data-k="side">${codeCard()}${addBox()}
      ${req.length ? `<div data-k="req">${label('Requests')}${grouped(req, requestRow)}</div>` : ''}</div>
      <div class="fv-list" data-k="list"><div data-k="fr">${label(fr.length ? `Your friends · ${Friends.onlineCount} online` : 'Your friends')}
      ${!Friends.loaded ? skeleton(3) : fr.length ? grouped(fr, friendRow) : '<p class="fv-none">No friends yet. Share your code, or add theirs.</p>'}</div>
      ${sent.length ? `<div data-k="sent">${label('Sent')}${grouped(sent, sentRow)}</div>` : ''}</div></div>`);
  }

  async function add() {
    if (entry.length !== 6 || adding) return;
    adding = true; render();
    sh.body.querySelector('.fv-in')?.blur();
    const msg = await Friends.add(entry);
    adding = false; note = msg;
    if (msg === 'Request sent.' || msg === "You're now friends.") entry = '';
    render();
  }
  /** A code that came by link: fill the box and add it (FriendsView's .task). */
  async function takePending() {
    const c = Friends.pendingCode;
    if (!c || !account.signedIn) return;
    Friends.pendingCode = null;
    entry = c; render(); add();
  }
  const byId = id => Friends.list.find(f => f.id === id) || (id === 'bot-songbot' ? Friends.friends[0] : null);

  function confirmRemove(f) {
    if (confirmOpen) return;
    confirmOpen = true;
    const c = openSheet(`<div class="fv-confirm"><h3>Remove ${esc(f.name)}?</h3><p>You can add each other again with your codes.</p>
      <button class="btn fv-danger" data-go data-press>Remove friend</button>
      <button class="btn surface" data-no data-press>Cancel</button></div>`, { label: `Remove ${f.name}?`, onClose: () => setTimeout(() => { confirmOpen = false; }, 0) });
    c.body.querySelector('[data-no]').addEventListener('click', c.close);
    c.body.querySelector('[data-go]').addEventListener('click', () => { c.close(); Friends.remove(f); });
  }

  sh.body.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'close': return sh.close();
      case 'signin': signingIn = true; sh.close(); return ctx.signIn();
      case 'add': return add();
      case 'qr': Haptics.select(); return openQR(Friends.code, account.name);
      case 'copy': {
        const c = Friends.code; if (!c) return;
        (navigator.clipboard ? navigator.clipboard.writeText(c) : Promise.reject()).then(() => {
          Haptics.select(); copied = true; render();
          setTimeout(() => { copied = false; render(); }, 1600);
        }, () => toast("Couldn't copy that. Try again."));
        return;
      }
      case 'share': return shareText(`Add me on Songspot, my friend code is ${Friends.code} 🎧 https://songspotapp.com/get`, 'Copied. Send it to a friend.');
      case 'challenge': {
        const f = byId(id); if (!f) return;
        Haptics.press(0.7);
        return Friends.launch({ name: f.name, bot: isBot(f), friendId: isBot(f) ? null : f.id });
      }
      case 'accept': { const f = byId(id); if (f) { Haptics.success(); Friends.respond(f, true); } return; }
      case 'decline': { const f = byId(id); if (f) Friends.respond(f, false); return; }
      case 'unsend': { const f = byId(id); if (f) Friends.remove(f); return; }
    }
  });
  // A long press (or a right-click) on a friend is the iPhone's context menu: Remove friend.
  const removable = t => { const r = t.closest && t.closest('.fv-row[data-id]'); const f = r && !t.closest('button') ? byId(r.dataset.id) : null; return f && !isBot(f) ? f : null; };
  sh.body.addEventListener('contextmenu', e => { const f = removable(e.target); if (!f) return; e.preventDefault(); confirmRemove(f); });
  let press = 0, pressAt = null;
  const unpress = () => { clearTimeout(press); press = 0; pressAt = null; };
  sh.body.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    const f = removable(e.target); if (!f) return;
    pressAt = { x: e.clientX, y: e.clientY };
    press = setTimeout(() => { unpress(); Haptics.press(0.6); confirmRemove(f); }, 500);
  });
  sh.body.addEventListener('pointermove', e => { if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 10) unpress(); });
  ['pointerup', 'pointercancel'].forEach(ev => sh.body.addEventListener(ev, unpress));
  sh.body.addEventListener('input', e => {
    if (!e.target.classList.contains('fv-in')) return;
    const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (clean !== e.target.value) e.target.value = clean;
    entry = clean; note = null;
    render();
  });
  sh.body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('fv-in')) { e.preventDefault(); add(); } });

  const offFriends = Friends.onChange(() => render());
  const offAccount = account.onChange(() => { render(); if (account.signedIn) Friends.refresh().then(takePending); });
  // The list again every 15 s while it is open, so online dots stay true.
  const tick = setInterval(() => { if (!document.hidden && !demo) Friends.refresh(); }, 15000);
  const closer = () => sh.close();
  Friends.closers.add(closer);
  function cleanup() { offFriends(); offAccount(); clearInterval(tick); Friends.closers.delete(closer); }

  render();
  if (!demo) Friends.refresh().then(takePending);
  return sh;
}

// ---------- FriendQRSheet ----------
let qrLib = null;
async function qrSVG(text) {
  if (!qrLib) qrLib = (await import('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm')).default;
  const q = qrLib(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true"><path d="${d}" fill="#000"/></svg>`;
}

function openQR(code, name) {
  if (!code) return;
  const url = friendLink(code);
  const sh = openSheet(`<div class="fq">
    <div class="fv-head fq-head"><span class="fv-title">Add me</span><button class="xbtn" data-press data-act="close" aria-label="Close">${I.x}</button></div>
    <div class="fq-mid">
      <div class="fq-box"><div class="fq-code" role="img" aria-label="QR code for ${esc(url)}"></div><span class="fq-disc"><i>${I.play}</i></span></div>
      <h2>${name ? `Scan to add ${esc(name)}` : 'Scan to add me'}</h2>
      <div class="fq-c">${esc(code)}</div>
      <p>Open Friends in Songspot and tap the scan button, or point the Camera at it.</p>
    </div>
    <button class="fq-share" data-press data-act="share">${I.share}<span>Share my link</span></button></div>`, { cls: 'tall friends-sheet fq-sheet', label: 'My QR code' });
  qrSVG(url).then(svg => { sh.body.querySelector('.fq-code').innerHTML = svg; }, () => { sh.body.querySelector('.fq-code').innerHTML = `<p class="fq-err">Couldn't draw the QR code. Share your link instead.</p>`; });
  sh.body.addEventListener('click', e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'close') sh.close();
    if (a === 'share') {
      if (navigator.share) navigator.share({ text: `Add me on Songspot 🎧 My friend code is ${code}`, url }).catch(() => {});
      else shareText(`Add me on Songspot 🎧 My friend code is ${code} ${url}`, 'Link copied. Send it to a friend.');
    }
  });
}
