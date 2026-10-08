// Sign in: LoginGateView.swift on the web. The dark stage, the ghosted wordmark and the white buttons at the
// foot ("Continue with Apple / Google", the "Already have a profile? Sign in" toggle, the error line and
// "Fetching your profile…" while the first sync runs). On the web it is not a gate — "Not now" goes back to
// the game — except after paying as a guest: then { forced: true } keeps it up until they have a profile, so
// premium is theirs. Only providers that are set up for the web are offered (a provider without a web client
// answers 400, and the button would only fail).
//
//   openLogin(ctx, { forced })       the full-screen sign-in over everything → { close }
//   mountLoginGate(container, ctx)   the same gate inside a container (the Profile tab for a guest) → { destroy() }
import { el, esc } from './ui.js';
import { I } from './icons.js';

if (!document.getElementById('css-login')) {
  const l = document.createElement('link'); l.id = 'css-login'; l.rel = 'stylesheet'; l.href = '/app/css/login.css?v=1'; document.head.appendChild(l);
}

/** The buttons and lines of the gate, wired into `inner`. Returns { destroy }. */
function gate(ctx, inner, { forced = false, onClose = null } = {}) {
  const { account, sound } = ctx;
  let returning = false, working = null, err = null, apple = false, google = false, ready = false, dead = false;
  const paint = () => {
    if (dead) return;
    if (!ready) { inner.innerHTML = '<p class="fine" style="margin:0 0 8px"><i class="spin s"></i></p>'; return; }
    const any = apple || google;
    const off = working || account.signedIn ? 'disabled' : '';
    const syncing = account.syncing ? '<p class="fine lg-sync"><i class="spin s"></i>&nbsp; Fetching your profile…</p>' : '';
    inner.innerHTML = any ? `
      ${apple ? `<button class="oauth apple" data-press data-p="apple" ${off}>${working === 'apple' ? '<i class="spin"></i>' : `${I.apple}<span>${returning ? 'Sign in with Apple' : 'Continue with Apple'}</span>`}</button>` : ''}
      ${google ? `<button class="oauth" data-press data-p="google" ${off}>${working === 'google' ? '<i class="spin"></i>' : `${I.google}<span>${returning ? 'Sign in with Google' : 'Continue with Google'}</span>`}</button>` : ''}
      <button class="btn quiet toggle" data-press><span style="color:var(--muted)">${returning ? 'New here?' : 'Already have a profile?'}</span>&nbsp;<span style="color:var(--text)">${returning ? 'Create a profile' : 'Sign in'}</span></button>
      ${err ? `<p class="err">${esc(err)}</p>` : ''}${syncing}
      ${forced || !onClose ? '' : '<button class="btn quiet notnow" data-press>Not now</button>'}
      <p class="fine">Your stats, daily results and premium follow your account to the iPhone app. <a href="/privacy" target="_blank">Privacy</a></p>`
      : `<p class="fine" style="font-size:13px;color:var(--muted)">Signing in on the web is almost ready. Until then your progress is kept in this browser, and premium bought here stays with it.</p>
      ${onClose ? '<button class="btn surface notnow" data-press style="margin-top:8px">Keep playing</button>' : ''}`;
  };
  paint();
  Promise.all([account.providerReady('apple'), account.providerReady('google')]).then(([a, g]) => { apple = a; google = g; ready = true; paint(); });
  const onClick = async e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    sound?.click?.();
    if (b.classList.contains('notnow') && !forced) return onClose && onClose();
    if (b.classList.contains('toggle')) { returning = !returning; return paint(); }
    const p = b.dataset.p; if (!p || working) return;
    working = p; err = null; paint();
    try { const r = await account.signIn(p, returning); if (r?.error) throw r.error; }         // the page leaves for the provider
    catch (x) { working = null; err = "Couldn't reach Songspot's servers. Check your connection and try again."; paint(); }
  };
  inner.addEventListener('click', onClick);
  const off = account.onChange(() => paint());
  return { destroy() { dead = true; off(); inner.removeEventListener('click', onClick); } };
}

export async function openLogin(ctx, { forced = false } = {}) {
  const open = document.querySelector('.login:not(.lg-inline)');
  if (open && !(forced && !open.classList.contains('forced'))) return;
  if (open) open.remove();
  const node = el(`<div class="login${forced ? ' forced' : ''}" role="dialog" aria-modal="true" aria-label="${forced ? 'Make your profile' : 'Sign in'}"><div class="wordmark">songspot</div>${forced ? `<div class="paid rise"><div class="pk">${I.crown}<span>PREMIUM</span></div><h2>You're premium</h2><p>Make a profile to keep it. Premium is saved to it, on any device.</p></div>` : ''}<div class="inner rise"></div></div>`);
  document.body.appendChild(node);
  let g = null, off = null;
  const close = () => { document.removeEventListener('keydown', onKey); off && off(); g && g.destroy(); node.remove(); };
  const onKey = e => { if (e.key === 'Escape' && !forced) close(); };
  document.addEventListener('keydown', onKey);
  g = gate(ctx, node.querySelector('.inner'), { forced, onClose: close });
  // Signed in while it was up (this tab caught the session): the gate has done its job once the sync is through.
  const wasIn = ctx.account.signedIn;
  off = ctx.account.onChange(() => { if (!wasIn && ctx.account.signedIn && !ctx.account.syncing) close(); });
  return { close };
}

/** The gate in a container: the Profile tab shows it to a guest (iOS signs everyone in before the tabs). */
export function mountLoginGate(container, ctx) {
  const node = el('<div class="login lg-inline" aria-label="Sign in"><div class="wordmark">songspot</div><div class="inner rise"></div></div>');
  container.appendChild(node);
  const g = gate(ctx, node.querySelector('.inner'), {});
  return { destroy() { g.destroy(); node.remove(); } };
}
