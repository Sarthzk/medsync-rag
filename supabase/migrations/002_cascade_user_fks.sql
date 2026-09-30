-- MedSync: make every public-table FK to auth.users cascade on delete.
-- Without this, deleting a user (API account deletion or Supabase dashboard) fails with
-- "Database error deleting user" if e.g. user_settings was created without ON DELETE CASCADE.
-- Run once in Supabase Dashboard -> SQL Editor. Safe to re-run.

do $$
declare
  r record;
begin
  for r in
    select
      rel.relname as table_name,
      con.conname as constraint_name,
      att.attname as column_name
    from pg_constraint con
    join pg_class rel      on rel.oid = con.conrelid
    join pg_namespace nsp  on nsp.oid = rel.relnamespace
    join pg_attribute att  on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and nsp.nspname = 'public'
      and con.confrelid = 'auth.users'::regclass
      and array_length(con.conkey, 1) = 1
      and con.confdeltype <> 'c'   -- not already ON DELETE CASCADE
  loop
    raise notice 'Adding ON DELETE CASCADE to %.%', r.table_name, r.constraint_name;
    execute format('alter table public.%I drop constraint %I', r.table_name, r.constraint_name);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references auth.users (id) on delete cascade',
      r.table_name, r.constraint_name, r.column_name
    );
  end loop;
end $$;
