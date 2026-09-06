import React, { useState } from 'react';
import { Room, RoomStatus } from '../types';
import { GuestLinkCard } from './GuestLinkCard';
import { RoomFolioModal } from './RoomFolioModal';
import { RoomQrModal } from './RoomQrModal';
import { CheckInModal } from './CheckInModal';
import { NewBookingModal } from './NewBookingModal';
import { formatCurrency } from '../lib/currency';
import {
  Search, User, Brush, AlertCircle, Star, Wrench, QrCode, Receipt, UserPlus, FileText, Phone, Mail, CalendarPlus,
} from 'lucide-react';

interface RoomsFloorsViewProps {
  propertyId: string;
  currency: string;
  rooms: Room[];
  onUpdateRoom: (updated: Room) => void;
  onOpenNewRequest: () => void;
  /** Re-fetches rooms from Supabase — called after a checkout settles or a new check-in, since both change reservation state beyond what the optimistic onUpdateRoom patch covers. */
  onRefreshRooms: () => void;
}

/** Rooms that can actually accept a new check-in — matches staff_checkin_new_guest's own allowed-status check (0013_guest_checkin.sql). */
const CHECKINABLE_STATUSES: RoomStatus[] = ['ready', 'dirty', 'cleaning'];

/** One room tile's look, keyed by status — kept as data instead of a JSX switch so a floor section is just `rooms.map(tile)`. */
const STATUS_STYLE: Record<RoomStatus, { tile: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  ready: { tile: 'bg-white border border-[#E9ECEF] hover:border-[#765a25]', text: 'text-[#141d23]', icon: () => <div className="w-2.5 h-2.5 rounded-full bg-[#d2dbe4] border border-[#d1c5b5] mt-1" /> },
  occupied: { tile: 'bg-[#bd9b60] border-transparent', text: 'text-[#4a3301]', icon: User },
  occupied_vip: { tile: 'bg-[#bd9b60] border-2 border-[#765a25] shadow-[0_0_15px_rgba(189,155,96,0.35)]', text: 'text-[#4a3301]', icon: Star },
  cleaning: { tile: 'bg-[#e2e2e5] border-transparent', text: 'text-[#636467]', icon: Brush },
  dirty: { tile: 'bg-[#ffdad6] border-transparent', text: 'text-[#93000a]', icon: AlertCircle },
  maintenance: { tile: 'bg-[#9ea0a1] border-transparent', text: 'text-[#343738]', icon: Wrench },
};

function RoomTileBody({ room, currency }: { room: Room; currency: string }) {
  switch (room.status) {
    case 'occupied':
      return (
        <>
          <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wider mb-0.5">{room.type}</p>
          <p className="text-sm font-semibold truncate">{room.guestName || 'Occupied'}</p>
          <p className="text-[11px] opacity-75 mt-0.5">{room.checkoutInfo || 'In House'}</p>
        </>
      );
    case 'occupied_vip':
      return (
        <>
          <p className="text-[10px] font-bold opacity-90 uppercase tracking-wider mb-0.5">{room.type}</p>
          <p className="text-sm font-bold truncate">{room.guestName}</p>
          <p className="text-[11px] font-bold text-[#765a25] mt-0.5">{room.checkoutInfo || 'VIP Guest'}</p>
        </>
      );
    case 'cleaning':
      return (
        <>
          <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wider mb-1">{room.type}</p>
          <div className="w-full bg-[#c6c6c9] h-1.5 rounded-full mb-1 overflow-hidden">
            <div className="bg-[#636467] h-full rounded-full transition-all" style={{ width: `${room.cleanProgress || 60}%` }} />
          </div>
          <p className="text-[11px] opacity-80 mt-0.5">{room.notes || 'In progress'}</p>
        </>
      );
    case 'dirty':
      return (
        <>
          <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wider mb-0.5">{room.type}</p>
          <p className="text-sm font-semibold">{room.issueDescription || 'Checkout Done'}</p>
          <p className="text-[11px] font-medium mt-0.5 text-[#BC4749]">{room.notes || 'Requires service'}</p>
        </>
      );
    case 'maintenance':
      return (
        <>
          <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wider mb-0.5">{room.type}</p>
          <p className="text-sm font-semibold">{room.issueDescription || 'Maintenance issue'}</p>
          <p className="text-[11px] opacity-80 mt-0.5">ETA: {room.maintenanceEta || 'TBD'}</p>
        </>
      );
    default:
      return (
        <>
          <p className="text-[10px] font-semibold text-[#7f7668] uppercase tracking-wider mb-0.5">{room.type}</p>
          <p className="text-sm font-medium">Available</p>
          <p className="text-[11px] text-[#2D6A4F] font-semibold mt-0.5">{formatCurrency(room.pricePerNight, currency)}/night</p>
        </>
      );
  }
}

