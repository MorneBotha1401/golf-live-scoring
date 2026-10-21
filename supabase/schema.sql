-- =====================================================================
-- Golf Live Scoring — database schema for Supabase (Postgres 15+)
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query).
-- It is safe to re-run: objects are created with IF NOT EXISTS / OR REPLACE.
-- =====================================================================

-- Only built-in functions are used (gen_random_uuid is part of Postgres 13+).

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.clubs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  location    text,
  logo_url    text,
  created_at  timestamptz not null default now()
);

create table if not exists public.club_members (
  club_id     uuid not null references public.clubs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'admin' check (role in ('owner','admin')),
  email       text,
  created_at  timestamptz not null default now(),
  primary key (club_id, user_id)
);

-- holes: [{"par":4,"si":14,"len":{"white":355,"red":318}}, ... 18 items]
-- tees:  [{"code":"wm","label":"White · Men","cr":71.8,"slope":128,"len":"white","gender":"M"}, ...]
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  name        text not null,
  holes       jsonb not null,
  tees        jsonb not null,
  created_at  timestamptz not null default now(),
  constraint courses_18_holes check (jsonb_typeof(holes) = 'array' and jsonb_array_length(holes) = 18),
  constraint courses_tees check (jsonb_typeof(tees) = 'array' and jsonb_array_length(tees) >= 1)
);

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  club_id       uuid not null references public.clubs(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete restrict,
  name          text not null check (char_length(name) between 2 and 100),
  event_date    date not null default current_date,
  slug          text not null unique default substr(md5(gen_random_uuid()::text), 1, 10),
  status        text not null default 'draft' check (status in ('draft','live','finished','archived')),
  format        text not null default 'stableford'
                check (format in ('stroke','stableford','betterball','alliance','scramble','scramble_drive')),
  settings      jsonb not null default '{}'::jsonb,
  logo_url      text,
  sponsors      jsonb not null default '[]'::jsonb,   -- [{"name":"BMW","url":"https://..."}]
  self_register boolean not null default false,
  auto_approve  boolean not null default false,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists events_club_idx on public.events(club_id, event_date desc);

create table if not exists public.event_admins (
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  event_id    uuid references public.events(id) on delete cascade,
  role        text not null check (role in ('club_admin','event_admin')),
  token       text not null unique default replace(gen_random_uuid()::text, '-', '') || substr(md5(gen_random_uuid()::text), 1, 8),
  email       text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_by uuid,
  accepted_at timestamptz,
  constraint invite_event_role check ((role = 'event_admin') = (event_id is not null))
);

-- grp 0 = not yet assigned to a group
create table if not exists public.players (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  hi           numeric(4,1) not null check (hi between -10 and 54),
  gender       text not null default 'M' check (gender in ('M','F')),
  cat          text not null default 'open' check (cat in ('open','junior','senior')),
  tee          text not null,
  grp          integer not null default 0 check (grp between 0 and 200),
  pair         text not null default 'A' check (pair in ('A','B')),
  status       text not null default 'active' check (status in ('pending','active','withdrawn')),
  signed_at    timestamptz,
  attested_at  timestamptz,
  attested_by  uuid references public.players(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists players_event_idx on public.players(event_id, grp);

-- Secrets and contact details: visible to event admins only, never public.
create table if not exists public.player_private (
  player_id   uuid primary key references public.players(id) on delete cascade,
  event_id    uuid not null references public.events(id) on delete cascade,
  token       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  phone       text,
  email       text
);

-- Which signed-in devices (anonymous sessions) act as which player.
create table if not exists public.player_sessions (
  player_id   uuid not null references public.players(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (player_id, user_id)
);
create index if not exists player_sessions_user_idx on public.player_sessions(user_id);

-- One row per (player, hole, who entered it). strokes 0 = picked up.
create table if not exists public.scores (
  id                 bigserial primary key,
  event_id           uuid not null references public.events(id) on delete cascade,
  player_id          uuid not null references public.players(id) on delete cascade,
  hole               smallint not null check (hole between 1 and 18),
  role               text not null check (role in ('self','marker','admin')),
  strokes            smallint not null check (strokes between 0 and 20),
  entered_by         uuid,
  entered_by_player  uuid references public.players(id) on delete set null,
  updated_at         timestamptz not null default now(),
  unique (player_id, hole, role)
);
create index if not exists scores_event_idx on public.scores(event_id);
alter table public.scores replica identity full;

-- Team score per hole for scrambles, and whose drive was used.
create table if not exists public.team_scores (
  id                 bigserial primary key,
  event_id           uuid not null references public.events(id) on delete cascade,
  team_key           text not null,
  hole               smallint not null check (hole between 1 and 18),
  strokes            smallint check (strokes between 0 and 20),
  drive_player       uuid references public.players(id) on delete set null,
  entered_by         uuid,
  entered_by_player  uuid references public.players(id) on delete set null,
  updated_at         timestamptz not null default now(),
  unique (event_id, team_key, hole)
);
alter table public.team_scores replica identity full;

create table if not exists public.score_log (
  id           bigserial primary key,
  event_id     uuid not null references public.events(id) on delete cascade,
  player_id    uuid references public.players(id) on delete cascade,
  team_key     text,
  hole         smallint,
  role         text,
  field        text not null default 'strokes',
  old_value    text,
  new_value    text,
  by_user      uuid,
  by_player    uuid,
  at           timestamptz not null default now()
);
create index if not exists score_log_event_idx on public.score_log(event_id, at desc);

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so policies can use them safely)
-- ---------------------------------------------------------------------

create or replace function public.is_real_user() returns boolean
language sql stable as $$
  select auth.uid() is not null and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

create or replace function public.is_club_admin(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_members where club_id = p_club and user_id = auth.uid());
$$;

create or replace function public.is_event_admin(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e
    where e.id = p_event
      and (exists (select 1 from club_members m where m.club_id = e.club_id and m.user_id = auth.uid())
           or exists (select 1 from event_admins a where a.event_id = e.id and a.user_id = auth.uid()))
  );
$$;

create or replace function public.my_player(p_event uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.player_id from player_sessions s join players p on p.id = s.player_id
  where s.user_id = auth.uid() and p.event_id = p_event
  order by s.created_at desc limit 1;
$$;

create or replace function public.event_visible(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events where id = p_event and status <> 'draft')
      or public.is_event_admin(p_event)
      or public.my_player(p_event) is not null;
$$;

create or replace function public.team_key_of(p public.players, p_format text) returns text
language sql immutable as $$
  select case when p_format = 'betterball' then p.grp::text || p.pair else p.grp::text end;
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

create or replace function public.tg_events_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.club_id <> old.club_id then raise exception 'An event cannot move to another club'; end if;
    if new.slug <> old.slug then raise exception 'The public link of an event cannot change'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists events_guard on public.events;
create trigger events_guard before insert or update on public.events
  for each row execute function public.tg_events_guard();

create or replace function public.tg_players_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.event_id <> old.event_id then
    raise exception 'A player cannot move to another event';
  end if;
  return new;
end $$;
drop trigger if exists players_guard on public.players;
create trigger players_guard before update on public.players
  for each row execute function public.tg_players_guard();

create or replace function public.tg_players_private() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into player_private(player_id, event_id) values (new.id, new.event_id)
  on conflict (player_id) do nothing;
  return new;
end $$;
drop trigger if exists players_private on public.players;
create trigger players_private after insert on public.players
  for each row execute function public.tg_players_private();

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------

alter table public.clubs           enable row level security;
alter table public.club_members    enable row level security;
alter table public.courses         enable row level security;
alter table public.events          enable row level security;
alter table public.event_admins    enable row level security;
alter table public.invites         enable row level security;
alter table public.players         enable row level security;
alter table public.player_private  enable row level security;
alter table public.player_sessions enable row level security;
alter table public.scores          enable row level security;
alter table public.team_scores     enable row level security;
alter table public.score_log       enable row level security;

-- clubs: public names and logos; only club admins edit; created through create_club()
drop policy if exists clubs_read on public.clubs;
create policy clubs_read on public.clubs for select using (true);
drop policy if exists clubs_update on public.clubs;
create policy clubs_update on public.clubs for update using (public.is_club_admin(id)) with check (public.is_club_admin(id));

drop policy if exists members_read on public.club_members;
create policy members_read on public.club_members for select
  using (user_id = auth.uid() or public.is_club_admin(club_id));
drop policy if exists members_delete on public.club_members;
create policy members_delete on public.club_members for delete
  using (public.is_club_admin(club_id) and role <> 'owner');

drop policy if exists courses_read on public.courses;
create policy courses_read on public.courses for select using (true);
drop policy if exists courses_write on public.courses;
create policy courses_write on public.courses for all
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));

drop policy if exists events_read on public.events;
create policy events_read on public.events for select
  using (status <> 'draft' or public.is_club_admin(club_id) or public.is_event_admin(id) or public.my_player(id) is not null);
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert with check (public.is_club_admin(club_id));
drop policy if exists events_update on public.events;
create policy events_update on public.events for update
  using (public.is_event_admin(id)) with check (public.is_event_admin(id));
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete using (public.is_club_admin(club_id));

drop policy if exists event_admins_read on public.event_admins;
create policy event_admins_read on public.event_admins for select
  using (user_id = auth.uid() or public.is_event_admin(event_id));
drop policy if exists event_admins_delete on public.event_admins;
create policy event_admins_delete on public.event_admins for delete
  using (public.is_club_admin((select club_id from public.events e where e.id = event_id)));

drop policy if exists invites_read on public.invites;
create policy invites_read on public.invites for select using (public.is_club_admin(club_id));
drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites for insert with check (
  public.is_club_admin(club_id)
  and (event_id is null or exists (select 1 from public.events e where e.id = event_id and e.club_id = invites.club_id))
);
drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites for delete using (public.is_club_admin(club_id));

drop policy if exists players_read on public.players;
create policy players_read on public.players for select using (
  public.event_visible(event_id)
  and (status = 'active' or public.is_event_admin(event_id) or id = public.my_player(event_id))
);
drop policy if exists players_write on public.players;
create policy players_write on public.players for all
  using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));

