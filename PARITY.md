# Web ↔ iPhone parity

The iPhone app (SwiftUI, `songspot/`) is the source of truth. This is the checklist for the web game (`app/js`, `app/css`), branch `web-anim`, 27 Sep 2026.
✅ = same behaviour, texts, persistence and look (checked side by side against the Simulator at iPhone 15 Pro size). ❌ = differs, with the reason.

## Stage (StageView.swift → app/js/stage.js)
- ✅ Play disc: press — pressed look at once (pause glyph, ring pulse, sweep), `press(0.8)` + click; the look now **holds while the clip is still downloading** and the clip starts when ready
- ✅ Play disc: stop — `press(0.45)`; stopping mid-download cancels it (a late clip never starts)
- ✅ Play/pause glyph size — enlarged to match SF `play.fill` 40pt black (was ~70%)
- ✅ Play path reliability — first tap on a fresh page plays (context created + unlocked inside the tap); 8 s ceiling per fetch; retry, then Apple-id re-lookup; a dead clip shows "Couldn't load the clip. Check your connection and try again." and resets the button; two failures in a row → "That track wouldn't load. Here's another."
- ✅ Prime — the round's clip is fetched as soon as it is dealt, then the next round's (up to 3 draws); a clip that fails before play is pressed is silently re-dealt (rerolls reset to 3 on success, as the app)
- ✅ Skip / Give up — `press(0.55)` on skip, the clip runs on to the new stage length; give up → loss sequence
- ✅ Guess field + suggestions — Easy search scope, `select` haptic on a suggestion, Guess arms, wrong → `wrong` + shake
- ✅ Hint key — one per round, `success` haptic, "It's by …" toast (4 s), spent bulb
- ✅ Era reel tap (spin) / drag (glide to nearest) — ticks, soft `press(0.6)` on landing, bump spring
- ✅ Difficulty pills — click, promotion toasts, dead pills dimmed
- ✅ Timeline — stage fill, marks, caret label
- ✅ Win — light, sweep haptic with the light, `success` with the card, confetti, 20 s of the song
- ✅ Lose — lamp blackout keys, `loss` haptic, song after 320 ms
- ✅ Reveal panel — Listen on Apple Music, Challenge your friend (share), Next (`press(0.7)`)
- ✅ Rewarded "5 more seconds" offer — OUT OF GUESSES, Watch/Answer, "Five more seconds. Same song." (only when an ad is ready, as the app)
- ✅ Menu button / Premium crown — click + soft `press(0.5)` (crown haptic was missing)
- ✅ LevelTheme — page/stage take the tier's whisper (0.035/0.05 page, 0.03/0.075 stage), 0.6 s easeInOut cross-fade (registered CSS properties), win light brightens the tinted stage, theme-color follows
- ❌ Status bar / safe area — the web has no status bar, so everything sits ~60px higher in captures (a real iPhone Safari adds the safe area)

