import {createClient} from '@supabase/supabase-js';
const email=process.argv[2]?.trim().toLowerCase();
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!email||!/^\S+@\S+\.\S+$/.test(email))throw Error('Usage: npm run grant:platform-owner -- owner@example.com');
if(!url||!secret)throw Error('Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.');
const supabase=createClient(url,secret,{auth:{persistSession:false}});
let page=1,user;
while(!user){const {data,error}=await supabase.auth.admin.listUsers({page,perPage:1000});if(error)throw error;user=data.users.find(item=>item.email?.toLowerCase()===email);if(user||data.users.length<1000)break;page++}
if(!user)throw Error(`No Supabase user found for ${email}.`);
const {error}=await supabase.from('platform_admins').upsert({user_id:user.id,created_by:user.id});
if(error)throw error;
console.log(`Platform-owner access granted to ${email}.`);
