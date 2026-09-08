import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
export const runtime='nodejs'
export async function DELETE(req:Request){try{const {userId}=await req.json();if(!userId)return NextResponse.json({error:'Missing userId.'},{status:400});const s=supabaseAdmin();const {error:e1}=await s.from('connections').delete().eq('user_id',userId);if(e1)throw new Error(e1.message);const {error:e2}=await s.from('messages').delete().eq('user_id',userId);if(e2)throw new Error(e2.message);const {error:e3}=await s.from('imports').delete().eq('user_id',userId);if(e3)throw new Error(e3.message);return NextResponse.json({ok:true})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not clear imported data.'},{status:500})}}
