// The guess search: Engine/Matcher.swift (and normalise() from
// Engine/Model.swift) ported line by line, so a typed guess finds the same
// songs in the same order on the web as on the iPhone. An indexed lexical
// shortlist (exact, type-ahead prefix, one deletion, a vocabulary-bigram
// fallback), then the phrase rules, title coverage and a bounded
// Damerau-Levenshtein rerank. Featured artists (the pool's `credit` and
// "(feat. …)" in titles), films and albums, artist aliases, judge mode
// (`artistBrowse` false: a bare name never stands for one of their songs),
// one row per recording and at most three rows of one title.
//
// Every map is a Map (never a plain object: a typed "constructor" must not
// find Object.prototype), and every sum runs in the Swift order, so ties
// break the same way.

// ---------- normalise (Engine/Model.swift) ----------
const FOLD = [['ø', 'o'], ['æ', 'ae'], ['ß', 'ss'], ['ð', 'd'], ['þ', 'th'], ['ł', 'l'], ['œ', 'oe']];
/** The web build's normalise, character for character, plus the iPhone's two steps (ø/æ/ß…, and !/$ for a letter). */
export function normalise(raw) {
  let s = String(raw ?? '').toLowerCase();
  if (/[^\x00-\x7f]/.test(s)) {
    // folding(.diacriticInsensitive): the marks come off, the letters stay.
    s = s.normalize('NFD').replace(/\p{Mn}/gu, '');
    // Letters folding leaves whole would turn into spaces ("Søvnløs" read as "s vnl s").
    for (const [from, to] of FOLD) if (s.includes(from)) s = s.split(from).join(to);
  }
  s = s.replace(/\(.*?\)|\[.*?\]/g, ' ');
  s = s.replace(/\s*-\s*(single|ep|remaster(ed)?.*|.*version|.*edit)$/i, ' ');
  s = s.split('&').join(' and ');
  // A symbol standing in for a letter: P!nk, FE!N, A$AP Rocky, Ty Dolla $ign.
  if (s.includes('!') || s.includes('$')) s = s.replace(/(?<=[a-z])!(?=[a-z])/g, 'i').replace(/\$(?=[a-z])/g, 's');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.trim();
}
/** Kept for older callers: the same as normalise(). */
export const norm = normalise;

// ---------- token canonicalisation ----------
const numWord = new Map(Object.entries({
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
  eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60', seventy: '70',
  eighty: '80', ninety: '90',
}));
const ordinal = new Map(Object.entries({
  first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', sixth: '6th', seventh: '7th', eighth: '8th', ninth: '9th', tenth: '10th',
}));
const shorthand = new Map(Object.entries({ to: '2', too: '2', for: '4', u: 'you', ur: 'your', n: 'and', em: 'them', yall: 'you', tupac: '2pac' }));
/** Contractions that stand for two words, written into the index as well as the contracted form. */
const expandTwo = new Map(Object.entries({
  wanna: ['want', '2'], gonna: ['going', '2'], gimme: ['give', 'me'], lotta: ['lot', 'of'], kinda: ['kind', 'of'],
  outta: ['out', 'of'], gotta: ['got', '2'], aint: ['is', 'not'], cant: ['can', 'not'], dont: ['do', 'not'],
  wont: ['will', 'not'], im: ['i', 'am'], ill: ['i', 'will'], theres: ['there', 'is'], whats: ['what', 'is'], its: ['it', 'is'],
}));
/** normalise() splits "don't" into "don t"; these fragments glue back on. */
const tails = new Set(['t', 's', 'd', 'm', 'll', 're', 've']);

