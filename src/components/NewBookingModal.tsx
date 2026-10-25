import React, { useMemo, useState } from 'react';
import { Search, Users, BedDouble, Calendar, ArrowLeft, X, CheckCircle2, QrCode, UserPlus } from 'lucide-react';
import { Room } from '../types';
import { checkInNewGuest, searchAvailableRooms, AvailableRoom, BOOKING_CHANNELS, BookingChannel } from '../lib/staffApi';
import { formatCurrency } from '../lib/currency';
import { ImageUploadField } from './ImageUploadField';
import { RoomQrModal } from './RoomQrModal';

interface NewBookingModalProps {
  propertyId: string;
  currency: string;
  rooms: Room[];
  onClose: () => void;
  onBooked: () => void;
  /** Opened from an empty calendar cell: that room and arrival date, straight to the guest's details. */
  initialRoom?: Room;
  initialCheckIn?: string;
}

type Step = 'search' | 'results' | 'details' | 'success';

const inputCls = 'w-full h-10 px-3 text-sm border border-outline-variant rounded-lg focus:border-primary focus:outline-none';
const labelCls = 'text-[11px] font-bold text-on-surface-variant block mb-1';

/** YYYY-MM-DD in the desk's own timezone (toISOString would give UTC's date, yesterday before 5:30 am in India). */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayIso(): string {
  return localIso(new Date());
}

function dayAfter(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return localIso(d);
}

