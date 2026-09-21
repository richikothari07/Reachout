import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ enabled: Boolean(process.env.TAVILY_API_KEY), message: 'Live Intelligence refreshes from public web search when triggered from the app.' })
}
