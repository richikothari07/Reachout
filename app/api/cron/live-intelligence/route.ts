import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function GET() {
  return NextResponse.json({ disabled: true, message: 'The old news-based live intelligence cron has been disabled.' })
}
