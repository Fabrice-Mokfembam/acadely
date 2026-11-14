import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const admin='00000000-0000-4000-8000-000000000001',teacher='00000000-0000-4000-8000-000000000002',outsider='00000000-0000-4000-8000-000000000003';
test('Supabase migration: tenant security, revisions, locking, approval and annual results',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email','admin@example.com','user_metadata',jsonb_build_object('name','Admin'))$$;create table storage.buckets(id text primary key,name text,public boolean);create table storage.objects(id uuid,name text,bucket_id text);create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;grant usage on schema auth to authenticated;insert into auth.users values('${admin}'),('${teacher}'),('${outsider}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/001_school_reports.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/002_platform_admin.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/003_platform_admin_management.sql',import.meta.url),'utf8'));
 const as=async<T>(uid:string,fn:()=>Promise<T>)=>{await db.query("select set_config('test.uid',$1,false)",[uid]);await db.exec('set role authenticated');try{return await fn()}finally{await db.exec('reset role')}};
 const school=await as(admin,async()=>{const r=await db.query<{id:string}>("select public.create_school('Test Academy','Douala','2026/2027') id");return r.rows[0].id});
 const other=await as(outsider,async()=>{const r=await db.query<{id:string}>("select public.create_school('Other School','Buea','2026/2027') id");return r.rows[0].id});
 await db.query("insert into public.memberships values($1,$2,'Teacher','teacher@example.com','teacher')",[school,teacher]);
 const cid='00000000-0000-4000-8000-000000000010',st='00000000-0000-4000-8000-000000000020',sub='00000000-0000-4000-8000-000000000030',sub2='00000000-0000-4000-8000-000000000031';
 const op=async(uid:string,operation:Record<string,unknown>,sid=school)=>as(uid,()=>db.query('select public.apply_operation($1,$2::jsonb)',[sid,JSON.stringify({...operation,operation_id:operation.operation_id||crypto.randomUUID()})]));
 await op(admin,{kind:'class',item:{id:cid,name:'Form 1A',level:'Form 1',section:'English'}});
 await op(admin,{kind:'student',item:{id:st,class_id:cid,code:'ST1',name:'John',dob:''}});
 await op(admin,{kind:'subject',item:{id:sub,class_id:cid,name:'Mathematics',coefficient:4,teacher_id:teacher}});
 await op(admin,{kind:'subject',item:{id:sub2,class_id:cid,name:'English',coefficient:3,teacher_id:admin}});
 await assert.rejects(()=>op(outsider,{kind:'school',school:{name:'Hacked',address:'',year:'2026/2027'}}),/access denied/i);
 await as(outsider,async()=>{const r=await db.query('select * from public.classes');assert.equal(r.rows.length,0);await assert.rejects(()=>db.query('select public.school_snapshot($1)',[school]),/access denied/i)});
 await assert.rejects(()=>op(teacher,{kind:'save_marks',subject_id:sub2,sequence:1,marks:[]}),/access denied/i);
 const mark=(subject_id:string,sequence:number,value:number,revision=0)=>({student_id:st,subject_id,sequence,value,status:'mark',revision});
 const save={kind:'save_marks',subject_id:sub,sequence:1,marks:[mark(sub,1,12)],operation_id:crypto.randomUUID()};await op(teacher,save);await op(teacher,save); // lost-response retry is idempotent
 await assert.rejects(()=>op(teacher,{kind:'save_marks',subject_id:sub,sequence:1,marks:[mark(sub,1,19)]}),/Conflict/);
 await assert.rejects(()=>op(teacher,{kind:'save_marks',subject_id:sub,sequence:2,marks:[mark(sub,2,21)]}),/check constraint/);
 await assert.rejects(()=>op(teacher,{kind:'submit',subject_id:sub,sequence:2}),/missing marks/i);
 await op(teacher,{kind:'save_marks',subject_id:sub,sequence:2,marks:[mark(sub,2,16)]});
 for(const q of [1,2]){await op(teacher,{kind:'submit',subject_id:sub,sequence:q});await op(admin,{kind:'save_marks',subject_id:sub2,sequence:q,marks:[mark(sub2,q,q===1?14:12)]});await op(admin,{kind:'submit',subject_id:sub2,sequence:q});}
 await assert.rejects(()=>op(teacher,{kind:'save_marks',subject_id:sub,sequence:1,marks:[mark(sub,1,18,1)]}),/locked/i);
 await assert.rejects(()=>op(teacher,{kind:'approve',class_id:cid,term:1}),/Administrator only/);
 await op(admin,{kind:'approve',class_id:cid,term:1});
 const approved=await db.query<{results:{average:number,totalPoints:number}[]}>('select results from public.approvals where school_id=$1 and term=1',[school]);assert.equal(approved.rows[0].results[0].totalPoints,95);assert.ok(Math.abs(approved.rows[0].results[0].average-95/7)<1e-9);
 await assert.rejects(()=>op(admin,{kind:'reopen_subject',subject_id:sub,sequence:1}),/approved/i);
 await assert.rejects(()=>op(admin,{kind:'student',item:{id:crypto.randomUUID(),class_id:cid,code:'ST2',name:'Later'}}),/locked/i);
 for(const q of [3,4,5,6])for(const sb of [sub,sub2]){await op(admin,{kind:'save_marks',subject_id:sb,sequence:q,marks:[mark(sb,q,15)]});await op(admin,{kind:'submit',subject_id:sb,sequence:q});}
 await assert.rejects(()=>op(admin,{kind:'approve',class_id:cid,term:3}),/Approve terms/);
 await op(admin,{kind:'approve',class_id:cid,term:2});
 await op(admin,{kind:'remark',remark:{student_id:st,term:3,teacher:'Good',principal:'Well done',absences:0,lateness:0,conduct:'Good',promotion:'Promoted to Form 2'}});
 await op(admin,{kind:'approve',class_id:cid,term:3});
 const annual=await db.query<{results:{annualAverage:number,remark:{promotion:string}}[]}>('select results from public.approvals where school_id=$1 and term=3',[school]);assert.ok(Math.abs(annual.rows[0].results[0].annualAverage-(95/7+30)/3)<1e-9);assert.equal(annual.rows[0].results[0].remark.promotion,'Promoted to Form 2');
 await as(teacher,async()=>{const r=await db.query<{s:{subjects:unknown[],approvals:unknown[]}}>('select public.school_snapshot($1) s',[school]);assert.equal(r.rows[0].s.subjects.length,1);assert.equal(r.rows[0].s.approvals.length,0);await assert.rejects(()=>db.query("insert into public.schools(name) values('Hacked')"),/permission denied/)});
 await op(admin,{kind:'reopen_class',class_id:cid,term:1});const counts=await db.query<{n:number}>('select count(*)::int n from public.approvals where school_id=$1',[school]);assert.equal(counts.rows[0].n,1);
 await db.query('insert into public.platform_admins(user_id,created_by) values($1,$1)',[admin]);
 await as(outsider,async()=>{const status=await db.query<{ok:boolean}>('select public.is_platform_admin() ok');assert.equal(status.rows[0].ok,false);await assert.rejects(()=>db.query('select public.platform_overview()'),/Platform owner access required/)});
 await as(admin,async()=>{const status=await db.query<{ok:boolean}>('select public.is_platform_admin() ok');assert.equal(status.rows[0].ok,true);const r=await db.query<{data:{totals:{schools:number;classes:number;students:number};schools:{id:string;classes:{name:string}[]}[]}}>('select public.platform_overview() data');assert.equal(r.rows[0].data.totals.schools,2);assert.equal(r.rows[0].data.totals.classes,1);assert.equal(r.rows[0].data.totals.students,1);assert.equal(r.rows[0].data.schools.find(item=>item.id===school)?.classes[0].name,'Form 1A')});
 const provisioned=await db.query<{id:string}>("select public.platform_create_school($1,'New Admin','new@example.com','New Academy','Limbe','2026/2027',$2) id",[teacher,admin]);assert.ok(provisioned.rows[0].id);
 await as(admin,async()=>{const r=await db.query<{data:{operation:string;school_name:string}[]}>('select public.platform_activity(10) data');assert.equal(r.rows[0].data[0].operation,'platform_create_school');assert.equal(r.rows[0].data[0].school_name,'New Academy')});
 assert.notEqual(school,other);
 }finally{await db.close();}
});
