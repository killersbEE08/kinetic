-- Kinetic: share links with view analytics, and brand kits.

-- ---------------------------------------------------------------------------
-- Share links. Viewers see a snapshot taken when the link was created or last updated,
-- never the live deck. The owner manages links under RLS; the public viewer goes through
-- the API (service role), which checks the link id, password and expiry itself.
-- ---------------------------------------------------------------------------
create table if not exists public.share_links (
  id                text primary key check (id ~ '^[A-Za-z0-9_-]{16,40}$'),
  deck_id           text not null references public.decks(id) on delete cascade,
  owner_id          text not null default public.requesting_user_id(),
  name              text not null default '' check (char_length(name) <= 80),
  snapshot          jsonb not null,
  snapshot_version  integer not null,
  password_hash     text,
  allow_download    boolean not null default false,
  expires_at        timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint share_snapshot_size check (pg_column_size(snapshot) < 2000000)
);
create index if not exists share_links_owner on public.share_links (owner_id, created_at desc);
create index if not exists share_links_deck on public.share_links (deck_id);
alter table public.share_links enable row level security;

create policy "share_links: read own" on public.share_links for select to authenticated
  using (owner_id = (select public.requesting_user_id()));
create policy "share_links: insert own" on public.share_links for insert to authenticated
  with check (
    owner_id = (select public.requesting_user_id())
    and exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = (select public.requesting_user_id()))
  );
create policy "share_links: update own" on public.share_links for update to authenticated
  using (owner_id = (select public.requesting_user_id())) with check (owner_id = (select public.requesting_user_id()));
create policy "share_links: delete own" on public.share_links for delete to authenticated
  using (owner_id = (select public.requesting_user_id()));

drop trigger if exists share_links_touch on public.share_links;
create trigger share_links_touch before update on public.share_links for each row execute function public.touch_updated_at();

-- Free plan: one active link at a time (docs/11 §5).
create or replace function public.enforce_share_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if public.effective_plan(new.owner_id) = 'free' then
    select count(*) into n from public.share_links
      where owner_id = new.owner_id and revoked_at is null and (expires_at is null or expires_at > now());
    if n >= 1 then
      raise exception 'plan_limit: The Free plan includes 1 active share link. Turn off the old one or upgrade to Pro for unlimited links.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists share_links_limit on public.share_links;
create trigger share_links_limit before insert on public.share_links for each row execute function public.enforce_share_limit();

-- ---------------------------------------------------------------------------
-- Views. Written only by the API (service role). No raw IP addresses are stored: viewer_hash is
-- a daily-rotating hash, enough to count unique viewers without tracking people across days.
-- ---------------------------------------------------------------------------
create table if not exists public.view_sessions (
  id            bigint generated always as identity primary key,
  link_id       text not null references public.share_links(id) on delete cascade,
  viewer_hash   text not null,
  viewer_email  text,
  country       text,
  device        text,
  slides_seen   integer not null default 0,
  total_ms      integer not null default 0,
  started_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index if not exists view_sessions_link on public.view_sessions (link_id, started_at desc);
alter table public.view_sessions enable row level security;
create policy "view_sessions: owner reads" on public.view_sessions for select to authenticated
  using (exists (select 1 from public.share_links l where l.id = link_id and l.owner_id = (select public.requesting_user_id())));

create table if not exists public.view_slide_time (
  session_id  bigint not null references public.view_sessions(id) on delete cascade,
  slide_index integer not null check (slide_index between 0 and 199),
  ms          integer not null default 0 check (ms >= 0),
  primary key (session_id, slide_index)
);
alter table public.view_slide_time enable row level security;
create policy "view_slide_time: owner reads" on public.view_slide_time for select to authenticated
  using (exists (
    select 1 from public.view_sessions s join public.share_links l on l.id = s.link_id
    where s.id = session_id and l.owner_id = (select public.requesting_user_id())
  ));

-- Adds time to a session (called by the API with the service role). Caps each beat at 2 minutes
-- per slide so a tab left open doesn't inflate the numbers.
create or replace function public.record_view_time(p_session bigint, p_slide integer, p_ms integer)
returns void language plpgsql security definer set search_path = public as $$
declare add_ms integer := least(greatest(p_ms, 0), 120000);
begin
  insert into public.view_slide_time (session_id, slide_index, ms) values (p_session, p_slide, add_ms)
    on conflict (session_id, slide_index) do update set ms = public.view_slide_time.ms + excluded.ms;
  update public.view_sessions set
    total_ms = total_ms + add_ms,
    slides_seen = (select count(*) from public.view_slide_time t where t.session_id = p_session and t.ms >= 1000),
    last_seen_at = now()
  where id = p_session;
end;
$$;
revoke all on function public.record_view_time(bigint, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Brand kits: logo, colours, heading font, pattern. Applied to decks as `brand`.
-- ---------------------------------------------------------------------------
create table if not exists public.brand_kits (
  id          text primary key check (id ~ '^[a-z0-9_-]{8,32}$'),
  owner_id    text not null default public.requesting_user_id(),
  kit         jsonb not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint brand_kit_size check (pg_column_size(kit) < 20000)
);
create index if not exists brand_kits_owner on public.brand_kits (owner_id, created_at);
alter table public.brand_kits enable row level security;
create policy "brand_kits: read own" on public.brand_kits for select to authenticated using (owner_id = (select public.requesting_user_id()));
create policy "brand_kits: insert own" on public.brand_kits for insert to authenticated with check (owner_id = (select public.requesting_user_id()));
create policy "brand_kits: update own" on public.brand_kits for update to authenticated using (owner_id = (select public.requesting_user_id())) with check (owner_id = (select public.requesting_user_id()));
create policy "brand_kits: delete own" on public.brand_kits for delete to authenticated using (owner_id = (select public.requesting_user_id()));
drop trigger if exists brand_kits_touch on public.brand_kits;
create trigger brand_kits_touch before update on public.brand_kits for each row execute function public.touch_updated_at();

-- Free: 1 kit, Pro: 3, Team: unlimited (docs/11 §5).
create or replace function public.enforce_brand_kit_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer; p text; lim integer;
begin
  p := public.effective_plan(new.owner_id);
  lim := case p when 'team' then 1000 when 'pro' then 3 else 1 end;
  select count(*) into n from public.brand_kits where owner_id = new.owner_id;
  if n >= lim then
    raise exception 'plan_limit: Your plan includes % brand kit%. Delete one or upgrade for more.', lim, case when lim = 1 then '' else 's' end using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists brand_kits_limit on public.brand_kits;
create trigger brand_kits_limit before insert on public.brand_kits for each row execute function public.enforce_brand_kit_limit();