/**
 * The detailed, room-by-room console — what used to be the entire Reception
 * landing page is now its own tab, so the Dashboard can stay simple while
 * this stays as powerful as front-desk work actually needs.
 */
export const RoomsFloorsView: React.FC<RoomsFloorsViewProps> = ({ propertyId, currency, rooms, onUpdateRoom, onRefreshRooms }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RoomStatus | 'all'>('all');
  const [selectedRoomForDetail, setSelectedRoomForDetail] = useState<Room | null>(null);
  const [showFolio, setShowFolio] = useState(false);
  const [qrRoom, setQrRoom] = useState<Room | null>(null);
  const [checkInRoom, setCheckInRoom] = useState<Room | null>(null);
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
          <h1 className="text-2xl md:text-3xl font-semibold text-[#141d23]">Rooms & Floors</h1>
          <p className="text-sm text-[#4e463a] mt-1">Manage every room, and print a room-service QR for the door.</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#7f7668]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search room, type or guest..."
              className="w-full h-10 pl-9 pr-3 bg-white border border-[#E9ECEF] rounded-lg text-xs focus:outline-none focus:border-[#765a25]"
            />
          </div>
          <button
            onClick={() => setShowNewBooking(true)}
            className="h-10 px-3 rounded-lg bg-[#765a25] text-white text-xs font-semibold hover:bg-[#5c4210] flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <CalendarPlus className="w-4 h-4" /> New Booking
          </button>
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
                statusFilter === key ? 'bg-[#765a25] text-white border-[#765a25]' : 'bg-white border-[#E9ECEF] text-[#4e463a] hover:border-[#765a25]'
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
        {floors.length > 1 && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[#7f7668] font-semibold">Jump to:</span>
            {floors.map(fl => (
              <button key={fl} onClick={() => scrollToFloor(fl)} className="px-2.5 py-1 rounded bg-[#ecf5fe] text-[#765a25] font-bold hover:bg-[#dbe4ed]">
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
              <h2 className="text-sm font-bold text-[#141d23] mb-3 flex items-center gap-2">
                Floor {floor}
                <span className="text-[#7f7668] font-medium">({floorRooms.length} room{floorRooms.length === 1 ? '' : 's'})</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {floorRooms.map(room => {
                  const style = STATUS_STYLE[room.status];
                  const Icon = style.icon;
                  return (
                    <div key={room.id} className="relative aspect-square">
                      <button
                        onClick={() => setSelectedRoomForDetail(room)}
                        className={`w-full h-full rounded-xl p-3.5 text-left transition-all shadow-2xs hover:brightness-95 flex flex-col justify-between ${style.tile} ${style.text}`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-xl font-bold">{room.number}</span>
                          <Icon className="w-4 h-4 opacity-80" />
                        </div>
                        <div><RoomTileBody room={room} currency={currency} /></div>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setQrRoom(room); }}
                        title="Generate room-service QR"
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 border border-[#E9ECEF] flex items-center justify-center text-[#765a25] hover:bg-white shadow-2xs"
                      >
                        <QrCode className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {filteredRooms.length === 0 && (
          <p className="text-sm text-[#7f7668] text-center py-16">No rooms match your search/filter.</p>
        )}
      </div>

      {/* Room Detail & Status Control Modal */}
      {selectedRoomForDetail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E9ECEF] space-y-4">
            <div className="flex justify-between items-start pb-3 border-b border-[#E9ECEF]">
              <div>
                <span className="text-[10px] font-bold text-[#765a25] uppercase tracking-wider">
                  Floor {selectedRoomForDetail.floor} • Room Details
                </span>
                <h3 className="text-2xl font-bold text-[#141d23]">Room {selectedRoomForDetail.number}</h3>
                <p className="text-xs text-[#7f7668]">{selectedRoomForDetail.type}</p>
              </div>
              <button onClick={() => setSelectedRoomForDetail(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1">&times;</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-[#f6faff] p-3 rounded-lg border border-[#E9ECEF] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#7f7668]">Current Status:</span>
                  <span className="font-bold text-[#141d23] uppercase">{selectedRoomForDetail.status}</span>
                </div>
                {selectedRoomForDetail.guestName && (
                  <div className="flex justify-between">
                    <span className="text-[#7f7668]">Guest Name:</span>
                    <span className="font-bold text-[#141d23]">{selectedRoomForDetail.guestName}</span>
                  </div>
                )}
                {selectedRoomForDetail.notes && (
                  <div className="flex justify-between">
                    <span className="text-[#7f7668]">Notes / Issue:</span>
                    <span className="font-medium text-[#BC4749]">{selectedRoomForDetail.notes}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#7f7668]">Standard Rate:</span>
                  <span className="font-bold text-[#2D6A4F]">{formatCurrency(selectedRoomForDetail.pricePerNight, currency)} / night</span>
                </div>
              </div>

              {/* Guest profile — only exists once a real check-in created it (staff_checkin_new_guest); this is exactly what ties the room's durable QR to a specific person until checkout. */}
              {(selectedRoomForDetail.guestPhone || selectedRoomForDetail.guestEmail || selectedRoomForDetail.guestIdDocumentUrl) && (
                <div className="bg-[#f6faff] p-3 rounded-lg border border-[#E9ECEF] space-y-1.5">
                  <p className="text-[10px] font-bold text-[#4e463a] uppercase tracking-wider">Guest Profile</p>
                  {selectedRoomForDetail.guestPhone && (
                    <div className="flex items-center gap-1.5 text-[#141d23]"><Phone className="w-3 h-3 text-[#7f7668]" /> {selectedRoomForDetail.guestPhone}</div>
                  )}
                  {selectedRoomForDetail.guestEmail && (
                    <div className="flex items-center gap-1.5 text-[#141d23]"><Mail className="w-3 h-3 text-[#7f7668]" /> {selectedRoomForDetail.guestEmail}</div>
                  )}
                  {selectedRoomForDetail.guestIdDocumentUrl && (
                    <a href={selectedRoomForDetail.guestIdDocumentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[#765a25] font-semibold hover:underline">
                      <FileText className="w-3 h-3" /> View ID document
                    </a>
                  )}
                </div>
              )}

              {selectedRoomForDetail.guestToken && <GuestLinkCard guestToken={selectedRoomForDetail.guestToken} />}

              {CHECKINABLE_STATUSES.includes(selectedRoomForDetail.status) && (
                <button
                  type="button"
                  onClick={() => setCheckInRoom(selectedRoomForDetail)}
                  className="w-full h-10 rounded-lg bg-[#765a25] text-white text-xs font-bold hover:bg-[#5c4210] flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Check In Guest
                </button>
              )}

              <div>
                <label className="font-bold text-[#141d23] block mb-2">Housekeeping Status</label>
                <p className="text-[10px] text-[#7f7668] mb-2">Occupancy is set by checking a guest in, not chosen here — these are the states a room moves through around a stay.</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['ready', 'cleaning', 'dirty', 'maintenance'] as RoomStatus[]).map((st) => (
                    <button
                      key={st}
                      disabled={selectedRoomForDetail.status === 'occupied' || selectedRoomForDetail.status === 'occupied_vip'}
                      onClick={() => {
                        onUpdateRoom({ ...selectedRoomForDetail, status: st });
                        setSelectedRoomForDetail({ ...selectedRoomForDetail, status: st });
                      }}
                      className={`p-2 rounded-lg border text-xs font-bold capitalize transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        selectedRoomForDetail.status === st ? 'bg-[#765a25] text-white border-[#765a25]' : 'bg-white border-[#E9ECEF] text-[#4e463a] hover:bg-[#ecf5fe]'
                      }`}
                    >
                      {st.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-[#E9ECEF] gap-2">
              <button
                onClick={() => setQrRoom(selectedRoomForDetail)}
                className="h-9 px-3 rounded-lg border border-[#E9ECEF] text-[#4e463a] text-xs font-bold hover:border-[#765a25] hover:text-[#765a25] flex items-center gap-1.5 whitespace-nowrap"
              >
                <QrCode className="w-3.5 h-3.5" /> Room QR
              </button>
              <div className="flex items-center gap-2">
                {selectedRoomForDetail.reservationId && (
                  <button
                    onClick={() => setShowFolio(true)}
                    className="h-9 px-3 rounded-lg border border-[#765a25] text-[#765a25] text-xs font-bold hover:bg-[#fff8ec] flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Receipt className="w-3.5 h-3.5" /> Folio & Checkout
                  </button>
                )}
                <button onClick={() => setSelectedRoomForDetail(null)} className="px-4 py-2 bg-[#141d23] text-white rounded-lg text-xs font-semibold whitespace-nowrap">
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFolio && selectedRoomForDetail?.reservationId && (
        <RoomFolioModal
          reservationId={selectedRoomForDetail.reservationId}
          roomNumber={selectedRoomForDetail.number}
          currency={currency}
          onClose={() => setShowFolio(false)}
          onCheckedOut={() => {
            onRefreshRooms();
            setShowFolio(false);
            setSelectedRoomForDetail(null);
          }}
        />
      )}

      {qrRoom && <RoomQrModal roomNumber={qrRoom.number} roomId={qrRoom.id} onClose={() => setQrRoom(null)} />}

      {checkInRoom && (
        <CheckInModal
          propertyId={propertyId}
          room={checkInRoom}
          onClose={() => setCheckInRoom(null)}
          onCheckedIn={() => {
            onRefreshRooms();
            setCheckInRoom(null);
            setSelectedRoomForDetail(null);
          }}
        />
      )}

      {showNewBooking && (
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
