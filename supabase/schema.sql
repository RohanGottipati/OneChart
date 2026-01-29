-- Supabase schema for multi-user sessions, notes, transcripts, and patient context

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  gender text,
  dob date,
  notes text,
  created_at timestamp with time zone default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  patient_name text,
  patient_gender text,
  title text,
  status text default 'draft',
  template_id text,
  template_name text,
  created_at timestamp with time zone default now()
);

create table if not exists public.session_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  title text,
  note_type text,
  content text,
  created_at timestamp with time zone default now()
);

create table if not exists public.session_transcripts (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  transcript text,
  created_at timestamp with time zone default now()
);

create table if not exists public.session_context (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  context text,
  created_at timestamp with time zone default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  practice text,
  speciality text,
  phone_number text,
  practice_name text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.patients enable row level security;
alter table public.sessions enable row level security;
alter table public.session_notes enable row level security;
alter table public.session_transcripts enable row level security;
alter table public.session_context enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Patients are user-owned" on public.patients;
create policy "Patients are user-owned" on public.patients
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Sessions are user-owned" on public.sessions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Notes belong to user's sessions" on public.session_notes
for all
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_notes.session_id
    and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sessions s
    where s.id = session_notes.session_id
    and s.user_id = auth.uid()
  )
);

create policy "Transcripts belong to user's sessions" on public.session_transcripts
for all
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_transcripts.session_id
    and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sessions s
    where s.id = session_transcripts.session_id
    and s.user_id = auth.uid()
  )
);

create policy "Context belongs to user's sessions" on public.session_context
for all
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_context.session_id
    and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sessions s
    where s.id = session_context.session_id
    and s.user_id = auth.uid()
  )
);

create policy "Profiles are user-owned" on public.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, split_part(new.email, '@', 1), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();