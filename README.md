# Who Would Love

**Paste a link and discover who would love your app, product, service or game.**

Who Would Love reads a product page (or a whole website), matches it against real cultural taste
data from [Qloo](https://www.qloo.com/), and emails back an audience report: who the audience is,
what else they love, where they live, and the communities where you can actually reach them, with
ad targeting ready to paste into Meta Ads and Reddit Ads.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/) (deadline 2026-10-30, 23:45 EDT).

> Status (2026-10-08): design mockups only. The real pipeline starts once the Qloo hackathon API
> key arrives.

## How it works

1. **Read the product.** An AI agent fetches the page with Firecrawl (renders JavaScript, maps the
   site for "whole website" mode, returns clean markdown) and Claude Haiku 5.5 works out what the
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
- **Model:** Claude Haiku 5.5 through the Anthropic API.
- **Page reading:** Firecrawl.
- **Email:** to be decided (Amazon SES or Resend).

## Secrets

No `.env` files in this repository. Keys live in AWS SSM Parameter Store under
`/servikaki/secrets/whowouldlove.env` (`ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`) and are read at
runtime.

## To do

- [ ] **Upload the Anthropic and Firecrawl keys to SSM.** Run
      `/Users/javi/PythonEnv/bin/python scripts/put_secrets.py`. It asks for each key with hidden
      input and writes nothing to disk. Leave the Firecrawl key empty to reuse the existing one.
- [ ] Wait for the Qloo hackathon API key (requested 2026-10-08), then add `QLOO_API_KEY` to the
      same SSM parameter.
- [ ] Confirm the exact Haiku 5.5 model ID with the Models API.
- [ ] Build real page reading (Firecrawl + Haiku 5.5) and test it on Momentline.
- [ ] Connect Qloo and replace the sample report with a real one.
- [ ] Community search, report rendering, email delivery, Cloudflare deployment.
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
