import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, Search, X } from 'lucide-react';
import type { Room } from '../../types';
import { BOOKING_CHANNELS, Booking, listBookings } from '../../lib/staffApi';
import { formatCurrency } from '../../lib/currency';
import { NewBookingModal } from '../NewBookingModal';
import { RoomFolioModal } from '../RoomFolioModal';
import { BookingCalendar } from './BookingCalendar';
import { BookingDrawer } from './BookingDrawer';
import { STATUS_CHIP, STATUS_LABEL, addDays, fmtDay, todayIso } from './bookingUtils';

type ListFilter = 'arrivals' | 'in_house' | 'departures' | 'upcoming' | 'closed' | 'all';

const FILTERS: { id: ListFilter; label: string; match: (b: Booking, today: string) => boolean }[] = [
  { id: 'arrivals', label: 'Arriving today', match: (b, t) => b.status === 'upcoming' && b.checkInDate <= t },
  { id: 'in_house', label: 'In house', match: b => b.status === 'checked_in' },
  { id: 'departures', label: 'Leaving today', match: (b, t) => (b.status === 'checked_in' && b.checkOutDate <= t) || (b.status === 'checked_out' && b.checkOutDate === t) },
  { id: 'upcoming', label: 'Upcoming', match: (b, t) => b.status === 'upcoming' && b.checkInDate > t },
  { id: 'closed', label: 'Cancelled & no-shows', match: b => b.status === 'cancelled' || b.status === 'no_show' },
  { id: 'all', label: 'All', match: () => true },
];

const CALENDAR_DAYS = 14;

/**
 * Reservations for a hotel running on Cabadra alone: a calendar of rooms
 * against days, a list by what the desk is doing today (arrivals, in house,
 * departures), and search by name, phone, booking reference or room. Every
 * booking opens the same panel; every empty day on the calendar opens a new
 * booking for that room.
 */
