import React, { useState } from 'react';
import { Room, RoomStatus } from '../types';
import { RoomQrModal } from './RoomQrModal';
import { RoomDetailModal } from './RoomDetailModal';
import { NewBookingModal } from './NewBookingModal';
import { formatCurrency } from '../lib/currency';
import {
  Search, User, Brush, AlertCircle, Star, Wrench, QrCode, CalendarPlus,
} from 'lucide-react';

interface RoomsFloorsViewProps {
  propertyId: string;
  propertyName: string;
  currency: string;
  upiId?: string;
  /** true = this hotel runs its own PMS — New Booking (availability search/advance booking) is hidden; tapping a room here to check someone in is the whole flow, and records source: 'imported'. */
  hasExternalPms: boolean;
  rooms: Room[];
  onUpdateRoom: (updated: Room) => void;
  onOpenNewRequest: () => void;
  /** Re-fetches rooms from Supabase — called after a checkout settles or a new check-in, since both change reservation state beyond what the optimistic onUpdateRoom patch covers. */
  onRefreshRooms: () => void;
}

/** One room tile's look, keyed by status — kept as data instead of a JSX switch so a floor section is just `rooms.map(tile)`. */
const STATUS_STYLE: Record<RoomStatus, { tile: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  ready: { tile: 'bg-surface-container-lowest border border-outline-variant hover:border-primary', text: 'text-on-surface', icon: () => <div className="w-2.5 h-2.5 rounded-full bg-[#d2dbe4] border border-[#d1c5b5] mt-1" /> },
  occupied: { tile: 'bg-[#bd9b60] border-transparent', text: 'text-[#4a3301]', icon: User },
  occupied_vip: { tile: 'bg-[#bd9b60] border-2 border-primary shadow-[0_0_15px_rgba(189,155,96,0.35)]', text: 'text-[#4a3301]', icon: Star },
  cleaning: { tile: 'bg-[#e2e2e5] border-transparent', text: 'text-[#636467]', icon: Brush },
  dirty: { tile: 'bg-error-container border-transparent', text: 'text-on-error-container', icon: AlertCircle },
  maintenance: { tile: 'bg-[#9ea0a1] border-transparent', text: 'text-[#343738]', icon: Wrench },
};

/** One line only — these tiles are small on purpose (a floor plan, not a room dossier). Click through to the detail modal for everything else. */
function RoomTileBody({ room, currency }: { room: Room; currency: string }) {
  switch (room.status) {
    case 'occupied':
      return <p className="text-[10px] font-semibold truncate opacity-90">{room.guestName || 'Occupied'}</p>;
    case 'occupied_vip':
      return <p className="text-[10px] font-bold truncate">{room.guestName || 'VIP'}</p>;
    case 'cleaning':
      return (
        <div className="w-full bg-[#c6c6c9] h-1 rounded-full overflow-hidden">
          <div className="bg-[#636467] h-full rounded-full transition-all" style={{ width: `${room.cleanProgress || 60}%` }} />
        </div>
      );
    case 'dirty':
      return <p className="text-[10px] font-semibold truncate text-on-error-container">{room.issueDescription || 'Requires service'}</p>;
    case 'maintenance':
      return <p className="text-[10px] font-semibold truncate">ETA {room.maintenanceEta || 'TBD'}</p>;
    default:
      return <p className="text-[10px] text-success font-semibold truncate">{formatCurrency(room.pricePerNight, currency)}</p>;
  }
}

/**
 * The detailed, room-by-room console — what used to be the entire Reception
 * landing page is now its own tab, so the Dashboard can stay simple while
 * this stays as powerful as front-desk work actually needs.
 */
