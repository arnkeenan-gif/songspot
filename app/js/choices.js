// Four answers for party and ranked: the song and three that could pass for
// it (Engine/Choices.swift). Decoys come from the same difficulty, and from
// the same decade and genre when there are enough, so the right one never
// stands out. ChoiceGrid draws them as the app does: cover + title rows, one
// tap is final, the right row lights green and a wrong pick red.
import { eraOf } from './pool.js';
import { esc, art } from './ui.js';
import { I } from './icons.js';
import { spring } from './motion.js';

// ChoiceGrid's own motion: a pick moves on .spring(response: .3, dampingFraction: .75),
// the reveal on .easeOut(duration: .25). As CSS variables, for app.css's choice rules.
try {
  const r = document.documentElement.style;
  r.setProperty('--choice-pick', spring(0.3, 0.75).css);
} catch (e) {}

export const COUNT = 4;
export const choiceKey = t => String(t || '').split('(')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/**
 * `from` is the songs in play (an artist's catalogue), null for the whole pool.
 * `category` is the game's category: a UK Rap song is filed under Hip-Hop, so
 * without it the decoys would be US rap and give the answer away.
 */
export function deal(answer, tier, pool, from = null, category = 'all') {
  const picked = [answer], titles = new Set([choiceKey(answer.title)]);
  const take = list => { for (const s of shuffle(list)) { if (picked.length >= COUNT) break; if (s.id === answer.id) continue; const k = choiceKey(s.title); if (titles.has(k)) continue; titles.add(k); picked.push(s); } };
  const era = eraOf(answer.year);
  if (from && from.length) take(from);
  else {
    if (category !== 'all') {
      take(pool.filter(tier, era, category));
      if (picked.length < COUNT) take(pool.filter(tier, 'all', category));
      if (picked.length < COUNT) take(pool.filter(null, 'all', category));
    }
    if (picked.length < COUNT) take(pool.filter(tier, era, answer.category));
    if (picked.length < COUNT) take(pool.filter(tier, era));
    if (picked.length < COUNT) take(pool.filter(tier));
    if (picked.length < COUNT) take(pool.filter(null));
  }
  return shuffle(picked);
}
/** A choice as the wire and the grid carry it. */
export const toChoice = s => ({ id: s.id, title: s.title, artist: s.artist, artwork: s.artwork ? art(s.artwork, 120) : null });

/**
 * The board. choices: [{id,title,artwork}], picked: id|null, reveal: id|null (the right answer, once it may be shown),
 * hidden: Set of ids taken off by a hint. Clicks on rows carry data-choice="<id>".
 * Each row is a Pressable button (.choice) around the label (.cb) that carries the
 * fill, the stroke and the fade — as in SwiftUI, where the press dims the whole label.
 */
export function choiceGrid(choices, { picked = null, reveal = null, hidden = new Set() } = {}) {
  return `<div class="choices${reveal != null ? ' revealed' : ''}">${choices.map(c => row(c, picked, reveal, hidden)).join('')}</div>`;
}
function state(c, picked, reveal, hidden) {
  const isPicked = picked === c.id, isRight = reveal === c.id, wrongPick = reveal != null && isPicked && !isRight;
  const gone = hidden.has(c.id), faded = gone || (picked != null && !isPicked && !isRight);
  const cls = ['choice', isRight && 'right', wrongPick && 'wrong', isPicked && 'picked', faded && 'faded', gone && 'gone'].filter(Boolean).join(' ');
  const mark = isRight ? `<i class="mark ok">${I.checkCircle}</i>` : wrongPick ? `<i class="mark no">${I.xCircle}</i>` : '';
  return { cls, mark, off: picked != null || gone, kind: isRight ? 'ok' : wrongPick ? 'no' : '' };
}
function row(c, picked, reveal, hidden) {
  const s = state(c, picked, reveal, hidden);
  const img = c.artwork ? `<img src="${esc(art(c.artwork, 120))}" alt="" loading="eager">` : `<span class="noart">${I.note}</span>`;
  return `<button class="${s.cls}" data-press data-choice="${esc(c.id)}" ${s.off ? 'disabled' : ''} aria-label="${esc(c.title)}"><span class="cb"><span class="cover">${img}</span><span class="t">${esc(c.title)}</span>${s.mark}</span></button>`;
}
/**
 * Move an existing board to a new state in place, so the pick and the reveal
 * animate (a fresh choiceGrid() would just appear in its end state).
 * `root` is the .choices element or anything containing it. Returns false when
 * there is no board to update (draw a fresh one then).
 */
export function updateChoiceGrid(root, choices, { picked = null, reveal = null, hidden = new Set() } = {}) {
  const box = root?.classList?.contains('choices') ? root : root?.querySelector('.choices');
  if (!box) return false;
  box.classList.toggle('revealed', reveal != null);
  for (const c of choices) {
    const b = [...box.children].find(x => x.dataset.choice === String(c.id)); if (!b) return false;
    const s = state(c, picked, reveal, hidden);
    if (b.className !== s.cls) b.className = s.cls;
    b.disabled = s.off;
    const cur = b.querySelector('.mark'), curKind = cur ? (cur.classList.contains('ok') ? 'ok' : 'no') : '';
    if (curKind !== s.kind) { cur?.remove(); if (s.mark) b.querySelector('.cb').insertAdjacentHTML('beforeend', s.mark); }
  }
  return true;
}
