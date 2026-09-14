'use client'

import { FormEvent, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

type Mode = 'login' | 'signup' | 'reset'

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')

    try {
      if (mode === 'reset') {
        const { error: resetError } = await supabaseBrowser.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })

        if (resetError) throw resetError

        setSuccess(
          "If an account exists for this email, we've sent a password reset link. Check your inbox."
        )
        return
      }

      const result =
        mode === 'login'
          ? await supabaseBrowser.auth.signInWithPassword({ email, password })
          : await supabaseBrowser.auth.signUp({ email, password })

      if (result.error) throw result.error

      if (mode === 'signup' && !result.data.session) {
        setSuccess('Account created. Check your email to confirm your account, then sign in.')
        return
      }

      onAuthed()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete that request.')
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode)
    setError('')
    setSuccess('')
  }

  const continueWithGoogle = async () => {
    setGoogleBusy(true)
    setError('')
    setSuccess('')

    try {
      const { error: googleError } = await supabaseBrowser.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      })

      if (googleError) throw googleError
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not continue with Google.')
      setGoogleBusy(false)
    }
  }

  return (
    <main className="authPage">
      <div className="authCard">
        <img src="/reachout-logo.png" className="authLogo" alt="ReachOut" />
        <span className="authEyebrow">OUTREACH INTELLIGENCE</span>

        <h1>
          {mode === 'login'
            ? 'Welcome back.'
            : mode === 'signup'
              ? 'Create your ReachOut account.'
              : 'Reset your password.'}
        </h1>

        <p>
          {mode === 'reset'
            ? "Enter your email and we'll send you a secure password reset link."
            : 'Keep your network, outreach history and follow-ups saved securely across devices.'}
        </p>

        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </label>

          {mode !== 'reset' && (
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
              />
            </label>
          )}

          {error && <div className="authError">{error}</div>}
          {success && <div className="authSuccess">{success}</div>}

          <button className="primary full" disabled={busy} type="submit">
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Send reset link'}
          </button>
        </form>

        {mode !== 'reset' && (
          <div className="authGoogleArea">
            <div className="authDivider"><span>OR</span></div>
            <button className="googleButton" type="button" onClick={continueWithGoogle} disabled={busy || googleBusy}>
              <span className="googleIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M21.35 12.27c0-.71-.06-1.39-.18-2.05H12v3.88h5.23a4.47 4.47 0 0 1-1.94 2.93v2.43h3.14c1.84-1.69 2.92-4.18 2.92-7.19Z"/><path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.34l-3.14-2.43c-.87.58-1.98.92-3.31.92-2.55 0-4.71-1.72-5.49-4.03H3.27v2.5A9.75 9.75 0 0 0 12 21.75Z"/><path fill="#FBBC05" d="M6.51 13.87A5.86 5.86 0 0 1 6.2 12c0-.65.11-1.28.31-1.87v-2.5H3.27A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.06 1.02 4.37l3.24-2.5Z"/><path fill="#EA4335" d="M12 6.1c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.2 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.73 5.38l3.24 2.5C7.29 7.82 9.45 6.1 12 6.1Z"/></svg>
              </span>
              {googleBusy ? 'Connecting…' : 'Continue with Google'}
            </button>
          </div>
        )}

        {mode === 'login' && (
          <button className="forgotPassword" type="button" onClick={() => switchMode('reset')}>
            Forgot password?
          </button>
        )}

        <button
          className="authSwitch"
          type="button"
          onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
        >
          {mode === 'signup'
            ? 'Already have an account? Sign in'
            : mode === 'reset'
              ? 'Back to sign in'
              : 'New to ReachOut? Create your account'}
        </button>

        {mode === 'reset' && (
          <p className="authHint">You’ll receive a secure link if the email is registered.</p>
        )}
      </div>

      <section className="authStory" aria-label="ReachOut network overview">
        <div className="authStoryTop">
          <span>Build</span><i>•</i><span>Nurture</span><i>•</i><span>Move forward</span>
        </div>

        <div className="networkScene" aria-hidden="true">
          <div className="orbit orbitOne"></div>
          <div className="orbit orbitTwo"></div>
          <span className="orbitDot dotOne"></span>
          <span className="orbitDot dotTwo"></span>
          <span className="orbitDot dotThree"></span>

          <div className="networkPerson personOne"><span>AG</span><b>New role</b></div>
          <div className="networkPerson personTwo"><span>RK</span><b>Shared interest</b></div>
          <div className="networkPerson personThree"><span>SP</span><b>Hiring signal</b></div>
          <div className="networkPerson personFour"><span>NM</span><b>Worth a conversation</b></div>

          <div className="authStoryHeadline">
            <strong>The right conversations<br />create new <em>opportunities.</em></strong>
            <span></span>
          </div>
        </div>

        <div className="authStoryFeatures">
          <div><span className="storyIcon storyPeople">●●</span><section><b>People</b><small>From your network</small></section></div>
          <div><span className="storyIcon storySignal">↗</span><section><b>Signals</b><small>That matter</small></section></div>
          <div><span className="storyIcon storyProgress">➤</span><section><b>Progress</b><small>One conversation at a time</small></section></div>
        </div>
      </section>
    </main>
  )
}
