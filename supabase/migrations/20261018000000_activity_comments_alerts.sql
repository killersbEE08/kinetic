-- Kinetic: product activity (activation funnel), comments on decks, and alerts for share links.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Product activity. Names, ids and small numbers only: never deck text, file names or emails.
-- Written by the API as the signed-in user (RLS) and read by the team with the service role.
-- ---------------------------------------------------------------------------
create table if not exists public.product_events (
  id         bigint generated always as identity primary key,
  user_id    text not null default public.requesting_user_id(),
  name       text not null check (name ~ '^[a-z_]{3,40}$'),
  deck_id    text check (deck_id is null or deck_id ~ '^[a-z0-9_-]{8,32}$'),
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint product_event_props_size check (pg_column_size(props) < 2000)
);
create index if not exists product_events_user on public.product_events (user_id, created_at);
create index if not exists product_events_name on public.product_events (name, created_at);
alter table public.product_events enable row level security;

drop policy if exists "product_events: insert own" on public.product_events;
create policy "product_events: insert own" on public.product_events for insert to authenticated
  with check (user_id = (select public.requesting_user_id()));
drop policy if exists "product_events: read own" on public.product_events;
create policy "product_events: read own" on public.product_events for select to authenticated
  using (user_id = (select public.requesting_user_id()));

-- Activation: presented, shared or downloaded a deck within 24 hours of signing up.
-- One row per user with the time of each funnel step. Query it with the service role
-- (SQL editor); signed-in users can't read it.
create or replace view public.activation_funnel with (security_invoker = true) as
select
  p.user_id,
  p.created_at as signed_up_at,
  min(e.created_at) filter (where e.name = 'outline_created') as outline_at,
  min(e.created_at) filter (where e.name = 'deck_created') as deck_at,
  min(e.created_at) filter (where e.name = 'deck_edited') as first_edit_at,
  min(e.created_at) filter (where e.name in ('deck_presented', 'deck_shared', 'deck_downloaded')) as first_output_at,
  coalesce(min(e.created_at) filter (where e.name in ('deck_presented', 'deck_shared', 'deck_downloaded')) <= p.created_at + interval '24 hours', false) as activated
from public.profiles p
left join public.product_events e on e.user_id = p.user_id
group by p.user_id, p.created_at;
revoke all on public.activation_funnel from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Share link options and alert bookkeeping.
-- ---------------------------------------------------------------------------
alter table public.share_links add column if not exists allow_comments boolean not null default false;
alter table public.share_links add column if not exists notify boolean not null default true;
alter table public.view_sessions add column if not exists alerted_at timestamptz;

-- ---------------------------------------------------------------------------
-- Comments. Pinned to a slide (and optionally an element). The deck owner reads and writes
-- them under RLS. People with a share link that allows comments write through the API
-- (service role), which checks the link first; their author_id is null.
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  deck_id      text not null references public.decks(id) on delete cascade,
  slide_id     text not null check (slide_id ~ '^[a-z0-9_-]{8,32}$'),
  element_id   text check (element_id is null or element_id ~ '^[a-z0-9_-]{8,32}$'),
  parent_id    uuid references public.comments(id) on delete cascade,
  link_id      text references public.share_links(id) on delete set null,
  author_id    text,
  author_name  text not null check (char_length(author_name) between 1 and 80),
  author_email text check (author_email is null or char_length(author_email) <= 200),
  body         text not null check (char_length(body) between 1 and 2000),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists comments_deck on public.comments (deck_id, created_at);
create index if not exists comments_link on public.comments (link_id, created_at) where link_id is not null;
alter table public.comments enable row level security;

drop policy if exists "comments: owner reads" on public.comments;
create policy "comments: owner reads" on public.comments for select to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = (select public.requesting_user_id())));
drop policy if exists "comments: owner writes" on public.comments;
create policy "comments: owner writes" on public.comments for insert to authenticated
  with check (
    author_id = (select public.requesting_user_id())
    and exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = (select public.requesting_user_id()))
  );
drop policy if exists "comments: owner updates" on public.comments;
create policy "comments: owner updates" on public.comments for update to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = (select public.requesting_user_id())))
  with check (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = (select public.requesting_user_id())));
drop policy if exists "comments: owner deletes" on public.comments;
create policy "comments: owner deletes" on public.comments for delete to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = (select public.requesting_user_id())));

drop trigger if exists comments_touch on public.comments;
create trigger comments_touch before update on public.comments for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Notifications (the bell). Written by the API with the service role; users read their own
-- and can only mark them read.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  user_id     text not null,
  kind        text not null check (kind in ('link_opened', 'link_viewed', 'comment')),
  deck_id     text,
  link_id     text,
  session_id  bigint,
  title       text not null check (char_length(title) <= 200),
  body        text not null default '' check (char_length(body) <= 500),
  url         text check (url is null or url ~ '^/[A-Za-z0-9/_?=&.%-]*$'),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);
create index if not exists notifications_session on public.notifications (session_id) where session_id is not null;
alter table public.notifications enable row level security;

drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own" on public.notifications for select to authenticated
  using (user_id = (select public.requesting_user_id()));
drop policy if exists "notifications: update own" on public.notifications;
create policy "notifications: update own" on public.notifications for update to authenticated
  using (user_id = (select public.requesting_user_id())) with check (user_id = (select public.requesting_user_id()));
drop policy if exists "notifications: delete own" on public.notifications;
create policy "notifications: delete own" on public.notifications for delete to authenticated
  using (user_id = (select public.requesting_user_id()));
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Keep 90 days of notifications per user.
create or replace function public.trim_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.notifications where user_id = new.user_id and created_at < now() - interval '90 days';
  return null;
end;
$$;
drop trigger if exists notifications_trim on public.notifications;
create trigger notifications_trim after insert on public.notifications for each row execute function public.trim_notifications();

-- ---------------------------------------------------------------------------
-- Alert settings on the profile: email on/off and an optional Slack incoming webhook.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists alert_email boolean not null default true;
alter table public.profiles add column if not exists alert_slack_url text;
alter table public.profiles drop constraint if exists profiles_alert_slack_url_check;
alter table public.profiles add constraint profiles_alert_slack_url_check
  check (alert_slack_url is null or alert_slack_url ~ '^https://hooks\.slack\.com/services/[A-Za-z0-9/_-]{10,200}$');
grant update (alert_email, alert_slack_url) on public.profiles to authenticated;
