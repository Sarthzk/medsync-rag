-- consume_quota returned two rows (denied, then allowed) once the limit was hit: add the missing early return.
create or replace function public.consume_quota(p_kind text, p_limit int)
returns table (allowed boolean, used int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_count int;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_kind not in ('chat', 'ingest') or p_limit < 1 or p_limit > 10000 then
    raise exception 'Invalid quota request' using errcode = '22023';
  end if;

  insert into public.usage_daily as u (user_id, day, kind, count)
  values (v_uid, current_date, p_kind, 1)
  on conflict (user_id, day, kind)
  do update set count = u.count + 1 where u.count < p_limit
  returning u.count into v_count;

  if v_count is null then
    select u.count into v_count
    from public.usage_daily u
    where u.user_id = v_uid and u.day = current_date and u.kind = p_kind;
    return query select false, coalesce(v_count, 0);
    return;
  end if;

  return query select true, v_count;
end;
$$;
revoke execute on function public.consume_quota(text, int) from public, anon;
grant execute on function public.consume_quota(text, int) to authenticated;
