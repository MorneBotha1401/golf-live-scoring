-- =====================================================================
-- 002 · Self-service and payments
-- Run after schema.sql (Supabase → SQL Editor → New query → paste → Run).
-- Safe to re-run.
--
-- * Organisations (the clubs table) get a type, a country and a plan
--   ('pay' = pays per event, 'comp' = free, set only by the platform owner).
-- * A shared course library; organisers copy a course into their own account.
-- * Events get a number of days and paid days. Scoring can only be opened once
--   every day is paid for, and only from the day before the event until the
--   day after it ends. Players' scores are refused outside that window.
-- * Payments are recorded by the payment webhooks (server side only).
-- * Platform owner: app settings (price), comps, overview of everything.
-- =====================================================================

-- ---------- organisations ----------
alter table public.clubs add column if not exists kind text not null default 'club';
alter table public.clubs add column if not exists country text;
alter table public.clubs add column if not exists plan text not null default 'pay';
do $$ begin
  alter table public.clubs add constraint clubs_kind_chk check (kind in ('club','company','charity','school','other'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.clubs add constraint clubs_plan_chk check (plan in ('pay','comp'));
exception when duplicate_object then null; end $$;

-- ---------- course library ----------
alter table public.courses add column if not exists shared boolean not null default false;
alter table public.courses add column if not exists verified boolean not null default false;
alter table public.courses add column if not exists location text;
alter table public.courses add column if not exists source_course_id uuid references public.courses(id) on delete set null;
create index if not exists courses_shared_idx on public.courses(shared, name);

-- ---------- events: days and payment ----------
alter table public.events add column if not exists days smallint not null default 1;
alter table public.events add column if not exists paid_days smallint not null default 0;
alter table public.events add column if not exists paid_at timestamptz;
do $$ begin
  alter table public.events add constraint events_days_chk check (days between 1 and 7 and paid_days between 0 and 30);
exception when duplicate_object then null; end $$;

-- ---------- platform ----------
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id               int primary key default 1 check (id = 1),
  price_cents      int  not null default 5000,     -- per event day, in the main currency
  currency         text not null default 'usd',
  price_zar_cents  int  not null default 90000,    -- per event day for rand gateways (Paystack)
  free_mode        boolean not null default false, -- true = nobody pays (launch promos, testing)
  routes           jsonb not null default '{"default":"stripe","ZA":"paystack"}'::jsonb,
  updated_at       timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  club_id       uuid not null references public.clubs(id) on delete cascade,
  provider      text not null check (provider in ('stripe','paystack','comp')),
  provider_ref  text unique,
  days          smallint not null default 1,
  amount_cents  int not null default 0,
  currency      text not null default 'usd',
  status        text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  payer_email   text,
  receipt_url   text,
  country       text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
create index if not exists payments_event_idx on public.payments(event_id, created_at desc);

-- ---------- helpers ----------
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- True for the database owner, the server (service role) and the platform owner.
-- Runs as the caller (not security definer), so current_user is the real caller.
create or replace function public.can_manage_billing() returns boolean
language sql stable security invoker set search_path = public as $$
  select current_user in ('postgres', 'supabase_admin', 'service_role')
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or public.is_platform_admin();
$$;

-- Free for this event? (comp organisation or free launch mode)
create or replace function public.event_is_free(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select free_mode from app_settings where id = 1), false)
      or coalesce((select plan = 'comp' from clubs where id = p_club), false);
$$;

-- Players may score from the day before the event until the day after it ends.
create or replace function public.in_scoring_window(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.event_is_free(e.club_id)
        or current_date between e.event_date - 1 and e.event_date + e.days
    from events e where e.id = p_event), false);
$$;

-- ---------- guards ----------
-- Trigger functions run as the caller too, for the same reason; lookups they need go through definer helpers.
create or replace function public.event_has_scores(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from scores where event_id = p_event) or exists (select 1 from team_scores where event_id = p_event);
$$;
create or replace function public.tg_events_billing() returns trigger
language plpgsql security invoker set search_path = public as $$
declare v_free boolean;
begin
  if public.can_manage_billing() then return new; end if;
  if tg_op = 'INSERT' then
    new.paid_days := 0; new.paid_at := null; new.status := 'draft';
    return new;
  end if;
  if new.paid_days is distinct from old.paid_days or new.paid_at is distinct from old.paid_at then
    raise exception 'Payments can only be recorded by the payment system';
  end if;
  if (new.event_date is distinct from old.event_date or new.days is distinct from old.days)
     and public.event_has_scores(new.id) then
    raise exception 'The date can''t change once scores have been entered';
  end if;
  if new.status = 'live' and old.status is distinct from 'live' then
    v_free := public.event_is_free(new.club_id);
    if not v_free and new.paid_days < new.days then
      raise exception 'Pay for this event to open scoring (% of % day(s) paid)', new.paid_days, new.days;
    end if;
    if not v_free and not (current_date between new.event_date - 1 and new.event_date + new.days) then
      raise exception 'Scoring can be opened from the day before the event until the day after it ends. Change the event date under Event details if it has moved.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists events_billing on public.events;
