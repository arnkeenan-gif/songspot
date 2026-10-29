-- A re-sent ranked result must not count twice, 29 Oct 2026. Since the outage
-- fix the web (and iOS) keep a result the server gave no answer on and send it
-- again 30 s on; a row the server completed after the client gave up at 10 s
-- would then land twice. ranked_results has no client key, and the pace rule
-- (no second row within 30 s) only catches a resend that goes out fast.
-- Additive: the pace trigger learns one more refusal; nothing else changes.
-- Run from the linked songspot-stats checkout:
--   npx --yes supabase db query --linked -f ~/Developer/songspot/supabase/ranked-results-resend-2026-10-29.sql

-- Same player, same points, score and outcome within two minutes: a legitimate
-- second match cannot finish that fast with identical numbers, so it is the
-- same match sent again. check_violation = 400, which every outbox drops.
create or replace function public.ranked_results_pace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('ranked_results'), hashtext(new.user_id::text));
  if exists (select 1 from ranked_results r
             where r.user_id = new.user_id and r.created_at > now() - interval '30 seconds') then
    raise exception 'too soon after the last match' using errcode = 'check_violation';
  end if;
  if exists (select 1 from ranked_results r
             where r.user_id = new.user_id and r.created_at > now() - interval '2 minutes'
               and r.points = new.points and r.score = new.score and r.won = new.won) then
    raise exception 'this match was already saved' using errcode = 'check_violation';
  end if;
  if (select count(*) from ranked_results r
      where r.user_id = new.user_id and r.created_at >= date_trunc('day', now())) >= 200 then
    raise exception 'too many matches today' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists ranked_results_pace on public.ranked_results;
create trigger ranked_results_pace
  before insert on public.ranked_results
  for each row execute function public.ranked_results_pace();