drop policy if exists private_admin on public.player_private;
create policy private_admin on public.player_private for all
  using (public.is_event_admin(event_id)) with check (public.is_event_admin(event_id));

drop policy if exists sessions_read on public.player_sessions;
create policy sessions_read on public.player_sessions for select using (
  user_id = auth.uid()
  or public.is_event_admin((select p.event_id from public.players p where p.id = player_id))
);
drop policy if exists sessions_delete on public.player_sessions;
create policy sessions_delete on public.player_sessions for delete using (
  public.is_event_admin((select p.event_id from public.players p where p.id = player_id))
);

-- Scores are public for visible events; all writes go through the functions below.
drop policy if exists scores_read on public.scores;
create policy scores_read on public.scores for select using (public.event_visible(event_id));
drop policy if exists team_scores_read on public.team_scores;
create policy team_scores_read on public.team_scores for select using (public.event_visible(event_id));
drop policy if exists log_read on public.score_log;
create policy log_read on public.score_log for select using (public.is_event_admin(event_id));

-- ---------------------------------------------------------------------
-- Functions the app calls (RPC)
-- ---------------------------------------------------------------------

-- A signed-in (email) user creates a club and becomes its owner.
create or replace function public.create_club(p_name text, p_location text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_real_user() then raise exception 'Sign in with your email to create a club'; end if;
  insert into clubs(name, location) values (trim(p_name), nullif(trim(coalesce(p_location,'')), '')) returning id into v_id;
  insert into club_members(club_id, user_id, role, email) values (v_id, auth.uid(), 'owner', auth.jwt() ->> 'email');
  return v_id;
end $$;

-- Accept an invite link (club admin or event admin).
create or replace function public.accept_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v invites;
begin
  if not public.is_real_user() then raise exception 'Sign in with your email to accept this invite'; end if;
  select * into v from invites where token = p_token for update;
  if not found then raise exception 'This invite link is not valid'; end if;
  if v.accepted_at is not null and v.accepted_by <> auth.uid() then raise exception 'This invite has already been used'; end if;
  if v.expires_at < now() then raise exception 'This invite has expired. Ask for a new one'; end if;
  if v.role = 'club_admin' then
    insert into club_members(club_id, user_id, role, email) values (v.club_id, auth.uid(), 'admin', auth.jwt() ->> 'email')
    on conflict do nothing;
  else
    insert into event_admins(event_id, user_id, email) values (v.event_id, auth.uid(), auth.jwt() ->> 'email')
    on conflict do nothing;
  end if;
  update invites set accepted_by = auth.uid(), accepted_at = coalesce(accepted_at, now()) where id = v.id;
  return jsonb_build_object('club_id', v.club_id, 'event_id', v.event_id, 'role', v.role);
end $$;

-- A phone opens a personal player link: bind this session to that player.
create or replace function public.claim_player(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_eid uuid; v_slug text;
begin
  if auth.uid() is null then raise exception 'No session'; end if;
  select player_id, event_id into v_pid, v_eid from player_private where token = p_token;
  if not found then raise exception 'This player link is not valid. Ask the organiser for your link'; end if;
  insert into player_sessions(player_id, user_id) values (v_pid, auth.uid()) on conflict do nothing;
  select slug into v_slug from events where id = v_eid;
  return jsonb_build_object('player_id', v_pid, 'event_id', v_eid, 'slug', v_slug);
end $$;

-- Self-registration from the event QR.
create or replace function public.register_player(
  p_slug text, p_name text, p_hi numeric, p_gender text, p_cat text, p_tee text,
  p_phone text default null, p_email text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e events; v_pid uuid; v_token text; v_status text;
begin
  if auth.uid() is null then raise exception 'No session'; end if;
  select * into e from events where slug = p_slug;
  if not found then raise exception 'Event not found'; end if;
  if not e.self_register or e.status not in ('draft','live') then
    raise exception 'Registration is closed for this event';
  end if;
  if char_length(trim(coalesce(p_name,''))) < 2 then raise exception 'Enter your full name'; end if;
  if p_hi is null or p_hi < -10 or p_hi > 54 then raise exception 'Enter a handicap index between +10 and 54'; end if;
  v_status := case when e.auto_approve then 'active' else 'pending' end;
  insert into players(event_id, name, hi, gender, cat, tee, status)
  values (e.id, trim(p_name), round(p_hi, 1), coalesce(p_gender,'M'), coalesce(p_cat,'open'), p_tee, v_status)
  returning id into v_pid;
  update player_private set phone = nullif(trim(coalesce(p_phone,'')),''), email = nullif(trim(coalesce(p_email,'')),'')
    where player_id = v_pid returning token into v_token;
  insert into player_sessions(player_id, user_id) values (v_pid, auth.uid()) on conflict do nothing;
  return jsonb_build_object('player_id', v_pid, 'token', v_token, 'status', v_status);
end $$;

-- A player enters a score: for themselves ('self') or as marker for someone in their group ('marker').
create or replace function public.submit_score(p_player uuid, p_hole int, p_strokes int) returns text
language plpgsql security definer set search_path = public as $$
declare t players; me players; e events; v_role text; v_old smallint;
begin
  select * into t from players where id = p_player;
  if not found then raise exception 'Player not found'; end if;
  select * into e from events where id = t.event_id;
  select * into me from players where id = public.my_player(t.event_id);
  if me.id is null then raise exception 'Open your personal player link first'; end if;
  if e.status <> 'live' then raise exception 'Scoring is not open for this event'; end if;
  if me.status <> 'active' then raise exception 'Your entry has not been approved yet'; end if;
  if p_hole < 1 or p_hole > 18 then raise exception 'Hole must be 1 to 18'; end if;
  if p_strokes is not null and (p_strokes < 0 or p_strokes > 20) then raise exception 'Score must be 0 to 20'; end if;
  if me.id = t.id then
    v_role := 'self';
    if t.signed_at is not null then raise exception 'Your card is signed. Ask the organiser to reopen it'; end if;
  else
    if me.grp = 0 or me.grp <> t.grp then raise exception 'You can only mark players in your own group'; end if;
    v_role := 'marker';
    if t.attested_at is not null then raise exception 'This card has been attested and is locked'; end if;
  end if;
  select strokes into v_old from scores where player_id = t.id and hole = p_hole and role = v_role;
  if p_strokes is null then
    delete from scores where player_id = t.id and hole = p_hole and role = v_role;
  else
    insert into scores(event_id, player_id, hole, role, strokes, entered_by, entered_by_player)
    values (t.event_id, t.id, p_hole, v_role, p_strokes, auth.uid(), me.id)
    on conflict (player_id, hole, role) do update
      set strokes = excluded.strokes, entered_by = excluded.entered_by,
          entered_by_player = excluded.entered_by_player, updated_at = now();
  end if;
  if v_old is distinct from p_strokes then
    insert into score_log(event_id, player_id, hole, role, old_value, new_value, by_user, by_player)
    values (t.event_id, t.id, p_hole, v_role, v_old::text, p_strokes::text, auth.uid(), me.id);
  end if;
  return v_role;
end $$;

-- A team member enters the team score or whose drive was used (scramble formats).
create or replace function public.submit_team_score(p_event uuid, p_team text, p_hole int, p_field text, p_strokes int, p_drive uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare e events; me players; v_old text; v_new text;
begin
  select * into e from events where id = p_event;
  if not found then raise exception 'Event not found'; end if;
  if e.status <> 'live' then raise exception 'Scoring is not open for this event'; end if;
  select * into me from players where id = public.my_player(p_event);
  if me.id is null then raise exception 'Open your personal player link first'; end if;
  if public.team_key_of(me, e.format) <> p_team or me.grp = 0 then raise exception 'You can only score for your own team'; end if;
  if p_hole < 1 or p_hole > 18 then raise exception 'Hole must be 1 to 18'; end if;
  if exists (select 1 from players where event_id = p_event and public.team_key_of(players, e.format) = p_team and attested_at is not null) then
    raise exception 'This team card is locked';
  end if;
  if p_field = 'drive' and p_drive is not null and not exists
     (select 1 from players where id = p_drive and event_id = p_event and public.team_key_of(players, e.format) = p_team) then
    raise exception 'That player is not in your team';
  end if;
  insert into team_scores(event_id, team_key, hole) values (p_event, p_team, p_hole) on conflict do nothing;
  if p_field = 'strokes' then
    select strokes::text into v_old from team_scores where event_id = p_event and team_key = p_team and hole = p_hole;
    update team_scores set strokes = p_strokes, entered_by = auth.uid(), entered_by_player = me.id, updated_at = now()
      where event_id = p_event and team_key = p_team and hole = p_hole;
    v_new := p_strokes::text;
  elsif p_field = 'drive' then
    select drive_player::text into v_old from team_scores where event_id = p_event and team_key = p_team and hole = p_hole;
    update team_scores set drive_player = p_drive, entered_by = auth.uid(), entered_by_player = me.id, updated_at = now()
      where event_id = p_event and team_key = p_team and hole = p_hole;
    v_new := p_drive::text;
  else
    raise exception 'Unknown field';
  end if;
  if v_old is distinct from v_new then
    insert into score_log(event_id, team_key, hole, role, field, old_value, new_value, by_user, by_player)
    values (p_event, p_team, p_hole, 'team', p_field, v_old, v_new, auth.uid(), me.id);
  end if;
end $$;

-- Committee: set the official score for a hole (overrides self and marker), or clear the override.
create or replace function public.admin_set_score(p_player uuid, p_hole int, p_strokes int) returns void
language plpgsql security definer set search_path = public as $$
declare t players; v_old smallint;
begin
  select * into t from players where id = p_player;
  if not found then raise exception 'Player not found'; end if;
  if not public.is_event_admin(t.event_id) then raise exception 'Only event admins can do this'; end if;
  if p_hole < 1 or p_hole > 18 then raise exception 'Hole must be 1 to 18'; end if;
  select strokes into v_old from scores where player_id = t.id and hole = p_hole and role = 'admin';
  if p_strokes is null then
    delete from scores where player_id = t.id and hole = p_hole and role = 'admin';
  else
    insert into scores(event_id, player_id, hole, role, strokes, entered_by)
    values (t.event_id, t.id, p_hole, 'admin', p_strokes, auth.uid())
    on conflict (player_id, hole, role) do update set strokes = excluded.strokes, entered_by = excluded.entered_by, updated_at = now();
  end if;
  insert into score_log(event_id, player_id, hole, role, old_value, new_value, by_user)
  values (t.event_id, t.id, p_hole, 'admin', v_old::text, p_strokes::text, auth.uid());
end $$;

create or replace function public.admin_set_team_score(p_event uuid, p_team text, p_hole int, p_field text, p_strokes int, p_drive uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  if not public.is_event_admin(p_event) then raise exception 'Only event admins can do this'; end if;
  insert into team_scores(event_id, team_key, hole) values (p_event, p_team, p_hole) on conflict do nothing;
  if p_field = 'strokes' then
    select strokes::text into v_old from team_scores where event_id = p_event and team_key = p_team and hole = p_hole;
    update team_scores set strokes = p_strokes, entered_by = auth.uid(), entered_by_player = null, updated_at = now()
      where event_id = p_event and team_key = p_team and hole = p_hole;
  else
    select drive_player::text into v_old from team_scores where event_id = p_event and team_key = p_team and hole = p_hole;
    update team_scores set drive_player = p_drive, entered_by = auth.uid(), updated_at = now()
      where event_id = p_event and team_key = p_team and hole = p_hole;
  end if;
  insert into score_log(event_id, team_key, hole, role, field, old_value, new_value, by_user)
  values (p_event, p_team, p_hole, 'admin', p_field, v_old, coalesce(p_strokes::text, p_drive::text), auth.uid());
end $$;

-- Player signs their own card; a group member attests it. Both lock further edits by players.
create or replace function public.sign_card(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t players; e events;
begin
  select * into t from players where id = p_player;
  if not found or public.my_player(t.event_id) is distinct from t.id then raise exception 'You can only sign your own card'; end if;
  select * into e from events where id = t.event_id;
  if e.format not in ('scramble') and
     (select count(*) from scores where player_id = t.id and role = 'self') < 18 then
    raise exception 'Enter all 18 holes before signing';
  end if;
  update players set signed_at = now() where id = t.id;
end $$;

create or replace function public.attest_card(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t players; me players;
begin
  select * into t from players where id = p_player;
  if not found then raise exception 'Player not found'; end if;
  select * into me from players where id = public.my_player(t.event_id);
  if me.id is null or me.id = t.id or me.grp = 0 or me.grp <> t.grp then
    raise exception 'Only a marker in the same group can attest this card';
  end if;
  update players set attested_at = now(), attested_by = me.id where id = t.id;
end $$;

grant execute on function public.create_club(text, text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.claim_player(text) to authenticated;
grant execute on function public.register_player(text, text, numeric, text, text, text, text, text) to authenticated;
grant execute on function public.submit_score(uuid, int, int) to authenticated;
grant execute on function public.submit_team_score(uuid, text, int, text, int, uuid) to authenticated;
grant execute on function public.admin_set_score(uuid, int, int) to authenticated;
grant execute on function public.admin_set_team_score(uuid, text, int, text, int, uuid) to authenticated;
grant execute on function public.sign_card(uuid) to authenticated;
grant execute on function public.attest_card(uuid) to authenticated;
revoke execute on function public.create_club(text, text) from anon;
revoke execute on function public.accept_invite(text) from anon;
revoke execute on function public.claim_player(text) from anon;
revoke execute on function public.register_player(text, text, numeric, text, text, text, text, text) from anon;
revoke execute on function public.submit_score(uuid, int, int) from anon;
revoke execute on function public.submit_team_score(uuid, text, int, text, int, uuid) from anon;
revoke execute on function public.admin_set_score(uuid, int, int) from anon;
revoke execute on function public.admin_set_team_score(uuid, text, int, text, int, uuid) from anon;
revoke execute on function public.sign_card(uuid) from anon;
revoke execute on function public.attest_card(uuid) from anon;

-- ---------------------------------------------------------------------
-- Live updates
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  begin alter publication supabase_realtime add table public.scores;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.team_scores; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.players;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.events;      exception when duplicate_object then null; end;
end $$;

-- ---------------------------------------------------------------------
-- Logo storage: public bucket "branding"; paths clubs/<club_id>/... or events/<event_id>/...
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
on conflict (id) do nothing;

create or replace function public.can_write_branding(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(p_name, '/'); v uuid;
begin
  if array_length(parts, 1) < 3 then return false; end if;
  begin v := parts[2]::uuid; exception when others then return false; end;
  if parts[1] = 'clubs' then return public.is_club_admin(v); end if;
  if parts[1] = 'events' then return public.is_event_admin(v); end if;
  return false;
end $$;

drop policy if exists branding_read on storage.objects;
create policy branding_read on storage.objects for select using (bucket_id = 'branding');
drop policy if exists branding_insert on storage.objects;
create policy branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.can_write_branding(name));
drop policy if exists branding_update on storage.objects;
create policy branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.can_write_branding(name));
drop policy if exists branding_delete on storage.objects;
create policy branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.can_write_branding(name));
