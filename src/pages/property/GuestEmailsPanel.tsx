import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Mail, RefreshCw } from 'lucide-react';
import {
  EmailDomain, GuestEmailLogRow, GuestEmailSettings, fetchEmailDomain, fetchGuestEmailLog, fetchGuestEmailSettings,
  guestEmailAction, saveGuestEmailSettings,
} from '../../lib/staffApi';
import { Chip, ErrorNote, Field, Panel, Switch, btnPrimary, btnSecondary, inputCls, textareaCls } from './ui';

const KIND_LABEL = { booking_confirmation: 'Booking confirmation', pre_arrival: 'Pre-arrival offer', checkout_thanks: 'Thank-you' } as const;

function CopyCell({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="font-mono text-xs break-all">{text}</span>
      <button type="button" aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }} className="shrink-0 text-on-surface-variant hover:text-on-surface">
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  );
}

/**
 * Guest emails (0092): a confirmation when a room is booked ahead, and a thank-you
 * after check-out. They send themselves; this is where the owner sets what goes in
 * them, checks them with a sample, and optionally has them sent from the hotel's own
 * domain. Until that domain is verified they go out as "Hotel Name via Cabadra", with
 * replies going to the hotel's email (Bills & GST).
 */
export function GuestEmailsPanel({ propertyId }: { propertyId: string }) {
  const [form, setForm] = useState<GuestEmailSettings | null>(null);
  const [domain, setDomain] = useState<EmailDomain | null>(null);
  const [log, setLog] = useState<GuestEmailLogRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [newLocal, setNewLocal] = useState('bookings');

  const loadDomainAndLog = useCallback(async () => {
    try { setDomain(await fetchEmailDomain(propertyId)); } catch { /* shown as "not set up" */ }
    try { setLog(await fetchGuestEmailLog(propertyId)); } catch { setLog([]); }
  }, [propertyId]);

  useEffect(() => {
    fetchGuestEmailSettings(propertyId).then(setForm).catch(e => setError(e.message));
    void loadDomainAndLog();
  }, [propertyId, loadDomainAndLog]);

  if (!form) return error ? <ErrorNote>{error}</ErrorNote> : null;

  const set = <K extends keyof GuestEmailSettings>(k: K, v: GuestEmailSettings[K]) => { setSaved(false); setForm(f => (f ? { ...f, [k]: v } : f)); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try { await saveGuestEmailSettings(propertyId, form); setSaved(true); } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t save.'); } finally { setSaving(false); }
  };

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>, okText?: (r: { sentTo?: string; via?: string }) => string) => {
    setBusy(key); setError(null); setNote(null);
    try {
      const r = await fn() as { ok: boolean; message?: string; sentTo?: string; via?: string };
      if (r.ok) setNote(okText ? okText(r) : 'Done.'); else setError(r.message ?? 'That did not work.');
      await loadDomainAndLog();
    } finally { setBusy(null); }
  };

  const sendSample = (kind: 'booking_confirmation' | 'pre_arrival' | 'checkout_thanks') =>
    run(`test-${kind}`, async () => {
      // The sample uses what is saved, so save first if there are changes.
      await saveGuestEmailSettings(propertyId, form).catch(err => { throw err; });
      return guestEmailAction('test', propertyId, { kind });
    }, r => `A sample ${kind === 'booking_confirmation' ? 'booking confirmation' : kind === 'pre_arrival' ? 'pre-arrival offer' : 'thank-you'} is on its way to ${r.sentTo}.`).catch(err => setError(err instanceof Error ? err.message : 'Couldn’t send the sample.'));

  const verified = domain?.status === 'verified';
  const statusChip = !domain ? null : verified ? <Chip tone="good">Verified</Chip> : domain.status === 'failed' ? <Chip tone="bad">Not found yet</Chip> : <Chip tone="warn">Waiting for DNS</Chip>;

  return (
    <Panel>
      <form onSubmit={save} className="space-y-5">
        <div className="flex items-start gap-4">
          <span className="size-11 shrink-0 rounded-full bg-surface flex items-center justify-center text-on-surface"><Mail className="size-5" /></span>
          <div className="flex-1">
            <h3 className="text-base font-semibold tracking-[-0.01em] text-on-surface">Guest emails</h3>
            <p className="text-sm text-on-surface-variant mt-1 max-w-xl">Sent automatically: a confirmation a minute after a room is booked ahead, and a thank-you about 90 minutes after check-out. Guests need an email on their booking.</p>
          </div>
          <Switch checked={form.enabled} onChange={v => set('enabled', v)} label="Send guest emails" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Check-in time" hint="Your usual check-in time. The booking confirmation says “Check-in from 2:00 PM”.">
            <input type="time" value={form.checkInTime} onChange={e => set('checkInTime', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Check-out time" hint="Your usual check-out time. The booking confirmation says “Check-out by 11:00 AM”.">
            <input type="time" value={form.checkOutTime} onChange={e => set('checkOutTime', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Google Maps link" hint="In Google Maps: Share, Copy link. Guests get a Get directions button. Left empty, we search for your hotel by name." className="sm:col-span-2">
            <input type="url" value={form.mapsUrl} onChange={e => set('mapsUrl', e.target.value)} placeholder="https://maps.app.goo.gl/…" className={inputCls} />
          </Field>
          <Field label="Google review link" hint="From your Google Business profile (“Get more reviews”). Goes in the thank-you email." className="sm:col-span-2">
            <input type="url" value={form.googleReviewUrl} onChange={e => set('googleReviewUrl', e.target.value)} placeholder="https://g.page/r/…/review" className={inputCls} />
          </Field>
          <Field label="Note in the booking confirmation" hint="Optional: road conditions, what to bring, a welcome line." className="sm:col-span-2">
            <textarea value={form.welcomeNote} onChange={e => set('welcomeNote', e.target.value)} maxLength={500} rows={3} className={textareaCls} />
          </Field>
          <Field label="Note in the thank-you" hint="Optional: a personal line from the hotel." className="sm:col-span-2">
            <textarea value={form.thanksNote} onChange={e => set('thanksNote', e.target.value)} maxLength={500} rows={3} className={textareaCls} />
          </Field>
        </div>

        <div className="rounded-[20px] bg-surface-container-low p-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-on-surface">Offer something ready on arrival</p>
            <p className="text-xs text-on-surface-variant mt-0.5 max-w-xl">The day before, guests with an email get up to three dishes from your menu, chosen for their arrival time and the season, each a single tap. The kitchen sees it as a normal order 45 minutes before they arrive, marked as a pre-order. They pay at the hotel, and it goes on their bill when they check in. Alcohol and dishes with sizes are never offered. Turn this on once your kitchen is ready for it.</p>
          </div>
          <Switch checked={form.preArrival} onChange={v => set('preArrival', v)} label="Offer something ready on arrival" />
        </div>

        <p className="text-xs text-on-surface-variant">
          The address, phone number and reply-to email come from <strong>Bills &amp; GST</strong> below
          {form.replyTo ? <> (replies go to <strong>{form.replyTo}</strong>)</> : <>. <span className="text-warning">No email is set there, so guests can’t reply to these.</span></>}
          {!form.phone && ' No phone is set, so there is no Call button.'}
        </p>

        {error && <ErrorNote>{error}</ErrorNote>}
        {note && <p className="text-sm text-success">{note}</p>}
        <p className="text-xs text-on-surface-variant -mt-2">Sample emails go to your own address, up to 3 a day of each kind.</p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!!busy} onClick={() => sendSample('booking_confirmation')} className={btnSecondary}>{busy === 'test-booking_confirmation' ? 'Sending…' : 'Email me a sample confirmation'}</button>
            <button type="button" disabled={!!busy} onClick={() => sendSample('pre_arrival')} className={btnSecondary}>{busy === 'test-pre_arrival' ? 'Sending…' : 'Email me a sample pre-arrival offer'}</button>
            <button type="button" disabled={!!busy} onClick={() => sendSample('checkout_thanks')} className={btnSecondary}>{busy === 'test-checkout_thanks' ? 'Sending…' : 'Email me a sample thank-you'}</button>
          </div>
          <div className="flex items-center gap-3">
            {saved && <span className="text-sm text-success inline-flex items-center gap-1"><Check className="size-4" /> Saved</span>}
            <button disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </form>

      <div className="mt-6 rounded-[20px] bg-surface-container-low p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-on-surface">Send from your own email address</p>
            <p className="text-xs text-on-surface-variant mt-0.5 max-w-xl">
              {verified && domain
                ? <>Guest emails now come from <strong>{domain.localPart}@{domain.domain}</strong>.</>
                : <>Until this is set up, emails come from “Your Hotel Name via Cabadra” and replies still reach you. To send from <em>bookings@yourhotel.com</em> instead, you need a domain you own (a free @gmail.com address can’t be used) and to add a few records where it is managed.</>}
            </p>
          </div>
          {statusChip}
        </div>

        {!domain && (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Your domain"><input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="yourhotel.com" className={`${inputCls} w-52`} /></Field>
            <Field label="Send as"><span className="flex items-center gap-1"><input value={newLocal} onChange={e => setNewLocal(e.target.value.toLowerCase())} className={`${inputCls} w-28`} /><span className="text-sm text-on-surface-variant">@{newDomain || 'yourhotel.com'}</span></span></Field>
            <button type="button" disabled={!!busy || !newDomain.trim()} onClick={() => run('domain_start', () => guestEmailAction('domain_start', propertyId, { domain: newDomain, localPart: newLocal }), () => 'Domain added. Add the records below, then press Check now.')} className={btnPrimary}>{busy === 'domain_start' ? 'Adding…' : 'Set up'}</button>
          </div>
        )}

        {domain && !verified && (
          <>
            <p className="text-sm text-on-surface">Add these records where <strong>{domain.domain}</strong> is managed (your domain provider’s DNS settings), then press Check now. It can take from a few minutes to a day.</p>
            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest">
              <table className="w-full text-left text-xs">
                <thead><tr className="text-on-surface-variant border-b border-outline-variant"><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Value</th><th className="px-3 py-2 font-medium">Status</th></tr></thead>
                <tbody className="divide-y divide-outline-variant">
                  {domain.records.map((r, i) => (
                    <tr key={i} className="align-top">
                      <td className="px-3 py-2 whitespace-nowrap">{r.type}{r.priority != null ? ` (${r.priority})` : ''}</td>
                      <td className="px-3 py-2"><CopyCell text={r.name} /></td>
                      <td className="px-3 py-2"><CopyCell text={r.value} /></td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.status === 'verified' ? <Chip tone="good">ok</Chip> : <Chip tone="warn">{r.status ?? 'pending'}</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {domain.lastError && <p className="text-xs text-warning">{domain.lastError}</p>}
          </>
        )}

        {domain && (
          <div className="flex flex-wrap items-center gap-2">
            {!verified && <button type="button" disabled={!!busy} onClick={() => run('domain_verify', () => guestEmailAction('domain_verify', propertyId), r => (r.status === 'verified' ? 'Verified. Guest emails now come from your address.' : 'Checked. The records are not all there yet.'))} className={btnPrimary}><RefreshCw className="size-4 inline mr-1.5" />{busy === 'domain_verify' ? 'Checking…' : 'Check now'}</button>}
            <button type="button" disabled={!!busy} onClick={() => { if (window.confirm('Go back to sending as “your hotel via Cabadra”?')) void run('domain_remove', () => guestEmailAction('domain_remove', propertyId), () => 'Removed. Emails go out as your hotel via Cabadra.'); }} className={btnSecondary}>Remove</button>
          </div>
        )}
      </div>

      {log.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-medium text-on-surface mb-2">Recent guest emails</p>
          <div className="rounded-[20px] border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {log.map(r => (
              <div key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate"><span className="text-on-surface">{KIND_LABEL[r.kind]}</span> <span className="text-on-surface-variant">· {r.guestName}</span></span>
                <span className="shrink-0 flex items-center gap-2 text-xs text-on-surface-variant">
                  {r.status === 'sent' ? <Chip tone="good">Sent{r.sentVia === 'own_domain' ? ' from your domain' : ''}</Chip>
                    : r.status === 'failed' ? <span title={r.error}><Chip tone="bad">Failed</Chip></span>
                    : r.status === 'skipped' ? <span title={r.error}><Chip>Skipped</Chip></span>
                    : <Chip tone="warn">Queued</Chip>}
                  {new Date(r.sentAt ?? r.dueAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
