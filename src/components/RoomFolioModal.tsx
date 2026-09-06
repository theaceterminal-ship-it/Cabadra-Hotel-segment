import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Receipt, X, Plus, Printer, QrCode } from 'lucide-react';
import { Folio } from '../types';
import { fetchFolio, checkoutReservation, recordFolioPayment } from '../lib/staffApi';
import { formatCurrency } from '../lib/currency';

interface RoomFolioModalProps {
  reservationId: string;
  roomNumber: string;
  guestName?: string;
  propertyName: string;
  currency: string;
  upiId?: string;
  onClose: () => void;
  /** Fires after a successful checkout so the caller can refresh rooms/arrivals. */
  onCheckedOut: () => void;
}

const PAYMENT_METHODS: { id: 'cash' | 'card' | 'upi' | 'other'; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card' },
  { id: 'upi', label: 'UPI' },
  { id: 'other', label: 'Other' },
];

/**
 * The room's running bill — every folio_charges row this stay has posted
 * (room service orders, booked experiences, and now deposits/payments
 * received mid-stay, each a negative line that nets the balance down
 * immediately). Settling here at checkout doesn't assume nothing was paid
 * yet; it just closes out whatever's left.
 */
export const RoomFolioModal: React.FC<RoomFolioModalProps> = ({ reservationId, roomNumber, guestName, propertyName, currency, upiId, onClose, onCheckedOut }) => {
  const [folio, setFolio] = useState<Folio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<'cash' | 'card' | 'upi' | 'other'>('cash');
  const [settling, setSettling] = useState(false);
  const [result, setResult] = useState<{ amountCharged: number } | null>(null);

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'other'>('upi');
  const [recordingPayment, setRecordingPayment] = useState(false);

  const [showUpiQr, setShowUpiQr] = useState(false);
  const [upiQrDataUrl, setUpiQrDataUrl] = useState<string | null>(null);
  const [billMessage, setBillMessage] = useState('Thank you for staying with us!');

  const reload = () => fetchFolio(reservationId)
    .then(setFolio)
    .catch(err => setError(err instanceof Error ? err.message : 'Failed to load folio.'))
    .finally(() => setLoading(false));

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reservationId]);

  const handleCheckout = async () => {
    setSettling(true);
    setError(null);
    try {
      const outcome = await checkoutReservation(reservationId, method);
      setResult({ amountCharged: outcome.amountCharged });
      onCheckedOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to settle folio.');
    } finally {
      setSettling(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) return;
    setRecordingPayment(true);
    setError(null);
    try {
      await recordFolioPayment(reservationId, amount, paymentNote.trim() || 'Payment received', paymentMethod);
      setPaymentAmount('');
      setPaymentNote('');
      setShowPaymentForm(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleShowUpiQr = async () => {
    if (!upiId || !folio) return;
    setShowUpiQr(true);
    if (!upiQrDataUrl) {
      // Standard UPI deep-link format — any UPI app can scan and prefill this.
      const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(propertyName)}&am=${folio.totalOutstanding.toFixed(2)}&cu=INR`;
      const dataUrl = await QRCode.toDataURL(upiLink, { width: 240, margin: 1, color: { dark: '#141d23', light: '#ffffff' } });
      setUpiQrDataUrl(dataUrl);
    }
  };

  const handlePrintBill = () => {
    if (!folio) return;
    const rows = folio.charges.map(c => `
      <tr>
        <td>${new Date(c.postedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
        <td style="text-transform:capitalize">${c.category.replace('_', ' ')}</td>
        <td>${c.description}</td>
        <td style="text-align:right">${c.amount < 0 ? '−' : ''}${formatCurrency(Math.abs(c.amount), currency)}</td>
      </tr>`).join('');
    const total = folio.charges.reduce((sum, c) => sum + c.amount, 0);
    const win = window.open('', '_blank', 'width=480,height=640');
    if (!win) return;
    win.document.write(`
      <html><head><title>Bill — Room ${roomNumber}</title>
        <style>
          body { font-family: 'Georgia', serif; max-width: 480px; margin: 24px auto; color: #141d23; padding: 0 16px; }
          h1 { font-size: 20px; margin-bottom: 2px; }
          .sub { color: #7f7668; font-size: 12px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
          th, td { border-bottom: 1px solid #eee; padding: 6px 4px; text-align: left; }
          th { text-transform: uppercase; font-size: 10px; color: #7f7668; }
          .total-row td { border-top: 2px solid #141d23; border-bottom: none; font-weight: bold; font-size: 15px; padding-top: 10px; }
          .message { margin-top: 28px; padding-top: 16px; border-top: 1px dashed #ccc; font-style: italic; font-size: 13px; }
          .footer { margin-top: 24px; font-size: 10px; color: #aaa; text-align: center; }
        </style>
      </head><body>
        <h1>${propertyName}</h1>
        <div class="sub">Room ${roomNumber}${guestName ? ` · ${guestName}` : ''} · ${new Date().toLocaleDateString()}</div>
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            ${rows}
            <tr class="total-row"><td colspan="3">Balance</td><td style="text-align:right">${formatCurrency(total, currency)}</td></tr>
          </tbody>
        </table>
        ${billMessage.trim() ? `<div class="message">${billMessage.trim()}${guestName ? ` — ${guestName}, we hope to see you again.` : ''}</div>` : ''}
        <div class="footer">Printed ${new Date().toLocaleString()}</div>
        <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E9ECEF] space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#E9ECEF]">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#765a25]" />
            <div>
              <h3 className="text-lg font-bold text-[#141d23]">Room {roomNumber} · Folio</h3>
              {guestName && <p className="text-[11px] text-[#7f7668]">{guestName}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <p className="text-sm text-[#7f7668] text-center py-8">Loading folio…</p>
        ) : result ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-2xl font-bold text-[#2D6A4F]">{formatCurrency(result.amountCharged, currency)} settled</p>
            <p className="text-xs text-[#4e463a]">Charged via {method.toUpperCase()}. Room {roomNumber} is now marked for cleaning.</p>
            <button onClick={onClose} className="mt-3 px-5 py-2 bg-[#141d23] text-white rounded-lg text-xs font-semibold">Done</button>
          </div>
        ) : folio ? (
          <>
            {/* Activity timeline — every charge and payment, oldest first, so it reads as "what happened when" rather than a jumbled bill */}
            <div className="max-h-56 overflow-y-auto divide-y divide-[#E9ECEF] border border-[#E9ECEF] rounded-lg">
              {folio.charges.length === 0 ? (
                <p className="text-xs text-[#7f7668] text-center py-6">No activity on this stay yet.</p>
              ) : (
                [...folio.charges]
                  .sort((a, b) => a.postedAt.localeCompare(b.postedAt))
                  .map(c => {
                    const isPayment = c.amount < 0;
                    return (
                      <div key={c.id} className="flex items-center justify-between px-3 py-2 text-xs">
                        <div className="min-w-0 flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isPayment ? 'bg-[#2D6A4F]' : 'bg-[#765a25]'}`} />
                          <div className="min-w-0">
                            <p className="font-semibold text-[#141d23] truncate">{c.description}</p>
                            <p className="text-[10px] text-[#7f7668]">
                              {new Date(c.postedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              {isPayment ? ' · payment received' : ` · ${c.category.replace('_', ' ')}`}
                            </p>
                          </div>
                        </div>
                        <span className={`font-bold shrink-0 ml-2 ${isPayment ? 'text-[#2D6A4F]' : c.settled ? 'text-[#7f7668] line-through' : 'text-[#141d23]'}`}>
                          {isPayment ? '−' : ''}{formatCurrency(Math.abs(c.amount), currency)}
                        </span>
                      </div>
                    );
                  })
              )}
            </div>

            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-bold text-[#141d23]">Balance due</span>
              <span className="text-xl font-bold text-[#141d23]">{formatCurrency(folio.totalOutstanding, currency)}</span>
            </div>

            {folio.status === 'checked_in' && (
              <>
                {/* Record a payment any time — a deposit at check-in, a mid-stay UPI payment — not only at final checkout */}
                {showPaymentForm ? (
                  <form onSubmit={handleRecordPayment} className="bg-[#f6faff] p-3 rounded-lg border border-[#E9ECEF] space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" step="0.01" required autoFocus value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="Amount" className="h-9 px-2.5 text-xs border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none" />
                      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)} className="h-9 px-2 text-xs border border-[#E9ECEF] rounded-lg bg-white">
                        {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </div>
                    <input value={paymentNote} onChange={e => setPaymentNote(e.target.value)} placeholder="e.g. Advance at check-in" className="w-full h-9 px-2.5 text-xs border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none" />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setShowPaymentForm(false)} className="h-8 px-3 rounded-lg border border-[#E9ECEF] text-xs font-semibold text-[#4e463a]">Cancel</button>
                      <button type="submit" disabled={recordingPayment} className="h-8 px-3 rounded-lg bg-[#2D6A4F] text-white text-xs font-bold disabled:opacity-60">
                        {recordingPayment ? 'Saving…' : 'Record Payment'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setShowPaymentForm(true)} className="flex-1 h-9 rounded-lg border border-[#2D6A4F] text-[#2D6A4F] text-xs font-bold hover:bg-[#2D6A4F]/5 flex items-center justify-center gap-1.5">
                      <Plus className="w-3.5 h-3.5" /> Record Payment
                    </button>
                    {upiId && (
                      <button onClick={handleShowUpiQr} className="flex-1 h-9 rounded-lg border border-[#E9ECEF] text-[#4e463a] text-xs font-bold hover:border-[#765a25] hover:text-[#765a25] flex items-center justify-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5" /> Show UPI QR
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-bold text-[#4e463a] block mb-1.5">Settle remaining balance via</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PAYMENT_METHODS.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setMethod(m.id)}
                        className={`h-8 rounded-lg border text-[11px] font-bold transition-colors ${
                          method === m.id ? 'bg-[#765a25] text-white border-[#765a25]' : 'bg-white border-[#E9ECEF] text-[#4e463a] hover:border-[#765a25]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  value={billMessage}
                  onChange={(e) => setBillMessage(e.target.value)}
                  placeholder="Message printed on the bill (optional)"
                  className="w-full h-9 px-2.5 text-xs border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none"
                />

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={handlePrintBill}
                    className="h-11 px-3.5 rounded-lg border border-[#E9ECEF] text-[#4e463a] hover:border-[#765a25] hover:text-[#765a25] flex items-center justify-center shrink-0"
                    title="Print bill"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCheckout}
                    disabled={settling}
                    className="flex-1 h-11 rounded-lg bg-[#765a25] text-white font-semibold text-sm hover:bg-[#5c4210] disabled:opacity-60"
                  >
                    {settling ? 'Settling…' : `Settle ${formatCurrency(folio.totalOutstanding, currency)} & Check Out`}
                  </button>
                </div>
              </>
            )}
            {folio.status !== 'checked_in' && (
              <p className="text-xs text-[#7f7668] text-center">This reservation is {folio.status.replace('_', ' ')} — nothing to settle.</p>
            )}
          </>
        ) : (
          <p className="text-xs text-red-600">{error}</p>
        )}
      </div>

      {showUpiQr && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-[70]" onClick={() => setShowUpiQr(false)}>
          <div className="bg-white rounded-2xl max-w-xs w-full p-6 shadow-2xl border border-[#E9ECEF] text-center space-y-3" onClick={e => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-[#141d23]">Scan to pay {folio && formatCurrency(folio.totalOutstanding, currency)}</h4>
            {upiQrDataUrl ? (
              <img src={upiQrDataUrl} alt="UPI payment QR" className="w-48 h-48 mx-auto rounded-lg border border-[#E9ECEF]" />
            ) : (
              <div className="w-48 h-48 mx-auto rounded-lg border border-[#E9ECEF] bg-[#f6faff] animate-pulse" />
            )}
            <p className="text-[11px] text-[#7f7668]">Once confirmed, use "Record Payment" above so the folio reflects it.</p>
            <button onClick={() => setShowUpiQr(false)} className="w-full h-9 rounded-lg bg-[#141d23] text-white text-xs font-semibold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};
