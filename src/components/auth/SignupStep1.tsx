'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useSignupStore } from '@/store/signup'

export function SignupStep1() {
  const { name, email, password, agreedToTerms, setField, setAgreedToTerms, setStep, setUserId } = useSignupStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGoogleSignup = async () => {
    console.log('Google signup clicked!')
    setLoading(true)
    try {
      await signIn('google', { callbackUrl: '/signup?step=2' })
    } catch (err) {
      console.error('Google sign in error:', err)
      setLoading(false)
    }
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreedToTerms) { setError('Please agree to Terms & Conditions'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Registration failed'); return }
      setUserId(data.user?.id ?? data.userId)
      setStep(2)
    } catch (err) {
      console.warn("[caught] src/components/auth/SignupStep1.tsx:42", err instanceof Error ? { name: err.name, message: err.message } : err)

      setError('Network error, please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-white font-bold text-xl mb-1">Create your account</h2>
      <p className="text-gray-500 text-sm mb-6">Start with Google or email</p>

      <button
        onClick={handleGoogleSignup}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 py-3 rounded-lg border border-[#2a3040] hover:border-[#3a4050] bg-[#151b24] text-white text-sm font-medium transition mb-5 disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-[#2a3040]" />
        <span className="text-gray-600 text-xs">or continue with email</span>
        <div className="flex-1 h-px bg-[#2a3040]" />
      </div>

      <form onSubmit={handleEmailSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="Full name"
          value={name}
          onChange={e => setField('name', e.target.value)}
          required
          className="w-full bg-[#1a1f2e] border border-[#2a3040] rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:border-[#00e5c8]/50 focus:outline-none"
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setField('email', e.target.value)}
          required
          className="w-full bg-[#1a1f2e] border border-[#2a3040] rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:border-[#00e5c8]/50 focus:outline-none"
        />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={e => setField('password', e.target.value)}
          required
          className="w-full bg-[#1a1f2e] border border-[#2a3040] rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:border-[#00e5c8]/50 focus:outline-none"
        />

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={e => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 rounded border-gray-600 bg-[#1a1f2e] accent-[#00e5c8]"
          />
          <span className="text-xs text-gray-500">
            I agree to the{' '}
            <Link href="/terms" className="text-[#00e5c8] hover:underline">Terms & Conditions</Link>
            {' '}and{' '}
            <Link href="/privacy" className="text-[#00e5c8] hover:underline">Privacy Policy</Link>
          </span>
        </label>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button
          type="submit"
          disabled={loading || !agreedToTerms}
          className="w-full py-3 rounded-lg bg-[#00e5c8] text-[#0d1117] font-bold text-sm hover:bg-[#00e5c8]/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-xs text-gray-600 mt-5">
        Already have an account?{' '}
        <Link href="/login" className="text-[#00e5c8] hover:underline">Sign in</Link>
      </p>
    </div>
  )
}
