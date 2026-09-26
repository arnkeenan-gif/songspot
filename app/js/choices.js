// Four answers for party and ranked: the song and three that could pass for
// it (Engine/Choices.swift). Decoys come from the same difficulty, and from
// the same decade and genre when there are enough, so the right one never
// stands out. ChoiceGrid draws them as the app does: cover + title rows, one
// tap is final, the right row lights green and a wrong pick red.
import { eraOf } from './pool.js';
import { esc, art } from './ui.js';
import { I } from './icons.js';

export const COUNT = 4;
export const choiceKey = t => String(t || '').split('(')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** `from` is the songs in play (an artist's catalogue), null for the whole pool. */
export function deal(answer, tier, pool, from = null) {
  const picked = [answer], titles = new Set([choiceKey(answer.title)]);
  const take = list => { for (const s of shuffle(list)) { if (picked.length >= COUNT) break; if (s.id === answer.id) continue; const k = choiceKey(s.title); if (titles.has(k)) continue; titles.add(k); picked.push(s); } };
  const era = eraOf(answer.year);
  if (from && from.length) take(from);
  else {
    take(pool.filter(tier, era, answer.category));
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
 */
export function choiceGrid(choices, { picked = null, reveal = null, hidden = new Set() } = {}) {
  return `<div class="choices">${choices.map(c => {
    const isPicked = picked === c.id, isRight = reveal === c.id, wrongPick = reveal != null && isPicked && !isRight;
    const gone = hidden.has(c.id), faded = gone || (picked != null && !isPicked && !isRight);
    const cls = ['choice', isRight && 'right', wrongPick && 'wrong', isPicked && 'picked', faded && 'faded', gone && 'gone'].filter(Boolean).join(' ');
    const img = c.artwork ? `<img src="${esc(art(c.artwork, 120))}" alt="" loading="eager">` : `<span class="noart">${I.note}</span>`;
    const mark = isRight ? `<i class="mark ok">${I.checkCircle}</i>` : wrongPick ? `<i class="mark no">${I.xCircle}</i>` : '';
    return `<button class="${cls}" data-press data-choice="${esc(c.id)}" ${picked != null || gone ? 'disabled' : ''} aria-label="${esc(c.title)}"><span class="cover">${img}</span><span class="t">${esc(c.title)}</span>${mark}</button>`;
  }).join('')}</div>`;
}
