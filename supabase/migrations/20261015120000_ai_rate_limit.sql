-- Kinetic: exact per-user AI burst limit. Cloudflare's rate-limit binding is fast but approximate,
-- so the AI routes (the only ones that cost money) also get an exact check here, inside the same
-- locked transaction that spends credits: at most 20 AI calls per user per minute.

create index if not exists ai_usage_user_recent on public.ai_usage (user_id, created_at desc);

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
  recent integer;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_credits < 1 or p_credits > 50 then
    raise exception 'invalid_credits';
  end if;

  -- Serialize per user so two parallel requests can't both pass the checks.
  perform pg_advisory_xact_lock(hashtext(uid));

  select count(*) into recent from public.ai_usage where user_id = uid and created_at > now() - interval '60 seconds';
  if recent >= 20 then
    raise exception 'rate_limit: Too many AI requests in a short time. Wait a minute and try again.' using errcode = 'P0001';
  end if;

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
