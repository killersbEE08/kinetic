-- Kinetic: abuse reports for public share links and their comments, and link takedowns.
-- Safe to run more than once. The app keeps working without it (reports answer
-- "migration needed", and links are never blocked).

-- Reports from anyone who can see a share link (no account needed). Written by the API with
-- the service role. The deck owner can read and dismiss reports about comments on their decks,
-- never reports about the deck itself (those go to the Kinetic team).
create table if not exists public.abuse_reports (
  id             bigint generated always as identity primary key,
  link_id        text not null references public.share_links(id) on delete cascade,
  deck_id        text not null,
  owner_id       text not null,
  kind           text not null check (kind in ('deck', 'comment')),
  comment_id     uuid references public.comments(id) on delete cascade,
  reason         text not null check (reason in ('spam', 'phishing', 'malware', 'harassment', 'illegal', 'copyright', 'other')),
  details        text not null default '' check (char_length(details) <= 1000),
  reporter_email text check (reporter_email is null or char_length(reporter_email) <= 200),
  reporter_hash  text not null,
  status         text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at     timestamptz not null default now(),
  constraint abuse_comment_needs_id check (kind <> 'comment' or comment_id is not null)
);
create index if not exists abuse_reports_open on public.abuse_reports (status, created_at desc);
create index if not exists abuse_reports_link on public.abuse_reports (link_id);
alter table public.abuse_reports enable row level security;

drop policy if exists "abuse_reports: owner reads comment reports" on public.abuse_reports;
create policy "abuse_reports: owner reads comment reports" on public.abuse_reports for select to authenticated
  using (kind = 'comment' and owner_id = (select public.requesting_user_id()));
drop policy if exists "abuse_reports: owner dismisses comment reports" on public.abuse_reports;
create policy "abuse_reports: owner dismisses comment reports" on public.abuse_reports for update to authenticated
  using (kind = 'comment' and owner_id = (select public.requesting_user_id()))
  with check (kind = 'comment' and owner_id = (select public.requesting_user_id()));
revoke update on public.abuse_reports from authenticated;
grant update (status) on public.abuse_reports to authenticated;

-- Takedowns. Rows are added by the Kinetic team (SQL editor / service role) after reviewing a
-- report. A blocked link shows "removed" to viewers; the owner can't lift it themselves.
create table if not exists public.blocked_links (
  link_id    text primary key references public.share_links(id) on delete cascade,
  reason     text not null default '' check (char_length(reason) <= 300),
  blocked_at timestamptz not null default now()
);
alter table public.blocked_links enable row level security;
drop policy if exists "blocked_links: owner reads" on public.blocked_links;
create policy "blocked_links: owner reads" on public.blocked_links for select to authenticated
  using (exists (select 1 from public.share_links l where l.id = link_id and l.owner_id = (select public.requesting_user_id())));