function canon(w, plural = true) {
  const c = numWord.get(w) ?? ordinal.get(w) ?? shorthand.get(w);
  if (c !== undefined) return c;
  if (w.length >= 5) {
    if (w.endsWith('ing')) return w.slice(0, -3) + 'in';          // believin'
    if (plural && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  }
  return w;
}
const words = s => s.split(' ').filter(Boolean);

/** Canonical tokens for an already-normalised string. */
function tokenise(s, expand = true, plural = true) {
  let raw = words(s);
  if (raw.length > 1) {
    const glued = [];
    for (const w of raw) { if (tails.has(w) && glued.length) glued[glued.length - 1] += w; else glued.push(w); }
    raw = glued;
  }
  const out = [];
  let i = 0;
  while (i < raw.length) {
    const w = raw[i];
    // "twenty one" -> "21"
    if (i + 1 < raw.length) {
      const a = numWord.get(w), b = numWord.get(raw[i + 1]);
      if (a !== undefined && b !== undefined) {
        const ai = +a, bi = +b;
        if (ai >= 20 && ai % 10 === 0 && bi < 10) { out.push(String(ai + bi)); i += 2; continue; }
      }
    }
    out.push(canon(w, plural));
    const pair = expand ? expandTwo.get(w) : undefined;
    if (pair) { out.push(pair[0]); out.push(pair[1]); }
    i += 1;
  }
  return out;
}
/** A title as it is said: contractions spelled out and plurals kept. */
const spokenForm = s => tokenise(s, true, false).filter(t => !expandTwo.has(t)).join(' ');

/**
 * Whether a typed answer names this song: the title, or the title and the
 * artist, compared as the matcher reads words, so "believing" is "Believin'",
 * "dont" is "Don't" and "(2024 Remaster)" is never needed.
 */
export function namesSong(typed, title, artist) {
  const guess = normalise(typed);
  if (!guess) return false;
  const t = normalise(title);
  if (guess === t || guess === `${t} ${normalise(artist)}`) return true;
  const canonical = s => tokenise(s, false).join(' ');
  const g = canonical(guess), c = canonical(t);
  return !!c && (g === c || g === `${c} ${canonical(normalise(artist))}`);
}

// ---------- bounded edit distance ----------
/** Damerau-Levenshtein, abandoned once every cell exceeds `cap` (the Swift rows, cell for cell). */
function damerau(a, b, cap) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > cap) return cap + 1;
  let prev2 = new Int32Array(lb + 2), prev = new Int32Array(lb + 2), cur = new Int32Array(lb + 2);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    for (let j = 1; j <= lb; j++) cur[j] = 0;
    const ca = a.charCodeAt(i - 1);
    const lo = Math.max(1, i - cap), hi = Math.min(lb, i + cap);
    if (lo > 1) cur[lo - 1] = cap + 1;
    let best = cap + 1;
    for (let j = lo; j <= hi; j++) {
      const cb = b.charCodeAt(j - 1);
      let c = ca === cb ? prev[j - 1] : prev[j - 1] + 1;
      let d = cur[j - 1] + 1; if (d < c) c = d;
      d = prev[j] + 1; if (d < c) c = d;
      if (i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === cb && prev2[j - 2] + 1 < c) c = prev2[j - 2] + 1;
      cur[j] = c;
      if (c < best) best = c;
    }
    if (hi < lb) cur[hi + 1] = cap + 1;
    if (best > cap) return cap + 1;
    const t = prev2; prev2 = prev; prev = cur; cur = t;
  }
  return prev[lb];
}
/** 1 - normalised edit distance, 0 when the lengths are too far apart. */
function similarity(a, b) {
  const la = a.length, lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const m = Math.max(la, lb), cap = 1 + Math.floor(m / 4);
  if (Math.abs(la - lb) > cap) return 0;
  const d = damerau(a, b, cap);
  if (d > cap) return 0;
  return 1.0 - d / m;
}
function lowerBound(xs, v) { let lo = 0, hi = xs.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (xs[mid] < v) lo = mid + 1; else hi = mid; } return lo; }
const push = (map, k, v) => { const a = map.get(k); if (a) a.push(v); else map.set(k, [v]); };

// ---------- the index ----------
const titleW = 1.0, extraW = 0.72, artistW = 0.62;
/** Someone credited besides the act it is filed under (a featured artist, a duet partner). */
const guestW = 0.58;
/** The album: a film's soundtrack nearly as much as the artist, any other album a little. */
const filmW = 0.6, albumW = 0.3;
/** Words that join a title to a name in what people type ("stay by justin bieber"). */
const connectives = new Set(['by', 'feat', 'ft', 'featuring', 'with']);
const popW = 2.0, rankW = 0.1;
const commonDF = 400, shortlistN = 60, rerankN = 24;
const TIERS = ['easy', 'medium', 'hard', 'expert', 'impossible'];
const tierIndex = t => { const i = TIERS.indexOf(t ?? ''); return i < 0 ? TIERS.length : i; };
// ICU's \b (Unicode word characters), which JavaScript's ASCII \b is not.
const W = '[\\p{L}\\p{M}\\p{N}\\p{Pc}]', B = `(?<!${W})`, A = `(?!${W})`;
const FEAT = /[\(\[]\s*(feat\.?|ft\.?|featuring|with)\s+[^\)\]]+/giu;
const FEAT_CLAUSE = /[\(\[]\s*(feat\.?|ft\.?|featuring|with)\s+[^\)\]]*[\)\]]/giu;
const GUEST_CUT = new RegExp(`\\s*(,|&|${B}x${A}|${B}feat\\.?|${B}ft\\.?|${B}featuring${A}|${B}with${A}|${B}and${A})\\s*`, 'giu');
const ACT_CUT = new RegExp(`\\s*(,|&|${B}x${A})\\s*`, 'giu');
const FILM = new RegExp(`soundtrack|motion picture|original score|from the (movie|film|series)|music from|${B}ost${A}`, 'iu');

