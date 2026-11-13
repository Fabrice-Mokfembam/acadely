import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error('Supabase server credentials are not configured.');
const admin = createClient(url, secret, { auth: { persistSession: false } });
const fail = (label, error) => { if (error) throw new Error(`${label}: ${error.message}`); };
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function upsertWithRetry(table, rows, onConflict, label) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const { error } = await admin.from(table).upsert(rows, { onConflict });
    if (!error) return;
    lastError = error;
    if (attempt < 4) await wait(attempt * 500);
  }
  fail(label, lastError);
}

function hash(text) {
  let value = 2166136261;
  for (const character of text) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function score(studentCode, subjectName, sequence) {
  const ability = 7 + (hash(studentCode) % 100) / 10;
  const subjectVariation = ((hash(`${studentCode}:${subjectName}`) % 61) - 30) / 10;
  const sequenceTrend = (sequence - 2.5) * 0.3;
  const raw = Math.min(19.5, Math.max(4.5, ability + subjectVariation + sequenceTrend));
  return Math.round(raw * 2) / 2;
}

const { data: schools, error: schoolError } = await admin.from('schools').select('id,name,year').eq('name', 'Brilliant Academy');
fail('Find school', schoolError);
if (schools.length !== 1) throw new Error(`Expected one Brilliant Academy workspace; found ${schools.length}.`);
const school = schools[0];

const [classesResult, studentsResult, subjectsResult, markCountResult, submissionCountResult] = await Promise.all([
  admin.from('classes').select('id,name').eq('school_id', school.id).eq('academic_year', school.year).eq('section', 'English'),
  admin.from('students').select('id,class_id,code').eq('school_id', school.id),
  admin.from('subjects').select('id,class_id,name,teacher_id').eq('school_id', school.id),
  admin.from('marks').select('student_id', { count: 'exact', head: true }).eq('school_id', school.id).lte('sequence', 4),
  admin.from('submissions').select('subject_id', { count: 'exact', head: true }).eq('school_id', school.id).lte('sequence', 4),
]);
for (const result of [classesResult, studentsResult, subjectsResult, markCountResult, submissionCountResult]) fail('Read school data', result.error);
if (classesResult.data.length !== 7 || studentsResult.data.length !== 80 || subjectsResult.data.length !== 64) {
  throw new Error(`Unexpected seed totals: ${classesResult.data.length} classes, ${studentsResult.data.length} students, ${subjectsResult.data.length} subjects.`);
}
console.log(`Resuming from ${markCountResult.count || 0} existing marks and ${submissionCountResult.count || 0} existing submissions.`);

const studentsByClass = new Map();
for (const student of studentsResult.data) {
  const students = studentsByClass.get(student.class_id) || [];
  students.push(student);
  studentsByClass.set(student.class_id, students);
}

const marks = [];
const submissions = [];
for (const subject of subjectsResult.data) {
  const students = studentsByClass.get(subject.class_id) || [];
  for (let sequence = 1; sequence <= 4; sequence += 1) {
    for (const student of students) {
      marks.push({
        school_id: school.id,
        student_id: student.id,
        subject_id: subject.id,
        sequence,
        value: score(student.code, subject.name, sequence),
        status: 'mark',
        revision: 1,
        updated_by: subject.teacher_id,
      });
    }
    submissions.push({
      school_id: school.id,
      subject_id: subject.id,
      sequence,
      status: 'submitted',
      note: '',
      submitted_by: subject.teacher_id,
    });
  }
}

for (let offset = 0; offset < marks.length; offset += 500) {
  await upsertWithRetry('marks', marks.slice(offset, offset + 500), 'school_id,student_id,subject_id,sequence', `Write marks batch ${offset / 500 + 1}`);
}
for (let offset = 0; offset < submissions.length; offset += 500) {
  await upsertWithRetry('submissions', submissions.slice(offset, offset + 500), 'school_id,subject_id,sequence', `Write submissions batch ${offset / 500 + 1}`);
}

const [marksVerification, submissionsVerification] = await Promise.all([
  admin.from('marks').select('student_id', { count: 'exact', head: true }).eq('school_id', school.id).lte('sequence', 4),
  admin.from('submissions').select('subject_id', { count: 'exact', head: true }).eq('school_id', school.id).lte('sequence', 4).eq('status', 'submitted'),
]);
fail('Verify marks', marksVerification.error);
fail('Verify submissions', submissionsVerification.error);
console.log(JSON.stringify({
  school: school.name,
  terms: [1, 2],
  sequences: [1, 2, 3, 4],
  marks: marksVerification.count,
  submittedSubjectSequences: submissionsVerification.count,
}, null, 2));
