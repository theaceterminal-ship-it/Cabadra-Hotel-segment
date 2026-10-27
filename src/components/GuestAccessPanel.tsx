import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, KeyRound, Loader2, Mail } from 'lucide-react';
import { GuestLinkCard } from './GuestLinkCard';
import { fetchStayAccess, sendStayCodeByEmail, switchToStayLink, type StayAccessInfo } from '../lib/stayAccess';

/**
 * In a room's details: how this stay opens room service from the QR, and the
 * buttons to change it (email a new code, or use the stay link). Never shows a code.
 */
export function GuestAccessPanel({ reservationId, guestToken }: { reservationId: string; guestToken: string }) {
  const [info, setInfo] = useState<StayAccessInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setInfo(await fetchStayAccess(reservationId)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load access.'); }
  }, [reservationId]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setNote(null); setError(null);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); }
  };

  const sendCode = () => act(async () => {
    const r = await sendStayCodeByEmail(reservationId);
    if (r.ok) setNote('New code emailed. The old one no longer works.'); else setError(r.message ?? 'The code could not be sent.');
  });

  if (!info) return error ? <p className="text-xs text-error">{error}</p> : <p className="text-xs text-on-surface-variant flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" /> Loading room service access…</p>;

  const btn = 'h-8 px-3 rounded-lg text-[11px] font-semibold disabled:opacity-50';
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3 space-y-2">
        <p className="text-xs font-medium text-on-surface-variant flex items-center gap-1.5"><KeyRound className="size-3.5" /> Room service access</p>

        {info.accessMode === 'open' && (
          <p className="flex items-start gap-2 text-xs text-warning"><AlertTriangle className="size-3.5 mt-0.5 shrink-0" /> This stay began before codes existed: anyone who scans this room’s QR can open it. Email the guest a code to close that.</p>
        )}
        {(info.accessMode === 'email' || info.accessMode === 'sms') && (
          <div className="text-xs text-on-surface space-y-0.5">
            <p>Code {info.codeLastSentAt ? 'sent' : 'made'} by {info.codeChannel === 'sms' ? 'text' : 'email'} to <strong>{info.codeSentTo}</strong>
              {info.codeLastSentAt && <> at {new Date(info.codeLastSentAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</>}.</p>
            <p className="text-on-surface-variant">{info.codeVerifiedCount > 0 ? `Entered on a phone ${info.codeVerifiedCount} time${info.codeVerifiedCount === 1 ? '' : 's'}.` : 'Not entered yet.'}</p>
            {info.codeSendError && <p className="text-error">The last send failed: {info.codeSendError}</p>}
            {info.codeLockedUntil && <p className="text-warning">Locked after wrong tries until {new Date(info.codeLockedUntil).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}. Sending a new code unlocks it.</p>}
            {info.codeThrownAway && <p className="text-warning">Too many wrong tries: the code was cancelled. Send a new one.</p>}
          </div>
        )}
        {info.accessMode === 'link' && (
          <p className="text-xs text-on-surface-variant">Stay link only: the room QR opens nothing until the guest has opened their personal link once.</p>
        )}

        {note && <p className="text-xs text-primary">{note}</p>}
        {error && <p className="text-xs text-error">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {info.hasEmail ? (
            <button disabled={busy} onClick={sendCode} className={`${btn} bg-primary text-on-primary hover:bg-primary-hover inline-flex items-center gap-1.5`}>
              <Mail className="size-3" /> {info.accessMode === 'email' ? 'Send a new code' : `Email a code to ${info.emailHint ?? 'the guest'}`}
            </button>
          ) : (
            <span className="text-[11px] text-on-surface-variant self-center">No email on file for a code.</span>
          )}
          {info.accessMode !== 'link' && (
            <button disabled={busy} onClick={() => act(() => switchToStayLink(reservationId))} className={`${btn} border border-outline-variant text-on-surface hover:bg-surface-container`}>Use the stay link</button>
          )}
        </div>
      </div>
      <GuestLinkCard guestToken={guestToken} />
    </div>
  );
}
