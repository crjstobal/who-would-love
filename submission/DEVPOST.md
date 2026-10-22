# Devpost submission: Who Would Love

Copy each block into the matching Devpost field. Everything below the "About the project" heading
is Markdown and goes into the main description box.

---

## Project name

Who Would Love

## Elevator pitch (tagline, 200 characters max)

Paste a link to anything you made. AI agents find who would love it in Qloo's taste graph, then
write ads made for what each audience loves, checked by a critic agent.

## Thumbnail

`devpost-thumbnail.png` (1500 x 1000, 3:2)

## Image gallery (in this order)

1. `gallery/01-home.png`: paste a link, get your audiences and their ads
2. `gallery/02-progress-agents.png`: the taste agents at work, live, one per audience
3. `gallery/03-summary.png`: the report, with its section menu and the ad kit one click away
4. `gallery/04-taste-agent.png`: how the agent investigated one audience in Qloo, step by step
5. `gallery/05-ad-kit.png`: an ad concept with feed and story mockups, grounded in Qloo taste
6. `gallery/06-critic.png`: the critic agent sending drafts back until they hold up
7. `gallery/07-samples.png`: sample reports for a game, an app and a kettle
8. `gallery/08-pricing.png`: pricing, with the costs we measured per report

## Video demo link

YouTube URL of `video/who-would-love-demo.mp4` (56 seconds; upload as Public, add
`video/who-would-love-demo.srt` as English captions and `video-thumbnail.png` as the custom
thumbnail). Script and how it was made: `VIDEO-SCRIPT.md`.

## Try it out links

- https://whowouldlove.javi.link
- https://whowouldlove.javi.link/reports
- https://github.com/crjstobal/who-would-love

## Built with

qloo, claude, anthropic, claude-opus-5.5, ai-agents, tool-use, firecrawl, cloudflare-workers,
cloudflare-workflows, cloudflare-pages, cloudflare-d1, typescript, zod, openstreetmap

---

## About the project

### Inspiration

Most indie makers advertise where everyone in their category already does. A day-counter app ends
up targeting "productivity users", a roguelike targets "gamers", and both pay to shout into the
same crowded room as their competitors, with the same generic ads.

The interesting audience is usually one step sideways, and so is the ad that reaches it. The people
who would love a calm, poetic countdown app are not productivity nerds: they are long-distance
couples who listen to Bon Iver and watch Love, Rosie. You do not reach them with "Track your
dates!"; you reach them with "412 days since our first date. 9 days until I see you."

You cannot find that with keyword research, and an LLM on its own will happily invent it. You need
real data about what groups of people love. That is exactly what Qloo's taste graph is, and big
advertisers already use it this way: JCDecaux has planned hyper-local out-of-home campaigns with
Qloo's taste data since 2020. We wanted to give the same thing to one maker with one product.

### What it does

Paste a link to a product page (an App Store listing, a Steam page, a shop page, a landing page)
or a whole website. You get an audience report at its own shareable link, and then an ad kit for
every audience in it.

**The report** (about 8 minutes):

- **Three or four distinct audiences**, each backed by a quote from your page.
- For each one, a **taste agent investigated it in Qloo**: what else they love across music, books,
  film, TV, podcasts, games, brands, people and destinations (with Qloo affinity scores), how they
  lean by age and gender, and where in your market that taste is strongest. Every step the agent
  took, and why, is listed under the audience.
- **Where to reach them**: real subreddits, newsletters, podcasts and forums, with sizes when
  found, how to show up without spamming, and every link checked.
- Ready-to-paste Meta and Reddit targeting, a first plan, and what your page does not say.

**The ad kit** (about 3 more minutes, on the same page):

- **Three ad concepts per audience**, each with feed (1:1) and story (9:16) mockups built from your
  product image, copy ready to paste, and the Qloo entities it rests on, with their real scores.
- **A Reddit post** for one of that audience's communities and **a 30-second podcast host-read**
  for a show they love.
- **City variants** where Qloo shows that taste really differs in a place.
- **What to stay away from** with this audience.
- Every kit is **checked by a critic agent** before you see it, and the report shows each round.

Every block is labelled **Qloo data**, **Web research** or **Our interpretation**, and the report can
be filtered by label, so you always know what is measured, what was found and what is advice.

### How Qloo makes the difference

