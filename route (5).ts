import { NextResponse } from 'next/server'
import { authenticatedUser } from '@/lib/supabase-server'

export const runtime = 'nodejs'
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b'

const clean = (value: unknown, max = 180) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export async function POST(req: Request) {
  try {
    await authenticatedUser(req)
    const key = process.env.GROQ_API_KEY
    if (!key) {
      return NextResponse.json(
        { error: 'Groq is not configured yet. Add GROQ_API_KEY in Vercel Environment Variables.' },
        { status: 503 }
      )
    }

    const body = await req.json()
    const { command, target, ownerName, profile, people, followups } = body || {}

    // Keep the agent request deliberately small. The app can have thousands of contacts,
    // but the model only needs the strongest candidates to make the next-action decision.
    const candidates = Array.isArray(people)
      ? people.slice(0, 25).map((p: any) => ({
          name: clean(p.name, 80),
          company: clean(p.company, 80),
          position: clean(p.position, 100),
          score: Number(p.score || 0),
          action: clean(p.action, 30),
          reasons: Array.isArray(p.reasons) ? p.reasons.slice(0, 2).map((x: any) => clean(x, 100)) : [],
          lastOutgoing: clean(p.lastOutgoing, 30),
          lastIncoming: clean(p.lastIncoming, 30),
          outgoingCount: Number(p.outgoingCount || 0),
          incomingCount: Number(p.incomingCount || 0),
        }))
      : []

    const fups = Array.isArray(followups)
      ? followups.slice(0, 10).map((p: any) => ({
          name: clean(p.name, 80),
          company: clean(p.company, 80),
          position: clean(p.position, 100),
          score: Number(p.score || 0),
          lastOutgoing: clean(p.lastOutgoing, 30),
          reasons: Array.isArray(p.reasons) ? p.reasons.slice(0, 2).map((x: any) => clean(x, 100)) : [],
        }))
      : []

    const profileData = profile
      ? {
          name: clean(profile.name, 80),
          headline: clean(profile.headline, 180),
          industry: clean(profile.industry, 80),
          positions: Array.isArray(profile.positions) ? profile.positions.slice(0, 5).map((x: any) => clean(x, 80)) : [],
          skills: Array.isArray(profile.skills) ? profile.skills.slice(0, 12).map((x: any) => clean(x, 50)) : [],
        }
      : null

    const system = `You are ReachOut's outreach planning agent. Use ONLY the supplied data. Never invent people or facts and never claim you accessed LinkedIn or sent a message. Return ONLY JSON matching this shape: {"reply":"short useful answer","actions":[{"name":"exact supplied full name","action":"draft|followup|research|skip","reason":"short reason","priority":1}]}. Return at most 5 actions. Use exact names from the supplied candidates. If there are no good candidates, return an empty actions array.`

    const prompt = `Command: ${clean(command || 'Create my best outreach plan', 220)}
Target role: ${clean(target, 100)}
Owner: ${clean(ownerName, 80)}
Profile: ${JSON.stringify(profileData)}
Top candidates: ${JSON.stringify(candidates)}
Follow-ups: ${JSON.stringify(fups)}`

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_completion_tokens: 500,
        reasoning_effort: 'low',
        include_reasoning: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      console.error('AGENT_GROQ_ERROR', response.status, data)
      return NextResponse.json(
        { error: data?.error?.message || `Groq request failed (${response.status}).` },
        { status: 502 }
      )
    }

    const raw = data?.choices?.[0]?.message?.content
    let parsed: any
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch {
      console.error('AGENT_BAD_JSON', raw)
      return NextResponse.json({ error: 'The agent returned an invalid plan. Please try again.' }, { status: 502 })
    }

    if (!parsed || !Array.isArray(parsed.actions)) {
      return NextResponse.json({ error: 'The agent returned an incomplete plan. Please try again.' }, { status: 502 })
    }

    const allowedNames = new Set([...candidates, ...fups].map((p: any) => clean(p.name, 80).toLowerCase()))
    const actions = parsed.actions
      .filter((a: any) => a && allowedNames.has(clean(a.name, 80).toLowerCase()))
      .slice(0, 5)
      .map((a: any) => ({
        name: clean(a.name, 80),
        action: ['draft', 'followup', 'research', 'skip'].includes(a.action) ? a.action : 'research',
        reason: clean(a.reason, 180),
        priority: Math.min(5, Math.max(1, Number(a.priority) || 3)),
      }))

    return NextResponse.json({
      reply: clean(parsed.reply || 'I built a focused outreach plan.', 300),
      actions,
      model: MODEL,
    })
  } catch (e) {
    console.error('AGENT_ROUTE_ERROR', e)
    const message = e instanceof Error ? e.message : 'Could not run the outreach agent.'
    const status = /authentication|session has expired|sign in/i.test(message) ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
