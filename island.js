// The island compacts once the page scrolls; the theme button flips light/dark
// and remembers it; on a phone the links fold into a sheet under the island.
(() => {
  const root = document.documentElement;
  const saved = (() => { try { return localStorage.getItem('theme'); } catch (e) { return null; } })();
  if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  const island = document.querySelector('.island');
  if (!island) return;
  let ticking = false;
  const update = () => { island.classList.toggle('scrolled', scrollY > 40); ticking = false; };
  addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(update); ticking = true; } }, { passive: true });
  update();
  const theme = island.querySelector('.theme');
  if (theme) theme.addEventListener('click', () => {
    const light = matchMedia('(prefers-color-scheme: light)').matches;
    const cur = root.getAttribute('data-theme') || (light ? 'light' : 'dark');
    const next = cur === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  });
  const sheet = document.querySelector('.sheet'), burger = island.querySelector('.burger');
  if (burger && sheet) {
    burger.addEventListener('click', () => { const open = sheet.classList.toggle('open'); burger.setAttribute('aria-expanded', open); });
    sheet.querySelectorAll('a').forEach(a => a.addEventListener('click', () => sheet.classList.remove('open')));
  }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.rv').forEach(el => io.observe(el));
})();
