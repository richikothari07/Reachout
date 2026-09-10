import './globals.css'
import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'ReachOut — Your agentic outreach copilot', description: 'Turn your LinkedIn network into a prioritized outreach plan.' }
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
