-- Fix: the reminder_settings trigger runs as the signed-in person, who has no access to the still_private schema,
-- so it could not call still_private.next_reminder_at() ("permission denied for schema still_private").
-- Work out next_at inside the trigger instead. Applied 26 November 2026.
create or replace function still_private.prepare_reminder_settings()
returns trigger language plpgsql set search_path = '' as $$
declare v_today date;
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
  if new.enabled and cardinality(new.times) > 0 then
    -- The next of these local clock times after now, as a real instant (today or tomorrow in their time zone; handles daylight saving).
    v_today := (now() at time zone new.tz)::date;
    new.next_at := (
      select min(c) from (
        select (((v_today + d) + t) at time zone new.tz) as c
        from unnest(new.times) as t cross join generate_series(0, 1) as d
      ) x where c > now()
    );
  else
    new.next_at := null;
  end if;
  return new;
end $$;
revoke all on function still_private.prepare_reminder_settings() from public, anon, authenticated;
drop function still_private.next_reminder_at(time[], text, timestamptz);
