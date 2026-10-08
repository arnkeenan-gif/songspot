// Funnel.swift on the web: the premium funnel. How many people see the
// sheet, how many press the button, and how it ends, with the door they came
// through, so a number can answer "is the button findable" instead of a guess.
// Fire and forget into the same premium_events table the iPhone writes:
// {event, door, version, country}; Postgres fills in who it was from the
// signed-in session (the bearer), or leaves it null for a guest.
//   Events: sheet, tap, bought, cancelled, failed.
//   Doors (iOS PremiumSheet.Perk / entry): crown, ads, ranked, host, artist, album, songbot,
//   login, rewarded (tap only), gift/<reason>; a tap's door is "<door>/<plan>"
//   (e.g. "ranked/yearly").
// On localhost nothing is sent: the row is logged to the console instead, so
// testing never writes to the real table.
import { SUPABASE_URL, SUPABASE_ANON, auth } from './supabase.js';

const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const EVENTS = ['sheet', 'tap', 'bought', 'cancelled', 'failed'];
/** The web's "app version" in the row: which client it came from. */
export const WEB_VERSION = 'web';

function country() {
  try { const r = new Intl.Locale(navigator.language || 'en').maximize().region; return r ? r.toUpperCase() : null; } catch (e) { return null; }
}

export const Funnel = {
  /** Never waits, never retries, never surfaces an error. */
  log(event, door) {
    if (!EVENTS.includes(event) || !door) return;
    const row = { event, door: String(door), version: WEB_VERSION, country: country() };
    if (local) { console.info('[funnel]', row); return; }
    (async () => {
      let token = null;
      try { token = (await auth.session())?.access_token || null; } catch (e) {}
      const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Prefer: 'return=minimal' };
      if (token) headers.Authorization = 'Bearer ' + token;
      await fetch(`${SUPABASE_URL}/rest/v1/premium_events`, { method: 'POST', headers, body: JSON.stringify([row]), keepalive: true });
    })().catch(() => {});
  },
};
