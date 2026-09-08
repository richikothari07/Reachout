import postgres from 'postgres'

let client: ReturnType<typeof postgres> | null = null

function getConnectionString() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL
  if (!url) {
    throw new Error('Database is not configured. Vercel/Supabase POSTGRES_URL is missing.')
  }
  return url
}

export function db() {
  if (!client) {
    client = postgres(getConnectionString(), {
      max: 1,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 20,
      max_lifetime: 60 * 5,
    })
  }
  return client
}

export async function closeDb() {
  if (client) {
    await client.end({ timeout: 2 })
    client = null
  }
}
