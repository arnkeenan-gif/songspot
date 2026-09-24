// Is this guess that song? Titles lose their parentheticals, features and
// remaster tags before comparing, so "Here Comes the Sun (Remastered 2009)"
// and "here comes the sun" are the same answer.
import { norm } from './pool.js';

export function canonicalTitle(title) {
  let t = title.toLowerCase();
  t = t.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ' ');                 // (feat. …), [remastered]
  t = t.replace(/\s+-\s+.*$/, ' ');                                // " - Remastered 2011", " - Single Version"
  t = t.replace(/\b(feat|ft|featuring)\.?\s.*$/, ' ');
  return norm(t);
}

/** True when the guess names the song: same canonical title, or the pool row itself. */
export function matches(guess, song) {
  if (!guess || !song) return false;
  if (typeof guess === 'object') return guess.id === song.id || canonicalTitle(guess.title) === canonicalTitle(song.title);
  const g = canonicalTitle(guess);
  if (!g) return false;
  const t = canonicalTitle(song.title);
  return g === t || (g.length >= 6 && (t.startsWith(g) || g.startsWith(t)) && Math.abs(g.length - t.length) <= 3);
}