Without Qloo, this is an LLM guessing at personas and writing generic ads. With Qloo, each audience
and each ad is grounded in measured cultural affinity:

- For **Momentline** (a real day-counter app), the "sentimental date keepers" audience loves Bon
  Iver (0.97), Love, Rosie (0.91) and Esther Perel's *Where Should We Begin?* (0.90). So the ad does
  not list features: it shows one bittersweet pair of dates, in a hushed indie-folk mood. The same
  taste led the community agent to **r/Sufjan**, which no keyword search for "countdown app" returns.
- For **Hades II** (Steam), the run-and-build audience loves Noita (0.89), Enter the Gungeon (0.89)
  and Twitch (0.97). The ad pitches the game as a build sandbox ("Three gods, one run. How far can
  you break it?") styled like a creator clip, not a cinematic trailer.
- For the **Fellow Stagg kettle**, the pour-over audience loves Verve and Stumptown; the creative
  agent asked Qloo about Marin County and Portland before writing city variants, and the critic
  rejected a draft that named those roasters next to the kettle, because it read as an endorsement.

### The agents, and what makes them agents

Each report runs on a durable Cloudflare Workflow, but the Qloo work is done by agents that decide
for themselves what to ask, with Claude Opus 5.5 tool use:

1. **Taste agents, one per audience, in parallel.** Tools: read affinities (any of 9 entity types,
   mainstream, niche popularity band or inside the main market), demographics, heatmap, search the
   catalogue, search tags, and change the signal. Budget: 24 Qloo calls each. They look for signals
   that mislead (a seed loved mostly abroad, flat scores, results about another audience), change
   the signal and read again. Every Qloo answer lands in a ledger, and the report is built from the
   ledger, so **a model never writes a Qloo number**. If an agent fails, a fixed reading runs instead.
2. **Community agents**, one per audience, with web search and web fetch, guided by that audience's
   Qloo affinities. Every link is checked.
3. **Creative director agents**, one per audience, after the report is saved. Tools: ask Qloo what
   this audience loves in a specific place, and submit the kit to the critic.
4. **The critic** is a tool the director cannot talk past. Code checks first: every cited entity id
   must be real Qloo data for this audience, every community and podcast must come from the report,
   hooks and headlines must fit. Then a second model checks for clichés, stereotypes, claims the
   product page does not support, and implied endorsements. The director revises until approved.

### Example: request to result (redacted)

The taste agent for Momentline's "design-minded minimalists" started from Dieter Rams, Muji and
*The Design of Everyday Things*:

```
GET https://hackathon.api.qloo.com/v2/insights
    ?filter.type=urn:entity:artist
    &signal.interests.entities=<Dieter Rams>,<Muji>,<The Design of Everyday Things>
    &filter.popularity.min=0.3&filter.popularity.max=0.9
    &take=15
X-Api-Key: <redacted>
```

Result: delofamilia (0.91), TETSU69 (0.90), つばき (0.90). The agent's note: "Muji drags music to
Japan." It searched the catalogue for Kinfolk, swapped Muji for Kinfolk, added the Minimalist
Design tag (`signal.interests.tags`) and read again: Chris Staples (0.94), Landlady (0.93), Kacey
Johansing (0.93). The report shows Muji as "dropped by the agent", with the reason.

### Qloo endpoints we use, and why

A report makes roughly 130 to 150 Qloo calls, all server side through `hackathon.api.qloo.com`.

| What | Qloo endpoint | Used for |
| --- | --- | --- |
| Entity resolution | `GET /search` | Turn each proposed starting point into a Qloo entity; a model checks every candidate and rejects false matches. The taste agents also search to add entities. |
| Tags | `GET /v2/tags` | Resolve the product's themes into Qloo tags, which agents can add to the signal. |
| Affinities | `GET /v2/insights`, `filter.type=urn:entity:*` | What each audience loves; niche band with `filter.popularity.min/max`; main market and city variants with `signal.location.query`. |
| Demographics | `GET /v2/insights`, `filter.type=urn:demographics` | How each audience leans by age and gender. |
| Heatmap | `GET /v2/insights`, `filter.type=urn:heatmap` | Where each taste is strongest; coordinates become place names with OpenStreetMap. |

### How we built it

TypeScript end to end. Cloudflare Pages for the site, a Worker for the API (reachable only through
a service binding, so keys never reach the browser), Workflows for the long job with per-step
retries, D1 for reports. Claude Opus 5.5 for every model step, with tool use for the agents and
structured outputs (Zod) elsewhere. Firecrawl reads the page. The progress page shows the agents'
latest steps live. The same pipeline runs locally from the command line.

### Business model

The demo is free while the hackathon is judged. After it: **$39 once** for a launch report with its
ad kit, **$99 a month** (Studio: 5 reports, monthly refresh of taste and ads, and an ad check for
your own ads) and **$299 a month** (Agency: 25 reports, your brand, your team). We measured what a
report costs us in production: $4.70 to $5.20 in model and search usage, which leaves 57% to 87%
gross margin. The prices assume a usage agreement with Qloo, whose commercial pricing is not public;
we say so on the pricing page rather than show numbers that only work on a free key.

### Challenges we ran into

- **Fuzzy entity search.** "Day One" (the journaling app) is not in Qloo, and searching returns
  Formula One and Hay Day. A model must pick the exact thing or reject it, and the report shows what
  was rejected.
- **Signals that mislead.** One seed can drag a whole audience to another country (Muji to Japan)
  or flatten every score. A fixed pipeline cannot notice; this is why the Qloo work became an agent.
- **Ads that sound right and are not.** First drafts named real brands next to the product, invented
  a star rating, and promised features the page never mentions. The critic, with code checks it
  cannot argue with, is what made the ads safe to show.
- **Long jobs on the edge.** Around 200 outbound requests and four agents in parallel, so the work
  runs as a Workflow with retries, one shared Qloo client that keeps requests in order, and a live
  progress page.

### Accomplishments that we're proud of

- It works on very different products: a Steam game, an iPhone app, a kitchen kettle.
- The critic catches real problems, and you can watch it do so.
- Honest by design: provenance labels, rejected and dropped seeds shown, every agent step listed,
  numbers that cannot be hallucinated.

### What we learned

Taste data is most valuable sideways, and it is just as useful for what an ad says as for who sees
it. The obvious audience is easy; Qloo finds the neighbouring one and tells you how to talk to it.

### What's next

- Ad check: paste your own ad and test it against each audience's taste.
- Monthly refresh, so taste and ads stay current.
- Image and video generation for the concepts, from the scene the agent describes.

### Known limitations (what the result does not establish)

- Qloo results describe what groups of people tend to like. They do not describe or predict any
  single person, and an affinity is not a guarantee that someone will buy.
- The report depends on how we read the page and which starting points Qloo had. Section 02 of every
  report shows both, so a wrong reading is visible.
- Ads are concepts and mockups, not tested creatives. They are a strong first draft, not a result.
- Community sizes and rules change; links are checked when the report is made.
- Demographic leans are relative to Qloo's average, not absolute shares of an audience.

### Privacy

No accounts, no email, no personal data. Only the public content of the submitted page and
product-related entities are sent to providers. Nothing personal is ever sent to Qloo. The Qloo key
lives only on the server.

---

## Testing instructions (for judges)

1. Open **https://whowouldlove.javi.link/?code=JUDGE_CODE_HERE**. The code lifts every limit on this
   device. (Without it, new reports open to the public on 2026-11-01 with a small daily limit.)
2. Paste a link to a product page (an App Store listing, a Steam page, a shop or landing page) and
   press "Find who would love it". Choose "the whole website" for a home page.
3. Watch the progress page: you will see the taste agents' steps live. The report opens after about
   8 minutes; the ad kit fills in on the same page about 3 minutes later. You can close the tab and
   come back to the same link.
4. In the report, use the section menu (the ad kit is highlighted), open "How the agent investigated
   this audience" under any audience, and "How the creative agents worked" inside any ad kit.

Finished reports to look at right away (all at https://whowouldlove.javi.link/reports):

- Hades II (Steam game): https://whowouldlove.javi.link/r/9f615f1d8786
- Momentline (iPhone app): https://whowouldlove.javi.link/r/momentline
- Fellow Stagg EKG kettle (shop page): https://whowouldlove.javi.link/r/c8bd04f638f4
- Allbirds Men's Tree Runner (shop page, the one in the video): https://whowouldlove.javi.link/r/a2da04e907fe

## "Was this project significantly updated during the submission period?"

New project, built from scratch during the submission period (started 2026-10-08).
