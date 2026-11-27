-- Remove schema nothing reads or writes: lab_results (trend charts were never built) and two unused settings flags.
drop table if exists public.lab_results;
alter table public.user_settings
  drop column if exists ai_analysis_enabled,
  drop column if exists privacy_enabled;
