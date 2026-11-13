import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error('Supabase server credentials are not configured.');

const admin = createClient(url, secret, { auth: { persistSession: false } });
const credentialsPath = '.teacher-credentials.local.csv';
const classPlan = [
  ['Form 1', 12, 2013],
  ['Form 2', 12, 2012],
  ['Form 3', 12, 2011],
  ['Form 4', 11, 2010],
  ['Form 5', 11, 2009],
  ['Lower Sixth', 11, 2008],
  ['Upper Sixth', 11, 2007],
];
const teacherPlan = [
  ['Grace Nfor', 'english.teacher@brilliantacademy.school', 'English Language'],
  ['Claudine Mbah', 'french.teacher@brilliantacademy.school', 'French'],
  ['Elvis Nji', 'biology.teacher@brilliantacademy.school', 'Biology'],
  ['Irene Fomunung', 'chemistry.teacher@brilliantacademy.school', 'Chemistry'],
  ['Michael Fai', 'physics.teacher@brilliantacademy.school', 'Physics'],
  ['Patricia Ngum', 'geography.teacher@brilliantacademy.school', 'Geography'],
  ['Daniel Atem', 'history.teacher@brilliantacademy.school', 'History'],
  ['Brenda Ewane', 'computer.teacher@brilliantacademy.school', 'Computer Science'],
  ['Josephine Acha', 'citizenship.teacher@brilliantacademy.school', 'Citizenship'],
];
const juniorSubjects = ['English Language', 'Mathematics', 'French', 'Integrated Science', 'Geography', 'History', 'Computer Science', 'Citizenship'];
const seniorSubjects = ['English Language', 'Mathematics', 'French', 'Biology', 'Chemistry', 'Physics', 'Geography', 'History', 'Computer Science', 'Citizenship'];
const coefficients = { 'English Language': 4, Mathematics: 4, French: 2, 'Integrated Science': 3, Biology: 3, Chemistry: 3, Physics: 3, Geography: 3, History: 3, 'Computer Science': 2, Citizenship: 1 };
const firstNames = ['Abigail','Alain','Alice','Amadou','Ashley','Blaise','Brenda','Brian','Carine','Cedric','Chantal','Christian','Clara','Daphne','David','Diane','Divine','Emmanuel','Eric','Esther','Faith','Favour','Francis','Gabriel','Grace','Irene','Joel','Joyce','Kevin','Linda','Marcel','Marie','Naomi','Nathan','Paul','Precious','Samuel','Sandra','Stanley','Yannick'];
const surnames = ['Acha','Akum','Atem','Babila','Bamenda','Bate','Ewane','Fai','Fokam','Fomunung','Foncha','Fonyuy','Kah','Kemayou','Mbah','Mbuh','Mofor','Muna','Nchinda','Nfor','Ngala','Ngum','Nji','Njume','Nkem','Nkwenti','Nsoh','Nwah','Oben','Ojong','Sama','Tabi','Talla','Tambe','Tanyi','Tchinda','Tita','Wanki','Yuh','Zama'];

const fail = (label, error) => { if (error) throw new Error(`${label}: ${error.message}`); };
const randomPassword = () => `${randomBytes(12).toString('base64url')}Aa1!`;
const csvEscape = value => `"${String(value).replaceAll('"', '""')}"`;

async function findAuthUser(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    fail('List authentication users', error);
    const user = data.users.find(item => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 100) return null;
  }
  throw new Error('Authentication user search exceeded 2,000 accounts.');
}

const { data: schools, error: schoolError } = await admin.from('schools').select('id,name,year').eq('name', 'Brilliant Academy');
fail('Find school', schoolError);
if (schools.length !== 1) throw new Error(`Expected one Brilliant Academy workspace; found ${schools.length}.`);
const school = schools[0];

const { data: initialMembers, error: initialMembersError } = await admin.from('memberships').select('user_id,name,email,role').eq('school_id', school.id);
fail('Read memberships', initialMembersError);
const existingMathTeacher = initialMembers.find(member => member.role === 'teacher');
if (!existingMathTeacher) throw new Error('The existing Mathematics teacher could not be found.');

