# Who Would Love

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Live demo](https://img.shields.io/badge/demo-whowouldlove.javi.link-ff6a3d.svg)](https://whowouldlove.javi.link)

**Paste a link. Get who would love your product, and the ads to reach them.**

Who Would Love reads a product page (or a whole website) and finds its audiences in the taste graph
of [Qloo](https://www.qloo.com/): AI agents investigate each audience (what else they love, how they
lean, where they live), find the communities where they gather, and then write an ad kit for each
one: ad concepts with feed and story mockups, a Reddit post, a podcast host-read and city variants,
all grounded in Qloo taste data and checked by a critic agent.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/) (deadline 2026-10-30, 23:45 EDT).

> Status (2026-10-22): live at https://whowouldlove.javi.link, with sample reports at
> [/reports](https://whowouldlove.javi.link/reports) and planned pricing at [/pricing](https://whowouldlove.javi.link/pricing).

## How it works

1. **Read the product.** An AI agent fetches the page with Firecrawl (renders JavaScript, maps the
   site for "whole website" mode, returns clean markdown) and Claude Opus 5.5 works out what the
   product is, its tone and who it seems built for.
2. **Match.** The product's audiences and their starting points are looked up in Qloo; a model
   checks every catalogue match and rejects the wrong ones.
3. **Taste agents** (`src/taste-agent.ts`), one per audience, in parallel. With Qloo tools
   (affinities by type and popularity band, demographics, heatmap, entity and tag search, change
   the signal) and a budget of 24 calls, each agent decides what to ask, spots signals that mislead
   (a seed that drags results abroad, flat scores) and corrects them. Every Qloo answer lands in a
   ledger and the report is built from it, so a model never writes a Qloo number.
4. **Find the doors.** One agent per audience searches the open web for the communities where those
   people gather; every link is checked.
5. **Report.** Written by the model, rendered with Qloo's real values, at its own link (`/r/<id>`).
6. **Ad kit** (`src/ads.ts`), after the report is saved, on the same page. A creative director agent
   per audience writes three concepts with mockups, a Reddit post, a podcast read and city variants
   (it can ask Qloo what the audience loves in a place). It submits every draft to a critic tool:
   code checks that each cited entity is real Qloo data for that audience and each community and
   podcast comes from the report, then a model checks for clichés, unsupported claims and implied
   endorsements. The director revises until the critic approves.

The progress page shows the agents' latest steps live. No signup, no email and no payment step.

Every claim in the report carries one of three labels, and the report can be filtered by them:

| Label | Meaning |
| --- | --- |
| Qloo data | Measured affinities, demographics and places from Qloo. They describe groups, never individuals. |
| Web research | Communities and channels found on the open web, with links. |
| Our interpretation | Our advice based on the above. |

## Run it locally

Needs Node 22+, the AWS CLI with access to the SSM parameters below, and `npm install`.

```bash
npm run report -- https://apps.apple.com/app/momentline-day-counter/id6811362832
npm run report -- --from runs/<folder>   # reuse finished steps; delete a step's file to redo it
```

Each run writes to `runs/<folder>/` (ignored by git, because it holds Qloo responses):
`00-page.json`, `01-profile.json`, `02-taste.json`, `03-communities.json`, `04-spec.json`,
`05-ads.json` and `report.html`. A full run takes about 12 minutes and costs about $5 (Claude tokens
and web searches; Qloo is free during the hackathon). With `--from`, an existing run gets its ad
kit for about $1.3 without redoing the report.

## Mockups

- `mockups/home.html`: landing page with the three-step form.
- `mockups/report-sample.html`: sample report for [Momentline](https://apps.apple.com/app/momentline-day-counter/id6811362832), with the source filter. **All numbers are illustrative**, not real Qloo results.
- `mockups/logo-options.png`: logo variants (the third one is in use).
- `mockups/assets/`: Momentline icon and App Store screenshots used as the worked example.

Open the HTML files directly in a browser; they have no build step.

## Architecture

```
browser ── whowouldlove.javi.link (Cloudflare Pages: web/)
              │  /api/*  and  /r/<id>   (Pages Functions, service binding)
              ▼
          who-would-love-api (Worker: api/)  ── D1 "who-would-love" (reports, progress, HTML)
              │
              └─ Workflow "who-would-love-report": one durable, retried step per stage
                   Firecrawl ─ Claude Opus 5.5 ─ taste agents x Qloo ─ community agents x web
                   ─ report ─ (saved, readable) ─ creative + critic agents x Qloo ─ ad kit
```

- `src/`: the pipeline, shared by the Worker and the local runner.
- `api/`: Worker with the HTTP API (create report, status, HTML) and the Workflow.
- `web/`: static site (home, progress, sample reports, pricing, about) and two Pages Functions.
- Reports keep their inputs in D1 (`data`), so an ad kit or a re-render never needs a new run.
- The API has no public URL; only the website reaches it, through a service binding.
- Until 2026-11-01 (UTC) only judges can start new reports; saved reports and the sample stay public.
- Abuse and cost limits: 1 report per IP per day and 3 per day in total for the public. Judges use
  the link on the Devpost page, which carries a code with its own cap (30 reports a day) that never
  competes with the public one. A finished report for the same link is reused for 30 days.

Deploy with `scripts/deploy.sh [secrets|api|web|all]`. It reads the keys from AWS SSM and pipes
them to `wrangler secret bulk`; nothing is written to disk. The D1 schema is in `api/schema.sql`.

## Secrets

No `.env` files in this repository. Keys live in AWS SSM Parameter Store and are read at runtime
(`scripts/with-secrets.sh <command>` runs any command with them in its environment):

- `/servikaki/secrets/whowouldlove.env`: `ANTHROPIC_API_KEY`, `IP_SALT`, optional `TURNSTILE_SECRET`
- `/servikaki/secrets/firecrawl.env`: `FIRECRAWL_API_KEY` (1,000 credits a month, so "whole website"
  mode must cap the number of pages)
- `/servikaki/secrets/qloo.env`: `QLOO_API_URL`, `QLOO_API_KEY`

The `qloo` CLI reads `QLOO_API_KEY` from the environment, so `qloo setup --qloo` is not needed.

## To do

- [x] Upload the API keys to SSM and verify them (2026-10-11).
- [x] First Qloo harness test: `qloo setup --status` reports "Qloo data: ready", `find_tags` works.
- [x] Page reading (Firecrawl + Opus 5.5), tested on Momentline.
- [x] Audience segments, Qloo seeds checked by the model, affinities, demographics, places.
- [x] Community search with web search and link checks.
- [x] Report writing and HTML rendering.
- [x] Web app on Cloudflare: form, background Workflow, progress page, report page.
- [x] "Whole website" mode (Firecrawl map, home page plus up to 4 key pages).
- [x] Cloudflare Workers Paid (the free plan allows only 50 subrequests per run, a report needs about 200).
- [ ] Optional: Turnstile captcha (needs a widget created in the dashboard), email delivery.
- Judges can skip the daily limits with the code given in the Devpost testing instructions.
- [x] History checked for secrets before making the repo public (2026-10-21).

## Qloo API notes

From the [hackathon developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide)
and the [official kit](https://github.com/qloo/qloo-hackathon-kit), read 2026-10-08:

- Hackathon keys only work against `https://hackathon.api.qloo.com` (production returns 401).
  Send the key in the `X-Api-Key` header.
- Flow: `/search` (name to entity ID) or `/v2/tags` (tag ID), then `GET /v2/insights` with
  `filter.type` plus signals such as `signal.interests.entities`, `signal.interests.tags` or
  `signal.demographics.audiences`.
- Entity types: artist, book, brand, destination, movie, person, place, podcast, tv_show,
  videogame (written without an underscore; `video_game` is rejected).
- Do not use the legacy `/recs` or `/recommendations` endpoints. Invalid parameters are ignored
  silently (empty result, no error).
- Server-side caching is allowed; never commit Qloo responses to a public repository.
- Never send personal data (emails, names, device IDs) to Qloo. We do not collect any.
- The key is deactivated after judging ends (2026-11-16).
- Support: Qloo hackathon Discord, `#api-help`.
- Findings from our own tests (2026-10-11):
  - A single generic tag as the only signal returns noise (every result gets the same affinity).
    Concrete entity signals (books, brands, apps) return ranked, coherent results.
  - `/search` is fuzzy: "Bullet Journal" can resolve to "The Wall Street Journal". The agent must
    check every match before using it as a signal.
  - `filter.type=urn:demographics` returns age and gender skews relative to the average.

## Hackathon facts

- Submissions 2026-09-30 to 2026-10-30 23:45 EDT. Judging 2026-11-02 to 2026-11-16, winners around
  2026-11-23.
- Prizes: 15,000 / 6,000 / 4,000 USD.
- Criteria: technological implementation (non-trivial use of Qloo), design (a complete product),
  potential impact (a real problem for a real audience), quality of the idea (non-obvious use of
  Qloo). "If your submission would work the same without Qloo, you're building the wrong thing."
- Qloo has no public pricing (enterprise sales), so anything built on Qloo needs a commercial
  agreement after the hackathon.

## Submission checklist

From the hackathon rules and the kit's `docs/SUBMISSION.md`:

- A live demo hosted externally that judges can use end to end.
- A public repository with all source code and setup instructions.
- A text description of what the agent does and what makes it Qloo-powered.
- An open-source license visible in the repository's About section (MIT, already in place).
- Which Qloo workflows are used and why, a redacted request-to-result example, screenshots with no
  credentials or personal data, and known limitations.

No video is required.

## License

[MIT](LICENSE)
