import React, { useEffect, useState } from 'react';
import { Receipt, X } from 'lucide-react';
import { Folio } from '../types';
import { fetchFolio, checkoutReservation } from '../lib/staffApi';

interface RoomFolioModalProps {
  reservationId: string;
  roomNumber: string;
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
 * (room service orders, booked experiences), settled all at once here
 * rather than paid per-order. This is the "pay at checkout" flow: nothing
 * is charged until Reception confirms it here.
 */
export const RoomFolioModal: React.FC<RoomFolioModalProps> = ({ reservationId, roomNumber, onClose, onCheckedOut }) => {
  const [folio, setFolio] = useState<Folio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<'cash' | 'card' | 'upi' | 'other'>('cash');
  const [settling, setSettling] = useState(false);
  const [result, setResult] = useState<{ amountCharged: number } | null>(null);

  useEffect(() => {
    fetchFolio(reservationId)
      .then(setFolio)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load folio.'))
      .finally(() => setLoading(false));
  }, [reservationId]);

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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E9ECEF] space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E9ECEF]">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#765a25]" />
            <h3 className="text-lg font-bold text-[#141d23]">Room {roomNumber} · Folio</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <p className="text-sm text-[#7f7668] text-center py-8">Loading folio…</p>
        ) : result ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-2xl font-bold text-[#2D6A4F]">${result.amountCharged.toFixed(2)} settled</p>
            <p className="text-xs text-[#4e463a]">Charged via {method.toUpperCase()}. Room {roomNumber} is now marked for cleaning.</p>
            <button onClick={onClose} className="mt-3 px-5 py-2 bg-[#141d23] text-white rounded-lg text-xs font-semibold">Done</button>
          </div>
        ) : folio ? (
          <>
            <div className="max-h-64 overflow-y-auto divide-y divide-[#E9ECEF] border border-[#E9ECEF] rounded-lg">
              {folio.charges.length === 0 ? (
                <p className="text-xs text-[#7f7668] text-center py-6">No charges on this stay yet.</p>
              ) : (
                folio.charges.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#141d23] truncate">{c.description}</p>
                      <p className="text-[10px] text-[#7f7668] capitalize">{c.category.replace('_', ' ')} · {new Date(c.postedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className={`font-bold shrink-0 ml-2 ${c.settled ? 'text-[#7f7668] line-through' : 'text-[#141d23]'}`}>${c.amount.toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-bold text-[#141d23]">Total due</span>
              <span className="text-xl font-bold text-[#141d23]">${folio.totalOutstanding.toFixed(2)}</span>
            </div>

            {folio.status === 'checked_in' && folio.totalOutstanding >= 0 && (
              <>
                <div>
                  <label className="text-[10px] font-bold text-[#4e463a] block mb-1.5">Payment method</label>
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

                {error && <p className="text-xs text-red-600">{error}</p>}

                <button
                  onClick={handleCheckout}
                  disabled={settling}
                  className="w-full h-11 rounded-lg bg-[#765a25] text-white font-semibold text-sm hover:bg-[#5c4210] disabled:opacity-60"
                >
                  {settling ? 'Settling…' : `Settle $${folio.totalOutstanding.toFixed(2)} & Check Out`}
                </button>
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
    </div>
  );
};
