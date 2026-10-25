import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, Building2, ChevronLeft, ChevronRight, CreditCard, Lock, Printer, Smartphone, Undo2, Wallet } from 'lucide-react';
import { DaySummary, closeDay, fetchDaySummary } from '../lib/staffApi';
import { formatCurrency } from '../lib/currency';
import { addDays, fmtDay, todayIso } from './bookings/bookingUtils';

const METHODS = [
  { id: 'cash', label: 'Cash', icon: Banknote },
  { id: 'upi', label: 'UPI', icon: Smartphone },
  { id: 'card', label: 'Card', icon: CreditCard },
  { id: 'bank', label: 'Bank', icon: Building2 },
  { id: 'other', label: 'Other', icon: Wallet },
] as const;

const CATEGORY_LABEL: Record<string, string> = { room: 'Rooms', room_service: 'Food', extra: 'Extras', laundry: 'Laundry', minibar: 'Minibar', spa: 'Spa', other: 'Services & other' };

/**
 * The end of the desk's day: what came in, by method (refunds netted), what
 * was billed, and the close itself: count the cash in the drawer, enter it,
 * and the difference against the books is recorded for good, with a note.
 * The owner sees every close under Reports.
 */
export function DayCloseView({ propertyId, propertyName, currency }: { propertyId: string; propertyName: string; currency: string }) {
  const [date, setDate] = useState(todayIso());
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = (n: number) => formatCurrency(n, currency);
  const today = todayIso();

  const load = useCallback(() => {
    setSummary(null);
    fetchDaySummary(propertyId, date).then(s => { setSummary(s); setError(null); }).catch(err => setError(err.message));
  }, [propertyId, date]);
  useEffect(() => { load(); setCounted(''); setNote(''); setConfirming(false); }, [load]);

  const close = async () => {
    setBusy(true);
    setError(null);
    try {
      setSummary(await closeDay(propertyId, date, Number(counted) || 0, note.trim()));
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t close the day.');
    } finally {
      setBusy(false);
    }
  };

  const expectedCash = summary?.collections.cash ?? 0;
  const diff = counted === '' ? null : Math.round(((Number(counted) || 0) - expectedCash) * 100) / 100;

  return (
    <div className="px-4 sm:px-6 pb-10 space-y-5 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] text-on-surface">Day close</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(d => addDays(d, -1))} aria-label="Previous day" className="size-9 rounded-full bg-surface-container-lowest border border-outline-variant flex items-center justify-center"><ChevronLeft className="size-4" /></button>
          <input type="date" max={today} value={date} onChange={e => e.target.value && setDate(e.target.value)} className="h-9 px-3 rounded-full bg-surface-container-lowest border border-outline-variant text-sm" aria-label="Day" />
          <button onClick={() => setDate(d => (d < today ? addDays(d, 1) : d))} disabled={date >= today} aria-label="Next day" className="size-9 rounded-full bg-surface-container-lowest border border-outline-variant flex items-center justify-center disabled:opacity-40"><ChevronRight className="size-4" /></button>
          <button onClick={() => window.print()} className="h-9 px-4 rounded-full bg-surface-container-lowest border border-outline-variant text-sm font-medium inline-flex items-center gap-1.5"><Printer className="size-4" /> Print</button>
        </div>
      </div>

      {error && <p className="text-sm text-error bg-error/10 rounded-2xl px-4 py-3">{error}</p>}
      {!summary ? <p className="text-sm text-on-surface-variant">Loading…</p> : (
        <div className="print-only-root space-y-5 bg-surface print:bg-white print:text-black print:p-6">
          <p className="hidden print:block text-lg font-semibold">{propertyName} · Day close · {fmtDay(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

          {summary.close ? (
            <div className="rounded-[24px] bg-primary text-on-primary p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <Lock className="size-6 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Closed{summary.close.closedBy ? ` by ${summary.close.closedBy}` : ''} at {new Date(summary.close.closedAt).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}</p>
                <p className="text-sm opacity-80">
                  Cash counted {c(summary.close.countedCash)} against {c(summary.close.expected.cash)} expected:{' '}
                  {Math.abs(summary.close.cashDifference) < 0.005 ? 'exact.' : summary.close.cashDifference < 0 ? `${c(-summary.close.cashDifference)} short.` : `${c(summary.close.cashDifference)} over.`}
                  {summary.close.note && ` “${summary.close.note}”`}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">{date === today ? 'Today isn’t closed yet.' : `${fmtDay(date, { weekday: 'long', day: 'numeric', month: 'short' })} was never closed.`}</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {METHODS.map(m => (
              <div key={m.id} className="rounded-[20px] bg-surface-container-lowest border border-outline-variant p-4">
                <p className="text-xs text-on-surface-variant flex items-center gap-1.5"><m.icon className="size-3.5" /> {m.label}</p>
                <p className="mt-1.5 text-lg font-semibold tracking-[-0.02em]">{c(summary.collections[m.id])}</p>
              </div>
            ))}
            <div className="rounded-[20px] bg-primary text-on-primary p-4">
              <p className="text-xs opacity-75">Collected</p>
              <p className="mt-1.5 text-lg font-semibold tracking-[-0.02em]">{c(summary.collections.total)}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-[24px] bg-surface-container-lowest border border-outline-variant p-5">
              <p className="text-sm font-medium text-on-surface-variant mb-3">Billed this day (with GST)</p>
              {Object.keys(summary.posted).length === 0 ? <p className="text-sm text-on-surface-variant">Nothing.</p> : (
                <dl className="space-y-1.5 text-sm">
                  {Object.entries(summary.posted).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><dt>{CATEGORY_LABEL[k] ?? k}</dt><dd className="font-medium">{c(v)}</dd></div>
                  ))}
                  <div className="flex justify-between pt-1.5 border-t border-outline-variant font-semibold"><dt>Total</dt><dd>{c(Object.values(summary.posted).reduce((a, b) => a + b, 0))}</dd></div>
                </dl>
              )}
            </div>
            <div className="rounded-[24px] bg-surface-container-lowest border border-outline-variant p-5 grid grid-cols-3 gap-2 text-center content-center">
              <div><p className="text-2xl font-semibold">{summary.arrivals}</p><p className="text-xs text-on-surface-variant">Arrived</p></div>
              <div><p className="text-2xl font-semibold">{summary.departures}</p><p className="text-xs text-on-surface-variant">Left</p></div>
              <div><p className="text-2xl font-semibold">{summary.inHouse}</p><p className="text-xs text-on-surface-variant">In house now</p></div>
            </div>
          </div>

          <div className="rounded-[24px] bg-surface-container-lowest border border-outline-variant overflow-hidden">
            <p className="px-5 pt-4 pb-2 text-sm font-medium text-on-surface-variant">Money in and out</p>
            {summary.entries.length === 0 ? <p className="px-5 pb-5 text-sm text-on-surface-variant">No payments this day.</p> : (
              <div className="divide-y divide-outline-variant">
                {summary.entries.map(e => (
                  <div key={e.id} className={`px-5 py-2.5 flex items-center gap-3 text-sm ${e.voided ? 'opacity-50' : ''}`}>
                    <span className="w-14 shrink-0 text-on-surface-variant">{new Date(e.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
                    <span className="flex-1 min-w-0 truncate">
                      {e.kind === 'refund' && <Undo2 className="inline size-3.5 mr-1 text-warning" />}
                      <span className={e.voided ? 'line-through' : ''}>{e.guest ?? 'Guest'}</span>
                      <span className="text-on-surface-variant"> · Room {e.room} · {METHODS.find(m => m.id === e.method)?.label}{e.reference ? ` · ${e.reference}` : ''}{e.by ? ` · ${e.by}` : ''}{e.voided ? ' · voided' : ''}</span>
                    </span>
                    <span className={`font-medium shrink-0 ${e.kind === 'refund' ? 'text-warning' : ''}`}>{e.kind === 'refund' ? '−' : ''}{c(e.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!summary.close && (
            <div className="rounded-[24px] bg-surface-container-lowest border border-outline-variant p-5 space-y-3 print:hidden">
              <p className="font-semibold">Close {date === today ? 'today' : fmtDay(date, { day: 'numeric', month: 'short' })}</p>
              <p className="text-sm text-on-surface-variant">Count the cash in the drawer. The books expect <span className="font-medium text-on-surface">{c(expectedCash)}</span> in cash for this day.</p>
              <div className="grid sm:grid-cols-[200px_1fr] gap-3">
                <input type="number" min={0} step="0.01" value={counted} onChange={e => { setCounted(e.target.value); setConfirming(false); }} placeholder="Cash counted" className="h-11 px-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-base focus:outline-none focus:border-on-surface" />
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Note (why it’s short or over, who has the cash…)" className="h-11 px-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-sm focus:outline-none focus:border-on-surface" />
              </div>
              {diff !== null && (
                <p className={`text-sm font-medium ${Math.abs(diff) < 0.005 ? 'text-success' : 'text-warning'}`}>
                  {Math.abs(diff) < 0.005 ? 'Matches the books.' : diff < 0 ? `${c(-diff)} short.` : `${c(diff)} over.`}
                </p>
              )}
              <div className="flex justify-end">
                {confirming ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-on-surface-variant">This can’t be undone.</span>
                    <button onClick={() => setConfirming(false)} className="h-10 px-4 rounded-full bg-surface-container-low text-sm font-medium">Back</button>
                    <button onClick={close} disabled={busy} className="h-10 px-5 rounded-full bg-primary text-on-primary text-sm font-medium disabled:opacity-50">{busy ? 'Closing…' : 'Close the day'}</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirming(true)} disabled={counted === ''} className="h-10 px-5 rounded-full bg-primary text-on-primary text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"><Lock className="size-4" /> Close the day</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
