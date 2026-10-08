// FriendBell.swift on the web: a doorbell between friends' devices. Every
// signed-in player sits on a Realtime channel of their own, bell-<user id>;
// whoever sends them a friend request, an answer or a 1v1 rings it, and the
// page fetches what is new at once instead of at the next 15-second beat.
// Nothing travels on it but the ring: what changed still comes from the
// server, so a ring from a stranger costs one fetch and nothing else. The
// database rings it too (bell-from-db-2026-10-02.sql: triggers on friendships
// and challenges send {t:'ring', from:'server'}), so the web hears the
// iPhone's rings and the iPhone hears the web's.
//
// The wire is the iPhone's RankedLine: topic realtime:bell-<id lowercased>,
// broadcast event "ranked", payload {t:"ring", from}, a presence seat keyed by
// the user id (a random one when ringing someone else's bell).
import { supabase } from './supabase.js';

const topic = id => 'bell-' + String(id).toLowerCase();
/** A RankedSeat with nothing in it but the id, as the iPhone sits down. */
const seat = id => ({ id, name: '', rating: 0, rp: 0, face: 0, form: [], at: Date.now() / 1000 });
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'w' + Math.random().toString(36).slice(2) + Date.now().toString(36));

/** Join `name` with presence key `key`; resolves with the channel once subscribed, rejects otherwise. */
function join(name, key, onRing) {
  return new Promise((resolve, reject) => {
    const ch = supabase.channel(name, { config: { broadcast: { self: false, ack: false }, presence: { key }, private: false } });
    if (onRing) ch.on('broadcast', { event: 'ranked' }, ({ payload }) => { if (payload && payload.t === 'ring') onRing(payload); });
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; supabase.removeChannel(ch).catch(() => {}); reject(new Error('timeout')); } }, 10000);
    ch.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        try { await ch.track(seat(key)); } catch (e) {}
        if (!settled) { settled = true; clearTimeout(timer); resolve(ch); }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (!settled) { settled = true; clearTimeout(timer); supabase.removeChannel(ch).catch(() => {}); reject(new Error(status)); }
        else if (ch === bellLine) bellDropped(ch);
      }
    });
  });
}

let bellLine = null;
function bellDropped(ch) { if (bellLine === ch) { bellLine = null; FriendBell._owner = null; } }

export const FriendBell = {
  /** Someone rang (set by Friends). */
  onRing: null,
  _owner: null,
  _joining: false,
  /** Bumped by stop(): a join still on its way when the bell was stopped (signed out, tab hidden) leaves again. */
  _generation: 0,

  get listening() { return !!bellLine; },

  /** Sit on `userID`'s own channel. Safe to call again and again: nothing happens while already listening as them. */
  async listen(userID) {
    if (!userID || (this._owner === userID && bellLine) || this._joining) return;
    this._joining = true;
    try {
      await this.stop();
      const mine = this._generation;
      let ch;
      try { ch = await join(topic(userID), String(userID).toLowerCase(), () => this.onRing && this.onRing()); }
      catch (e) { return; }
      if (this._generation !== mine) { supabase.removeChannel(ch).catch(() => {}); return; }
      bellLine = ch; this._owner = userID;
    } finally { this._joining = false; }
  },

  async stop() {
    this._generation++;
    const ch = bellLine; bellLine = null; this._owner = null;
    if (ch) { try { await ch.untrack(); } catch (e) {} try { await supabase.removeChannel(ch); } catch (e) {} }
  },

  /** Ring `userID`'s bell: join their channel, say so, leave. Never for Songbot. */
  async ring(userID, from) {
    if (!userID || String(userID).startsWith('bot-') || !from) return;
    const name = topic(userID);
    // Someone else's bell this page is already on (two rings in a row, or our own channel): one ring is enough.
    if (supabase.getChannels().some(c => c.topic === 'realtime:' + name)) {
      const c = supabase.getChannels().find(c => c.topic === 'realtime:' + name);
      try { await c.send({ type: 'broadcast', event: 'ranked', payload: { t: 'ring', from } }); } catch (e) {}
      return;
    }
    let ch = null;
    try {
      ch = await join(name, uuid());
      await ch.send({ type: 'broadcast', event: 'ranked', payload: { t: 'ring', from } });
      // Long enough for the ring to leave before the line closes.
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {}
    if (ch) { try { await supabase.removeChannel(ch); } catch (e) {} }
  },
};
