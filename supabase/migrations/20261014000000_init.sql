-- Kinetic: initial schema for Supabase (Postgres) with Clerk as third-party auth.
-- Clerk user ids look like "user_2abc…", so every owner column is TEXT, filled from the JWT `sub` claim.
-- Run with:  supabase db push   (or paste into the SQL editor)

create extension if not exists pgcrypto;

-- Current Clerk user id from the verified session token.
create or replace function public.requesting_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::text
$$;

-- ---------------------------------------------------------------------------
-- Profiles: one row per user. Plan is written only by the Dodo webhook (service role).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id               text primary key,
  email                 text,
  plan                  text not null default 'free' check (plan in ('free', 'pro', 'team')),
  plan_status           text not null default 'none',
  dodo_customer_id      text,
  dodo_subscription_id  text,
  current_period_end    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (user_id = (select public.requesting_user_id()));

create policy "profiles: create own (free plan only)"
  on public.profiles for insert to authenticated
  with check (user_id = (select public.requesting_user_id()) and plan = 'free' and dodo_subscription_id is null);

-- Users may update only their email; plan columns are protected by column privileges below.
create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (user_id = (select public.requesting_user_id()))
  with check (user_id = (select public.requesting_user_id()));

revoke update on public.profiles from authenticated;
grant update (email, updated_at) on public.profiles to authenticated;

-- The plan a user can use right now. A cancelled subscription keeps its plan until the paid
-- period ends; on_hold/expired/failed are already written as 'free' by the webhook.
create or replace function public.effective_plan(p_user text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when p.plan = 'free' then 'free'
      when p.plan_status = 'cancelled' and coalesce(p.current_period_end, now()) <= now() then 'free'
      else p.plan
    end
    from public.profiles p where p.user_id = p_user
  ), 'free')
$$;

revoke all on function public.effective_plan(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Decks: the Deck Document lives in `doc` (JSONB). `version` enables optimistic concurrency.
-- ---------------------------------------------------------------------------
create table if not exists public.decks (
  id          text primary key check (id ~ '^[a-z0-9_-]{8,32}$'),
  owner_id    text not null default public.requesting_user_id(),
  title       text not null default 'Untitled deck' check (char_length(title) <= 200),
  theme_id    text not null default 'mono',
  doc         jsonb not null,
  version     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint deck_doc_size check (pg_column_size(doc) < 2000000)
);

create index if not exists decks_owner_updated on public.decks (owner_id, updated_at desc) where deleted_at is null;

alter table public.decks enable row level security;

create policy "decks: read own"
  on public.decks for select to authenticated
  using (owner_id = (select public.requesting_user_id()));

create policy "decks: insert own"
  on public.decks for insert to authenticated
  with check (owner_id = (select public.requesting_user_id()));

create policy "decks: update own"
  on public.decks for update to authenticated
  using (owner_id = (select public.requesting_user_id()))
  with check (owner_id = (select public.requesting_user_id()));

create policy "decks: delete own"
  on public.decks for delete to authenticated
  using (owner_id = (select public.requesting_user_id()));

-- Free plan: at most 3 decks (PRD §11). Enforced in the database so the API can't be bypassed.
create or replace function public.enforce_deck_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_plan text;
  deck_count integer;
begin
  user_plan := public.effective_plan(new.owner_id);
  if user_plan = 'free' then
    select count(*) into deck_count from public.decks where owner_id = new.owner_id and deleted_at is null;
    if deck_count >= 3 then
      raise exception 'plan_limit: The Free plan includes 3 decks. Upgrade to Pro for unlimited decks.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists decks_limit on public.decks;
create trigger decks_limit before insert on public.decks
  for each row execute function public.enforce_deck_limit();

-- ---------------------------------------------------------------------------
-- Version history: every committed patch (user or AI) is stored for undo across sessions.
-- ---------------------------------------------------------------------------
create table if not exists public.deck_versions (
  id           bigint generated always as identity primary key,
  deck_id      text not null references public.decks(id) on delete cascade,
  version      integer not null,
  patch        jsonb not null,
  author_type  text not null check (author_type in ('user', 'ai')),
  author_id    text not null default public.requesting_user_id(),
  created_at   timestamptz not null default now()
);

create index if not exists deck_versions_deck on public.deck_versions (deck_id, version desc);

alter table public.deck_versions enable row level security;

create policy "deck_versions: read own"
  on public.deck_versions for select to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = (select public.requesting_user_id())));

create policy "deck_versions: insert own"
  on public.deck_versions for insert to authenticated
  with check (
    author_id = (select public.requesting_user_id())
    and exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = (select public.requesting_user_id()))
  );

-- ---------------------------------------------------------------------------
-- AI usage + monthly credits (docs/05 §4: Free 100, Pro 2,000, Team 4,000).
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id          bigint generated always as identity primary key,
  user_id     text not null,
  task        text not null,
  model       text not null,
  credits     integer not null check (credits > 0),
  created_at  timestamptz not null default now()
);

create index if not exists ai_usage_user_month on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

create policy "ai_usage: read own"
  on public.ai_usage for select to authenticated
  using (user_id = (select public.requesting_user_id()));
-- No insert policy: rows are written only through consume_ai_credits() below.

create or replace function public.monthly_credit_limit(p_plan text)
returns integer language sql immutable as $$
  select case p_plan when 'pro' then 2000 when 'team' then 4000 else 100 end
$$;

-- Atomically checks the monthly budget and records usage. Returns remaining credits.
create or replace function public.consume_ai_credits(p_task text, p_model text, p_credits integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text := public.requesting_user_id();
  user_plan text;
  used integer;
  lim integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_credits < 1 or p_credits > 50 then
    raise exception 'invalid_credits';
  end if;

  -- Serialize per user so two parallel requests can't both pass the check.
  perform pg_advisory_xact_lock(hashtext(uid));

  user_plan := public.effective_plan(uid);
  lim := public.monthly_credit_limit(user_plan);
  select coalesce(sum(credits), 0) into used
    from public.ai_usage
    where user_id = uid and created_at >= date_trunc('month', now());

  if used + p_credits > lim then
    raise exception 'credit_limit: You have used this month''s AI credits (% of %).', used, lim
      using errcode = 'P0001';
  end if;

  insert into public.ai_usage (user_id, task, model, credits) values (uid, left(p_task, 32), left(p_model, 64), p_credits);
  return lim - used - p_credits;
end;
$$;

revoke all on function public.consume_ai_credits(text, text, integer) from public, anon;
grant execute on function public.consume_ai_credits(text, text, integer) to authenticated;

create or replace function public.ai_credits_remaining()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select public.monthly_credit_limit(public.effective_plan(public.requesting_user_id()))
       - coalesce((select sum(credits) from public.ai_usage
                   where user_id = public.requesting_user_id() and created_at >= date_trunc('month', now())), 0)::integer
$$;

grant execute on function public.ai_credits_remaining() to authenticated;

-- ---------------------------------------------------------------------------
-- Payment webhooks: idempotency log (written by the service role only; no policies = no client access).
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_events (
  id           text primary key,          -- `webhook-id` header from Dodo Payments
  type         text not null,
  received_at  timestamptz not null default now(),
  payload      jsonb not null
);

alter table public.webhook_events enable row level security;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists decks_touch on public.decks;
create trigger decks_touch before update on public.decks for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();


-- Effective plan for the signed-in user (used by /api/me).
create or replace function public.my_plan()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.effective_plan(public.requesting_user_id())
$$;

revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;
