# Ponder

**Don't skip the video. Understand it.**

Paste a YouTube or Vimeo link and Ponder gives you back a study pack: a summary, an outline, flashcards, and five reflection questions that push you to think about the video more deeply.

The questions are the heart of it. Every video gets one of each kind:

| Kind | What it asks |
| --- | --- |
| **Apply** | How would you use this in your own life or work? |
| **Connect** | What does it link to that you already know? |
| **Push back** | Where is the argument weakest? |
| **Transfer** | Does the idea survive in a different domain? |
| **Decide** | Faced with a real choice, which way would you go? |

They are personal and open-ended, not quiz questions checking whether you watched. Competitors (Eightify, NoteGPT, Summarize.tech) sell "skip the video and save time". Ponder sells "actually understand it".

## What's in this repo

```
api/ponder.js           Vercel serverless function: POST /api/ponder { url }
lib/                    The pipeline (no dependencies)
  video.js              Parse YouTube/Vimeo links
  transcript.js         Supadata (YouTube) and Vimeo captions
  studypack.js          The Claude prompt, schema, and validation  <- the IP lives here
  handler.js            Cache, free daily limit, error handling
  store.js              Upstash Redis cache/limits (optional)
  sample-pack.js        Example pack for mock mode and the "See a sample" button
public/                 Web app (static, served by Vercel)
extension/              Chrome extension (Manifest V3 side panel)
scripts/                Local dev server and extension packager
test/                   node --test suite
docs/ROADMAP.md         What's next: accounts, Stripe, Chrome Web Store
```

No `npm install` needed. Everything uses Node 20+ built-ins.

## Try it locally (2 minutes, no keys)

```bash
npm run dev:mock
```

Open http://localhost:3000 and paste any YouTube link. Mock mode returns the sample pack without calling any paid API, so you can click around for free.

For real packs, copy `.env.example` to `.env`, add your two keys, and run `npm run dev`.

## Deploy the web app and API to Vercel (about 15 minutes)

1. **Get API keys**
   - Anthropic: https://console.anthropic.com > API Keys
   - Supadata: https://supadata.ai (about $0.99 per 1,000 transcripts on paid plans)
2. **Import the repo** at https://vercel.com/new and pick `The-LJAW/ponder`. Leave every build setting at its default.
3. **Add environment variables** (Project > Settings > Environment Variables): `ANTHROPIC_API_KEY`, `SUPADATA_API_KEY`. The rest of `.env.example` is optional.
4. **Add Upstash Redis** before sharing it publicly: Project > Storage > Marketplace > Upstash for Redis > connect. It sets the env vars for you and turns on the per-video cache and the free daily limit (`FREE_DAILY_LIMIT`, default 5). Without it there is no limit at all, so strangers could run up your bill.
5. **Redeploy.** Your app is live at `https://<project>.vercel.app`.

## Load the Chrome extension

**For development** (talks to `npm run dev` on localhost):

1. Run `npm run dev` (or `npm run dev:mock`).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick the `extension/` folder.
3. Open any YouTube video, click the Ponder icon (or press Alt+P). The side panel opens next to the video. Press **Ponder this video**.

**For the Chrome Web Store** (talks to your Vercel deployment):

```bash
PONDER_API=https://<project>.vercel.app npm run build:ext
```

That writes `dist/ponder-extension-0.1.0.zip` with the API address baked in. Upload it at https://chrome.google.com/webstore/devconsole ($5 one-time developer fee). Use `https://<project>.vercel.app/privacy.html` as the privacy policy URL. The listing checklist is in [docs/ROADMAP.md](docs/ROADMAP.md).

## Costs

About 1 to 3 cents per new video: transcript about $0.001, Claude Haiku 4.5 about 1 to 3 cents depending on length. Cached videos cost nothing. A heavy Pro user (40 videos a month) costs about $1.24 against $7 of revenue, roughly 82% margin.

Want sharper questions? Set `PONDER_MODEL=claude-sonnet-5-5`. It costs roughly twice as much per video and is the first thing worth A/B testing, since question quality is the product.

## Working on it

```bash
npm test          # 16 tests: link parsing, pipeline, cache, limits, sync checks
npm run sync      # copy shared files into public/ and extension/ after editing them
```

Shared code has one source of truth and copies that `npm run sync` refreshes (the tests fail if they drift):

- `lib/video.js` and `lib/sample-pack.js` are copied into `public/lib/` and `extension/lib/`
- `public/render.js`, `public/client.js`, `public/ponder.css` are copied into `extension/`

To change the questions, edit `SYSTEM_PROMPT` in `lib/studypack.js` and bump `PACK_VERSION` so cached packs regenerate.

## Status

- Done: pipeline, web app, Chrome extension, free daily limit, per-video cache, privacy page, tests.
- Not yet: user accounts and Stripe billing for Pro ($7/month or $59/year). Deliberately left out until installs and reviews build up. See [docs/ROADMAP.md](docs/ROADMAP.md).
