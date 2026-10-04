#!/usr/bin/env node
// Pulls Speediots Racing data from the SimGrid API (GridOS) and writes a
// small, public-safe snapshot to data/simgrid.json for the website to read.
//
// The API token must never ship to the browser, so this runs in a GitHub
// Action (see .github/workflows/simgrid.yml) with the token as a secret.
//
// Env:
//   SIMGRID_API_TOKEN         required — community token from SimGrid
//   SIMGRID_CHAMPIONSHIP_IDS  optional — comma separated ids to show
//                             (otherwise the token's active + upcoming events)
//   SIMGRID_COMMUNITY_ID      optional — narrows auto-discovery to one host
//   SIMGRID_OUT               optional — output path (default data/simgrid.json)

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const API = process.env.SIMGRID_API_BASE || 'https://www.thesimgrid.com/api/v1';
const TOKEN = process.env.SIMGRID_API_TOKEN;
const OUT = process.env.SIMGRID_OUT || 'data/simgrid.json';
const IDS = (process.env.SIMGRID_CHAMPIONSHIP_IDS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const COMMUNITY = (process.env.SIMGRID_COMMUNITY_ID || '').trim();

if (!TOKEN) {
  console.error('SIMGRID_API_TOKEN is not set.');
  process.exit(1);
}

// 20 requests/minute per token: keep a little over 3s between calls.
const GAP_MS = Number(process.env.SIMGRID_GAP_MS ?? 3200);
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(`${k}[]`, x));
    else if (v !== undefined && v !== '') url.searchParams.set(k, v);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
    });
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after')) || 60;
      console.warn(`Rate limited on ${path}, waiting ${retry}s`);
      await sleep(retry * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
    return res.json();
  }
  throw new Error(`Gave up on ${path} after repeated rate limiting`);
}

const time = (d) => (d ? new Date(d).getTime() : NaN);

function trackOf(race) {
  const t = race?.track || {};
  return { name: t.composite_name || t.name || null, photo: t.photo || null };
}

async function discoverIds() {
  if (IDS.length) return IDS;
  const found = new Map();
  for (const status of ['active', 'upcoming']) {
    for (const series of [true, false]) {
      const res = await api('/championships', {
        status, series, limit: 20,
        communities: COMMUNITY ? [COMMUNITY] : undefined,
      });
      for (const c of res.data || []) found.set(String(c.id), c);
    }
  }
  if (!found.size) {
    // Between seasons: show the most recently finished event instead.
    const res = await api('/championships', {
      status: 'inactive', series: true, limit: 2,
      communities: COMMUNITY ? [COMMUNITY] : undefined,
    });
    for (const c of res.data || []) found.set(String(c.id), c);
  }
  return [...found.keys()].slice(0, 6);
}

function mapStandings(res) {
  return (res.data || [])
    .map((r) => ({
      pos: r.position_cache ?? null,
      name: r.display_name || r.participant?.name || '—',
      number: r.car_number ?? null,
      car: r.car || null,
      car_logo: r.car_logo || null,
      class: r.class || r.championship_car_class?.display_name || null,
      points: r.championship_score ?? r.championship_points ?? 0,
      country: r.participant?.country_code || null,
      avatar: r.participant?.avatar || null,
    }))
    .sort((a, b) =>
      String(a.class).localeCompare(String(b.class)) ||
      (a.pos ?? 1e9) - (b.pos ?? 1e9));
}

async function loadChampionship(id) {
  const c = await api(`/championships/${id}`);
  const standings = await api(`/championships/${id}/standings`, { per_page: 60 });
  const races = (c.races || []).map((r) => ({
    id: r.id,
    name: r.display_name || r.race_name,
    starts_at: r.starts_at,
    ended: !!r.ended,
    results_available: !!r.results_available,
    track: trackOf(r),
  })).sort((a, b) => time(a.starts_at) - time(b.starts_at));

  return {
    id: c.id,
    name: c.name,
    game: c.game_name || null,
    host: c.host_name || null,
    image: c.image || null,
    url: c.url || `https://www.thesimgrid.com/championships/${c.id}`,
    results_url: c.results_url || null,
    discord_url: c.discord_url || null,
    capacity: c.capacity ?? null,
    spots_taken: c.spots_taken ?? null,
    accepting_registrations: !!c.accepting_registrations,
    teams: !!c.teams_enabled,
    rounds_total: races.length,
    rounds_done: races.filter((r) => r.ended).length,
    races,
    standings: mapStandings(standings),
  };
}

