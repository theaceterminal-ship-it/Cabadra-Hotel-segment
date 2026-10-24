import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { MIN_PASSWORD_LENGTH, checkNewPassword, requestPasswordLink, setAccountPassword } from '../lib/accountPassword';

/**
 * `/set-password` — where the emailed "set a password" link lands (see
 * supabase/functions/_shared/passwordEmail.ts). The link is a Supabase
 * recovery link, so by the time this renders supabase-js has already
 * signed the owner in from the URL; this page only asks for the new
 * password. An expired or already-used link arrives with no session (and
 * an error in the URL), and gets a "send a new link" form instead.
 */
export default function SetPasswordPage() {
  const { loading, session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [linkState, setLinkState] = useState<'idle' | 'sending' | 'sent'>('idle');

  // Supabase puts the reason a link failed in the URL hash.
  const linkError = useMemo(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return params.get('error_code') || params.get('error') ? params.get('error_description') ?? 'This link has expired.' : null;
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = checkNewPassword(password, confirm);
    if (problem) {
      setMessage({ type: 'error', text: problem });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await setAccountPassword(password);
      setDone(true);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Couldn’t save the password.' });
    } finally {
      setSaving(false);
    }
  };

  const handleNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkState('sending');
    setMessage(null);
    try {
      setMessage({ type: 'info', text: await requestPasswordLink(email) });
      setLinkState('sent');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Couldn’t send the link.' });
      setLinkState('idle');
    }
  };

  const inputClass =
    'w-full h-12 px-5 rounded-full border border-black/15 text-[15px] focus:border-black/50 focus:outline-none transition-colors';
  const primaryButton =
    'w-full h-12 rounded-full bg-[#111] text-white text-[15px] font-medium hover:bg-black transition-colors disabled:opacity-60';
  const messageLine = message && (
    <p className={`text-[13px] px-1 ${message.type === 'error' ? 'text-red-600' : 'text-[#111]/60'}`}>{message.text}</p>
  );

  let body: React.ReactNode;
  if (loading) {
    body = <p className="text-sm text-[#111]/55">Checking your link…</p>;
  } else if (done) {
    body = (
      <>
        <span className="size-12 rounded-full bg-[#eef0ec] flex items-center justify-center"><CheckCircle2 className="size-5" /></span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em]">Password saved</h1>
        <p className="mt-2 text-sm text-[#111]/60 leading-relaxed">
          You can now sign in with <span className="font-medium text-[#111]">{session?.user.email}</span> and this password, or keep using Google.
        </p>
        <Link to="/" className={`${primaryButton} mt-6 inline-flex items-center justify-center`}>Go to my dashboard</Link>
      </>
    );
  } else if (session) {
    body = (
      <>
        <span className="size-12 rounded-full bg-[#eef0ec] flex items-center justify-center"><KeyRound className="size-5" /></span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em]">Set your password</h1>
        <p className="mt-2 text-sm text-[#111]/60">
          For <span className="font-medium text-[#111]">{session.user.email}</span>. You can still sign in with Google too.
        </p>
        <form onSubmit={handleSave} className="mt-6 space-y-3">
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            placeholder={`New password (at least ${MIN_PASSWORD_LENGTH} characters)`}
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="Repeat password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className={inputClass}
          />
          {messageLine}
          <button type="submit" disabled={saving} className={`${primaryButton} mt-2`}>
            {saving ? 'Saving…' : 'Save password'}
          </button>
        </form>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">This link has expired</h1>
        <p className="mt-2 text-sm text-[#111]/60">
          {linkError ? 'Password links work once and expire after an hour.' : 'Open the link from your email to set a password.'} Enter your email and we’ll send a new one.
        </p>
        <form onSubmit={handleNewLink} className="mt-6 space-y-3">
          <input type="email" required autoComplete="email" placeholder="Your email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
          {messageLine}
          <button type="submit" disabled={linkState !== 'idle'} className={primaryButton}>
            {linkState === 'sending' ? 'Sending…' : linkState === 'sent' ? 'Link sent' : 'Email me a new link'}
          </button>
        </form>
        <Link to="/login" className="mt-4 block text-center text-[13px] text-[#111]/55 hover:text-[#111]">Back to sign in</Link>
      </>
    );
  }

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
        <header className="relative z-10 px-5 sm:px-10 pt-5 sm:pt-8">
          <Link to="/" className="text-[26px] sm:text-[30px] font-semibold tracking-[-0.03em]">Cabadra</Link>
        </header>
        <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-[400px] rounded-[32px] bg-white p-6 sm:p-8 shadow-[0_10px_50px_rgba(0,0,0,0.15)]">{body}</div>
        </div>
      </div>
    </div>
  );
}
