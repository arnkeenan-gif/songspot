// FriendsView.swift: your code to share (with its QR), a box for theirs,
// requests, and everyone you've added with who's online, each in a colour
// panel (SettingsPanel) with its icon. An online friend — and Songbot,
// always — can be challenged to a 1v1, which opens a two-player party they
// are invited to. Two ways in, as on the iPhone:
//   mountFriendsTab(container, ctx) -> { destroy() }   the Friends tab (TabTitle, no close button, room for the bar)
//   openFriends(ctx)                                   full screen over everything (header "Friends" + close)
// FriendQRSheet and FriendScannerSheet are here too (the scanner uses the
// browser's BarcodeDetector where there is one, as VisionKit's DataScanner).
import { esc, morph, openSheet, shareText, toast } from './ui.js';
import { I, sf } from './icons.js';
import { Haptics } from './haptics.js';
import { Ladder } from './ladder.js';
import { panel, group, tabTitle, PanelColours, press } from './kit.js';
import { faceHTML } from './characters.js';
import { mountBackdrop } from './season.js';
import { OwnPrompt } from './shazamguard.js';
import { Friends, isBot, isOnline, seenLabel, accepted, friendLink, codeFrom, demoMode } from './friends.js';

/** SF "doc.on.doc", "qrcode.viewfinder" and "camera.fill", which icons.js does not carry (drawn like it, on a 24 box). */
const COPY = `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 5.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8.5a2 2 0 0 0 2 2h.5"/></svg>`;
const VIEWFINDER = `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16"/><path fill="currentColor" stroke="none" d="M7 7h4v4H7zm1.3 1.3v1.4h1.4V8.3zM13 7h4v4h-4zm1.3 1.3v1.4h1.4V8.3zM7 13h4v4H7zm1.3 1.3v1.4h1.4v-1.4zM13 13h1.6v1.6H13zM15.4 15.4H17V17h-1.6zM15.4 13H17v1.6h-1.6zM13 15.4h1.6V17H13z"/></svg>`;
const CAMERA = `<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 4h6l1.5 2H19a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5v-9A2.5 2.5 0 0 1 5 6h2.5zm3 4.5a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4z"/></svg>`;

/** The panels' own ink (PanelColours.x.last) for the white buttons on them. */
const INK = { blue: PanelColours.blue[2], purple: PanelColours.purple[2], gold: PanelColours.gold[2] };

/** A friend's face: their picture or character (Songbot its own), and the online dot on accepted friends. */
function avatar(f, size) {
  const d = (size * 0.28).toFixed(1);
  const dot = accepted(f) ? `<i class="fv-dot ${isOnline(f) ? 'on' : ''}" style="width:${d}px;height:${d}px"></i>` : '';
  return `<span class="fv-av" style="width:${size}px;height:${size}px">${faceHTML(f.avatar, f.id, size)}${dot}</span>`;
}

/**
 * The Friends page into `host`. inTab: the tab's title and room for the bar; otherwise the
 * full-screen header with its close button (onClose). Returns { destroy(), render() }.
 */
