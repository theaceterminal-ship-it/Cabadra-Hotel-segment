import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { rememberWebsiteSetupDraft } from '../lib/setupPayment';
import { requestPasswordLink } from '../lib/accountPassword';

interface LoginPageProps {
  /** Just for copy — which staff page sent the user here. Omitted at /login and /signup, which don't ask a new user to pick a role at all; where a role is known, it's shown for a bookmarked direct link to /owner or /reception while signed out. */
  roleLabel?: 'Owner' | 'Reception';
  /** Which tab the form opens on — /signup opens on "Sign up", everything else on "Sign in". */
  initialMode?: 'sign_in' | 'sign_up';
}

/**
 * Shared login for owner and reception. New accounts are Google-only: the
 * Sign up tab has just the Google button, and signing up grants no access
 * by itself — becoming an owner happens in onboarding by paying for a
 * property. Once that's done the owner is emailed a link to also set a
 * password (verify-setup-payment, via Resend), and from then on the Sign in
 * tab's email + password form works for them too. "Forgot your password?"
 * sends a fresh link (send-password-link), which is also how a Google-only
 * account gets a password later. Reception access is deliberately not
 * self-serve — a receptionist only gets in once a hotel's owner invites
 * that email from their Staff tab.
 *
 * Styled to match the public website (MarketingPage), same photo and
 * palette, rather than the staff theme.
 */
export default function LoginPage({ roleLabel, initialMode = 'sign_in' }: LoginPageProps) {
  // The staff gates (/owner, /reception while signed out) only ever sign in.
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>(roleLabel ? 'sign_in' : initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<{ type: 'error' | 'info'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [linkState, setLinkState] = useState<'idle' | 'sending' | 'sent'>('idle');
  // Set when the visitor typed a property name into the website's setup bar.
  const [searchParams] = useSearchParams();
  const propertyName = searchParams.get('property');
  // Kept in sessionStorage so onboarding can prefill it, even after the
  // Google redirect drops the query string.
  useEffect(() => {
    rememberWebsiteSetupDraft(searchParams);
  }, [searchParams]);

  // Full-page redirect to Google, then back to this exact URL, where
  // AuthPage sends the new session on to onboarding or the dashboard.
  // Requires Google to be enabled under Authentication > Sign In /
  // Providers in the Supabase dashboard.
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

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // On success, useAuth's onAuthStateChange listener updates the session
    // and the page above re-renders past the login gate.
    if (error) {
      const message = /invalid login credentials/i.test(error.message)
        ? 'Wrong email or password. If you signed up with Google and haven’t set a password yet, continue with Google or use “Forgot your password?”.'
        : error.message;
      setStatus({ type: 'error', message });
    }
    setSubmitting(false);
  };

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkState('sending');
    setStatus(null);
    try {
      setStatus({ type: 'info', message: await requestPasswordLink(email) });
      setLinkState('sent');
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Couldn’t send the link.' });
      setLinkState('idle');
    }
  };

  const switchMode = (m: 'sign_in' | 'sign_up') => {
    setMode(m);
    setStatus(null);
    setForgotOpen(false);
    setLinkState('idle');
  };

  const title = roleLabel
    ? `${roleLabel} sign in`
    : forgotOpen
      ? 'Set or reset your password'
      : mode === 'sign_in'
        ? 'Welcome back'
        : propertyName
          ? `Let’s set up ${propertyName}`
          : 'Create your account';

  const subtitle = roleLabel
    ? 'Cabadra staff access — not for guests.'
    : forgotOpen
      ? 'We’ll email you a link to choose a password.'
      : mode === 'sign_in'
        ? 'Sign in to your Cabadra dashboard.'
        : 'For hotel owners. Works alongside the PMS you already use.';

  const inputClass =
    'w-full h-12 px-5 rounded-full border border-black/15 text-[15px] focus:border-black/50 focus:outline-none transition-colors';

  const googleButton = (
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
      <span>{googleLoading ? 'Redirecting…' : mode === 'sign_up' ? 'Sign up with Google' : 'Continue with Google'}</span>
    </button>
  );

  const statusLine = status && (
    <p className={`text-[13px] px-1 ${status.type === 'error' ? 'text-red-600' : 'text-[#111]/60'}`}>{status.message}</p>
  );

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
            {!roleLabel && !forgotOpen && (
              <div className="grid grid-cols-2 rounded-full bg-[#f2f2f0] p-1 mb-6 text-sm font-medium">
                {(['sign_in', 'sign_up'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={`h-9 rounded-full transition-colors ${mode === m ? 'bg-white shadow-sm text-[#111]' : 'text-[#111]/55 hover:text-[#111]'}`}
                  >
                    {m === 'sign_in' ? 'Sign in' : 'Sign up'}
                  </button>
                ))}
              </div>
            )}

            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
            <p className="mt-1 text-sm text-[#111]/55">{subtitle}</p>

            {forgotOpen ? (
              <form onSubmit={handleSendLink} className="mt-6 space-y-3">
                <label className="block">
                  <span className="text-[13px] text-[#111]/55 block mb-1.5 pl-1">Email</span>
                  <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
                </label>
                {statusLine}
                <button
                  type="submit"
                  disabled={linkState !== 'idle'}
                  className="w-full h-12 mt-2 rounded-full bg-[#111] text-white text-[15px] font-medium hover:bg-black transition-colors disabled:opacity-60"
                >
                  {linkState === 'sending' ? 'Sending…' : linkState === 'sent' ? 'Link sent' : 'Email me a link'}
                </button>
                <button
                  type="button"
                  onClick={() => { setForgotOpen(false); setStatus(null); setLinkState('idle'); }}
                  className="w-full text-center text-[13px] text-[#111]/55 hover:text-[#111] pt-1"
                >
                  Back to sign in
                </button>
              </form>
            ) : mode === 'sign_up' ? (
              <>
                {googleButton}
                {statusLine && <div className="mt-3">{statusLine}</div>}
                <p className="mt-5 text-center text-[12px] leading-relaxed text-[#111]/50">
                  By creating an account you agree to our{' '}
                  <Link to="/terms" className="underline underline-offset-2 hover:text-[#111]">Terms</Link> and{' '}
                  <Link to="/privacy" className="underline underline-offset-2 hover:text-[#111]">Privacy policy</Link>.
                </p>
              </>
            ) : (
              <>
                {googleButton}

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-black/10" />
                  <span className="text-xs text-[#111]/45">or with email</span>
                  <div className="flex-1 h-px bg-black/10" />
                </div>

                <form onSubmit={handleSignIn} className="space-y-3">
                  <label className="block">
                    <span className="text-[13px] text-[#111]/55 block mb-1.5 pl-1">Email</span>
                    <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
                  </label>
                  <div>
                    <div className="flex items-center justify-between text-[13px] text-[#111]/55 mb-1.5 px-1">
                      <label htmlFor="login-password">Password</label>
                      <button
                        type="button"
                        onClick={() => { setForgotOpen(true); setStatus(null); }}
                        className="text-[#111]/70 hover:text-[#111] underline underline-offset-2"
                      >
                        Forgot your password?
                      </button>
                    </div>
                    <input
                      id="login-password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  {statusLine}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-12 mt-2 rounded-full bg-[#111] text-white text-[15px] font-medium hover:bg-black transition-colors disabled:opacity-60"
                  >
                    {submitting ? 'Please wait…' : 'Sign in'}
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
