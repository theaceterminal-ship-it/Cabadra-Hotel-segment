import React, { useState } from 'react';
import { Ban, CalendarX, Crown, LogIn, Pencil, Phone, Mail, Receipt, StickyNote, X, FileCheck2 } from 'lucide-react';
import type { Room } from '../../types';
import {
  BOOKING_CHANNELS, Booking, BookingChanges, cancelReservation, checkInReservation, issueBookingBill, markNoShow, updateBooking,
} from '../../lib/staffApi';
import { formatCurrency } from '../../lib/currency';
import { STATUS_CHIP, STATUS_LABEL, addDays, fmtDay, todayIso } from './bookingUtils';

const btn = 'h-10 px-4 rounded-full text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50';
const btnPrimary = `${btn} bg-primary text-on-primary hover:bg-primary-hover`;
const btnQuiet = `${btn} bg-surface-container-low text-on-surface hover:bg-surface-container`;
const input = 'w-full h-10 px-3 rounded-xl border border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:border-on-surface focus:outline-none';
const label = 'text-xs text-on-surface-variant block mb-1';

/**
 * One booking: who, which room, when, at what rate, from where, what's
 * owed; and everything the desk can do with it at its stage: check in
 * (early arrivals included), edit, move rooms, extend, cancel with a fee,
 * mark a no-show, open the bill, close a cancelled booking's bill.
 */