function tomorrowIso(): string {
  return dayAfter(todayIso());
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
export function NewBookingModal({ propertyId, currency, rooms, onClose, onBooked, initialRoom, initialCheckIn }: NewBookingModalProps) {
  const [step, setStep] = useState<Step>(initialRoom ? 'details' : 'search');
  const [partySize, setPartySize] = useState('2');
  const [roomType, setRoomType] = useState('any');
  const [checkIn, setCheckIn] = useState(initialCheckIn ?? todayIso());
  const [checkOut, setCheckOut] = useState(initialCheckIn ? dayAfter(initialCheckIn) : tomorrowIso());
  const [selectedRoom, setSelectedRoom] = useState<AvailableRoom | null>(
    initialRoom
      ? { id: initialRoom.id, number: initialRoom.number, type: initialRoom.type, floor: initialRoom.floor, maxOccupancy: initialRoom.maxOccupancy, pricePerNight: initialRoom.pricePerNight, image: initialRoom.image }
      : null
  );
  const [channel, setChannel] = useState<BookingChannel>((initialCheckIn ?? todayIso()) > todayIso() ? 'phone' : 'walk_in');
  const [channelDetail, setChannelDetail] = useState('');
  const [notes, setNotes] = useState('');

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [vip, setVip] = useState(false);
  const [idDocumentUrl, setIdDocumentUrl] = useState('');
  // The rate agreed for this stay; starts at the room's listed price and goes on the bill each night.
  const [rate, setRate] = useState(initialRoom ? String(initialRoom.pricePerNight ?? '') : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const roomTypes = useMemo(
    () => Array.from(rooms.reduce((set, r) => set.add(r.type), new Set<string>())).sort(),
    [rooms]
  );

  const isFutureBooking = checkIn > todayIso();
  const nights = Math.max(1, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000));

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
    setRate(String(room.pricePerNight ?? ''));
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
        ratePerNight: rate.trim() === '' ? undefined : Math.max(0, parseFloat(rate) || 0),
        channel,
        channelDetail: channelDetail.trim() || undefined,
        notes: notes.trim() || undefined,
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
      <div className="bg-surface-container-lowest rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-outline-variant space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant">
          <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider">New Booking</p>
            <h3 className="text-lg font-bold text-on-surface">
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
              <p className="text-[11px] text-primary bg-highlight border border-warning rounded-lg px-2.5 py-1.5">
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
                <select value={roomType} onChange={e => setRoomType(e.target.value)} className={`${inputCls} bg-surface-container-lowest`}>
                  <option value="any">Any type</option>
                  {roomTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            {searchError && <p className="text-xs text-red-600">{searchError}</p>}
            <button type="submit" disabled={searching} className="w-full h-11 rounded-lg bg-primary text-on-primary font-semibold text-sm hover:bg-primary-hover disabled:opacity-60 flex items-center justify-center gap-2">
              <Search className="w-4 h-4" /> {searching ? 'Searching…' : 'Search Available Rooms'}
            </button>
          </form>
        )}

        {step === 'results' && (
          <div className="space-y-3">
            <button onClick={() => setStep('search')} className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Adjust search
            </button>
            <p className="text-[11px] text-on-surface-variant">
              {checkIn} &rarr; {checkOut} · {partySize} guest{partySize === '1' ? '' : 's'}{roomType !== 'any' ? ` · ${roomType}` : ''}
            </p>
            {availableRooms.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-10">
                Nothing free for those dates that sleeps {partySize}+{roomType !== 'any' ? ` in "${roomType}"` : ''}. Try adjusting the search.
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {availableRooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => handlePickRoom(room)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-outline-variant hover:border-primary hover:bg-highlight text-left transition-colors"
                  >
                    <div>
                      <p className="text-sm font-bold text-on-surface">Room {room.number} · {room.type}</p>
                      <p className="text-[11px] text-on-surface-variant">Floor {room.floor} · Sleeps {room.maxOccupancy}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-bold text-success">{formatCurrency(room.pricePerNight, currency)}</p>
                      <p className="text-[10px] text-on-surface-variant">/ night</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'details' && selectedRoom && (
          <form onSubmit={handleAssign} className="space-y-3">
            <button type="button" onClick={() => setStep(availableRooms.length ? 'results' : 'search')} className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Choose a different room
            </button>
            <div className="bg-surface-container-low p-2.5 rounded-lg border border-outline-variant text-xs text-on-surface-variant">
              Room {selectedRoom.number} · {selectedRoom.type} · {formatCurrency(selectedRoom.pricePerNight, currency)}/night · {checkIn} &rarr; {checkOut}
            </div>

            {initialRoom && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Arrival</label>
                  <input type="date" value={checkIn} onChange={e => { setCheckIn(e.target.value); if (checkOut <= e.target.value) setCheckOut(dayAfter(e.target.value)); }} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Departure</label>
                  <input type="date" min={dayAfter(checkIn)} value={checkOut} onChange={e => setCheckOut(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Guests</label>
                  <input type="number" min={1} max={selectedRoom.maxOccupancy || 20} value={partySize} onChange={e => setPartySize(e.target.value)} className={inputCls} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className={labelCls}>Rate per night ({currency})</label>
                <input type="number" min="0" step="1" value={rate} onChange={e => setRate(e.target.value)} className={inputCls} />
              </div>
              <p className="text-xs text-on-surface-variant pb-2.5">
                {nights} {nights === 1 ? 'night' : 'nights'} · {formatCurrency((parseFloat(rate) || 0) * nights, currency)} before tax
                {parseFloat(rate) !== selectedRoom.pricePerNight && rate !== '' && <span className="block">Listed at {formatCurrency(selectedRoom.pricePerNight, currency)}</span>}
              </p>
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
            <div>
              <label className={labelCls}>Booked via</label>
              <div className="flex flex-wrap gap-1.5">
                {BOOKING_CHANNELS.map(c => (
                  <button key={c.id} type="button" onClick={() => setChannel(c.id)} className={`h-8 px-3 rounded-full text-xs font-semibold transition-colors ${channel === c.id ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              {(channel === 'ota' || channel === 'agent' || channel === 'other') && (
                <input value={channelDetail} onChange={e => setChannelDetail(e.target.value)} maxLength={60} placeholder={channel === 'ota' ? 'Booking.com, MakeMyTrip, Airbnb…' : channel === 'agent' ? 'Agent or company name' : 'Where from?'} className={`${inputCls} mt-2`} />
              )}
            </div>
            <div>
              <label className={labelCls}>Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={2} placeholder="Late arrival, extra bed, anniversary…" className={`${inputCls} h-auto py-2`} />
            </div>
            <ImageUploadField label="ID Document (optional)" value={idDocumentUrl} onChange={setIdDocumentUrl} />
            <label className="flex items-center gap-2 text-xs font-semibold text-on-surface">
              <input type="checkbox" checked={vip} onChange={e => setVip(e.target.checked)} className="accent-primary" />
              VIP guest
            </label>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button type="submit" disabled={submitting || !name.trim()} className="w-full h-11 rounded-lg bg-primary text-on-primary font-semibold text-sm hover:bg-primary-hover disabled:opacity-60 flex items-center justify-center gap-2">
              <UserPlus className="w-4 h-4" />
              {submitting ? 'Saving…' : isFutureBooking ? `Reserve Room ${selectedRoom.number}` : `Assign Room ${selectedRoom.number}`}
            </button>
          </form>
        )}

        {step === 'success' && selectedRoom && (
          <div className="text-center py-4 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
            {isFutureBooking ? (
              <>
                <p className="text-base font-bold text-on-surface">Room {selectedRoom.number} reserved for {name}</p>
                <p className="text-xs text-on-surface-variant">
                  Arriving {checkIn}. It'll show in Upcoming Arrivals on the Dashboard — check them in from there when they arrive, or cancel it if plans change.
                </p>
                <button onClick={onClose} className="w-full h-10 rounded-lg bg-on-surface text-inverse-on-surface text-xs font-semibold mt-2">
                  Done
                </button>
              </>
            ) : (
              <>
                <p className="text-base font-bold text-on-surface">Room {selectedRoom.number} assigned to {name}</p>
                <p className="text-xs text-on-surface-variant">
                  Their folio starts now and runs through checkout — every order and request on this room belongs to them until then.
                </p>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setShowQr(true)}
                    className="flex-1 h-10 rounded-lg border border-primary text-primary text-xs font-bold hover:bg-highlight flex items-center justify-center gap-1.5"
                  >
                    <QrCode className="w-3.5 h-3.5" /> Room Key (QR)
                  </button>
                  <button onClick={onClose} className="flex-1 h-10 rounded-lg bg-on-surface text-inverse-on-surface text-xs font-semibold">
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
