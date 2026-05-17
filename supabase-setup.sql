-- ============================================================
-- Codenames Tracker — Supabase Setup
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- PROFILES (one per user account)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  created_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Profiles are public"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);


-- GAMES
create table public.games (
  id uuid default gen_random_uuid() primary key,
  played_at date not null default current_date,
  winning_team text check (winning_team in ('red', 'blue')) not null,
  screenshot_url text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now() not null
);

alter table public.games enable row level security;

create policy "Games are public"
  on public.games for select using (true);

create policy "Authenticated users can insert games"
  on public.games for insert with check (auth.role() = 'authenticated');


-- GAME PLAYERS (one row per player per game)
create table public.game_players (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  player_id uuid references public.profiles(id) on delete cascade not null,
  team text check (team in ('red', 'blue')) not null,
  role text check (role in ('spymaster', 'operative')) not null,
  won boolean not null,
  created_at timestamptz default now() not null,
  unique(game_id, player_id)
);

alter table public.game_players enable row level security;

create policy "Game players are public"
  on public.game_players for select using (true);

create policy "Authenticated users can insert game players"
  on public.game_players for insert with check (auth.role() = 'authenticated');


-- LEADERBOARD VIEW (used by the main page)
create or replace view public.leaderboard as
select
  p.id,
  p.username,
  count(gp.id)::int as games_played,
  count(case when gp.won = true then 1 end)::int as wins,
  count(case when gp.won = false then 1 end)::int as losses,
  case
    when count(gp.id) = 0 then 0::numeric
    else round(
      count(case when gp.won = true then 1 end)::numeric / count(gp.id) * 100,
      1
    )
  end as win_rate
from public.profiles p
left join public.game_players gp on gp.player_id = p.id
group by p.id, p.username;
