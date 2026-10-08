# Web ↔ iPhone parity (PARITY-WEB)

The iPhone app is the source of truth: `~/Developer/songspot-ios`, HEAD `810f015` (8 Oct 2026, build 48). This is the
gap list for the web game (`app/js`, `app/css`) on branch **`web-parity`**, after the 8 Oct parity pass. The checklist the
pass worked from is the iPhone feature inventory in `~/Developer/songspot-android/PARITY-IOS.md`, plus the iPhone commits
after it (963d3fd, c4544e8, 2209917, dd54c9a, 8c1013f, 606f8df, 1dc9ad6). The older 27 Sep checklist is `PARITY.md`.

**Legend:** ✅ same as the iPhone · ⚠️ partial (what differs is stated) · ❌ not done (why) · 🌐 platform difference (the web's own equivalent)

Side-by-side sheets (iOS · web 390 px · web desktop): `~/Developer/songspot-assets/web-parity-2026-10-08/sheets/`.
iOS reference shots: `…/ios/` (`INDEX.txt` says what each is). Web shots per area: `…/web/<area>/`, final pass: `…/web/final/`.

## Before the pass (what the web was missing)

On 8 Oct the live web was the 28 Sep port. It had the old drawer with Play rows, initial-letter or photo avatars, plain dark
cards, a stand-in-bot "ranked", the old paywall sheet and the old level names. It had none of the iPhone's 30 Sep–8 Oct work:
- the bottom tab bar and the Games, Party, Friends and Profile tabs;
- colour panels with 3D icons;
- the 3D vinyl-toy characters (Spot's sister, the legends), pose clips and figures;
- real ranked matches;
- the full-page paywall;
- Halloween and Christmas;
- album pick and Add to playlist;
- the matcher rewrite and the hidden pool rows;
- the new profile pages;
- the friend bell;
- the plain popping-number round countdown;
- the new level names.

## How to preview locally

```
cd ~/Developer/songspot && python3 serve.py 8765     # then open http://127.0.0.1:8765
```
`api/` (Stripe) only runs on Vercel, so locally the paywall shows "Premium on the web is coming soon". Localhost-only knobs:

| Knob | What |
|---|---|
| `?tab=games\|party\|friends\|profile`, `?multiplayer=1` | open a tab (iOS `-tab`, `-multiplayer`) |
| `?season=halloween\|christmas\|none\|auto` | force a season (iOS `-halloween` / `-christmas` / `-noSeason`) |
| `?demoProfile=1&playerName=Liv&demoAvatar=58&demoNamed=420` | a signed-in demo player with demo stats (nothing sent) |
| `?profilePage=stats\|ranked\|settings`, `?picker=1`, `?creatorCodes=1` | profile pages, Edit avatar, creator code row |
| `?premium=1` | act as premium |
| `?open=drawer\|faq\|genres\|artists\|albums\|premium\|daily\|ranked\|party\|friends\|songbot` (+ `&perk=`) | open a screen |
| `?demo=win\|lost\|offer\|hits\|playing`, `?song=<id>`, `?artist=<name>`, `?album=<id>`, `?streak=N`, `?stage=N`, `?focus=1`, `?toast=<text>` | stage states |
| `?open=daily&dailyDemo=play\|won\|missed\|board\|alone\|failed\|fetching`, `dailyRank=N`, `dailyReset=1`, `dailySong=<id>` | daily states (nothing posted) |
| `?open=ranked&rankedDemo=search\|versus\|intro\|round\|result\|finished\|final\|lose\|board\|play`, `setRP=N`, `fakeResult=1`, `autoFind=1`, `autoAnswer=1`, `stopAtFound=1` | ranked states |
| `?rankedQueue=<name>`, `queueWait=N`, `rankedLog=1` | real ranked matches on a private test queue (never meets a real player; never posts results) |
| `?open=party&demoParty=1` / `demoTeams` / `showHostSettings` / `showSongsAlbum` / `showJoining` / `showDuel` / `demoDuelCountdown` / `demoDuelResult` / `demoRoomCountdown` (+`demoFirstRound`) / `demoRoomRound` / `demoTeamRound` / `demoTeamResult` / `demoSoloResult` / `demoError=<text>` / `demoConfirmEnd`; `roomCode=`, `autoStart`, `rounds=N`, `teamMode=`, `duelOpen`, `duelJoin=CODE`; `?tab=party&showJoinCode=1` | party and 1v1 states |
| `?demoFriends=1`, `demoChallenge=1`, `demoRequest=1`, `fakeOffline=1`, `bellListen=<id>`, `bellRing=<id>` | friends states, offline cover, bell test |
| `?paywallTrial=1`, `?adBreak` | paywall trial layout, one test ad break |
| `/app/dev/kit.html` | the design kit on one page |

Checked headless in Chrome (390 and 1440) and in WebKit as iPhone Safari (390): no page errors on any screen. Headless screenshot helpers live in `~/Developer/songspot-assets/web-parity-2026-10-08/tools/` (`shot.mjs`, `final.mjs` =
every screen at 390 and 1440, `sheet.py` = side-by-side sheet, plus per-area Playwright scripts).

---

## Foundations

### Art (tools/convert-ios-assets.sh)
- ✅ Every `Assets.xcassets/Games` picture (66: 3D icons, SOLO/VS heroes, party crews, season art), the 16 glyphs and the 7 rank emblems, as WebP/PNG in `app/img/`
- ✅ 56 character portraits (01–54, 58, 59) and 224 pose stills, with the iOS mask baked into the alpha
- ✅ 56 pose clips: VP9-alpha WebM (Chrome/Firefox/Edge) + the original HEVC-alpha MOV (Safari/iOS), picked by engine
- ✅ `data/pool.json` = the iPhone's 2 Oct pool (15,207 rows, 915 hidden); `data/girl-names.txt`
- ⚠️ `app/img` is 38 MB, 21 MB of it the original MOVs. A VideoToolbox re-encode would bring it to about 23 MB, but the premultiplied edges need checking in real Safari first.

### Design kit and seasons — app/js/kit.js, season.js, icons.js
- ✅ PanelColours (exact hexes), panelBackground (gradient, record grooves, sheen, light edge, coloured shadow), SettingsPanel, PanelGroup, PanelSwitch, PanelLink, GlossyLabel, TabTitle, FlatIcon + IconTile, ChoicePills, ChipGrid, calm panels
- ✅ RoundBanner, Grooves, StageLight, the plain popping-number count (7174c94), CountLine, CapsLine
- ✅ SeededRNG + Swift `random(in:)`/`shuffled`, bit-exact against Swift (same cover walls, motifs and snow as the phone)
- ✅ Season engine: Halloween 15 Oct–1 Nov, Christmas 1 Dec–1 Jan (local calendar, inclusive). Also:
  - the Seasonal theme switch (`songspot.seasonTheme`, default on);
  - the palette swap (page, stage, the five level colours, Easy ink, accentText, Easy pill);
  - the season genre + the 175 Halloween ids, the opener, card titles and icons;
  - Weather, Snowfall (the iOS 40 flakes), SeasonNight, SeasonBackdrop.
- ⚠️ CSS corners are circular (SwiftUI `.continuous` is a touch softer); a panel's edge stroke sits fully inside
- ⚠️ Inter stands in for SF Pro (caps lines a little wider); Nunito 800 for SF Rounded in counts; SF Symbols are hand-drawn SVGs (close, not Apple's)
- 🌐 Reduce Motion = `prefers-reduced-motion` or the app's Animations switch

## Tabs, Games tab, menu — app/js/tabs.js, games.js, drawer.js, app.js, ui.js, view.js
- ✅ Bottom tab bar HOME · GAMES · PARTY · FRIENDS · PROFILE:
  - 52 high, at most 620 wide and centred, with the 3D icons, italic caps labels and the lit plate;
  - the Home disc wears the level colour, and the season's Home icon in a season;
  - Friends shows faces 16 and 31; Profile shows your own character (it repaints on account change);
  - friend-request dot; the bar is #1ed760 on Easy, otherwise the level colour.
- ✅ selectTab:
  - the open tab does nothing; click + select haptic;
  - leaving Home stops the stage and drops the guess focus; pages swap with a 0.18 s fade;
  - sign-out returns to Home; a pick from a sheet lands on Home.
- ✅ Bar away for the menu, the sign-in gate, clean display, the keyboard and guess focus. On Home it steps aside for the clip (back 600 ms after), the confetti and the reveal. With motion off it stays.
- ✅ Games tab: TabTitle, the SOLO/VS hero (season banners), and the SINGLEPLAYER/MULTIPLAYER toggle (`songspot.games.multiplayer`). All 10 cards, incl. the season card:
  - Daily (calendar with the streak, "Ends in"/"Next in");
  - Guess the song;
  - Pick a genre;
  - Pick an artist and Pick an album (premium ribbons);
  - Ranked 1v1 (rank emblem, RP ribbon);
  - Party mode ("Up to 50 players");
  - 1v1 a friend;
  - Beat Songbot (animated figure, premium).
  Motifs and grain use the iOS seeds.
- ✅ Card routing exactly as StageView.pick (season genre, album/artist/Songbot gates, ranked's free first match)
- ✅ Settings-only menu (☰ on Home):
  - Game / Display / General, with the iOS notes word for word and glyph tiles in the level colour;
  - Seasonal theme; Clean display (closes the menu, 5 s toast);
  - Spotlight defaults to Off, as on iOS.
- ✅ Toast placement: at the top over the sign-in gate, above the keys, above the tab bar, otherwise 28 px from the bottom
- ✅ Desktop: one centred 520/620 column for the tabs and the bar; never a sidebar
- 🌐 Web-only menu rows:
  - Sounds + Volume;
  - Phone size (desktop only; replaces the old floating PC/phone box);
  - Privacy choices (Google consent), Get the app, Privacy · Support.
  - No Apple Music row.
- ⚠️ FAQ is the iOS text word for word, except:
  - "Do I need Apple Music?" stops at the preview sentence;
  - two web-only items ("Keyboard?", "Is there an app?");
  - it opens after the menu closes (iOS shows it over the menu).
- 🌐 The "Claim 25% off" icon quick action has no web equivalent

## Home stage, engine, search, pickers — stage.js, game.js, pool.js, matcher.js, pickers.js, coverwall.js, itunes.js, artistcatalog.js, albumcatalog.js, streakflame.js, songsaver.js, wordmark.js
- ✅ The matcher is a line-by-line port of Matcher.swift. It matched the compiled Swift on all 4,986 cases over the 2 Oct pool. It covers:
  - browse and judge mode, `namesSong`;
  - guests via `credit` and "(feat…)", joint acts, films/albums, aliases;
  - the weights, the per-title cap of 3, one row per recording.
  The index builds in idle slices.
- ✅ Pool: hidden rows are never dealt or listed (they still resolve by id); a scene counts once; repeat memory is by recording; season genres
- ✅ Game:
  - the premium ladder 0.1/0.5/2/8/15/20 with the 15 s divider;
  - album pick, narrowed, a filter key per tier, draw-ahead per tier;
  - the artist repeat memory; `matches()` via `namesSong`.
- ✅ Floating corner row: menu disc, clean-display eye (with its toast), the streak flame (streak ≥ 3 on a won round), the Premium pill. It fades when the keyboard lifts the stage.
- ✅ Filter line over the era reel (genre / artist / album, each with a cross), shown only while guessing
- ✅ The tab bar's room is kept, so nothing moves when it steps aside
- ✅ Reel and pills: the reel locks on "Any era" for an artist or album; a spin lands only on eras that have songs; promotion skips dead tiers; an open second chance settles first
- ✅ Reveal:
  - the cover is the Apple Music link, plus "Add to playlist" (Apple Music / Spotify search, in a new tab);
  - the full song after a loss plays only if Home is in front;
  - no "Next round is…" toasts; "Premium skips these." (4 s) after a break; the ad-count rule as on iOS.
- ✅ Search: Easy search waits for 2 letters; byline rows, de-duplicated; artist and album modes search their own index; with Easy search off, an iTunes song search joins in (220 ms debounce)
- ✅ Seasons on Home: the first launch in a season opens on the season's genre and opening song; Weather on every deal; snow behind the stage while the Christmas genre plays
- ✅ Buffering:
  - the next song is buffered at the promoted level;
  - the Easy opener is remembered for the next launch;
  - it re-buffers when Home comes back;
  - the splash (typed wordmark) waits for the first song (at most 3 s).
- ✅ A cold launch is Easy / any era / all genres
- ✅ Genres, Artists (SUGGESTED, offline text) and Albums (all of AlbumPicker), with the season row and backdrop
- ✅ Cover wall: the season genre on unfiltered walls, the iOS SeededRNG shuffle (same covers as the phone), warmed 4 s after launch
- ✅ Win and lose sequences, confetti, level colours
- ⚠️ The keyboard lift uses visualViewport; not tried on a real iPhone (headless browsers have no keyboard)
- ⚠️ The "Add to playlist" chooser is an action sheet; the iOS dialog wasn't captured to compare
- 🌐 Previews only (30 s iTunes previews through Web Audio): no Apple Music full tracks, permission prompt or storefront message; full search uses the iTunes Search API instead of MusicKit

## Characters — app/js/characters.js
- ✅ Roster and ids: the everyday cast and the picker order;
  - Spot's sister (54) for girls' names;
  - legends 58 Drill Rapper (400 named) and 59 Rap Boss (1000), last in the picker with the iOS lock look;
  - 55–57 retired (drawn as Spot).
- ✅ FNV-1a 32-bit stand-ins, bit-identical to iOS (compiled Swift vs JS: 74 edge cases + 3,000 random keys, 0 mismatches), so rooms agree on everyone's stand-in
- ✅ `char:<id>:<pose>:<variants>` parse/format, the photo-ignored rule; NameFilter (both lists verbatim); PlayerName.first; girl names
- ✅ CartoonFace and CharacterFigure: baked-mask stills, feet line, pool of light, calm + per-pose motion, the one-shot pose clip then the calm idle
- ✅ Edit avatar (CharacterPicker)
- ⚠️ The picker's season roster follows `Season.current` (empty when the Seasonal theme switch is off); iOS uses the date only
- ❌ Variants -2…-6 are dormant (no pictures ship on iOS either); the data round-trips

## Profile — profile.js, account.js, login.js
- ✅ Level ladder Newcomer / Listener / Regular / Sharp ear / Headliner / Superstar / Legend; new stats (rankedDrawn, playStreak, bestPlayStreak, lastPlayDay, playCount)
- ✅ Three-way merge (local, remote, base), the owner/unsynced/attempted guards, a 30 s retry, save before sign-out (with both dialogs)
- ✅ Profile main:
  - header with the gear;
  - the hero figure on the accent pool; Edit avatar / Edit profile;
  - the PLAY STREAK panel, the LEVEL card;
  - Friends / Ranked / Stats tiles.
- ✅ The new Stats and Ranked pages (606f8df)
- ✅ Settings page: Name, Character, Creator code (when `app_config.creator_codes` = 1), Plan, Sign out, Delete
- ✅ Plan row: "Premium · Manage" for a subscription; plain "Premium" for lifetime or a hand-given grant (read from `my_premium`'s `expires_at`)
- ✅ Profile in the tab (no close button) and full screen; desktop = one centred column
- ✅ Sign-in gate: the LoginGateView look and copy
- ⚠️ The owner guard applies to real accounts only, so a web guest's local play flows into the account they sign in to
- 🌐 Sign-in is Supabase OAuth (only the providers configured for the web) with "Not now". A guest's Profile tab shows the sign-in gate inline, because iOS signs everyone in at launch.

## Ranked — ranked.js, rankedgame.js, rankedline.js, ladder.js
- ✅ Real matches with real players, on the iPhone's protocol byte for byte (RankedQueue v1):
  - the queue is presence on `ranked-q1-<tier>`, with the same offer/accept/decline timings;
  - the match runs on `ranked-m1-<match>`: hello/deal/ready/go, the play protocol, closes, the end;
  - opponent gone after 8 s, line dropped after 10 s down;
  - a stand-in after 5 s, with songs dealt while searching.
- ✅ Tested web↔web on a private test queue: two pages matched and played 5 rounds with the same totals on both; the stand-in arrived when alone; "Bob left the match · you win"; a cancelled search never matched
- ⚠️ Not tried live against an iPhone (that needs the production queue, and the iOS build has no test-queue switch). Instead, every web frame was decoded by the iOS RankedSeat/RankedWire Codable structs (13/13), and iOS-encoded frames were read back by the web.
- ⚠️ Reconnect backoff is supabase-js's own, not iOS's 1/2/3 s ×3 (same outcome: the line is dropped after 10 s down)
- ✅ Ladder Bronze→Legend, RP parts, tier floors, monthly seasons, rankedDrawn, the rank emblems; premium gate (one free match, gold "Unlock ranked with Premium", paywall 450 ms after closing)
- ✅ Lobby in the first version's plain look (no panels); search with an empty seat
- ✅ Versus: full-body fighters, stage light, VS, terms box, "First song coming up"
- ✅ Round intro: ROUND n / FINAL + the level, the 7-decade reel of album grids (new every match, never the round's song), the plain popping count
- ✅ Rounds: timer ring, four answers, "Waiting for <first name>…"; between rounds with faces and "Too late"
- ✅ Results:
  - the VICTORY/DEFEAT/DRAW band, winner in the win pose with the crown, loser in the lose pose;
  - score plates, pips;
  - the rank plate with the RP chips and "Tier protection";
  - glossy Play again.
- ✅ Leaderboard: `ranked_board2` with the time zone (falls back to `ranked_board`), your line pinned only when you're below the list, character faces
- ✅ First names everywhere; the level-colour theme; challenge banners are hidden only during a match
- 🌐 Shazam guard: a hidden page = left, a window blur = covered. Background for more than 6 s in a real match = forfeit, by page visibility. "Playable" = the preview loads. No review prompt after a win.
- ❌ `-greenRank` (App Store pictures only)

## Party and 1v1 — party.js, partygame.js, partyhome.js
- ✅ Party tab: PARTY title, the crew art (season crews), CREATE A GAME ("Premium · up to 50 players" → premium host page), JOIN A GAME → the code sheet; no old entry page
- ✅ Loader on the cover wall; error card and texts; "End the party for everyone?" / "End the 1v1?"
- ✅ Waiting room in calm panels: code, players with rings, crown and empty seats, team cards, GAME SETTINGS summary, glossy START; host settings as one list with drop-down menus (no Teams in a 1v1)
- ✅ Engine and wire byte-compatible with the iPhone:
  - message types: `refused`, the `hostSent` clock fix, `face` (the character), `album`, `antiShazam`;
  - room rules: startNote, the short game + chosenRounds, departed scores, join hardening, frozen final standings;
  - judging and the bot: judged by `namesSong`, Songbot levels (`songspot.party.botLevel`).
- ✅ Sync: Web Audio schedules the clip so it leaves the speaker on the room's shared instant (two pages started within 1 ms)
- ✅ Round intro (band, stage light, plain popping number, term chips, 1v1 names/scores), the round (dark clock disc, CapsLine, faces with colour rings, answer cards), team round results, the podium with characters on glossy blocks
- ✅ 1v1: fighters with a big VS and Songbot level pills; the result has the winner in the win pose and the loser in the lose pose, with the blue ROUND BY ROUND panel; Rematch
- ✅ Played live between headless pages (party, 1v1, teams; "That room is full."; "The host ended the party.")
- ⚠️ Album tab = well-known albums from the bundled pool (no Apple album search or full tracklists: `api/itunes` has no album endpoint); Artist search on Apple works on the deployed site only (`/api/itunes`)
- ⚠️ No name yet: the web opens the profile (sign-in for a guest) and the room carries on once a name is set; iOS shows ProfileView in a sheet
- 🌐 `setRate(atHostTime)` → AudioContext scheduling; scene phases → visibility/blur; no background task (supabase-js reconnects); ShareLink → `navigator.share`/clipboard; confirmation dialogs → bottom action sheet

## Daily — daily.js, share.js
- ✅ Day number, countdown, server sync (6 s), points; deals only the server's song (spinner on the disc meanwhile); personal tally #N
- ✅ Record songID/seconds/at, per-account key (adopts the old one), clipLabel stamp
- ✅ The DAILY CHALLENGE badge panel (calendar with the streak, "One song, five tries, one go"); the timeline, disc, field and Skip / Give up / Guess; play on touch-down, press again stops; the round starts on the first press of anything
- ✅ Finish:
  - the reveal plays 30 s; the post is sent with retries, then the boards load;
  - a reopen shows the go's own song and heals the streak;
  - the screen moves on at the UTC rollover.
- ✅ Result: Points · Streak · Today panel, glossy Share, "Next song in"
- ✅ Today's board:
  - purple strip + crown; first to name it is #1 (server order);
  - Friends/Everyone; top 10, then ···, then your place;
  - the invite card; character faces, no points column.
- ✅ Share text (text only); the solo 9:16 poster with a 3 s artwork timeout
- ✅ Season dressing: moon/night, the pumpkin/snowman badge, titles, season panels, purple Share in Halloween
- ⚠️ The out-of-guesses offer follows `ads.available && !premium` (no separate `Monetisation.enabled` on the web)
- ⚠️ The board strip's bottom corners are square (iOS rounds them slightly)
- 🌐 Signed-out web players post as an anonymous guest (existing web behaviour; iOS doesn't post signed out); no notification rescheduling or review prompt; Web Share / copy instead of ShareLink

## Friends and system — friends.js, friendsview.js, friendbell.js, shazamguard.js, offline.js, funnel.js, haptics.js
- ✅ Friend and challenge model, "seen" label, ordering, online count; Songbot has its own 3D face
- ✅ Heartbeat every 15 s plus a refresh on start; a hidden tab = the iPhone's background
- ✅ Friend bell on the iOS wire (`realtime:bell-<id>`): it rings after add, respond, remove, challenge, cancel and answer, and the 1v1 host waits on it (≈0.7 s between two pages). New-request toast.
- ✅ add() answers in the iOS wording (already, too many, 30-or-more sent)
- ✅ Friends screen in colour panels:
  - Your code (green); Add a friend (blue: CODE, scan, ADD); Requests (gold, ACCEPT); Your friends (purple, 1V1 chips); Sent (slate);
  - online dots, skeleton rows, SeasonBackdrop;
  - in the tab with "FRIENDS" and no close button.
- ✅ Long-press / right-click to remove; the Songbot 1v1 premium gate; QR sheet; challenge banner
- ✅ QR scanner with BarcodeDetector + camera (asked only on tap). Elsewhere it shows iOS's "Scanning isn't available on this device. Type the code instead."
- ✅ Offline cover; ShazamWatch + OwnPrompt (shared by ranked and party); funnel door names; haptics warm-up
- 🌐 No push on the web. The web also can't ask the `push` edge function to push an iPhone friend (it answers the browser's preflight with 405, no CORS), so an iPhone friend gets no push for a web player's request or 1v1. The bell and their heartbeat still show it in the app. The fix is server-side.
- 🌐 No local reminders, trial tips or review prompt; sign-in stays Supabase OAuth
- ⚠️ "Signed out on this phone…" (session refused) toast + gate: not done; supabase-js signs out silently and Friends clears itself
- ⚠️ A friend link while signed out keeps the code through the sign-in redirect (1 h), rather than iOS's 0.5 s hop

## Premium and ads — premium.js, ads.js
- ✅ Full-page paywall:
  - a cover wall behind the headline; the close button fades in at 1.2 s;
  - "SONGSPOT PREMIUM", "Every song. / No limits.";
  - the five perks in iOS order and wording (ads, ranked, host, artist, album).
- ✅ Plans: Yearly default ($29.99, 3-DAY FREE TRIAL), Monthly $6.99, Lifetime $49.99 (BEST VALUE), "SAVE 64%"; the trial timeline; iOS button titles and price line
- ✅ Funnel doors (crown/ads/ranked/host/artist/album/songbot/login), tap, failed, bought/cancelled; premium once right after signing in (the login door)
- ✅ Every gate as iOS: ranked (one free match), host a party, artist, album, Beat Songbot, the 20 s extra stage, the rewarded second chance, daily streak restore
- 🌐 Payment is Stripe Checkout; Restore re-reads the account's premium grant; Manage is the Stripe billing portal; Terms link to /support (no Apple EULA)
- 🌐 Until the Stripe keys are set on Vercel (and always locally): "Premium on the web is coming soon" + "Get it now in the iPhone app"
- 🌐 Premium needs a profile first (a guest signs in, then the page or checkout resumes). Trial eligibility can't be known before checkout.
- 🌐 Not on the web: the 25% gift (icon quick action, leaving/comeback offers, the $22.49 plan at renewal). It needs a Stripe gift price, a subscription schedule and renewal state from the webhook (owner + Stripe dashboard work), so it isn't faked.
- 🌐 Ads are Google H5 Games Ads with Google's consent tool (instead of AdMob/UMP/ATT); no RevenueCat; no trial-tip notifications

---

## Platform differences in one table

| iPhone | Web |
|---|---|
| Apple Music / MusicKit (full tracks for subscribers, previews otherwise) | the pool's 30 s iTunes previews through Web Audio; iTunes Search API for full search |
| StoreKit 2, RevenueCat, the 25% gift | Stripe Checkout + billing portal (`api/*`, `premium_grants`); no gift |
| Haptics (UIImpact / Core Haptics) | `haptics.js`: Vibration API, iOS Safari switch tick |
| APNs push, local reminders, review prompt | none |
| Sign in with Apple / Google | Supabase OAuth (only configured providers), guests play everything |
| Scene phases (Shazam guard, background forfeit) | page visibility + window blur |
| HEVC-alpha pose clips | VP9-alpha WebM (Chromium/Firefox), HEVC-alpha MOV (Safari) |
| `setRate(atHostTime)` party start | AudioContext scheduling on the shared instant |
| SF Pro / SF Rounded / SF Symbols | Inter / Nunito 800 / hand-drawn SVG symbols |
| Save to Photos, Game Center, icon quick action, ATT | none |

## Still open (owner decisions or server work)
- The iPhone paywall is being reworked in uncommitted iOS edits (seen on the simulator 8 Oct from 22:31: colour perk tiles, a Free vs Premium table, FAQ, a "Wait, one more thing" 25%-off downsell). The web follows the committed HEAD paywall; port the new one once it is committed.
- Stripe keys/prices on Vercel (README) — until then the paywall says "coming soon".
- The gift offer on the web needs a Stripe gift price + subscription schedule + webhook renewal state.
- CORS on the `push` edge function, so web players can push iPhone friends.
- An album search endpoint, for the party Album tab (`api/itunes`).
- Optional: re-encode the MOV clips (about 15 MB less), checked in real Safari.
- Real-iPhone checks the headless runs can't do: the keyboard lift in iOS Safari, VP9/HEVC clip playback in each browser, a web↔iPhone ranked match and party.