create trigger events_billing before insert or update on public.events
  for each row execute function public.tg_events_billing();

create or replace function public.tg_clubs_plan() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' and not public.can_manage_billing() then new.plan := 'pay'; end if;
  if tg_op = 'UPDATE' and new.plan is distinct from old.plan and not public.can_manage_billing() then
    raise exception 'Only the platform owner can change an organisation''s plan';
  end if;
  return new;
end $$;
drop trigger if exists clubs_plan on public.clubs;
create trigger clubs_plan before insert or update on public.clubs
  for each row execute function public.tg_clubs_plan();

create or replace function public.tg_courses_verified() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if public.can_manage_billing() then return new; end if;
  if tg_op = 'INSERT' then new.verified := false; return new; end if;
  if new.verified is distinct from old.verified then raise exception 'Only the platform owner can verify courses'; end if;
  return new;
end $$;
drop trigger if exists courses_verified on public.courses;
create trigger courses_verified before insert or update on public.courses
  for each row execute function public.tg_courses_verified();

-- Players' scores outside the scoring window are refused; committee corrections are always allowed.
create or replace function public.tg_scores_window() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if tg_table_name = 'scores' and new.role = 'admin' then return new; end if;
  if tg_table_name = 'team_scores' and new.entered_by_player is null then return new; end if;
  if not public.in_scoring_window(new.event_id) then
    raise exception 'Scoring has closed for this event';
  end if;
  return new;
end $$;
drop trigger if exists scores_window on public.scores;
create trigger scores_window before insert or update on public.scores
  for each row execute function public.tg_scores_window();
drop trigger if exists team_scores_window on public.team_scores;
create trigger team_scores_window before insert or update on public.team_scores
  for each row execute function public.tg_scores_window();

-- ---------- course library: copy a course into your organisation ----------
create or replace function public.copy_course(p_course uuid, p_club uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; c courses;
begin
  if not public.is_club_admin(p_club) then raise exception 'Only this organisation''s admins can add courses'; end if;
  select * into c from courses where id = p_course and (shared or club_id = p_club);
  if not found then raise exception 'Course not found'; end if;
  if c.club_id = p_club then return c.id; end if;
  select id into v_id from courses where club_id = p_club and source_course_id = c.id limit 1;
  if v_id is not null then return v_id; end if;
  insert into courses (club_id, name, location, holes, tees, shared, verified, source_course_id)
  values (p_club, c.name, c.location, c.holes, c.tees, false, c.verified, c.id) returning id into v_id;
  return v_id;
end $$;
grant execute on function public.copy_course(uuid, uuid) to authenticated;
revoke execute on function public.copy_course(uuid, uuid) from anon;

-- Organisation with a type and country (replaces the simple create_club for new sign-ups).
create or replace function public.create_organisation(p_name text, p_kind text default 'club', p_country text default null, p_location text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_real_user() then raise exception 'Sign in with your email first'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter the name of your organisation'; end if;
  insert into clubs (name, location, kind, country)
  values (trim(p_name), nullif(trim(coalesce(p_location, '')), ''), coalesce(nullif(p_kind, ''), 'club'), nullif(upper(trim(coalesce(p_country, ''))), ''))
  returning id into v_id;
  insert into club_members (club_id, user_id, role, email) values (v_id, auth.uid(), 'owner', auth.jwt() ->> 'email');
  return v_id;
end $$;
grant execute on function public.create_organisation(text, text, text, text) to authenticated;
revoke execute on function public.create_organisation(text, text, text, text) from anon;

-- ---------- row level security ----------
alter table public.platform_admins enable row level security;
alter table public.app_settings    enable row level security;
alter table public.payments        enable row level security;

drop policy if exists platform_admins_read on public.platform_admins;
create policy platform_admins_read on public.platform_admins for select using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select using (true);
drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings for update using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select using (public.is_event_admin(event_id) or public.is_platform_admin());
-- no insert/update/delete policies: only the server (service role) writes payments

-- Platform owner sees and manages everything.
drop policy if exists events_platform on public.events;
create policy events_platform on public.events for all using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists clubs_platform on public.clubs;
create policy clubs_platform on public.clubs for update using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists courses_platform on public.courses;
create policy courses_platform on public.courses for update using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists members_platform on public.club_members;
create policy members_platform on public.club_members for select using (public.is_platform_admin());
drop policy if exists players_platform on public.players;
create policy players_platform on public.players for select using (public.is_platform_admin());
