-- Run once in Supabase SQL Editor on a NEW project, or with supabase db push.
create schema if not exists private;
create function private.valid_ranges(r jsonb) returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(r)<>'array' then false else jsonb_array_length(r) between 1 and 20 and
 not exists(select 1 from jsonb_array_elements(r) a where jsonb_typeof(a->'min')<>'number' or (a->>'min')::numeric not between 0 and 20 or length(coalesce(a->>'en','')) not between 1 and 60 or length(coalesce(a->>'fr','')) not between 1 and 60) and
 exists(select 1 from jsonb_array_elements(r) a where (a->>'min')::numeric=0) and
 (select count(*)=count(distinct a->>'min') from jsonb_array_elements(r) a) end; $$;
create table public.schools (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name)>1), address text not null default '', year text not null default '2026/2027' check(year ~ '^20[0-9]{2}/20[0-9]{2}$'), logo_data text check(logo_data is null or logo_data='' or (length(logo_data)<450000 and logo_data ~ '^data:image/(png|jpeg);base64,')), remark_ranges jsonb not null default '[{"min":16,"en":"Very good","fr":"Très bien"},{"min":14,"en":"Good","fr":"Bien"},{"min":12,"en":"Fairly good","fr":"Assez bien"},{"min":10,"en":"Pass","fr":"Passable"},{"min":0,"en":"Needs improvement","fr":"Insuffisant"}]'::jsonb check(private.valid_ranges(remark_ranges)), created_at timestamptz not null default now()
);
create table public.memberships (
 school_id uuid references public.schools on delete cascade, user_id uuid references auth.users on delete cascade,
 name text not null, email text not null, role text not null check(role in ('admin','teacher')), primary key(school_id,user_id)
);
create table public.classes (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools on delete cascade,
 academic_year text not null, name text not null, level text not null, section text not null check(section in ('English','French')),
 unique(school_id,id), unique(school_id,academic_year,name,section)
);
create table public.students (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, class_id uuid not null, code text not null check(length(trim(code))>0), name text not null check(length(trim(name))>0), dob date,
 foreign key(school_id,class_id) references public.classes(school_id,id) on delete cascade, unique(school_id,id), unique(school_id,class_id,code)
);
create table public.subjects (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, class_id uuid not null, name text not null,
 coefficient numeric not null check(coefficient>0 and coefficient<=100), teacher_id uuid not null,
 foreign key(school_id,class_id) references public.classes(school_id,id) on delete cascade,
 foreign key(school_id,teacher_id) references public.memberships(school_id,user_id), unique(school_id,id), unique(school_id,class_id,name)
);
create table public.marks (
 school_id uuid not null, student_id uuid not null, subject_id uuid not null, sequence int not null check(sequence between 1 and 6),
 value numeric, status text not null check(status in ('mark','absent','exempt')), revision int not null default 1,
 updated_by uuid references auth.users, updated_at timestamptz not null default now(),
 foreign key(school_id,student_id) references public.students(school_id,id) on delete cascade,
 foreign key(school_id,subject_id) references public.subjects(school_id,id) on delete cascade,
 primary key(school_id,student_id,subject_id,sequence),
 check((status='mark' and value is not null and value between 0 and 20) or (status in ('absent','exempt') and value is null))
);
create table public.submissions (
 school_id uuid not null, subject_id uuid not null, sequence int not null check(sequence between 1 and 6),
 status text not null check(status in ('submitted','returned')), note text not null default '', submitted_by uuid references auth.users, updated_at timestamptz not null default now(),
 foreign key(school_id,subject_id) references public.subjects(school_id,id) on delete cascade, primary key(school_id,subject_id,sequence)
);
create table public.remarks (
 school_id uuid not null, student_id uuid not null, term int not null check(term between 1 and 3), teacher text not null default '', principal text not null default '',
 absences int not null default 0 check(absences>=0), lateness int not null default 0 check(lateness>=0), conduct text not null default '', promotion text not null default '',
 foreign key(school_id,student_id) references public.students(school_id,id) on delete cascade, primary key(school_id,student_id,term)
);
create table public.approvals (
 school_id uuid not null, class_id uuid not null, term int not null check(term between 1 and 3), approved_at timestamptz not null default now(), approved_by uuid references auth.users,
 results jsonb not null, school_snapshot jsonb not null,
 foreign key(school_id,class_id) references public.classes(school_id,id), primary key(school_id,class_id,term)
);
create table public.audit_log (id bigint generated always as identity primary key, school_id uuid references public.schools, actor uuid references auth.users, operation text not null, operation_id uuid, details jsonb not null, created_at timestamptz not null default now());
create unique index on public.audit_log(school_id,actor,operation_id) where operation_id is not null;
create index on public.classes(school_id,academic_year);
create index on public.students(school_id,class_id);
create index on public.subjects(school_id,teacher_id);
create index on public.marks(school_id,subject_id,sequence);

