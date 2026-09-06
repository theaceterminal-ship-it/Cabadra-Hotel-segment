import React, { useState } from 'react';
import { Room, RoomStatus, UrgentRequest, UpcomingArrival, AppView } from '../types';
import { GuestLinkCard } from './GuestLinkCard';
import { RoomFolioModal } from './RoomFolioModal';
import { updateArrivalEta } from '../lib/staffApi';
import {
  Search,
  User,
  Sparkles,
  Brush,
  AlertCircle,
  Star,
  Wrench,
  Megaphone,
  Check,
  Clock,
  Plus,
  DoorOpen,
  Phone,
  Calendar,
  CheckCircle2,
  Receipt,
} from 'lucide-react';

interface ReceptionViewProps {
  rooms: Room[];
  urgentRequests: UrgentRequest[];
  upcomingArrivals: UpcomingArrival[];
  onUpdateRoom: (updated: Room) => void;
  onResolveUrgentRequest: (requestId: string) => void;
  onCheckInGuest: (arrivalId: string) => void;
  onOpenNewRequest: () => void;
  onNavigate: (view: AppView) => void;
  /** Re-fetches rooms/arrivals from Supabase — called after a checkout settles, since that changes room status and reservation state beyond what the optimistic onUpdateRoom patch covers. */
  onRefreshRooms: () => void;
}

