import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Mail, X } from 'lucide-react';
import { GuestLinkCard } from './GuestLinkCard';
import { STAY_ACCESS_EVENT, fetchStayAccess, sendStayCodeByEmail, switchToStayLink, type StayAccessChoice, type StayAccessInfo } from '../lib/stayAccess';

type Phase =
  | { kind: 'working'; text: string }
  | { kind: 'emailed'; info: StayAccessInfo }
  | { kind: 'link'; info: StayAccessInfo; why?: string; problem?: string }
  | { kind: 'error'; text: string };

/**
 * Listens for a finished check-in (promptStayAccess) and finishes the job: emails the
 * guest their code (or, when reception picked the stay link or the guest has no email,
 * shows the link), then tells reception what happened. Mounted once per staff screen.
 */
export function StayAccessHost() {
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);

  const run = useCallback(async (id: string, choice: StayAccessChoice) => {
    setReservationId(id);
    setPhase({ kind: 'working', text: 'Setting up room service access…' });
    try {
      let info = await fetchStayAccess(id);
      // Only a guest who is actually in the room needs access (a future booking does not yet).
      if (info.status !== 'checked_in') { setPhase(null); setReservationId(null); return; }
      if (choice === 'link') {
        setPhase({ kind: 'link', info });
        return;
      }
      if (!info.hasEmail) {
        setPhase({ kind: 'link', info, why: info.hasPhone ? 'No email on file, and text-message codes are not switched on yet.' : 'No email or phone number on file.' });
        return;
      }
      setPhase({ kind: 'working', text: `Emailing the code to ${info.emailHint ?? 'the guest'}…` });
      const sent = await sendStayCodeByEmail(id);
      info = await fetchStayAccess(id);
      setPhase(sent.ok ? { kind: 'emailed', info } : { kind: 'link', info, problem: sent.message });
    } catch (err) {
      setPhase({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' });
    }
  }, []);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<{ reservationId: string; choice: StayAccessChoice }>).detail;
      if (d?.reservationId) void run(d.reservationId, d.choice ?? 'auto');
    };
    window.addEventListener(STAY_ACCESS_EVENT, onEvent);
    return () => window.removeEventListener(STAY_ACCESS_EVENT, onEvent);
  }, [run]);

  if (!phase || !reservationId) return null;
  const close = () => { setPhase(null); setReservationId(null); };

  const switchToLink = async () => {
    if (phase.kind !== 'emailed') return;
    setPhase({ kind: 'working', text: 'Switching to the stay link…' });
    try {
      await switchToStayLink(reservationId);
      setPhase({ kind: 'link', info: { ...phase.info, accessMode: 'link' } });
    } catch (err) {
      setPhase({ kind: 'error', text: err instanceof Error ? err.message : 'Could not switch.' });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-[90]" role="dialog" aria-modal="true" aria-label="Guest room service access">
      <div className="bg-surface-container-lowest rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-outline-variant space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-on-surface">
            {phase.kind === 'emailed' ? 'Code sent' : phase.kind === 'link' ? 'Use the stay link' : phase.kind === 'error' ? 'Couldn’t finish' : 'One moment'}
          </h3>
          <button onClick={close} aria-label="Close" className="text-on-surface-variant hover:text-on-surface p-1 -m-1"><X className="size-5" /></button>
        </div>

        {phase.kind === 'working' && (
          <p className="flex items-center gap-2 text-sm text-on-surface-variant"><Loader2 className="size-4 animate-spin" /> {phase.text}</p>
        )}

        {phase.kind === 'emailed' && (
          <>
            <p className="flex items-start gap-2 text-sm text-on-surface">
              <CheckCircle2 className="size-4 mt-0.5 shrink-0 text-primary" />
              <span>{phase.info.guestName || 'The guest'}’s code for Room {phase.info.roomNumber} was emailed to <strong>{phase.info.codeSentTo ?? phase.info.emailHint}</strong>. They scan the room QR and type it once.</span>
            </p>
            <p className="text-xs text-on-surface-variant flex items-start gap-1.5"><Mail className="size-3.5 mt-0.5 shrink-0" /> You can’t see the code, on purpose. If it doesn’t arrive, send a new one from the room’s details, or use the stay link.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={switchToLink} className="flex-1 h-10 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container-low">Use the stay link instead</button>
              <button onClick={close} className="flex-1 h-10 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover">Done</button>
            </div>
          </>
        )}

        {phase.kind === 'link' && (
          <>
            {phase.why && <p className="flex items-start gap-2 text-xs text-warning bg-warning/10 rounded-lg px-2.5 py-2"><AlertTriangle className="size-3.5 mt-0.5 shrink-0" /> {phase.why}</p>}
            {phase.problem && <p className="flex items-start gap-2 text-xs text-error bg-error/10 rounded-lg px-2.5 py-2"><AlertTriangle className="size-3.5 mt-0.5 shrink-0" /> {phase.problem}</p>}
            <p className="text-sm text-on-surface-variant">
              Give {phase.info.guestName || 'the guest'} this link or let them scan its QR. Once it’s open, room service works on their phone for the whole stay, and the room QR works on that phone too. Until then the room QR won’t open anything.
            </p>
            <GuestLinkCard guestToken={phase.info.guestToken} />
            <button onClick={close} className="w-full h-10 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover">Done</button>
          </>
        )}

        {phase.kind === 'error' && (
          <>
            <p className="text-sm text-error">{phase.text}</p>
            <p className="text-xs text-on-surface-variant">The guest is checked in. Open the room’s details to set up their room service access.</p>
            <button onClick={close} className="w-full h-10 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover">Close</button>
          </>
        )}
      </div>
    </div>
  );
}
