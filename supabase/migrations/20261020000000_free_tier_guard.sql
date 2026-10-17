-- Kinetic: free-tier abuse guard. Free AI credits are worth little to someone making accounts
-- with throwaway emails, and the total cost of the free tier is capped per day.
--
--  1. Starter credits: new free accounts get `starter_credits` until they are `unlock_hours`
--     old or have shared a deck. Then the full monthly 100.
--  2. Disposable email domains get no free AI credits (the offline engine still works).
--  3. Many free accounts from one network (more than `network_soft_limit` in 30 days) wait
--     3x longer for the full allowance, and sharing doesn't unlock it early. Soft on purpose:
--     offices, colleges and mobile carriers put many real people behind one address.
--  4. Daily cap on credits spent by ALL free users together. When it is reached, free users
--     get the offline engine until midnight UTC; paid users are never affected.
--
-- Tune with: update free_tier_config set daily_credit_cap = 30000 where id = 1;
-- Safe to run more than once.

create table if not exists public.free_tier_config (
  id                 integer primary key default 1 check (id = 1),
  daily_credit_cap   integer not null default 20000 check (daily_credit_cap >= 0),
  starter_credits    integer not null default 40 check (starter_credits >= 0),
  unlock_hours       integer not null default 48 check (unlock_hours >= 0),
  network_soft_limit integer not null default 3 check (network_soft_limit >= 1),
  updated_at         timestamptz not null default now()
);
insert into public.free_tier_config (id) values (1) on conflict (id) do nothing;
alter table public.free_tier_config enable row level security; -- no policies: service role only

-- Signals collected by the API (service role) on a user's first AI request. The network is a
-- keyed hash of the /24 (IPv4) or /48 (IPv6) prefix, never the address, and is cleared after 30 days.
create table if not exists public.free_signals (
  user_id      text primary key,
  email_domain text,
  disposable   boolean not null default false,
  network_hash text,
  created_at   timestamptz not null default now()
);
create index if not exists free_signals_network on public.free_signals (network_hash, created_at) where network_hash is not null;
alter table public.free_signals enable row level security; -- no policies: service role only

create or replace function public.trim_free_signals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.free_signals set network_hash = null where network_hash is not null and created_at < now() - interval '30 days';
  return null;
end;
$$;
drop trigger if exists free_signals_trim on public.free_signals;
create trigger free_signals_trim after insert on public.free_signals for each statement execute function public.trim_free_signals();

-- Which plan each charge was made under, for the daily free cap.
alter table public.ai_usage add column if not exists plan text;
create index if not exists ai_usage_plan_day on public.ai_usage (plan, created_at) where plan = 'free';

-- Monthly credit allowance for a user right now, plus why (for the UI).
create or replace function public.credit_status_for(p_user text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p text := public.effective_plan(p_user);
  full_limit integer := public.monthly_credit_limit(p);
  cfg public.free_tier_config;
  sig public.free_signals;
  created timestamptz;
  crowded boolean := false;
  shared boolean := false;
  unlock_at timestamptz;
begin
  if p <> 'free' then
    return jsonb_build_object('plan', p, 'limit', full_limit, 'full', full_limit, 'reason', null, 'unlockAt', null);
  end if;
  select * into cfg from public.free_tier_config where id = 1;
  if not found then
    return jsonb_build_object('plan', p, 'limit', full_limit, 'full', full_limit, 'reason', null, 'unlockAt', null);
  end if;
  select * into sig from public.free_signals where user_id = p_user;
  if found and sig.disposable then
    return jsonb_build_object('plan', p, 'limit', 0, 'full', full_limit, 'reason', 'disposable', 'unlockAt', null);
  end if;
  if found and sig.network_hash is not null then
    select count(*) > cfg.network_soft_limit into crowded from public.free_signals s
      where s.network_hash = sig.network_hash and s.user_id <> p_user and s.created_at > now() - interval '30 days';
  end if;
  select created_at into created from public.profiles where user_id = p_user;
  unlock_at := coalesce(created, now()) + make_interval(hours => cfg.unlock_hours * (case when crowded then 3 else 1 end));
  if now() >= unlock_at then
    return jsonb_build_object('plan', p, 'limit', full_limit, 'full', full_limit, 'reason', null, 'unlockAt', null);
  end if;
  if not crowded then
    select exists (select 1 from public.share_links where owner_id = p_user) into shared;
    if shared then
      return jsonb_build_object('plan', p, 'limit', full_limit, 'full', full_limit, 'reason', null, 'unlockAt', null);
    end if;
  end if;
  return jsonb_build_object('plan', p, 'limit', least(cfg.starter_credits, full_limit), 'full', full_limit, 'reason', case when crowded then 'crowded' else 'starter' end, 'unlockAt', unlock_at);
end;
$$;
revoke all on function public.credit_status_for(text) from public, anon, authenticated;

-- The signed-in user's credit status and what's left this month.
create or replace function public.my_credit_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select public.credit_status_for(public.requesting_user_id())
    || jsonb_build_object('used', coalesce((select sum(credits) from public.ai_usage
         where user_id = public.requesting_user_id() and created_at >= date_trunc('month', now())), 0)::integer)
$$;
revoke all on function public.my_credit_status() from public, anon;
grant execute on function public.my_credit_status() to authenticated;

-- Keep the old function consistent with the new limits.
create or replace function public.ai_credits_remaining()
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0, (public.credit_status_for(public.requesting_user_id()) ->> 'limit')::integer
       - coalesce((select sum(credits) from public.ai_usage
                   where user_id = public.requesting_user_id() and created_at >= date_trunc('month', now())), 0)::integer)
