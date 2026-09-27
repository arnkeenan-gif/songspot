// The win confetti: WinSequence.swift's Piece, piece for piece. An upward
// fountain thrown from (cx, cy) — the cover's centre on the stage — with the
// app's gravity and drag, stepped in 60ths of a second so a dropped frame
// advances the burst by the time it took. The layer lives 3.4 s and fades
// from two thirds of the way through.
const LIFE = 3.4;
const rnd = (a, b) => a + Math.random() * (b - a);

export function burst(count, colors) {
  return Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + rnd(-1.25, 1.25), speed = rnd(14, 40), round = Math.random() < 0.35;
    const w = round ? rnd(6, 11) : rnd(6, 13);
    return { x: rnd(-18, 18), y: rnd(-18, 18), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - rnd(2, 6),
      rot: rnd(0, Math.PI * 2), vrot: rnd(-0.11, 0.11), w, h: round ? w * 0.75 : rnd(9, 17),
      col: colors[Math.floor(Math.random() * colors.length)] || '#fff', round, sway: rnd(0.6, 1.9), phase: rnd(0, Math.PI * 2) };
  });
}

function step(p, elapsed, dt) {
  p.x += (p.vx + Math.sin(elapsed * 1000 / 420 + p.phase) * p.sway * 0.35) * dt;
  p.y += p.vy * dt;
  p.vy += 0.33 * dt;
  const drag = Math.pow(0.915, dt);
  p.vx *= drag; p.vy *= drag;
  p.rot += p.vrot * dt;
}

const fade = e => { const from = LIFE * 0.66; return e < from ? 1 : Math.max(0, 1 - (e - from) / (LIFE - from)); };

export function confetti(cx, cy, colors, count = 150) {
  const c = document.createElement('canvas'); c.className = 'confetti';
  const dpr = Math.min(3, devicePixelRatio || 1);
  const size = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px'; };
  size();
  document.body.appendChild(c);
  const g = c.getContext('2d');
  const ps = burst(count, colors);
  const t0 = performance.now(); let last = 0, raf = 0;
  const tick = now => {
    const e = (now - t0) / 1000;
    const dt = Math.min(4, Math.max(0.2, (e - last) * 60)); last = e;
    for (const p of ps) step(p, e, dt);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.globalAlpha = fade(e);
    for (const p of ps) {
      g.save(); g.translate(cx + p.x, cy + p.y); g.rotate(p.rot); g.fillStyle = p.col;
      if (p.round) { g.beginPath(); g.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2); g.fill(); } else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    if (e < LIFE) raf = requestAnimationFrame(tick); else c.remove();
  };
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); c.remove(); };
}
