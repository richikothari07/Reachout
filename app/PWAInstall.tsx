'use client'

import { useEffect, useState } from 'react'
import { Share, PlusSquare, Download, X } from 'lucide-react'

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  }
  interface Window {
    deferredInstallPrompt?: BeforeInstallPromptEvent
  }
}

export default function PWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    setInstalled(isStandalone)
    setIos(isIOS)

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault()
      const prompt = event as BeforeInstallPromptEvent
      window.deferredInstallPrompt = prompt
      setInstallPrompt(prompt)
      setShow(true)
    }

    const handleInstalled = () => {
      setInstalled(true)
      setShow(false)
      setInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    // iOS has no beforeinstallprompt event, so give Safari users a gentle prompt.
    if (isIOS && !isStandalone) {
      const dismissed = sessionStorage.getItem('reachout_install_dismissed')
      if (!dismissed) setTimeout(() => setShow(true), 1200)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (installed || !show) return null

  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      if (choice.outcome === 'accepted') setShow(false)
      return
    }
    if (ios) return
  }

  const dismiss = () => {
    setShow(false)
    if (ios) sessionStorage.setItem('reachout_install_dismissed', 'true')
  }

  return (
    <div className="pwaInstallCard" role="dialog" aria-label="Install ReachOut">
      <button className="pwaInstallClose" onClick={dismiss} aria-label="Dismiss install prompt"><X size={17} /></button>
      <div className="pwaInstallIcon"><Download size={20} /></div>
      <div className="pwaInstallCopy">
        <strong>Add ReachOut to your Home Screen</strong>
        {ios ? (
          <span><Share size={14} /> Tap <b>Share</b>, then <b>Add to Home Screen</b></span>
        ) : (
          <span>Open ReachOut like an app — faster and easier on your phone.</span>
        )}
      </div>
      {!ios && <button className="pwaInstallButton" onClick={install}>Add</button>}
    </div>
  )
}
