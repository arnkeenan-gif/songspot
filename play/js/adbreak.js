// The ad break: after every five finished rounds in free play. On the web the
// slot is AdSense's once the site is approved; until then it is the house
// message with the same 30–60 s countdown the apps use.
import { el } from './ui.js';

let houseSeconds = null;
export function adBreak({ accent, onPremium, onDone }) {
  if (houseSeconds == null) houseSeconds = 30 + Math.floor(Math.random() * 31);
  let left = houseSeconds;
  const node = el(`
    <div class="adbreak" role="dialog" aria-label="Ad break" style="--accent:${accent}">
      <div class="k">AD</div>
      <h2>Five rounds down.</h2>
      <p>A short break, then back to the music.</p>
      <div class="count mono">${left}</div>
      <div class="slot"><ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-2183185085536179" data-ad-slot="auto" data-ad-format="auto" data-full-width-responsive="true"></ins></div>
      <small>Premium never stops for an ad.</small>
      <button class="up" data-press>♛ Go premium</button>
      <button class="btn quiet" style="margin-top:14px;margin-bottom:40px">Restore purchases</button>
    </div>`);
  document.body.appendChild(node);
  try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  const count = node.querySelector('.count');
  const iv = setInterval(() => { left -= 1; count.textContent = left; if (left <= 0) close(); }, 1000);
  const close = () => { clearInterval(iv); node.remove(); onDone && onDone(); };
  node.querySelector('.up').addEventListener('click', () => { close(); onPremium && onPremium(); });
  return { close };
}