function buildFriends(host, ctx, { inTab = false, onClose = null } = {}) {
  const { account } = ctx;
  const signedIn = () => demoMode || account.signedIn;
  let entry = '', note = null, adding = false, copied = false, gone = false, confirmOpen = false;
  host.classList.add('friends-v', inTab ? 'in-tab' : 'full');
  const backdrop = mountBackdrop(host);
  backdrop.node.classList.add('fixed');
  host.insertAdjacentHTML('beforeend', `<div class="fv-top">${inTab ? tabTitle('FRIENDS')
    : `<div class="fv-head"><span class="fv-title">Friends</span><button class="xbtn" data-press data-act="close" aria-label="Close">${I.x}</button></div>`}</div><div class="fv-main"></div>`);
  const main = host.querySelector('.fv-main');

  const glass = (act, icon, labelText, extra = '') => `<button class="fv-glass ${extra}" data-press data-act="${act}" aria-label="${esc(labelText)}">${icon}</button>`;
  const codeCard = () => {
    const c = Friends.code;
    return panel({ key: 'code', title: 'Your code', note: 'Share it so friends can add you', icon: 'ui-icon-code', colours: PanelColours.green,
      body: `<div class="fv-strip"><span class="fv-codev ${c ? '' : 'none'}">${esc(c || '······')}</span><span class="fv-sp"></span>
        ${c ? glass('qr', sf('qrcode'), 'Show my QR code') + glass('copy', copied ? sf('checkmark') : COPY, 'Copy my code', copied ? 'copied' : '') + glass('share', sf('square.and.arrow.up'), 'Share my code') : ''}</div>` });
  };
  const ready = () => entry.length === 6 || adding;
  const addBox = () => panel({ key: 'add', title: 'Add a friend', note: 'Their 6-character code, or scan their QR', icon: 'ui-icon-addfriend', colours: PanelColours.blue,
    body: `<div class="fv-addrow"><input class="fv-in" value="${esc(entry)}" placeholder="CODE" maxlength="6" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="send" aria-label="A friend's code">
      <button class="fv-scan" data-press data-act="scan" aria-label="Scan a friend's QR code">${VIEWFINDER}</button>
      <button class="fv-addbtn ${ready() ? 'on' : ''}" data-press data-act="add" style="--ink:${INK.blue}" ${entry.length !== 6 || adding ? 'disabled' : ''}>${adding ? '<span class="fv-spin"></span>' : 'ADD'}</button></div>
      ${note ? `<p class="fv-note" data-k="note">${esc(note)}</p>` : ''}` });
  const friendRow = f => `<div class="fv-row" data-k="f-${esc(f.id)}" data-id="${esc(f.id)}">${avatar(f, 44)}
      <span class="fv-tx"><b>${esc(f.name)}</b><small><span class="${isOnline(f) ? 'on' : 'off'}">${isBot(f) ? 'Bot' : esc(seenLabel(f))}</span><span class="dim">${isBot(f) ? ' · always ready' : ` · ${esc(Ladder.place(f.rating).name)}`}</span></small></span>
      ${isOnline(f) ? `<button class="fv-1v1" data-press data-act="challenge" data-id="${esc(f.id)}" style="--ink:${INK.purple}" ${Friends.inParty ? 'disabled' : ''} aria-label="Challenge ${esc(f.name)} to a 1v1">${sf('bolt.fill')}<span>1V1</span></button>` : ''}</div>`;
  const requestRow = f => `<div class="fv-row" data-k="r-${esc(f.id)}">${avatar(f, 40)}
      <span class="fv-tx"><b>${esc(f.name)}</b><small class="req">Wants to be friends</small></span>
      <button class="fv-no" data-press data-act="decline" data-id="${esc(f.id)}" aria-label="Decline">${sf('xmark')}</button>
      <button class="fv-yes" data-press data-act="accept" data-id="${esc(f.id)}" style="--ink:${INK.gold}">ACCEPT</button></div>`;
  const sentRow = f => `<div class="fv-row sent" data-k="s-${esc(f.id)}">${avatar(f, 36)}
      <span class="fv-tx"><b>${esc(f.name)}</b></span><small class="fv-wait">Waiting</small>
      <button class="fv-cancel" data-press data-act="unsend" data-id="${esc(f.id)}">Cancel</button></div>`;
  // SkeletonRows(count: 3): a face, two lines, a value, shimmering.
  const skeleton = n => `<div class="fv-skel" data-k="skel" aria-label="Loading">${Array.from({ length: n }, (_, i) => `<div><i class="c"></i><span><i style="width:${[120, 96, 140, 110, 84][i % 5]}px"></i><i style="width:${[70, 90, 60, 80, 76][i % 5]}px"></i></span><i class="v"></i></div>`).join('')}</div>`;
  const grouped = (items, row) => group(items.map(row));

  function render() {
    if (gone) return;
    if (!signedIn()) {
      // The iPhone signs in at its gate; a web guest taps the panel to sign in.
      morph(main, `<div class="fv-out" data-k="out"><button class="fv-signin" data-act="signin" ${press(0.98)} aria-label="Sign in to add friends">${panel({ title: 'Sign in to add friends', note: "Your friends, who's online and a 1v1 with any of them, in one place.", icon: 'ui-icon-signin', colours: PanelColours.pink })}</button></div>`);
      return;
    }
    const fr = Friends.friends, req = Friends.requests, sent = Friends.sent;
    morph(main, `<div class="fv-col" data-k="in">${codeCard()}${addBox()}
      ${req.length ? panel({ key: 'req', title: 'Requests', note: 'They want to be friends', icon: 'ui-icon-requests', colours: PanelColours.gold, body: grouped(req, requestRow) }) : ''}
      ${panel({ key: 'fr', title: 'Your friends', note: fr.length ? `${Friends.onlineCount} online · challenge anyone online to a 1v1` : 'Share your code, or add theirs above.', icon: 'ui-icon-friends', colours: PanelColours.purple,
        body: !Friends.loaded ? skeleton(3) : fr.length ? grouped(fr, friendRow) : '' })}
      ${sent.length ? panel({ key: 'sent', title: 'Sent', note: 'Waiting for them to accept', icon: 'ui-icon-waiting', colours: PanelColours.slate, body: grouped(sent, sentRow) }) : ''}</div>`);
    const inp = main.querySelector('.fv-in');
    if (inp && inp.value !== entry) inp.value = entry;
  }

  async function add() {
    if (entry.length !== 6 || adding) return;
    adding = true; render();
    host.querySelector('.fv-in')?.blur();
    const msg = await Friends.add(entry);
    adding = false; note = msg;
    if (msg === 'Request sent.' || msg === "You're now friends.") entry = '';
    render();
  }
  /** A code that came by link: fill the box and add it (FriendsView's .task). */
  function takePending() {
    const c = Friends.pendingCode;
    if (!c || !signedIn()) return;
    Friends.pendingCode = null;
    entry = c; note = null; render(); add();
  }
  const byId = id => Friends.friends.find(f => f.id === id) || Friends.list.find(f => f.id === id) || null;

  function confirmRemove(f) {
    if (confirmOpen) return;
    confirmOpen = true;
    const c = openSheet(`<div class="fv-confirm"><h3>Remove ${esc(f.name)}?</h3>
      <button class="btn fv-danger" data-go data-press>Remove friend</button>
      <button class="btn surface" data-no data-press>Cancel</button></div>`, { cls: 'fv-confirm-sheet', label: `Remove ${f.name}?`, onClose: () => setTimeout(() => { confirmOpen = false; }, 0) });
    c.body.querySelector('[data-no]').addEventListener('click', c.close);
    c.body.querySelector('[data-go]').addEventListener('click', () => { c.close(); Friends.remove(f); });
  }

  const onClick = e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'close': return onClose && onClose();
      case 'signin': return ctx.signIn();
      case 'add': return add();
      case 'scan': Haptics.select(); return openScanner(c => { entry = c; note = null; render(); add(); });
      case 'qr': Haptics.select(); return openQR(Friends.code, account.name || '');
      case 'copy': {
        const c = Friends.code; if (!c) return;
        (navigator.clipboard ? navigator.clipboard.writeText(c) : Promise.reject()).then(() => {
          Haptics.select(); copied = true; render();
          setTimeout(() => { copied = false; render(); }, 1600);
        }, () => toast("Couldn't copy that. Try again."));
        return;
      }
      // The share sheet is ours, not a way out to Shazam.
      case 'share': return OwnPrompt.during(() => shareText(`Add me on Songspot, my friend code is ${Friends.code} 🎧 https://songspotapp.com/get`, 'Copied. Send it to a friend.'));
      case 'challenge': {
        const f = byId(id); if (!f) return;
        Haptics.press(0.7);
        // Songbot's practice 1v1 is premium, from the Friends list too.
        if (isBot(f) && !ctx.premium) return ctx.openPremium('songbot');
        return Friends.launch({ name: f.name, bot: isBot(f), friendId: isBot(f) ? null : f.id });
      }
      case 'accept': { const f = byId(id); if (f) { Haptics.success(); Friends.respond(f, true); } return; }
      case 'decline': { const f = byId(id); if (f) Friends.respond(f, false); return; }
      case 'unsend': { const f = byId(id); if (f) Friends.remove(f); return; }
    }
  };
  host.addEventListener('click', onClick);
  // A long press (or a right-click) on a friend is the iPhone's context menu: Remove friend.
  const removable = t => { const r = t.closest && t.closest('.fv-row[data-id]'); const f = r && !t.closest('button') ? byId(r.dataset.id) : null; return f && !isBot(f) ? f : null; };
  host.addEventListener('contextmenu', e => { const f = removable(e.target); if (!f) return; e.preventDefault(); confirmRemove(f); });
  let pressT = 0, pressAt = null;
  const unpress = () => { clearTimeout(pressT); pressT = 0; pressAt = null; };
  host.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    const f = removable(e.target); if (!f) return;
    pressAt = { x: e.clientX, y: e.clientY };
    pressT = setTimeout(() => { unpress(); Haptics.press(0.6); confirmRemove(f); }, 500);
  });
  host.addEventListener('pointermove', e => { if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 10) unpress(); });
  ['pointerup', 'pointercancel'].forEach(ev => host.addEventListener(ev, unpress));
  host.addEventListener('input', e => {
    if (!e.target.classList.contains('fv-in')) return;
    const v = e.target.value;
    const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (clean !== v) e.target.value = clean;
    entry = clean;
    // Only while typing: clearing the box after a send must not wipe its note.
    if (v) note = null;
    render();
  });
  host.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('fv-in')) { e.preventDefault(); add(); } });

  const offFriends = Friends.onChange(() => render());
  const offAccount = account.onChange(() => { render(); if (account.signedIn) Friends.refresh().then(takePending); });
  // The list again every 15 s while it is open, so the online dots stay true.
  const tick = setInterval(() => { if (!document.hidden) Friends.refresh(); }, 15000);

  render();
  Friends.refresh().then(takePending);
  return {
    render,
    destroy() { gone = true; offFriends(); offAccount(); clearInterval(tick); host.removeEventListener('click', onClick); backdrop.destroy(); },
  };
}

