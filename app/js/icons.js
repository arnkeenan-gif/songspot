// The SF Symbols the app uses, drawn as small SVGs on a 24-box. currentColor
// throughout, so a glyph takes the colour of the text around it.
const f = (d, extra = '') => `<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" ${extra}>${d}</svg>`;
const s = (d, w = 2.2) => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const I = {
  menu: s('<path d="M4 7h16M4 12h16M4 17h16"/>', 2),
  crown: f('<path d="M2.5 7.5l5 4.2L12 4.5l4.5 7.2 5-4.2-2.2 11.5H4.7z"/>'),
  play: f('<path d="M7 4.2c0-.8.9-1.3 1.6-.9l11.8 7.2c.7.4.7 1.4 0 1.8L8.6 19.5c-.7.4-1.6-.1-1.6-.9z"/>'),
  pause: f('<rect x="5.5" y="4" width="4.6" height="16" rx="1.3"/><rect x="13.9" y="4" width="4.6" height="16" rx="1.3"/>'),
  search: s('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/>', 2),
  skip: f('<path d="M4 5.2c0-.8.9-1.2 1.5-.8l9.3 6.8c.5.4.5 1.2 0 1.6l-9.3 6.8c-.6.4-1.5 0-1.5-.8z"/><rect x="16.4" y="4.5" width="3.4" height="15" rx="1.2"/>'),
  flag: f('<path d="M5 3.5a1 1 0 0 1 1 1V5c3-1.6 5.3.7 8 0 1.6-.4 2.8-1 4-1.5v9.2c-1.2.5-2.4 1.1-4 1.5-2.7.7-5-1.6-8 0v6.3a1 1 0 0 1-2 0V4.5a1 1 0 0 1 1-1z"/>'),
  bulb: f('<path d="M12 3a6.5 6.5 0 0 0-3.9 11.7c.6.5.9 1.1.9 1.8V17h6v-.5c0-.7.3-1.3.9-1.8A6.5 6.5 0 0 0 12 3z"/><rect x="9" y="18.2" width="6" height="1.6" rx=".8"/><rect x="10" y="20.6" width="4" height="1.4" rx=".7"/>'),
  bulbOff: s('<path d="M9.5 17h5M10 20.5h4M8 14.5A6.5 6.5 0 0 1 17.8 6M18.4 9.2a6.5 6.5 0 0 1-2.4 5.3M3 3l18 18"/>', 1.8),
  x: s('<path d="M6 6l12 12M18 6L6 18"/>', 2.4),
  chevron: s('<path d="M9 5l7 7-7 7"/>', 2.6),
  chevronDown: s('<path d="M6 9l6 6 6-6"/>', 2.4),
  back: s('<path d="M15 5l-7 7 7 7"/>', 2.6),
  check: s('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.8),
  checkCircle: f('<circle cx="12" cy="12" r="10"/><path d="M7 12.4l3.3 3.3L17 9" fill="none" stroke="#0c110d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  xCircle: f('<circle cx="12" cy="12" r="10"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="#0c110d" stroke-width="2.4" stroke-linecap="round"/>'),
  calendar: f('<path d="M7 2.5a1 1 0 0 1 1 1V5h8V3.5a1 1 0 1 1 2 0V5h.5A2.5 2.5 0 0 1 21 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-11A2.5 2.5 0 0 1 5.5 5H6V3.5a1 1 0 0 1 1-1zM5 10v8.5c0 .3.2.5.5.5h13c.3 0 .5-.2.5-.5V10z"/><rect x="7" y="12" width="3" height="2.6" rx=".6"/><rect x="10.5" y="12" width="3" height="2.6" rx=".6"/><rect x="14" y="12" width="3" height="2.6" rx=".6"/>'),
  people: f('<circle cx="12" cy="7.2" r="3.2"/><circle cx="5.2" cy="9" r="2.4"/><circle cx="18.8" cy="9" r="2.4"/><path d="M6.5 19a5.5 5.5 0 0 1 11 0zM.8 17.6a4.4 4.4 0 0 1 6.6-3.8A7.4 7.4 0 0 0 5.3 17.6zM23.2 17.6h-4.5a7.4 7.4 0 0 0-2.1-3.8 4.4 4.4 0 0 1 6.6 3.8z"/>'),
  trophy: f('<path d="M6.5 3h11v2H21v2.5a4.5 4.5 0 0 1-4.1 4.5A5.6 5.6 0 0 1 13 15.4V18h3.2v2.5H7.8V18H11v-2.6A5.6 5.6 0 0 1 7.1 12 4.5 4.5 0 0 1 3 7.5V5h3.5zm0 4H5v.5a2.5 2.5 0 0 0 1.6 2.3A7 7 0 0 1 6.5 8.5zm11 0v1.5c0 .5 0 .9-.1 1.3A2.5 2.5 0 0 0 19 7.5V7z"/>'),
  lock: f('<path d="M7 10V7.5a5 5 0 0 1 10 0V10h.5a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2zm2.2 0h5.6V7.5a2.8 2.8 0 0 0-5.6 0z"/>'),
  reroll: s('<path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15M4.5 19.5V15H9"/>', 2.2),
  arrows: s('<path d="M7 8l-4 4 4 4M17 8l4 4-4 4M3 12h18"/>', 2.2),
  mic: f('<path d="M15.6 3.2a4.6 4.6 0 0 1 3.2 7.9l-3.2-3.2zm-1.3.1l6.4 6.4-.8.8-6.4-6.4zM12.4 5.7l5.9 5.9-6.6 6.6a2 2 0 0 1-2.2.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9a2 2 0 0 1 .4-2.2z"/>'),
  genres: f('<rect x="3" y="5" width="11" height="2" rx="1"/><rect x="3" y="10" width="11" height="2" rx="1"/><rect x="3" y="15" width="7" height="2" rx="1"/><path d="M17 4.5a1 1 0 0 1 1.3-1l2.5.8a1 1 0 0 1 .7 1v1.5a1 1 0 0 1-1.3 1L19 7.4V17a3 3 0 1 1-2-2.8z"/>'),
  filter: s('<path d="M4 7h16M7 12h10M10 17h4"/>', 2.2),
  sparkles: f('<path d="M10 2.5l1.7 5.1 5.1 1.7-5.1 1.7L10 16.1l-1.7-5.1-5.1-1.7 5.1-1.7zM18 13l.9 2.6 2.6.9-2.6.9L18 20l-.9-2.6-2.6-.9 2.6-.9z"/>'),
  photo: f('<path d="M5 4h14a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5v-11A2.5 2.5 0 0 1 5 4zm0 2a.5.5 0 0 0-.5.5v9.3l4-4.1 3.2 3.2 2.4-2.4 5.4 5.3V6.5A.5.5 0 0 0 19 6zm11.2 1.8a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z"/>'),
  wand: f('<path d="M15.8 3.2l1.3 1.3-11.8 11.8L4 15zM3 18l1.3-1.3 2.9 2.9L5.9 21zM17 8l1 1-9.3 9.3-1-1z" opacity=".95"/><path d="M19 2l.6 1.6 1.6.6-1.6.6L19 6.4l-.6-1.6-1.6-.6 1.6-.6zM20.5 10l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4z"/>'),
  palette: s('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.7 1.7-1.7H16.6A4.4 4.4 0 0 0 21 10.8C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor"/><circle cx="10" cy="7" r="1.1" fill="currentColor"/><circle cx="14.5" cy="7" r="1.1" fill="currentColor"/><circle cx="17.2" cy="10.5" r="1.1" fill="currentColor"/>', 1.8),
  haptics: s('<rect x="8" y="3.5" width="8" height="17" rx="2"/><path d="M4.5 8.5v7M19.5 8.5v7M2 10.5v3M22 10.5v3"/>', 1.8),
  sound: f('<path d="M3.5 9v6h4l5 4.2V4.8L7.5 9z"/><path d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4M18 6.4a8 8 0 0 1 0 11.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  mute: f('<path d="M3.5 9v6h4l5 4.2V4.8L7.5 9z"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  share: s('<path d="M12 14.5V3.5M8 7.2l4-3.8 4 3.8M7 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1"/>', 2.1),
  arrowUpRight: s('<path d="M7 17L17 7M8.5 7H17v8.5"/>', 2.2),
  adPlay: f('<path d="M4.5 4.5h15A2.5 2.5 0 0 1 22 7v10a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17V7a2.5 2.5 0 0 1 2.5-2.5zm5.3 4.2v6.6c0 .5.5.8.9.5l5.2-3.3a.6.6 0 0 0 0-1l-5.2-3.3a.6.6 0 0 0-.9.5z"/>'),
  flame: f('<path d="M12.6 2.3c.4 3.2 4.9 5.6 4.9 10.6a5.5 5.5 0 0 1-11 0c0-2.4 1.2-4 2.6-5.3.3 1.5 1 2.6 2 3.1-.3-3.4.5-6 1.5-8.4z"/>'),
  note: f('<path d="M19 3.2v11.3a3 3 0 1 1-2-2.8V7.3l-7 1.6v7.6a3 3 0 1 1-2-2.8V6.3a1 1 0 0 1 .8-1l9-2a1 1 0 0 1 1.2 1z"/>'),
  person: f('<circle cx="12" cy="7.5" r="4.2"/><path d="M3.8 20.5a8.2 8.2 0 0 1 16.4 0z"/>'),
  bolt: f('<path d="M13.5 2L4.5 13.5h6.2L9.5 22l9-11.5h-6.2z"/>'),
  timer: s('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5l3.2-3.8M9.5 2.5h5"/>', 2),
  bars: f('<rect x="3" y="12" width="4.5" height="9" rx="1"/><rect x="9.75" y="7" width="4.5" height="14" rx="1"/><rect x="16.5" y="2.5" width="4.5" height="18.5" rx="1"/>'),
  plus: s('<path d="M12 4v16M4 12h16"/>', 2.6),
  hash: s('<path d="M9.5 3L7.5 21M16.5 3l-2 18M4 8.5h17M3 15.5h17"/>', 2),
  wifi: s('<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0"/><circle cx="12" cy="19.5" r="1.2" fill="currentColor"/>', 2.2),
  google: `<svg class="i" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>`,
  apple: f('<path d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.8-1.7 0-3.3 1-4.1 2.5-1.8 3.1-.5 7.6 1.3 10.1.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.2-1.2 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4zM14 5.3c.7-.9 1.2-2 1-3.2-1 0-2.2.7-3 1.5-.6.7-1.2 1.9-1.1 3 1.2.1 2.3-.5 3.1-1.3z"/>'),
  caretUp: `<svg viewBox="0 0 10 5" aria-hidden="true"><path d="M5 0L10 5H0z" fill="currentColor"/></svg>`,
  caretDown: `<svg viewBox="0 0 10 5" aria-hidden="true"><path d="M0 0h10L5 5z" fill="currentColor"/></svg>`,
  pencil: f('<path d="M15.5 4.2l4.3 4.3L9 19.3l-5.2 1 1-5.2zM17 2.7a1.5 1.5 0 0 1 2.1 0l2.2 2.2a1.5 1.5 0 0 1 0 2.1l-.8.8-4.3-4.3z"/>'),
  camera: f('<path d="M9 4h6l1.5 2H19a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5v-9A2.5 2.5 0 0 1 5 6h2.5zm3 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"/>'),
  signOut: s('<path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5"/>', 2),
  trash: f('<path d="M9 3h6l1 1.5h4v2H4v-2h4zM5.5 8h13l-1 12a2 2 0 0 1-2 1.8h-7a2 2 0 0 1-2-1.8z"/>'),
  download: s('<path d="M12 3.5v11M7.5 10.5l4.5 4.5 4.5-4.5M4.5 19.5h15"/>', 2.2),
  phone: f('<path d="M8 1.5h8A2.5 2.5 0 0 1 18.5 4v16A2.5 2.5 0 0 1 16 22.5H8A2.5 2.5 0 0 1 5.5 20V4A2.5 2.5 0 0 1 8 1.5zm2 1.8v.9h4v-.9zM7.5 5.5v13h9v-13z"/>'),
};

// ---------------------------------------------------------------------------
// SF Symbols by their iOS names, for the kit (FlatIcon, PanelGlyph, links,
// pills) and the screens ported from SwiftUI. Same 24-box, currentColor.
//   sf('crown.fill')            → '<svg class="i">…</svg>' ('' for an unknown name)
//   SF['music.note']            → the same string
//   glyph('glyph-crown', '#fff', 18) → the /app/img/glyphs template PNG, tinted
// Every existing export above is unchanged.
const e = (d, extra = '') => `<svg class="i" viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true" ${extra}>${d}</svg>`;
const ln = (d, w = 2) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** gearshape.fill: eight rounded teeth round a hole, drawn once. */
const gear = (() => {
  const cx = 12, cy = 12, ro = 10.2, ri = 7.6, n = 8, pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, w = Math.PI / n;
    const at = (r, t) => `${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`;
    pts.push(at(ri, a - w * 0.62), at(ro, a - w * 0.36), at(ro, a + w * 0.36), at(ri, a + w * 0.62));
  }
  return `<path d="M${pts.join('L')}zM12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z"/>`;
})();
/** sun.max.fill: a disc and eight rays. */
const sun = (() => {
  let rays = '';
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, c = Math.cos(a), s2 = Math.sin(a); rays += `M${(12 + 7.6 * c).toFixed(2)} ${(12 + 7.6 * s2).toFixed(2)}L${(12 + 10 * c).toFixed(2)} ${(12 + 10 * s2).toFixed(2)}`; }
  return `<circle cx="12" cy="12" r="4.9"/>${ln(rays, 2)}`;
})();
/** snowflake: six thin arms with a pair of twigs each (SF's ultraLight look comes from the size). */
const snow = (() => {
  let d = '';
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3 - Math.PI / 2, P = (r, da = 0) => `${(12 + r * Math.cos(a + da)).toFixed(2)} ${(12 + r * Math.sin(a + da)).toFixed(2)}`;
    d += `M12 12L${P(10)}M${P(6.6)}L${P(9, 0.32)}M${P(6.6)}L${P(9, -0.32)}`;
  }
  return ln(d, 1.4);
})();

