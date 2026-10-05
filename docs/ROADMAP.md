# Ponder roadmap

The plan: launch the Chrome extension free, let installs and reviews build, then add Pro. Distribution is the whole game, so every step below is ordered by what gets Ponder in front of people soonest.

## 1. Go live (this week)

- [ ] Deploy to Vercel with `ANTHROPIC_API_KEY` and `SUPADATA_API_KEY`
- [ ] Connect Upstash Redis (cache plus the free daily limit)
- [ ] Run 5 to 10 real videos of different kinds (lecture, podcast, tutorial, talk) and read the reflection questions critically. Tune `SYSTEM_PROMPT` until every question passes the test "could this only have come from this video?"
- [ ] Try `PONDER_MODEL=claude-sonnet-5-5` on the same videos and compare. Pick the model on question quality, not just cost.

## 2. Validate (before any billing work)

- [ ] Show it to 10 target users (students, people who watch lectures and podcasts). Don't ask if they'd use it. Watch whether they paste a second video without being prompted.
- [ ] Note what they skip and what they write in the answer boxes.

## 3. Chrome Web Store launch (free tier only)

- [ ] `PONDER_API=https://<project>.vercel.app npm run build:ext`, upload the zip
- [ ] Listing name: "Ponder: Study Any Video". Lead the description with the position: understand the video, don't skip it.
- [ ] Keywords people already search: youtube summary, video notes, study, flashcards, lecture notes
- [ ] Screenshots (1280x800): side panel next to a lecture, the five questions, flashcards, a filled-in answer
- [ ] Privacy: link `/privacy.html`; in the data disclosure, declare "website content" (the video link) and certify no sale or transfer
- [ ] Single purpose statement: "Creates study materials for the YouTube or Vimeo video in the current tab"
- [ ] Track installs, weekly users, and reviews. Set the threshold for step 4 before launching (for example 1,000 installs or 25 reviews).

## 4. Pro: accounts and billing

Pro at $7/month or $59/year. Free stays at a few packs per day.

Simplest viable path:

1. **Supabase Auth** with email magic links (no passwords to manage). The extension opens the web app's sign-in page; the web app hands a session token back to the extension.
2. **Stripe Checkout** with two prices ($7/mo, $59/yr) and the customer portal for cancellations, so there is no manual support. A Stripe webhook (`api/stripe-webhook.js`) sets `pro_until` on the user row.
3. **In `lib/handler.js`**: if the request carries a valid session for a Pro user, skip the daily limit (and maybe allow longer videos or the Sonnet model).

Lighter alternative if accounts feel like too much: sell a Pro license key through Stripe Payment Links or Lemon Squeezy (the Debt-Free Clock route), have the user paste it into the extension once, and check it server-side. No sign-in at all, at the cost of no cross-device sync.

Pro feature ideas, in order of likely value: higher or no daily limit, saved answers synced across devices, spaced review of flashcards and past questions, export to Anki and Notion.

## 5. Growth after launch

- Short-form video showing a reflection question on a popular lecture
- SEO pages: public study packs for popular lectures at `/v/<id>`, built from the cache
- Support more sources: podcasts (Spotify/Apple episodes with transcripts), Coursera/edX lectures

## Known limits

- Videos without captions fail by default. Setting `SUPADATA_MODE=auto` lets Supadata transcribe them with AI at a higher cost per video.
- Vimeo uses the player's caption track, so it only works for public Vimeo videos that have captions, and Vimeo may block the request from some cloud hosts.
- Transcripts beyond about 2.5 hours are cut off; the pack notes it.
