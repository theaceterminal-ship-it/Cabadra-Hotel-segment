import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  BedDouble, Check, ChevronDown, Copy, FileText, Mail, MessageCircle, Minus, Plus, Printer, QrCode, Receipt, RotateCcw, Undo2, X,
} from 'lucide-react';
import type { Bill, Folio, FolioCharge, FolioPayment, PaymentMethod } from '../types';
import {
  addFolioCharge, billLink, checkoutRoom, checkoutWithPayments, fetchBill, fetchFolio, recordFolioPayment, voidFolioCharge, voidFolioPayment,
  CheckoutResult,
} from '../lib/staffApi';
import { formatCurrency } from '../lib/currency';
import { BillDocument } from './BillDocument';

interface RoomFolioModalProps {
  reservationId?: string;
  roomId?: string;
  roomNumber: string;
  guestName?: string;
  /** For sending the bill on WhatsApp after check-out. */
  guestPhone?: string;
  guestEmail?: string;
  propertyName: string;
  currency: string;
  upiId?: string;
  onClose: () => void;
  /** Fires once the desk closes this after a successful check-out (not straight away, so the bill can be printed or sent first). */
  onCheckedOut: () => void;
}

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'bank', label: 'Bank' },
  { id: 'other', label: 'Other' },
];
const methodLabel = (m: string) => METHODS.find(x => x.id === m)?.label ?? m;

const CHARGE_CATEGORIES = [
  { id: 'extra', label: 'Extra' },
  { id: 'laundry', label: 'Laundry' },
  { id: 'minibar', label: 'Minibar' },
  { id: 'room_service', label: 'Food' },
  { id: 'spa', label: 'Spa' },
  { id: 'other', label: 'Other' },
] as const;

const fmtShort = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const btn = 'h-10 px-4 rounded-full text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50';
const btnPrimary = `${btn} bg-primary text-on-primary hover:bg-primary-hover`;
const btnQuiet = `${btn} bg-surface-container-low text-on-surface hover:bg-surface-container`;
const input = 'h-10 px-3 rounded-xl border border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:border-on-surface focus:outline-none';

/**
 * A stay's bill at the front desk (0079): room nights posted by the nightly
 * audit, extras, GST per line, and a ledger of payments and refunds. Money
 * can be taken at any time; check-out takes whatever is still due (in one
 * method or several), issues the numbered bill, and offers it to print,
 * copy or send. Lines and payments are never edited or deleted; the owner
 * voids a mistake with a reason, until the bill is issued.
 */
