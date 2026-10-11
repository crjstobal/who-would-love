# Who Would Love

**Paste a link and discover who would love your app, product, service or game.**

Who Would Love reads a product page (or a whole website), matches it against real cultural taste
data from [Qloo](https://www.qloo.com/), and emails back an audience report: who the audience is,
what else they love, where they live, and the communities where you can actually reach them, with
ad targeting ready to paste into Meta Ads and Reddit Ads.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/) (deadline 2026-10-30, 23:45 EDT).

> Status (2026-10-11): the full pipeline runs locally end to end and produces a real report.
> Next: the web app (form, background job, email) on Cloudflare.

## How it works

1. **Read the product.** An AI agent fetches the page with Firecrawl (renders JavaScript, maps the
   site for "whole website" mode, returns clean markdown) and Claude Opus 5.5 works out what the
   product is, its tone and who it seems built for.
2. **Ask the taste graph.** The agent turns that into Qloo entities and tags, then asks Qloo for
   affinities (what else these people love), demographics and where the taste is popular.
3. **Find the doors.** The agent searches the open web for the communities where those people
   gather (subreddits, newsletters, podcasts) and builds ready-to-paste ad targeting.
4. **Report.** An HTML/PDF report is emailed to the user. No signup and no payment step.

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
`00-page.json`, `01-profile.json`, `02-taste.json`, `03-communities.json`, `04-spec.json` and
`report.html`. A full run takes about 6 minutes and costs about $2 (Claude tokens and web
searches; Qloo is free during the hackathon).

## Mockups

- `mockups/home.html`: landing page with the three-step form.
- `mockups/report-sample.html`: sample report for [Momentline](https://apps.apple.com/app/momentline-day-counter/id6811362832), with the source filter. **All numbers are illustrative**, not real Qloo results.
- `mockups/logo-options.png`: logo variants (the third one is in use).
- `mockups/assets/`: Momentline icon and App Store screenshots used as the worked example.

Open the HTML files directly in a browser; they have no build step.

## Planned stack

- **Hosting:** Cloudflare Workers, with Workflows or Queues for the background job (a report takes
  a few minutes). Workers cannot spawn the `qloo mcp` process from the official kit, so Qloo is
  called through its REST API, wrapped as tools the agent can call.
- **Model:** Claude Opus 5.5 (`claude-opus-5-5`) through the Anthropic API. Note: forced
  `tool_choice` returns 400 on this model, and thinking cannot be disabled (use `effort`).
- **Page reading:** Firecrawl.
- **Email:** to be decided (Amazon SES or Resend).

## Secrets

No `.env` files in this repository. Keys live in AWS SSM Parameter Store and are read at runtime:

- `/servikaki/secrets/whowouldlove.env`: `ANTHROPIC_API_KEY`
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
- [ ] Web app: form, background job, email delivery, Cloudflare deployment.
- [ ] "Whole website" mode (Firecrawl map + a capped number of pages).
- [ ] Before making the repo public: check history for secrets with
      `git log -p | grep -iE 'api[_-]?key|secret|token'`.

## Qloo API notes

From the [hackathon developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide)
and the [official kit](https://github.com/qloo/qloo-hackathon-kit), read 2026-10-08:

- Hackathon keys only work against `https://hackathon.api.qloo.com` (production returns 401).
  Send the key in the `X-Api-Key` header.
- Flow: `/search` (name to entity ID) or `/v2/tags` (tag ID), then `GET /v2/insights` with
  `filter.type` plus signals such as `signal.interests.entities`, `signal.interests.tags` or
  `signal.demographics.audiences`.
- Entity types: artist, book, brand, destination, movie, person, place, podcast, tv_show,
  video_game.
- Do not use the legacy `/recs` or `/recommendations` endpoints. Invalid parameters are ignored
  silently (empty result, no error).
- Server-side caching is allowed; never commit Qloo responses to a public repository.
- Never send personal data (emails, names, device IDs) to Qloo. The user's email stays on our side.
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
