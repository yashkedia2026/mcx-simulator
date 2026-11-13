-- ─────────────────────────────────────────────────────────────
-- MCX Options Simulator — Supabase schema
--
-- Run this once, top to bottom, in the Supabase SQL Editor
-- (Dashboard → SQL Editor → New query → paste → Run) on a fresh
-- project with no existing tables or policies.
--
-- The app uses two small tables — auth (email/password and Google OAuth) is
-- handled entirely by Supabase's built-in `auth.users`.
-- ─────────────────────────────────────────────────────────────

-- gen_random_uuid() lives in pgcrypto; safe no-op if already enabled.
create extension if not exists pgcrypto;

-- ── Table ───────────────────────────────────────────────────
-- Column names/shape match src/hooks/useSavedStrategies.ts exactly.
create table if not exists public.strategies (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  instrument    text,
  futures_price numeric,
  risk_free_rate numeric,
  legs          jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

-- Safe migration for projects created from the earlier GitHub schema.
alter table public.strategies add column if not exists risk_free_rate numeric;

create index if not exists strategies_user_id_idx on public.strategies (user_id);

-- ── Row-Level Security ──────────────────────────────────────
-- The app's select query has no `user_id` filter — it relies entirely
-- on these policies to scope every read/write to the logged-in user.
alter table public.strategies enable row level security;

drop policy if exists "select own strategies" on public.strategies;
drop policy if exists "insert own strategies" on public.strategies;
drop policy if exists "update own strategies" on public.strategies;
drop policy if exists "delete own strategies" on public.strategies;

create policy "select own strategies"
  on public.strategies for select
  using (auth.uid() = user_id);

create policy "insert own strategies"
  on public.strategies for insert
  with check (auth.uid() = user_id);

create policy "update own strategies"
  on public.strategies for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own strategies"
  on public.strategies for delete
  using (auth.uid() = user_id);

-- ── Autosave drafts ─────────────────────────────────────────
-- One row per user. This is separate from named strategies so autosave never
-- creates duplicates in the user's saved-strategy list.
create table if not exists public.strategy_drafts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references auth.users(id) on delete cascade,
  underlying_price numeric not null,
  risk_free_rate   numeric not null default 6.5,
  follow_market    boolean not null default true,
  legs             jsonb not null default '[]'::jsonb,
  updated_at       timestamptz not null default now()
);

create index if not exists strategy_drafts_user_id_idx on public.strategy_drafts (user_id);

alter table public.strategy_drafts enable row level security;

drop policy if exists "select own strategy draft" on public.strategy_drafts;
drop policy if exists "insert own strategy draft" on public.strategy_drafts;
drop policy if exists "update own strategy draft" on public.strategy_drafts;
drop policy if exists "delete own strategy draft" on public.strategy_drafts;

create policy "select own strategy draft"
  on public.strategy_drafts for select
  using (auth.uid() = user_id);

create policy "insert own strategy draft"
  on public.strategy_drafts for insert
  with check (auth.uid() = user_id);

create policy "update own strategy draft"
  on public.strategy_drafts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own strategy draft"
  on public.strategy_drafts for delete
  using (auth.uid() = user_id);
