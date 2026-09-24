// The island: a glass pill that rides the top of every page. It compacts once
// the page scrolls, its highlight slides with the scroll position so the glass
// reads as liquid, and on a phone the links fold into a sheet below it.
(() => {
  const island = document.querySelector('.island');
  if (!island) return;
  const sheet = document.querySelector('.sheet');
  const burger = island.querySelector('.burger');
  let ticking = false;
  const update = () => {
    const y = window.scrollY;
    island.classList.toggle('scrolled', y > 40);
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    island.style.setProperty('--hx', (12 + 76 * (y / max)).toFixed(1) + '%');
    ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
  update();
  if (burger && sheet) {
    burger.addEventListener('click', () => { const open = sheet.classList.toggle('open'); burger.setAttribute('aria-expanded', open); });
    sheet.querySelectorAll('a').forEach(a => a.addEventListener('click', () => sheet.classList.remove('open')));
  }
  // reveal on scroll
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.rv').forEach(el => io.observe(el));
  // the phones lean with the pointer
  const phones = document.querySelector('.phones');
  if (phones && matchMedia('(pointer:fine)').matches) {
    phones.addEventListener('pointermove', e => {
      const r = phones.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - .5, dy = (e.clientY - r.top) / r.height - .5;
      phones.style.setProperty('--tx', (dx * 10).toFixed(2) + 'deg'); phones.style.setProperty('--ty', (-dy * 6).toFixed(2) + 'deg');
      phones.querySelectorAll('.phone').forEach(p => p.style.transform = `translateX(-50%) rotateY(var(--tx)) rotateX(var(--ty)) ${getComputedStyle(p).getPropertyValue('--pose')}`);
    });
    phones.addEventListener('pointerleave', () => phones.querySelectorAll('.phone').forEach(p => p.style.transform = ''));
  }
})();
