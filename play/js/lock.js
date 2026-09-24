// The door. While the web version is private, a code opens it; the code is
// remembered on this browser. Not security — a bouncer.
const KEY = 'songspot.gate';
const CODE = 'songspot';

export function unlocked() {
  // ?code=… in the URL opens the door too (for previews and links); it is remembered like a typed code.
  try { const q = new URLSearchParams(location.search).get('code'); if (q && q.toLowerCase() === CODE) localStorage.setItem(KEY, '1'); } catch (e) {}
  try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
}

export function gate(root, onOpen) {
  if (unlocked()) { onOpen(); return; }
  root.innerHTML = `
    <div class="gate">
      <form class="gate-card" autocomplete="off">
        <div class="wordmark">songspot</div>
        <p>The web version is private for now.</p>
        <label class="sr" for="gate-code">Access code</label>
        <input id="gate-code" type="password" placeholder="Access code" autocapitalize="off" spellcheck="false" autofocus>
        <button type="submit" class="btn primary">Enter</button>
        <p class="gate-err" hidden>That's not it.</p>
      </form>
    </div>`;
  const form = root.querySelector('form'), input = root.querySelector('input'), err = root.querySelector('.gate-err');
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (input.value.trim().toLowerCase() === CODE) { try { localStorage.setItem(KEY, '1'); } catch (x) {} root.innerHTML = ''; onOpen(); }
    else { err.hidden = false; input.select(); form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); }
  });
}
