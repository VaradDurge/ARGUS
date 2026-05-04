-- ============================================================
-- ARGUS Cloud — Supabase schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── Runs table ──────────────────────────────────────────────
create table public.runs (
  id              uuid        default gen_random_uuid() primary key,
  user_id         uuid        references auth.users(id) on delete cascade not null,
  run_id          text        not null,
  data            jsonb       not null,
  overall_status  text,
  started_at      timestamptz,
  duration_ms     integer,
  step_count      integer,
  first_failure_step text,
  argus_version   text,
  parent_run_id   text,
  created_at      timestamptz default now(),

  unique(user_id, run_id)
);

-- ── Indexes ─────────────────────────────────────────────────
create index idx_runs_user_started on public.runs (user_id, started_at desc);
create index idx_runs_status       on public.runs (overall_status);

-- ── Row Level Security ──────────────────────────────────────
alter table public.runs enable row level security;

create policy "Users read own runs"
  on public.runs for select
  using (auth.uid() = user_id);

create policy "Users insert own runs"
  on public.runs for insert
  with check (auth.uid() = user_id);

create policy "Users update own runs"
  on public.runs for update
  using (auth.uid() = user_id);

create policy "Users delete own runs"
  on public.runs for delete
  using (auth.uid() = user_id);
