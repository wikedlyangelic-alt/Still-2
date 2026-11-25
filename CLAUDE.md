# Still 2

A gratitude app. Andrew is the owner and first user. This repo is the "test drive" build: an installable web app (PWA) served by GitHub Pages at https://wikedlyangelic-alt.github.io/Still-2/. The long-term plan is a native Expo + Supabase build; the design and the data model here carry over to it.

The first app lives in a separate repo (wikedlyangelic-alt/Still) and must keep working. Never change its tables or behaviour from here.

## How it is built

- No build step. Plain `index.html`, `app.css`, `app.js`, `icons.js`, `sw.js`, `manifest.webmanifest`.
- `vendor/supabase.js` is the UMD build of `@supabase/supabase-js` 2.119.2, checked in so the app works offline.
- `icons.js` holds Material Symbols (Rounded, filled) as inline SVG paths, so icons never depend on a network font.
- Fonts: Newsreader (headings, entries) and Roboto Flex (everything else) from Google Fonts, cached by the service worker.
- **Every deploy: bump `CACHE` in `sw.js`** (`still2-v1` → `still2-v2` …) so phones pick up the new files.

## Screens and navigation

- Write (home), Gratitude, Master your Mind, Meditate, Affirmations (coming next), Patterns.
- Navigation is the eclipse: a small eclipse sits in the bottom-right corner of every screen. Tapping it clears the screen and grows it into the middle with six "moon" circles around it. Tapping the eclipse again returns to the screen you were on. Tapping a moon zooms into that screen.
- The bright point on the eclipse's rim is the sun. Moons near it are lit; far ones fall into shadow (see `light()` in `app.js`).
- Gratitude and Master your Mind use the star line: a light travels down the line as you scroll and lights the stars it passes (`Timeline` in `app.js`). Days are separated by a medallion with the date. Long days show 6 entries, then "Show N more".
- The phone's back gesture closes sheets, the eclipse, the voice blob and ends a meditation (the `layers` stack).
- Write is centred, with a live clock (seconds) under the date. Under it, an up-and-down kind wheel: Gratitude, then the five Master your Mind kinds. When it stops, the middle one locks in: the question, placeholder, Save button, caret and voice blob take that kind's colour, and Save goes to `moments` or `mind_entries`. It starts on Gratitude each time the app opens. The mic opens a full-screen moving blob with the words appearing underneath (`drawBlob`); tap the blob to pause or keep talking. Entries in the lists show their time to the second.
- Hold an entry in Gratitude or Master your Mind (about half a second) to open a small see-through glass editing bubble that floats up from the entry (kept in the top third so the keyboard never covers it): change the text (and, for Master your Mind, the kind with a small up-and-down selector in its top-right corner; tap it for the next kind), Save or Delete, both with Undo. Tap outside or use back to close. Enter on a focused entry opens it too.
- Gratitude and Master your Mind stars zigzag left and right of the line (`zigX`, stable per entry id); the line is an SVG path and the light runs along it.
- Meditate: an up-and-down minute wheel inside the circle (1–60, then 75, 90, 120; the countdown replaces it during a session), sounds (Silence, Deep hum, Soft rain, Ocean waves, Night wind) and end bells (Singing bowl, Temple bell, Soft chimes, Deep gong, No bell), all made with WebAudio so they work offline, plus a volume slider. Begin fades everything except the circle and countdown; the settings come back when it ends.
- Every save, edit and delete shows a toast with Undo. Entries are always found by id (`findEntry`), because a sync can swap the object; removal sets `deleted_at` so it syncs.

## Data

- Local first. The phone's working copy is `localStorage['still2-data-v1']` = `{ moments: [], mind: [] }`. Each item has a uuid made on the phone, `at`, `updated_at` (newest edit wins) and `synced`.
- On first run it imports anything in the first app's local store (`still-data-v1`, same origin).
- Supabase project `still` (ref `icovzdxbbvbdbhcvdbrv`, ca-central-1). The publishable key in `app.js` is safe to be public.
  - `public.moments`: gratitude moments, shared with the first app. Columns: id, user_id, text, at, source ('voice' | 'typed'), updated_at, deleted_at, server_updated_at.
  - `public.mind_entries`: Master your Mind entries, Still 2 only. Columns: id, user_id, kind ('others' | 'angry' | 'afraid' | 'selfish' | 'resentful'), text, at, updated_at, deleted_at, server_updated_at.
  - Row-level security on both: people only ever see their own rows.
  - `server_updated_at` is set by the `touch_server_updated_at()` trigger and is the pull cursor.
- Sync: push every unsynced row (upsert on id), then pull everything with `server_updated_at >=` the cursor for each table. Runs after a save, on sign-in, when the connection comes back and when the app comes to the front.
- Sign-in: Supabase email link (implicit flow, tokens arrive in the URL hash) or the 6-digit code if the email has one. The auth storage key is `still-auth`, the same as the first app, so a sign-in on one carries over to the other on this origin.

## Balance (Master your Mind)

Good = today's gratitude moments + "Thinking of others". Hard = angry + afraid + selfish + resentful. The goal is for good to win the day.

## Rules

- No sample or placeholder data in the app. Empty states explain what will appear.
- Keep colours to the night palette: background #100E1B / #0B0A13, lavender #C8BBFF, gold #EEC56C for gratitude. Emotion colours only in Master your Mind: others #7DDBA8, angry #FF8A7A, afraid #8AB6FF, selfish #FFB15C, resentful #E89BEF.
- Touch targets at least 48px. Respect reduced motion.
- Escape user text before putting it in HTML (`esc()`).
- Test at phone size (390×844) in a headless browser before pushing; there should be no console errors.

## Not built yet

Affirmations recorded in your own voice, the Patterns counsellor (AI), push notifications and daily reminders, the guided journey, a first-time intro (including how the eclipse works).
