import React, { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { Room } from '../types';
import { checkInNewGuest } from '../lib/staffApi';
import { ImageUploadField } from './ImageUploadField';
import { PhoneField } from './PhoneField';
import { ModalShell } from './ModalShell';
import { DateRangePicker, toIso, todayLocalIso } from './DatePicker';
import { CheckInAccessChoice } from './CheckInAccessChoice';
import { promptStayAccess, type StayAccessChoice } from '../lib/stayAccess';

interface CheckInModalProps {
  propertyId: string;
  room: Room;
  /** 'imported' = the booking already exists in the hotel's real PMS; this check-in just links a guest to the room so the QR/folio/requests work. Defaults to 'built_in'. */
  source?: 'built_in' | 'imported';
  onClose: () => void;
  onCheckedIn: () => void;
}

function defaultCheckoutDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toIso(d);
}

const inputCls = 'w-full h-10 px-3 text-sm border border-outline-variant rounded-lg focus:border-primary focus:outline-none';
const labelCls = 'text-[11px] font-semibold text-on-surface-variant block mb-1';

/**
 * The actual "assign this room to this person" step. Before this existed,
 * marking a room 'occupied' was just a status flip with no guest behind
 * it — the room's QR (0011_room_qr.sql) would correctly show "no one's
 * checked in" even though the room tile looked occupied. This is what
 * makes those two things agree: a room only becomes occupied by way of a
 * real guest record and reservation (staff_checkin_new_guest).
 */
export function CheckInModal({ propertyId, room, source = 'built_in', onClose, onCheckedIn }: CheckInModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [vip, setVip] = useState(false);
  const [idDocumentUrl, setIdDocumentUrl] = useState('');
  const [checkOut, setCheckOut] = useState(defaultCheckoutDate());
  const [partySize, setPartySize] = useState('1');
  const today = todayLocalIso();
  const [accessChoice, setAccessChoice] = useState<StayAccessChoice>('auto');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const reservationId = await checkInNewGuest(propertyId, room.id, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        vip,
        idDocumentUrl: idDocumentUrl || undefined,
        checkOut: checkOut ? new Date(`${checkOut}T12:00:00`) : undefined,
        partySize: parseInt(partySize, 10) || 1,
        source,
      });
      // The code goes to the email above unless the stay link was picked.
      promptStayAccess(reservationId, accessChoice);
      onCheckedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check in guest.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      zClass="z-[70]"
      title={`Check In — Room ${room.number}`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface-variant">
            Cancel
          </button>
          <button type="submit" form="check-in-form" disabled={submitting || !name.trim()} className="px-5 py-2 bg-primary text-on-primary rounded-lg text-xs font-semibold hover:bg-primary-hover disabled:opacity-60">
            {submitting ? 'Checking in…' : 'Check In & Assign Room'}
          </button>
        </div>
      }
    >
      <form id="check-in-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-xs text-on-surface-variant">
          {source === 'imported'
            ? "This doesn't book the room — it just tells Cabadra who's staying in it, so their room QR, folio and requests work for them specifically until checkout."
            : "This creates the guest's profile and assigns them to this room — their room-service QR will work for them specifically until checkout."}
        </p>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Guest Name *</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phone</label>
              <PhoneField value={phone} onChange={setPhone} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="guest@email.com" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Stay (today → checkout)</label>
              <DateRangePicker
                start={today}
                end={checkOut}
                startLocked
                compact
                showNights
                startLabel="Today"
                endLabel="Checkout"
                onChange={(_, b) => setCheckOut(b)}
                className={`${inputCls} flex items-center justify-between gap-2 text-left`}
              />
            </div>
            <div>
              <label className={labelCls}>Party Size</label>
              <input type="number" min={1} value={partySize} onChange={e => setPartySize(e.target.value)} className={inputCls} />
            </div>
          </div>
          <CheckInAccessChoice email={email} phone={phone} choice={accessChoice} onChange={setAccessChoice} />
          <ImageUploadField label="ID Document (optional)" idDocument value={idDocumentUrl} onChange={setIdDocumentUrl} />
          <label className="flex items-center gap-2 text-xs font-semibold text-on-surface">
            <input type="checkbox" checked={vip} onChange={e => setVip(e.target.checked)} className="accent-primary" />
            VIP guest
          </label>
        </div>

        {error && <p className="text-xs text-error">{error}</p>}

      </form>
    </ModalShell>
  );
}
