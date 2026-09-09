import { NextResponse } from 'next/server'
import { authenticatedUser, supabaseAdmin } from '@/lib/supabase-server'
export const runtime='nodejs'
export async function DELETE(req:Request){try{const user=await authenticatedUser(req);const s=supabaseAdmin();for(const table of ['connections','messages','imports']){const {error}=await s.from(table).delete().eq('user_id',user.id);if(error)throw new Error(error.message)}return NextResponse.json({ok:true})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not clear imported data.'},{status:401})}}
