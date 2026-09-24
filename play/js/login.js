// The door everyone comes through: the dark stage, the ghosted wordmark and
// one white button. Google sign-in is an OAuth redirect, so the page leaves
// and comes back; account.boot() then adopts the session and onDone fires.
import { el } from './ui.js';

const CSS = new URL('../css/profile.css', import.meta.url);
function styles() { if (!document.querySelector('link[data-profile]')) document.head.appendChild(el(`<link rel="stylesheet" href="${CSS}" data-profile>`)); }

/** Google's own four-colour G — the sign-in artwork's 48×48 paths. */
export const GOOGLE_G = `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
  <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
  <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/>
  <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>
</svg>`;

/** Mounts into `root`; returns an unmount. onDone fires once the account is signed in. */
export function mountLogin(root, ctx, onDone) {
  styles();
  const { account } = ctx;
  let working = false, returning = false, done = false;
  const view = el(`<div class="login">
    <div class="wordmark">songspot</div>
    <div class="rise">
      <button class="google" data-press>${GOOGLE_G}<span>Continue with Google</span></button>
      <div class="foot"><span>Already have a profile?</span> <b>Sign in</b></div>
      <p class="err" hidden></p>
      <div class="sync" hidden><i class="spin s"></i>Fetching your profile…</div>
    </div>
  </div>`);
  root.appendChild(view);
  const btn = view.querySelector('.google'), foot = view.querySelector('.foot'), err = view.querySelector('.err'), sync = view.querySelector('.sync');

  const paint = () => {
    btn.innerHTML = working ? '<i class="spin"></i>' : `${GOOGLE_G}<span>${returning ? 'Sign in with Google' : 'Continue with Google'}</span>`;
    btn.disabled = working;
    foot.innerHTML = returning ? '<span>New here?</span> <b>Create a profile</b>' : '<span>Already have a profile?</span> <b>Sign in</b>';
    sync.hidden = !account.syncing;
  };
  const finish = () => { if (done || !account.signedIn) return; done = true; off(); onDone(); };

  foot.addEventListener('click', () => { returning = !returning; paint(); });
  btn.addEventListener('click', async () => {
    if (working) return;
    working = true; err.hidden = true; paint();
    try {
      const r = await account.signIn();                              // redirects away on success
      if (r?.error) throw r.error;
    } catch (e) {
      err.textContent = "Couldn't reach Songspot's servers. Check your connection and try again."; err.hidden = false;
      working = false; paint();
    }
  });
  const off = account.onChange(() => { paint(); finish(); });
  paint(); finish();
  return () => { off(); view.remove(); };
}
