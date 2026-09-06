import React, { useMemo, useState } from 'react';
import { Search, Users, BedDouble, ArrowLeft, X, CheckCircle2, QrCode, UserPlus } from 'lucide-react';
import { Room } from '../types';
import { checkInNewGuest } from '../lib/staffApi';
import { formatCurrency } from '../lib/currency';
import { ImageUploadField } from './ImageUploadField';
import { RoomQrModal } from './RoomQrModal';

interface NewBookingModalProps {
  propertyId: string;
  currency: string;
  rooms: Room[];
  onClose: () => void;
  onBooked: () => void;
}

type Step = 'search' | 'results' | 'details' | 'success';

const inputCls = 'w-full h-10 px-3 text-sm border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none';
const labelCls = 'text-[11px] font-bold text-[#4e463a] block mb-1';

function defaultCheckoutDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The actual front-desk sequence: a guest states what they need (how many
 * people, roughly what kind of room), Reception searches for a room that
 * fits instead of eyeballing the floor grid, picks one, then collects the
 * guest's details to assign it — the same staff_checkin_new_guest this
 * whole thing ends in is also reachable per-room from Rooms & Floors
 * (CheckInModal) for the simpler "I already know which room" case.
 */
export function NewBookingModal({ propertyId, currency, rooms, onClose, onBooked }: NewBookingModalProps) {
  const [step, setStep] = useState<Step>('search');
  const [partySize, setPartySize] = useState('2');
  const [roomType, setRoomType] = useState('any');
  const [checkOut, setCheckOut] = useState(defaultCheckoutDate());
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [vip, setVip] = useState(false);
  const [idDocumentUrl, setIdDocumentUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const roomTypes = useMemo(
    () => Array.from(rooms.reduce((set, r) => set.add(r.type), new Set<string>())).sort(),
    [rooms]
  );

  const matchingRooms = useMemo(() => {
    const party = parseInt(partySize, 10) || 1;
    return rooms
      .filter(r => r.status === 'ready')
      .filter(r => r.maxOccupancy >= party)
      .filter(r => roomType === 'any' || r.type === roomType)
      .sort((a, b) => a.pricePerNight - b.pricePerNight);
  }, [rooms, partySize, roomType]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('results');
  };

  const handlePickRoom = (room: Room) => {
    setSelectedRoom(room);
    setStep('details');
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoom || !name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await checkInNewGuest(propertyId, selectedRoom.id, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        vip,
        idDocumentUrl: idDocumentUrl || undefined,
        checkOut: checkOut ? new Date(`${checkOut}T12:00:00`) : undefined,
        partySize: parseInt(partySize, 10) || 1,
      });
      setStep('success');
      onBooked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign room.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-[70]">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#E9ECEF] space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#E9ECEF]">
          <div>
            <p className="text-[10px] font-bold text-[#765a25] uppercase tracking-wider">New Booking</p>
            <h3 className="text-lg font-bold text-[#141d23]">
              {step === 'search' && 'What does the guest need?'}
              {step === 'results' && 'Available Rooms'}
              {step === 'details' && `Assign Room ${selectedRoom?.number}`}
              {step === 'success' && 'Checked In'}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
        </div>

        {step === 'search' && (
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}><Users className="w-3 h-3 inline mr-1" />Guests</label>
                <input type="number" min={1} value={partySize} onChange={e => setPartySize(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Checkout Date</label>
                <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} min={new Date().toISOString().slice(0, 10)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}><BedDouble className="w-3 h-3 inline mr-1" />Room Type</label>
              <select value={roomType} onChange={e => setRoomType(e.target.value)} className={`${inputCls} bg-white`}>
                <option value="any">Any type</option>
                {roomTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button type="submit" className="w-full h-11 rounded-lg bg-[#765a25] text-white font-semibold text-sm hover:bg-[#5c4210] flex items-center justify-center gap-2">
              <Search className="w-4 h-4" /> Search Available Rooms
            </button>
          </form>
        )}

        {step === 'results' && (
          <div className="space-y-3">
            <button onClick={() => setStep('search')} className="text-xs font-semibold text-[#765a25] hover:underline flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Adjust search
            </button>
            {matchingRooms.length === 0 ? (
              <p className="text-sm text-[#7f7668] text-center py-10">
                No ready rooms sleep {partySize}+{roomType !== 'any' ? ` in "${roomType}"` : ''} right now. Try adjusting the search.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {matchingRooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => handlePickRoom(room)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-[#E9ECEF] hover:border-[#765a25] hover:bg-[#fff8ec] text-left transition-colors"
                  >
                    <div>
                      <p className="text-sm font-bold text-[#141d23]">Room {room.number} · {room.type}</p>
                      <p className="text-[11px] text-[#7f7668]">Floor {room.floor} · Sleeps {room.maxOccupancy}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-bold text-[#2D6A4F]">{formatCurrency(room.pricePerNight, currency)}</p>
                      <p className="text-[10px] text-[#7f7668]">/ night</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'details' && selectedRoom && (
          <form onSubmit={handleAssign} className="space-y-3">
            <button type="button" onClick={() => setStep('results')} className="text-xs font-semibold text-[#765a25] hover:underline flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Choose a different room
            </button>
            <div className="bg-[#f6faff] p-2.5 rounded-lg border border-[#E9ECEF] text-xs text-[#4e463a]">
              Room {selectedRoom.number} · {selectedRoom.type} · {formatCurrency(selectedRoom.pricePerNight, currency)}/night
            </div>

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
            <ImageUploadField label="ID Document (optional)" value={idDocumentUrl} onChange={setIdDocumentUrl} />
            <label className="flex items-center gap-2 text-xs font-semibold text-[#141d23]">
              <input type="checkbox" checked={vip} onChange={e => setVip(e.target.checked)} className="accent-[#765a25]" />
              VIP guest
            </label>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button type="submit" disabled={submitting || !name.trim()} className="w-full h-11 rounded-lg bg-[#765a25] text-white font-semibold text-sm hover:bg-[#5c4210] disabled:opacity-60 flex items-center justify-center gap-2">
              <UserPlus className="w-4 h-4" /> {submitting ? 'Assigning…' : `Assign Room ${selectedRoom.number}`}
            </button>
          </form>
        )}

        {step === 'success' && selectedRoom && (
          <div className="text-center py-4 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-[#2D6A4F] mx-auto" />
            <p className="text-base font-bold text-[#141d23]">Room {selectedRoom.number} assigned to {name}</p>
            <p className="text-xs text-[#7f7668]">
              Their folio starts now and runs through checkout — every order and request on this room belongs to them until then.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowQr(true)}
                className="flex-1 h-10 rounded-lg border border-[#765a25] text-[#765a25] text-xs font-bold hover:bg-[#fff8ec] flex items-center justify-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5" /> Room Key (QR)
              </button>
              <button onClick={onClose} className="flex-1 h-10 rounded-lg bg-[#141d23] text-white text-xs font-semibold">
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {showQr && selectedRoom && <RoomQrModal roomNumber={selectedRoom.number} roomId={selectedRoom.id} onClose={() => setShowQr(false)} />}
    </div>
  );
}
