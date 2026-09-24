// The site menu on a phone: one button, the links drop down.
document.addEventListener('DOMContentLoaded', () => {
  const b = document.querySelector('.menu .burger');
  const n = document.querySelector('.menu nav');
  if (!b || !n) return;
  b.addEventListener('click', () => { n.classList.toggle('open'); b.setAttribute('aria-expanded', n.classList.contains('open')); });
});
