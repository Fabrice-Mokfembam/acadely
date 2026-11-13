import {createClient} from '@supabase/supabase-js';
export async function POST(request:Request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!publishable||!secret)return Response.json({error:'Configure SUPABASE_SECRET_KEY on the server to create teacher accounts.'},{status:503});
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!token)return Response.json({error:'Sign in first.'},{status:401});
 const scoped=createClient(url,publishable,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const {data:{user},error}=await scoped.auth.getUser(token);if(error||!user)return Response.json({error:'Invalid session.'},{status:401});
 let body:Record<string,unknown>;try {body=await request.json() as Record<string,unknown>;if(!body||typeof body!=='object')throw Error();}catch{return Response.json({error:'Invalid request.'},{status:400});}
 const {data:membership}=await scoped.from('memberships').select('role').eq('school_id',body.school_id).eq('user_id',user.id).single();
 if(membership?.role!=='admin')return Response.json({error:'School administrator required.'},{status:403});
 if(typeof body.name!=='string'||body.name.trim().length<2||typeof body.email!=='string'||!/^\S+@\S+\.\S+$/.test(body.email)||typeof body.password!=='string'||body.password.length<12)return Response.json({error:'Enter a name, valid email and a temporary password of at least 12 characters.'},{status:400});
 const admin=createClient(url,secret,{auth:{persistSession:false}});
 const {data:created,error:createError}=await admin.auth.admin.createUser({email:body.email,password:body.password,email_confirm:true,user_metadata:{name:body.name}});
 if(createError)return Response.json({error:createError.message},{status:400});
 const {error:insertError}=await admin.from('memberships').insert({school_id:body.school_id,user_id:created.user.id,name:body.name.trim(),email:body.email,role:'teacher'});
 if(insertError){await admin.auth.admin.deleteUser(created.user.id);return Response.json({error:insertError.message},{status:400});}
 return Response.json({ok:true});
}
