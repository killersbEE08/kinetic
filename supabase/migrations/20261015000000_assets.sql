-- Kinetic: photo library. File bytes live in Cloudflare R2 (key u/<user>/<asset id>);
-- this table holds metadata and enforces per-plan storage limits with RLS.

create table if not exists public.assets (
  id          text primary key check (id ~ '^[a-z0-9_-]{8,32}$'),
  owner_id    text not null default public.requesting_user_id(),
  name        text not null check (char_length(name) between 1 and 120),
  alt         text not null default '' check (char_length(alt) <= 250),
  mime        text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  bytes       integer not null check (bytes > 0 and bytes <= 5242880),
  width       integer not null check (width between 1 and 10000),
  height      integer not null check (height between 1 and 10000),
  created_at  timestamptz not null default now()
);

create index if not exists assets_owner_created on public.assets (owner_id, created_at desc);

alter table public.assets enable row level security;

create policy "assets: read own"
  on public.assets for select to authenticated
  using (owner_id = (select public.requesting_user_id()));

create policy "assets: insert own"
  on public.assets for insert to authenticated
  with check (owner_id = (select public.requesting_user_id()));

create policy "assets: delete own"
  on public.assets for delete to authenticated
  using (owner_id = (select public.requesting_user_id()));

create policy "assets: update own"
  on public.assets for update to authenticated
  using (owner_id = (select public.requesting_user_id()))
  with check (owner_id = (select public.requesting_user_id()));

-- Only the description fields can change after upload.
revoke update on public.assets from authenticated;
grant update (name, alt) on public.assets to authenticated;

-- Storage per plan: Free 100 MB, Pro 5 GB, Team 20 GB.
create or replace function public.asset_storage_limit(p_plan text)
returns bigint language sql immutable as $$
  select case p_plan when 'pro' then 5368709120 when 'team' then 21474836480 else 104857600 end::bigint
$$;

create or replace function public.enforce_asset_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  used bigint;
  lim bigint;
begin
  perform pg_advisory_xact_lock(hashtext('assets:' || new.owner_id));
  lim := public.asset_storage_limit(public.effective_plan(new.owner_id));
  select coalesce(sum(bytes), 0) into used from public.assets where owner_id = new.owner_id;
  if used + new.bytes > lim then
    raise exception 'plan_limit: Your photo library is full (% MB of % MB). Delete some photos or upgrade for more space.', round(used / 1048576.0), round(lim / 1048576.0)
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists assets_quota on public.assets;
create trigger assets_quota before insert on public.assets
  for each row execute function public.enforce_asset_quota();

-- Usage for the dashboard meter.
create or replace function public.my_asset_usage()
returns table (used_bytes bigint, limit_bytes bigint, asset_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(a.bytes), 0)::bigint,
         public.asset_storage_limit(public.effective_plan(public.requesting_user_id())),
         count(a.id)::integer
  from public.assets a
  where a.owner_id = public.requesting_user_id()
$$;

revoke all on function public.my_asset_usage() from public, anon;
grant execute on function public.my_asset_usage() to authenticated;
