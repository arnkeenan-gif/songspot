-- Premium on the web (Stripe), 26 Sep 2026. Additive only: one new column on
-- premium_grants, one new table, one new function. Nothing existing changes.
-- Run from the linked songspot-stats checkout:
--   npx --yes supabase db query --linked -f ~/Developer/songspot/supabase/web-premium.sql

-- 1. A grant can end. Stripe monthly grants carry the paid period (+3 days'
--    grace); App Store, gift and lifetime grants leave it empty = for ever.
alter table public.premium_grants add column if not exists expires_at timestamptz;

-- 2. Which Stripe customer belongs to which player, for the billing portal
--    and for webhooks that only name the customer. Server (service role) only:
--    RLS on and no policies, so the app key can neither read nor write it.
create table if not exists public.stripe_customers (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  customer_id     text not null unique,
  subscription_id text,
  status          text,
  updated_at      timestamptz not null default now()
);
alter table public.stripe_customers enable row level security;
revoke all on public.stripe_customers from anon, authenticated;

-- 3. What the web asks after signing in: am I premium right now?
create or replace function public.my_premium()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('premium', true, 'source', source, 'expires_at', expires_at)
    from public.premium_grants
    where user_id = auth.uid() and (expires_at is null or expires_at > now())
    limit 1), jsonb_build_object('premium', false));
$$;
revoke execute on function public.my_premium() from public, anon;
grant execute on function public.my_premium() to authenticated;
