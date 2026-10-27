import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, Loader2, Utensils } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useSiteTheme } from '../hooks/useTheme';

type Result =
  | { status: 'ok' | 'already'; propertyName: string; itemName: string; readyAt: string; inKitchen: boolean }
  | { status: 'cancelled' | 'closed' | 'arrived' | 'invalid' | 'slow_down'; propertyName?: string };

const TZ = 'Asia/Kolkata';
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).toUpperCase();

/** Half-hour times from 7 AM to 11:30 PM, on the same India-time day as `iso`. */
function timeSlots(iso: string): { value: string; label: string }[] {
  const day = new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
  const out: { value: string; label: string }[] = [];
  for (let h = 7; h <= 23; h++) {
    for (const m of [0, 30]) {
      const d = new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`);
      out.push({ value: d.toISOString(), label: fmtTime(d.toISOString()) });
    }
  }
  return out;
}

/**
 * What the button in the pre-arrival email opens (/pre/<token>): records the guest's request for
 * something ready on arrival, as soon as the page has loaded in a real browser, then says so.
 * Nothing to log in to, nothing else to tap. See 0093 for the rules.
 */
export default function ArrivalPreorderPage() {
  useSiteTheme();
  const { token = '' } = useParams<{ token: string }>();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    supabase.rpc('guest_redeem_arrival_link', { p_token: token }).then(({ data, error: err }) => {
      if (err || !data) { setError('Something went wrong. Please try the button in your email again.'); return; }
      const d = data as Record<string, unknown>;
      const status = d.status as Result['status'];
      if (status === 'ok' || status === 'already') {
        setResult({ status, propertyName: d.property_name as string, itemName: d.item_name as string, readyAt: d.ready_at as string, inKitchen: d.in_kitchen === true });
      } else {
        setResult({ status, propertyName: d.property_name as string | undefined } as Result);
      }
    });
  }, [token]);

  const changeTime = async (value: string) => {
    setBusy(true); setNote(null);
    const { data } = await supabase.rpc('guest_set_arrival_time', { p_token: token, p_ready_at: value });
    setBusy(false);
    const st = (data as { status?: string } | null)?.status;
    if (st === 'ok') { setResult(r => (r && (r.status === 'ok' || r.status === 'already') ? { ...r, readyAt: value } : r)); setNote('Updated. We will have it ready around then.'); }
    else if (st === 'too_late') setNote('The kitchen has started on it already, so the time can’t change now.');
    else setNote('That time isn’t available. Please pick another.');
  };

  const cancel = async () => {
    setBusy(true);
    const { data } = await supabase.rpc('guest_cancel_arrival_request', { p_token: token });
    setBusy(false);
    const st = (data as { status?: string } | null)?.status;
    if (st === 'cancelled') setResult(r => ({ status: 'cancelled', propertyName: r && 'propertyName' in r ? r.propertyName : undefined }));
    else if (st === 'too_late') setNote('The kitchen has already started on it. Just tell the front desk when you arrive.');
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen w-full flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-sm text-center space-y-4">{children}</div>
    </div>
  );

  if (error) return shell(<p className="text-sm text-on-surface-variant">{error}</p>);
  if (!result) return shell(<p className="text-sm text-on-surface-variant flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> One moment…</p>);

  if (result.status === 'ok' || result.status === 'already') {
    return shell(
      <>
        <CheckCircle2 className="size-12 mx-auto text-primary" />
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-on-surface">Your {result.itemName.toLowerCase()} will be ready when you arrive</h1>
        <p className="text-sm text-on-surface-variant">We’ll have it waiting around <strong className="text-on-surface">{fmtTime(result.readyAt)}</strong> at {result.propertyName}. You pay at the hotel.</p>

        {!result.inKitchen && (
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant p-4 text-left space-y-2">
            <label htmlFor="arrival-time" className="text-xs font-medium text-on-surface-variant flex items-center gap-1.5"><Clock className="size-3.5" /> Arriving at a different time?</label>
            <select
              id="arrival-time"
              disabled={busy}
              value={timeSlots(result.readyAt).find(s => fmtTime(s.value) === fmtTime(result.readyAt))?.value ?? ''}
              onChange={e => e.target.value && changeTime(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-outline-variant bg-surface text-sm text-on-surface"
            >
              <option value="">{fmtTime(result.readyAt)}</option>
              {timeSlots(result.readyAt).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
        {note && <p className="text-sm text-on-surface-variant">{note}</p>}
        {!result.inKitchen && <button type="button" disabled={busy} onClick={cancel} className="text-sm text-on-surface-variant underline underline-offset-2 disabled:opacity-50">Changed your mind? Cancel it</button>}
      </>
    );
  }
  if (result.status === 'cancelled') {
    return shell(<><Utensils className="size-8 mx-auto text-on-surface-variant" /><h1 className="text-lg font-semibold text-on-surface">That’s cancelled</h1><p className="text-sm text-on-surface-variant">Nothing is waiting for you. You can still order from your room when you arrive.</p></>);
  }
  if (result.status === 'arrived') {
    return shell(<><Utensils className="size-8 mx-auto text-on-surface-variant" /><h1 className="text-lg font-semibold text-on-surface">You’re already here</h1><p className="text-sm text-on-surface-variant">Scan the QR in your room to order whatever you like.</p></>);
  }
  if (result.status === 'slow_down') return shell(<p className="text-sm text-on-surface-variant">Too many tries from this phone. Please wait a few minutes.</p>);
  return shell(<><h1 className="text-lg font-semibold text-on-surface">This offer isn’t available</h1><p className="text-sm text-on-surface-variant">The link may have expired, or pre-orders are closed for this stay. Ask the front desk when you arrive.</p></>);
}
