// Mobile nav
const toggle = document.querySelector('.nav-toggle');
const links = document.getElementById('nav-links');
toggle.addEventListener('click', () => {
  const open = links.classList.toggle('open');
  toggle.setAttribute('aria-expanded', open);
});
links.addEventListener('click', (e) => {
  if (e.target.closest('a')) {
    links.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
});

document.getElementById('year').textContent = new Date().getFullYear();

// Fuel calculator
const $ = (id) => document.getElementById(id);
function calcFuel() {
  const len = parseFloat($('f-len').value) || 0;
  const lap = (parseFloat($('f-min').value) || 0) * 60 + (parseFloat($('f-sec').value) || 0);
  const per = parseFloat($('f-per').value) || 0;
  const safe = parseInt($('f-safe').value, 10) || 0;
  if (len <= 0 || lap <= 0 || per <= 0) {
    $('o-laps').textContent = '–';
    $('o-fuel').textContent = '–';
    return;
  }
  // Timed race: leader crosses the line after the clock hits zero, so round up.
  const laps = Math.ceil((len * 60) / lap);
  const fuel = Math.ceil((laps + safe) * per);
  $('o-laps').textContent = laps;
  $('o-fuel').textContent = fuel + ' L';
}
$('fuel-calc').addEventListener('input', calcFuel);
$('fuel-calc').addEventListener('submit', (e) => e.preventDefault());
calcFuel();

// Reveal on scroll + stat counters
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const targets = document.querySelectorAll('.section h2, .card, .steps li, .values > div, .social, .calc');
if ('IntersectionObserver' in window && !reduce) {
  targets.forEach((el) => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  targets.forEach((el) => io.observe(el));

  const counters = document.querySelectorAll('[data-count]');
  const co = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const end = +el.dataset.count;
      const start = performance.now();
      const step = (t) => {
        const p = Math.min((t - start) / 1200, 1);
        el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString('en-US');
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      co.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach((el) => co.observe(el));
}
