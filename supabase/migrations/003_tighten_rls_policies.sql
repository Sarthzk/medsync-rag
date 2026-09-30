-- MedSync: tighten Row Level Security on user data.
-- Run once in Supabase Dashboard -> SQL Editor. Safe to re-run.
--
-- Fixes (found by Supabase advisors on 2026-10-01):
-- 1. vitals had "Allow all access to vitals" (FOR ALL, TO public, USING true): anyone holding the
--    public anon key could read/insert/update/delete every user's vitals via the REST API.
-- 2. user_settings had duplicate UPDATE policies without WITH CHECK (a user could reassign a row's
--    user_id) and policies granted to `public` instead of `authenticated`.
-- 3. Every owner policy called auth.uid() per row; `(select auth.uid())` evaluates it once per query.
--
-- Access model: the browser reads/writes only its own user_settings and medication_reminders
-- (Settings and Medications pages). Everything else goes through the API, which uses the
-- service-role key (bypasses RLS) and filters by the authenticated user itself; the read
-- policies below are defence in depth.

begin;

-- vitals: owner read only (writes happen through the API)
drop policy if exists "Allow all access to vitals" on public.vitals;
drop policy if exists "vitals: owner read" on public.vitals;
create policy "vitals: owner read" on public.vitals
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- reports / report_chunks: owner read only (writes happen through the API)
drop policy if exists "reports: owner read" on public.reports;
create policy "reports: owner read" on public.reports
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "report_chunks: owner read" on public.report_chunks;
create policy "report_chunks: owner read" on public.report_chunks
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- medication_reminders: owner manages own rows from the browser (select + upsert)
drop policy if exists "Users manage their medication reminders" on public.medication_reminders;
create policy "Users manage their medication reminders" on public.medication_reminders
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- user_settings: owner select/insert/update from the browser (upsert needs all three)
drop policy if exists "Users can view their own settings" on public.user_settings;
drop policy if exists "Users can read own settings" on public.user_settings;
drop policy if exists "Users can insert their own settings" on public.user_settings;
drop policy if exists "Users can insert own settings" on public.user_settings;
drop policy if exists "Users can update their own settings" on public.user_settings;
drop policy if exists "Users can update own settings" on public.user_settings;

create policy "user_settings: owner read" on public.user_settings
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "user_settings: owner insert" on public.user_settings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "user_settings: owner update" on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;