const savedCredentials = new Map();
if (existsSync(credentialsPath)) {
  for (const line of readFileSync(credentialsPath, 'utf8').split(/\r?\n/).slice(1)) {
    const match = line.match(/^"([^"]*(?:""[^"]*)*)","([^"]*(?:""[^"]*)*)","([^"]*(?:""[^"]*)*)","([^"]*(?:""[^"]*)*)"$/);
    if (match) savedCredentials.set(match[2].replaceAll('""','"'), { name: match[1].replaceAll('""','"'), password: match[3].replaceAll('""','"'), subject: match[4].replaceAll('""','"') });
  }
}

const credentialRows = [];
const teacherIds = { Mathematics: existingMathTeacher.user_id };
for (const [name, email, subject] of teacherPlan) {
  const password = savedCredentials.get(email)?.password || randomPassword();
  let user = await findAuthUser(email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    fail(`Create teacher ${name}`, error);
    user = data.user;
  }
  const { error: memberError } = await admin.from('memberships').upsert({ school_id: school.id, user_id: user.id, name, email, role: 'teacher' }, { onConflict: 'school_id,user_id' });
  fail(`Link teacher ${name}`, memberError);
  teacherIds[subject] = user.id;
  credentialRows.push([name, email, password, subject]);
}
teacherIds['Integrated Science'] = teacherIds.Biology;

const { data: existingClasses, error: classReadError } = await admin.from('classes').select('id,name,section,academic_year').eq('school_id', school.id).eq('academic_year', school.year);
fail('Read classes', classReadError);
const classesByName = new Map(existingClasses.filter(item => item.section === 'English').map(item => [item.name, item]));
const missingClasses = classPlan.filter(([name]) => !classesByName.has(name)).map(([name]) => ({ id: randomUUID(), school_id: school.id, academic_year: school.year, name, level: name, section: 'English' }));
if (missingClasses.length) {
  const { error } = await admin.from('classes').insert(missingClasses);
  fail('Insert classes', error);
  for (const item of missingClasses) classesByName.set(item.name, item);
}

const { data: existingStudents, error: studentReadError } = await admin.from('students').select('class_id,code').eq('school_id', school.id);
fail('Read students', studentReadError);
const existingCodes = new Set(existingStudents.map(item => `${item.class_id}:${item.code}`));
const studentRows = [];
let studentNumber = 1;
for (const [className, count, birthYear] of classPlan) {
  const classId = classesByName.get(className).id;
  const classCode = className === 'Lower Sixth' ? 'LS' : className === 'Upper Sixth' ? 'US' : `F${className.at(-1)}`;
  for (let index = 0; index < count; index += 1) {
    const code = `BA26-${classCode}-${String(index + 1).padStart(3, '0')}`;
    if (!existingCodes.has(`${classId}:${code}`)) {
      const globalIndex = studentNumber - 1;
      studentRows.push({
        id: randomUUID(), school_id: school.id, class_id: classId, code,
        name: `${firstNames[globalIndex % firstNames.length]} ${surnames[(globalIndex * 7 + Math.floor(globalIndex / firstNames.length)) % surnames.length]}`,
        dob: `${birthYear}-${String((index % 12) + 1).padStart(2, '0')}-${String((index * 2 % 27) + 1).padStart(2, '0')}`,
      });
    }
    studentNumber += 1;
  }
}
if (studentRows.length) {
  const { error } = await admin.from('students').insert(studentRows);
  fail('Insert students', error);
}

const { data: existingSubjects, error: subjectReadError } = await admin.from('subjects').select('class_id,name').eq('school_id', school.id);
fail('Read subjects', subjectReadError);
const existingSubjectKeys = new Set(existingSubjects.map(item => `${item.class_id}:${item.name}`));
const subjectRows = [];
for (const [className] of classPlan) {
  const classId = classesByName.get(className).id;
  const subjects = ['Form 1','Form 2','Form 3'].includes(className) ? juniorSubjects : seniorSubjects;
  for (const name of subjects) {
    if (!existingSubjectKeys.has(`${classId}:${name}`)) subjectRows.push({ id: randomUUID(), school_id: school.id, class_id: classId, name, coefficient: coefficients[name], teacher_id: teacherIds[name] });
  }
}
if (subjectRows.length) {
  const { error } = await admin.from('subjects').insert(subjectRows);
  fail('Insert subjects', error);
}

writeFileSync(credentialsPath, ['Name,Email,Temporary password,Assigned subject', ...credentialRows.map(row => row.map(csvEscape).join(','))].join('\n') + '\n', { mode: 0o600 });

const [membersResult, classesResult, studentsResult, subjectsResult] = await Promise.all([
  admin.from('memberships').select('role', { count: 'exact', head: true }).eq('school_id', school.id).eq('role', 'teacher'),
  admin.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', school.id).eq('academic_year', school.year).eq('section', 'English'),
  admin.from('students').select('id', { count: 'exact', head: true }).eq('school_id', school.id),
  admin.from('subjects').select('id', { count: 'exact', head: true }).eq('school_id', school.id),
]);
for (const result of [membersResult, classesResult, studentsResult, subjectsResult]) fail('Verify seeded data', result.error);
console.log(JSON.stringify({ school: school.name, teachers: membersResult.count, englishClasses: classesResult.count, students: studentsResult.count, subjects: subjectsResult.count, credentialsFile: credentialsPath }, null, 2));
