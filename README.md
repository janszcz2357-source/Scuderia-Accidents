# Speediots Racing

Static website for the Speediots Racing sim racing league (Assetto Corsa Competizione), served with GitHub Pages (see `CNAME`).

| File | What it is |
| --- | --- |
| `index.html`, `style.css`, `script.js` | The site |
| `assets/logo-mark.svg` | Logo mark / favicon |
| `data/simgrid.json` | Live SimGrid snapshot (written by the sync workflow — don't edit by hand) |
| `data/simgrid.sample.json` | Sample data for previewing the live section |
| `scripts/fetch-simgrid.mjs` | Pulls data from the SimGrid API |
| `.github/workflows/simgrid.yml` | Runs the fetcher every 30 minutes |

## Live SimGrid data

The "Live from The Sim Grid" section shows championship standings, the next race with a countdown, the latest race result and the upcoming calendar.

The SimGrid API needs a secret token, so the browser never calls it directly. A GitHub Action calls the API every 30 minutes, writes `data/simgrid.json`, and commits it only if the data changed. The page then reads that file.

### Setup

1. In The Sim Grid, request an API token from the community settings (**Developers** tab). SimGrid has to approve it.
2. In this repo go to **Settings → Secrets and variables → Actions** and add a secret named `SIMGRID_API_TOKEN`.
3. Optional **variables** on the same page:
   - `SIMGRID_CHAMPIONSHIP_IDS`: comma-separated championship IDs to show, e.g. `25108` (the S5 GT3 Championship). If unset, the token's active and upcoming events are found automatically.
   - `SIMGRID_COMMUNITY_ID`: narrows auto-discovery to one community.
4. Run **Actions → Sync SimGrid data → Run workflow** once to fill the section straight away.

Until data exists, the section shows a "Live timing is warming up" placeholder that links to The Sim Grid.

### Preview with sample data

Add `?demo=1` to the URL (e.g. `https://scuderia-accidents.mooo.com/?demo=1`). The sample data is clearly labelled "Sample data" on the page.

### Run the fetcher locally

```sh
SIMGRID_API_TOKEN=xxxx SIMGRID_CHAMPIONSHIP_IDS=25108 node scripts/fetch-simgrid.mjs
python3 -m http.server 8000   # then open http://localhost:8000
```

API reference: <https://gridos.thesimgrid.com/>

## Single-file preview

Opening `index.html` directly (e.g. from a phone's file manager) shows an unstyled page because the CSS, JS and logo are separate files. To get one file that works anywhere:

```sh
node scripts/build-standalone.mjs --sample   # writes speediots-standalone.html
```

Drop `--sample` to embed the real `data/simgrid.json` instead.
