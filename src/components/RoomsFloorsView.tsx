import React, { useState } from 'react';
import { Room, RoomStatus } from '../types';
import { RoomQrModal } from './RoomQrModal';
import { RoomDetailModal } from './RoomDetailModal';
import { NewBookingModal } from './NewBookingModal';
import { formatCurrency } from '../lib/currency';
import {
  Search, User, Brush, AlertCircle, Star, Wrench, QrCode, CalendarPlus, Users, Bed, Bath,
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
  ready: { tile: 'bg-surface-container-lowest border border-outline-variant hover:border-primary', text: 'text-on-surface', icon: () => <div className="w-2.5 h-2.5 rounded-full bg-room-ready mt-1" /> },
  occupied: { tile: 'bg-room-occupied border-transparent', text: 'text-room-occupied-on', icon: User },
  occupied_vip: { tile: 'bg-room-vip border-2 border-room-occupied', text: 'text-room-vip-on', icon: Star },
  cleaning: { tile: 'bg-room-cleaning border-transparent', text: 'text-room-cleaning-on', icon: Brush },
  dirty: { tile: 'bg-room-dirty border-transparent', text: 'text-room-dirty-on', icon: AlertCircle },
  maintenance: { tile: 'bg-room-maintenance border-transparent', text: 'text-room-maintenance-on', icon: Wrench },
};

/** One line only — these tiles are small on purpose (a floor plan, not a room dossier). Click through to the detail modal for everything else. */
function RoomTileBody({ room, currency }: { room: Room; currency: string }) {
  switch (room.status) {
    case 'occupied':
      return <p className="text-[10px] font-semibold truncate opacity-90">{room.guestName || 'Occupied'}</p>;
    case 'occupied_vip':
      return <p className="text-[10px] font-semibold truncate">{room.guestName || 'VIP'}</p>;
    case 'cleaning':
      return (
        <div className="w-full bg-outline-variant h-1 rounded-full overflow-hidden">
          <div className="bg-on-surface-variant h-full rounded-full transition-all" style={{ width: `${room.cleanProgress || 60}%` }} />
        </div>
      );
    case 'dirty':
      return <p className="text-[11px] font-semibold truncate">{room.issueDescription || 'Needs cleaning'}</p>;
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
  const [occupancyFilter, setOccupancyFilter] = useState<'all' | '1' | '2' | '3+'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedRoomForDetail, setSelectedRoomForDetail] = useState<Room | null>(null);
  const [qrRoom, setQrRoom] = useState<Room | null>(null);
  const [showNewBooking, setShowNewBooking] = useState(false);

  const availableTypes = React.useMemo(() => {
    const set = new Set<string>();
    rooms.forEach(r => { if (r.type) set.add(r.type); });
    return Array.from(set);
  }, [rooms]);

  const filteredRooms = rooms.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (occupancyFilter === '1' && r.maxOccupancy !== 1) return false;
    if (occupancyFilter === '2' && r.maxOccupancy !== 2) return false;
    if (occupancyFilter === '3+' && r.maxOccupancy < 3) return false;
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;

    const matchesNumber = r.number.toLowerCase().includes(q);
    const matchesType = r.type.toLowerCase().includes(q);
    const matchesGuest = r.guestName ? r.guestName.toLowerCase().includes(q) : false;
    const matchesBeds = r.bedsDescription ? r.bedsDescription.toLowerCase().includes(q) : false;
    const matchesBathroom = r.bathroomDetails ? r.bathroomDetails.toLowerCase().includes(q) : false;
    const matchesCapacity = `sleeps ${r.maxOccupancy}`.includes(q) || `${r.maxOccupancy} guest`.includes(q) || `${r.maxOccupancy} person`.includes(q);

    return matchesNumber || matchesType || matchesGuest || matchesBeds || matchesBathroom || matchesCapacity;
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
          <h1 className="text-2xl md:text-3xl font-semibold text-on-surface">Rooms &amp; Floors</h1>
          <p className="text-sm text-on-surface-strong-muted mt-1">
            {hasExternalPms
              ? 'Your PMS handles bookings — tap a ready room to check the guest in here and switch on their QR.'
              : 'Manage every room, bed configuration, bathroom features, and print room-service QRs.'}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search room #, type, beds, jacuzzi, guest..."
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

      {/* Advanced Filter Bar: Capacity, Room Category, and Status Pills */}
      <div className="bg-surface-container-lowest p-3.5 rounded-2xl border border-outline-variant shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Capacity / Guests Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-on-surface flex items-center gap-1 shrink-0">
              <Users className="w-3.5 h-3.5 text-primary" /> Capacity:
            </span>
            <div className="flex bg-surface-container-low p-0.5 rounded-lg border border-outline-variant text-xs">
              <button
                type="button"
                onClick={() => setOccupancyFilter('all')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  occupancyFilter === 'all' ? 'bg-surface-container-lowest text-primary shadow-xs' : 'text-on-surface-variant'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setOccupancyFilter('1')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  occupancyFilter === '1' ? 'bg-surface-container-lowest text-primary shadow-xs' : 'text-on-surface-variant'
                }`}
              >
                1 Person
              </button>
              <button
                type="button"
                onClick={() => setOccupancyFilter('2')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  occupancyFilter === '2' ? 'bg-surface-container-lowest text-primary shadow-xs' : 'text-on-surface-variant'
                }`}
              >
                2 Persons
              </button>
              <button
                type="button"
                onClick={() => setOccupancyFilter('3+')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  occupancyFilter === '3+' ? 'bg-surface-container-lowest text-primary shadow-xs' : 'text-on-surface-variant'
                }`}
              >
                3+ Persons
              </button>
            </div>
          </div>

          {/* Room Category Dropdown */}
          {availableTypes.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-on-surface flex items-center gap-1 shrink-0">
                <Bed className="w-3.5 h-3.5 text-primary" /> Category:
              </span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-8 px-2.5 text-xs bg-surface-container-low border border-outline-variant rounded-lg text-on-surface font-semibold focus:border-primary focus:outline-none cursor-pointer"
              >
                <option value="all">All Categories</option>
                {availableTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {/* Floor Quick Jump */}
          {floors.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-on-surface-strong-muted font-semibold">Jump:</span>
              {floors.map(fl => (
                <button key={fl} onClick={() => scrollToFloor(fl)} className="px-2 py-0.5 rounded bg-surface-container-low text-primary font-semibold hover:bg-surface-container-high">
                  Floor {fl}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status Filter Pills */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-outline-variant/60">
          {([
            ['all', 'All Statuses'],
            ['ready', 'Ready'],
            ['occupied', 'Occupied'],
            ['cleaning', 'Cleaning'],
            ['dirty', 'Dirty'],
            ['maintenance', 'Maintenance'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? 'all' : (key as RoomStatus | 'all'))}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                statusFilter === key ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:border-primary'
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
      </div>

      {/* Floor sections */}
      <div className="space-y-8">
        {floors.map(floor => {
          const floorRooms = filteredRooms.filter(r => r.floor === floor);
          if (floorRooms.length === 0) return null;
          return (
            <section key={floor} id={`floor-section-${floor}`} className="scroll-mt-4">
              <h2 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
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
                          <span className="text-lg font-semibold">{room.number}</span>
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

      {qrRoom && <RoomQrModal roomNumber={qrRoom.number} roomId={qrRoom.id} qrCode={qrRoom.qrCode} onClose={() => setQrRoom(null)} />}

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