/** Everyone credited on a song besides its main artist, normalised. */
function guests(s) {
  const raw = [];
  if (s.credit != null && s.credit !== s.artist) raw.push(s.credit.startsWith(s.artist) ? s.credit.slice(s.artist.length) : s.credit);
  if (s.title.includes('(') || s.title.includes('[')) {
    FEAT.lastIndex = 0;
    let m;
    while ((m = FEAT.exec(s.title))) {
      const inner = m[0].replace(/^[\(\[ ]+/, '');
      const sp = inner.indexOf(' ');
      if (sp >= 0) raw.push(inner.slice(sp));
    }
  }
  if (!raw.length) return [];
  const main = normalise(s.artist), out = [];
  for (const chunk of raw) {
    for (const part of chunk.replace(GUEST_CUT, '|').split('|')) {
      if (!part) continue;
      const name = normalise(part);
      if (name.length >= 2 && name !== main && !out.includes(name)) out.push(name);
    }
  }
  return out;
}
/** The album as people would name it, and whether it is a film's soundtrack; null when it says nothing. */
function albumName(s, t) {
  const raw = s.album;
  if (!raw) return null;
  const film = s.category === 'Soundtrack' || FILM.test(raw);
  let a = normalise(raw);
  a = a.replace(/\b(the )?(original )?((motion picture|movie|film|broadway|london|cast|television|tv|series|music) )*(soundtrack|score|recording)( album)?\b.*$/, '');
  a = a.replace(/^music from (the )?((motion picture|movie|film) )?/, '');
  a = a.replace(/\b(deluxe|expanded|anniversary|special|bonus track|remastered|edition|version)\b/g, ' ');
  a = words(a).join(' ');
  if (a.length < 2 || a === t || a === 'greatest hits' || a === 'the best of' || a === 'hits') return null;
  return { name: a, film };
}
/** A main credit that is several acts ("Zedd & Alessia Cara"): each of them. */
function acts(artist) {
  if (!(artist.includes(' & ') || artist.includes(', ') || artist.includes(' x '))) return [];
  return artist.replace(ACT_CUT, '|').split('|').filter(Boolean).map(normalise).filter(n => n.length >= 4);
}

export class Matcher {
  /**
   * The index is built in slices (see work()), so building it never holds up
   * a frame: Pool hands the slices to idle time after the page is up, and a
   * search that comes first finishes it there and then.
   */
  constructor(songs) {
    this.n = songs.length; this.songs = songs; this.ready = false;
    this._gen = this._build();
  }
  /** Finish building now. */
  finish() { if (!this.ready) while (!this._gen.next().done); return this; }
  /** Build for up to `ms` milliseconds; true once the index is complete. */
  work(ms = 8) { const end = performance.now() + ms; while (!this.ready && performance.now() < end) this._gen.next(); return this.ready; }

  *_build() {
    const songs = this.songs, n = this.n;
    const title = this.title = new Array(n), artist = this.artist = new Array(n);
    const collapsed = this.collapsed = new Array(n), sortedTitle = this.sortedTitle = new Array(n);
    const wordsN = this.words = new Int32Array(n);
    const prior = this.prior = new Float64Array(n);
    const guestStr = this.guestStr = new Array(n).fill('');
    const albumStr = this.albumStr = new Array(n).fill('');
    const albumPadded = this.albumPadded = new Array(n).fill('');
    const isFilm = this.isFilm = new Uint8Array(n);
    const spoken = this.spoken = new Array(n), spokenFull = this.spokenFull = new Array(n).fill('');
    const vocab = this.vocab = new Map(), postings = this.postings = [], term = this.term = [];
    const byGuest = this.byGuest = new Map();
    const toks = new Array(n), titleToks = new Array(n);
    const guestRows = [], albumRows = [];

    for (let i = 0; i < n; i++) {
      if ((i & 127) === 127) yield;
      const s = songs[i];
      const t = normalise(s.title);
      // The bracketed text again, kept ("(Backstreet's Back)"), without a feat clause.
      const bracketed = /[()\[\]]/.test(s.title);
      const full = bracketed ? normalise(s.title.replace(FEAT_CLAUSE, ' ').replace(/[()\[\]]/g, ' ')) : t;
      const a = normalise(s.artist);
      title[i] = t; artist[i] = a;
      collapsed[i] = t.split(' ').join('');
      const parts = words(t);
      wordsN[i] = t ? parts.length : 0;
      sortedTitle[i] = parts.slice().sort().join(' ');
      spoken[i] = ' ' + spokenForm(t) + ' ';
      if (full !== t) spokenFull[i] = ' ' + spokenForm(full) + ' ';

      const d = new Map(), tt = new Set();
      const fields = [[tokenise(t), titleW]];
      if (bracketed) fields.push([tokenise(full), extraW]);
      fields.push([tokenise(a), artistW]);
      const featured = guests(s);
      if (featured.length) {
        for (const name of featured) { fields.push([tokenise(name), guestW]); push(byGuest, name, i); guestRows.push([name, i]); }
        guestStr[i] = ' ' + featured.join(' ') + ' ';
      }
      const al = albumName(s, t);
      if (al) {
        fields.push([tokenise(al.name), al.film ? filmW : albumW]);
        albumStr[i] = al.name; albumPadded[i] = ' ' + al.name + ' '; isFilm[i] = al.film ? 1 : 0;
        albumRows.push([al.name, i]);
      }
      for (const [list, weight] of fields) {
        for (const tok of list) {
          let v = vocab.get(tok);
          if (v === undefined) { v = postings.length; vocab.set(tok, v); postings.push([]); term.push(tok); }
          const have = d.get(v);
          if ((have ?? 0) < weight) { if (have === undefined) postings[v].push(i); d.set(v, weight); }
          if (weight === titleW) tt.add(v);
        }
      }
      toks[i] = d; titleToks[i] = tt;
      const rank = s.artistRank ?? 0, fame = s.fame ?? 2;
      prior[i] = (3 - fame) * popW - Math.min(rank, 40) * rankW;
    }

    // Flattened, sorted per song, binary-searched.
    const tokID = [], tokW = [], tokOff = [0], titleTokID = [], titleTokOff = [0];
    for (let i = 0; i < n; i++) {
      if ((i & 1023) === 1023) yield;
      const keys = [...toks[i].keys()].sort((x, y) => x - y);
      for (const v of keys) { tokID.push(v); tokW.push(toks[i].get(v)); }
      tokOff.push(tokID.length);
      for (const v of [...titleToks[i]].sort((x, y) => x - y)) titleTokID.push(v);
      titleTokOff.push(titleTokID.length);
    }
    this.tokID = Int32Array.from(tokID); this.tokW = Float64Array.from(tokW); this.tokOff = Int32Array.from(tokOff);
    this.titleTokID = Int32Array.from(titleTokID); this.titleTokOff = Int32Array.from(titleTokOff);

    yield;
    // Two songs can share a title: the best known keeps the tie.
    const tieKey = i => {
      const s = songs[i];
      return (s.fame ?? 2) * 1_000_000 + (s.sceneOnly === true ? 500_000 : 0) + tierIndex(s.tier) * 20_000 + (s.year ?? 9999) + 0.5 * (s.artistRank ?? 0);
    };
    const groups = new Map();
    for (let i = 0; i < n; i++) push(groups, title[i], i);
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      let first = g[0], bestKey = tieKey(first);
      for (let k = 1; k < g.length; k++) { const key = tieKey(g[k]); if (key < bestKey) { bestKey = key; first = g[k]; } }
      for (const i of g) if (i !== first) prior[i] -= 0.6;
    }

    yield;
    const idf = this.idf = Float64Array.from(postings, p => Math.log(1.0 + n / Math.max(p.length, 1)));
    const titleIDF = this.titleIDF = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0.0;
      for (let k = this.titleTokOff[i]; k < this.titleTokOff[i + 1]; k++) sum += idf[this.titleTokID[k]];
      titleIDF[i] = sum === 0 ? 1.0 : sum;
    }
    yield;
    this.vocabSorted = [...vocab.keys()].sort();
    this.vocabSortedIDs = Int32Array.from(this.vocabSorted, w => vocab.get(w));

    // deletion index: every term and its single-character deletions
    const deletions = this.deletions = new Map(), bigrams = this.bigrams = new Map();
    yield;
    let nv = 0;
    for (const [w, v] of vocab) {
      if ((++nv & 1023) === 0) yield;
      if (w.length >= 4) {
        push(deletions, w, v);
        for (let k = 0; k < w.length; k++) push(deletions, w.slice(0, k) + w.slice(k + 1), v);
      }
      // bigrams over the vocabulary: the last resort for a word mangled beyond one edit
      if (w.length >= 5) for (let k = 0; k < w.length - 1; k++) push(bigrams, w.slice(k, k + 2), v);
    }
    yield;
    for (const l of deletions.values()) if (l.length > 1) l.sort((x, y) => x - y);
    for (const l of bigrams.values()) if (l.length > 1) l.sort((x, y) => x - y);
    yield;

    yield;
    const byCollapsed = this.byCollapsed = new Map();
    for (let i = 0; i < n; i++) push(byCollapsed, collapsed[i], i);
    const cmpBy = arr => (x, y) => arr[x] === arr[y] ? x - y : (arr[x] < arr[y] ? -1 : 1);
    const idx = Array.from({ length: n }, (_, i) => i);
    const byTitle = idx.slice().sort(cmpBy(title));
    this.titlesSorted = byTitle.map(i => title[i]); this.titlesOrder = byTitle;
    yield;
    const byArt = idx.slice().sort(cmpBy(artist));
    this.artistsSorted = byArt.map(i => artist[i]); this.artistsOrder = byArt;
    const byArtist = this.byArtist = new Map();
    for (let i = 0; i < n; i++) push(byArtist, artist[i], i);
    // Pool.depthOrdered's order, a scene's import after the curated rows.
    const MAX = Number.MAX_SAFE_INTEGER;
    const depth = i => { const s = songs[i]; return [s.sceneOnly === true ? 1 : 0, tierIndex(s.artistTier ?? s.tier), s.artistRank ?? MAX, s.fame ?? MAX, i]; };
    const tupleLess = (a, b) => { for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1; return 0; };
    yield;
    for (const l of byArtist.values()) { const keys = new Map(l.map(i => [i, depth(i)])); l.sort((x, y) => tupleLess(keys.get(x), keys.get(y))); }
    yield;
    this.artistNames = [...byArtist.keys()].sort();
    const artistAlias = this.artistAlias = new Map();
    for (const name of this.artistNames) {
      for (const alias of [name.split(' ').join(''), spokenForm(name)]) {
        if (alias === name) continue;
        if (!artistAlias.has(alias) && !byArtist.has(alias)) artistAlias.set(alias, name);
      }
    }
    yield;
    // Each act of a joint credit, when it is an act of its own or a whole name.
    for (let i = 0; i < n; i++) {
      for (const name of acts(songs[i].artist)) if (name !== artist[i] && (byArtist.has(name) || name.includes(' '))) push(byGuest, name, i);
    }
    yield;
    const byPrior = (x, y) => prior[x] === prior[y] ? x - y : (prior[x] > prior[y] ? -1 : 1);
    for (const l of byGuest.values()) l.sort(byPrior);
    const rowCmp = (a, b) => a[0] === b[0] ? a[1] - b[1] : (a[0] < b[0] ? -1 : 1);
    guestRows.sort(rowCmp); albumRows.sort(rowCmp);
    this.albumsSorted = albumRows.map(r => r[0]); this.albumsOrder = albumRows.map(r => r[1]);
    const byFilm = this.byFilm = new Map();
    for (const [name, i] of albumRows) if (isFilm[i]) push(byFilm, name, i);
    for (const l of byFilm.values()) l.sort(byPrior);
    this.guestsSorted = guestRows.map(r => r[0]); this.guestsOrder = guestRows.map(r => r[1]);

    yield;
    const postW = this.postW = new Array(postings.length);
    for (let v = 0; v < postings.length; v++) {
      if ((v & 2047) === 2047) yield;
      const docs = postings[v], ws = postW[v] = new Float64Array(docs.length);
      for (let j = 0; j < docs.length; j++) ws[j] = this.weight(docs[j], v);
    }
    this.hitScore = new Float64Array(n); this.hitStamp = new Int32Array(n); this.generation = 0;
    yield;
    this.titlePadded = title.map(t => ' ' + t + ' ');
    this.bareTitle = title.map(t => { for (const a of ['the ', 'a ', 'an ']) if (t.startsWith(a) && t.length > a.length + 2) return t.slice(a.length); return ''; });
    this.ready = true;
  }

  /** The recording row `i` holds: the same title by the same act is one song. */
  recording(i) { this.finish(); return this.title[i] + '|' + this.artist[i]; }

  /** The field weight of `term` in `song`, or undefined when it does not occur. */
  weight(song, v) {
    let lo = this.tokOff[song], hi = this.tokOff[song + 1]; const end = hi;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.tokID[mid] < v) lo = mid + 1; else hi = mid; }
    return lo < end && this.tokID[lo] === v ? this.tokW[lo] : undefined;
  }
  inTitle(song, v) {
    let lo = this.titleTokOff[song], hi = this.titleTokOff[song + 1]; const end = hi;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.titleTokID[mid] < v) lo = mid + 1; else hi = mid; }
    return lo < end && this.titleTokID[lo] === v;
  }

  /** vocab id -> match quality, for one typed word. */
  candidates(tok, isLast) {
    const out = new Map(), { vocab, vocabSorted, vocabSortedIDs, postings, term } = this;
    const exact = vocab.get(tok);
    if (exact !== undefined) out.set(exact, 1.0);
    const len = tok.length;
    if (isLast && len >= 3) {
      // The word still being typed; common words are skipped.
      let lo = lowerBound(vocabSorted, tok), hits = 0, cost = 0;
      while (lo < vocabSorted.length && vocabSorted[lo].startsWith(tok) && hits < 40) {
        const vid = vocabSortedIDs[lo]; lo += 1;
        const df = postings[vid].length;
        if (df > 400 || cost + df > 900) continue;
        hits += 1; cost += df;
        if (!out.has(vid)) out.set(vid, 0.90);
      }
    }
    if (len >= 4 && exact === undefined) {
      const seen = new Set();
      const add = l => { if (l) for (const v of l) seen.add(v); };
      add(this.deletions.get(tok));
      for (let k = 0; k < len; k++) add(this.deletions.get(tok.slice(0, k) + tok.slice(k + 1)));
      // One letter out, either way: the word that shares more of the start is likelier meant.
      for (const vid of seen) {
        if (out.has(vid)) continue;
        const w = term[vid]; let cp = 0; const lim = Math.min(w.length, len);
        while (cp < lim && w.charCodeAt(cp) === tok.charCodeAt(cp)) cp += 1;
        out.set(vid, 0.80 + 0.02 * Math.min(cp, 4));
      }
    }
    if (len >= 6 && out.size === 0) {
      const grams = new Set();
      for (let k = 0; k < len - 1; k++) grams.add(tok.slice(k, k + 2));
      const need = Math.max(3, Math.floor((grams.size + 1) / 2));
      const count = new Map();
      for (const g of grams) { const l = this.bigrams.get(g); if (!l) continue; for (const v of l) count.set(v, (count.get(v) || 0) + 1); }
      const best = [];
      for (const [vid, c] of count) {
        if (c < need) continue;
        const w = term[vid];
        if (Math.abs(w.length - len) > 3) continue;
        const s = similarity(tok, w);
        if (s >= 0.6) best.push([s, vid]);
      }
      best.sort((a, b) => a[0] === b[0] ? b[1] - a[1] : b[0] - a[0]);
      for (const [s, vid] of best.slice(0, 10)) out.set(vid, 0.50 + 0.45 * (s - 0.6) / 0.4);
    }
    return out;
  }

  /** allow: a Set of song ids the result is limited to, or null. */
  search(query, limit = 8, allow = null, artistBrowse = true) {
    this.finish();
    const { songs, n, title, artist, collapsed, sortedTitle, postings, idf, vocab } = this;
    const q = normalise(query);
    if (!q) return [];
    const qc = q.split(' ').join('');
    const qSorted = words(q).sort().join(' ');
    const qtoks = tokenise(q, false);
    const said = spokenForm(q);
    const qSpoken = ' ' + said + ' ';
    const spaceSpoken = qSpoken.slice(0, -1);
    // Not for two or three letters, nor a lone number word.
    const sayable = q.length >= 4 && !(qtoks.length === 1 && /^[0-9]+$/.test(qtoks[0]));
    let uniq = [];
    { const seenTok = new Set(); for (const tk of qtoks) if (!seenTok.has(tk)) { seenTok.add(tk); uniq.push(tk); } }
    const last = qtoks.length ? qtoks[qtoks.length - 1] : '';
    if (uniq.filter(t => !connectives.has(t)).length >= 2) uniq = uniq.filter(t => !(connectives.has(t) && t !== last));
    const nq = words(q).length;

    const matches = [], weights = [];
    // The word as typed, where reading it changed it ("beling" is read "belin").
    const asTyped = new Map();
    for (const w of words(q)) { if (w.length < 5) continue; const c = canon(w); if (c !== w && !asTyped.has(c)) asTyped.set(c, w); }
    for (const tk of uniq) {
      const m = this.candidates(tk, tk === last);
      const w = asTyped.get(tk);
      if (w !== undefined && !vocab.has(tk)) for (const [v, qual] of this.candidates(w, false)) if ((m.get(v) ?? 0) < qual) m.set(v, qual);
      matches.push([...m].sort((a, b) => a[0] - b[0]));
      const ev = vocab.get(tk);
      if (ev !== undefined) weights.push(idf[ev]);
      else { let mx = -Infinity; for (const v of m.keys()) if (idf[v] > mx) mx = idf[v]; weights.push(m.size ? mx : Math.log(1.0 + n)); }
    }
    let totalIDF = weights.reduce((a, b) => a + b, 0);
    if (totalIDF === 0) totalIDF = 1.0;

    // walk the selective tokens only
    const acc = new Map();
    const order = uniq.map((_, i) => i).sort((a, b) => weights[a] === weights[b] ? a - b : (weights[a] > weights[b] ? -1 : 1));
    let budget = 4000; const skipped = [];
    const { hitScore, hitStamp } = this;
    for (const k of order) {
      const m = matches[k];
      if (!m.length) continue;
      let cost = 0; for (const [v] of m) cost += postings[v].length;
      if (cost > commonDF && acc.size && budget <= 0) { skipped.push(k); continue; }
      if (cost > 1200 && acc.size) { skipped.push(k); continue; }
      budget -= cost;
      const w = weights[k];
      const gen = ++this.generation;
      const touched = [];
      for (const [v, qual] of m) {
        const docs = postings[v], ws = this.postW[v];
        for (let j = 0; j < docs.length; j++) {
          const i = docs[j], s = qual * ws[j];
          if (hitStamp[i] !== gen) { hitStamp[i] = gen; hitScore[i] = s; touched.push(i); }
          else if (hitScore[i] < s) hitScore[i] = s;
        }
      }
      for (const i of touched) acc.set(i, (acc.get(i) ?? 0) + hitScore[i] * w);
    }
    // The common words still tell the songs already found apart.
    if (skipped.length && acc.size <= 6000) {
      for (const i of [...acc.keys()]) {
        let add = 0.0;
        for (const k of skipped) {
          let b = 0.0;
          for (const [v, qual] of matches[k]) { const fw = this.weight(i, v); if (fw !== undefined && qual * fw > b) b = qual * fw; }
          add += b * weights[k];
        }
        if (add > 0) acc.set(i, acc.get(i) + add);
      }
    }

    // titles that start with what was typed, the exact collapsed title, artists, guests, films and albums
    let forced = new Set(this.byCollapsed.get(qc) || []);
    { let lo = lowerBound(this.titlesSorted, q), taken = 0;
      while (lo < this.titlesSorted.length && this.titlesSorted[lo].startsWith(q) && taken < 120) { forced.add(this.titlesOrder[lo]); lo++; taken++; } }
    { let lo = lowerBound(this.artistsSorted, q);
      while (lo < this.artistsSorted.length && this.artistsSorted[lo].startsWith(q)) { forced.add(this.artistsOrder[lo]); lo++; } }
    { let lo = lowerBound(this.guestsSorted, q), taken = 0;
      while (lo < this.guestsSorted.length && this.guestsSorted[lo].startsWith(q) && taken < 120) { forced.add(this.guestsOrder[lo]); lo++; taken++; } }
    if (q.length >= 3) {
      let lo = lowerBound(this.albumsSorted, q), taken = 0;
      while (lo < this.albumsSorted.length && this.albumsSorted[lo].startsWith(q) && taken < 60) { forced.add(this.albumsOrder[lo]); lo++; taken++; }
    }
    for (const i of forced) if (!acc.has(i)) acc.set(i, 0);
    if (allow) {
      for (const i of [...acc.keys()]) if (!allow.has(songs[i].id)) acc.delete(i);
      forced = new Set([...forced].filter(i => allow.has(songs[i].id)));
    }
    if (!acc.size) return [];

    // ---- stage two ----
    let cands = [...acc.keys()].sort((a, b) => { const x = acc.get(a), y = acc.get(b); return x === y ? a - b : (x > y ? -1 : 1); });
    if (cands.length > shortlistN) cands.length = shortlistN;
    const keep = new Set(cands);
    cands = cands.concat([...forced].filter(i => !keep.has(i)).sort((a, b) => a - b));

    // The act the query names, if it names one.
    const { byArtist, byGuest } = this;
    let named = byArtist.has(q) ? q : null;
    if (named == null && qc.length >= 4) named = [qc, said].find(x => byArtist.has(x)) ?? this.artistAlias.get(qc) ?? this.artistAlias.get(said) ?? null;
    // Judging an answer, that act's own songs count only when their title was typed.
    const credited = new Set();
    if (!artistBrowse) {
      for (const who of [named, byGuest.has(q) ? q : null]) {
        if (who == null) continue;
        for (const i of byArtist.get(who) || []) credited.add(i);
        for (const i of byGuest.get(who) || []) credited.add(i);
      }
    }

    const padded = ' ' + q + ' ', spaceQ = ' ' + q;
    const scored = [];
    for (const k of cands) {
      const tb = title[k], ab = artist[k];
      let cov = 0.0, artistHit = false;
      const hit = new Set();
      for (let j = 0; j < matches.length; j++) {
        let b = 0.0;
        for (const [v, qual] of matches[j]) {
          const w = this.weight(k, v); if (w === undefined) continue;
          const s = qual * w; if (s > b) b = s;
          if (this.inTitle(k, v)) hit.add(v);
          else if (w === artistW || w === guestW) artistHit = true;
        }
        if (b !== 0) cov += weights[j] * b;
      }
      cov /= totalIDF;
      let tcov = 0.0;
      if (hit.size) { let sum = 0.0; for (const v of [...hit].sort((a, b) => a - b)) sum += idf[v]; tcov = sum / this.titleIDF[k]; }

      const guest = this.guestStr[k], album = this.albumStr[k], bare = this.bareTitle[k];
      let base;
      if (tb === q) base = 118.0;
      else if (sayable && this.spoken[k] === qSpoken) base = 110.0;
      else if (tb.startsWith(q)) base = 100.0 - tb.length * 0.01;
      else if (collapsed[k] === qc) base = 104.0;
      else if (bare && bare === q) base = 112.0;
      else if (bare && bare.startsWith(q)) base = 99.0 - tb.length * 0.01;
      else if (tb.includes(spaceQ)) base = 70.0;
      else if (qtoks.length >= 2 && this.spokenFull[k] && this.spokenFull[k].includes(spaceSpoken) && !this.spoken[k].includes(spaceSpoken)) base = 60.0;
      else if (tb.includes(q)) base = 55.0;
      else if (collapsed[k].startsWith(qc)) base = 52.0;
      else if (ab.startsWith(q)) base = 44.0;
      else if (ab.includes(q)) base = 30.0;
      else if (guest && guest.includes(spaceQ)) base = 28.0;
      else if (guest && guest.includes(q)) base = 22.0;
      else if (q.length >= 3 && album && album.startsWith(q)) base = this.isFilm[k] ? 46.0 : 26.0;
      else if (q.length >= 3 && this.albumPadded[k] && this.albumPadded[k].includes(spaceQ)) base = this.isFilm[k] ? 34.0 : 18.0;
      else base = 0.0;
      // The whole title inside a longer query (a typed line that contains it).
      if (base === 0 && tb && nq - this.words[k] >= 2) {
        const at = padded.indexOf(this.titlePadded[k]);
        if (at >= 0) {
          const share = this.titleIDF[k] / totalIDF;
          if (share >= 0.25) { const tail = at / Math.max(1, q.length - tb.length); base = 36.0 * Math.min(1.0, share) + 8.0 * tail; }
        }
      }
      // Judging an answer: only a name was typed, so this song is not what was named.
      if (!artistBrowse && base < 52 && (hit.size === 0 || credited.has(k))) continue;
      scored.push([base + 52.0 * cov + 14.0 * tcov + this.prior[k], k, artistHit]);
    }
    scored.sort((a, b) => a[0] === b[0] ? a[1] - b[1] : (a[0] > b[0] ? -1 : 1));
    const reranked = [];
    for (const e of scored.slice(0, rerankN)) {
      const k = e[1];
      let s = similarity(q, title[k]);
      const s2 = similarity(qc, collapsed[k]); if (s2 > s) s = s2;
      const s3 = similarity(qSorted, sortedTitle[k]); if (s3 > s) s = s3;
      if (e[2] && this.titleTokOff[k + 1] > this.titleTokOff[k] && q.length > title[k].length + 2) {
        const s4 = similarity(q, title[k] + ' ' + artist[k]); if (s4 > s) s = s4;
        const g = this.guestStr[k];
        if (g.length > 2) { const s5 = similarity(q, title[k] + g.slice(0, -1)); if (s5 > s) s = s5; }
      }
      reranked.push([e[0] + 26.0 * s, k]);
    }
    reranked.sort((a, b) => a[0] === b[0] ? a[1] - b[1] : (a[0] > b[0] ? -1 : 1));
    let ranked = reranked.map(x => x[1]).concat(scored.slice(rerankN).map(x => x[1]));

    // Artist browse: that artist's catalogue best-known first, then songs they are featured on.
    let name = null, partial = false;
    if (artistBrowse) {
      if (named != null) { name = named; partial = q.length < 3 && /^[a-z]+$/.test(q); }
      else if (byGuest.has(q) && !ranked.slice(0, 4).some(i => this.titlePadded[i].includes(spaceQ))) name = q;
    }
    if (artistBrowse && name == null && q.length >= 4) {
      const hits = this.artistNames.filter(x => (' ' + x + ' ').includes(' ' + q + ' '));
      let one = hits.length === 1 ? hits[0] : null;
      if (hits.length > 1) {
        let short = hits[0];
        for (const h of hits) if (h.length < short.length || (h.length === short.length && h < short)) short = h;
        if (hits.every(h => (' ' + h + ' ').includes(' ' + short + ' '))) one = short;
      }
      if (one != null && !ranked.slice(0, 4).some(i => title[i] === q)) { name = one; partial = true; }
    }
    if (name != null) {
      let own = byArtist.get(name) || [], on = byGuest.get(name) || [];
      if (allow) { own = own.filter(i => allow.has(songs[i].id)); on = on.filter(i => allow.has(songs[i].id)); }
      const ownSet = new Set(own);
      on = on.filter(i => !ownSet.has(i));
      if (own.length || on.length) {
        const keepN = Math.max(1, limit - Math.min(2, on.length));
        const block = partial ? own.slice(0, 3) : own.slice(0, keepN).concat(on, own.slice(keepN));
        const bset = new Set(block);
        const topFame = own.length ? (songs[own[0]].fame ?? 3) : 3;
        const lead = ranked.filter(i => title[i] === q && (bset.has(i) || (songs[i].fame ?? 3) <= topFame));
        const lset = new Set(lead);
        const tail = ranked.filter(i => !bset.has(i) && !lset.has(i));
        ranked = lead.concat(block.filter(i => !lset.has(i)), tail);
      }
    }
    // A film's name typed in full: three places for its songs.
    if (artistBrowse && name == null) {
      const film = this.byFilm.get(q) ?? this.byFilm.get(said);
      if (film) {
        let block = allow ? film.filter(i => allow.has(songs[i].id)) : film;
        block = block.slice(0, 3);
        if (block.length) {
          const bset = new Set(block);
          const lead = ranked.filter(i => title[i] === q && !bset.has(i));
          const lset = new Set(lead);
          ranked = lead.concat(block, ranked.filter(i => !bset.has(i) && !lset.has(i)));
        }
      }
    }
    // One row per recording; no more than three rows of a title not typed in full.
    const seen = new Set(), perTitle = new Map(), out = [], spill = [];
    const leadTitle = ranked.length ? title[ranked[0]] : '';
    for (const i of ranked) {
      if (out.length >= limit) break;
      const rec = this.recording(i);
      if (seen.has(rec)) continue;
      seen.add(rec);
      const t = title[i];
      if (t !== q && t !== leadTitle && (perTitle.get(t) || 0) >= 3) { spill.push(songs[i]); continue; }
      perTitle.set(t, (perTitle.get(t) || 0) + 1);
      out.push(songs[i]);
    }
    for (const s of spill) { if (out.length >= limit) break; out.push(s); }
    return out;
  }
}