export const RoomFolioModal: React.FC<RoomFolioModalProps> = ({
  reservationId, roomId, roomNumber, guestName, guestPhone, guestEmail, propertyName, currency, upiId, onClose, onCheckedOut,
}) => {
  const [folio, setFolio] = useState<Folio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'payment' | 'charge' | 'checkout'>('none');
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [bill, setBill] = useState<Bill | null>(null);
  const [showUpiQr, setShowUpiQr] = useState(false);

  const c = (n: number) => formatCurrency(n, currency);
  const close = () => (result ? onCheckedOut() : onClose());

  const reload = async () => {
    const target = reservationId || roomId;
    if (!target) { setLoading(false); return; }
    try {
      setFolio(await fetchFolio(target));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load the bill.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reservationId, roomId]);

  // staff_get_folio returns a placeholder (the room id, no lines) when no stay is linked to the room.
  const hasStay = !!folio && /^[0-9a-f-]{36}$/i.test(folio.reservationId);
  const balance = folio?.totals?.balance ?? folio?.totalOutstanding ?? 0;
  const open = folio?.status === 'checked_in' || folio?.status === 'upcoming';
  // Money can still move on a cancelled or no-show booking (a fee, a refund) until its bill is issued.
  const canTakeMoney = !!folio && !folio.invoice && folio.status !== 'checked_out';

  const openBill = async () => {
    const id = result?.reservationId ?? folio?.reservationId;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    try {
      setBill(await fetchBill(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load the bill.');
    }
  };

  const freeRoomOnly = async () => {
    if (!roomId) return;
    try {
      await checkoutRoom(roomId, 'cash');
      onCheckedOut();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t free the room.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 z-[60]" onMouseDown={e => e.target === e.currentTarget && close()}>
      <div className="bg-surface-container-lowest text-on-surface w-full sm:max-w-xl max-h-[94svh] sm:max-h-[90vh] rounded-t-[28px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-outline-variant">
          <div className="flex items-start gap-3 min-w-0">
            <span className="size-11 rounded-full bg-surface-container-low flex items-center justify-center shrink-0"><Receipt className="size-5" /></span>
            <div className="min-w-0">
              <h3 className="text-xl font-semibold tracking-[-0.02em]">Room {roomNumber} · Bill</h3>
              <p className="text-sm text-on-surface-variant truncate">
                {guestName ?? 'Guest'}
                {folio?.ratePerNight != null && folio.billsRoomNights && ` · ${c(folio.ratePerNight)}/night`}
                {folio?.status && folio.status !== 'checked_in' && ` · ${folio.status.replace('_', ' ')}`}
              </p>
            </div>
          </div>
          <button onClick={close} aria-label="Close" className="size-9 rounded-full hover:bg-surface-container-low flex items-center justify-center text-on-surface-variant shrink-0"><X className="size-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-sm text-on-surface-variant text-center py-10">Loading the bill…</p>
          ) : result ? (
            <CheckedOut result={result} currency={currency} guestName={guestName} guestPhone={guestPhone} guestEmail={guestEmail} propertyName={propertyName} onShowBill={openBill} />
          ) : !folio ? (
            <p className="text-sm text-error">{error}</p>
          ) : !hasStay ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-on-surface-variant">No stay is linked to Room {roomNumber}, so there’s no bill.</p>
              {roomId && <button onClick={freeRoomOnly} className={btnQuiet}>Mark the room free for cleaning</button>}
              {error && <p className="text-sm text-error">{error}</p>}
            </div>
          ) : (
            <>
              <Totals folio={folio} currency={currency} />
              {!folio.billsRoomNights && (
                <p className="text-xs text-on-surface-variant -mt-2">Room rent is billed in your own PMS; this bill has only what was ordered through Cabadra.</p>
              )}

              <Lines charges={folio.charges} currency={currency} canVoid={canTakeMoney} onChanged={reload} onError={setError} />
              {folio.payments.length > 0 && <Payments payments={folio.payments} currency={currency} canVoid={canTakeMoney} onChanged={reload} onError={setError} />}

              {error && <p className="text-sm text-error bg-error/10 rounded-2xl px-4 py-3">{error}</p>}

              {canTakeMoney && panel === 'payment' && (
                <PaymentForm reservationId={folio.reservationId} balance={balance} currency={currency} onDone={() => { setPanel('none'); reload(); }} onCancel={() => setPanel('none')} onError={setError} />
              )}
              {open && panel === 'charge' && (
                <ChargeForm reservationId={folio.reservationId} gstEnabled={folio.gstEnabled} onDone={() => { setPanel('none'); reload(); }} onCancel={() => setPanel('none')} onError={setError} />
              )}
              {folio.status === 'checked_in' && panel === 'checkout' && (
                <CheckoutForm
                  reservationId={folio.reservationId}
                  balance={balance}
                  currency={currency}
                  onCancel={() => setPanel('none')}
                  onError={setError}
                  onDone={r => setResult({ ...r, reservationId: r.reservationId ?? folio.reservationId })}
                />
              )}

              {folio.invoice && (
                <div className="rounded-[20px] bg-surface-container-low p-4 flex items-center justify-between gap-3">
                  <span className="text-sm"><span className="text-on-surface-variant">Bill issued</span> <span className="font-semibold">{folio.invoice.number}</span></span>
                  <button onClick={openBill} className={btnQuiet}><FileText className="size-4" /> View</button>
                </div>
              )}
            </>
          )}
        </div>

        {!loading && !result && hasStay && folio && panel === 'none' && (
          <div className="px-6 py-4 border-t border-outline-variant flex flex-wrap gap-2 justify-end" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <button onClick={openBill} className={`${btnQuiet} mr-auto`}><Printer className="size-4" /> {folio.invoice ? 'Bill' : 'Bill so far'}</button>
            {open && <button onClick={() => setPanel('charge')} className={btnQuiet}><Plus className="size-4" /> Charge</button>}
            {canTakeMoney && <button onClick={() => setPanel('payment')} className={btnQuiet}><Plus className="size-4" /> {balance < -0.005 ? 'Refund' : 'Payment'}</button>}
            {open && upiId && balance > 0 && <button onClick={() => setShowUpiQr(true)} className={btnQuiet} aria-label="Show UPI QR"><QrCode className="size-4" /></button>}
            {folio.status === 'checked_in' && (
              <button onClick={() => setPanel('checkout')} className={btnPrimary}>Check out{balance > 0 ? ` · ${c(balance)} due` : ''}</button>
            )}
          </div>
        )}
      </div>

      {showUpiQr && folio && upiId && <UpiQr upiId={upiId} propertyName={propertyName} amount={balance} currency={currency} onClose={() => setShowUpiQr(false)} />}
      {bill && <BillPreview bill={bill} onClose={() => setBill(null)} />}
    </div>
  );
};

