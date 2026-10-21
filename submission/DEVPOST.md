# Devpost submission: Who Would Love

Copy each block into the matching Devpost field. Everything below the "About the project" heading
is Markdown and goes into the main description box.

---

## Project name

Who Would Love

## Elevator pitch (tagline, 200 characters max)

Paste a link to anything you made. An AI agent asks Qloo's taste graph who would love it, what else
they love, and where they gather, then hands you ready-to-use audiences.

## Thumbnail

`devpost-thumbnail.png` (1500 x 1000, 3:2)

## Image gallery (in this order)

1. `gallery/01-home.png`: the home page
2. `gallery/02-progress.png`: the agent at work, live progress
3. `gallery/03-short-version.png`: the short version and what we understood
4. `gallery/04-audience.png`: one audience, with its Qloo taste profile
5. `gallery/05-communities.png`: where to reach them and ready-to-paste targeting
6. `gallery/06-filter.png`: filtering the report to Qloo data only

## Video demo link

YouTube URL of `video/who-would-love-demo.mp4` (upload as Public; add `video/who-would-love-demo.srt`
as English captions and `video-thumbnail.png` as the custom thumbnail).

## Try it out links

- https://whowouldlove.javi.link
- https://github.com/crjstobal/who-would-love

## Built with

qloo, claude, anthropic, claude-opus-5.5, firecrawl, cloudflare-workers, cloudflare-workflows,
cloudflare-pages, cloudflare-d1, typescript, zod, openstreetmap

---

## About the project

### Inspiration

Most indie makers advertise where everyone in their category already does. A day-counter app ends
up targeting "productivity users", a roguelike targets "gamers", and both pay to shout into the
same crowded room as their competitors.

The interesting audience is usually one step sideways. The people who would love a calm, poetic
countdown app are not productivity nerds: they are long-distance couples, sentimental date keepers
and people who listen to Sufjan Stevens. You cannot find that with keyword research, and an LLM on
its own will happily invent it. You need real data about what groups of people love. That is
exactly what Qloo's taste graph is.

### What it does

You paste a link to a product page (an App Store listing, a Steam page, a landing page) or a whole
website. About eight minutes later you get an audience report at its own shareable link:

- **The short version**: who would love it and the one thing to do first.
- **What we understood**: how the agent read your page, and every starting point it matched in
  Qloo. Anything Qloo does not have is listed as "not in Qloo" instead of being guessed.
- **Three or four distinct audiences**, each one backed by a quote from your page, and each with its
  own Qloo taste profile:
  - what else they love across music, books, film, TV, podcasts, games, brands, people and
    destinations, with Qloo affinity scores;
  - how they lean by age and gender;
  - where in your main market that taste is strongest.
- **Where to reach them**: real subreddits, newsletters, podcasts, forums and Discord servers,
  with sizes when found, how to show up without spamming, and every link checked.
- **Ready-to-paste targeting**: Meta Ads interests, an age and gender setting, Reddit Ads
  communities and a first creative angle for each audience.
- **What your page does not say**: questions these audiences will have that your page leaves open.

Every block is labelled **Qloo data**, **Web research** or **Our interpretation**, and the report can
be filtered by label, so you always know what is measured, what was found and what is advice.

No signup, no email, no payment.

### How Qloo makes the difference

Without Qloo, this product is an LLM guessing at personas. With Qloo, each audience is grounded in
measured cultural affinity, and the best findings come from following taste, not keywords:

- For **Momentline** (a real day-counter app), Qloo's taste profile of the "sentimental date
  keepers" audience is led by Gregory Alan Isakov, Atlas of the Heart and The Time Traveler's Wife.
  The agent then went looking for those fans and found **r/Sufjan**, a community no keyword search
  for "countdown app" would ever return.
- For **Hades** (Steam), the "roguelike run grinders" audience loves Slay the Spire, Enter the
  Gungeon and Nuclear Throne (Qloo videogame affinities), which turns into a concrete Meta Ads
  interest list and r/roguelites.
- Qloo's heatmap shows where each taste concentrates. For Momentline's combined audience it points
  to dark-sky country (Death Valley, the Scottish Highlands, Jasper), which is why the report
  suggests leading with the app's stargazing feature.

### Qloo workflows we use, and why

A single report makes roughly 140 Qloo API calls, all server side through the hackathon REST API
(`hackathon.api.qloo.com`). They map onto the kit's workflows like this:

| Kit workflow | Qloo endpoint | What we use it for |
| --- | --- | --- |
| describe (entity resolution) | `GET /search` | Turn each proposed starting point (a book, a show, a brand) into a Qloo entity. The model then checks every candidate and rejects false matches. |
| find_tags | `GET /v2/tags` | Resolve the product's themes (for example "long distance relationship") into Qloo tags. |
| recommend | `GET /v2/insights` with `filter.type=urn:entity:*` | What else each audience loves, in 9 entity types, in three lists: overall, a niche popularity band (`filter.popularity.min/max`) and inside the main market (`signal.location.query`). |
| audience_demographics | `GET /v2/insights` with `filter.type=urn:demographics` | How each audience leans by age and gender. |
| where_popular | `GET /v2/insights` with `filter.type=urn:heatmap` | Where each audience's taste is strongest, per market. We turn the coordinates into place names with OpenStreetMap. |

