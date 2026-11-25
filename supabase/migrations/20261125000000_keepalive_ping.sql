-- Daily keep-alive target: a real round trip to Postgres that reveals nothing.
-- Called by the Vercel schedule (see frontend/vercel.json) so the free-tier project never idles into a pause.
create or replace function public.ping()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