function Totals({ folio, currency }: { folio: Folio; currency: string }) {
  const t = folio.totals;
  const c = (n: number) => formatCurrency(n, currency);
  return (
    <div className="grid grid-cols-3 gap-2">
      <Stat label="Total" value={c(t.total)} hint={t.tax > 0 ? `incl. ${c(t.tax)} GST` : undefined} />
      <Stat label="Paid" value={c(t.paid - t.refunded)} />
      <Stat label={t.balance < -0.005 ? 'Refund due' : 'Balance'} value={c(Math.abs(t.balance))} strong settled={Math.abs(t.balance) <= 0.005} />
    </div>
  );
}

function Stat({ label, value, hint, strong, settled }: { label: string; value: string; hint?: string; strong?: boolean; settled?: boolean }) {
  return (
    <div className={`rounded-[20px] p-3.5 ${strong ? 'bg-primary text-on-primary' : 'bg-surface-container-low'}`}>
      <p className={`text-xs ${strong ? 'opacity-75' : 'text-on-surface-variant'}`}>{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-[-0.02em] truncate">{value}{settled && <Check className="inline size-4 ml-1 -mt-0.5" />}</p>
      {hint && <p className={`text-[11px] ${strong ? 'opacity-75' : 'text-on-surface-variant'}`}>{hint}</p>}
    </div>
  );
}

function Lines({ charges, currency, canVoid, onChanged, onError }: {
  charges: FolioCharge[]; currency: string; canVoid: boolean; onChanged: () => void; onError: (m: string | null) => void;
}) {
  const [showNights, setShowNights] = useState(false);
  const c = (n: number) => formatCurrency(n, currency);
  const nights = charges.filter(x => x.category === 'room');
  const liveNights = nights.filter(x => !x.voided);
  const others = charges.filter(x => x.category !== 'room');

  if (charges.length === 0) return <p className="text-sm text-on-surface-variant text-center py-4">Nothing on the bill yet. Room rent is added each night at 11:30 pm.</p>;

  return (
    <section>
      <p className="text-sm font-medium text-on-surface-variant mb-2">Charges</p>
      <div className="rounded-[20px] border border-outline-variant divide-y divide-outline-variant overflow-hidden">
        {nights.length > 0 && (
          <>
            <button onClick={() => setShowNights(s => !s)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-container-low">
              <BedDouble className="size-4 text-on-surface-variant shrink-0" />
              <span className="flex-1 text-sm font-medium">Room · {liveNights.length} {liveNights.length === 1 ? 'night' : 'nights'}</span>
              <span className="text-sm font-semibold">{c(liveNights.reduce((s, x) => s + x.amount, 0))}</span>
              <ChevronDown className={`size-4 text-on-surface-variant transition-transform ${showNights ? 'rotate-180' : ''}`} />
            </button>
            {showNights && nights.map(n => <LineRow key={n.id} line={n} currency={currency} canVoid={canVoid} onChanged={onChanged} onError={onError} indent />)}
          </>
        )}
        {others.map(o => <LineRow key={o.id} line={o} currency={currency} canVoid={canVoid} onChanged={onChanged} onError={onError} />)}
      </div>
    </section>
  );
}

function LineRow({ line, currency, canVoid, onChanged, onError, indent }: {
  line: FolioCharge; currency: string; canVoid: boolean; onChanged: () => void; onError: (m: string | null) => void; indent?: boolean;
}) {
  const [voiding, setVoiding] = useState(false);
  const c = (n: number) => formatCurrency(n, currency);
  return (
    <div className={`px-4 py-2.5 ${indent ? 'pl-11 bg-surface-container-low/50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className={`text-sm truncate ${line.voided ? 'line-through text-on-surface-variant' : ''}`}>{line.description}</p>
          <p className="text-xs text-on-surface-variant">
            {fmtShort(line.stayDate ?? line.postedAt)}
            {line.taxAmount > 0 && ` · GST ${line.taxRate}% ${c(line.taxAmount)}`}
            {line.voided && ` · voided: ${line.voidReason}`}
          </p>
        </div>
        <span className={`text-sm font-medium shrink-0 ${line.voided ? 'line-through text-on-surface-variant' : ''}`}>{c(line.amount)}</span>
        {canVoid && !line.voided && !voiding && (
          <button onClick={() => setVoiding(true)} aria-label="Void this line" className="size-7 -mr-1 rounded-full text-on-surface-variant hover:bg-surface-container flex items-center justify-center shrink-0"><Minus className="size-3.5" /></button>
        )}
      </div>
      {voiding && (
        <VoidForm
          onCancel={() => setVoiding(false)}
          onVoid={async reason => {
            onError(null);
            try { await voidFolioCharge(line.id, reason); onChanged(); } catch (e) { onError(e instanceof Error ? e.message : 'Couldn’t void.'); setVoiding(false); }
          }}
        />
      )}
    </div>
  );
}

function Payments({ payments, currency, canVoid, onChanged, onError }: {
  payments: FolioPayment[]; currency: string; canVoid: boolean; onChanged: () => void; onError: (m: string | null) => void;
}) {
  const c = (n: number) => formatCurrency(n, currency);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  return (
    <section>
      <p className="text-sm font-medium text-on-surface-variant mb-2">Payments</p>
      <div className="rounded-[20px] border border-outline-variant divide-y divide-outline-variant overflow-hidden">
        {payments.map(p => (
          <div key={p.id} className="px-4 py-2.5">
            <div className="flex items-start gap-3">
              {p.kind === 'refund' ? <Undo2 className="size-4 mt-0.5 text-warning shrink-0" /> : <Check className="size-4 mt-0.5 text-success shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${p.voided ? 'line-through text-on-surface-variant' : ''}`}>
                  {p.kind === 'refund' ? 'Refund' : 'Paid'} · {methodLabel(p.method)}{p.note && !['Payment received', 'Refund'].includes(p.note) ? ` · ${p.note}` : ''}
                </p>
                <p className="text-xs text-on-surface-variant">{fmtShort(p.receivedAt)}{p.reference && ` · ref ${p.reference}`}{p.voided && ` · voided: ${p.voidReason}`}</p>
              </div>
              <span className={`text-sm font-medium shrink-0 ${p.voided ? 'line-through text-on-surface-variant' : p.kind === 'refund' ? 'text-warning' : 'text-success'}`}>{p.kind === 'refund' ? '+' : '−'}{c(p.amount)}</span>
              {canVoid && !p.voided && voidingId !== p.id && (
                <button onClick={() => setVoidingId(p.id)} aria-label="Void this payment" className="size-7 -mr-1 rounded-full text-on-surface-variant hover:bg-surface-container flex items-center justify-center shrink-0"><Minus className="size-3.5" /></button>
              )}
            </div>
            {voidingId === p.id && (
              <VoidForm
                onCancel={() => setVoidingId(null)}
                onVoid={async reason => {
                  onError(null);
                  try { await voidFolioPayment(p.id, reason); onChanged(); } catch (e) { onError(e instanceof Error ? e.message : 'Couldn’t void.'); setVoidingId(null); }
                }}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Owner only (the server says so if not), with a reason that stays on the record. */
function VoidForm({ onVoid, onCancel }: { onVoid: (reason: string) => Promise<void>; onCancel: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form onSubmit={async e => { e.preventDefault(); setBusy(true); await onVoid(reason.trim()); setBusy(false); }} className="mt-2 flex gap-2">
      <input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Why? (owner only)" className={`${input} flex-1 h-9`} />
      <button type="button" onClick={onCancel} className="h-9 px-3 rounded-full text-sm text-on-surface-variant">Cancel</button>
      <button disabled={busy || reason.trim().length < 3} className="h-9 px-4 rounded-full bg-error text-on-error text-sm font-medium disabled:opacity-50">Void</button>
    </form>
  );
}

function MethodPicker({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {METHODS.map(m => (
        <button key={m.id} type="button" onClick={() => onChange(m.id)} className={`h-9 px-3.5 rounded-full text-sm font-medium transition-colors ${value === m.id ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container'}`}>
          {m.label}
        </button>
      ))}
    </div>
  );
}

function PaymentForm({ reservationId, balance, currency, onDone, onCancel, onError }: {
  reservationId: string; balance: number; currency: string; onDone: () => void; onCancel: () => void; onError: (m: string | null) => void;
}) {
  const [kind, setKind] = useState<'payment' | 'refund'>(balance < -0.005 ? 'refund' : 'payment');
  const [amount, setAmount] = useState(Math.abs(balance) > 0.005 ? String(Math.abs(balance)) : '');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!n || n <= 0) return;
    setBusy(true);
    onError(null);
    try {
      await recordFolioPayment(reservationId, n, note.trim() || (kind === 'refund' ? 'Refund' : 'Payment received'), method, { reference, kind });
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Couldn’t record that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-[20px] bg-surface-container-low p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{kind === 'refund' ? 'Give a refund' : 'Take a payment'}</p>
        <div className="flex rounded-full bg-surface-container-lowest p-1 text-sm">
          <button type="button" onClick={() => setKind('payment')} className={`h-8 px-3 rounded-full ${kind === 'payment' ? 'bg-primary text-on-primary' : ''}`}>Payment</button>
          <button type="button" onClick={() => setKind('refund')} className={`h-8 px-3 rounded-full ${kind === 'refund' ? 'bg-primary text-on-primary' : ''}`}><RotateCcw className="inline size-3.5 -mt-0.5" /> Refund</button>
        </div>
      </div>
      <label className="block">
        <span className="text-xs text-on-surface-variant">Amount ({currency})</span>
        <input type="number" step="0.01" min="0" required autoFocus value={amount} onChange={e => setAmount(e.target.value)} className={`${input} w-full mt-1 text-base`} />
      </label>
      <MethodPicker value={method} onChange={setMethod} />
      <div className="grid grid-cols-2 gap-2">
        <input value={reference} onChange={e => setReference(e.target.value)} placeholder={method === 'upi' ? 'UPI ref (optional)' : 'Reference (optional)'} className={input} />
        <input value={note} onChange={e => setNote(e.target.value)} placeholder={kind === 'refund' ? 'Why (optional)' : 'e.g. Advance'} className={input} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btnQuiet}>Cancel</button>
        <button disabled={busy} className={btnPrimary}>{busy ? 'Saving…' : kind === 'refund' ? 'Record refund' : 'Record payment'}</button>
      </div>
    </form>
  );
}

function ChargeForm({ reservationId, gstEnabled, onDone, onCancel, onError }: {
  reservationId: string; gstEnabled: boolean; onDone: () => void; onCancel: () => void; onError: (m: string | null) => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<(typeof CHARGE_CATEGORIES)[number]['id']>('extra');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!description.trim() || !n || n <= 0) return;
    setBusy(true);
    onError(null);
    try {
      await addFolioCharge(reservationId, description.trim(), n, category);
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Couldn’t add that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-[20px] bg-surface-container-low p-4 space-y-3">
      <p className="font-semibold">Add a charge</p>
      <input autoFocus required value={description} onChange={e => setDescription(e.target.value)} placeholder="Extra bed, late check-out, laundry…" className={`${input} w-full`} />
      <div className="flex flex-wrap gap-1.5">
        {CHARGE_CATEGORIES.map(cat => (
          <button key={cat.id} type="button" onClick={() => setCategory(cat.id)} className={`h-8 px-3 rounded-full text-[13px] font-medium ${category === cat.id ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface'}`}>{cat.label}</button>
        ))}
      </div>
      <label className="block">
        <span className="text-xs text-on-surface-variant">Amount{gstEnabled ? ', before GST' : ''}</span>
        <input type="number" step="0.01" min="0" required value={amount} onChange={e => setAmount(e.target.value)} className={`${input} w-full mt-1`} />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btnQuiet}>Cancel</button>
        <button disabled={busy} className={btnPrimary}>{busy ? 'Adding…' : 'Add to bill'}</button>
      </div>
    </form>
  );
}

/** Settle what's due in one method or several, then check out and issue the bill. */
function CheckoutForm({ reservationId, balance, currency, onCancel, onError, onDone }: {
  reservationId: string; balance: number; currency: string; onCancel: () => void; onError: (m: string | null) => void; onDone: (r: CheckoutResult) => void;
}) {
  const due = Math.max(0, balance);
  const [rows, setRows] = useState<{ amount: string; method: PaymentMethod; reference: string }[]>(due > 0.005 ? [{ amount: String(due), method: 'cash', reference: '' }] : []);
  const [busy, setBusy] = useState(false);
  const entered = useMemo(() => rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0), [rows]);
  const left = Math.round((due - entered) * 100) / 100;
  const c = (n: number) => formatCurrency(n, currency);

  const set = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    setBusy(true);
    onError(null);
    try {
      const payments = rows.map(r => ({ amount: parseFloat(r.amount) || 0, method: r.method, reference: r.reference.trim() || undefined })).filter(p => p.amount > 0);
      onDone(await checkoutWithPayments(reservationId, payments));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Couldn’t check out.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[20px] bg-surface-container-low p-4 space-y-3">
      <div>
        <p className="font-semibold">Check out</p>
        <p className="text-sm text-on-surface-variant">
          {balance < -0.005 ? `The guest has paid ${c(-balance)} more than the bill. Record a refund first, or check out and refund after.`
            : due > 0.005 ? `${c(due)} is due, including tonight's room if they're leaving after the night audit. Split it if the guest pays in parts.`
            : 'Nothing is due.'}
        </p>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="rounded-2xl bg-surface-container-lowest p-3 space-y-2">
          <div className="flex gap-2">
            <input type="number" step="0.01" min="0" value={r.amount} onChange={e => set(i, { amount: e.target.value })} className={`${input} flex-1`} aria-label="Amount" />
            {rows.length > 1 && <button type="button" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} aria-label="Remove" className="size-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"><X className="size-4" /></button>}
          </div>
          <MethodPicker value={r.method} onChange={m => set(i, { method: m })} />
          {r.method !== 'cash' && <input value={r.reference} onChange={e => set(i, { reference: e.target.value })} placeholder="Reference (optional)" className={`${input} w-full`} />}
        </div>
      ))}
      {due > 0.005 && left > 0.005 && (
        <button type="button" onClick={() => setRows(rs => [...rs, { amount: String(left), method: 'upi', reference: '' }])} className="text-sm font-medium inline-flex items-center gap-1"><Plus className="size-4" /> Pay {c(left)} another way</button>
      )}
      {due > 0.005 && Math.abs(left) > 0.005 && <p className={`text-sm ${left > 0 ? 'text-error' : 'text-warning'}`}>{left > 0 ? `${c(left)} still to cover` : `${c(-left)} more than is due`}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btnQuiet}>Cancel</button>
        <button onClick={submit} disabled={busy || (due > 0.005 && left > 0.005)} className={btnPrimary}>{busy ? 'Checking out…' : 'Check out & issue bill'}</button>
      </div>
    </div>
  );
}

