// The ranked ladder players see — Ranked/Ladder.swift on the web: tiers with
// divisions and rank points (RP). Bronze to Diamond each have three divisions
// (III → II → I) of 100 RP; Master and Legend sit on top with no divisions. A
// win is worth about 20–30 RP, a loss costs 15–20, and once you reach a tier
// you can't fall out of it. The hidden Elo (stats.rating) still picks
// opponents; RP is what you climb. A season is a calendar month: at the turn
// you keep a badge for where you finished and drop one tier.

/** The ranks in their own colours (Ladder.colours), each with the ink that reads on it. */
export const RANKS = [
  { index: 0, name: 'Bronze', color: '#ff8a3d', ink: '#220d00' },
  { index: 1, name: 'Silver', color: '#9fe7ff', ink: '#03161f' },
  { index: 2, name: 'Gold', color: '#ffd21f', ink: '#1f1600' },
  { index: 3, name: 'Platinum', color: '#19f0c8', ink: '#00201a' },
  { index: 4, name: 'Diamond', color: '#3d8bff', ink: '#00102b' },
  { index: 5, name: 'Master', color: '#b44dff', ink: '#14002a' },
  { index: 6, name: 'Legend', color: '#ff2e63', ink: '#24000b' },
];

const perDivision = 100, divisions = 3, perTier = perDivision * divisions;   // 300
const masterAt = perTier * 5, legendAt = masterAt + 600;                        // 1500, 2100
const ROMAN = ['I', 'II', 'III'];

export const Ladder = {
  tiers: RANKS, perDivision, divisions, perTier, masterAt, legendAt,

  /** Where a player stands at `rp`: { tier, division (3/2/1 or null), into, span, nextAt, name, fraction }. */
  place(rp) {
    rp = Math.max(0, Math.round(rp || 0));
    let p;
    if (rp >= legendAt) p = { tier: RANKS[6], division: null, into: rp - legendAt, span: 0, nextAt: null };
    else if (rp >= masterAt) p = { tier: RANKS[5], division: null, into: rp - masterAt, span: legendAt - masterAt, nextAt: legendAt };
    else {
      const t = Math.floor(rp / perTier), step = Math.floor((rp % perTier) / perDivision);   // 0, 1, 2 → III, II, I
      const start = t * perTier + step * perDivision;
      p = { tier: RANKS[t], division: divisions - step, into: rp - start, span: perDivision, nextAt: start + perDivision };
    }
    p.name = p.division == null ? p.tier.name : `${p.tier.name} ${ROMAN[p.division - 1]}`;
    p.fraction = p.span === 0 ? 1 : Math.min(1, p.into / p.span);
    return p;
  },

  /** The name of whatever comes at `nextAt`. */
  nextName(rp) { const n = Ladder.place(rp).nextAt; return n == null ? null : Ladder.place(n).name; },

  /** Demotion protection: you never fall below the start of the tier you're in. */
  tierFloor(rp) {
    if (rp >= legendAt) return legendAt;
    if (rp >= masterAt) return masterAt;
    return Math.floor(Math.max(0, rp) / perTier) * perTier;
  },

  /** What a finished match is worth, and why. `mine`/`theirs` are the hidden ratings. */
  change(outcome, mine, theirs, streak, perfect) {
    // Swift's Int division truncates toward zero.
    const edge = Math.max(-6, Math.min(6, Math.trunc((theirs - mine) / 40)));
    if (outcome > 0.6) {
      const parts = [['Win', 22 + edge]];
      if (streak >= 2) parts.push(['Win streak', Math.min(3, streak - 1) * 3]);
      if (perfect) parts.push(['Perfect', 5]);
      return { delta: parts.reduce((a, p) => a + p[1], 0), parts };
    }
    if (outcome > 0.4) return { delta: 3, parts: [['Draw', 3]] };
    const loss = -(18 - Math.trunc(edge / 2));
    return { delta: loss, parts: [['Loss', loss]] };
  },

  /** The difficulty of each of the five rounds, harder the higher you are. */
  roundTiers(tierIndex) {
    switch (tierIndex) {
      case 0: return ['easy', 'easy', 'medium', 'medium', 'hard'];
      case 1: return ['easy', 'medium', 'medium', 'hard', 'hard'];
      case 2: return ['medium', 'medium', 'hard', 'hard', 'expert'];
      case 3: return ['medium', 'hard', 'hard', 'expert', 'expert'];
      case 4: return ['hard', 'hard', 'expert', 'expert', 'impossible'];
      case 5: return ['hard', 'expert', 'expert', 'impossible', 'impossible'];
      default: return ['expert', 'expert', 'impossible', 'impossible', 'impossible'];
    }
  },

  /** Who you can be matched with: your own division and the one either side of it. */
  matchRange(rp) {
    rp = Math.max(0, rp);
    if (rp >= legendAt) return [legendAt - 200, rp + 300];
    if (rp >= masterAt) return [masterAt - perDivision, legendAt + perDivision - 1];
    const start = Math.floor(rp / perDivision) * perDivision;
    return [Math.max(0, start - perDivision), start + 2 * perDivision - 1];
  },

  /** A stand-in opponent's RP: near the player's, in step with the hidden ratings, inside the match range. */
  opponentRP(mine, myRating, theirRating) {
    const [lo, hi] = Ladder.matchRange(mine);
    return Math.min(hi, Math.max(lo, mine + (theirRating - myRating) * 3));
  },

  /** Players who had only the old rating: a fair starting point on the ladder. */
  migrated: r => Math.max(0, Math.min(1200, (r - 950) * 3)),

  // ---- seasons (a calendar month, local time)
  seasonKey(d = new Date()) { return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`; },
  /** "September 2026" for a key. */
  seasonName(key) {
    const p = String(key).split('-').map(Number);
    if (p.length !== 2 || !p.every(Number.isFinite)) return key;
    return new Date(p[0], p[1] - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  },
  seasonEnd(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 1); },
  seasonCountdown(d = new Date()) {
    const left = (Ladder.seasonEnd(d) - d) / 1000;
    if (left <= 0) return 'Season ending';
    const days = Math.floor(left / 86400);
    if (days >= 2) return `Season ends in ${days} days`;
    const hours = Math.max(1, Math.floor(left / 3600));
    return hours >= 24 ? 'Season ends tomorrow' : `Season ends in ${hours}h`;
  },
  /** Where the next season starts you: one tier down, at its floor. */
  seasonDrop(rp) {
    if (rp >= masterAt) return perTier * 4;          // Master/Legend → Diamond III
    return Math.max(0, Math.floor(rp / perTier) - 1) * perTier;
  },
};
