'use client'

import { FormEvent, useState } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

type Mode = 'login' | 'signup' | 'reset'

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
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
    </main>
  )
}
