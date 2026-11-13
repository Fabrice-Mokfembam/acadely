import Dexie, {type Table} from 'dexie';
import type {Snapshot,Operation} from './model';
interface Cache {key:string;data:Snapshot;updated:string;}
export interface Pending {id:string;key:string;operation:Operation;created:string;error?:string;}
interface Draft {key:string;marks:Snapshot['marks'];}
class OfflineStore extends Dexie { snapshots!:Table<Cache,string>;queue!:Table<Pending,string>;drafts!:Table<Draft,string>;constructor(){super('school-reports-v1');this.version(1).stores({snapshots:'key',queue:'id,key',drafts:'key'});}}
export const offline=new OfflineStore();
export const cacheKey=(user:string,school:string)=>`${user}:${school}`;
export async function cacheSnapshot(key:string,data:Snapshot){await offline.snapshots.put({key,data,updated:new Date().toISOString()});}
export async function enqueue(key:string,operation:Operation){const id=String(operation.operation_id||crypto.randomUUID());await offline.queue.put({id,key,operation:{...operation,operation_id:id},created:new Date().toISOString()});}
