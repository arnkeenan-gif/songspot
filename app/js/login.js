// Sign in: LoginGateView.swift on the web. The dark stage, the ghosted
// wordmark and the white buttons at the foot. On the web it is never a gate —
// "Not now" goes back to the game. Only providers that are set up for the web
// are offered (a provider without a web client answers 400, and the button
// would only fail).
import { el, esc } from './ui.js';
import { I } from './icons.js';

export async function openLogin(ctx) {
  if (document.querySelector('.login')) return;
  const { account, sound } = ctx;
  let returning = false, working = null;
  const node = el(`<div class="login" role="dialog" aria-modal="true" aria-label="Sign in"><div class="wordmark">songspot</div><div class="inner rise"><p class="fine" style="margin:0 0 8px"><i class="spin s"></i></p></div></div>`);
  document.body.appendChild(node);
  const inner = node.querySelector('.inner');
  const [apple, google] = await Promise.all([account.providerReady('apple'), account.providerReady('google')]);
  const close = () => { document.removeEventListener('keydown', onKey); node.remove(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const paint = err => {
    const any = apple || google;
    inner.innerHTML = any ? `
      ${apple ? `<button class="oauth apple" data-press data-p="apple">${working === 'apple' ? '<i class="spin"></i>' : `${I.apple}<span>${returning ? 'Sign in with Apple' : 'Continue with Apple'}</span>`}</button>` : ''}
      ${google ? `<button class="oauth" data-press data-p="google">${working === 'google' ? '<i class="spin"></i>' : `${I.google}<span>${returning ? 'Sign in with Google' : 'Continue with Google'}</span>`}</button>` : ''}
      <button class="btn quiet toggle" data-press><span style="color:var(--muted)">${returning ? 'New here?' : 'Already have a profile?'}</span>&nbsp;<span style="color:var(--text)">${returning ? 'Create a profile' : 'Sign in'}</span></button>
      ${err ? `<p class="err">${esc(err)}</p>` : ''}
      <button class="btn quiet notnow" data-press>Not now</button>
      <p class="fine">Your stats, daily results and premium follow your account to the iPhone app. <a href="/privacy" target="_blank">Privacy</a></p>`
      : `<p class="fine" style="font-size:13px;color:var(--muted)">Signing in on the web is almost ready. Until then your progress is kept in this browser, and premium bought here stays with it.</p>
      <button class="btn surface notnow" data-press style="margin-top:8px">Keep playing</button>`;
  };
  paint();
  node.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    sound.click();
    if (b.classList.contains('notnow')) return close();
    if (b.classList.contains('toggle')) { returning = !returning; return paint(); }
    const p = b.dataset.p; if (!p || working) return;
    working = p; paint();
    try { const r = await account.signIn(p, returning); if (r?.error) throw r.error; }         // the page leaves for the provider
    catch (err) { working = null; paint("Couldn't reach Songspot's servers. Check your connection and try again."); }
  });
  return { close };
}
