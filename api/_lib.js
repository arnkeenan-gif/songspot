// Shared by the serverless functions. No dependencies: Stripe and Supabase
// are plain HTTPS APIs, and the webhook signature is an HMAC we check here.
import crypto from 'node:crypto';

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ytqjphkydvzpfecbehko.supabase.co';
export const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_peO3Uwcw4z_nwGDZ2iRE8g_pE0uGY0X';
const env = k => (process.env[k] || '').trim();

/** Everything the paid path needs. Missing any of it = "coming soon". */
export function stripeReady() {
  return !!(env('STRIPE_SECRET_KEY') && env('STRIPE_WEBHOOK_SECRET') && env('STRIPE_PRICE_MONTHLY') && env('STRIPE_PRICE_LIFETIME') && env('SUPABASE_SERVICE_ROLE_KEY'));
}
export const prices = () => ({ monthly: env('STRIPE_PRICE_MONTHLY'), lifetime: env('STRIPE_PRICE_LIFETIME') });

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** The Supabase user behind a bearer token, or null. */
export async function userFrom(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

/** Stripe's REST API with form-encoded bodies (nested keys as a[b]=c). */
export async function stripe(method, path, params) {
  const body = params ? new URLSearchParams(flatten(params)).toString() : undefined;
  const url = `https://api.stripe.com/v1/${path}` + (method === 'GET' && body ? `?${body}` : '');
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2025-03-31.basil' },
    body: method === 'GET' ? undefined : body,
  });
  const d = await r.json();
  if (!r.ok) { const e = new Error(d?.error?.message || `stripe ${r.status}`); e.status = r.status; throw e; }
  return d;
}
function flatten(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' ? flatten(x, `${key}[${i}]`, out) : out.push([`${key}[${i}]`, String(x)])));
    else if (typeof v === 'object') flatten(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}

/** Supabase REST as the service role (server only; never sent to a browser). */
export async function db(method, path, body, prefer) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    // A legacy service_role key is a JWT and goes in both headers; a new sb_secret_ key goes in apikey only.
    headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

export async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}
export async function readJSON(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse((await readRaw(req)).toString('utf8') || '{}'); } catch (e) { return {}; }
}

/** Stripe-Signature: t=…,v1=… — HMAC-SHA256 of `${t}.${payload}` with the endpoint secret, within five minutes. */
export function verifyStripe(raw, header, secret, tolerance = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(p => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; }).filter(([k]) => k));
  const t = parts.t; const sigs = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > tolerance) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.`).update(raw).digest('hex');
  return sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

/** The allowed return address: our own origin (production or a preview), never someone else's. */
export function safeReturn(req, wanted) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'songspotapp.com';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;
  try { const u = new URL(wanted || '/', origin); if (u.origin === origin) return u.origin + u.pathname; } catch (e) {}
  return origin + '/';
}
