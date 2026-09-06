import React, { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { Room } from '../types';
import { checkInNewGuest } from '../lib/staffApi';
import { ImageUploadField } from './ImageUploadField';

interface CheckInModalProps {
  propertyId: string;
  room: Room;
  onClose: () => void;
  onCheckedIn: () => void;
}

function defaultCheckoutDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const inputCls = 'w-full h-10 px-3 text-sm border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none';
const labelCls = 'text-[11px] font-bold text-[#4e463a] block mb-1';

/**
 * The actual "assign this room to this person" step. Before this existed,
 * marking a room 'occupied' was just a status flip with no guest behind
 * it — the room's QR (0011_room_qr.sql) would correctly show "no one's
 * checked in" even though the room tile looked occupied. This is what
 * makes those two things agree: a room only becomes occupied by way of a
 * real guest record and reservation (staff_checkin_new_guest).
 */
export function CheckInModal({ propertyId, room, onClose, onCheckedIn }: CheckInModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [vip, setVip] = useState(false);
  const [idDocumentUrl, setIdDocumentUrl] = useState('');
  const [checkOut, setCheckOut] = useState(defaultCheckoutDate());
  const [partySize, setPartySize] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await checkInNewGuest(propertyId, room.id, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        vip,
        idDocumentUrl: idDocumentUrl || undefined,
        checkOut: checkOut ? new Date(`${checkOut}T12:00:00`) : undefined,
        partySize: parseInt(partySize, 10) || 1,
      });
      onCheckedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check in guest.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-[70]">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E9ECEF] space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E9ECEF]">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#765a25]" />
            <h3 className="text-lg font-bold text-[#141d23]">Check In — Room {room.number}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-[#7f7668]">
          This creates the guest's profile and assigns them to this room — their room-service QR will work for them specifically until checkout.
        </p>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Guest Name *</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="guest@email.com" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Checkout Date</label>
              <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} min={new Date().toISOString().slice(0, 10)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Party Size</label>
              <input type="number" min={1} value={partySize} onChange={e => setPartySize(e.target.value)} className={inputCls} />
            </div>
          </div>
          <ImageUploadField label="ID Document (optional)" value={idDocumentUrl} onChange={setIdDocumentUrl} />
          <label className="flex items-center gap-2 text-xs font-semibold text-[#141d23]">
            <input type="checkbox" checked={vip} onChange={e => setVip(e.target.checked)} className="accent-[#765a25]" />
            VIP guest
          </label>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-3 border-t border-[#E9ECEF]">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-[#E9ECEF] rounded-lg text-xs font-semibold text-[#4e463a]">
            Cancel
          </button>
          <button type="submit" disabled={submitting || !name.trim()} className="px-5 py-2 bg-[#765a25] text-white rounded-lg text-xs font-bold hover:bg-[#5c4210] disabled:opacity-60">
            {submitting ? 'Checking in…' : 'Check In & Assign Room'}
          </button>
        </div>
      </form>
    </div>
  );
}
