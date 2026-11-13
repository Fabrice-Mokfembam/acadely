export type Role = 'admin' | 'teacher';
export type Section = 'English' | 'French';
export interface School { id:string; name:string; address:string; year:string; logo_data?:string|null; remark_ranges?:RemarkRange[]; }
export interface ClassRoom { id:string; name:string; level:string; section:Section; }
export interface Student { id:string; class_id:string; code:string; name:string; dob:string; }
export interface Member { user_id:string; name:string; email:string; role:Role; }
export interface Subject { id:string; class_id:string; name:string; coefficient:number; teacher_id:string; }
export interface Mark { id?:string; student_id:string; subject_id:string; sequence:number; value:number|null; status:'mark'|'absent'|'exempt'; revision:number; }
export interface Submission { subject_id:string; sequence:number; status:'submitted'|'returned'; note:string; }
export interface Remark { student_id:string; term:number; teacher:string; principal:string; absences:number; lateness:number; conduct:string; promotion:string; }
export interface ResultRow { subject_id:string; name:string; teacher:string; coefficient:number; seq1:number|null; seq2:number|null; average:number|null; points:number; exempt:boolean; position?:number; }
export interface Result { student:Student; rows:ResultRow[]; average:number; seq1:number; seq2:number; totalPoints:number; totalCoef:number; position:number; size:number; remark:Remark; termAverages?:number[]; annualAverage?:number; annualPosition?:number; }
export interface Approval { class_id:string; term:number; approved_at:string; results:Result[]; }
export interface Snapshot { school:School; role:Role; user_id:string; classes:ClassRoom[]; students:Student[]; subjects:Subject[]; members:Member[]; marks:Mark[]; submissions:Submission[]; remarks:Remark[]; approvals:Approval[]; }
export type Operation = {kind:string; [key:string]:unknown};
export const emptyRemark=(student_id:string,term:number):Remark=>({student_id,term,teacher:'',principal:'',absences:0,lateness:0,conduct:'Satisfactory',promotion:''});
export interface RemarkRange {min:number;en:string;fr:string}
export const defaultRanges:RemarkRange[]=[{min:16,en:'Very good',fr:'Très bien'},{min:14,en:'Good',fr:'Bien'},{min:12,en:'Fairly good',fr:'Assez bien'},{min:10,en:'Pass',fr:'Passable'},{min:0,en:'Needs improvement',fr:'Insuffisant'}];
export function appreciation(value:number, french=false,ranges:RemarkRange[]=defaultRanges){const selected=[...ranges].sort((a,b)=>b.min-a.min).find(r=>value>=r.min);if(selected)return french?selected.fr:selected.en;const en=value>=16?'Very good':value>=14?'Good':value>=12?'Fairly good':value>=10?'Pass':'Needs improvement'; const fr=value>=16?'Très bien':value>=14?'Bien':value>=12?'Assez bien':value>=10?'Passable':'Insuffisant';return french?fr:en;}
export function rank(values:number[],value:number){return 1+values.filter(v=>v>value+1e-9).length;}
export function calculate(s:Snapshot,classId:string,term:number):Result[]{
 const students=s.students.filter(x=>x.class_id===classId), subjects=s.subjects.filter(x=>x.class_id===classId), q1=term*2-1,q2=term*2;
 if(!students.length||!subjects.length) throw new Error('This class needs students and subjects.');
 const results:Result[]=students.map(student=>{
 const rows:ResultRow[]=subjects.map(sub=>{const a=s.marks.find(m=>m.student_id===student.id&&m.subject_id===sub.id&&m.sequence===q1),b=s.marks.find(m=>m.student_id===student.id&&m.subject_id===sub.id&&m.sequence===q2);
 if(!a||!b)throw new Error(`Missing marks: ${student.name}, ${sub.name}.`);
 if((a.status==='exempt')!==(b.status==='exempt'))throw new Error(`Exemption must cover both sequences: ${student.name}, ${sub.name}.`);
 const exempt=a.status==='exempt'; const av=a.status==='absent'?0:a.value, bv=b.status==='absent'?0:b.value;
 if(!exempt&&(av===null||bv===null))throw new Error('A mark is missing.');
 const average=exempt?null:((av??0)+(bv??0))/2;
 return {subject_id:sub.id,name:sub.name,teacher:s.members.find(t=>t.user_id===sub.teacher_id)?.name||'',coefficient:sub.coefficient,seq1:exempt?null:av,seq2:exempt?null:bv,average,points:(average??0)*sub.coefficient,exempt};});
 const totalCoef=rows.reduce((a,r)=>a+(r.exempt?0:r.coefficient),0);if(!totalCoef)throw new Error('No assessed subjects.');
 const totalPoints=rows.reduce((a,r)=>a+r.points,0);
 return {student,rows,average:totalPoints/totalCoef,seq1:rows.reduce((a,r)=>a+(r.seq1??0)*r.coefficient,0)/totalCoef,seq2:rows.reduce((a,r)=>a+(r.seq2??0)*r.coefficient,0)/totalCoef,totalPoints,totalCoef,position:0,size:students.length,remark:s.remarks.find(r=>r.student_id===student.id&&r.term===term)||emptyRemark(student.id,term)};
 });
 for(const r of results){r.position=rank(results.map(x=>x.average),r.average);for(const row of r.rows){if(!row.exempt)row.position=rank(results.map(x=>x.rows.find(a=>a.subject_id===row.subject_id)?.average).filter((v):v is number=>v!==null&&v!==undefined),row.average!);}}
 if(term===3){for(const r of results){const a=s.approvals.find(a=>a.class_id===classId&&a.term===1)?.results.find(x=>x.student.id===r.student.id),b=s.approvals.find(a=>a.class_id===classId&&a.term===2)?.results.find(x=>x.student.id===r.student.id);if(!a||!b)throw new Error(`Approve terms 1 and 2 first for ${r.student.name}.`);r.termAverages=[a.average,b.average,r.average];r.annualAverage=(a.average+b.average+r.average)/3;}for(const r of results)r.annualPosition=rank(results.map(x=>x.annualAverage!),r.annualAverage!);}
 return results.sort((a,b)=>a.student.name.localeCompare(b.student.name));
}
export function validateMark(value:unknown){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>20)throw new Error('Marks must be between 0 and 20.');return value;}
