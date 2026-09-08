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
  sender_name text not null default '',
  sender_url text not null default '',
  recipient_name text not null default '',
  recipient_urls text not null default '',
  message_date text not null default '',
  content text not null default '',
  folder text not null default '',
  created_at timestamptz not null default now(),
  dedupe_key text not null,
  unique(user_id, dedupe_key)
);

create index if not exists connections_import_idx on public.connections(import_id);
create index if not exists messages_import_idx on public.messages(import_id);
create index if not exists connections_user_idx on public.connections(user_id);
create index if not exists connections_company_idx on public.connections(user_id, company);
create index if not exists messages_user_idx on public.messages(user_id);
create index if not exists messages_sender_idx on public.messages(user_id, sender_url);
create index if not exists messages_date_idx on public.messages(user_id, message_date desc);

create or replace function public.get_message_stats(p_user_id uuid, p_owner_name text default 'Richi Kothari')
returns table (
  contact_url text,
  contact_name text,
  outgoing_count bigint,
  incoming_count bigint,
  last_outgoing text,
  last_incoming text
)
language sql stable
as $$
  with expanded as (
    select
      m.*,
      case
        when lower(trim(m.sender_name)) = lower(trim(p_owner_name)) then true
        else false
      end as is_self
    from public.messages m
    where m.user_id = p_user_id
  ),
  contacts as (
    select
      case when is_self then nullif(recipient_urls,'') else nullif(sender_url,'') end as url,
      case when is_self then nullif(recipient_name,'') else nullif(sender_name,'') end as name,
      is_self,
      message_date
    from expanded
  )
  select
    url,
    max(name) filter (where name is not null),
    count(*) filter (where is_self),
    count(*) filter (where not is_self),
    max(message_date) filter (where is_self),
    max(message_date) filter (where not is_self)
  from contacts
  where url is not null
  group by url;
$$;

-- Storage bucket. If this fails in SQL editor because storage already exists,
-- create a private bucket named reachout-imports manually in Storage.
insert into storage.buckets (id, name, public)
values ('reachout-imports', 'reachout-imports', false)
on conflict (id) do nothing;


-- Backend dashboard RPC. All dashboard table reads happen inside Postgres,
-- so the Next.js API does not depend on PostgREST table schema discovery.
create or replace function public.get_reachout_dashboard(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'connections', coalesce((
      select jsonb_agg(to_jsonb(c) - 'id')
      from (
        select first_name,last_name,linkedin_url,company,position,connected_on
        from public.connections
        where user_id = p_user_id
        order by created_at desc
        limit 50000
      ) c
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(m) - 'id')
      from (
        select sender_name,sender_url,recipient_name,recipient_urls,message_date
        from public.messages
        where user_id = p_user_id
        order by created_at asc
        limit 100000
      ) m
    ), '[]'::jsonb),
    'imports', coalesce((
      select jsonb_agg(to_jsonb(i) - 'user_id')
      from (
        select id,file_name,file_type,row_count,status,error,created_at
        from public.imports
        where user_id = p_user_id
        order by created_at desc
        limit 100
      ) i
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_reachout_dashboard(uuid) from public;
grant execute on function public.get_reachout_dashboard(uuid) to service_role;

-- Ask PostgREST to reload its schema immediately after the setup.
notify pgrst, 'reload schema';


-- Backend-only import RPCs. These keep CSV imports off the PostgREST table API,
-- which makes imports resilient to a stale PostgREST schema cache.
create or replace function public.create_reachout_import(
  p_user_id uuid,
  p_file_name text,
  p_file_path text,
  p_file_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.imports(user_id,file_name,file_path,file_type,status)
  values(p_user_id,p_file_name,p_file_path,p_file_type,'processing')
  returning id into v_id;
  return v_id;
end;
$$;


create or replace function public.import_connections_batch(
  p_user_id uuid,
  p_import_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  insert into public.connections(
    user_id, import_id, linkedin_url, dedupe_key,
    first_name, last_name, company, position, connected_on
  )
  select
    p_user_id,
    p_import_id,
    nullif(x.linkedin_url,''),
    x.dedupe_key,
    coalesce(x.first_name,''),
    coalesce(x.last_name,''),
    coalesce(x.company,''),
    coalesce(x.position,''),
    coalesce(x.connected_on,'')
  from jsonb_to_recordset(p_rows) as x(
    linkedin_url text,
    dedupe_key text,
    first_name text,
    last_name text,
    company text,
    position text,
    connected_on text
  )
  on conflict (user_id,dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.import_messages_batch(
  p_user_id uuid,
  p_import_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  insert into public.messages(
    user_id, import_id, conversation_id, sender_name, sender_url,
    recipient_name, recipient_urls, message_date, content, folder, dedupe_key
  )
  select
    p_user_id,
    p_import_id,
    coalesce(x.conversation_id,''),
    coalesce(x.sender_name,''),
    coalesce(x.sender_url,''),
    coalesce(x.recipient_name,''),
    coalesce(x.recipient_urls,''),
    coalesce(x.message_date,''),
    coalesce(x.content,''),
    coalesce(x.folder,''),
    x.dedupe_key
  from jsonb_to_recordset(p_rows) as x(
    conversation_id text,
    sender_name text,
    sender_url text,
    recipient_name text,
    recipient_urls text,
    message_date text,
    content text,
    folder text,
    dedupe_key text
  )
  on conflict (user_id,dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.finish_reachout_import(
  p_import_id uuid,
  p_row_count integer
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.imports
  set row_count = p_row_count, status = 'ready', error = null
  where id = p_import_id;
$$;

create or replace function public.fail_reachout_import(
  p_import_id uuid,
  p_error text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.imports
  set status = 'error', error = left(coalesce(p_error,'Import failed.'),4000)
  where id = p_import_id;
$$;

grant execute on function public.create_reachout_import(uuid,text,text,text) to service_role;
grant execute on function public.import_connections_batch(uuid,uuid,jsonb) to service_role;
grant execute on function public.import_messages_batch(uuid,uuid,jsonb) to service_role;
grant execute on function public.finish_reachout_import(uuid,integer) to service_role;
grant execute on function public.fail_reachout_import(uuid,text) to service_role;

notify pgrst, 'reload schema';
