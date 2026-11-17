-- Independent optional cloud storage for Opora 2.0.
-- Apply in the Supabase SQL editor for the owner's project.
-- No service-role key belongs in the browser or repository.

create table if not exists public.opora_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision >= 1),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.opora_snapshots enable row level security;

drop policy if exists "opora_select_own" on public.opora_snapshots;
create policy "opora_select_own" on public.opora_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "opora_insert_own" on public.opora_snapshots;
create policy "opora_insert_own" on public.opora_snapshots
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "opora_update_own" on public.opora_snapshots;
create policy "opora_update_own" on public.opora_snapshots
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "opora_delete_own" on public.opora_snapshots;
create policy "opora_delete_own" on public.opora_snapshots
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.opora_snapshots to authenticated;

create or replace function public.opora_sync_push(
  p_snapshot jsonb,
  p_expected_revision bigint
)
returns table(ok boolean, conflict boolean, revision bigint, snapshot jsonb)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_revision bigint;
  v_payload jsonb;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'snapshot must be a JSON object' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid expected revision' using errcode = '22023';
  end if;

  select s.revision, s.payload into v_revision, v_payload
    from public.opora_snapshots s where s.user_id = v_user for update;

  if not found then
    if p_expected_revision <> 0 then
      return query select false, true, 0::bigint, null::jsonb;
      return;
    end if;
    insert into public.opora_snapshots(user_id, revision, payload)
      values (v_user, 1, p_snapshot)
      on conflict (user_id) do nothing;
    if found then
      return query select true, false, 1::bigint, p_snapshot;
      return;
    end if;
    select s.revision, s.payload into v_revision, v_payload
      from public.opora_snapshots s where s.user_id = v_user for update;
  end if;

  if v_revision <> p_expected_revision then
    return query select false, true, v_revision, v_payload;
    return;
  end if;

  update public.opora_snapshots s
    set revision = s.revision + 1, payload = p_snapshot, updated_at = now()
    where s.user_id = v_user
    returning s.revision into v_revision;
  return query select true, false, v_revision, p_snapshot;
end;
$$;

create or replace function public.opora_sync_delete()
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  delete from public.opora_snapshots where user_id = v_user;
  return true;
end;
$$;

revoke all on function public.opora_sync_push(jsonb, bigint) from public, anon;
revoke all on function public.opora_sync_delete() from public, anon;
grant execute on function public.opora_sync_push(jsonb, bigint) to authenticated;
grant execute on function public.opora_sync_delete() to authenticated;