Why three lists per type: in our tests, plain affinities were dominated by household names (Tesla,
Google), the niche band surfaced the actionable picks, and reading inside the main market stopped a
single seed (for example Muji) from dragging every result to Japan. The writing step chooses from
all three.

### Example: request to result (redacted)

Starting from the Hades audience, after the agent matched its seeds in Qloo:

```
GET https://hackathon.api.qloo.com/v2/insights
    ?filter.type=urn:entity:videogame
    &signal.interests.entities=<Hades entity id>
    &take=8
X-Api-Key: <redacted>
```

Result (names and affinity):

```
Death's Door 0.87 · Outer Wilds 0.87 · Loop Hero 0.85 · Inscryption 0.85
Cult of the Lamb 0.84 · Dead Cells 0.84 · Slay the Spire 0.83
```

In the report, picks like these become the "They also love" table (scores copied straight from
Qloo), a Meta Ads interest list, and search leads for the community step.

### How we built it

The agent runs as a durable **Cloudflare Workflow**, one retried step per stage:

1. **Read.** Firecrawl fetches the page (or the home page plus up to four key pages). Claude Opus
   5.5 describes the product and splits the likely audience into 3 or 4 segments, each backed by a
   quote from the page, and proposes Qloo starting points for each.
2. **Match.** Each starting point is looked up in Qloo and Claude checks every candidate. Catalogue
   search is fuzzy ("Bullet Journal" can return "The Wall Street Journal"), so wrong matches are
   rejected and listed, never used.
3. **Ask the taste graph.** For each audience: affinities in 9 entity types and three popularity
   views, demographics and a heatmap. Then the whole audience across up to three markets.
4. **Find the doors.** One Claude agent per audience, in parallel, with web search and web fetch,
   guided by that audience's Qloo affinities. Every link it returns is checked.
5. **Write.** Claude writes the report. It picks Qloo results by entity id and the renderer copies
   the real values, so **the model cannot invent a Qloo number**.

Stack: TypeScript end to end. Cloudflare Pages for the site, a Worker for the API (reachable only
through a service binding, so API keys never reach the browser), Workflows for the agent, D1 for
reports. Structured outputs (Zod) for every model step. The same pipeline also runs locally from the
command line.

### Challenges we ran into

- **Fuzzy entity search.** "Day One" (the journaling app) is not in Qloo, and searching for it
  returns Formula One and Hay Day. We added a verification step where the model must pick the exact
  thing or reject it, and the report shows what was rejected.
- **Generic signals give generic answers.** A single broad tag returned the same affinity for every
  result; one mixed set of seeds let the loudest audience drown the others. Splitting into audiences,
  each with its own seeds, fixed both.
- **Silent failures.** Invalid parameters are ignored without an error, and `video_game` is
  rejected while `videogame` works. We probed every endpoint with real calls before trusting it.
- **Long jobs on the edge.** A report takes minutes and around 200 outbound requests, so it runs as
  a Workflow with per-step retries, a live progress page and a permanent link.

### Accomplishments that we're proud of

- It works on very different products: an iPhone app, a Steam game, a Mac utility website.
- Honest by design: three provenance labels, a source filter, rejected matches shown, numbers that
  cannot be hallucinated.
- The findings are useful in practice: r/Sufjan for a countdown app is the kind of idea a maker
  would never have had alone.

### What we learned

Taste data is most valuable sideways. The obvious audience is easy; Qloo is what finds the
neighbouring one, and that is where the cheap, uncrowded reach is.

### What's next

- Email delivery and a PDF version of the report.
- Compare two products, or your product against a competitor (Qloo's compare analysis).
- Track an audience over time with Qloo trends.

### Known limitations (what the result does not establish)

- Qloo results describe what groups of people tend to like. They do not describe or predict any
  single person, and an affinity is not a guarantee that someone will buy.
- The report depends on how the agent read the page and which starting points Qloo had. Section 02
  of every report shows both, so a wrong reading is visible.
- Community sizes and rules change; links are checked when the report is made, not afterwards.
- Demographic leans are relative to Qloo's average, not absolute shares of an audience.
- To keep costs bounded the public demo allows a few reports per day (judges can skip this; see the
  testing instructions). A link analysed in the last 30 days returns the saved report instantly.

### Privacy

No accounts, no email, no personal data. Only the public content of the submitted page and
product-related entities are sent to providers. Nothing personal is ever sent to Qloo. The Qloo key
lives only on the server.

---

## Testing instructions (for judges)

1. Open **https://whowouldlove.javi.link/?code=JUDGE_CODE_HERE**. The code lifts the daily limits on
   this device.
2. Paste a link to a product page (an App Store listing, a Steam page or a landing page) and press
   "Find who would love it". Choose "the whole website" for a home page.
3. Watch the progress page; a report takes about 8 minutes. You can close the tab and come back to
   the same link.
4. In the report, use the "Show" filter to see only Qloo data, only web research or only our
   interpretation.

Finished reports to look at right away:

- Momentline (iPhone app): https://whowouldlove.javi.link/r/momentline
- Momentline again, the run shown in the video: https://whowouldlove.javi.link/r/5cc02d745698
- Hades (Steam game): https://whowouldlove.javi.link/r/4ac006bb911a

## "Was this project significantly updated during the submission period?"

New project, built from scratch during the submission period (started 2026-10-08).
