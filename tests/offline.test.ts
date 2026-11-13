import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offline,cacheKey,cacheSnapshot,enqueue} from '../lib/offline.ts';
import {demoData} from '../lib/demo.ts';
test('offline snapshots and queued changes are isolated by account and school',async()=>{try{const a=cacheKey('teacher1','school1'),b=cacheKey('teacher2','school1'),c=cacheKey('teacher1','school2');assert.notEqual(a,b);assert.notEqual(a,c);await cacheSnapshot(a,demoData());assert.equal(await offline.snapshots.get(b),undefined);assert.equal(await offline.snapshots.get(c),undefined);const operation={kind:'save_marks',operation_id:crypto.randomUUID(),subject_id:'s',sequence:1,marks:[]};await enqueue(a,operation);await enqueue(a,operation);assert.equal(await offline.queue.where('key').equals(a).count(),1);assert.equal(await offline.queue.where('key').equals(b).count(),0);await offline.drafts.put({key:a+':s:1',marks:[]});await offline.queue.where('key').equals(a).delete();assert.ok(await offline.drafts.get(a+':s:1'));}finally{await offline.delete();}});
