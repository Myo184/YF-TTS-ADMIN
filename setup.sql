-- YF TTS Studio Admin schema
-- Review against your existing schema before applying to production.

create extension if not exists pgcrypto;

-- Existing app already uses public.profiles(id, display_name, updated_at).
-- These optional columns support the admin user table.
alter table public.profiles
  add column if not exists email text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists account_status text not null default 'active',
  add column if not exists plan text not null default 'free',
  add column if not exists vip_expires_at timestamptz;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_sliders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  image_path text not null,
  target_url text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('yf-admin-media', 'yf-admin-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

alter table public.admin_users enable row level security;
alter table public.app_sliders enable row level security;
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;

-- Admins can read their own admin membership row.
drop policy if exists "admin can read own membership" on public.admin_users;
create policy "admin can read own membership"
on public.admin_users for select to authenticated
using (user_id = auth.uid());

-- Admin-only management for sliders and settings.
drop policy if exists "admins manage sliders" on public.app_sliders;
create policy "admins manage sliders"
on public.app_sliders for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "admins manage settings" on public.app_settings;
create policy "admins manage settings"
on public.app_settings for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

-- Authenticated users may read active slider metadata for the mobile app.
drop policy if exists "authenticated read active sliders" on public.app_sliders;
create policy "authenticated read active sliders"
on public.app_sliders for select to authenticated
using (is_active = true);

-- Admins may read profiles. Normal users should only read their own profile.
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Storage policies: public read, admin-only upload/update/delete.
drop policy if exists "public read yf admin media" on storage.objects;
create policy "public read yf admin media"
on storage.objects for select to public
using (bucket_id = 'yf-admin-media');

drop policy if exists "admins upload yf admin media" on storage.objects;
create policy "admins upload yf admin media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'yf-admin-media'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

drop policy if exists "admins update yf admin media" on storage.objects;
create policy "admins update yf admin media"
on storage.objects for update to authenticated
using (
  bucket_id = 'yf-admin-media'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
)
with check (
  bucket_id = 'yf-admin-media'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

drop policy if exists "admins delete yf admin media" on storage.objects;
create policy "admins delete yf admin media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'yf-admin-media'
  and exists (select 1 from public.admin_users a where a.user_id = auth.uid())
);

-- Seed default settings.
insert into public.app_settings(setting_key, setting_value)
values
 ('announcement', '{"enabled":false,"title":"","message":""}'::jsonb),
 ('maintenance', '{"enabled":false,"message":"We will be back soon."}'::jsonb)
on conflict (setting_key) do nothing;
