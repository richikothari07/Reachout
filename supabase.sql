create extension if not exists pgcrypto;

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  file_name text not null,
  file_path text not null unique,
  file_type text not null check (file_type in ('connections','messages')),
  row_count integer not null default 0,
  status text not null default 'processing',
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  import_id uuid references public.imports(id) on delete cascade,
  linkedin_url text,
  dedupe_key text not null,
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  company text not null default '',
  position text not null default '',
  connected_on text not null default '',
  created_at timestamptz not null default now(),
  unique(user_id, dedupe_key)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  import_id uuid references public.imports(id) on delete cascade,
  conversation_id text,
  conversation_title text not null default '',
  sender_name text not null default '',
  sender_url text not null default '',
  recipient_name text not null default '',
  recipient_urls text not null default '',
  message_date text not null default '',
  subject text not null default '',
  content text not null default '',
  folder text not null default '',
  attachments text not null default '',
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique(user_id, dedupe_key)
);

-- Safe migrations for databases created by earlier ReachOut versions.
alter table public.connections add column if not exists email text not null default '';
alter table public.messages add column if not exists conversation_title text not null default '';
alter table public.messages add column if not exists subject text not null default '';
alter table public.messages add column if not exists attachments text not null default '';

create index if not exists connections_import_idx on public.connections(import_id);
create index if not exists messages_import_idx on public.messages(import_id);
create index if not exists connections_user_idx on public.connections(user_id);
create index if not exists connections_company_idx on public.connections(user_id, company);
create index if not exists messages_user_idx on public.messages(user_id);
create index if not exists messages_sender_idx on public.messages(user_id, sender_url);
create index if not exists messages_date_idx on public.messages(user_id, message_date desc);
create index if not exists imports_user_idx on public.imports(user_id);

-- Private bucket. The backend also self-heals this bucket if it is missing.
insert into storage.buckets (id, name, public)
values ('reachout-imports', 'reachout-imports', false)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
