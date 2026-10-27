import React from 'react';
import { AlertTriangle, KeyRound, Link2, Mail, MessageSquare } from 'lucide-react';
import { SMS_OTP_ENABLED, type StayAccessChoice } from '../lib/stayAccess';

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

interface Props {
  email: string;
  phone: string;
  choice: StayAccessChoice;
  onChange: (c: StayAccessChoice) => void;
}

/**
 * "How does this guest get into room service?" in the check-in box. By default
 * the code is emailed to the address typed above the moment you check in; the
 * stay link is the last option, for a guest with no email. Nothing here shows the
 * code: it goes from the server straight to the guest's inbox.
 */
export function CheckInAccessChoice({ email, phone, choice, onChange }: Props) {
  const hasEmail = looksLikeEmail(email);
  const hasPhone = phone.replace(/\D/g, '').length >= 7;
  const useLink = choice === 'link' || !hasEmail;

  const card = (active: boolean, disabled = false) =>
    `w-full text-left rounded-xl border px-3 py-2.5 flex items-start gap-2.5 transition-colors ${
      disabled ? 'border-outline-variant opacity-50 cursor-not-allowed'
      : active ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-on-surface-variant cursor-pointer'}`;

  return (
    <div className="rounded-2xl bg-surface-container-low p-3 space-y-2" role="radiogroup" aria-label="How the guest opens room service">
      <p className="text-[11px] font-semibold text-on-surface-variant flex items-center gap-1.5"><KeyRound className="size-3.5" /> Room service access</p>

      {!hasEmail && !hasPhone && (
        <p className="flex items-start gap-2 text-xs text-warning bg-warning/10 rounded-lg px-2.5 py-2">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
          No email or phone number yet. Add an email so the guest gets a code, or check in with the stay link.
        </p>
      )}
      {!hasEmail && hasPhone && !SMS_OTP_ENABLED && (
        <p className="flex items-start gap-2 text-xs text-warning bg-warning/10 rounded-lg px-2.5 py-2">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
          Codes by text message aren’t switched on yet. Add an email, or check in with the stay link.
        </p>
      )}

      <button type="button" role="radio" aria-checked={!useLink} disabled={!hasEmail} onClick={() => onChange('auto')} className={card(!useLink, !hasEmail)}>
        <Mail className="size-4 mt-0.5 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-on-surface">Email the code{hasEmail ? '' : ' (needs an email)'}</span>
          <span className="block text-xs text-on-surface-variant truncate">{hasEmail ? `Sent to ${email.trim()} when you check in. The guest scans the room QR and types it once.` : 'Type the guest’s email above.'}</span>
        </span>
      </button>

      <button type="button" role="radio" aria-checked={false} disabled className={card(false, true)}>
        <MessageSquare className="size-4 mt-0.5 shrink-0 text-on-surface-variant" />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-on-surface">Text the code <span className="text-[11px] font-semibold text-on-surface-variant">· coming soon</span></span>
          <span className="block text-xs text-on-surface-variant">Phone codes aren’t switched on yet.</span>
        </span>
      </button>

      <button type="button" role="radio" aria-checked={useLink} onClick={() => onChange('link')} className={card(useLink)}>
        <Link2 className="size-4 mt-0.5 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-on-surface">Use the stay link</span>
          <span className="block text-xs text-on-surface-variant">No code. You give the guest their personal link; opening it once is enough, then the room QR works on their phone.</span>
        </span>
      </button>
    </div>
  );
}
