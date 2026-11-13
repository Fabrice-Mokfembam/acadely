import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error('Supabase server credentials are not configured.');

const admin = createClient(url, secret, { auth: { persistSession: false } });
const { data: schools, error: schoolError } = await admin.from('schools').select('id,name,year').eq('name', 'Brilliant Academy');
if (schoolError) throw schoolError;
if (schools.length !== 1) throw new Error(`Expected one Brilliant Academy workspace; found ${schools.length}.`);

const school = schools[0];
const [classesResult, studentsResult, subjectsResult, membersResult] = await Promise.all([
  admin.from('classes').select('id,name,level,section,academic_year').eq('school_id', school.id).order('name'),
  admin.from('students').select('id,class_id').eq('school_id', school.id),
  admin.from('subjects').select('id,class_id,name,coefficient,teacher_id').eq('school_id', school.id).order('name'),
  admin.from('memberships').select('user_id,name,email,role').eq('school_id', school.id).order('role'),
]);
for (const result of [classesResult, studentsResult, subjectsResult, membersResult]) if (result.error) throw result.error;

console.log(JSON.stringify({
  school: { id: school.id, name: school.name, year: school.year },
  classes: classesResult.data,
  studentCount: studentsResult.data.length,
  subjects: subjectsResult.data,
  members: membersResult.data.map(({ email: _email, ...member }) => member),
}, null, 2));
