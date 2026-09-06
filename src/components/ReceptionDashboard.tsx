import React, { useState } from 'react';
import {
  BedDouble, Users, ClipboardList, Megaphone, Plus, Star, Clock,
  UtensilsCrossed, ArrowRight, CheckCircle2, Sparkles, CalendarPlus, XCircle,
} from 'lucide-react';
import { Room, UrgentRequest, UpcomingArrival, LiveOpsTask, KdsOrder, AppNotification, AppView } from '../types';
import { updateArrivalEta } from '../lib/staffApi';
import { NewBookingModal } from './NewBookingModal';

interface ReceptionDashboardProps {
  propertyId: string;
  currency: string;
  rooms: Room[];
  urgentRequests: UrgentRequest[];
  upcomingArrivals: UpcomingArrival[];
  tasks: LiveOpsTask[];
  kdsOrders: KdsOrder[];
  notifications: AppNotification[];
  onResolveUrgentRequest: (id: string) => void;
  onCheckInGuest: (arrivalId: string) => void;
  onCancelBooking: (arrivalId: string) => void;
  onRefreshRooms: () => void;
  onOpenNewRequest: () => void;
  onMarkNotificationRead: (id: string) => void;
  onNavigate: (view: AppView) => void;
}

function KpiCard({ icon: Icon, label, value, sub }: { icon: typeof BedDouble; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#E9ECEF] p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-[#fff8ec] text-[#765a25] flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-[#7f7668] uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-[#141d23] leading-tight">{value}</p>
        <p className="text-[11px] text-[#4e463a] mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function SectionCard({ title, count, viewAllLabel, onViewAll, children, empty }: {
  title: string; count: number; viewAllLabel?: string; onViewAll?: () => void; children: React.ReactNode; empty: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E9ECEF] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E9ECEF] bg-[#f6faff] flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#141d23]">{title} {count > 0 && <span className="text-[#7f7668] font-medium">({count})</span>}</h3>
        {onViewAll && (
          <button onClick={onViewAll} className="text-[11px] font-semibold text-[#765a25] hover:underline flex items-center gap-1">
            {viewAllLabel ?? 'View all'} <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
      {count === 0 ? (
        <p className="text-xs text-[#7f7668] text-center py-6">{empty}</p>
      ) : (
        <div className="divide-y divide-[#E9ECEF]">{children}</div>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

/**
 * The receptionist's front page — everything they need to know at a
 * glance, nothing they need to dig for. Deliberately kept to four numbers
 * plus three lists: the detailed room-by-room grid lives on its own tab
 * (RoomsFloorsView) so this page never grows to match its complexity.
 */
export const ReceptionDashboard: React.FC<ReceptionDashboardProps> = ({
  propertyId, currency, rooms, urgentRequests, upcomingArrivals, tasks, kdsOrders, notifications,
  onResolveUrgentRequest, onCheckInGuest, onCancelBooking, onRefreshRooms, onOpenNewRequest, onMarkNotificationRead, onNavigate,
}) => {
  const [etaEditArrivalId, setEtaEditArrivalId] = useState<string | null>(null);
  const [savingEta, setSavingEta] = useState(false);
  const [showNewBooking, setShowNewBooking] = useState(false);

  const occupiedCount = rooms.filter(r => r.status === 'occupied' || r.status === 'occupied_vip').length;
  const occupancyPct = rooms.length > 0 ? Math.round((occupiedCount / rooms.length) * 100) : 0;
  const openTasks = tasks.filter(t => t.status !== 'completed');
  const notCheckedInArrivals = upcomingArrivals.filter(a => !a.checkedIn);
  const activeOrders = kdsOrders.filter(o => o.status !== 'delivered').slice(0, 6);

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

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[#141d23]">Dashboard</h1>
          <p className="text-sm text-[#4e463a] mt-1">Today at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenNewRequest}
            className="h-10 px-4 rounded-lg border border-[#E9ECEF] text-[#4e463a] text-xs font-semibold hover:border-[#765a25] hover:text-[#765a25] transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> New Request
          </button>
          <button
            onClick={() => setShowNewBooking(true)}
            className="h-10 px-4 rounded-lg bg-[#765a25] text-white text-xs font-semibold hover:bg-[#5c4210] transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap"
          >
            <CalendarPlus className="w-4 h-4" /> New Booking
          </button>
        </div>
      </div>

      {/* 4 KPI boxes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={BedDouble} label="Rooms Occupied" value={`${occupiedCount}/${rooms.length}`} sub={`${occupancyPct}% occupancy`} />
        <KpiCard icon={Users} label="Upcoming Guests" value={String(notCheckedInArrivals.length)} sub="arriving today" />
        <KpiCard icon={ClipboardList} label="Live Operations" value={String(openTasks.length)} sub="open tasks" />
        <KpiCard icon={Megaphone} label="Open Requests" value={String(urgentRequests.length)} sub="need attention" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Main column */}
        <div className="xl:col-span-8 flex flex-col gap-6">
          <SectionCard title="Guest Requests" count={urgentRequests.length} empty="Nothing outstanding — nice.">
            {urgentRequests.map(req => (
              <div key={req.id} onClick={() => onResolveUrgentRequest(req.id)} className="p-3.5 hover:bg-[#ecf5fe] transition-colors cursor-pointer group flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#141d23] group-hover:text-[#765a25] truncate">{req.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="bg-[#e6eff8] px-2 py-0.5 rounded text-[10px] font-semibold text-[#4e463a]">Room {req.roomNumber}</span>
                    <span className={`text-[10px] font-bold ${req.priority === 'High Priority' ? 'text-[#BC4749]' : 'text-[#765a25]'}`}>{req.priority}</span>
                    <span className="text-[10px] text-[#7f7668]">{req.timeAgo}</span>
                  </div>
                </div>
                <CheckCircle2 className="w-4 h-4 text-[#7f7668] opacity-0 group-hover:opacity-100 shrink-0" />
              </div>
            ))}
          </SectionCard>

          <SectionCard title="Upcoming Arrivals" count={upcomingArrivals.length} empty="No arrivals scheduled today.">
            {upcomingArrivals.map(arr => (
              <div key={arr.id} className="relative p-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 relative ${
                  arr.isVip ? 'bg-[#bd9b60] text-[#4a3301]' : 'bg-[#e0e9f2] text-[#765a25]'
                }`}>
                  {arr.initials}
                  {arr.isVip && <Star className="w-2.5 h-2.5 text-[#765a25] fill-[#765a25] absolute -bottom-0.5 -right-0.5 bg-white rounded-full" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#141d23] truncate">{arr.guestName}</p>
                  <p className="text-[11px] text-[#7f7668] truncate">ETA: {arr.eta} • {arr.roomType}</p>
                </div>
                {arr.checkedIn ? (
                  <span className="text-[10px] font-bold text-[#2D6A4F] bg-[#2D6A4F]/10 px-2 py-1 rounded shrink-0">Checked In</span>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    {arr.isDelayed && <span className="text-[9px] font-bold text-[#BC4749] bg-[#ffdad6] px-1.5 py-0.5 rounded">Delayed</span>}
                    <button
                      onClick={() => setEtaEditArrivalId(etaEditArrivalId === arr.id ? null : arr.id)}
                      className="h-7 w-7 flex items-center justify-center rounded border border-[#E9ECEF] text-[#7f7668] hover:border-[#765a25] hover:text-[#765a25]"
                      title="Update ETA"
                    >
                      <Clock className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onCheckInGuest(arr.id)}
                      className="h-7 px-2.5 rounded border border-[#E9ECEF] text-[11px] font-bold text-[#141d23] hover:border-[#765a25] hover:text-[#765a25]"
                    >
                      Check In
                    </button>
                    <button
                      onClick={() => { if (confirm(`Cancel ${arr.guestName}'s booking?`)) onCancelBooking(arr.id); }}
                      className="h-7 w-7 flex items-center justify-center rounded border border-[#E9ECEF] text-[#7f7668] hover:border-[#BC4749] hover:text-[#BC4749]"
                      title="Cancel booking"
                    >
                      <XCircle className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {etaEditArrivalId === arr.id && (
                  <div className="absolute top-full right-3 mt-1 flex gap-1 bg-white border border-[#E9ECEF] rounded-lg p-1.5 shadow-lg z-10">
                    {[15, 30, 60].map(mins => (
                      <button key={mins} disabled={savingEta} onClick={() => handleNudgeEta(arr.id, mins)} className="h-7 px-2 rounded text-[11px] font-bold text-[#4e463a] hover:bg-[#ecf5fe] disabled:opacity-50">
                        +{mins}m
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </SectionCard>

          <SectionCard title="Room Service" count={activeOrders.length} viewAllLabel="Kitchen board" onViewAll={() => onNavigate('kitchen_kds')} empty="No active orders.">
            {activeOrders.map(order => (
              <div key={order.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-[#765a25] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#141d23] truncate">{order.roomNumber} · {order.orderNumber}</p>
                    <p className="text-[10px] text-[#7f7668]">{order.items.length} item{order.items.length === 1 ? '' : 's'} · {order.timeElapsed}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize shrink-0 ${
                  order.status === 'new' ? 'bg-[#ecf5fe] text-[#765a25]' : order.status === 'preparing' ? 'bg-[#fff8ec] text-[#a16207]' : 'bg-[#2D6A4F]/10 text-[#2D6A4F]'
                }`}>
                  {order.status}
                </span>
              </div>
            ))}
          </SectionCard>
        </div>

        {/* Right info panel */}
        <div className="xl:col-span-4 flex flex-col gap-6">
          <div className="bg-white rounded-xl border border-[#E9ECEF] p-4">
            <p className="text-[11px] font-semibold text-[#7f7668] uppercase tracking-wider">Front Desk Shift</p>
            <p className="text-lg font-bold text-[#141d23] mt-1">08:00 – 16:00</p>
            <div className="grid grid-cols-2 gap-2 mt-3 text-center">
              <div className="bg-[#f6faff] rounded-lg p-2">
                <p className="text-sm font-bold text-[#141d23]">{rooms.length}</p>
                <p className="text-[10px] text-[#7f7668]">Total Rooms</p>
              </div>
              <div className="bg-[#f6faff] rounded-lg p-2">
                <p className="text-sm font-bold text-[#141d23]">{openTasks.length}</p>
                <p className="text-[10px] text-[#7f7668]">Open Tasks</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#E9ECEF] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E9ECEF] bg-[#f6faff] flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#765a25]" />
              <h3 className="text-sm font-bold text-[#141d23]">Recent Activity</h3>
            </div>
            {notifications.length === 0 ? (
              <p className="text-xs text-[#7f7668] text-center py-6">Nothing yet today.</p>
            ) : (
              <div className="divide-y divide-[#E9ECEF] max-h-80 overflow-y-auto">
                {notifications.slice(0, 8).map(n => (
                  <button
                    key={n.id}
                    onClick={() => onMarkNotificationRead(n.id)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-[#ecf5fe] transition-colors ${n.read ? 'opacity-60' : ''}`}
                  >
                    <p className="text-[11px] font-bold text-[#141d23] truncate">{n.title}</p>
                    <p className="text-[10px] text-[#7f7668] mt-0.5">{timeAgo(n.createdAt)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

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