export function BookingDrawer({ booking, rooms, currency, onClose, onChanged, onOpenBill }: {
  booking: Booking;
  rooms: Room[];
  currency: string;
  onClose: () => void;
  /** After any change: refresh, and show the booking as it is now. */
  onChanged: (updated?: Booking) => void;
  onOpenBill: (b: Booking) => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'cancel' | 'no_show'>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = (n: number) => formatCurrency(n, currency);
  const b = booking;
  const today = todayIso();
  const open = b.status === 'upcoming' || b.status === 'checked_in';
  const closedUnbilled = (b.status === 'cancelled' || b.status === 'no_show') && !b.invoiceNumber && (b.totals.total > 0 || b.totals.paid > 0);

  const run = async (fn: () => Promise<Booking | void>) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await fn();
      setMode('view');
      onChanged(updated || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md h-full bg-surface-container-lowest text-on-surface flex flex-col shadow-2xl">
        <div className="px-6 pt-6 pb-4 border-b border-outline-variant">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-on-surface-variant font-mono">#{b.ref}</p>
              <h3 className="text-xl font-semibold tracking-[-0.02em] truncate flex items-center gap-1.5">
                {b.guest.vip && <Crown className="size-4 shrink-0" />}{b.guest.name}
              </h3>
              <span className={`inline-flex mt-1.5 h-6 px-2.5 rounded-full text-xs font-medium items-center ${STATUS_CHIP[b.status]}`}>{STATUS_LABEL[b.status]}</span>
            </div>
            <button onClick={onClose} aria-label="Close" className="size-9 rounded-full hover:bg-surface-container-low flex items-center justify-center text-on-surface-variant shrink-0"><X className="size-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {mode === 'view' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Fact label="Room" value={`${b.roomNumber} · ${b.roomType}`} />
                <Fact label="Guests" value={String(b.partySize)} />
                <Fact label="Arrives" value={fmtDay(b.checkInDate, { weekday: 'short', day: 'numeric', month: 'short' })} />
                <Fact label="Leaves" value={fmtDay(b.checkOutDate, { weekday: 'short', day: 'numeric', month: 'short' })} />
                <Fact label="Rate" value={b.ratePerNight != null ? `${c(b.ratePerNight)} × ${b.nights}` : '—'} />
                <Fact label="Booked via" value={`${BOOKING_CHANNELS.find(x => x.id === b.channel)?.label ?? b.channel}${b.channelDetail ? ` · ${b.channelDetail}` : ''}`} />
              </div>

              {(b.guest.phone || b.guest.email) && (
                <div className="flex flex-wrap gap-2">
                  {b.guest.phone && <a href={`tel:${b.guest.phone}`} className={btnQuiet}><Phone className="size-4" /> {b.guest.phone}</a>}
                  {b.guest.email && <a href={`mailto:${b.guest.email}`} className={`${btnQuiet} max-w-full`}><Mail className="size-4 shrink-0" /> <span className="truncate">{b.guest.email}</span></a>}
                </div>
              )}

              {b.notes && (
                <p className="rounded-[20px] bg-surface-container-low p-4 text-sm flex gap-2"><StickyNote className="size-4 mt-0.5 shrink-0 text-on-surface-variant" /> {b.notes}</p>
              )}
              {b.cancelReason && <p className="text-sm text-on-surface-variant">Reason: {b.cancelReason}</p>}

              <div className="rounded-[20px] bg-surface-container-low p-4 grid grid-cols-3 gap-2 text-sm">
                <div><p className="text-xs text-on-surface-variant">Billed</p><p className="font-semibold">{c(b.totals.total)}</p></div>
                <div><p className="text-xs text-on-surface-variant">Paid</p><p className="font-semibold">{c(b.totals.paid - b.totals.refunded)}</p></div>
                <div>
                  <p className="text-xs text-on-surface-variant">{b.totals.balance < -0.005 ? 'Refund due' : 'Balance'}</p>
                  <p className={`font-semibold ${b.totals.balance > 0.005 ? 'text-error' : b.totals.balance < -0.005 ? 'text-warning' : ''}`}>{c(Math.abs(b.totals.balance))}</p>
                </div>
                {b.invoiceNumber && <p className="col-span-3 text-xs text-on-surface-variant">Bill {b.invoiceNumber}</p>}
              </div>
              <p className="text-xs text-on-surface-variant">Booked {new Date(b.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{b.source === 'imported' ? ' · from your PMS' : ''}</p>
            </>
          )}

          {mode === 'edit' && <EditForm booking={b} rooms={rooms} busy={busy} onCancel={() => setMode('view')} onSave={changes => run(() => updateBooking(b.id, changes))} />}
          {mode === 'cancel' && (
            <FeeForm
              title="Cancel this booking"
              feeLabel="Cancellation fee (optional)"
              confirm="Cancel booking"
              paid={b.totals.paid - b.totals.refunded}
              currency={currency}
              busy={busy}
              onBack={() => setMode('view')}
              onSubmit={(fee, reason) => run(() => cancelReservation(b.id, reason, fee))}
            />
          )}
          {mode === 'no_show' && (
            <FeeForm
              title="Mark as no-show"
              feeLabel="No-show charge (optional)"
              confirm="Mark no-show"
              defaultFee={b.ratePerNight ?? 0}
              paid={b.totals.paid - b.totals.refunded}
              currency={currency}
              busy={busy}
              onBack={() => setMode('view')}
              onSubmit={(fee, reason) => run(() => markNoShow(b.id, fee, reason))}
            />
          )}

          {error && <p className="text-sm text-error bg-error/10 rounded-2xl px-4 py-3">{error}</p>}
        </div>

        {mode === 'view' && (
          <div className="px-6 py-4 border-t border-outline-variant flex flex-wrap gap-2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            {b.status === 'upcoming' && (
              <button disabled={busy} onClick={() => run(() => checkInReservation(b.id))} className={btnPrimary}>
                <LogIn className="size-4" /> {b.checkInDate > today ? 'Check in early' : 'Check in'}
              </button>
            )}
            <button onClick={() => onOpenBill(b)} className={b.status === 'checked_in' ? btnPrimary : btnQuiet}><Receipt className="size-4" /> {b.status === 'checked_in' ? 'Bill & check out' : 'Bill'}</button>
            {open && <button onClick={() => setMode('edit')} className={btnQuiet}><Pencil className="size-4" /> Edit</button>}
            {b.status === 'upcoming' && <button onClick={() => setMode('cancel')} className={btnQuiet}><Ban className="size-4" /> Cancel</button>}
            {b.status === 'upcoming' && b.checkInDate <= today && <button onClick={() => setMode('no_show')} className={btnQuiet}><CalendarX className="size-4" /> No-show</button>}
            {closedUnbilled && (
              <button
                disabled={busy || Math.abs(b.totals.balance) > 0.005}
                title={Math.abs(b.totals.balance) > 0.005 ? 'Settle the balance first' : undefined}
                onClick={() => run(async () => { await issueBookingBill(b.id); })}
                className={btnQuiet}
              >
                <FileCheck2 className="size-4" /> Issue bill
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({ label: l, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-container-low px-3.5 py-2.5 min-w-0">
      <p className="text-[11px] text-on-surface-variant">{l}</p>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  );
}

function EditForm({ booking: b, rooms, busy, onSave, onCancel }: {
  booking: Booking; rooms: Room[]; busy: boolean; onSave: (c: BookingChanges) => void; onCancel: () => void;
}) {
  const inHouse = b.status === 'checked_in';
  const [f, setF] = useState({
    checkInDate: b.checkInDate, checkOutDate: b.checkOutDate, roomId: b.roomId,
    ratePerNight: b.ratePerNight != null ? String(b.ratePerNight) : '', partySize: String(b.partySize),
    channel: b.channel, channelDetail: b.channelDetail ?? '', notes: b.notes ?? '',
    guestName: b.guest.name, guestPhone: b.guest.phone ?? '', guestEmail: b.guest.email ?? '', vip: b.guest.vip,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(x => ({ ...x, [k]: v }));
  const sortedRooms = [...rooms].sort((a, z) => a.number.localeCompare(z.number, undefined, { numeric: true }));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    // Only what actually changed goes up.
    const changes: BookingChanges = {};
    if (f.checkInDate !== b.checkInDate) changes.checkInDate = f.checkInDate;
    if (f.checkOutDate !== b.checkOutDate) changes.checkOutDate = f.checkOutDate;
    if (f.roomId !== b.roomId) changes.roomId = f.roomId;
    if (f.ratePerNight !== '' && Number(f.ratePerNight) !== b.ratePerNight) changes.ratePerNight = Number(f.ratePerNight);
    if (Number(f.partySize) !== b.partySize) changes.partySize = Number(f.partySize);
    if (f.channel !== b.channel) changes.channel = f.channel;
    if (f.channelDetail !== (b.channelDetail ?? '')) changes.channelDetail = f.channelDetail;
    if (f.notes !== (b.notes ?? '')) changes.notes = f.notes;
    if (f.guestName !== b.guest.name) changes.guestName = f.guestName;
    if (f.guestPhone !== (b.guest.phone ?? '')) changes.guestPhone = f.guestPhone;
    if (f.guestEmail !== (b.guest.email ?? '')) changes.guestEmail = f.guestEmail;
    if (f.vip !== b.guest.vip) changes.vip = f.vip;
    if (Object.keys(changes).length === 0) { onCancel(); return; }
    onSave(changes);
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label><span className={label}>Arrives</span><input type="date" disabled={inHouse} value={f.checkInDate} onChange={e => set('checkInDate', e.target.value)} className={`${input} disabled:opacity-60`} /></label>
        <label><span className={label}>Leaves</span><input type="date" min={addDays(f.checkInDate, 1)} value={f.checkOutDate} onChange={e => set('checkOutDate', e.target.value)} className={input} /></label>
        <label>
          <span className={label}>{inHouse ? 'Move to room' : 'Room'}</span>
          <select value={f.roomId} onChange={e => set('roomId', e.target.value)} className={input}>
            {sortedRooms.map(r => <option key={r.id} value={r.id} disabled={r.status === 'maintenance'}>{r.number} · {r.type}{r.status === 'maintenance' ? ' (maintenance)' : ''}</option>)}
          </select>
        </label>
        <label><span className={label}>Guests</span><input type="number" min={1} value={f.partySize} onChange={e => set('partySize', e.target.value)} className={input} /></label>
        <label className="col-span-2"><span className={label}>Rate per night{inHouse ? ' (from tonight)' : ''}</span><input type="number" min={0} value={f.ratePerNight} onChange={e => set('ratePerNight', e.target.value)} className={input} /></label>
      </div>
      {inHouse && f.roomId !== b.roomId && <p className="text-xs text-on-surface-variant">The new room must be ready. Room {b.roomNumber} will be marked for cleaning.</p>}

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2"><span className={label}>Guest name</span><input required value={f.guestName} onChange={e => set('guestName', e.target.value)} className={input} /></label>
        <label><span className={label}>Phone</span><input value={f.guestPhone} onChange={e => set('guestPhone', e.target.value)} className={input} /></label>
        <label><span className={label}>Email</span><input type="email" value={f.guestEmail} onChange={e => set('guestEmail', e.target.value)} className={input} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.vip} onChange={e => set('vip', e.target.checked)} className="accent-primary" /> VIP guest</label>

      <div>
        <span className={label}>Booked via</span>
        <div className="flex flex-wrap gap-1.5">
          {BOOKING_CHANNELS.map(ch => (
            <button key={ch.id} type="button" onClick={() => set('channel', ch.id)} className={`h-8 px-3 rounded-full text-[13px] font-medium ${f.channel === ch.id ? 'bg-primary text-on-primary' : 'bg-surface-container-low'}`}>{ch.label}</button>
          ))}
        </div>
        {(f.channel === 'ota' || f.channel === 'agent' || f.channel === 'other') && (
          <input value={f.channelDetail} onChange={e => set('channelDetail', e.target.value)} maxLength={60} placeholder="Booking.com, agent name…" className={`${input} mt-2`} />
        )}
      </div>
      <label className="block"><span className={label}>Notes</span><textarea value={f.notes} onChange={e => set('notes', e.target.value)} maxLength={1000} rows={3} className={`${input} h-auto py-2`} /></label>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btnQuiet}>Back</button>
        <button disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  );
}

function FeeForm({ title, feeLabel, confirm, defaultFee = 0, paid, currency, busy, onBack, onSubmit }: {
  title: string; feeLabel: string; confirm: string; defaultFee?: number; paid: number; currency: string; busy: boolean;
  onBack: () => void; onSubmit: (fee: number, reason: string) => void;
}) {
  const [fee, setFee] = useState(defaultFee ? String(defaultFee) : '');
  const [reason, setReason] = useState('');
  const c = (n: number) => formatCurrency(n, currency);
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(Number(fee) || 0, reason.trim()); }} className="space-y-4">
      <p className="font-semibold">{title}</p>
      <label className="block"><span className={label}>{feeLabel}, before GST</span><input type="number" min={0} value={fee} onChange={e => setFee(e.target.value)} placeholder="0" className={input} /></label>
      <label className="block"><span className={label}>Reason (optional)</span><input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} className={input} /></label>
      <p className="text-sm text-on-surface-variant">
        {paid > 0 ? `${c(paid)} was paid in advance. It stays on the bill: anything above the ${Number(fee) > 0 ? 'fee (plus GST, if you charge it)' : 'bill'} becomes a refund due, which you record from the bill.` : 'Nothing has been paid for this booking.'}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onBack} className={btnQuiet}>Back</button>
        <button disabled={busy} className={`${btn} bg-error text-on-error`}>{busy ? 'Saving…' : confirm}</button>
      </div>
    </form>
  );
}