/** The Friends tab: TabTitle "FRIENDS", no close button, room for the bar. */
export function mountFriendsTab(container, ctx) {
  const page = document.createElement('div');
  container.appendChild(page);
  const v = buildFriends(page, ctx, { inTab: true });
  return { destroy() { v.destroy(); page.remove(); } };
}

/** Friends over everything (StageView's fullScreenCover), with its close button. Closes when a 1v1 opens. */
export function openFriends(ctx) {
  if (document.querySelector('.friends-sheet.fv-sheet')) return;
  let v = null, signingIn = false;
  const sh = openSheet('', { cls: 'tall friends-sheet fv-sheet', label: 'Friends', onClose: () => {
    v && v.destroy(); Friends.closers.delete(closer);
    // A friend's link, turned down: don't reopen Friends on every visit. Kept through a sign-in.
    if (!demoMode && !ctx.account.signedIn && !signingIn) Friends.pendingCode = null;
  } });
  const closer = () => sh.close();
  Friends.closers.add(closer);
  // Signing in from here leaves Friends; the code waits for the way back.
  sh.body.addEventListener('click', e => { if (e.target.closest('[data-act="signin"]')) { e.stopPropagation(); signingIn = true; sh.close(); ctx.signIn(); } }, true);
  v = buildFriends(sh.body, ctx, { inTab: false, onClose: () => sh.close() });
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
  let bd = null;
  const sh = openSheet(`<div class="fq">
    <div class="fv-head fq-head"><span class="fv-title">Add me</span><button class="xbtn" data-press data-act="close" aria-label="Close">${I.x}</button></div>
    <div class="fq-mid">
      <div class="fq-box"><div class="fq-code" role="img" aria-label="QR code for ${esc(url)}"></div><span class="fq-disc"><i>${sf('play.fill')}</i></span></div>
      <h2>${name ? `Scan to add ${esc(name)}` : 'Scan to add me'}</h2>
      <div class="fq-c">${esc(code)}</div>
      <p>Open Friends in Songspot and tap the scan button, or point the Camera at it.</p>
    </div>
    <button class="fq-share" data-press data-act="share">${sf('square.and.arrow.up')}<span>Share my link</span></button></div>`, { cls: 'tall friends-sheet fq-sheet', label: 'My QR code', onClose: () => bd && bd.destroy() });
  bd = mountBackdrop(sh.body);
  qrSVG(url).then(svg => { sh.body.querySelector('.fq-code').innerHTML = svg; }, () => { sh.body.querySelector('.fq-code').innerHTML = `<p class="fq-err">Couldn't draw the QR code. Share your link instead.</p>`; });
  sh.body.addEventListener('click', e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'close') sh.close();
    if (a === 'share') {
      OwnPrompt.during(async () => {
        if (navigator.share) await navigator.share({ text: `Add me on Songspot 🎧 My friend code is ${code}`, url }).catch(() => {});
        else shareText(`Add me on Songspot 🎧 My friend code is ${code} ${url}`, 'Link copied. Send it to a friend.');
      });
    }
  });
}

