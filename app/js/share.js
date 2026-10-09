// "Challenge your friend": a line of text and the link, plus — where the
// browser can share files (phones) — the 9:16 poster the app sends: the cover
// filling the card, the song, the stage it fell at. Never on the daily, which
// shares text only.
import { TIER_COLOR, TIER_INK, PILL_FILL, cap, label, art, shareText, toast, LINKS } from './ui.js';
import { STAGES } from './pool.js';

// ShareCard.artwork: a slow link gets the card without its cover (3 s), rather than a share button that does nothing.
const loadImg = (src, timeout = 3000) => new Promise(res => {
  const i = new Image(); let done = false; const end = v => { if (!done) { done = true; res(v); } };
  i.crossOrigin = 'anonymous'; i.onload = () => end(i); i.onerror = () => end(null); i.src = src;
  setTimeout(() => { if (!done) { i.src = ''; end(null); } }, timeout);
});
/** The page's Theme.stage (the season's in a season), for a card with no cover. */
const stageColour = () => { try { return getComputedStyle(document.documentElement).getPropertyValue('--stage').trim() || '#0b110e'; } catch (e) { return '#0b110e'; } };
/** SF music.note, drawn at `size` centred on (cx, cy). */
function note(g, cx, cy, size, colour) {
  const p = new Path2D('M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z');
  g.save(); g.translate(cx - size / 2, cy - size / 2); g.scale(size / 24, size / 24);
  g.strokeStyle = colour; g.fillStyle = colour; g.lineWidth = 2; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(p); g.restore();
}

export function soloText(game) {
  const stage = label(game.duration), tier = cap(game.difficulty);
  return game.status === 'won' ? `I named it in ${stage} on ${tier}. Beat that.\n${LINKS.go}` : `This one got away from me on ${tier}. Think you'd get it?\n${LINKS.go}`;
}

async function poster(game) {
  const s = game.song, won = game.status === 'won', W = 360, H = 640, k = 3;
  const accent = won ? TIER_COLOR[game.difficulty] : TIER_COLOR.expert;
  const c = document.createElement('canvas'); c.width = W * k; c.height = H * k;
  const g = c.getContext('2d'); g.scale(k, k);
  g.fillStyle = stageColour(); g.fillRect(0, 0, W, H);
  const img = s.artwork ? await loadImg(art(s.artwork, 1000)) : null;
  if (img) { const sc = Math.max(W / img.width, H / img.height), w = img.width * sc, h = img.height * sc; g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); }
  else note(g, W / 2, H / 2, 80, accent);
  let gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, 160);
  gr = g.createLinearGradient(0, H - 300, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.35, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,.92)'); g.fillStyle = gr; g.fillRect(0, H - 300, W, 300);
  const font = (w, px, it = false) => `${it ? 'italic ' : ''}${w} ${px}px Inter, -apple-system, system-ui, sans-serif`;
  g.fillStyle = '#fff'; g.font = font(800, 22, true); g.textBaseline = 'top';
  g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 6; g.shadowOffsetY = 2; g.letterSpacing = '-0.66px'; g.fillText('songspot', 24, 22); g.letterSpacing = '0px';
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
  const pill = game.difficulty.toUpperCase(); g.font = font(800, 10); const pw = g.measureText(pill).width + 18 + pill.length * 1.6;
  g.fillStyle = PILL_FILL[game.difficulty]; g.beginPath(); g.roundRect(W - 24 - pw, 22, pw, 21, 6); g.fill(); g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
  g.fillStyle = TIER_INK[game.difficulty]; g.letterSpacing = '1.6px'; g.fillText(pill, W - 24 - pw + 9, 27.5); g.letterSpacing = '0px';
  // the result, bottom right
  const val = label(game.duration); g.font = font(800, 54, true); const vw = g.measureText(val).width;
  g.textBaseline = 'alphabetic'; g.fillStyle = accent; g.shadowColor = accent + '80'; g.shadowBlur = 14; g.fillText(val, W - 24 - vw, H - 70); g.shadowBlur = 0;
  g.font = font(800, 9.5); g.fillStyle = 'rgba(255,255,255,.65)'; g.letterSpacing = '2px'; const lab = won ? 'NAMED IN' : 'GOT AWAY'; g.fillText(lab, W - 24 - g.measureText(lab).width, H - 118); g.letterSpacing = '0px';
  // title + artist, bottom left
  // The title: two lines at most, shrinking to 60% before it is cut (lineLimit(2).minimumScaleFactor(0.6)).
  const maxW = W - 48 - vw - 12; g.fillStyle = '#fff';
  const wrap = (text, px) => { g.font = font(800, px, true); const words = text.split(/\s+/), lines = []; let cur = '';
    for (const w of words) { const t2 = cur ? cur + ' ' + w : w; if (g.measureText(t2).width <= maxW || !cur) cur = t2; else { lines.push(cur); cur = w; } }
    if (cur) lines.push(cur); return lines; };
  let px = 25, lines = wrap(s.title, px);
  while ((lines.length > 2 || lines.some(l => g.measureText(l).width > maxW)) && px > 15) { px -= 1; lines = wrap(s.title, px); }
  if (lines.length > 2) { lines = [lines[0], lines.slice(1).join(' ')]; }
  lines = lines.map(l => { let t = l; while (g.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -2).trimEnd() + '…'; return t; });
  const lh = px * 1.12;
  lines.forEach((l, i) => g.fillText(l, 24, H - 94 - (lines.length - 1 - i) * lh)); g.font = font(500, 14); g.fillStyle = 'rgba(255,255,255,.75)'; let a = s.artist; while (g.measureText(a).width > maxW && a.length > 3) a = a.slice(0, -2).trimEnd() + '…'; g.fillText(a, 24, H - 72);
  // the stage bar
  const bw = (W - 48 - 4 * 4) / 5;
  for (let i = 0; i < 5; i++) { const lit = won ? i <= game.stage : true; g.fillStyle = lit ? (i === game.stage ? accent : accent + '73') : 'rgba(255,255,255,.18)'; if (!won) g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.roundRect(24 + i * (bw + 4), H - 52, bw, 4, 2); g.fill(); }
  g.font = font(700, 11.5); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(won ? "Think you're faster?" : "Think you'd get it?", 24, H - 26);
  g.font = font(600, 11); g.fillStyle = 'rgba(255,255,255,.55)'; const f = 'Free on the App Store'; g.fillText(f, W - 24 - g.measureText(f).width, H - 26);
  return new Promise(res => c.toBlob(b => res(b), 'image/png'));
}

export async function shareSolo(game) {
  const text = soloText(game);
  try {
    if (navigator.canShare && navigator.share && game.song) {
      const blob = await poster(game);
      const file = blob && new File([blob], `songspot-${game.song.id}.png`, { type: 'image/png' });
      if (file && navigator.canShare({ files: [file] })) { await navigator.share({ text, files: [file] }); return; }
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  shareText(text);
}
