import React, { useMemo, useState } from 'react';
import { Search, Users, BedDouble, Calendar, ArrowLeft, X, CheckCircle2, QrCode, UserPlus } from 'lucide-react';
import { Room } from '../types';
import { checkInNewGuest, searchAvailableRooms, AvailableRoom } from '../lib/staffApi';
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The actual front-desk sequence: a guest states what they need (how many
 * people, roughly what kind of room, and when), Reception searches for a
 * room that's genuinely free for that whole window — not just "ready right
 * now" — picks one, then collects the guest's details to assign it. A
 * check-in date in the future creates an advance booking (shows up in
 * Upcoming Arrivals, checked in later from there); today creates an
 * immediate walk-in check-in. Same staff_checkin_new_guest either way — it
 * decides which based on the date. The simpler "I already know which room"
 * case still exists too, per-room, via CheckInModal on Rooms & Floors.
 */
export function NewBookingModal({ propertyId, currency, rooms, onClose, onBooked }: NewBookingModalProps) {
  const [step, setStep] = useState<Step>('search');
  const [partySize, setPartySize] = useState('2');
  const [roomType, setRoomType] = useState('any');
  const [checkIn, setCheckIn] = useState(todayIso());
  const [checkOut, setCheckOut] = useState(tomorrowIso());
  const [selectedRoom, setSelectedRoom] = useState<AvailableRoom | null>(null);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);

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

  const isFutureBooking = checkIn > todayIso();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    setSearchError(null);
    try {
      const results = await searchAvailableRooms(
        propertyId,
        new Date(`${checkIn}T12:00:00`),
        new Date(`${checkOut}T12:00:00`),
        parseInt(partySize, 10) || 1,
        roomType === 'any' ? undefined : roomType
      );
      setAvailableRooms(results);
      setStep('results');
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const handlePickRoom = (room: AvailableRoom) => {
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
        checkIn: new Date(`${checkIn}T14:00:00`),
        checkOut: new Date(`${checkOut}T12:00:00`),
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
              {step === 'success' && (isFutureBooking ? 'Booking Confirmed' : 'Checked In')}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
        </div>

        {step === 'search' && (
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}><Calendar className="w-3 h-3 inline mr-1" />Check-in Date</label>
                <input
                  type="date" value={checkIn} min={todayIso()}
                  onChange={e => {
                    setCheckIn(e.target.value);
                    if (e.target.value >= checkOut) {
                      const d = new Date(`${e.target.value}T00:00:00`); d.setDate(d.getDate() + 1);
                      setCheckOut(d.toISOString().slice(0, 10));
                    }
                  }}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Checkout Date</label>
                <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} min={checkIn} className={inputCls} />
              </div>
            </div>
            {isFutureBooking && (
              <p className="text-[11px] text-[#765a25] bg-[#fff8ec] border border-[#f0dfb8] rounded-lg px-2.5 py-1.5">
                Check-in is in the future — this creates an advance booking, not an immediate check-in. It'll show up in Upcoming Arrivals until they check in.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}><Users className="w-3 h-3 inline mr-1" />Guests</label>
                <input type="number" min={1} value={partySize} onChange={e => setPartySize(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}><BedDouble className="w-3 h-3 inline mr-1" />Room Type</label>
                <select value={roomType} onChange={e => setRoomType(e.target.value)} className={`${inputCls} bg-white`}>
                  <option value="any">Any type</option>
                  {roomTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            {searchError && <p className="text-xs text-red-600">{searchError}</p>}
            <button type="submit" disabled={searching} className="w-full h-11 rounded-lg bg-[#765a25] text-white font-semibold text-sm hover:bg-[#5c4210] disabled:opacity-60 flex items-center justify-center gap-2">
              <Search className="w-4 h-4" /> {searching ? 'Searching…' : 'Search Available Rooms'}
            </button>
          </form>
        )}

        {step === 'results' && (
          <div className="space-y-3">
            <button onClick={() => setStep('search')} className="text-xs font-semibold text-[#765a25] hover:underline flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Adjust search
            </button>
            <p className="text-[11px] text-[#7f7668]">
              {checkIn} &rarr; {checkOut} · {partySize} guest{partySize === '1' ? '' : 's'}{roomType !== 'any' ? ` · ${roomType}` : ''}
            </p>
            {availableRooms.length === 0 ? (
              <p className="text-sm text-[#7f7668] text-center py-10">
                Nothing free for those dates that sleeps {partySize}+{roomType !== 'any' ? ` in "${roomType}"` : ''}. Try adjusting the search.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {availableRooms.map(room => (
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
              Room {selectedRoom.number} · {selectedRoom.type} · {formatCurrency(selectedRoom.pricePerNight, currency)}/night · {checkIn} &rarr; {checkOut}
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
              <UserPlus className="w-4 h-4" />
              {submitting ? 'Saving…' : isFutureBooking ? `Reserve Room ${selectedRoom.number}` : `Assign Room ${selectedRoom.number}`}
            </button>
          </form>
        )}

        {step === 'success' && selectedRoom && (
          <div className="text-center py-4 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-[#2D6A4F] mx-auto" />
            {isFutureBooking ? (
              <>
                <p className="text-base font-bold text-[#141d23]">Room {selectedRoom.number} reserved for {name}</p>
                <p className="text-xs text-[#7f7668]">
                  Arriving {checkIn}. It'll show in Upcoming Arrivals on the Dashboard — check them in from there when they arrive, or cancel it if plans change.
                </p>
                <button onClick={onClose} className="w-full h-10 rounded-lg bg-[#141d23] text-white text-xs font-semibold mt-2">
                  Done
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}
      </div>

      {showQr && selectedRoom && <RoomQrModal roomNumber={selectedRoom.number} roomId={selectedRoom.id} onClose={() => setShowQr(false)} />}
    </div>
  );
}