export const RoomsFloorsView: React.FC<RoomsFloorsViewProps> = ({ propertyId, propertyName, currency, upiId, hasExternalPms, rooms, onUpdateRoom, onRefreshRooms }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RoomStatus | 'all'>('all');
  const [selectedRoomForDetail, setSelectedRoomForDetail] = useState<Room | null>(null);
  const [qrRoom, setQrRoom] = useState<Room | null>(null);
  const [showNewBooking, setShowNewBooking] = useState(false);

  const filteredRooms = rooms.filter((r) => {
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchesSearch =
      r.number.includes(searchQuery) ||
      r.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.guestName && r.guestName.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  const floors: number[] = rooms
    .map(r => r.floor)
    .filter((floor, index, all) => all.indexOf(floor) === index)
    .sort((a, b) => a - b);
  const counts: Record<RoomStatus | 'all', number> = {
    all: rooms.length,
    ready: rooms.filter(r => r.status === 'ready').length,
    occupied: rooms.filter(r => r.status === 'occupied' || r.status === 'occupied_vip').length,
    occupied_vip: 0,
    cleaning: rooms.filter(r => r.status === 'cleaning').length,
    dirty: rooms.filter(r => r.status === 'dirty').length,
    maintenance: rooms.filter(r => r.status === 'maintenance').length,
  };

  const scrollToFloor = (floor: number) => {
    document.getElementById(`floor-section-${floor}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-on-surface">Rooms & Floors</h1>
          {/* text-on-surface-strong-muted, not -variant: this sits directly
              on the page's own bg-surface (a saturated color in both themes,
              see index.css's comment on that token), not inside a white
              card — -variant/text-on-surface-variant read as ~1.2:1 contrast there,
              functionally invisible. */}
          <p className="text-sm text-on-surface-strong-muted mt-1">
            {hasExternalPms
              ? 'Your PMS handles bookings — tap a ready room to check the guest in here and switch on their QR.'
              : 'Manage every room, and print a room-service QR for the door.'}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search room, type or guest..."
              className="w-full h-10 pl-9 pr-3 bg-surface-container-lowest border border-outline-variant rounded-lg text-xs focus:outline-none focus:border-primary"
            />
          </div>
          {!hasExternalPms && (
            <button
              onClick={() => setShowNewBooking(true)}
              className="h-10 px-3 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <CalendarPlus className="w-4 h-4" /> New Booking
            </button>
          )}
        </div>
      </div>

      {/* Status filter pills + floor quick-nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {([
            ['all', 'All', '#4e463a'],
            ['ready', 'Ready', '#4e463a'],
            ['occupied', 'Occupied', '#4a3301'],
            ['cleaning', 'Cleaning', '#636467'],
            ['dirty', 'Dirty', '#93000a'],
            ['maintenance', 'Maintenance', '#343738'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? 'all' : (key as RoomStatus | 'all'))}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                statusFilter === key ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:border-primary'
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
        {floors.length > 1 && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-on-surface-strong-muted font-semibold">Jump to:</span>
            {floors.map(fl => (
              <button key={fl} onClick={() => scrollToFloor(fl)} className="px-2.5 py-1 rounded bg-surface-container-low text-primary font-bold hover:bg-[#dbe4ed]">
                {fl}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floor sections */}
      <div className="space-y-8">
        {floors.map(floor => {
          const floorRooms = filteredRooms.filter(r => r.floor === floor);
          if (floorRooms.length === 0) return null;
          return (
            <section key={floor} id={`floor-section-${floor}`} className="scroll-mt-4">
              <h2 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
                Floor {floor}
                <span className="text-on-surface-strong-muted font-medium">({floorRooms.length} room{floorRooms.length === 1 ? '' : 's'})</span>
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {floorRooms.map(room => {
                  const style = STATUS_STYLE[room.status];
                  const Icon = style.icon;
                  return (
                    <div key={room.id} className="relative aspect-square">
                      <button
                        onClick={() => setSelectedRoomForDetail(room)}
                        title={room.type}
                        className={`w-full h-full rounded-xl p-2.5 text-left transition-all shadow-2xs hover:brightness-95 flex flex-col justify-between ${style.tile} ${style.text}`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-lg font-bold">{room.number}</span>
                          <Icon className="w-3.5 h-3.5 opacity-80 shrink-0" />
                        </div>
                        <RoomTileBody room={room} currency={currency} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setQrRoom(room); }}
                        title="Generate room-service QR"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface-container-lowest border border-outline-variant flex items-center justify-center text-primary hover:bg-highlight shadow-2xs"
                      >
                        <QrCode className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {filteredRooms.length === 0 && (
          <p className="text-sm text-on-surface-strong-muted text-center py-16">No rooms match your search/filter.</p>
        )}
      </div>

      {selectedRoomForDetail && (
        <RoomDetailModal
          propertyId={propertyId}
          propertyName={propertyName}
          currency={currency}
          upiId={upiId}
          hasExternalPms={hasExternalPms}
          room={selectedRoomForDetail}
          onClose={() => setSelectedRoomForDetail(null)}
          onUpdateRoom={onUpdateRoom}
          onRefreshRooms={onRefreshRooms}
        />
      )}

      {qrRoom && <RoomQrModal roomNumber={qrRoom.number} roomId={qrRoom.id} onClose={() => setQrRoom(null)} />}

      {!hasExternalPms && showNewBooking && (
        <NewBookingModal
          propertyId={propertyId}
          currency={currency}
          rooms={rooms}
          onClose={() => setShowNewBooking(false)}
          onBooked={onRefreshRooms}
        />
      )}
    </div>
  );
};