export function BookingsView({ propertyId, propertyName, currency, upiId, rooms, onRefreshRooms }: {
  propertyId: string;
  propertyName: string;
  currency: string;
  upiId?: string;
  rooms: Room[];
  onRefreshRooms: () => void;
}) {
  const [mode, setMode] = useState<'calendar' | 'list'>('calendar');
  const [start, setStart] = useState(() => addDays(todayIso(), -1));
  const [filter, setFilter] = useState<ListFilter>('arrivals');
  const [query, setQuery] = useState('');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [newAt, setNewAt] = useState<{ room?: Room; date?: string } | null>(null);
  const [billFor, setBillFor] = useState<Booking | null>(null);
  const today = todayIso();
  const searching = query.trim().length >= 2;

  const load = useCallback(async () => {
    try {
      const data = searching
        ? await listBookings(propertyId, null, null, query.trim())
        : mode === 'calendar'
          ? await listBookings(propertyId, start, addDays(start, CALENDAR_DAYS))
          : await listBookings(propertyId, addDays(today, -30), addDays(today, 89));
      setBookings(data);
      setError(null);
      // Keep the open panel showing the latest version of its booking.
      setSelected(sel => (sel ? data.find(b => b.id === sel.id) ?? sel : sel));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load bookings.');
    }
  }, [propertyId, mode, start, today, searching, query]);

  useEffect(() => {
    const t = setTimeout(load, searching ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, searching]);

  const listed = useMemo(() => {
    if (!bookings) return [];
    if (searching) return bookings;
    const f = FILTERS.find(x => x.id === filter)!;
    return bookings.filter(b => f.match(b, today)).sort((a, z) => a.checkInDate.localeCompare(z.checkInDate));
  }, [bookings, filter, searching, today]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [f.id, (bookings ?? []).filter(b => f.match(b, today)).length])), [bookings, today]);

  const refreshAll = (updated?: Booking) => {
    if (updated) setSelected(updated);
    load();
    onRefreshRooms();
  };

  return (
    <div className="px-4 sm:px-6 pb-10 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] text-on-surface">Bookings</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, phone, ref, room" className="h-10 w-56 pl-10 pr-9 rounded-full bg-surface-container-lowest border border-outline-variant text-sm text-on-surface focus:outline-none focus:border-on-surface" />
            {query && <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant"><X className="size-4" /></button>}
          </label>
          <div className="flex rounded-full bg-surface-container-low p-1">
            <button onClick={() => setMode('calendar')} className={`h-8 px-3 rounded-full text-sm font-medium inline-flex items-center gap-1.5 ${mode === 'calendar' && !searching ? 'bg-primary text-on-primary' : 'text-on-surface'}`}><CalendarDays className="size-4" /> Calendar</button>
            <button onClick={() => setMode('list')} className={`h-8 px-3 rounded-full text-sm font-medium inline-flex items-center gap-1.5 ${mode === 'list' || searching ? 'bg-primary text-on-primary' : 'text-on-surface'}`}><List className="size-4" /> List</button>
          </div>
          <button onClick={() => setNewAt({})} className="h-10 px-4 rounded-full bg-primary text-on-primary text-sm font-medium inline-flex items-center gap-1.5"><Plus className="size-4" /> New booking</button>
        </div>
      </div>

      {error && <p className="text-sm text-error bg-error/10 rounded-2xl px-4 py-3">{error}</p>}

      {!searching && mode === 'calendar' && (
        <>
          <div className="flex items-center gap-2">
            <button onClick={() => setStart(s => addDays(s, -7))} aria-label="Previous week" className="size-9 rounded-full bg-surface-container-lowest border border-outline-variant flex items-center justify-center"><ChevronLeft className="size-4" /></button>
            <button onClick={() => setStart(addDays(today, -1))} className="h-9 px-4 rounded-full bg-surface-container-lowest border border-outline-variant text-sm font-medium">Today</button>
            <button onClick={() => setStart(s => addDays(s, 7))} aria-label="Next week" className="size-9 rounded-full bg-surface-container-lowest border border-outline-variant flex items-center justify-center"><ChevronRight className="size-4" /></button>
            <input type="date" value={start} onChange={e => e.target.value && setStart(e.target.value)} className="h-9 px-3 rounded-full bg-surface-container-lowest border border-outline-variant text-sm" aria-label="Start date" />
            <p className="text-sm text-on-surface-variant ml-1 hidden sm:block">{fmtDay(start, { day: 'numeric', month: 'long' })} – {fmtDay(addDays(start, CALENDAR_DAYS - 1), { day: 'numeric', month: 'long' })}</p>
          </div>
          {rooms.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Add rooms first (owner dashboard → Rooms).</p>
          ) : (
            <BookingCalendar
              rooms={rooms}
              bookings={bookings ?? []}
              start={start}
              days={CALENDAR_DAYS}
              onOpen={setSelected}
              onNew={(room, date) => setNewAt({ room, date })}
            />
          )}
          <div className="flex flex-wrap gap-4 text-xs text-on-surface-variant">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-6 rounded-full bg-primary" /> In house</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-6 rounded-full bg-surface-container-highest border border-primary/40" /> Expected</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-6 rounded-full bg-surface-container" /> Checked out</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-warning" /> Balance due</span>
            <span>Tap an empty day to book that room.</span>
          </div>
        </>
      )}

      {(searching || mode === 'list') && (
        <>
          {!searching && (
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)} className={`h-9 px-4 rounded-full text-sm font-medium transition-colors ${filter === f.id ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface border border-outline-variant'}`}>
                  {f.label}{f.id !== 'all' && counts[f.id] ? <span className="ml-1.5 opacity-70">{counts[f.id]}</span> : null}
                </button>
              ))}
            </div>
          )}
          {searching && <p className="text-sm text-on-surface-variant">{bookings ? `${listed.length} found for “${query.trim()}”` : 'Searching…'}</p>}
          <div className="rounded-[24px] bg-surface-container-lowest border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {bookings === null ? (
              <p className="p-6 text-sm text-on-surface-variant">Loading…</p>
            ) : listed.length === 0 ? (
              <p className="p-6 text-sm text-on-surface-variant text-center">Nothing here.</p>
            ) : listed.map(b => (
              <button key={b.id} onClick={() => setSelected(b)} className="w-full text-left px-4 sm:px-5 py-3.5 flex items-center gap-4 hover:bg-surface-container-low transition-colors">
                <span className="size-11 rounded-2xl bg-surface-container-low flex flex-col items-center justify-center shrink-0">
                  <span className="text-[10px] text-on-surface-variant leading-none">Room</span>
                  <span className="text-sm font-semibold leading-tight">{b.roomNumber}</span>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="font-medium truncate">{b.guest.name}</span>
                    <span className={`h-5 px-2 rounded-full text-[11px] font-medium inline-flex items-center shrink-0 ${STATUS_CHIP[b.status]}`}>{STATUS_LABEL[b.status]}</span>
                  </span>
                  <span className="block text-xs text-on-surface-variant truncate mt-0.5">
                    {fmtDay(b.checkInDate)} – {fmtDay(b.checkOutDate)} · {b.nights} {b.nights === 1 ? 'night' : 'nights'} · {b.partySize} {b.partySize === 1 ? 'guest' : 'guests'} · {BOOKING_CHANNELS.find(x => x.id === b.channel)?.label}{b.channelDetail ? ` (${b.channelDetail})` : ''} · #{b.ref}
                  </span>
                </span>
                <span className="text-right shrink-0 hidden sm:block">
                  <span className="block text-sm font-medium">{formatCurrency(b.totals.total, currency)}</span>
                  {Math.abs(b.totals.balance) > 0.005 && (
                    <span className={`block text-xs ${b.totals.balance > 0 ? 'text-error' : 'text-warning'}`}>{b.totals.balance > 0 ? `${formatCurrency(b.totals.balance, currency)} due` : `refund ${formatCurrency(-b.totals.balance, currency)}`}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {selected && (
        <BookingDrawer
          booking={selected}
          rooms={rooms}
          currency={currency}
          onClose={() => setSelected(null)}
          onChanged={refreshAll}
          onOpenBill={b => setBillFor(b)}
        />
      )}

      {billFor && (
        <RoomFolioModal
          reservationId={billFor.id}
          roomId={billFor.roomId}
          roomNumber={billFor.roomNumber}
          guestName={billFor.guest.name}
          guestPhone={billFor.guest.phone}
          guestEmail={billFor.guest.email}
          propertyName={propertyName}
          currency={currency}
          upiId={upiId}
          onClose={() => { setBillFor(null); load(); }}
          onCheckedOut={() => { setBillFor(null); refreshAll(); }}
        />
      )}

      {newAt && (
        <NewBookingModal
          propertyId={propertyId}
          currency={currency}
          rooms={rooms}
          initialRoom={newAt.room}
          initialCheckIn={newAt.date}
          onClose={() => setNewAt(null)}
          onBooked={() => refreshAll()}
        />
      )}
    </div>
  );
}
