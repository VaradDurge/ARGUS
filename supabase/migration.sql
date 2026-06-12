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

-- ============================================================
-- Feedback Board
-- ============================================================

-- ── Feedback posts ─────────────────────────────────────────
create table public.feedback_posts (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        references auth.users(id) on delete cascade not null,
  author_name   text        not null,
  author_avatar text,
  title         text        not null check (char_length(title) <= 120),
  category      text        not null check (category in ('feature', 'bug', 'failure')),
  description   text        not null check (char_length(description) <= 2000),
  vote_count    integer     default 0 not null,
  created_at    timestamptz default now() not null
);

create index idx_feedback_votes   on public.feedback_posts (vote_count desc, created_at desc);
create index idx_feedback_created on public.feedback_posts (created_at desc);

alter table public.feedback_posts enable row level security;

create policy "read_posts" on public.feedback_posts for select
  using (auth.role() = 'authenticated');

create policy "insert_own_posts" on public.feedback_posts for insert
  with check (auth.uid() = user_id);

create policy "delete_own_posts" on public.feedback_posts for delete
  using (auth.uid() = user_id);

-- ── Feedback votes ─────────────────────────────────────────
create table public.feedback_votes (
  user_id    uuid references auth.users(id) on delete cascade not null,
  post_id    uuid references public.feedback_posts(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  primary key (user_id, post_id)
);

alter table public.feedback_votes enable row level security;

create policy "read_votes" on public.feedback_votes for select
  using (auth.role() = 'authenticated');

create policy "insert_own_votes" on public.feedback_votes for insert
  with check (auth.uid() = user_id);

create policy "delete_own_votes" on public.feedback_votes for delete
  using (auth.uid() = user_id);

-- ── Vote count trigger ─────────────────────────────────────
create or replace function update_feedback_vote_count()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update public.feedback_posts set vote_count = vote_count + 1 where id = NEW.post_id;
    return NEW;
  elsif TG_OP = 'DELETE' then
    update public.feedback_posts set vote_count = vote_count - 1 where id = OLD.post_id;
    return OLD;
  end if;
end;
$$ language plpgsql security definer;

create trigger trg_feedback_vote_count
  after insert or delete on public.feedback_votes
  for each row execute function update_feedback_vote_count();

-- ============================================================
-- Shared Signatures (community-approved detection patterns)
-- ============================================================

create table public.shared_signatures (
  id              uuid        default gen_random_uuid() primary key,
  user_id         uuid        references auth.users(id) on delete set null,
  sig_id          text        not null unique,
  category        text        not null,
  pattern         text        not null,
  match_strategy  text        not null check (
    match_strategy in ('exact_ci', 'contains_ci', 'prefix_ci', 'regex', 'repetition')
  ),
  severity        text        not null check (severity in ('critical', 'warning')),
  description     text        not null,
  reasoning       text,
  evidence        jsonb       default '[]'::jsonb,
  confidence      real,
  source_run_ids  jsonb       default '[]'::jsonb,
  source_nodes    jsonb       default '[]'::jsonb,
  times_seen      integer     default 1,
  contributed_by  text,
  created_at      timestamptz default now() not null,

  unique(pattern, match_strategy)
);

create index idx_shared_sigs_created on public.shared_signatures (created_at desc);
create index idx_shared_sigs_category on public.shared_signatures (category);

alter table public.shared_signatures enable row level security;

-- All authenticated users can read shared signatures
create policy "read_shared_sigs" on public.shared_signatures for select
  using (auth.role() = 'authenticated');

-- Authenticated users can contribute new signatures
create policy "insert_shared_sigs" on public.shared_signatures for insert
  with check (auth.role() = 'authenticated');

-- Users can only delete their own contributions
create policy "delete_own_shared_sigs" on public.shared_signatures for delete
  using (auth.uid() = user_id);
