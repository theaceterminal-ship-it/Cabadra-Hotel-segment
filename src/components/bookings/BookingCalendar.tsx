import React, { useMemo } from 'react';
import { Crown, Wrench } from 'lucide-react';
import type { Room } from '../../types';
import type { Booking } from '../../lib/staffApi';
import { addDays, daysBetween, fmtDay, holdsRoom, todayIso } from './bookingUtils';

const DAY_W = 64;
const ROOM_W = 128;
const ROW_H = 52;

/**
 * The tape chart: rooms down the side, days across, each booking a bar
 * from the afternoon it arrives to the morning it leaves (so back-to-back
 * stays share a day without overlapping). Tap a bar to open the booking,
 * an empty day to book that room from that day.
 */
export function BookingCalendar({ rooms, bookings, start, days, onOpen, onNew }: {
  rooms: Room[];
  bookings: Booking[];
  start: string;
  days: number;
  onOpen: (b: Booking) => void;
  onNew: (room: Room, date: string) => void;
}) {
  const today = todayIso();
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(start, i)), [start, days]);
  const sorted = useMemo(() => [...rooms].sort((a, b) => a.floor - b.floor || a.number.localeCompare(b.number, undefined, { numeric: true })), [rooms]);
  const byRoom = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      if (!holdsRoom(b)) continue;
      m.set(b.roomId, [...(m.get(b.roomId) ?? []), b]);
    }
    return m;
  }, [bookings]);

  // Rooms taken each night: a booking holds a room from its arrival date up to the night before departure.
  const occupied = dates.map(d => bookings.filter(b => holdsRoom(b) && b.checkInDate <= d && b.checkOutDate > d).length);

  return (
    <div className="w-fit max-w-full rounded-[24px] bg-surface-container-lowest border border-outline-variant overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ width: ROOM_W + DAY_W * days }}>
          {/* Day header */}
          <div className="flex sticky top-0 z-20 bg-surface-container-lowest border-b border-outline-variant">
            <div className="shrink-0 sticky left-0 z-10 bg-surface-container-lowest border-r border-outline-variant px-4 flex items-end pb-2 text-xs text-on-surface-variant" style={{ width: ROOM_W }}>Room</div>
            {dates.map(d => {
              const isToday = d === today;
              const weekend = [0, 6].includes(new Date(`${d}T12:00:00`).getDay());
              return (
                <div key={d} className={`shrink-0 text-center py-2 border-r border-outline-variant/60 ${weekend ? 'bg-surface-container-low/60' : ''}`} style={{ width: DAY_W }}>
                  <p className="text-[10px] uppercase text-on-surface-variant">{fmtDay(d, { weekday: 'short' })}</p>
                  <p className={`mx-auto mt-0.5 size-7 rounded-full flex items-center justify-center text-sm font-semibold ${isToday ? 'bg-primary text-on-primary' : 'text-on-surface'}`}>{fmtDay(d, { day: 'numeric' })}</p>
                </div>
              );
            })}
          </div>

          {sorted.map(room => (
            <div key={room.id} className="flex border-b border-outline-variant/60 last:border-b-0">
              <div className="shrink-0 sticky left-0 z-10 bg-surface-container-lowest border-r border-outline-variant px-4 flex flex-col justify-center" style={{ width: ROOM_W, height: ROW_H }}>
                <p className="text-sm font-semibold text-on-surface flex items-center gap-1">
                  {room.number}
                  {room.status === 'maintenance' && <Wrench className="size-3 text-warning" aria-label="Maintenance" />}
                </p>
                <p className="text-[11px] text-on-surface-variant truncate">{room.type}</p>
              </div>
              <div className="relative flex" style={{ height: ROW_H }}>
                {dates.map(d => (
                  <button
                    key={d}
                    disabled={d < today || room.status === 'maintenance'}
                    onClick={() => onNew(room, d)}
                    aria-label={`Book room ${room.number} from ${fmtDay(d)}`}
                    className={`shrink-0 border-r border-outline-variant/40 transition-colors enabled:hover:bg-primary/5 disabled:cursor-default ${d === today ? 'bg-primary/[0.04]' : ''}`}
                    style={{ width: DAY_W, height: ROW_H }}
                  />
                ))}
                {(byRoom.get(room.id) ?? []).map(b => {
                  const startPos = daysBetween(start, b.checkInDate) + 0.5;
                  const endPos = daysBetween(start, b.checkOutDate) + 0.5;
                  const left = Math.max(startPos, 0);
                  const right = Math.min(endPos, days);
                  if (right <= 0 || left >= days) return null;
                  const owes = b.totals.balance > 0.005;
                  const tone = b.status === 'checked_in'
                    ? 'bg-primary text-on-primary'
                    : b.status === 'upcoming'
                      ? 'bg-surface-container-highest text-on-surface border border-primary/40'
                      : 'bg-surface-container text-on-surface-variant';
                  return (
                    <button
                      key={b.id}
                      onClick={() => onOpen(b)}
                      title={`${b.guest.name} · ${fmtDay(b.checkInDate)} – ${fmtDay(b.checkOutDate)}`}
                      className={`absolute top-1.5 bottom-1.5 rounded-full px-3 text-left text-xs font-medium flex items-center gap-1.5 overflow-hidden shadow-sm hover:brightness-95 ${tone} ${startPos < 0 ? 'rounded-l-md' : ''} ${endPos > days ? 'rounded-r-md' : ''}`}
                      style={{ left: left * DAY_W + 2, width: (right - left) * DAY_W - 4 }}
                    >
                      {b.guest.vip && <Crown className="size-3 shrink-0" />}
                      <span className="truncate">{b.guest.name}</span>
                      {owes && b.status !== 'checked_out' && <span className="size-1.5 rounded-full bg-warning shrink-0" title="Balance due" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Occupancy per night */}
          <div className="flex bg-surface-container-low/60 border-t border-outline-variant">
            <div className="shrink-0 sticky left-0 z-10 bg-surface-container-low px-4 flex items-center text-xs text-on-surface-variant border-r border-outline-variant" style={{ width: ROOM_W, height: 36 }}>Occupied</div>
            {occupied.map((n, i) => (
              <div key={dates[i]} className="shrink-0 text-center text-xs flex items-center justify-center border-r border-outline-variant/40" style={{ width: DAY_W, height: 36 }}>
                <span className={n >= sorted.length && sorted.length > 0 ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}>{n}/{sorted.length}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