export const SF = {
  'eye': e('<path d="M12 5C6.6 5 2.9 9.4 1.6 12c1.3 2.6 5 7 10.4 7s9.1-4.4 10.4-7C21.1 9.4 17.4 5 12 5zm0 2.2c3.9 0 6.8 2.9 8 4.8-1.2 1.9-4.1 4.8-8 4.8S5.2 13.9 4 12c1.2-1.9 4.1-4.8 8-4.8zM12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z"/>'),
  'eye.slash': e('<path d="M12 5C6.6 5 2.9 9.4 1.6 12c1.3 2.6 5 7 10.4 7s9.1-4.4 10.4-7C21.1 9.4 17.4 5 12 5zm0 2.2c3.9 0 6.8 2.9 8 4.8-1.2 1.9-4.1 4.8-8 4.8S5.2 13.9 4 12c1.2-1.9 4.1-4.8 8-4.8zM12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z"/>' + ln('M3.8 3.8l16.4 16.4', 2.1)),
  'crown.fill': I.crown,
  'star.fill': e('<path d="M12 2.3l2.95 6.07 6.68.88-4.88 4.65 1.24 6.63L12 17.33 6.01 20.53l1.24-6.63L2.37 9.25l6.68-.88z"/>'),
  'opticaldisc': e('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 1.9a8.1 8.1 0 1 1 0 16.2 8.1 8.1 0 0 1 0-16.2zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm0 2.1a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z"/>'),
  'opticaldisc.fill': e('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 7.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z"/><path d="M12 5.2A6.8 6.8 0 0 0 5.2 12" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="1.3" stroke-linecap="round"/>'),
  'music.note': e('<path d="M10.2 3.6c0-.7.6-1.1 1.3-.9l5.9 1.9c.6.2 1 .7 1 1.3v2.5c0 .7-.6 1.1-1.3.9l-4.9-1.5v10.4a3.6 3.6 0 1 1-2-3.2z"/>'),
  'music.note.list': I.genres,
  'music.mic': I.mic,
  'flag.2.crossed.fill': `<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ln('M6.2 3.2L17.6 21.4M17.8 3.2L6.4 21.4', 1.9)}<path d="M6.2 3.2c-1.6 1.6-3.2 1-4.6 2.4l2.6 4.3c1.4-1.4 3-.8 4.6-2.4zM17.8 3.2c1.6 1.6 3.2 1 4.6 2.4l-2.6 4.3c-1.4-1.4-3-.8-4.6-2.4z"/></svg>`,
  'flag.checkered': e('<path d="M4.2 2.6c.6 0 1 .4 1 1v17.3a1 1 0 0 1-2 0V3.6c0-.6.4-1 1-1z"/><path d="M6 4.2c4.6-2.2 8 2 13.5-.4v9.8c-5.5 2.4-8.9-1.8-13.5.4zm0 3.3c1.5-.6 3-.6 4.4-.2V4.1C9 3.7 7.5 3.7 6 4.2zm4.4-.2v3.3c1.5.4 3 1 4.6.9V8.2c-1.6.1-3.1-.5-4.6-.9zm4.6.9c1.5-.1 3-.5 4.5-1.1V3.8c-1.5.6-3 1-4.5 1.1zM6 10.8c1.5-.6 3-.6 4.4-.2v3.3C9 13.5 7.5 13.5 6 14.1zm9-.3v3.3c1.5-.1 3-.5 4.5-1.1v-3.3c-1.5.6-3 1-4.5 1.1z"/>'),
  'gauge.with.dots.needle.67percent': e('<path d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm0 1.9a7.6 7.6 0 1 1 0 15.2 7.6 7.6 0 0 1 0-15.2z"/><circle cx="7.2" cy="15.6" r="1.05"/><circle cx="6.3" cy="11.3" r="1.05"/><circle cx="8.4" cy="7.6" r="1.05"/><circle cx="12" cy="6.2" r="1.05"/><circle cx="17.7" cy="11.3" r="1.05"/><circle cx="16.8" cy="15.6" r="1.05"/><path d="M15.9 7.2a.9.9 0 0 1 1.2 1.2l-3.4 4.6a2 2 0 1 1-2.8-2.4z"/>'),
  'stopwatch.fill': e('<path d="M9.5 1.6h5a1 1 0 0 1 0 2h-1.5v1.5a8.6 8.6 0 1 1-2 0V3.6H9.5a1 1 0 0 1 0-2zM12 8.4a1 1 0 0 0-1 1v4.5a1 1 0 0 0 2 0V9.4a1 1 0 0 0-1-1z"/><path d="M18.4 4.7l1.4 1.4-1.3 1.3-1.4-1.4z"/>'),
  'calendar': I.calendar,
  'shield.lefthalf.filled': e('<path d="M12 2.2l8.2 3.1v6.1c0 5-3.4 8.9-8.2 10.5C7.2 20.3 3.8 16.4 3.8 11.4V5.3zm0 2.1v15.5c3.7-1.4 6.3-4.6 6.3-8.4V6.6z"/>'),
  'gift.fill': e('<path d="M7.6 2.5c1.7 0 3.4 1.5 4.4 3.4 1-1.9 2.7-3.4 4.4-3.4a2.6 2.6 0 0 1 2 4.3h1.6c.8 0 1.4.6 1.4 1.4v2.4c0 .6-.5 1.1-1.1 1.1H3.7c-.6 0-1.1-.5-1.1-1.1V8.2c0-.8.6-1.4 1.4-1.4h1.6a2.6 2.6 0 0 1 2-4.3zm0 1.9a.8.8 0 0 0-.1 1.6c.9.4 2.1.6 3.3.7-.7-1.3-2-2.3-3.2-2.3zm8.8 0c-1.2 0-2.5 1-3.2 2.3 1.2-.1 2.4-.3 3.3-.7a.8.8 0 0 0-.1-1.6zM3.9 12.6h7.1v8.9H5.3c-.8 0-1.4-.6-1.4-1.4zm9.1 0h7.1v7.5c0 .8-.6 1.4-1.4 1.4H13z"/>'),
  'lock.fill': I.lock,
  'lock.open.fill': e('<path d="M16.5 2.5a4.9 4.9 0 0 1 4.9 4.9v2a1 1 0 0 1-2 0v-2a2.9 2.9 0 0 0-5.8 0V10H14a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2h7.6V7.4a4.9 4.9 0 0 1 4.9-4.9z"/>'),
  'bolt.fill': I.bolt,
  'snowflake': `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${snow}</svg>`,
  'moon.fill': e('<path d="M9.6 2.6a.8.8 0 0 1 .9 1A7.6 7.6 0 0 0 20.4 13.5a.8.8 0 0 1 1 .9A9.8 9.8 0 1 1 9.6 2.6z"/>'),
  'flame.fill': I.flame,
  'clock.fill': e('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3.6a1 1 0 0 0-1 1v5.6c0 .3.1.5.3.7l3.6 3.6a1 1 0 0 0 1.4-1.4L13 11.8V6.6a1 1 0 0 0-1-1z"/>'),
  'xmark': I.x,
  'chevron.right': `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ln('M8.5 4.5l7.5 7.5-7.5 7.5', 3.4)}</svg>`,
  'chevron.left': `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ln('M15.5 4.5L8 12l7.5 7.5', 3.4)}</svg>`,
  'checkmark': I.check,
  'gearshape.fill': e(gear),
  'person.fill': I.person,
  'person.2.fill': e('<circle cx="15.6" cy="7.6" r="3.6"/><path d="M8.6 20a7 7 0 0 1 14 0c0 .6-.4 1-1 1h-12c-.6 0-1-.4-1-1z"/><circle cx="7.6" cy="8.8" r="2.9"/><path d="M1.4 19.4a6.2 6.2 0 0 1 9-5.5 8.7 8.7 0 0 0-3.1 6.6H2.4c-.6 0-1-.4-1-1.1z"/>'),
  'plus.circle': `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.8"/>${ln('M12 7.6v8.8M7.6 12h8.8', 2)}</svg>`,
  'plus.circle.fill': e('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5a1 1 0 0 1 1 1v3h3a1 1 0 0 1 0 2h-3v3a1 1 0 0 1-2 0v-3H8a1 1 0 0 1 0-2h3V8a1 1 0 0 1 1-1z"/>'),
  'qrcode': e('<path d="M3 3h7.5v7.5H3zm2 2v3.5h3.5V5zM13.5 3H21v7.5h-7.5zm2 2v3.5H19V5zM3 13.5h7.5V21H3zm2 2V19h3.5v-3.5z"/><rect x="6" y="6" width="1.5" height="1.5"/><rect x="16.5" y="6" width="1.5" height="1.5"/><rect x="6" y="16.5" width="1.5" height="1.5"/><path d="M13.5 13.5h2.5V16h-2.5zM16 16h2.5v2.5H16zM18.5 13.5H21V16h-2.5zM13.5 18.5h2.5V21h-2.5zM18.5 18.5H21V21h-2.5z"/>'),
  'bell.fill': e('<path d="M12 2.2c.7 0 1.2.5 1.2 1.2v.6a6.3 6.3 0 0 1 5 6.2v4.3l1.8 2.3c.5.7 0 1.6-.8 1.6H4.8c-.8 0-1.3-.9-.8-1.6l1.8-2.3v-4.3a6.3 6.3 0 0 1 5-6.2v-.6c0-.7.5-1.2 1.2-1.2zM9.4 19.6h5.2a2.6 2.6 0 0 1-5.2 0z"/>'),
  'lightbulb.fill': I.bulb,
  'magnifyingglass': I.search,
  'paintbrush.pointed.fill': e('<path d="M20.6 2.6c.6.6.6 1.4.1 2l-8 9.1-2.4-2.4 9.1-8c.6-.5 1.5-.5 2 .1z"/><path d="M9.2 12.4l2.4 2.4c-.2 2.6-1.8 4.9-4.6 6.1-1.3.6-2.9.9-4.4 1-.3 0-.5-.3-.3-.6.9-1.2 1.2-2.4 1.4-3.7.3-2.8 2.4-5 5.5-5.2z"/>'),
  'sparkles': I.sparkles,
  'photo.fill': I.photo,
  'sun.max.fill': `<svg class="i" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${sun}</svg>`,
  'paintpalette.fill': e('<path d="M12 2.5c5.4 0 9.6 3.7 9.6 8.3 0 2.7-2.1 4.6-4.6 4.6h-1.8c-.9 0-1.5.7-1.5 1.5 0 .4.2.8.4 1.1.3.3.5.8.5 1.3 0 1-.8 1.8-1.9 1.8a9.3 9.3 0 0 1 0-18.6zM7.4 9.6a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm3-4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm4.4 0a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zm2.9 3.7a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z"/>'),
  'flashlight.on.fill': e('<path d="M8 8.2h8v1.4l-1.6 2.8V21c0 .8-.6 1.4-1.4 1.4h-2c-.8 0-1.4-.6-1.4-1.4v-8.6L8 9.6zM12 14a.9.9 0 0 0-.9.9v1.6a.9.9 0 0 0 1.8 0v-1.6A.9.9 0 0 0 12 14z"/>' + ln('M12 1.8v3.2M6.6 3.6l1.6 2.4M17.4 3.6l-1.6 2.4', 1.8)),
  'questionmark': `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ln('M8.2 8.4a3.9 3.9 0 0 1 7.6 1.1c0 2.6-3.8 3.1-3.8 5.8', 2.6)}<circle cx="12" cy="19.6" r="1.6" fill="currentColor"/></svg>`,
  'arrow.clockwise': `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ln('M19.5 12.5a7.5 7.5 0 1 1-2.6-6.2', 2.3)}<path d="M14.4 2.6l6.1.9-2.1 5.8z" fill="currentColor"/></svg>`,
  'person.badge.plus': e('<circle cx="9.5" cy="7.5" r="4"/><path d="M1.8 20.2a7.7 7.7 0 0 1 12.6-6 6 6 0 0 0 .2 7H2.8c-.6 0-1-.4-1-1z"/><path d="M18.5 13a1 1 0 0 1 1 1v2h2a1 1 0 0 1 0 2h-2v2a1 1 0 0 1-2 0v-2h-2a1 1 0 0 1 0-2h2v-2a1 1 0 0 1 1-1z"/>'),
  'envelope.fill': e('<path d="M2.6 6.6c0-.2.1-.4.2-.5l8.3 6.7c.5.4 1.3.4 1.8 0l8.3-6.7c.1.1.2.3.2.5v11c0 1-.8 1.9-1.9 1.9H4.5c-1.1 0-1.9-.9-1.9-1.9zM4.5 4.6h15c.3 0 .5 0 .7.1L12 11.4 3.8 4.7c.2-.1.4-.1.7-.1z"/>'),
  'hourglass': `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ln('M6.5 2.8h11M6.5 21.2h11M7.6 2.8c0 5 3.4 6.4 3.4 9.2s-3.4 4.2-3.4 9.2M16.4 2.8c0 5-3.4 6.4-3.4 9.2s3.4 4.2 3.4 9.2', 1.9)}<path d="M9.4 19.6c.6-1.8 1.7-2.4 2.6-3 .9.6 2 1.2 2.6 3z" fill="currentColor"/></svg>`,
  'trophy.fill': I.trophy,
  'play.fill': I.play,
  'pause.fill': I.pause,
  'square.and.arrow.up': I.share,
  'person.crop.circle.fill': e('<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3.6a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4zm0 14.4a8 8 0 0 1-6-2.7c1.3-1.8 3.5-2.9 6-2.9s4.7 1.1 6 2.9a8 8 0 0 1-6 2.7z"/>'),
};
SF['gauge'] = SF['gauge.with.dots.needle.67percent'];
SF['moon'] = SF['moon.fill'];
SF['stopwatch'] = SF['stopwatch.fill'];

/** An SF Symbol by its iOS name ('' when there is no drawing for it). */
export const sf = name => SF[name] || '';

/**
 * A Glyphs/glyph-* template image, tinted: the PNG is the mask, `colour` the
 * paint (Image(...).renderingMode(.template).foregroundStyle(colour)).
 * `name` with or without the "glyph-" prefix. `size` in px (= pt).
 */
export function glyph(name, colour = 'currentColor', size = 18, cls = '') {
  const n = String(name).startsWith('glyph-') ? name : 'glyph-' + name;
  const url = `url(/app/img/glyphs/${n}.png)`;
  return `<i class="glyph ${cls}" aria-hidden="true" style="display:inline-block;flex:none;width:${size}px;height:${size}px;background:${colour};-webkit-mask:${url} center/contain no-repeat;mask:${url} center/contain no-repeat"></i>`;
}