// ---------- FriendScannerSheet ----------
/**
 * The camera, looking for a friend's QR code; the first code it recognises is handed to `onCode` and the
 * sheet closes. The browser's BarcodeDetector stands in for VisionKit (Chrome on Android and macOS have it;
 * Safari doesn't, and gets the iPhone's own "isn't available" line). The camera is asked for only here.
 */
async function openScanner(onCode) {
  const supported = typeof window.BarcodeDetector === 'function' && !!navigator.mediaDevices?.getUserMedia;
  let stream = null, raf = 0, done = false, hold = 0;
  const stop = () => { done = true; cancelAnimationFrame(raf); clearTimeout(hold); stream?.getTracks().forEach(t => t.stop()); stream = null; };
  const sh = openSheet(`<div class="fsc">
    <div class="fsc-cam"><video playsinline muted></video><i class="fsc-finder" aria-hidden="true"></i></div>
    <div class="fsc-none" hidden>${CAMERA}<p></p></div>
    <div class="fsc-top"><span>Scan a friend's code</span><button class="fsc-x" data-press data-act="close" aria-label="Close">${sf('xmark')}</button></div>
    <p class="fsc-note" hidden></p></div>`, { cls: 'friends-sheet fsc-sheet', label: "Scan a friend's code", onClose: stop });
  const video = sh.body.querySelector('video'), none = sh.body.querySelector('.fsc-none'), noteEl = sh.body.querySelector('.fsc-note');
  const unavailable = text => { sh.body.querySelector('.fsc-cam').hidden = true; none.hidden = false; none.querySelector('p').textContent = text; };
  sh.body.addEventListener('click', e => { if (e.target.closest('[data-act="close"]')) sh.close(); });
  const NOT_HERE = "Scanning isn't available on this device. Type the code instead.";
  if (!supported) return unavailable(NOT_HERE);
  let detector = null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats?.();
    if (formats && !formats.includes('qr_code')) return unavailable(NOT_HERE);
    detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  } catch (e) { return unavailable(NOT_HERE); }
  try { stream = await OwnPrompt.during(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })); }
  catch (e) { return unavailable("Songspot can't use the camera. Allow it in Settings, then try again."); }
  if (done) { stop(); return; }
  video.srcObject = stream;
  try { await video.play(); } catch (e) {}
  let busy = false;
  const look = async () => {
    if (done) return;
    raf = requestAnimationFrame(look);
    if (busy || hold || video.readyState < 2) return;
    busy = true;
    try {
      const found = await detector.detect(video);
      const raw = found && found[0] && found[0].rawValue;
      if (raw && !done) {
        const c = codeFrom(raw);
        if (c) { Haptics.success(); sh.close(); onCode(c); }
        else {
          noteEl.textContent = "That QR code isn't a Songspot friend code."; noteEl.hidden = false;
          // Not ours: keep looking after a beat.
          hold = setTimeout(() => { hold = 0; }, 1200);
        }
      }
    } catch (e) {} finally { busy = false; }
  };
  look();
}