export const ReceptionView: React.FC<ReceptionViewProps> = ({
  rooms,
  urgentRequests,
  upcomingArrivals,
  onUpdateRoom,
  onResolveUrgentRequest,
  onCheckInGuest,
  onOpenNewRequest,
  onNavigate,
  onRefreshRooms,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFloor, setSelectedFloor] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<RoomStatus | 'all'>('all');
  const [selectedRoomForDetail, setSelectedRoomForDetail] = useState<Room | null>(null);
  const [showFolio, setShowFolio] = useState(false);
  const [etaEditArrivalId, setEtaEditArrivalId] = useState<string | null>(null);
  const [savingEta, setSavingEta] = useState(false);

  const handleNudgeEta = async (arrivalId: string, minutes: number) => {
    setSavingEta(true);
    try {
      await updateArrivalEta(arrivalId, new Date(Date.now() + minutes * 60_000));
      onRefreshRooms();
    } catch (err) {
      console.warn('Failed to update arrival ETA:', err);
    } finally {
      setSavingEta(false);
      setEtaEditArrivalId(null);
    }
  };

  // Filtered rooms
  const filteredRooms = rooms.filter((r) => {
    const matchesFloor = selectedFloor === 'all' || r.floor === selectedFloor;
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchesSearch = 
      r.number.includes(searchQuery) ||
      r.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.guestName && r.guestName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesFloor && matchesStatus && matchesSearch;
  });

  // Calculate live status counts
  const readyCount = rooms.filter(r => r.status === 'ready').length;
  const occupiedCount = rooms.filter(r => r.status === 'occupied' || r.status === 'occupied_vip').length;
  const cleaningCount = rooms.filter(r => r.status === 'cleaning').length;
  const dirtyCount = rooms.filter(r => r.status === 'dirty').length;
  const maintenanceCount = rooms.filter(r => r.status === 'maintenance').length;

  return (
    <div id="reception-view-canvas" className="flex-1 flex flex-col h-full bg-[#f6faff] overflow-y-auto">
      {/* Top Bar: Global Search & Context */}
      <header className="h-20 px-4 md:px-8 flex items-center justify-between border-b border-[#E9ECEF] bg-white sticky top-0 z-20 shrink-0">
        <div className="flex-1 max-w-2xl">
          <div className="relative group">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#7f7668] group-focus-within:text-[#765a25] transition-colors" />
            <input
              id="input-reception-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guest, room or booking..."
              className="w-full h-12 pl-10 pr-12 bg-[#ecf5fe] border border-[#d1c5b5] rounded-full text-sm text-[#141d23] placeholder-[#4e463a]/70 focus:outline-none focus:border-[#765a25] focus:ring-1 focus:ring-[#765a25] transition-all shadow-2xs"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd className="hidden md:inline-flex items-center justify-center px-2 py-1 text-[10px] font-semibold text-[#4e463a] bg-[#e6eff8] rounded border border-[#E9ECEF] shadow-2xs">
                ⌘ K
              </kbd>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 ml-4">
          <div className="text-right hidden md:block">
            <p className="text-[11px] font-semibold text-[#7f7668] uppercase tracking-wider">Front Desk Shift</p>
            <p className="text-sm font-medium text-[#141d23]">08:00 - 16:00</p>
          </div>
          <div className="h-10 w-px bg-[#E9ECEF] hidden md:block"></div>
          <button
            onClick={onOpenNewRequest}
            className="h-10 px-4 rounded-lg bg-[#765a25] text-white text-xs font-semibold hover:bg-[#5c4210] transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Request</span>
          </button>
        </div>
      </header>

      {/* Scrollable Content Area */}
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
        {/* Context Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold text-[#141d23]">Property Overview</h2>
            <p className="text-sm text-[#4e463a] mt-1">Real-time status of {rooms.length} room{rooms.length === 1 ? '' : 's'}.</p>
          </div>

          {/* Quick Floor Filters */}
          <div className="flex flex-wrap gap-1.5 bg-[#ecf5fe] p-1 rounded-lg border border-[#E9ECEF] text-xs font-semibold">
            <button
              id="filter-floor-all"
              onClick={() => setSelectedFloor('all')}
              className={`px-3 py-1.5 rounded transition-all cursor-pointer ${
                selectedFloor === 'all' ? 'bg-white shadow-2xs text-[#141d23]' : 'text-[#4e463a] hover:bg-[#dbe4ed]'
              }`}
            >
              All Floors
            </button>
            {[1, 2, 3, 4, 5].map((fl) => (
              <button
                key={fl}
                id={`filter-floor-${fl}`}
                onClick={() => setSelectedFloor(fl)}
                className={`px-3 py-1.5 rounded transition-all cursor-pointer ${
                  selectedFloor === fl ? 'bg-white shadow-2xs text-[#141d23]' : 'text-[#4e463a] hover:bg-[#dbe4ed]'
                }`}
              >
                Floor {fl}
              </button>
            ))}
          </div>
        </div>

        {/* Dashboard Grid: 12-col (8 cols room grid on lg, 4 cols sidebar) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Room Grid (Spans 8 cols) */}
          <section className="lg:col-span-8 flex flex-col gap-4">
            {/* Status Summary / Legend Pills */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStatusFilter(statusFilter === 'ready' ? 'all' : 'ready')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  statusFilter === 'ready'
                    ? 'bg-white border-[#765a25] shadow-xs'
                    : 'bg-white border-[#E9ECEF] text-[#4e463a] hover:border-[#765a25]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#d2dbe4] border border-[#d1c5b5]"></span>
                <span>Ready ({readyCount})</span>
              </button>

              <button
                onClick={() => setStatusFilter(statusFilter === 'occupied' ? 'all' : 'occupied')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === 'occupied'
                    ? 'bg-[#765a25] text-white shadow-xs'
                    : 'bg-[#bd9b60] text-[#4a3301] hover:brightness-95'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#4a3301]"></span>
                <span>Occupied ({occupiedCount})</span>
              </button>

              <button
                onClick={() => setStatusFilter(statusFilter === 'cleaning' ? 'all' : 'cleaning')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === 'cleaning'
                    ? 'bg-[#5d5e61] text-white shadow-xs'
                    : 'bg-[#e2e2e5] text-[#636467] hover:brightness-95'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#636467]"></span>
                <span>Cleaning ({cleaningCount})</span>
              </button>

              <button
                onClick={() => setStatusFilter(statusFilter === 'dirty' ? 'all' : 'dirty')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === 'dirty'
                    ? 'bg-[#BC4749] text-white shadow-xs'
                    : 'bg-[#ffdad6] text-[#93000a] hover:brightness-95'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#BC4749]"></span>
                <span>Dirty ({dirtyCount})</span>
              </button>

              <button
                onClick={() => setStatusFilter(statusFilter === 'maintenance' ? 'all' : 'maintenance')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  statusFilter === 'maintenance'
                    ? 'bg-[#5c5f60] text-white shadow-xs'
                    : 'bg-[#9ea0a1] text-[#343738] hover:brightness-95'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#343738]"></span>
                <span>Maintenance ({maintenanceCount})</span>
              </button>
            </div>

            {/* The Room Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredRooms.map((room) => {
                // Determine styling based on room status
                if (room.status === 'occupied') {
                  return (
                    <button
                      key={room.id}
                      id={`room-tile-${room.number}`}
                      onClick={() => setSelectedRoomForDetail(room)}
                      className="bg-[#bd9b60] border-transparent rounded-xl p-3.5 text-left hover:brightness-95 transition-all group relative aspect-square flex flex-col justify-between cursor-pointer shadow-xs"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xl font-bold text-[#4a3301]">{room.number}</span>
                        <User className="w-4 h-4 text-[#4a3301] opacity-80" />
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-[#4a3301] opacity-80 uppercase tracking-wider mb-0.5">
                          {room.type}
                        </p>
                        <p className="text-sm font-semibold text-[#4a3301] truncate">{room.guestName || 'Occupied'}</p>
                        <p className="text-[11px] text-[#4a3301] opacity-75 mt-0.5">{room.checkoutInfo || 'In House'}</p>
                      </div>
                    </button>
                  );
                }

                if (room.status === 'occupied_vip') {
                  return (
                    <button
                      key={room.id}
                      id={`room-tile-${room.number}`}
                      onClick={() => setSelectedRoomForDetail(room)}
                      className="bg-[#bd9b60] border-2 border-[#765a25] rounded-xl p-3.5 text-left hover:brightness-95 transition-all group relative aspect-square flex flex-col justify-between cursor-pointer shadow-[0_0_15px_rgba(189,155,96,0.35)]"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xl font-bold text-[#4a3301]">{room.number}</span>
                        <Star className="w-4 h-4 text-[#765a25] fill-[#765a25]" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-[#4a3301] opacity-90 uppercase tracking-wider mb-0.5">
                          {room.type}
                        </p>
                        <p className="text-sm font-bold text-[#4a3301] truncate">{room.guestName}</p>
                        <p className="text-[11px] font-bold text-[#765a25] mt-0.5">{room.checkoutInfo || 'VIP Guest'}</p>
                      </div>
                    </button>
                  );
                }

                if (room.status === 'ready') {
                  return (
                    <button
                      key={room.id}
                      id={`room-tile-${room.number}`}
                      onClick={() => setSelectedRoomForDetail(room)}
                      className="bg-white border border-[#E9ECEF] shadow-[0_2px_8px_rgba(0,0,0,0.02)] rounded-xl p-3.5 text-left hover:border-[#765a25] transition-all group relative aspect-square flex flex-col justify-between cursor-pointer"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xl font-bold text-[#141d23]">{room.number}</span>
                        <div className="w-2.5 h-2.5 rounded-full bg-[#d2dbe4] border border-[#d1c5b5] mt-1"></div>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-[#7f7668] uppercase tracking-wider mb-0.5">
                          {room.type}
                        </p>
                        <p className="text-sm font-medium text-[#141d23]">Available</p>
                        <p className="text-[11px] text-[#2D6A4F] font-semibold mt-0.5">${room.pricePerNight}/night</p>
                      </div>
                    </button>
                  );
                }

                if (room.status === 'cleaning') {
                  return (
                    <button
                      key={room.id}
                      id={`room-tile-${room.number}`}
                      onClick={() => setSelectedRoomForDetail(room)}
                      className="bg-[#e2e2e5] border-transparent rounded-xl p-3.5 text-left hover:brightness-95 transition-all group relative aspect-square flex flex-col justify-between cursor-pointer shadow-2xs"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xl font-bold text-[#636467]">{room.number}</span>
                        <Brush className="w-4 h-4 text-[#636467] opacity-80" />
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-[#636467] opacity-80 uppercase tracking-wider mb-1">
                          {room.type}
                        </p>
                        <div className="w-full bg-[#c6c6c9] h-1.5 rounded-full mb-1 overflow-hidden">
                          <div
                            className="bg-[#636467] h-full rounded-full transition-all"
                            style={{ width: `${room.cleanProgress || 60}%` }}
                          ></div>
                        </div>
                        <p className="text-[11px] text-[#636467] opacity-80 mt-0.5">
                          {room.notes || 'In progress'}
                        </p>
                      </div>
                    </button>
                  );
                }

                if (room.status === 'dirty') {
                  return (
                    <button
                      key={room.id}
                      id={`room-tile-${room.number}`}
                      onClick={() => setSelectedRoomForDetail(room)}
                      className="bg-[#ffdad6] border-transparent rounded-xl p-3.5 text-left hover:brightness-95 transition-all group relative aspect-square flex flex-col justify-between cursor-pointer shadow-2xs"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xl font-bold text-[#93000a]">{room.number}</span>
                        <AlertCircle className="w-4 h-4 text-[#BC4749]" />
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-[#93000a] opacity-80 uppercase tracking-wider mb-0.5">
                          {room.type}
                        </p>
                        <p className="text-sm font-semibold text-[#93000a]">{room.issueDescription || 'Checkout Done'}</p>
                        <p className="text-[11px] text-[#BC4749] font-medium mt-0.5">{room.notes || 'Requires service'}</p>
                      </div>
                    </button>
                  );
                }

                // Maintenance
                return (
                  <button
                    key={room.id}
                    id={`room-tile-${room.number}`}
                    onClick={() => setSelectedRoomForDetail(room)}
                    className="bg-[#9ea0a1] border-transparent rounded-xl p-3.5 text-left hover:brightness-95 transition-all group relative aspect-square flex flex-col justify-between cursor-pointer shadow-2xs"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xl font-bold text-[#343738]">{room.number}</span>
                      <Wrench className="w-4 h-4 text-[#343738] opacity-80" />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-[#343738] opacity-80 uppercase tracking-wider mb-0.5">
                        {room.type}
                      </p>
                      <p className="text-sm font-semibold text-[#343738]">{room.issueDescription || 'HVAC Issue'}</p>
                      <p className="text-[11px] text-[#343738] opacity-80 mt-0.5">ETA: {room.maintenanceEta || '14:00'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Side Panel (Spans 4 cols on lg) */}
          <aside className="lg:col-span-4 flex flex-col gap-6">
            {/* Urgent Requests Card */}
            <div 
              id="urgent-requests-card"
              className="bg-white rounded-xl border border-[#ffdad6] shadow-[0_4px_20px_rgba(188,71,73,0.05)] overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[#E9ECEF] bg-[#f6faff] flex justify-between items-center">
                <h3 className="text-sm font-bold text-[#141d23] flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-[#BC4749]" />
                  <span>Urgent Requests</span>
                </h3>
                <span className="bg-[#BC4749] text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {urgentRequests.filter(r => r.status === 'open').length}
                </span>
              </div>

              <div className="divide-y divide-[#E9ECEF]">
                {urgentRequests.map((req) => (
                  <div
                    key={req.id}
                    id={`urgent-req-item-${req.id}`}
                    onClick={() => onResolveUrgentRequest(req.id)}
                    className="p-3.5 hover:bg-[#ecf5fe] transition-colors cursor-pointer group"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold text-[#141d23] group-hover:text-[#765a25] transition-colors">
                        {req.title}
                      </span>
                      <span className="text-[10px] text-[#7f7668]">{req.timeAgo}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-[#e6eff8] px-2 py-0.5 rounded text-[11px] font-semibold text-[#4e463a]">
                          Room {req.roomNumber}
                        </span>
                        <span className={`text-[11px] font-bold ${
                          req.priority === 'High Priority' ? 'text-[#BC4749]' : 'text-[#765a25]'
                        }`}>
                          {req.priority}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#765a25] opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                        Click to Resolve &rarr;
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming Arrivals Card */}
            <div 
              id="upcoming-arrivals-card"
              className="bg-white rounded-xl border border-[#E9ECEF] shadow-2xs overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[#E9ECEF] flex justify-between items-center bg-[#f6faff]">
                <h3 className="text-sm font-bold text-[#141d23]">Upcoming Arrivals</h3>
                <span className="text-xs text-[#765a25] font-semibold">Today</span>
              </div>

              <div className="p-3 flex flex-col gap-2">
                {upcomingArrivals.map((arr) => {
                  return (
                    <div
                      key={arr.id}
                      id={`arrival-item-${arr.id}`}
                      className={`relative flex items-center gap-3 p-2.5 rounded-lg border border-[#E9ECEF] hover:bg-[#ecf5fe] transition-colors ${
                        arr.isDelayed ? 'opacity-80' : ''
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 relative ${
                        arr.isVip ? 'bg-[#bd9b60] text-[#4a3301]' : 'bg-[#e0e9f2] text-[#765a25]'
                      }`}>
                        {arr.initials}
                        {arr.isVip && (
                          <Star className="w-3 h-3 text-[#765a25] fill-[#765a25] absolute -bottom-0.5 -right-0.5 bg-white rounded-full" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[#141d23] truncate">{arr.guestName}</p>
                        <p className="text-[11px] text-[#7f7668] truncate">
                          ETA: {arr.eta} • {arr.roomType}
                        </p>
                      </div>

                      {arr.checkedIn ? (
                        <span className="text-[11px] font-bold text-[#2D6A4F] bg-[#2D6A4F]/10 px-2 py-1 rounded">
                          Checked In
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          {arr.isDelayed && (
                            <span className="text-[10px] font-bold text-[#BC4749] bg-[#ffdad6] px-1.5 py-0.5 rounded">Delayed</span>
                          )}
                          <button
                            onClick={() => setEtaEditArrivalId(etaEditArrivalId === arr.id ? null : arr.id)}
                            className="h-8 w-8 flex items-center justify-center rounded border border-[#E9ECEF] text-[#7f7668] hover:border-[#765a25] hover:text-[#765a25] transition-colors"
                            title="Update ETA"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                          <button
                            id={`btn-checkin-${arr.id}`}
                            onClick={() => onCheckInGuest(arr.id)}
                            className="h-8 px-3 rounded border border-[#E9ECEF] text-xs font-bold text-[#141d23] hover:border-[#765a25] hover:text-[#765a25] hover:bg-white transition-colors cursor-pointer"
                          >
                            Check In
                          </button>
                        </div>
                      )}

                      {etaEditArrivalId === arr.id && (
                        <div className="absolute top-full right-2.5 mt-1 flex gap-1 bg-white border border-[#E9ECEF] rounded-lg p-1.5 shadow-lg z-10">
                          {[15, 30, 60].map(mins => (
                            <button
                              key={mins}
                              disabled={savingEta}
                              onClick={() => handleNudgeEta(arr.id, mins)}
                              className="h-7 px-2 rounded text-[11px] font-bold text-[#4e463a] hover:bg-[#ecf5fe] disabled:opacity-50 whitespace-nowrap"
                            >
                              +{mins}m
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Room Detail & Status Control Modal */}
      {selectedRoomForDetail && (
        <div 
          id="modal-room-detail"
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E9ECEF] space-y-4">
            <div className="flex justify-between items-start pb-3 border-b border-[#E9ECEF]">
              <div>
                <span className="text-[10px] font-bold text-[#765a25] uppercase tracking-wider">
                  Floor {selectedRoomForDetail.floor} • Room Details
                </span>
                <h3 className="text-2xl font-bold text-[#141d23]">
                  Room {selectedRoomForDetail.number}
                </h3>
                <p className="text-xs text-[#7f7668]">{selectedRoomForDetail.type}</p>
              </div>
              <button
                onClick={() => setSelectedRoomForDetail(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1"
              >
                &times;
              </button>
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
                  <span className="font-bold text-[#2D6A4F]">${selectedRoomForDetail.pricePerNight} / night</span>
                </div>
              </div>

              {selectedRoomForDetail.guestToken && (
                <GuestLinkCard guestToken={selectedRoomForDetail.guestToken} />
              )}

              <div>
                <label className="font-bold text-[#141d23] block mb-2">Change Room Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['ready', 'occupied', 'occupied_vip', 'cleaning', 'dirty', 'maintenance'] as RoomStatus[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => {
                        // guestName isn't a room field in Supabase — it's
                        // derived from the checked-in reservation (see
                        // staffApi.fetchRoomsForProperty), so a manual
                        // status change here never fabricates one. A room
                        // marked occupied without a real check-in just
                        // shows no guest name until it has one.
                        onUpdateRoom({ ...selectedRoomForDetail, status: st });
                        setSelectedRoomForDetail({ ...selectedRoomForDetail, status: st });
                      }}
                      className={`p-2 rounded-lg border text-xs font-bold capitalize transition-all cursor-pointer ${
                        selectedRoomForDetail.status === st
                          ? 'bg-[#765a25] text-white border-[#765a25]'
                          : 'bg-white border-[#E9ECEF] text-[#4e463a] hover:bg-[#ecf5fe]'
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
                onClick={() => {
                  setSelectedRoomForDetail(null);
                  onNavigate('room_dining');
                }}
                className="text-xs font-bold text-[#765a25] hover:underline whitespace-nowrap"
              >
                Order Dining For Room &rarr;
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
                <button
                  onClick={() => setSelectedRoomForDetail(null)}
                  className="px-4 py-2 bg-[#141d23] text-white rounded-lg text-xs font-semibold whitespace-nowrap"
                >
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
          onClose={() => setShowFolio(false)}
          onCheckedOut={() => {
            onRefreshRooms();
            setShowFolio(false);
            setSelectedRoomForDetail(null);
          }}
        />
      )}
    </div>
  );
};