create function private.is_admin(sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where school_id=sid and user_id=auth.uid() and role='admin'); $$;
create function private.is_member(sid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where school_id=sid and user_id=auth.uid()); $$;
create function private.can_subject(sid uuid, sub uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin(sid) or exists(select 1 from public.subjects where school_id=sid and id=sub and teacher_id=auth.uid()); $$;
create function private.can_class(sid uuid, cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin(sid) or exists(select 1 from public.subjects where school_id=sid and class_id=cid and teacher_id=auth.uid()); $$;
-- Reads are scoped in the database. All browser writes go through transaction RPCs below.
alter table public.schools enable row level security;
alter table public.memberships enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.marks enable row level security;
alter table public.submissions enable row level security;
alter table public.remarks enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_log enable row level security;
create policy school_read on public.schools for select to authenticated using(private.is_member(id));
create policy member_read on public.memberships for select to authenticated using(private.is_admin(school_id) or user_id=auth.uid());
create policy class_read on public.classes for select to authenticated using(private.can_class(school_id,id));
create policy student_read on public.students for select to authenticated using(private.can_class(school_id,class_id));
create policy subject_read on public.subjects for select to authenticated using(private.can_subject(school_id,id));
create policy mark_read on public.marks for select to authenticated using(private.can_subject(school_id,subject_id));
create policy submission_read on public.submissions for select to authenticated using(private.can_subject(school_id,subject_id));
create policy remark_read on public.remarks for select to authenticated using(private.is_admin(school_id));
create policy approval_read on public.approvals for select to authenticated using(private.is_admin(school_id));
create policy audit_read on public.audit_log for select to authenticated using(private.is_admin(school_id));
revoke all on public.schools,public.memberships,public.classes,public.students,public.subjects,public.marks,public.submissions,public.remarks,public.approvals,public.audit_log from anon,authenticated;
grant select on public.schools,public.memberships,public.classes,public.students,public.subjects,public.marks,public.submissions,public.remarks,public.approvals,public.audit_log to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin(uuid),private.is_member(uuid),private.can_subject(uuid,uuid),private.can_class(uuid,uuid) to authenticated;

create function public.create_school(p_name text,p_address text,p_year text) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if length(trim(p_name))<2 or length(p_name)>200 or p_year !~ '^20[0-9]{2}/20[0-9]{2}$' then raise exception 'Invalid school details'; end if;
 insert into public.schools(name,address,year) values(trim(p_name),p_address,p_year) returning id into sid;
 insert into public.memberships values(sid,auth.uid(),coalesce(nullif(auth.jwt()->'user_metadata'->>'name',''),'Administrator'),coalesce(auth.jwt()->>'email',''),'admin');
 return sid; end $$;

create function public.school_snapshot(p_school uuid,p_year text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare yr text; role_name text; result jsonb; begin
 select role into role_name from public.memberships where school_id=p_school and user_id=auth.uid();
 if role_name is null then raise exception 'School access denied'; end if;
 select coalesce(p_year,year) into yr from public.schools where id=p_school;
 select jsonb_build_object('school',(select to_jsonb(s)||jsonb_build_object('year',yr) from public.schools s where id=p_school),'role',role_name,'user_id',auth.uid(),
 'classes',coalesce((select jsonb_agg(to_jsonb(c)) from public.classes c where school_id=p_school and academic_year=yr and private.can_class(p_school,id)),'[]'::jsonb),
 'students',coalesce((select jsonb_agg(to_jsonb(s)) from public.students s join public.classes c on c.id=s.class_id where s.school_id=p_school and c.academic_year=yr and private.can_class(p_school,c.id)),'[]'::jsonb),
 'subjects',coalesce((select jsonb_agg(to_jsonb(s)) from public.subjects s join public.classes c on c.id=s.class_id where s.school_id=p_school and c.academic_year=yr and private.can_subject(p_school,s.id)),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(to_jsonb(m)) from public.memberships m where school_id=p_school and (role_name='admin' or user_id=auth.uid())),'[]'::jsonb),
 'marks',coalesce((select jsonb_agg(to_jsonb(m)) from public.marks m join public.subjects s on s.id=m.subject_id join public.classes c on c.id=s.class_id where m.school_id=p_school and c.academic_year=yr and private.can_subject(p_school,s.id)),'[]'::jsonb),
 'submissions',coalesce((select jsonb_agg(to_jsonb(m)) from public.submissions m join public.subjects s on s.id=m.subject_id join public.classes c on c.id=s.class_id where m.school_id=p_school and c.academic_year=yr and private.can_subject(p_school,s.id)),'[]'::jsonb),
 'remarks',coalesce((select jsonb_agg(to_jsonb(r)) from public.remarks r join public.students s on s.id=r.student_id join public.classes c on c.id=s.class_id where r.school_id=p_school and c.academic_year=yr and role_name='admin'),'[]'::jsonb),
 'approvals',coalesce((select jsonb_agg(to_jsonb(a)) from public.approvals a join public.classes c on c.id=a.class_id where a.school_id=p_school and c.academic_year=yr and role_name='admin'),'[]'::jsonb)) into result;
 return result; end $$;

create function private.compute_results(sid uuid,cid uuid,trm int) returns jsonb language plpgsql security definer set search_path='' as $$
declare out_results jsonb; begin
 if not exists(select 1 from public.students where school_id=sid and class_id=cid) or not exists(select 1 from public.subjects where school_id=sid and class_id=cid) then raise exception 'Class needs students and subjects'; end if;
 if exists(select 1 from public.students st cross join public.subjects sub left join public.marks a on a.school_id=sid and a.student_id=st.id and a.subject_id=sub.id and a.sequence=trm*2-1 left join public.marks b on b.school_id=sid and b.student_id=st.id and b.subject_id=sub.id and b.sequence=trm*2 where st.school_id=sid and st.class_id=cid and sub.school_id=sid and sub.class_id=cid and (a.student_id is null or b.student_id is null or (a.status='exempt')<>(b.status='exempt'))) then raise exception 'Missing marks or inconsistent exemptions'; end if;
 with base as (
 select st.id student_id,sub.id subject_id,sub.name,mb.name teacher,sub.coefficient,
 case when a.status='exempt' then null when a.status='absent' then 0 else a.value end seq1,
 case when b.status='exempt' then null when b.status='absent' then 0 else b.value end seq2,a.status='exempt' exempt
 from public.students st join public.subjects sub on sub.class_id=st.class_id and sub.school_id=st.school_id
 join public.memberships mb on mb.school_id=sid and mb.user_id=sub.teacher_id
 join public.marks a on a.school_id=sid and a.student_id=st.id and a.subject_id=sub.id and a.sequence=trm*2-1
 join public.marks b on b.school_id=sid and b.student_id=st.id and b.subject_id=sub.id and b.sequence=trm*2
 where st.school_id=sid and st.class_id=cid),
 averaged as(select *, (seq1+seq2)/2 average, coalesce((seq1+seq2)/2*coefficient,0) points from base),
 positioned as(select *,case when exempt then null else rank() over(partition by subject_id order by average desc nulls last) end position from averaged),
 totals as(select student_id,jsonb_agg(jsonb_build_object('subject_id',subject_id,'name',name,'teacher',teacher,'coefficient',coefficient,'seq1',seq1,'seq2',seq2,'average',average,'points',points,'exempt',exempt,'position',position) order by name) rows,
 sum(points) total_points,sum(case when exempt then 0 else coefficient end) total_coef,
 sum(coalesce(seq1,0)*coefficient)/nullif(sum(case when exempt then 0 else coefficient end),0) seq1,
 sum(coalesce(seq2,0)*coefficient)/nullif(sum(case when exempt then 0 else coefficient end),0) seq2 from positioned group by student_id),
 ranked as(select *,total_points/nullif(total_coef,0) average,rank() over(order by total_points/nullif(total_coef,0) desc nulls last) position,count(*) over() size from totals)
 select jsonb_agg(jsonb_build_object('student',to_jsonb(st),'rows',r.rows,'average',r.average,'seq1',r.seq1,'seq2',r.seq2,'totalPoints',r.total_points,'totalCoef',r.total_coef,'position',r.position,'size',r.size,'remark',coalesce(to_jsonb(rm),jsonb_build_object('student_id',st.id,'term',trm,'teacher','','principal','','absences',0,'lateness',0,'conduct','','promotion',''))) order by st.name) into out_results from ranked r join public.students st on st.id=r.student_id left join public.remarks rm on rm.school_id=sid and rm.student_id=st.id and rm.term=trm;
 if exists(select 1 from jsonb_array_elements(out_results) r where (r->>'totalCoef')::numeric=0) then raise exception 'A student has no assessed subjects'; end if;
 if trm=3 then
 if not exists(select 1 from public.approvals where school_id=sid and class_id=cid and term=1) or not exists(select 1 from public.approvals where school_id=sid and class_id=cid and term=2) then raise exception 'Approve terms 1 and 2 first'; end if;
 with annual as(select r.value r,a.value a,b.value b,((r.value->>'average')::numeric+(a.value->>'average')::numeric+(b.value->>'average')::numeric)/3 av from jsonb_array_elements(out_results) r
 join public.approvals p1 on p1.school_id=sid and p1.class_id=cid and p1.term=1 cross join lateral jsonb_array_elements(p1.results) a
 join public.approvals p2 on p2.school_id=sid and p2.class_id=cid and p2.term=2 cross join lateral jsonb_array_elements(p2.results) b
 where a.value->'student'->>'id'=r.value->'student'->>'id' and b.value->'student'->>'id'=r.value->'student'->>'id'),
 numbered as(select *,rank() over(order by av desc) pos from annual)
 select jsonb_agg(r||jsonb_build_object('termAverages',jsonb_build_array((a->>'average')::numeric,(b->>'average')::numeric,(r->>'average')::numeric),'annualAverage',av,'annualPosition',pos)) into out_results from numbered;
 if jsonb_array_length(out_results)<>(select count(*) from public.students where school_id=sid and class_id=cid) then raise exception 'Earlier approved reports are missing for a student'; end if;
 end if;
 return out_results; end $$;

create function public.apply_operation(p_school uuid,p_operation jsonb) returns void language plpgsql security definer set search_path='' as $$
declare k text:=p_operation->>'kind'; sub public.subjects; cid uuid; seq int; trm int; item jsonb; m jsonb; oldrev int; results jsonb; yr text; begin
 if not private.is_member(p_school) then raise exception 'School access denied'; end if;
 -- Serialize writes per school: approval, reopening and syncing cannot race.
 perform 1 from public.schools where id=p_school for update;
 if p_operation ? 'operation_id' and exists(select 1 from public.audit_log where school_id=p_school and actor=auth.uid() and operation_id=(p_operation->>'operation_id')::uuid) then return; end if;
 select year into yr from public.schools where id=p_school;
 if k in ('save_marks','submit','reopen_subject') then
 select * into sub from public.subjects where school_id=p_school and id=(p_operation->>'subject_id')::uuid;
 if sub.id is null or not private.can_subject(p_school,sub.id) then raise exception 'Assignment access denied'; end if;
 cid:=sub.class_id; seq:=(p_operation->>'sequence')::int; trm:=(seq+1)/2;
 if seq not between 1 and 6 then raise exception 'Invalid sequence'; end if;
 if not exists(select 1 from public.classes where id=cid and school_id=p_school and academic_year=yr) then raise exception 'Archived year is read-only'; end if;
 if exists(select 1 from public.approvals where school_id=p_school and class_id=cid and term=trm) then raise exception 'Results approved. Reopen class first'; end if;
 if k='reopen_subject' then
 if not private.is_admin(p_school) then raise exception 'Administrator only'; end if;
 insert into public.submissions(school_id,subject_id,sequence,status,note,submitted_by) values(p_school,sub.id,seq,'returned',coalesce(p_operation->>'note','Please review marks'),auth.uid()) on conflict(school_id,subject_id,sequence) do update set status='returned',note=excluded.note,updated_at=now();
 elsif k='submit' then
 if exists(select 1 from public.students st where school_id=p_school and class_id=cid and not exists(select 1 from public.marks where school_id=p_school and student_id=st.id and subject_id=sub.id and sequence=seq)) or not exists(select 1 from public.students where class_id=cid) then raise exception 'Complete missing marks first'; end if;
 insert into public.submissions(school_id,subject_id,sequence,status,submitted_by) values(p_school,sub.id,seq,'submitted',auth.uid()) on conflict(school_id,subject_id,sequence) do update set status='submitted',note='',submitted_by=auth.uid(),updated_at=now();
 else
 if exists(select 1 from public.submissions where school_id=p_school and subject_id=sub.id and sequence=seq and status='submitted') then raise exception 'Submission locked. Ask administrator to reopen'; end if;
 for m in select value from jsonb_array_elements(p_operation->'marks') loop
 if not exists(select 1 from public.students where school_id=p_school and class_id=cid and id=(m->>'student_id')::uuid) then raise exception 'Student is not in this class'; end if;
 select revision into oldrev from public.marks where school_id=p_school and student_id=(m->>'student_id')::uuid and subject_id=sub.id and sequence=seq;
 if coalesce(oldrev,0)<>coalesce((m->>'revision')::int,0) then raise exception 'Conflict: marks changed on another device. Refresh and review'; end if;
 insert into public.marks(school_id,student_id,subject_id,sequence,value,status,revision,updated_by) values(p_school,(m->>'student_id')::uuid,sub.id,seq,(m->>'value')::numeric,m->>'status',coalesce(oldrev,0)+1,auth.uid()) on conflict(school_id,student_id,subject_id,sequence) do update set value=excluded.value,status=excluded.status,revision=excluded.revision,updated_by=auth.uid(),updated_at=now();
 end loop;
 for m in select value from jsonb_array_elements(coalesce(p_operation->'removed','[]'::jsonb)) loop
 select revision into oldrev from public.marks where school_id=p_school and student_id=(m->>'student_id')::uuid and subject_id=sub.id and sequence=seq;
 if oldrev is distinct from (m->>'revision')::int then raise exception 'Conflict: marks changed on another device';end if;
 delete from public.marks where school_id=p_school and student_id=(m->>'student_id')::uuid and subject_id=sub.id and sequence=seq;
 end loop;
 end if;
 else
 if not private.is_admin(p_school) then raise exception 'Administrator only'; end if;
 item:=p_operation->'item'; trm:=coalesce((p_operation->>'term')::int,1);
 if k='school' then
 if exists(select 1 from public.submissions su join public.subjects sb on sb.id=su.subject_id join public.classes c on c.id=sb.class_id where su.school_id=p_school and c.academic_year=yr and su.status='submitted' and not exists(select 1 from public.approvals a where a.school_id=p_school and a.class_id=c.id and a.term=(su.sequence+1)/2)) and p_operation->'school'->>'year'<>yr then raise exception 'Approve current results before changing academic year'; end if;
 update public.schools set name=p_operation->'school'->>'name',address=p_operation->'school'->>'address',year=p_operation->'school'->>'year',logo_data=p_operation->'school'->>'logo_data',remark_ranges=coalesce(p_operation->'school'->'remark_ranges',remark_ranges) where id=p_school;
 elsif k='class' then
 insert into public.classes(id,school_id,academic_year,name,level,section) values((item->>'id')::uuid,p_school,yr,item->>'name',item->>'level',item->>'section');
 elsif k='import_students' then
 cid:=(p_operation->>'class_id')::uuid;
 if not exists(select 1 from public.classes where school_id=p_school and id=cid and academic_year=yr) then raise exception 'Invalid class';end if;
 if exists(select 1 from public.approvals where school_id=p_school and class_id=cid) or exists(select 1 from public.submissions su join public.subjects sb on sb.id=su.subject_id where su.school_id=p_school and sb.class_id=cid and su.status='submitted') then raise exception 'Class roster locked after submission. Reopen first';end if;
 if jsonb_array_length(p_operation->'items')>1000 then raise exception 'Import at most 1000 students at a time';end if;
 for item in select value from jsonb_array_elements(p_operation->'items') loop
 insert into public.students(id,school_id,class_id,code,name,dob) values((item->>'id')::uuid,p_school,cid,item->>'code',item->>'name',nullif(item->>'dob','')::date);
 end loop;
 elsif k in ('student','subject','update_student','update_subject','delete_student','delete_subject') then
 cid:=(item->>'class_id')::uuid;
 if not exists(select 1 from public.classes where school_id=p_school and id=cid and academic_year=yr) then raise exception 'Invalid class'; end if;
 if exists(select 1 from public.approvals where school_id=p_school and class_id=cid) or exists(select 1 from public.submissions su join public.subjects sb on sb.id=su.subject_id where su.school_id=p_school and sb.class_id=cid and su.status='submitted') then raise exception 'Class roster/curriculum locked after submission. Reopen submissions first'; end if;
 if k in ('update_student','delete_student') then
 if not exists(select 1 from public.students where school_id=p_school and class_id=cid and id=(item->>'id')::uuid) then raise exception 'Student access denied';end if;
 if k='delete_student' then delete from public.students where school_id=p_school and id=(item->>'id')::uuid;else update public.students set name=item->>'name',code=item->>'code',dob=nullif(item->>'dob','')::date where school_id=p_school and id=(item->>'id')::uuid;end if;
 elsif k in ('update_subject','delete_subject') then
 if not exists(select 1 from public.subjects where school_id=p_school and class_id=cid and id=(item->>'id')::uuid) then raise exception 'Subject access denied';end if;
 if k='delete_subject' then delete from public.subjects where school_id=p_school and id=(item->>'id')::uuid;else update public.subjects set name=item->>'name',coefficient=(item->>'coefficient')::numeric,teacher_id=(item->>'teacher_id')::uuid where school_id=p_school and id=(item->>'id')::uuid;end if;
 elsif k='student' then insert into public.students(id,school_id,class_id,code,name,dob) values((item->>'id')::uuid,p_school,cid,item->>'code',item->>'name',nullif(item->>'dob','')::date);
 else insert into public.subjects(id,school_id,class_id,name,coefficient,teacher_id) values((item->>'id')::uuid,p_school,cid,item->>'name',(item->>'coefficient')::numeric,(item->>'teacher_id')::uuid);end if;
 elsif k='remark' then
 item:=p_operation->'remark';trm:=(item->>'term')::int;
 select class_id into cid from public.students where school_id=p_school and id=(item->>'student_id')::uuid;
 if cid is null or not exists(select 1 from public.classes where id=cid and academic_year=yr) then raise exception 'Invalid student';end if;
 if exists(select 1 from public.approvals where school_id=p_school and class_id=cid and term=trm) then raise exception 'Reopen results before editing remarks';end if;
 insert into public.remarks(school_id,student_id,term,teacher,principal,absences,lateness,conduct,promotion) values(p_school,(item->>'student_id')::uuid,trm,item->>'teacher',item->>'principal',(item->>'absences')::int,(item->>'lateness')::int,item->>'conduct',item->>'promotion') on conflict(school_id,student_id,term) do update set teacher=excluded.teacher,principal=excluded.principal,absences=excluded.absences,lateness=excluded.lateness,conduct=excluded.conduct,promotion=excluded.promotion;
 elsif k in ('approve','reopen_class') then
 cid:=(p_operation->>'class_id')::uuid;
 if trm not between 1 and 3 or not exists(select 1 from public.classes where school_id=p_school and id=cid and academic_year=yr) then raise exception 'Invalid class or term';end if;
 if k='reopen_class' then
 delete from public.approvals where school_id=p_school and class_id=cid and (term=trm or term=3); -- annual report invalidated when an earlier term changes
 else
 if exists(select 1 from public.subjects sb cross join generate_series(trm*2-1,trm*2) q where sb.school_id=p_school and sb.class_id=cid and not exists(select 1 from public.submissions where school_id=p_school and subject_id=sb.id and sequence=q and status='submitted')) then raise exception 'Both sequences must be submitted for every subject';end if;
 results:=private.compute_results(p_school,cid,trm);
 insert into public.approvals(school_id,class_id,term,results,school_snapshot,approved_by) values(p_school,cid,trm,results,(select to_jsonb(s) from public.schools s where id=p_school),auth.uid()) on conflict(school_id,class_id,term) do update set results=excluded.results,school_snapshot=excluded.school_snapshot,approved_by=auth.uid(),approved_at=now();
 end if;
 else raise exception 'Unknown operation'; end if;
 end if;
 insert into public.audit_log(school_id,actor,operation,operation_id,details) values(p_school,auth.uid(),k,(p_operation->>'operation_id')::uuid,p_operation);
 end $$;
revoke all on function private.compute_results(uuid,uuid,int) from public,anon,authenticated;
revoke all on function public.create_school(text,text,text),public.school_snapshot(uuid,text),public.apply_operation(uuid,jsonb) from public,anon;
grant execute on function public.create_school(text,text,text),public.school_snapshot(uuid,text),public.apply_operation(uuid,jsonb) to authenticated;
-- Assets bucket is private; keep all uploads under <school UUID>/... .
insert into storage.buckets(id,name,public) values('school-assets','school-assets',false) on conflict(id) do nothing;
create policy assets_read on storage.objects for select to authenticated using(bucket_id='school-assets' and private.is_member((storage.foldername(name))[1]::uuid));
create policy assets_insert on storage.objects for insert to authenticated with check(bucket_id='school-assets' and private.is_admin((storage.foldername(name))[1]::uuid));
