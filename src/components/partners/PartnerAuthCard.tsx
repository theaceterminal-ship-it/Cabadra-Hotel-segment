import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { requestPasswordLink } from '../../lib/accountPassword';

/**
 * Sign up / sign in for local businesses, at /partner. Like owners: new
 * accounts are Google only; email + password works once a password is set
 * ("Forgot your password?" emails a link, which also gives a Google
 * account a password). Google sends the business back to /partner, which
 * links its listings (partner_claim).
 */
export function PartnerAuthCard({ initialMode = 'sign_in', note }: { initialMode?: 'sign_in' | 'sign_up'; note?: string }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'google' | 'password' | 'link' | null>(null);
  const [status, setStatus] = useState<{ type: 'error' | 'info'; message: string } | null>(null);
  const [forgot, setForgot] = useState(false);

  const google = async () => {
    setBusy('google');
    setStatus(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/partner` } });
    if (error) {
      setStatus({ type: 'error', message: error.message });
      setBusy(null);
    }
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('password');
    setStatus(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus({
        type: 'error',
        message: /invalid login credentials/i.test(error.message)
          ? 'Wrong email or password. If you signed up with Google, continue with Google, or use “Forgot your password?” to set one.'
          : error.message,
      });
    }
    setBusy(null);
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('link');
    setStatus(null);
    try {
      setStatus({ type: 'info', message: await requestPasswordLink(email) });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Couldn’t send the link.' });
    } finally {
      setBusy(null);
    }
  };

  const field = 'w-full h-12 px-4 rounded-2xl bg-[#f4f5f2] border border-transparent text-[15px] placeholder:text-[#111]/35 focus:outline-none focus:border-[#111]/30 focus:bg-white transition-colors';

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mx-auto w-full max-w-md rounded-[28px] bg-white p-6 sm:p-8">
      <div className="grid grid-cols-2 rounded-full bg-[#f4f5f2] p-1 text-sm font-medium">
        {(['sign_in', 'sign_up'] as const).map(m => (
          <button key={m} onClick={() => { setMode(m); setStatus(null); setForgot(false); }} className={`h-9 rounded-full transition-colors ${mode === m ? 'bg-white shadow-sm' : 'text-[#111]/55'}`}>
            {m === 'sign_in' ? 'Sign in' : 'New business'}
          </button>
        ))}
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">{mode === 'sign_in' ? 'Sign in to your partner page' : 'List your business on Cabadra'}</h1>
      <p className="mt-1.5 text-[15px] text-[#111]/60">
        {note ?? (mode === 'sign_in'
          ? 'Already listed? Use the email your listing is under and we’ll find it.'
          : 'Create your account with Google, then tell us about your business. Nothing to pay until you’re approved.')}
      </p>

      <button type="button" onClick={google} disabled={!!busy} className="mt-6 w-full h-12 rounded-full border border-black/15 text-[15px] font-medium hover:bg-black/[0.03] transition-colors disabled:opacity-60 flex items-center justify-center gap-2.5">
        <svg className="w-4 h-4" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.85.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z" />
          <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.27-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33Z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
        </svg>
        {busy === 'google' ? 'Redirecting…' : mode === 'sign_up' ? 'Sign up with Google' : 'Continue with Google'}
      </button>

      {mode === 'sign_in' && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-[#111]/40"><span className="h-px flex-1 bg-black/10" />or with email<span className="h-px flex-1 bg-black/10" /></div>
          <form onSubmit={forgot ? sendLink : signIn} className="space-y-3">
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={field} />
            {!forgot && <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" className={field} />}
            <button disabled={!!busy} className="w-full h-12 rounded-full bg-[#111] text-white text-[15px] font-medium disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {(busy === 'password' || busy === 'link') && <Loader2 className="size-4 animate-spin" />}
              {forgot ? 'Email me a link' : 'Sign in'}
            </button>
          </form>
          <button onClick={() => { setForgot(f => !f); setStatus(null); }} className="mt-3 w-full text-center text-[13px] text-[#111]/55 hover:text-[#111]">
            {forgot ? 'Back to sign in' : 'Forgot your password? Or set one'}
          </button>
        </>
      )}
      {status && <p className={`mt-4 text-[13px] ${status.type === 'error' ? 'text-red-600' : 'text-[#111]/60'}`}>{status.message}</p>}
    </motion.div>
  );
}