## Drawer (Drawer.swift → app/js/drawer.js)
- ✅ Brand + close
- ✅ Hero card → profile (avatar, name, level title, streak flame, level bar)
- ✅ Go Premium row (hidden for premium)
- ✅ Daily challenge row (lit with #N, or "Played today" + check)
- ✅ Play with friends row
- ✅ Play ranked row (lock + "Premium · climb the ladder" when not premium)
- ✅ Friends row — NEW; opens a Friends sheet with the app's header and "Sign in to add friends." (signed in: friends are in the app; no web friend backend)
- ✅ Difficulty ladder + Reroll ("New song.") + Any era (`select`) — rung taps silent, as the app; dead rungs ignore taps
- ✅ Artist row / locked PREMIUM row → Artist picker / premium sheet; clear ✕
- ✅ Genre row → Genres picker; top-8 chips (silent, as the app)
- ✅ Spotlight Off/On — `select` only when it changes
- ✅ Settings: Easy search, Accent glow (default OFF), Reveal artwork, Animations, Haptics (now always shown), Level colours (NEW, default ON), Hint — `select` tick fires before the toggle, as the app
- ✅ Sounds + volume — web-only rows (the app's audio is Apple Music at system volume; the web plays its own clips)
- ✅ How to play / FAQ
- ✅ Privacy choices — shown when Google's consent tool (googlefc) is on the page, like the app's `privacyOptionsRequired`
- ✅ Restore purchases — "Restoring…" while working, "Premium restored." / not-found toast
- ❌ Apple Music section ("Want the full track? Connect Apple Music") — not applicable on the web (previews only)
- ❌ The app has no divider between Haptics and Level colours (looks like an app oversight); the web keeps the divider
- ✅ Drawer icons scaled up to SF Symbol sizes (tiles, crown, chevrons, switches)

## Sheets
- ✅ Premium sheet — layout, plans, perks (icons scaled up), restore; ❌ the buy button says premium on the web is coming soon (no Stripe checkout yet)
- ✅ Genres picker — full-screen on a phone like the app's cover; bigger checkmark
- ✅ Artist picker — full-screen on a phone, search field focused on open, live artist search
- ✅ FAQ (How to play)

## Haptics (Haptics.swift → app/js/haptics.js)
- ✅ Same calls at the same moments: tap, press(weight), select, success, wrong, loss, winSweep
- ✅ Android / Vibration API — patterns: success 2 beats, wrong 3 beats, loss thud + soft 0.9 s later, winSweep five beats on the win clock
- ✅ iPhone Safari (iOS 18+) — hidden `<input type="checkbox" switch>` in a `<label>`, clicked from code, one system tick per beat; feature-detected (only where `switch` exists and `vibrate` doesn't), clicks never reach the page
- ✅ Haptics switch respected everywhere
- ❌ iPhone ticks have one strength (no weight/sharpness), and beats fired after a delay (loss's second thud, winSweep) may be dropped by iOS outside a tap

## Audio (verified in Playwright, Chrome)
- ✅ 5/5 fresh pages: first tap plays (200–620 ms), pressed look shown on the tap
- ✅ 30/30 random songs across tiers, eras and genres play through the player
- ✅ 8/8 artist-mode songs (live artist search) play
- ✅ 400/400 random pool previews reachable
- ✅ Stop during download → nothing starts late; a dead clip → message, button not stuck (~0.4 s)

## Profile (Profile/ProfileView.swift → app/js/profile.js)
- ✅ Header "Profile" + close
- ✅ Avatar (ring, initial, camera badge, photo picker)
- ✅ Name + pencil → inline edit, Done/Enter commits, 20 chars, Esc cancels
- ✅ "Since …" / PREMIUM chip
- ✅ Level line (title, "N to Next", bar grows 0.6 s)
- ✅ Stat grid (Songs named, Win rate, Streak, Best streak)
- ✅ Friends row — same look and texts; tap says friends need sign-in / the app (no web friend system)
- ✅ Daily challenge card — flame, streak title + subline, 7-day week strip with today's ring, Played / Named / Best streak (NEW redesign)
- ✅ How fast you name them — 5 columns, usual one lit, "N named", spring growth (NEW)
- ✅ By difficulty — 5 tiles in tier colours, "Imposs." (NEW)
- ✅ Ranked card — trophy, rank, rating, form dots, progress + season countdown, won–lost / best / points, "This week" (NEW)
- ✅ Career — 2-col tiles: rounds, named at 0.1s, ladders, parties won, best party score, party points (NEW)
- ✅ Account › Name, Photo, Plan (→ premium sheet), Sign out, Delete account (same texts and flow)
- ❌ Account for guests — the web shows "Sign in · Keep your stats" instead of Sign out/Delete (web guests have no account)
- ❌ Number grouping follows the reader's locale (the test Simulator is Danish: "1.044")

## Daily (Daily/DailyView.swift → app/js/daily.js)
- ✅ Round — timeline, disc, seconds, field, hint key with badge, Skip/Guess/Give up
- ✅ Play — the go is used on the first press; a press while playing restarts the clip (fixed)
- ✅ Suggestions — a tap submits at once (fixed; was the stage's arm-then-guess)
- ✅ Hints — toast with bulb or artist picture, hint line, success haptic
- ✅ Wrong / skip — wrong haptic + shake; press(0.55) on skip; the clip keeps running
- ✅ Out of guesses — ad offer / Answer, "Five more seconds. Same song."
- ✅ Leave confirm — action sheet; leaving counts as missed and shows the result (fixed; the web used to close)
- ✅ Result — art, title, stamp, Points/Streak/Today, Share (text), board, next-song countdown
- ✅ Already played — opens on the result
- ✅ LevelTheme — the app doesn't tint daily; the web doesn't either

## Ranked (Ranked/RankedView.swift → app/js/ranked.js)
- ✅ LevelTheme — the background follows the round/rank tier, cross-fades, cleared on close (NEW)
- ✅ Entry — badge, rank, rating, progress, season countdown, record, form, Leaderboard, Find a match
- ✅ Search — pulse, "Looking for an opponent…", Cancel
- ✅ Match found / versus — sides, VS, "First song coming up", press(0.9) → success
- ✅ Round intro — scoreboard, ROUND N / FINAL, tier, decade reel, 3-2-1-GO
- ✅ Playing — timer ring, four answers, success/wrong + shake, replay
- ✅ Round result — IT WAS_ card, gains, hold bar
- ✅ Finished — verdict, count-up, crown, round by round, rating card, Play again / Leaderboard / Leave
- ✅ Leave the match? — action sheet, forfeit counts as a loss
- ✅ Leaderboard sheet — Today / This week, medals, your row pinned
- ❌ Opponent — a stand-in bot until live matchmaking exists on the web

## Party (Party/PartyView.swift → app/js/party.js, partygame.js)
- ✅ Entry — title, "Playing as", host card, code + Join; Host/Join need a name (opens the profile), as the app
- ✅ Room loader — counter-rotating rings round your face, headline + "Room CODE", equalizer, Cancel (NEW)
- ✅ Waiting room — code, count, players pop in, empty seats, summary card, Start
- ✅ Host settings sheet — rounds, difficulty, time, years, songs; **Search removed** as in the app (always Easy search on the wire)
- ❌ Songs sheet artist tab — bundled artists only; no Apple Music catalogue search on the web
- ✅ 1v1 lobby — two seats, VS, bot seat, "Start the 1v1"
- ✅ 1v1 result — Victory/Draw/Defeat, scores with crown, ROUND BY ROUND card, Rematch / Leave, staged springs (NEW)
- ✅ Countdown, four-answer round, typed fallback, between-round scoreboard, podium, confetti
- ✅ LevelTheme — the round's tier colours the page (NEW)
- ✅ Haptics and sounds at the app's moments (silent close/leave/done as in the app)
- ✅ Wire — messages unchanged; round history, late-score guard, 20 s prune grace, reconnect re-announce ported
- ❌ Friend invites / joining a friend's 1v1 — no friend system on the web (duel screens reachable by demo knob)

## Test knobs (localhost only)
`?open=drawer|profile|daily|ranked|party|premium|genres|artists|faq`, `?premium=1`, `?demo=win|lost|offer|hits`, `?open=party&demo=duelresult`, `?rankedDemo=board`.
