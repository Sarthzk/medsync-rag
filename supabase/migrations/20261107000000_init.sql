-- MedSync: initial schema for the single Next.js app.
--
-- Access model: the browser and the Next.js route handlers both talk to Supabase as the
-- signed-in user, so Row Level Security is the authority. The service role is used only for
-- account deletion and cron endpoints.

create extension if not exists vector with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles and settings (created automatically on signup)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 200),
  blood_type  text not null default '' check (char_length(blood_type) <= 8),
  timezone    text not null default 'Asia/Kolkata' check (char_length(timezone) <= 64),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.user_settings (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  ai_analysis_enabled   boolean not null default true,
  notifications_enabled boolean not null default true,
  privacy_enabled       boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger user_settings_set_updated_at before update on public.user_settings
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name, blood_type)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200),
    left(coalesce(new.raw_user_meta_data ->> 'blood_type', ''), 8)
  )
  on conflict (user_id) do nothing;

  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Reports: one row per uploaded file
-- ---------------------------------------------------------------------------
create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  filename          text not null check (char_length(filename) between 1 and 255),
  storage_path      text not null,
  sha256            text,
  structured_report jsonb,
  status            text not null default 'processing'
                    check (status in ('processing', 'ready', 'failed')),
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, storage_path),
  check (storage_path like user_id::text || '/%')
);

create index reports_user_created_idx on public.reports (user_id, created_at desc);
create index reports_user_sha_idx on public.reports (user_id, sha256) where sha256 is not null;

create trigger reports_set_updated_at before update on public.reports
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Report chunks: embedded text for retrieval
-- ---------------------------------------------------------------------------
create table public.report_chunks (
  id          bigint generated always as identity primary key,
  report_id   uuid not null references public.reports (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  chunk_index int not null check (chunk_index >= 0),
  content     text not null,
  metadata    jsonb not null default '{}'::jsonb,
  embedding   extensions.vector(1536) not null,
  unique (report_id, chunk_index)
);

create index report_chunks_user_idx on public.report_chunks (user_id);
create index report_chunks_embedding_idx
  on public.report_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- Similarity search for the signed-in user; SECURITY INVOKER so RLS applies as well.
create or replace function public.match_report_chunks(
  query_embedding extensions.vector(1536),
  match_count     int,
  p_filter        jsonb default '{}'::jsonb
)
returns table (
  id         bigint,
  report_id  uuid,
  content    text,
  metadata   jsonb,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id,
    c.report_id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.report_chunks c
  where c.user_id = (select auth.uid())
    and c.metadata @> coalesce(p_filter, '{}'::jsonb)
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50);
$$;
revoke execute on function public.match_report_chunks(extensions.vector, int, jsonb)
  from public, anon;
grant execute on function public.match_report_chunks(extensions.vector, int, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Vitals
-- ---------------------------------------------------------------------------
create table public.vitals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  heart_rate    int check (heart_rate between 20 and 250),
  sleep_quality numeric(4, 1) check (sleep_quality between 0 and 24),
  daily_steps   int check (daily_steps between 0 and 200000),
  logged_at     timestamptz not null default now(),
  check (heart_rate is not null or sleep_quality is not null or daily_steps is not null)
);

create index vitals_user_logged_idx on public.vitals (user_id, logged_at desc);

-- ---------------------------------------------------------------------------
-- Medication reminders (toggle per medication found in a report)
-- ---------------------------------------------------------------------------
create table public.medication_reminders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  medication_key   text not null check (char_length(medication_key) <= 200),
  medication_name  text not null check (char_length(medication_name) <= 200),
  report_file      text,
  reminder_enabled boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, medication_key)
);

create trigger medication_reminders_set_updated_at before update on public.medication_reminders
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Lab results: normalized values extracted from reports, for trend charts
-- ---------------------------------------------------------------------------
create table public.lab_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  report_id   uuid not null references public.reports (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  value       numeric not null,
  unit        text,
  ref_low     numeric,
  ref_high    numeric,
  observed_at date not null default current_date,
  created_at  timestamptz not null default now()
);

create index lab_results_user_name_idx on public.lab_results (user_id, name, observed_at);
create index lab_results_report_idx on public.lab_results (report_id);

-- ---------------------------------------------------------------------------
-- Per-user daily usage limits. Users can read their counters but only change them
-- through consume_quota, which cannot be pointed at another user.
-- ---------------------------------------------------------------------------
create table public.usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default current_date,
  kind    text not null check (kind in ('chat', 'ingest')),
  count   int not null default 0 check (count >= 0),
  primary key (user_id, day, kind)
);

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
  end if;

  return query select true, v_count;
end;
$$;
revoke execute on function public.consume_quota(text, int) from public, anon;
grant execute on function public.consume_quota(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.user_settings        enable row level security;
alter table public.reports              enable row level security;
alter table public.report_chunks        enable row level security;
alter table public.vitals               enable row level security;
alter table public.medication_reminders enable row level security;
alter table public.lab_results          enable row level security;
alter table public.usage_daily          enable row level security;

-- profiles / user_settings: owner reads and updates; rows are created by the signup trigger
create policy "profiles: owner read" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles: owner update" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "user_settings: owner read" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_settings: owner insert" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_settings: owner update" on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- reports
create policy "reports: owner read" on public.reports
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "reports: owner insert" on public.reports
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reports: owner update" on public.reports
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reports: owner delete" on public.reports
  for delete to authenticated using ((select auth.uid()) = user_id);

-- report_chunks
create policy "report_chunks: owner read" on public.report_chunks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "report_chunks: owner insert" on public.report_chunks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "report_chunks: owner update" on public.report_chunks
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "report_chunks: owner delete" on public.report_chunks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- vitals (append-only apart from deletes)
create policy "vitals: owner read" on public.vitals
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "vitals: owner insert" on public.vitals
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "vitals: owner delete" on public.vitals
  for delete to authenticated using ((select auth.uid()) = user_id);

-- medication_reminders
create policy "medication_reminders: owner all" on public.medication_reminders
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- lab_results (written during ingest, deleted with their report)
create policy "lab_results: owner read" on public.lab_results
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "lab_results: owner insert" on public.lab_results
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "lab_results: owner delete" on public.lab_results
  for delete to authenticated using ((select auth.uid()) = user_id);

-- usage_daily: read-only for users
create policy "usage_daily: owner read" on public.usage_daily
  for select to authenticated using ((select auth.uid()) = user_id);

-- Data API grants: signed-in users only, never anon
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.usage_daily from authenticated;
revoke insert, delete on public.profiles from authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, users may only touch "<their uid>/..."
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reports',
  'reports',
  false,
  20971520, -- 20 MB
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "reports bucket: owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "reports bucket: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "reports bucket: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "reports bucket: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
