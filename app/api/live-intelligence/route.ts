import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    mode: 'people-discovery',
    message: 'Live Intelligence is now People Discovery. Use LinkedIn people search to find new contacts outside your existing network.'
  })
}

export async function POST() {
  return NextResponse.json({
    error: 'News-based live intelligence has been retired. Use the People Discovery tab instead.'
  }, { status: 410 })
}
