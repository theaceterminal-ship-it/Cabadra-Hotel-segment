import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { KeyRound, Link2, Loader2, Mail } from 'lucide-react';
import { fetchRoomGate, requestNewStayCode, verifyStayCode, type RoomGate } from '../lib/stayAccess';

const SAVED_TOKEN_KEY = 'cabadra_guest_token';
const readSavedToken = () => { try { return localStorage.getItem(SAVED_TOKEN_KEY); } catch { return null; } };

type View =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'slow' }
  | { kind: 'error'; text: string }
  | { kind: 'gate'; gate: Extract<RoomGate, { status: 'link_required' | 'code_required' }> };

/**
 * What a printed room QR points at: /guest/room/:roomCode (the room's random code).
 * A phone that already holds this stay (it opened the stay link, or entered the code
 * before) goes straight in. Anyone else sees what this stay asks for: the six-digit
 * code that was emailed to the guest, or, for a stay set up with the stay link, a
 * note to use that link. See 0091 for the rules and the limits on wrong guesses.
 */
export default function RoomRedirect() {
  const { roomId: roomCode = '' } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const enter = (token: string) => {
    try { localStorage.setItem(SAVED_TOKEN_KEY, token); } catch { /* storage blocked: the link still works this time */ }
    navigate(`/guest/${token}`, { replace: true });
  };

  useEffect(() => {
    if (!roomCode) return;
    let cancelled = false;
    fetchRoomGate(roomCode, readSavedToken())
      .then(gate => {
        if (cancelled) return;
        if (gate.status === 'open') enter(gate.token);
        else if (gate.status === 'none') setView({ kind: 'none' });
        else if (gate.status === 'slow_down') setView({ kind: 'slow' });
        else setView({ kind: 'gate', gate });
      })
      .catch(err => { if (!cancelled) setView({ kind: 'error', text: err instanceof Error ? err.message : 'This room is not available right now.' }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  useEffect(() => { document.documentElement.classList.remove('dark'); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.replace(/\D/g, '').length !== 6 || busy) return;
    setBusy(true); setMessage(null);
    try {
      const r = await verifyStayCode(roomCode, code);
      if (r.ok) { enter(r.token); return; }
      setCode('');
      if (r.reason === 'wrong') setMessage({ tone: 'error', text: r.attemptsLeft && r.attemptsLeft > 1 ? `That code isn’t right. ${r.attemptsLeft} tries left.` : 'That code isn’t right. One try left before this locks for a while.' });
      else if (r.reason === 'locked') setMessage({ tone: 'error', text: 'Too many wrong tries. Please wait half an hour, or ask the front desk.' });
      else if (r.reason === 'needs_new_code') setMessage({ tone: 'info', text: 'That code was cancelled. Tap “Send me a new code” below.' });
      else if (r.reason === 'slow_down') setMessage({ tone: 'error', text: 'Too many tries from this phone. Please wait a few minutes.' });
      else setMessage({ tone: 'error', text: 'This room doesn’t have an active stay right now.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Couldn’t check the code. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const sendAgain = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true); setMessage(null);
    const r = await requestNewStayCode(roomCode);
    setBusy(false);
    if (r.ok) {
      setCooldown(60);
      setMessage({ tone: 'info', text: 'If there’s an email on this stay, a new code is on its way. Check your inbox, and your spam folder.' });
      setView(v => (v.kind === 'gate' && v.gate.status === 'code_required' ? { kind: 'gate', gate: { ...v.gate, locked: false, needsNewCode: false } } : v));
      inputRef.current?.focus();
    } else {
      setMessage({ tone: 'error', text: r.message ?? 'Could not send a new code.' });
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen w-full flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );

  if (view.kind === 'loading') {
    return shell(<p className="text-sm text-center text-on-surface-strong-muted flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Opening your room…</p>);
  }
  if (view.kind === 'none') {
    return shell(
      <div className="text-center space-y-2">
        <h1 className="text-lg font-bold text-on-surface-strong">No one’s checked in here yet</h1>
        <p className="text-sm text-on-surface-strong-muted">This room doesn’t have an active guest right now. Please check with the front desk.</p>
      </div>
    );
  }
  if (view.kind === 'slow') {
    return shell(<p className="text-sm text-center text-on-surface-strong-muted">Too many tries from this phone. Please wait a few minutes and scan again.</p>);
  }
  if (view.kind === 'error') {
    return shell(<p className="text-sm text-center text-on-surface-strong-muted">{view.text}</p>);
  }

  const { gate } = view;
  if (gate.status === 'link_required') {
    return shell(
      <div className="text-center space-y-3">
        <Link2 className="size-7 mx-auto text-on-surface-strong-muted" />
        <h1 className="text-lg font-bold text-on-surface-strong">Room {gate.roomNumber}, {gate.propertyName}</h1>
        <p className="text-sm text-on-surface-strong-muted">To open room service, use your personal stay link from the front desk. Open it once and this QR will work on your phone after that.</p>
      </div>
    );
  }

  return shell(
    <form onSubmit={submit} className="space-y-4 text-center">
      <KeyRound className="size-7 mx-auto text-on-surface-strong-muted" />
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-on-surface-strong">Room {gate.roomNumber}, {gate.propertyName}</h1>
        <p className="text-sm text-on-surface-strong-muted">Enter the 6-digit code we {gate.channel === 'sms' ? 'texted' : 'emailed'} to <strong>{gate.hint || 'you'}</strong> at check-in.</p>
      </div>
      <input
        ref={inputRef}
        value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        autoFocus
        aria-label="6-digit code"
        placeholder="••••••"
        className="w-full h-14 text-center text-2xl tracking-[0.5em] font-semibold rounded-2xl border border-outline-variant bg-surface-container-lowest text-on-surface-strong focus:border-primary focus:outline-none"
      />
      {message && <p className={`text-sm ${message.tone === 'error' ? 'text-error' : 'text-on-surface-strong-muted'}`}>{message.text}</p>}
      {gate.locked && !message && <p className="text-sm text-error">Too many wrong tries. Tap “Send me a new code”, or ask the front desk.</p>}
      <button type="submit" disabled={code.length !== 6 || busy} className="w-full h-12 rounded-full bg-primary text-on-primary text-sm font-semibold disabled:opacity-50">
        {busy ? 'Checking…' : 'Open room service'}
      </button>
      <button type="button" onClick={sendAgain} disabled={cooldown > 0 || busy} className="inline-flex items-center gap-1.5 text-sm text-on-surface-strong-muted underline-offset-2 hover:underline disabled:opacity-50 disabled:no-underline">
        <Mail className="size-4" /> {cooldown > 0 ? `Send me a new code (${cooldown}s)` : 'Send me a new code'}
      </button>
      <p className="text-xs text-on-surface-strong-muted">No email? Ask the front desk for your stay link.</p>
    </form>
  );
}
