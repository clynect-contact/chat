-- Run using the Supabase SQL editor before enabling Missions & CV.
-- This store is separate from the public/shared clynect_store and timeline.
create table if not exists public.clynect_copilot_records (
  owner_id uuid not null,
  kind text not null check (kind in ('session','conversation','draft','file','request','action','handoff','feedback','consent')),
  id text not null,
  data jsonb not null,
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  primary key (owner_id,kind,id)
);
alter table public.clynect_copilot_records enable row level security;
revoke all on public.clynect_copilot_records from anon, authenticated;
grant all on public.clynect_copilot_records to service_role;
create index if not exists clynect_copilot_records_expiry on public.clynect_copilot_records(expires_at);

create table if not exists public.clynect_copilot_usage (
  scope text not null,
  hour timestamptz not null,
  calls integer not null default 0,
  primary key(scope,hour)
);
alter table public.clynect_copilot_usage enable row level security;
revoke all on public.clynect_copilot_usage from anon, authenticated;
grant all on public.clynect_copilot_usage to service_role;

-- Atomic quotas: retries consume budget too; configured storage errors fail closed.
create or replace function public.clynect_copilot_consume(p_owner uuid,p_user_limit integer,p_global_limit integer)
returns boolean language plpgsql security definer set search_path = public,pg_temp as $$
declare h timestamptz := date_trunc('hour',now()); g integer; u integer;
begin
  insert into clynect_copilot_usage(scope,hour,calls) values('global',h,1)
    on conflict(scope,hour) do update set calls=clynect_copilot_usage.calls+1 returning calls into g;
  insert into clynect_copilot_usage(scope,hour,calls) values(p_owner::text,h,1)
    on conflict(scope,hour) do update set calls=clynect_copilot_usage.calls+1 returning calls into u;
  return g<=least(p_global_limit,1000) and u<=least(p_user_limit,100);
end $$;
revoke all on function public.clynect_copilot_consume(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.clynect_copilot_consume(uuid,integer,integer) to service_role;

-- Locks the owned conversation, saves its private draft, updates the review state,
-- and records the idempotent result in one transaction.
create or replace function public.clynect_copilot_save_draft(p_owner uuid,p_conversation text,p_revision integer,p_action text,p_hash text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
declare row_record clynect_copilot_records; old_action jsonb; c jsonb; d jsonb; result jsonb;
begin
  select * into row_record from clynect_copilot_records where owner_id=p_owner and kind='conversation' and id=p_conversation and expires_at>now() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select data into old_action from clynect_copilot_records where owner_id=p_owner and kind='action' and id=p_action and expires_at>now();
  if found then
    if old_action->>'hash'<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return old_action->'result';
  end if;
  c:=row_record.data; d:=c->'draft';
  if d is null or d='null'::jsonb or (d->>'revision')::integer<>p_revision then raise exception 'CONFLICT'; end if;
  if p_payload->>'id'<>d->>'id' or p_payload->>'status'<>'draft' then raise exception 'CONFLICT'; end if;
  d:=d || jsonb_build_object('saved_revision',p_revision,'user_confirmed_at',now());
  c:=c || jsonb_build_object('draft',d,'version',row_record.version+1,'updatedAt',now());
  insert into clynect_copilot_records(owner_id,kind,id,data,expires_at)
    values(p_owner,'draft',d->>'id',jsonb_build_object('kind',d->>'kind','body',p_payload || jsonb_build_object('status','draft','owner_id',p_owner,'user_confirmed_at',now())),row_record.expires_at)
    on conflict(owner_id,kind,id) do update set data=excluded.data,version=clynect_copilot_records.version+1,updated_at=now();
  update clynect_copilot_records set data=c,version=version+1,updated_at=now() where owner_id=p_owner and kind='conversation' and id=p_conversation;
  result:=jsonb_build_object('id',d->>'id','url','/copilot.html?draft='||(d->>'id'),'private',true,'conversation',c);
  insert into clynect_copilot_records(owner_id,kind,id,data,expires_at) values(p_owner,'action',p_action,jsonb_build_object('hash',p_hash,'result',result),row_record.expires_at);
  return result;
end $$;
revoke all on function public.clynect_copilot_save_draft(uuid,text,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.clynect_copilot_save_draft(uuid,text,integer,text,text,jsonb) to service_role;

-- Schedule in your existing maintenance job (or Supabase pg_cron).
-- Expired records are excluded from all application reads even before purge.
create or replace function public.clynect_copilot_purge()
returns void language sql security definer set search_path = public,pg_temp as $$
  delete from clynect_copilot_records where expires_at<=now();
  delete from clynect_copilot_usage where hour<now()-interval '2 days';
$$;
revoke all on function public.clynect_copilot_purge() from public,anon,authenticated;
grant execute on function public.clynect_copilot_purge() to service_role;
