(() => {
  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Nav ----------
  const toggle = document.querySelector('.nav-toggle');
  const links = $('nav-links');
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  links.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Highlight the section in view
  const navMap = new Map([...links.querySelectorAll('a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a]));
  if ('IntersectionObserver' in window) {
    const so = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const a = navMap.get(en.target.id);
        if (a && en.isIntersecting) {
          navMap.forEach((x) => x.classList.remove('active'));
          a.classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    navMap.forEach((_, id) => { const s = $(id); if (s) so.observe(s); });
  }

  $('year').textContent = new Date().getFullYear();

  // ---------- Fuel calculator ----------
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
    const laps = Math.ceil((len * 60) / lap);
    $('o-laps').textContent = laps;
    $('o-fuel').textContent = Math.ceil((laps + safe) * per) + ' L';
  }
  $('fuel-calc').addEventListener('input', calcFuel);
  $('fuel-calc').addEventListener('submit', (e) => e.preventDefault());
  calcFuel();

  // ---------- Helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : null);
  const flag = (cc) => (cc && /^[A-Za-z]{2}$/.test(cc)
    ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)))
    : '');
  const fmtDate = (d, opts) => new Intl.DateTimeFormat(undefined, opts).format(d);
  const longDate = (d) => fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const pts = (n) => (Number.isInteger(+n) ? String(+n) : (+n).toFixed(1));
  const setLink = (el, url) => { const u = safeUrl(url); if (u) el.href = u; };

  function ago(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
  }

  // ---------- Countdown ----------
  const timers = [];
  function countdown(el, iso) {
    const target = new Date(iso).getTime();
    if (!el || !Number.isFinite(target)) return;
    const parts = { d: el.querySelector('[data-cd="d"]'), h: el.querySelector('[data-cd="h"]'), m: el.querySelector('[data-cd="m"]'), s: el.querySelector('[data-cd="s"]') };
    const tick = () => {
      let t = Math.max(0, Math.floor((target - Date.now()) / 1000));
      const d = Math.floor(t / 86400); t %= 86400;
      const h = Math.floor(t / 3600); t %= 3600;
      const m = Math.floor(t / 60); const s = t % 60;
      parts.d.textContent = String(d).padStart(2, '0');
      parts.h.textContent = String(h).padStart(2, '0');
      parts.m.textContent = String(m).padStart(2, '0');
      parts.s.textContent = String(s).padStart(2, '0');
    };
    tick();
    el.hidden = false;
    timers.push(setInterval(tick, 1000));
  }

  // ---------- SimGrid live data ----------
  const hub = $('hub');
  const sync = $('sync');
  const params = new URLSearchParams(location.search);
  const demo = params.has('demo');
  const SOURCE = demo ? 'data/simgrid.sample.json' : 'data/simgrid.json';

  let data = null;
  let champIdx = 0;
  let classSel = null;
  let showAll = false;

  function skeletons() {
    const row = '<tr><td><span class="skel" style="width:26px"></span></td><td><span class="skel" style="width:34px"></span></td><td><span class="skel" style="width:140px"></span></td><td class="c-car"><span class="skel" style="width:120px"></span></td><td><span class="skel" style="width:30px;margin-left:auto"></span></td><td><span class="skel" style="width:40px;margin-left:auto"></span></td></tr>';
    $('standings-body').innerHTML = row.repeat(8);
    $('podium').innerHTML = '<li><span class="skel" style="width:26px"></span><span class="skel"></span><span class="skel" style="width:60px"></span></li>'.repeat(3);
    $('calendar').innerHTML = '<li><span class="skel" style="width:60px;height:28px;margin-bottom:12px"></span><span class="skel" style="width:80%;margin-bottom:8px"></span><span class="skel" style="width:50%"></span></li>'.repeat(4);
  }

  function setSync(state, text, time) {
    sync.dataset.state = state;
    $('sync-text').textContent = text;
    $('sync-time').textContent = time || '';
  }

  function renderTabs() {
    const tabs = $('champ-tabs');
    const list = data.championships || [];
    tabs.hidden = list.length < 2;
    tabs.innerHTML = list.map((c, i) =>
      `<button class="champ-tab" role="tab" aria-selected="${i === champIdx}" data-i="${i}">${esc(c.name.replace(/\s*┃\s*/g, ' · '))}</button>`).join('');
  }

  function renderStandings() {
    const c = (data.championships || [])[champIdx];
    if (!c) return;
    $('standings-title').textContent = c.name.replace(/\s*┃\s*/g, ' · ');
    setLink($('standings-link'), c.results_url || c.url);

    const rDone = c.rounds_done ?? 0, rTot = c.rounds_total || 0;
    $('m-rounds').textContent = rTot ? `${rDone} / ${rTot}` : '–';
    $('m-rounds-bar').style.width = rTot ? `${(rDone / rTot) * 100}%` : '0';
    const taken = c.spots_taken ?? 0, cap = c.capacity || 0;
    $('m-grid').textContent = cap ? `${taken} / ${cap}` : '–';
    $('m-grid-bar').style.width = cap ? `${Math.min(100, (taken / cap) * 100)}%` : '0';

    const rows = c.standings || [];
    const classes = [...new Set(rows.map((r) => r.class).filter(Boolean))];
    if (!classes.includes(classSel)) classSel = classes[0] ?? null;
    $('class-chips').innerHTML = classes.length > 1
      ? classes.map((k) => `<button class="chip" role="tab" aria-selected="${k === classSel}" data-class="${esc(k)}">${esc(k)}</button>`).join('')
      : '';

    const list = rows.filter((r) => !classSel || r.class === classSel);
    const leader = list[0]?.points ?? 0;
    const shown = showAll ? list : list.slice(0, 10);
    $('standings-body').innerHTML = shown.length ? shown.map((r, i) => {
      const p = r.pos ?? i + 1;
      const av = safeUrl(r.avatar);
      return `<tr data-p="${p}">
        <td class="c-pos"><span class="pos">${esc(p)}</span></td>
        <td class="c-num">${r.number != null ? `<span class="num">${esc(r.number)}</span>` : ''}</td>
        <td><span class="driver">${av ? `<img class="avatar" src="${esc(av)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}${r.country ? `<span class="flag" title="${esc(r.country)}">${flag(r.country)}</span>` : ''}${esc(r.name)}</span></td>
        <td class="c-car">${esc(r.car || '')}</td>
        <td class="c-pts">${esc(pts(r.points))}</td>
        <td class="c-gap">${i === 0 ? 'Leader' : '−' + esc(pts(leader - r.points))}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" style="color:var(--muted);padding:20px 10px">No standings yet — check back after round one.</td></tr>';

    const more = $('standings-more');
    more.hidden = list.length <= 10;
    more.textContent = showAll ? 'Show top 10' : `Show all ${list.length} drivers`;
  }

  function renderNext() {
    const n = data.next_race;
    if (!n) {
      $('next-title').textContent = 'Season break';
      $('next-champ').textContent = 'No races scheduled yet';
      $('next-date').textContent = '';
      $('next-countdown').hidden = true;
      return;
    }
    const d = new Date(n.starts_at);
    $('next-title').textContent = n.track?.name || n.name;
    $('next-champ').textContent = `${(n.championship || '').replace(/\s*┃\s*/g, ' · ')} — ${n.name || ''}`;
    $('next-date').textContent = longDate(d);
    const photo = safeUrl(n.track?.photo);
    if (photo) $('next-bg').style.backgroundImage = `url("${photo}")`;
    setLink($('next-link'), n.url);
    countdown($('next-countdown'), n.starts_at);

    // Hero card + ticker
    $('hero-race-status').textContent = 'Next race';
    $('hero-race-champ').textContent = (n.championship || '').replace(/\s*┃\s*/g, ' · ');
    $('hero-race-track').textContent = n.track?.name || n.name;
    $('hero-race-date').textContent = longDate(d);
    setLink($('hero-race-link'), n.url);
    $('hero-race-link').textContent = 'Race details';
    countdown($('hero-countdown'), n.starts_at);
    $('ticker-text').textContent = `${n.track?.name || n.name} · ${longDate(d)} · ${(n.championship || '').replace(/\s*┃\s*/g, ' · ')}`;
    setLink($('ticker-link'), n.url);
  }

  function renderResult() {
    const r = data.latest_result;
    if (!r || !r.results?.length) {
      $('result-title').textContent = 'No results yet';
      $('podium').innerHTML = '';
      return;
    }
    $('result-title').textContent = r.track?.name || r.race;
    $('result-sub').textContent = `${(r.championship || '').replace(/\s*┃\s*/g, ' · ')} · ${r.race} · ${fmtDate(new Date(r.starts_at), { day: 'numeric', month: 'short' })}${r.classes?.length > 1 ? ` · ${r.class}` : ''}`;
    setLink($('result-link'), r.url);
    $('podium').innerHTML = r.results.slice(0, 5).map((x) => `
      <li data-p="${esc(x.pos)}">
        <span class="pos">${esc(x.pos)}</span>
        <span class="who"><b>${esc(x.name)}</b><span>${x.number != null ? '#' + esc(x.number) + ' · ' : ''}${esc(x.car || '')}</span></span>
        <span class="t">${esc(x.time || '')}</span>
      </li>`).join('');
    if (r.fastest_lap) {
      $('fastest').hidden = false;
      $('fastest-time').textContent = r.fastest_lap.time;
      $('fastest-name').textContent = r.fastest_lap.name;
    }
  }

  function renderCalendar() {
    const list = data.upcoming || [];
    $('calendar').innerHTML = list.length ? list.map((r) => {
      const d = new Date(r.starts_at);
      const u = safeUrl(r.url);
      return `<li>
        <div class="cal-date"><b>${fmtDate(d, { day: '2-digit' })}</b><span>${fmtDate(d, { month: 'short' })}</span></div>
        <div class="cal-track">${u ? `<a href="${esc(u)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${esc(r.track?.name || r.name)}</a>` : esc(r.track?.name || r.name)}</div>
        <div class="cal-meta">${esc((r.championship || '').replace(/\s*┃\s*/g, ' · '))} · ${esc(r.name || '')}</div>
        <div class="cal-time">${fmtDate(d, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</div>
      </li>`;
    }).join('') : '<li><div class="cal-track">Calendar coming soon</div><div class="cal-meta">Next season dates will appear here.</div></li>';
  }

  // Sample data ships with fixed dates; shift them so the preview always looks current.
  function rebase(d) {
    // Whole days only, so race start times keep their real time of day.
    const shift = Math.round((Date.now() - new Date(d.generated_at).getTime()) / 864e5) * 864e5;
    const mv = (iso) => (iso ? new Date(new Date(iso).getTime() + shift).toISOString() : iso);
    const fix = (r) => r && { ...r, starts_at: mv(r.starts_at) };
    return { ...d, generated_at: new Date().toISOString(), next_race: fix(d.next_race), upcoming: (d.upcoming || []).map(fix), latest_result: fix(d.latest_result) };
  }

  function render() {
    renderTabs();
    renderStandings();
    renderNext();
    renderResult();
    renderCalendar();
  }

  $('champ-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    champIdx = +b.dataset.i; classSel = null; showAll = false;
    renderTabs(); renderStandings();
  });
  $('class-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-class]');
    if (!b) return;
    classSel = b.dataset.class; showAll = false;
    renderStandings();
  });
  $('standings-more').addEventListener('click', () => { showAll = !showAll; renderStandings(); });

  async function load() {
    skeletons();
    setSync('loading', 'Connecting…');
    try {
      const res = await fetch(SOURCE, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      let d = await res.json();
      if (!d || !Array.isArray(d.championships) || !d.championships.length) throw new Error('empty');
      if (d.source === 'sample') d = rebase(d);
      data = d;
      render();
      hub.dataset.state = 'live';
      if (d.source === 'sample') setSync('sample', 'Sample data', 'Preview — not real results');
      else {
        setSync('live', 'SimGrid synced', `Updated ${ago(d.generated_at)}`);
        setInterval(() => { $('sync-time').textContent = `Updated ${ago(d.generated_at)}`; }, 60000);
      }
    } catch {
      hub.dataset.state = 'empty';
      $('hub-empty').hidden = false;
      setSync('offline', 'Awaiting SimGrid sync');
    }
  }
  load();

  // ---------- Reveal + counters ----------
  if ('IntersectionObserver' in window && !reduceMotion) {
    const targets = document.querySelectorAll('.section-head, .pillars article, .series-card, .steps li, .social, .tool, .panel, .prose');
    targets.forEach((el) => el.classList.add('reveal'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.1 });
    targets.forEach((el) => io.observe(el));

    const co = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target, end = +el.dataset.count, t0 = performance.now();
        const step = (t) => {
          const p = Math.min((t - t0) / 1400, 1);
          el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString('en-US');
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        co.unobserve(el);
      });
    }, { threshold: 0.6 });
    document.querySelectorAll('[data-count]').forEach((el) => co.observe(el));
  }
})();
