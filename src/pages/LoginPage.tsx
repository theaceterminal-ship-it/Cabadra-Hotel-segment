import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface LoginPageProps {
  /** Just for copy — which staff page sent the user here. Omitted at /login and /signup, which don't ask a new user to pick a role at all; where a role is known, it's shown for a bookmarked direct link to /owner or /reception while signed out. */
  roleLabel?: 'Owner' | 'Reception';
  /** Which tab the form opens on — /signup opens on "Create account", everything else on "Sign in". */
  initialMode?: 'sign_in' | 'sign_up';
}

/**
 * Shared login for owner and reception. Sign-up here just creates the
 * auth.users row and grants no access by itself — becoming an owner
 * happens by creating a hotel (staff_create_property grants the caller
 * owner on whatever they just created; see OwnerApp's empty state, which
 * is where a brand-new sign-in with zero properties lands). Reception
 * access is the one path that's deliberately not self-serve — a
 * receptionist only gets in once a hotel's owner invites that email from
 * their Staff tab.
 *
 * Styled to match the public website (MarketingPage), same photo and
 * palette, rather than the staff theme.
 */
export default function LoginPage({ roleLabel, initialMode = 'sign_in' }: LoginPageProps) {
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<{ type: 'error' | 'info'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Set when the visitor typed a property name into the website's setup bar.
  const [searchParams] = useSearchParams();
  const propertyName = searchParams.get('property');

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
          message: 'Account created. If your Supabase project requires email confirmation, check your inbox — otherwise just sign in below and you\'ll be taken straight into setting up your first hotel.',
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

  const title = roleLabel
    ? `${roleLabel} sign in`
    : mode === 'sign_in'
      ? 'Welcome back'
      : propertyName
        ? `Let’s set up ${propertyName}`
        : 'Create your account';

  const subtitle = roleLabel
    ? 'Cabadra staff access — not for guests.'
    : mode === 'sign_in'
      ? 'Sign in to your Cabadra dashboard.'
      : 'For hotel owners. Your staff get access from your dashboard.';

  return (
    <div className="min-h-screen w-full bg-[#eef0ec] p-2 sm:p-4 font-sans antialiased text-[#111]">
      <div
        className="relative min-h-[calc(100svh-1rem)] sm:min-h-[calc(100svh-2rem)] overflow-hidden rounded-[28px] sm:rounded-[40px] bg-cover bg-center flex flex-col"
        style={{
          backgroundImage:
            "url('/landing/hero.jpg'), linear-gradient(180deg, #e9ecea 0%, #c9d3cc 38%, #6f8a6a 72%, #8fa64e 100%)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(242,244,242,0.8)_0%,rgba(242,244,242,0.3)_40%,rgba(0,0,0,0.15)_100%)]" />

        <header className="relative z-10 flex items-center justify-between px-5 sm:px-10 pt-5 sm:pt-8">
          <Link to="/" className="text-[26px] sm:text-[30px] font-semibold tracking-[-0.03em]">
            Cabadra
          </Link>
          <Link
            to="/"
            className="h-10 px-4 inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white/50 backdrop-blur text-sm font-medium hover:bg-white/80 transition-colors"
          >
            <ArrowLeft className="size-4" />
            Home
          </Link>
        </header>

        <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-[400px] rounded-[32px] bg-white p-6 sm:p-8 shadow-[0_10px_50px_rgba(0,0,0,0.15)]">
            {!roleLabel && (
              <div className="grid grid-cols-2 rounded-full bg-[#f2f2f0] p-1 mb-6 text-sm font-medium">
                {(['sign_in', 'sign_up'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMode(m); setStatus(null); }}
                    className={`h-9 rounded-full transition-colors ${mode === m ? 'bg-white shadow-sm text-[#111]' : 'text-[#111]/55 hover:text-[#111]'}`}
                  >
                    {m === 'sign_in' ? 'Sign in' : 'Sign up'}
                  </button>
                ))}
              </div>
            )}

            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
            <p className="mt-1 text-sm text-[#111]/55">{subtitle}</p>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="mt-6 w-full h-12 rounded-full border border-black/15 text-[15px] font-medium hover:bg-black/[0.03] transition-colors disabled:opacity-60 flex items-center justify-center gap-2.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.85.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z" />
                <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.27-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33Z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
              </svg>
              <span>{googleLoading ? 'Redirecting…' : 'Continue with Google'}</span>
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-black/10" />
              <span className="text-xs text-[#111]/45">or with email</span>
              <div className="flex-1 h-px bg-black/10" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block">
                <span className="text-[13px] text-[#111]/55 block mb-1.5 pl-1">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full h-12 px-5 rounded-full border border-black/15 text-[15px] focus:border-black/50 focus:outline-none transition-colors"
                />
              </label>
              <label className="block">
                <span className="text-[13px] text-[#111]/55 block mb-1.5 pl-1">Password</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full h-12 px-5 rounded-full border border-black/15 text-[15px] focus:border-black/50 focus:outline-none transition-colors"
                />
              </label>

              {status && (
                <p className={`text-[13px] px-1 ${status.type === 'error' ? 'text-red-600' : 'text-[#111]/60'}`}>
                  {status.message}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 mt-2 rounded-full bg-[#111] text-white text-[15px] font-medium hover:bg-black transition-colors disabled:opacity-60"
              >
                {submitting ? 'Please wait…' : mode === 'sign_in' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            {roleLabel && (
              <p className="mt-5 text-center text-[13px] text-[#111]/55">
                New to Cabadra?{' '}
                <Link to="/signup" className="font-medium text-[#111] hover:underline">
                  Create an account
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
