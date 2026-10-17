-- Kinetic: version history snapshots and Trash.

-- ---------------------------------------------------------------------------
-- Version snapshots: the whole deck document at a point in time. Taken when a deck is created,
-- before every AI edit, every 25 saved edits, before a restore, and when the user saves a named
-- version. deck_versions (the patch log) stays as is; snapshots are what the user can restore.
-- ---------------------------------------------------------------------------
create table if not exists public.deck_snapshots (
  id          bigint generated always as identity primary key,
  deck_id     text not null references public.decks(id) on delete cascade,
  version     integer not null,
  kind        text not null check (kind in ('created', 'auto', 'before-ai', 'named', 'before-restore')),
  label       text check (label is null or char_length(label) <= 80),
  title       text not null default '' check (char_length(title) <= 200),
  slide_count integer not null default 0,
  doc         jsonb not null,
  author_id   text not null default public.requesting_user_id(),
  created_at  timestamptz not null default now(),
  constraint deck_snapshot_size check (pg_column_size(doc) < 2000000)
);

create index if not exists deck_snapshots_deck on public.deck_snapshots (deck_id, created_at desc);

alter table public.deck_snapshots enable row level security;

create policy "deck_snapshots: read own" on public.deck_snapshots for select to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = (select public.requesting_user_id())));
create policy "deck_snapshots: insert own" on public.deck_snapshots for insert to authenticated
  with check (
    author_id = (select public.requesting_user_id())
    and exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = (select public.requesting_user_id()))
  );
create policy "deck_snapshots: update own" on public.deck_snapshots for update to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = (select public.requesting_user_id())))
  with check (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = (select public.requesting_user_id())));
create policy "deck_snapshots: delete own" on public.deck_snapshots for delete to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = (select public.requesting_user_id())));

-- Keep the 50 newest automatic snapshots per deck. Named versions are kept until deleted.
create or replace function public.trim_deck_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.deck_snapshots s
  where s.deck_id = new.deck_id
    and s.kind <> 'named'
    and s.id not in (
      select id from public.deck_snapshots
      where deck_id = new.deck_id and kind <> 'named'
      order by created_at desc, id desc
      limit 50
    );
  return null;
end;
$$;

drop trigger if exists deck_snapshots_trim on public.deck_snapshots;
create trigger deck_snapshots_trim after insert on public.deck_snapshots
  for each row execute function public.trim_deck_snapshots();

-- ---------------------------------------------------------------------------
-- Trash: decks.deleted_at already marks a deck as deleted. Restoring counts against the
-- Free plan's 3-deck limit, the same as creating a deck.
-- ---------------------------------------------------------------------------
create index if not exists decks_owner_deleted on public.decks (owner_id, deleted_at desc) where deleted_at is not null;

create or replace function public.enforce_deck_limit_on_restore()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deck_count integer;
begin
  if old.deleted_at is not null and new.deleted_at is null and public.effective_plan(new.owner_id) = 'free' then
    select count(*) into deck_count from public.decks where owner_id = new.owner_id and deleted_at is null;
    if deck_count >= 3 then
      raise exception 'plan_limit: The Free plan includes 3 decks. Delete one or upgrade to Pro to restore this deck.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists decks_limit_restore on public.decks;
create trigger decks_limit_restore before update of deleted_at on public.decks
  for each row execute function public.enforce_deck_limit_on_restore();
