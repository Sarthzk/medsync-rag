-- MedSync: state for the stateless (Vercel) backend.
-- Run once in Supabase Dashboard -> SQL Editor. Safe to re-run.
--
-- Replaces local disk state:
--   uploads/          -> Storage bucket `reports` (objects at "<user_id>/<file>")
--   .medsync_cache/   -> public.reports.structured_report
--   medsync_db/ (Chroma) -> public.report_chunks (pgvector)

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Reports: one row per uploaded file
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  filename          text not null,
  storage_path      text not null unique,
  sha256            text not null,
  structured_report jsonb,
  status            text not null default 'pending'
                    check (status in ('pending', 'ready', 'failed')),
  error             text,
  created_at        timestamptz not null default now(),
  unique (user_id, filename)
);

create index if not exists reports_user_created_idx
  on public.reports (user_id, created_at desc);
create index if not exists reports_user_sha_idx
  on public.reports (user_id, sha256);

-- ---------------------------------------------------------------------------
-- Report chunks: embedded text for retrieval
-- ---------------------------------------------------------------------------
create table if not exists public.report_chunks (
  id          bigserial primary key,
  report_id   uuid not null references public.reports (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  chunk_index int not null,
  content     text not null,
  metadata    jsonb not null default '{}'::jsonb,
  embedding   extensions.vector(1536) not null,
  unique (report_id, chunk_index)
);

create index if not exists report_chunks_user_idx
  on public.report_chunks (user_id);
create index if not exists report_chunks_embedding_idx
  on public.report_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- Similarity search scoped to one user, with optional metadata containment filter.
create or replace function public.match_report_chunks(
  query_embedding extensions.vector(1536),
  match_count     int,
  p_user_id       uuid,
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
set search_path = public, extensions
as $$
  select
    c.id,
    c.report_id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.report_chunks c
  where c.user_id = p_user_id
    and c.metadata @> coalesce(p_filter, '{}'::jsonb)
  order by c.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- Only the backend (service role) may call the search function.
revoke execute on function public.match_report_chunks(extensions.vector, int, uuid, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vitals: scope to a user (existing rows keep user_id NULL and become invisible)
-- ---------------------------------------------------------------------------
alter table public.vitals
  add column if not exists user_id uuid references auth.users (id) on delete cascade;
create index if not exists vitals_user_timestamp_idx
  on public.vitals (user_id, "timestamp" desc);

-- ---------------------------------------------------------------------------
-- Row Level Security (defence in depth; the backend uses the service role)
-- ---------------------------------------------------------------------------
alter table public.reports       enable row level security;
alter table public.report_chunks enable row level security;
alter table public.vitals        enable row level security;

drop policy if exists "reports: owner read" on public.reports;
create policy "reports: owner read" on public.reports
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "report_chunks: owner read" on public.report_chunks;
create policy "report_chunks: owner read" on public.report_chunks
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "vitals: owner read" on public.vitals;
create policy "vitals: owner read" on public.vitals
  for select to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage: private bucket, users may only touch "<their uid>/..."
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reports',
  'reports',
  false,
  20971520, -- 20 MB
  array['application/pdf', 'image/png', 'image/jpeg', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "reports bucket: owner insert" on storage.objects;
create policy "reports bucket: owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "reports bucket: owner read" on storage.objects;
create policy "reports bucket: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "reports bucket: owner delete" on storage.objects;
create policy "reports bucket: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);
