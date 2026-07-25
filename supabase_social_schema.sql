-- 1. Create or Update public.profiles table
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  username text unique not null,
  avatar_url text,
  updated_at timestamp with time zone
);

-- Ensure our new social columns exist
alter table public.profiles
add column if not exists email text unique,
add column if not exists display_name text;

-- 2. Configure Row Level Security (RLS) for profiles
alter table public.profiles enable row level security;

-- Drop existing policies if you're re-running this, to avoid errors
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Users can insert their own profile." on public.profiles;
drop policy if exists "Users can update own profile." on public.profiles;

-- Allow all authenticated users to read the global profiles list
create policy "Public profiles are viewable by everyone." on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "Users can insert their own profile." on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on public.profiles
  for update using (auth.uid() = id);

-- 3. Database Trigger to automatically sync auth.users into public.profiles
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, username)
  values (
    new.id, 
    new.email, 
    split_part(new.email, '@', 1),
    split_part(new.email, '@', 1) || '_' || substr(md5(random()::text), 1, 6)
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. Backfill any existing users that might have been missed
insert into public.profiles (id, email, display_name, username)
select 
  id, 
  email, 
  split_part(email, '@', 1),
  split_part(email, '@', 1) || '_' || substr(md5(random()::text), 1, 6)
from auth.users
on conflict (id) do update 
set email = excluded.email, 
    display_name = excluded.display_name;
