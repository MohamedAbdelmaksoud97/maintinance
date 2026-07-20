create or replace function ensure_worker_profile()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid;
  auth_email text;
  requested_name text;
  profile_role text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    return;
  end if;

  select
    u.email,
    coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
  into auth_email, requested_name
  from auth.users u
  where u.id = current_user_id;

  if auth_email is null then
    return;
  end if;

  insert into profiles (id, email, full_name, role, approval_status, is_active)
  values (current_user_id, auth_email, requested_name, 'worker', 'pending', false)
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(profiles.full_name, excluded.full_name),
      updated_at = now();

  select role into profile_role
  from profiles
  where id = current_user_id;

  if profile_role <> 'worker' then
    return;
  end if;

  insert into workers (profile_id, full_name, is_active)
  values (current_user_id, requested_name, false)
  on conflict (profile_id) do update
  set full_name = coalesce(workers.full_name, excluded.full_name),
      updated_at = now();
end;
$$;

revoke all on function ensure_worker_profile() from public, anon, authenticated;
grant execute on function ensure_worker_profile() to authenticated;
