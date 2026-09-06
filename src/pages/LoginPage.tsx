import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface LoginPageProps {
  /** Just for copy — which staff page sent the user here. */
  roleLabel: 'Owner' | 'Reception';
}

/**
 * Shared login for both staff pages. No self-serve "become an owner" flow
 * on purpose — who gets to be staff on a property is decided by inserting a
 * row into staff_properties (see the note at the bottom of
 * supabase/seed.sql), not by whoever signs up first. Sign-up here just
 * creates the auth.users row; it grants no access by itself.
 */
export default function LoginPage({ roleLabel }: LoginPageProps) {
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<{ type: 'error' | 'info'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Full-page redirect to Google, then back to this exact URL — no
  // password, no confirmation email, so it sidesteps Supabase's auth email
  // rate limit entirely. Requires Google to be enabled under Authentication
  // > Sign In / Providers in the Supabase dashboard first (see setup notes
  // in the conversation this was built from, or Supabase's own docs for
  // "Login with Google").
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setStatus(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    // On success the browser navigates away immediately, so there's
    // normally nothing left to update here — this only runs if the
    // redirect itself failed to start (e.g. Google isn't configured yet).
    if (error) {
      setStatus({ type: 'error', message: error.message });
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      if (mode === 'sign_in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // On success, useAuth's onAuthStateChange listener updates the
        // session and the page above re-renders past the login gate —
        // nothing else to do here.
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setStatus({
          type: 'info',
          message: 'Account created. If your Supabase project requires email confirmation, check your inbox before signing in. Then ask whoever manages the database to grant you access (see supabase/seed.sql).',
        });
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Something went wrong.';
      // Supabase's own message here is accurate but not actionable — the
      // real fix is a dashboard setting, not something retryable from this
      // form. Updating auth.users.email_confirmed_at via SQL doesn't
      // reliably unblock an already-created account either, so the
      // actionable path is: turn confirmation off, delete this account, and
      // sign up again — not "check your email."
      const message = /email.*not.*confirmed/i.test(raw)
        ? 'This account needs email confirmation, which this project has off. Ask whoever manages the Supabase project to: turn off "Confirm email" in Authentication > Sign In / Providers > Email if not already off, delete this user under Authentication > Users, then sign up again here.'
        : raw;
      setStatus({ type: 'error', message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f6faff] p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#E9ECEF] shadow-sm p-6">
        <h1 className="text-lg font-bold text-[#141d23] mb-1">{roleLabel} sign in</h1>
        <p className="text-xs text-[#7f7668] mb-5">Cabadra staff access — not for guests.</p>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full h-10 border border-[#E9ECEF] rounded-lg text-sm font-semibold text-[#141d23] hover:bg-[#f6faff] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.85.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.27-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33Z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
          </svg>
          <span>{googleLoading ? 'Redirecting…' : 'Continue with Google'}</span>
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-[#E9ECEF]" />
          <span className="text-[11px] text-[#7f7668] font-semibold uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-[#E9ECEF]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[#141d23] block mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg text-sm focus:border-[#765a25] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#141d23] block mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg text-sm focus:border-[#765a25] focus:outline-none"
            />
          </div>

          {status && (
            <p className={`text-xs ${status.type === 'error' ? 'text-red-600' : 'text-[#4e463a]'}`}>
              {status.message}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-10 bg-[#765a25] text-white rounded-lg text-sm font-bold hover:bg-[#5c4210] transition-colors disabled:opacity-60"
          >
            {submitting ? 'Please wait…' : mode === 'sign_in' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => { setMode(m => (m === 'sign_in' ? 'sign_up' : 'sign_in')); setStatus(null); }}
          className="w-full text-center text-xs text-[#765a25] font-semibold mt-4 hover:underline"
        >
          {mode === 'sign_in' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
