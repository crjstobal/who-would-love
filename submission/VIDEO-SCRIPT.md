# Video: script and production notes

Final file: `video/who-would-love-demo.mp4` (1920x1080, 30 fps, 2:24, H.264 + AAC, no music).
Captions: burned in, and also as `video/who-would-love-demo.srt` for YouTube.
Custom thumbnail: `video-thumbnail.png` (1280x720).

The video is optional for this hackathon, but the rules say judges may judge only from the text,
images and video, so it matters.

## How it was made

- Every screen is the live site (whowouldlove.javi.link), recorded from Chromium at 1080p with a
  real report made for the video (Momentline, report `/r/5cc02d745698`, about 7 minutes).
- Narration: ElevenLabs premade voice "Chris" (not Javi's cloned voice). For the voice, "Qloo" is
  written "Clue" and "r/" as "r slash" so it is pronounced right; captions keep the real spelling.
- No music, so there is no copyright risk.
- Everything is reproducible from the scripts in the session scratchpad (recorder, scene timing,
  assembly with ffmpeg). If you re-record the voice yourself, keep each line within its time slot.

## Script

| Start | Scene | On screen | Voice (English) |
| --- | --- | --- | --- |
| 0:00.0 | hero | Home page hero, untouched: the heart-question mark draws itself, the last word rotates (your app, your service...). | You made something. An app, a game, a newsletter. That was the hard part. Or so you thought. Now you need the people who would love it. |
| 0:09.8 | form | Scroll to the form, type the Momentline App Store link, keep 'Just this page', press 'Find who would love it'. | Who Would Love finds them. Paste a link. Here, it's Momentline, a little day-counter app I made. |
| 0:16.3 | progress | Progress page, time-lapse of the real 7-minute run (one still every 3 s). | An AI agent reads the page, works out what the product is, and splits the likely audience into distinct groups. For each group, it picks starting points in Qloo's taste graph, checks every match, and asks Qloo what else these people love. |
| 0:31.3 | short | Report cover, then 01 The short version with the three numbers. | Seven minutes later, the report. The short version first: four audiences, and the one to start with. |
| 0:39.5 | understood | 02 What we understood: the Qloo starting points; highlight the 'not in Qloo' chips. | It shows exactly how it read your page, and every starting point it matched in Qloo. When Qloo has no exact match, it says so. It never guesses. |
| 0:50.5 | taste | Audience 1, Sentimental milestone keepers: highlight A Million Little Things, Gabrielle Aplin, Life is Strange, then the demographics, then the places. | Each audience gets its own taste profile, straight from Qloo. The sentimental milestone keepers love A Million Little Things, Gabrielle Aplin and Life is Strange. They lean young and female, and the taste is strongest in New York, Nashville and Chicago. |
| 1:10.6 | doors | Same audience, Web research table: highlight r/LongDistance, then r/lifeisstrange. | Then the agent goes looking for the doors, and checks every link. r/LongDistance is the obvious one. r/lifeisstrange is not. It only shows up because Qloo knows this audience loves that game. |
| 1:24.1 | where | Audience 2, Stargazers: highlight 'Where in United States this taste is strongest' (Cape Canaveral, Death Valley, Monument Valley). | Taste even tells you where. The stargazers cluster around Cape Canaveral, Death Valley and Monument Valley. Exactly where you'd point a telescope. |
| 1:33.4 | use | Ready-to-paste targeting block; then click the 'Qloo data' filter and scroll the filtered report. | It all ends in something you can use today: interests to paste into Meta Ads, Reddit communities, and a first creative. And every block is labelled Qloo data, web research, or our interpretation, so you can filter the report down to just the measured taste. |
| 1:52.3 | arch | Animated card: five steps inside the Cloudflare Workflow box, revealed in sync with the voice. | Under the hood, a Cloudflare Workflow runs each stage as a durable step. Firecrawl reads. Claude Opus 5.5 plans and checks. About a hundred and forty Qloo calls bring affinities, demographics and heatmaps. And Claude, with web search, finds the communities. No signup, and no personal data ever goes to Qloo. |
| 2:17.3 | close | Closing card: logo draws, tagline, URL whowouldlove.javi.link. | Somebody out there would love what you made. Go find them. |

## Upload checklist

- [ ] YouTube, visibility **Public**, title "Who Would Love: find who would love what you made (Qloo Agentic Hackathon)".
- [ ] Custom thumbnail `video-thumbnail.png`.
- [ ] Upload `who-would-love-demo.srt` as English captions.
- [ ] Paste the YouTube link in the Devpost "Video demo link" field.
