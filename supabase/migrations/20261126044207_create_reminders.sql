-- Still 2 reminders: people pick a few times a day; a job checks every minute and the push function sends the notification.
-- Applied to project `still` (icovzdxbbvbdbhcvdbrv) on 26 November 2026. Kept here as the record.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists still_private;
revoke all on schema still_private from public, anon, authenticated;

-- Phones that can receive notifications. Writes go through save_push_subscription().
create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
comment on table public.push_subscriptions is 'Phones that receive Still reminders. One row per phone and browser; it moves to whoever last signed in there.';
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "People see their own phones" on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "People remove their own phones" on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
  if p_endpoint is null or length(p_endpoint) > 1000
     or p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/' then
    raise exception 'Not a push address';
  end if;
  if p_p256dh !~ '^[A-Za-z0-9_-]{80,100}$' or p_auth !~ '^[A-Za-z0-9_-]{16,32}$' then raise exception 'Bad push keys'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, (select auth.uid()), p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- When to remind someone. Times are their local clock times; tz is their phone's time zone.
create table public.reminder_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  times time[] not null default '{}',
  tz text not null default 'UTC',
  next_at timestamptz,
  last_sent_at timestamptz,
  updated_at timestamptz not null default now()
);
comment on table public.reminder_settings is 'Still reminder times. next_at is worked out by the database (handles daylight saving) and is what the minute job checks.';
create index reminder_settings_due_idx on public.reminder_settings (next_at) where enabled;
alter table public.reminder_settings enable row level security;
create policy "People see their own reminders" on public.reminder_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "People add their own reminders" on public.reminder_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "People change their own reminders" on public.reminder_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "People remove their own reminders" on public.reminder_settings for delete to authenticated using ((select auth.uid()) = user_id);

-- The next of these local times after a moment, as a real instant. Looks at today and tomorrow in that time zone.
create function still_private.next_reminder_at(p_times time[], p_tz text, p_after timestamptz)
returns timestamptz language sql stable set search_path = '' as $$
  select min(c) from (
    select ((((p_after at time zone p_tz)::date + d) + t) at time zone p_tz) as c
    from unnest(p_times) as t cross join generate_series(0, 1) as d
  ) x where c > p_after
$$;

create function still_private.prepare_reminder_settings()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.tz) then
    raise exception 'Unknown time zone: %', new.tz;
  end if;
  new.times := coalesce((select array_agg(x order by x) from (select distinct pg_catalog.to_char(t, 'HH24:MI')::time as x from unnest(new.times) as t where t is not null) s), '{}');
  if cardinality(new.times) > 12 then raise exception 'At most 12 reminder times'; end if;
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    if current_user = 'authenticated' then new.last_sent_at := old.last_sent_at; end if;
  elsif current_user = 'authenticated' then
    new.last_sent_at := null;
  end if;
  new.updated_at := now();
  new.next_at := case when new.enabled and cardinality(new.times) > 0 then still_private.next_reminder_at(new.times, new.tz, now()) end;
  return new;
end $$;
create trigger prepare_reminder_settings before insert or update on public.reminder_settings
  for each row execute function still_private.prepare_reminder_settings();

-- Called by the push function: takes every reminder that is due, moves it to its next time and says whether to send it.
-- It stays quiet if the reminder is more than 30 minutes late, or if the person wrote something in the last 20 minutes.
create function still_private.claim_due_reminders()
returns table (user_id uuid, tz text, send boolean) language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select r.user_id, r.tz, r.next_at from public.reminder_settings r
    where r.enabled and r.next_at <= now()
    for update skip locked
  ), moved as (
    update public.reminder_settings r set last_sent_at = now()
    from due where r.user_id = due.user_id
    returning r.user_id
  )
  select due.user_id, due.tz,
    (due.next_at > now() - interval '30 minutes')
    and not exists (select 1 from public.moments m where m.user_id = due.user_id and m.deleted_at is null and m.at > now() - interval '20 minutes')
    and not exists (select 1 from public.mind_entries e where e.user_id = due.user_id and e.deleted_at is null and e.at > now() - interval '20 minutes')
  from due join moved on moved.user_id = due.user_id;
end $$;

-- Runs every minute. Only wakes the push function when someone is due.
create function still_private.dispatch_due_reminders()
returns void language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  if not exists (select 1 from public.reminder_settings where enabled and next_at <= now()) then return; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'still_push_secret';
  if v_secret is null then return; end if;
  perform net.http_post(
    url := 'https://icovzdxbbvbdbhcvdbrv.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-still-secret', v_secret),
    body := jsonb_build_object('mode', 'due'),
    timeout_milliseconds := 30000
  );
end $$;

revoke all on all functions in schema still_private from public, anon, authenticated;

-- The shared secret between this job and the push function, made here so it never leaves the database.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'still_push_secret', 'Proves a request to the push function came from the reminder job.');

select cron.schedule('still-reminders', '* * * * *', $$select still_private.dispatch_due_reminders()$$);
