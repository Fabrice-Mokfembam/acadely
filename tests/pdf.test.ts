import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveObjectURL} from 'node:buffer';
import {PDFDocument} from 'pdf-lib';
import {downloadReports} from '../lib/pdf.ts';
import {demoData} from '../lib/demo.ts';
import {calculate} from '../lib/model.ts';
test('English and French batch PDFs create valid A4 pages for every student',async()=>{const s=demoData(),room=s.classes[1],results=calculate(s,room.id,1);let blob:import('node:buffer').Blob|undefined;const oldDoc=globalThis.document;Object.assign(globalThis,{document:{createElement:()=>({href:'',download:'',click(){blob=resolveObjectURL(this.href)}})}});try{for(const french of [false,true]){await downloadReports(results,s.school,room,1,french);assert.ok(blob);const doc=await PDFDocument.load(await blob.arrayBuffer());assert.equal(doc.getPageCount(),results.length);assert.ok(Math.abs(doc.getPage(0).getWidth()-595.28)<.01);assert.ok(Math.abs(doc.getPage(0).getHeight()-841.89)<.01);}}finally{Object.assign(globalThis,{document:oldDoc})}});
