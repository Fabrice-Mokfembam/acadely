-- Platform-owner access is deliberately separate from per-school memberships.
create table public.platform_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 created_by uuid references auth.users(id)
);

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;
grant select, insert, delete on public.platform_admins to service_role;

create function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from public.platform_admins
  where user_id = (select auth.uid())
 );
$$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select private.is_platform_admin();
$$;

create function public.platform_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
 if not private.is_platform_admin() then raise exception 'Platform owner access required'; end if;

 select jsonb_build_object(
  'totals', jsonb_build_object(
   'schools', (select count(*) from public.schools),
   'classes', (select count(*) from public.classes),
   'students', (select count(*) from public.students),
   'teachers', (select count(*) from public.memberships where role = 'teacher'),
   'subjects', (select count(*) from public.subjects)
  ),
  'schools', coalesce((
   select jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'address', s.address,
    'year', s.year,
    'created_at', s.created_at,
    'last_activity_at', (select max(a.created_at) from public.audit_log a where a.school_id = s.id),
    'admins', coalesce((
     select jsonb_agg(jsonb_build_object('name', m.name, 'email', m.email) order by m.name)
     from public.memberships m where m.school_id = s.id and m.role = 'admin'
    ), '[]'::jsonb),
    'counts', jsonb_build_object(
     'classes', (select count(*) from public.classes c where c.school_id = s.id),
     'students', (select count(*) from public.students st where st.school_id = s.id),
     'teachers', (select count(*) from public.memberships m where m.school_id = s.id and m.role = 'teacher'),
     'subjects', (select count(*) from public.subjects sb where sb.school_id = s.id),
     'approved_reports', (select count(*) from public.approvals a where a.school_id = s.id)
    ),
    'classes', coalesce((
     select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'level', c.level,
      'section', c.section,
      'academic_year', c.academic_year,
      'students', (select count(*) from public.students st where st.school_id = s.id and st.class_id = c.id),
      'subjects', (select count(*) from public.subjects sb where sb.school_id = s.id and sb.class_id = c.id),
      'assigned_teachers', (select count(distinct sb.teacher_id) from public.subjects sb where sb.school_id = s.id and sb.class_id = c.id)
     ) order by c.academic_year desc, c.name)
     from public.classes c where c.school_id = s.id
    ), '[]'::jsonb)
   ) order by s.created_at desc)
   from public.schools s
  ), '[]'::jsonb)
 ) into result;
 return result;
end;
$$;

revoke all on function private.is_platform_admin() from public, anon, authenticated;
revoke all on function public.is_platform_admin(), public.platform_overview() from public, anon;
grant execute on function public.is_platform_admin(), public.platform_overview() to authenticated;
