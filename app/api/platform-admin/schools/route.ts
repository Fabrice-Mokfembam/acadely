import {createClient} from '@supabase/supabase-js';
export async function POST(request:Request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!publishable||!secret)return Response.json({error:'Supabase server credentials are not configured.'},{status:503});
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!token)return Response.json({error:'Sign in first.'},{status:401});
 const scoped=createClient(url,publishable,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const {data:{user},error:userError}=await scoped.auth.getUser(token);
 if(userError||!user)return Response.json({error:'Invalid session.'},{status:401});
 const admin=createClient(url,secret,{auth:{persistSession:false}});
 const {data:owner}=await admin.from('platform_admins').select('user_id').eq('user_id',user.id).maybeSingle();
 if(!owner)return Response.json({error:'Platform owner access required.'},{status:403});
 let body:Record<string,unknown>;
 try{body=await request.json() as Record<string,unknown>}catch{return Response.json({error:'Invalid request.'},{status:400})}
 const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||''),school=String(body.school||'').trim(),address=String(body.address||'').trim(),year=String(body.year||'').trim();
 if(name.length<2||name.length>120||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||school.length<2||school.length>200||!/^20\d{2}\/20\d{2}$/.test(year))return Response.json({error:'Enter valid administrator, school and password details.'},{status:400});
 const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name,must_change_password:true}});
 if(createError)return Response.json({error:createError.message},{status:400});
 const {data:schoolId,error:schoolError}=await admin.rpc('platform_create_school',{p_user:created.user.id,p_admin_name:name,p_admin_email:email,p_school_name:school,p_address:address,p_year:year,p_actor:user.id});
 if(schoolError){await admin.auth.admin.deleteUser(created.user.id);return Response.json({error:schoolError.message},{status:400})}
 return Response.json({ok:true,school_id:schoolId,school_name:school,administrator:name,email});
}