$$;

-- Spends credits atomically. Replaces consume_ai_credits for new deploys (that one stays for
-- older app versions). Free users get `p_model_free` when it is set. Raises:
--   credit_limit: …   this user's allowance is used up
--   free_capacity: …  the free tier's daily total is used up (the API falls back to offline)
--   rate_limit: …     more than 20 AI calls in a minute
create or replace function public.spend_ai_credits(p_task text, p_credits integer, p_model text, p_model_free text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid text := public.requesting_user_id();
  st jsonb;
  p text;
  lim integer;
  used integer;
  recent integer;
  cap integer;
  today integer := 0;
  model text := left(p_model, 64);
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_credits < 1 or p_credits > 50 then raise exception 'invalid_credits'; end if;

  perform pg_advisory_xact_lock(hashtext(uid));

  select count(*) into recent from public.ai_usage where user_id = uid and created_at > now() - interval '60 seconds';
  if recent >= 20 then
    raise exception 'rate_limit: Too many AI requests in a short time. Wait a minute and try again.' using errcode = 'P0001';
  end if;

  st := public.credit_status_for(uid);
  p := st ->> 'plan';
  lim := (st ->> 'limit')::integer;
  select coalesce(sum(credits), 0) into used from public.ai_usage where user_id = uid and created_at >= date_trunc('month', now());

  if p = 'free' and st ->> 'reason' = 'disposable' then
    raise exception 'credit_limit: Free AI credits need a permanent email address. Sign up with your work or personal email, or upgrade.' using errcode = 'P0001';
  end if;
  if used + p_credits > lim then
    if st ->> 'unlockAt' is not null then
      raise exception 'credit_limit: This needs % credits and % of your % starter credits are left. You get the full % on % (or as soon as you share a deck), or upgrade now.', p_credits, greatest(lim - used, 0), lim, st ->> 'full', to_char((st ->> 'unlockAt')::timestamptz, 'DD Mon') using errcode = 'P0001';
    end if;
    raise exception 'credit_limit: You have used this month''s AI credits (% of %).', used, lim using errcode = 'P0001';
  end if;

  if p = 'free' then
    select daily_credit_cap into cap from public.free_tier_config where id = 1;
    if cap is not null then
      select coalesce(sum(credits), 0) into today from public.ai_usage where plan = 'free' and created_at >= date_trunc('day', now());
      if today + p_credits > cap then
        raise exception 'free_capacity: Free AI is at capacity today.' using errcode = 'P0001';
      end if;
    end if;
    if coalesce(p_model_free, '') <> '' then model := left(p_model_free, 64); end if;
  end if;

  insert into public.ai_usage (user_id, task, model, credits, plan) values (uid, left(p_task, 32), model, p_credits, p);
  return jsonb_build_object('remaining', lim - used - p_credits, 'plan', p, 'model', model, 'freeToday', case when p = 'free' then today + p_credits end, 'freeCap', cap);
end;
$$;
revoke all on function public.spend_ai_credits(text, integer, text, text) from public, anon;
grant execute on function public.spend_ai_credits(text, integer, text, text) to authenticated;

-- Daily check for the team (SQL editor, service role). Not readable by users.
create or replace view public.free_tier_watch with (security_invoker = true) as
select
  (select coalesce(sum(credits), 0) from public.ai_usage where plan = 'free' and created_at >= date_trunc('day', now())) as free_credits_today,
  (select daily_credit_cap from public.free_tier_config where id = 1) as daily_cap,
  (select count(*) from public.profiles where created_at > now() - interval '24 hours') as signups_24h,
  (select count(*) from public.free_signals where disposable and created_at > now() - interval '7 days') as disposable_7d,
  (select count(*) from (select network_hash from public.free_signals where network_hash is not null and created_at > now() - interval '30 days'
     group by network_hash having count(*) > (select network_soft_limit from public.free_tier_config where id = 1)) n) as crowded_networks_30d;
revoke all on public.free_tier_watch from public, anon, authenticated;
