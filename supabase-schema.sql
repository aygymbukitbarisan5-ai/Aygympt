-- AY GYM PT ONLINE — SUPABASE DATABASE
-- Jalankan seluruh file ini di Supabase > SQL Editor.
-- Setelah itu buat akun pertama lewat website dan jadikan akun tersebut admin
-- dengan SQL: update public.profiles set role='admin' where email='EMAIL_ADMIN';

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin','trainer','client');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.user_role not null default 'client',
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  trainer_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  phone text,
  goal text,
  start_date date,
  package_name text,
  total_sessions integer not null default 10 check (total_sessions > 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  trainer_id uuid references public.profiles(id) on delete set null,
  session_number integer not null,
  session_date date not null default current_date,
  duration_minutes integer,
  weight_kg numeric(5,1),
  waist_cm numeric(5,1),
  body_fat_pct numeric(5,1),
  focus text,
  energy text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  trainer_id uuid references public.profiles(id) on delete set null,
  exercise_name text not null,
  muscle_group text,
  weight_kg numeric(6,2),
  sets integer,
  reps integer,
  rest_seconds integer,
  rpe numeric(3,1),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists clients_trainer_idx on public.clients(trainer_id);
create index if not exists clients_user_idx on public.clients(user_id);
create index if not exists sessions_client_idx on public.sessions(client_id);
create index if not exists sessions_date_idx on public.sessions(session_date);
create index if not exists exercises_session_idx on public.exercises(session_id);

-- Profile otomatis dibuat ketika user mendaftar.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id,email,full_name)
  values (new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Helper role functions untuk RLS, agar policy tidak recursive.
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin')
$$;

create or replace function public.is_trainer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','trainer'))
$$;

create or replace function public.can_access_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists(select 1 from public.clients c where c.id=p_client_id and c.trainer_id=auth.uid())
    or exists(select 1 from public.clients c where c.id=p_client_id and c.user_id=auth.uid())
$$;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.sessions enable row level security;
alter table public.exercises enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (id=auth.uid() or public.is_admin());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
using (public.can_access_client(id));

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated
with check (public.is_admin() or trainer_id=auth.uid());

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients for update to authenticated
using (public.is_admin() or trainer_id=auth.uid())
with check (public.is_admin() or trainer_id=auth.uid());

drop policy if exists clients_delete_admin on public.clients;
create policy clients_delete_admin on public.clients for delete to authenticated
using (public.is_admin());

drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions for select to authenticated
using (public.can_access_client(client_id));

drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions for insert to authenticated
with check (public.is_admin() or trainer_id=auth.uid());

drop policy if exists sessions_update on public.sessions;
create policy sessions_update on public.sessions for update to authenticated
using (public.is_admin() or trainer_id=auth.uid())
with check (public.is_admin() or trainer_id=auth.uid());

drop policy if exists sessions_delete on public.sessions;
create policy sessions_delete on public.sessions for delete to authenticated
using (public.is_admin() or trainer_id=auth.uid());

drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises for select to authenticated
using (public.can_access_client(client_id));

drop policy if exists exercises_insert on public.exercises;
create policy exercises_insert on public.exercises for insert to authenticated
with check (public.is_admin() or trainer_id=auth.uid());

drop policy if exists exercises_update on public.exercises;
create policy exercises_update on public.exercises for update to authenticated
using (public.is_admin() or trainer_id=auth.uid())
with check (public.is_admin() or trainer_id=auth.uid());

drop policy if exists exercises_delete on public.exercises;
create policy exercises_delete on public.exercises for delete to authenticated
using (public.is_admin() or trainer_id=auth.uid());

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.clients, public.sessions, public.exercises to authenticated;
grant insert, update, delete on public.clients, public.sessions, public.exercises to authenticated;
grant update on public.profiles to authenticated;
