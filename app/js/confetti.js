// The win confetti: 150 pieces burst from the artwork, the apps' own physics.
export function confetti(cx, cy, colors, count = 150, life = 3400) {
  const c = document.createElement('canvas'); c.className = 'confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr; c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px';
  document.body.appendChild(c);
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const ps = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2, v = 260 + Math.random() * 520;
    return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 320, r: Math.random() * Math.PI, vr: (Math.random() - .5) * 12,
      w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, col: colors[Math.floor(Math.random() * colors.length)], round: Math.random() < .35 };
  });
  const t0 = performance.now(); let last = t0;
  const tick = now => {
    const dt = Math.min(.033, (now - last) / 1000); last = now;
    const age = (now - t0) / life;
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.globalAlpha = age < .66 ? 1 : Math.max(0, 1 - (age - .66) / .34);
    for (const p of ps) {
      p.vy += 1500 * dt; p.vx *= .985; p.vy *= .992; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.col;
      if (p.round) { g.beginPath(); g.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2); g.fill(); } else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    if (age < 1) requestAnimationFrame(tick); else c.remove();
  };
  requestAnimationFrame(tick);
  return () => c.remove();
}