const fmtMs = (ms) => {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

async function loadLatestResult(championships) {
  const done = championships
    .flatMap((c) => c.races.filter((r) => r.results_available).map((r) => ({ ...r, champ: c })))
    .sort((a, b) => time(b.starts_at) - time(a.starts_at));
  for (const race of done.slice(0, 2)) {
    const res = await api(`/races/${race.id}/session_results`, { session_type: 'race_1', per_page: 60 });
    const rows = (res.data || []).filter((r) => !r.dns);
    if (!rows.length) continue;

    const firstClass = rows.find((r) => r.position_cache === 1)?.class ?? rows[0].class;
    const cls = rows
      .filter((r) => r.class === firstClass)
      .sort((a, b) => (a.position_cache ?? 1e9) - (b.position_cache ?? 1e9));
    const winner = cls[0];
    const fastest = rows.reduce((best, r) => (r.best_lap > 0 && (!best || r.best_lap < best.best_lap) ? r : best), null);

    return {
      race_id: race.id,
      race: race.name,
      championship: race.champ.name,
      url: race.champ.results_url || race.champ.url,
      starts_at: race.starts_at,
      track: race.track,
      class: firstClass,
      classes: [...new Set(rows.map((r) => r.class).filter(Boolean))],
      results: cls.slice(0, 10).map((r) => {
        let gap = null;
        if (r !== winner) {
          if (r.dnf) gap = 'DNF';
          else if (r.lap_count < winner.lap_count) {
            const n = winner.lap_count - r.lap_count;
            gap = `+${n} lap${n > 1 ? 's' : ''}`;
          } else {
            const d = Math.max(0, r.total_time - winner.total_time);
            gap = '+' + (d < 60000 ? (d / 1000).toFixed(3) : fmtMs(d));
          }
        }
        return {
          pos: r.position_cache,
          name: r.sessionable_name,
          number: r.car_number ?? null,
          car: r.car_name || null,
          car_logo: r.car_logo || null,
          laps: r.lap_count,
          time: r === winner ? fmtMs(r.total_time) : gap,
          best_lap: fmtMs(r.best_lap),
          points: r.points_total ?? null,
          fastest_lap: !!r.fastest_lap,
        };
      }),
      fastest_lap: fastest ? { name: fastest.sessionable_name, time: fmtMs(fastest.best_lap), car: fastest.car_name } : null,
    };
  }
  return null;
}

async function main() {
  const ids = await discoverIds();
  console.log(`Championships: ${ids.join(', ') || '(none)'}`);

  const championships = [];
  for (const id of ids) {
    try {
      championships.push(await loadChampionship(id));
    } catch (err) {
      console.warn(`Skipping championship ${id}: ${err.message}`);
    }
  }

  const now = Date.now();
  const upcoming = championships
    .flatMap((c) => c.races
      .filter((r) => !r.ended && time(r.starts_at) > now - 3 * 3600e3)
      .map((r) => ({ ...r, championship: c.name, championship_id: c.id, url: c.url })))
    .sort((a, b) => time(a.starts_at) - time(b.starts_at))
    .slice(0, 8);

  let latest = null;
  try {
    latest = await loadLatestResult(championships);
  } catch (err) {
    console.warn(`Latest result unavailable: ${err.message}`);
  }

  const snapshot = {
    source: 'simgrid',
    generated_at: new Date().toISOString(),
    next_race: upcoming[0] || null,
    upcoming,
    latest_result: latest,
    // Races are already summarised above; keep the file small.
    championships: championships.map(({ races, ...c }) => c),
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`Wrote ${OUT}: ${championships.length} championships, ${upcoming.length} upcoming races.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
