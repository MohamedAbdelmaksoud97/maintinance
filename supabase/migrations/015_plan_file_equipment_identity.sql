alter table public.equipment
  add column if not exists plan_identity_key text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'equipment_area_id_equipment_code_key'
      and conrelid = 'public.equipment'::regclass
  ) then
    alter table public.equipment drop constraint equipment_area_id_equipment_code_key;
  end if;
end;
$$;

create index if not exists equipment_area_code_idx
on public.equipment (area_id, equipment_code);

create unique index if not exists equipment_area_plan_identity_key_idx
on public.equipment (area_id, plan_identity_key);

update public.equipment
set is_active = false,
    original_values = coalesce(original_values, '{}'::jsonb) || '{"superseded_by_plan_files": true}'::jsonb,
    updated_at = now()
where original_values->>'source_mode' = 'master_equipment'
  and coalesce(original_values->>'equipment_identity', '') <> 'plan_file_row';

notify pgrst, 'reload schema';
