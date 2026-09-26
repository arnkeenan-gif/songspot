// Type-ahead that survives typos, a dropped apostrophe, word order and a
// missing "The": every typed word must land on a word of the title or the
// artist — exactly, as a prefix (the word being typed), or within one or two
// edits — and the matches are ranked by how much of the title they cover and
// how well known the song is. A lighter cousin of Engine/Matcher.swift.
export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'feat', 'ft', 'featuring']);
const NUM = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', u: 'you', ur: 'your', luv: 'love', n: 'and', tha: 'the' };
const tok = s => norm(s).split(' ').filter(Boolean).map(w => NUM[w] || w);

/** Titles lose their brackets and " - Remastered" tails before comparing. */
export function canonicalTitle(title) {
  let t = String(title || '').toLowerCase();
  t = t.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, ' ');
  t = t.replace(/\s+-\s+.*$/, ' ');
  t = t.replace(/\b(feat|ft|featuring)\.?\s.*$/, ' ');
  return norm(t);
}

function lev(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i), prev2 = null;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v); if (v < best) best = v;
    }
    if (best > cap) return cap + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}

export class Matcher {
  constructor(songs) {
    this.all = songs;
    for (const s of songs) this.index(s);
  }
  index(s) {
    if (s._tt) return;
    s._tt = tok(canonicalTitle(s.title)); s._at = tok(s.artist);
    s._flat = s._tt.join('') + '|' + s._at.join('');
  }
  /** How well one typed word lands on a list of words: 1 exact, .9 prefix, .7/.55 by edit distance. */
  static word(q, words, last) {
    let best = 0;
    for (const w of words) {
      if (w === q) return 1;
      if (last && w.startsWith(q)) { best = Math.max(best, q.length >= 2 ? 0.9 : 0.6); continue; }
      if (q.length >= 4 && (w[0] === q[0] || w[0] === q[1])) {
        const cap = q.length >= 7 ? 2 : 1;
        const d = lev(q, last && w.length > q.length ? w.slice(0, q.length + 1) : w, cap);
        if (d <= cap) best = Math.max(best, d === 1 ? 0.72 : 0.55);
      }
    }
    return best;
  }
  search(query, limit = 8, scope = null) {
    const q = tok(query);
    if (!q.length) return [];
    const words = q.filter(w => !STOP.has(w) || q.length === 1);
    const qs = words.length ? words : q;
    const squashed = q.join('');
    const src = scope || this.all || [];
    const out = [];
    for (const s of src) {
      this.index(s);
      let score = 0, inTitle = 0, ok = true, weakest = 1;
      for (let i = 0; i < qs.length; i++) {
        const last = i === qs.length - 1;
        const t = Matcher.word(qs[i], s._tt, last), a = Matcher.word(qs[i], s._at, last);
        const m = Math.max(t, a * 0.92);
        if (m === 0) { ok = false; break; }
        weakest = Math.min(weakest, m); score += m; if (t >= a) inTitle++;
      }
      if (!ok) {
        // "dontstopmenow" / "dont stop me" typed without spaces
        if (squashed.length >= 5 && s._flat.includes(squashed)) score = qs.length * 0.8, inTitle = qs.length;
        else continue;
      }
      const cover = inTitle / Math.max(1, s._tt.length);
      const full = s._tt.join(' ').startsWith(q.join(' ')) ? 0.6 : 0;
      const fame = 0.25 * (3 - Math.min(3, s.fame ?? 3)) + (s.artistRank === 0 ? 0.1 : 0);
      out.push([score / qs.length + 0.4 * Math.min(1, cover) + full + fame, s, weakest]);
    }
    // Two-letter slips only count when nothing closer turned up.
    const close = out.filter(x => x[2] >= 0.7);
    const list = close.length ? close : out;
    list.sort((a, b) => b[0] - a[0]);
    out.length = 0; out.push(...list);
    const seen = new Set(), res = [];
    for (const [, s] of out) { const k = s._tt.join(' ') + '|' + s._at.join(' '); if (seen.has(k)) continue; seen.add(k); res.push(s); if (res.length >= limit) break; }
    return res;
  }
}
