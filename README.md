# songspotapp.com — the Songspot web game

Opening https://songspotapp.com goes straight into the game. No build step: static files
served by Vercel, plus a few serverless functions in `api/`.

| Path | What |
|---|---|
| `/` (`index.html`) | the game shell |
| `app/js/*`, `app/css/*` | the game (vanilla ES modules; a port of the iPhone app's SwiftUI) |
| `data/pool.json` | the song pool, copied from the iPhone app's `Resources/pool.json` |
| `/get`, `/go` | share links that forward to the App Store (unchanged) |
| `/privacy`, `/support`, `ads.txt`, `app-ads.txt`, `robots.txt`, `sitemap.xml` | unchanged pages/files |
| `api/config.js` | tells the premium sheet whether Stripe is set up |
| `api/checkout.js` | creates a Stripe Checkout Session for the signed-in (or guest) Supabase user |
| `api/stripe-webhook.js` | verifies Stripe's signature and writes/removes the row in `premium_grants` (source `stripe`) |
| `api/portal.js` | opens the Stripe billing portal (cancel / change card) |
| `api/itunes.js` | proxy for Apple's iTunes Search API (artist mode; it has no CORS) |
| `supabase/web-premium.sql` | additive SQL (already applied 26 Sep 2026): `premium_grants.expires_at`, `stripe_customers`, `my_premium()` |

Run locally: `python3 serve.py 8765` then open http://127.0.0.1:8765 (the `api/` functions only run on Vercel,
so locally the premium sheet shows "coming soon"). Localhost-only test knobs: `?premium=1`,
`?open=daily|ranked|party|profile|premium|drawer|genres|artists|faq|login`, `?demo=win|lost|offer|hits`,
`?song=<id>`, `?ads=1` (loads the ad library in test mode).
Profile/characters (localhost only): `?demoProfile=1` (a signed-in demo player with demo stats, nothing sent to
Supabase; with `&playerName=Liv`, `&demoAvatar=58`, `&demoNamed=420`, `&premium=1`), `?profilePage=stats|ranked|settings`,
`?creatorCodes=1` (show Settings > Creator code), `?picker=1` (open Edit avatar) — e.g.
`?open=profile&demoProfile=1&profilePage=ranked` or `?tab=profile&demoProfile=1`.
Every other knob (tabs, seasons, ranked, party, daily, friends, paywall) and the web ↔ iPhone gap list: `PARITY-WEB.md`.

## Premium through Stripe — what the owner has to do

Until all five variables below exist, the premium sheet says **"Premium on the web is coming soon"**
and nothing errors.

1. **Stripe dashboard → Products**: create one product "Songspot Premium" with two prices:
   - **$4.99 / month**, recurring → copy its price id (`price_…`)
   - **$14.99 one-off** → copy its price id
2. **Developers → API keys**: copy the **secret key** (`sk_live_…`; use `sk_test_…` first to try it).
3. **Developers → Webhooks → Add endpoint**: URL `https://songspotapp.com/api/stripe-webhook`, events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`, `charge.refunded`. Copy the endpoint's **signing secret** (`whsec_…`).
4. **Settings → Billing → Customer portal**: turn it on (allow cancelling subscriptions and updating the card).
5. **Supabase → Project settings → API**: copy the **service_role** key.
6. **Vercel → project `songspot` → Settings → Environment Variables** (Production, and Preview if you want to test there):

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` (or `sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from step 3 |
| `STRIPE_PRICE_MONTHLY` | the $4.99/month price id |
| `STRIPE_PRICE_LIFETIME` | the $14.99 one-off price id |
| `SUPABASE_SERVICE_ROLE_KEY` | the Supabase service_role key (server only — never in the browser) |
| `PREMIUM_LABEL_MONTHLY` / `PREMIUM_LABEL_LIFETIME` | optional, the prices shown on the sheet (default `$4.99` / `$14.99`) |

Then redeploy. How it works: premium on the web = an active row in `premium_grants` for the account
(`my_premium()` RPC; monthly rows expire 3 days after the paid period so a missed webhook can never leave
it on for ever; lifetime rows never expire). A grant from another source (App Store, gift) is never
overwritten or removed by the webhook.

## Sign-in

Supabase Auth. Guests can play everything free without signing in; boards and checkout use an anonymous
Supabase session. **Google and Apple sign-in on the web need a web OAuth client configured in Supabase**
(Authentication → Providers): today both answer "missing OAuth secret", so the web hides those buttons.
- Google: Google Cloud → Credentials → OAuth client ID of type **Web application**, authorised redirect URI
  `https://ytqjphkydvzpfecbehko.supabase.co/auth/v1/callback`; paste the client id + secret into Supabase's Google
  provider (keep the iOS client id in "Authorized Client IDs").
- Apple: a Services ID + key for Sign in with Apple on the web, pasted into Supabase's Apple provider.
- Supabase → Authentication → URL configuration: Site URL `https://songspotapp.com`, redirect allow-list
  `https://songspotapp.com/**` (and `https://*.vercel.app/**` for previews). Enable **manual identity linking**
  so a guest who signs in keeps the same account (and anything bought on it).

## Ads

Google H5 Games Ads (`adBreak`/`adConfig`) with publisher `ca-pub-2183185085536179`: an interstitial every
five finished rounds (never before a player's tenth round), and a rewarded "5 more seconds" on a lost round.
Premium players never load the ad script. It fails silently until AdSense approves the site for H5 games
(AdSense → Sites → songspotapp.com, then apply for the H5 Games Ads programme). No ad is shown while a song plays.
