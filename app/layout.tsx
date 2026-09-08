import './globals.css'
import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Reachout — Your network, working for your job search', description: 'A personal job-search CRM for LinkedIn exports, opportunities and outreach.' }
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
