# Video: script and production notes

Final file: `video/who-would-love-demo.mp4` (1920x1080, 30 fps, 0:56, H.264 + AAC, no music).
Captions: burned in, and also as `video/who-would-love-demo.srt` for YouTube.
Custom thumbnail: `video-thumbnail.png` (1280x720).

The video is optional for this hackathon, so it is short and goes straight to the point: paste a
link, Qloo-grounded audiences, ready-to-paste targeting, and ads written from Qloo taste.

## How it was made

Everything is in `video-src/` and reproducible:

- `script.json`: the narration per scene. `voice` is what the TTS reads ("Qloo" is spelled
  "Clue" so it is pronounced right); `caption` is what appears on screen.
- `voice.py`: one clip per scene with ElevenLabs (premade voice "Chris"), key read from AWS SSM.
- `record_progress.py <report id>`: records the live progress page of a real run, start to finish.
- `record_scenes.py <report id>`: records every other scene from the live site at 1080p, timed to
  its narration, plus the closing card (`close.html`).
- `assemble.py`: cuts the scenes, speeds up and zooms the progress recording, overlays the
  captions, adds the voice, and writes the `.mp4` and `.srt`.

The report shown is a real production run made for the video: Allbirds Men's Tree Runner,
https://whowouldlove.javi.link/r/a2da04e907fe (also in the sample gallery). No music, so there is
no copyright risk.

## Script

| Scene | On screen | Voice |
| --- | --- | --- |
| paste | Home: the Allbirds link is typed into the form. | Paste a link to anything you made. Here: Allbirds Tree Runners. |
| agents | The live progress page, sped up: the taste agents' steps as they happen. | AI agents take it to Qloo's taste graph, which knows what real groups of people love: music, film, brands, places. They decide what to ask, and fix the signal when the data looks off. |
| taste | Audience 1: the Qloo affinities table with scores, then demographics and places. | So every audience is measured, not guessed. These are the things this group really loves, with Qloo's scores. Without Qloo, this would just be an AI making things up. |
| targeting | The Meta Ads interests block; Copy is pressed. | It becomes targeting you can paste straight into Facebook and Reddit ads. |
| ads | The highlighted "Ad kit" menu entry, then the first concept's feed and story mockups. | Then the part nobody else does: ads, written for each audience's taste. Three concepts each, in feed and story formats, ready to run. |
| evidence | The Qloo entities under the concept, with their scores. | Every ad shows the Qloo taste it was built on. |
| critic | The creative agents' log: the critic rejects "Made from trees, not petroleum" as greenwashing. | And a critic agent sends back anything that overpromises, stereotypes, or cites data Qloo doesn't have. |
| close | Logo, "Your audiences. And their ads.", whowouldlove.javi.link. | Who Would Love. Who'd love what you made, and the ads to reach them. |

## Upload checklist

- [ ] YouTube, visibility **Public**, title "Who Would Love: your audiences, and their ads (Qloo Agentic Hackathon)".
- [ ] Custom thumbnail `video-thumbnail.png`.
- [ ] Upload `who-would-love-demo.srt` as English captions.
- [ ] Paste the YouTube link in the Devpost "Video demo link" field.