function CheckedOut({ result, currency, guestName, guestPhone, guestEmail, propertyName, onShowBill }: {
  result: CheckoutResult; currency: string; guestName?: string; guestPhone?: string; guestEmail?: string; propertyName: string; onShowBill: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = result.shareToken ? billLink(result.shareToken) : null;
  const text = `Thank you for staying at ${propertyName}${guestName ? `, ${guestName.split(' ')[0]}` : ''}. Your bill ${result.invoiceNumber ?? ''}: ${link ?? ''}`;
  const phone = guestPhone?.replace(/\D/g, '');
  const wa = `https://wa.me/${phone ? (phone.length === 10 ? `91${phone}` : phone) : ''}?text=${encodeURIComponent(text)}`;

  return (
    <div className="text-center py-4 space-y-4">
      <span className="size-14 rounded-full bg-success text-on-success flex items-center justify-center mx-auto"><Check className="size-7" /></span>
      <div>
        <p className="text-xl font-semibold tracking-[-0.02em]">Checked out</p>
        <p className="text-sm text-on-surface-variant mt-1">
          {result.invoiceNumber && <>Bill <span className="font-medium text-on-surface">{result.invoiceNumber}</span> issued. </>}
          {result.balanceAfter != null && result.balanceAfter < -0.005 ? `Refund due: ${formatCurrency(-result.balanceAfter, currency)}. ` : ''}The room is marked for cleaning.
        </p>
      </div>
      {link && (
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={onShowBill} className={btnPrimary}><Printer className="size-4" /> Print</button>
          <a href={wa} target="_blank" rel="noopener noreferrer" className={btnQuiet}><MessageCircle className="size-4" /> WhatsApp</a>
          {guestEmail && <a href={`mailto:${guestEmail}?subject=${encodeURIComponent(`Your bill from ${propertyName}`)}&body=${encodeURIComponent(text)}`} className={btnQuiet}><Mail className="size-4" /> Email</a>}
          <button onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link is in the WhatsApp text too */ } }} className={btnQuiet}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  );
}

