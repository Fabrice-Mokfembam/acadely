-- Service-role-only provisioning keeps auth creation in the API while making
-- school + membership creation atomic inside Postgres.
create function public.platform_create_school(
 p_user uuid,
 p_admin_name text,
 p_admin_email text,
 p_school_name text,
 p_address text,
 p_year text,
 p_actor uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
 if not exists(select 1 from public.platform_admins where user_id = p_actor) then
  raise exception 'Platform owner access required';
 end if;
 if not exists(select 1 from auth.users where id = p_user) then
  raise exception 'Administrator account does not exist';
 end if;
 if length(trim(p_admin_name)) not between 2 and 120
  or p_admin_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or length(trim(p_school_name)) not between 2 and 200
  or p_year !~ '^20[0-9]{2}/20[0-9]{2}$' then
  raise exception 'Invalid school or administrator details';
 end if;

 insert into public.schools(name,address,year)
 values(trim(p_school_name),trim(coalesce(p_address,'')),p_year)
 returning id into sid;

 insert into public.memberships(school_id,user_id,name,email,role)
 values(sid,p_user,trim(p_admin_name),lower(trim(p_admin_email)),'admin');

 insert into public.audit_log(school_id,actor,operation,details)
 values(sid,p_actor,'platform_create_school',jsonb_build_object(
  'school_name',trim(p_school_name),
  'administrator',trim(p_admin_name),
  'email',lower(trim(p_admin_email))
 ));
 return sid;
end;
$$;

create function public.platform_activity(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if (select auth.uid()) is null then raise exception 'Sign in first'; end if;
 if not private.is_platform_admin() then raise exception 'Platform owner access required'; end if;
 select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc),'[]'::jsonb)
 into result from (
  select a.id,a.operation,a.created_at,s.id school_id,s.name school_name,
   coalesce(m.name,case when a.operation='platform_create_school' then 'Platform owner' else 'System' end) actor_name
  from public.audit_log a
  left join public.schools s on s.id=a.school_id
  left join public.memberships m on m.school_id=a.school_id and m.user_id=a.actor
  order by a.created_at desc,a.id desc
  limit least(greatest(p_limit,1),200)
 ) row_data;
 return result;
end;
$$;

revoke all on function public.platform_create_school(uuid,text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.platform_create_school(uuid,text,text,text,text,text,uuid) to service_role;
revoke all on function public.platform_activity(int) from public,anon;
grant execute on function public.platform_activity(int) to authenticated;
