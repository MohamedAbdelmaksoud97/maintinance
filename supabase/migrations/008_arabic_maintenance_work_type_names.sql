update public.maintenance_work_types
set name = case code
  when 'inspection' then 'فحص'
  when 'greasing' then 'إضافة شحم'
  when 'oil_change' then 'تغيير زيت'
  when 'grease_change' then 'تغيير شحم'
  else name
end
where code in ('inspection', 'greasing', 'oil_change', 'grease_change');