function BillPreview({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const [message, setMessage] = useState('');
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 bg-surface-container-lowest text-on-surface border-b border-outline-variant print:hidden">
        <p className="font-semibold mr-auto">{bill.number ?? 'Bill so far'}</p>
        <input value={message} onChange={e => setMessage(e.target.value)} placeholder="Note to print (optional)" className={`${input} hidden sm:block w-64`} />
        <button onClick={() => window.print()} className={btnPrimary}><Printer className="size-4" /> Print / PDF</button>
        <button onClick={onClose} aria-label="Close" className="size-10 rounded-full hover:bg-surface-container-low flex items-center justify-center"><X className="size-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="print-only-root rounded-[20px] overflow-hidden"><BillDocument bill={bill} message={message.trim() || undefined} /></div>
      </div>
    </div>
  );
}

function UpiQr({ upiId, propertyName, amount, currency, onClose }: { upiId: string; propertyName: string; amount: number; currency: string; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    // Standard UPI deep link: any UPI app scans and prefills it.
    const link = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(propertyName)}&am=${amount.toFixed(2)}&cu=INR`;
    QRCode.toDataURL(link, { width: 240, margin: 1, color: { dark: '#111111', light: '#ffffff' } }).then(setDataUrl);
  }, [upiId, propertyName, amount]);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]" onClick={onClose}>
      <div className="bg-surface-container-lowest text-on-surface rounded-[28px] max-w-xs w-full p-6 text-center space-y-3" onClick={e => e.stopPropagation()}>
        <p className="font-semibold">Scan to pay {formatCurrency(amount, currency)}</p>
        {dataUrl ? <img src={dataUrl} alt="UPI payment QR" className="size-48 mx-auto rounded-xl" /> : <div className="size-48 mx-auto rounded-xl bg-surface-container-low animate-pulse" />}
        <p className="text-xs text-on-surface-variant">When it’s paid, record it as a UPI payment so the bill shows it.</p>
        <button onClick={onClose} className={`${btnPrimary} w-full`}>Close</button>
      </div>
    </div>
  );
}
