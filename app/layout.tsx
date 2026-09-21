import './globals.css'
import type { Metadata, Viewport } from 'next'
import PWAInstall from './PWAInstall'

export const metadata: Metadata = {
  title: 'ReachOut | Your outreach copilot',
  description: 'Turn your LinkedIn network into a prioritized outreach plan.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-180.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ReachOut',
  },
}

export const viewport: Viewport = {
  themeColor: '#5643d3',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}<PWAInstall /></body></html>
}
