import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, Plus, Star, Clock, CheckCircle2, XCircle, ClipboardList, Megaphone, CalendarPlus, UserPlus, X, Users,
  Play, Check, Ban, UserCircle2,
} from 'lucide-react';
import { Room, RoomStatus, UrgentRequest, UpcomingArrival, LiveOpsTask, AppView } from '../types';
import { updateArrivalEta, fetchActiveShiftSessions, ActiveShiftSession, DirectoryContact, PropertyStats } from '../lib/staffApi';
import { formatCurrency } from '../lib/currency';
import { NewBookingModal } from './NewBookingModal';
import { RoomDetailModal, CHECKINABLE_STATUSES } from './RoomDetailModal';
import { CheckInModal } from './CheckInModal';

interface ReceptionDashboardProps {
  propertyId: string;
  propertyName: string;
  currency: string;
  upiId?: string;
  /** true = this hotel runs its own PMS — New Booking (availability search/advance booking) is hidden; a room is checked in directly by tapping it (here or in Rooms & Floors) instead. */
  hasExternalPms: boolean;
  rooms: Room[];
  urgentRequests: UrgentRequest[];
  upcomingArrivals: UpcomingArrival[];
  tasks: LiveOpsTask[];
  directory: DirectoryContact[];
  stats: PropertyStats | null;
  onResolveUrgentRequest: (id: string) => void;
  onUpdateTask: (task: LiveOpsTask) => void;
  onRejectTask: (task: LiveOpsTask, note: string) => void;
  onAssignTask: (taskId: string, assignedTo: string | null) => void;
  onChangeDepartment: (taskId: string, department: LiveOpsTask['category']) => void;
  onCheckInGuest: (arrivalId: string) => void;
  onCancelBooking: (arrivalId: string) => void;
  onUpdateRoom: (updated: Room) => void;
  onRefreshRooms: () => void;
  onOpenNewRequest: () => void;
  onNavigate: (view: AppView) => void;
}

const DEPT_LABELS_FULL: Record<LiveOpsTask['category'], string> = {
  housekeeping: 'Housekeeping', maintenance: 'Maintenance', amenities: 'Amenities', concierge: 'Concierge',
};

/**
 * What a Guest Request click used to do: call onResolveUrgentRequest
 * directly and the row just vanished — no review, no chance to route it
 * to the right person. Found live-testing: every request now has a
 * linked task the moment it's created (0053's auto-create trigger), so
 * this just surfaces that task's own real actions (reassign department,
 * assign a person, accept/complete/reject) instead of a second, separate
 * "resolved" concept. Falls back to a plain "Mark Resolved" for a request
 * from before 0053 that somehow has no linked task.
 */
function RequestActionModal({ request, task, directory, onAssignTask, onChangeDepartment, onUpdateTask, onRejectTask, onResolveDirect, onClose }: {
  request: UrgentRequest;
  task: LiveOpsTask | undefined;
  directory: DirectoryContact[];
  onAssignTask: (taskId: string, assignedTo: string | null) => void;
  onChangeDepartment: (taskId: string, department: LiveOpsTask['category']) => void;
  onUpdateTask: (task: LiveOpsTask) => void;
  onRejectTask: (task: LiveOpsTask, note: string) => void;
  onResolveDirect: (id: string) => void;
  onClose: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const candidates = task ? directory.filter(d => d.department === task.category) : [];
  const isDone = task?.status === 'completed';
  const isRejected = task?.status === 'rejected';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-surface-container-lowest rounded-2xl max-w-md w-full p-6 shadow-2xl border border-outline-variant space-y-4">
        <div className="flex items-start justify-between pb-3 border-b border-outline-variant">
          <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Room {request.roomNumber}</p>
            <h3 className="text-base font-bold text-on-surface">{request.title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
        </div>

        {!task ? (
          <>
            <p className="text-xs text-on-surface-variant">No linked task found for this request — resolve it directly instead.</p>
            <button
              onClick={() => { onResolveDirect(request.id); onClose(); }}
              className="w-full h-10 rounded-lg bg-success text-on-success text-xs font-bold"
            >
              Mark Resolved
            </button>
          </>
        ) : rejecting ? (
          <div className="space-y-3">
            <p className="text-xs text-on-surface-variant">Say why so whoever's tracking it knows what happened.</p>
            <textarea
              autoFocus
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. Short-staffed tonight, no spare linens..."
              className="w-full p-2.5 text-sm border border-outline-variant rounded-lg focus:border-error focus:outline-none resize-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejecting(false)} className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface-variant">Cancel</button>
              <button
                onClick={() => { onRejectTask(task, rejectNote.trim()); onClose(); }}
                disabled={!rejectNote.trim()}
                className="px-4 py-2 bg-error text-on-error rounded-lg text-xs font-bold disabled:opacity-50"
              >
                Reject Task
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="text-[10px] font-bold text-on-surface-variant block mb-1">Department</label>
              <select
                value={task.category}
                onChange={(e) => onChangeDepartment(task.id, e.target.value as LiveOpsTask['category'])}
                className="w-full h-9 px-2.5 text-xs border border-outline-variant rounded-lg bg-surface-container-lowest focus:border-primary focus:outline-none"
              >
                {(Object.keys(DEPT_LABELS_FULL) as LiveOpsTask['category'][]).map(d => (
                  <option key={d} value={d}>{DEPT_LABELS_FULL[d]}</option>
                ))}
              </select>
              <p className="text-[10px] text-on-surface-variant mt-1">Misrouted? Move it to the right department's queue.</p>
            </div>

            <div>
              <label className="text-[10px] font-bold text-on-surface-variant block mb-1">Assign to</label>
              <div className="flex items-center gap-2">
                <UserCircle2 className="w-4 h-4 text-on-surface-variant shrink-0" />
                <select
                  value={task.assignedTo ?? ''}
                  onChange={(e) => onAssignTask(task.id, e.target.value || null)}
                  className="flex-1 h-9 px-2.5 text-xs border border-outline-variant rounded-lg bg-surface-container-lowest focus:border-primary focus:outline-none"
                >
                  <option value="">Unassigned — {DEPT_LABELS_FULL[task.category]} queue</option>
                  {candidates.map(c => <option key={c.id} value={c.name}>{c.name} · {c.phone}</option>)}
                </select>
              </div>
            </div>

            {isRejected && task.rejectionNote && (
              <div className="bg-error-container/30 text-on-error-container p-2.5 rounded-lg text-xs border border-error-container">
                <span className="font-bold">Rejected: </span>{task.rejectionNote}
              </div>
            )}

            {isDone ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success bg-success/10 px-3 py-2 rounded-lg w-full justify-center">
                <Check className="w-4 h-4" /> Completed
              </span>
            ) : isRejected ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-error bg-error/10 px-3 py-2 rounded-lg w-full justify-center">
                <Ban className="w-4 h-4" /> Rejected
              </span>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setRejecting(true)}
                  className="h-10 px-3 rounded-lg border border-error text-error flex items-center justify-center"
                  title="Reject this task"
                >
                  <X className="w-4 h-4" />
                </button>
                {task.status === 'in_progress' ? (
                  <button
                    onClick={() => { onUpdateTask({ ...task, status: 'completed' }); onClose(); }}
                    className="flex-1 h-10 rounded-lg bg-success text-on-success text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" /> Mark Complete
                  </button>
                ) : (
                  <button
                    onClick={() => onUpdateTask({ ...task, status: 'in_progress' })}
                    className="flex-1 h-10 rounded-lg bg-primary text-on-primary text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-4 h-4 fill-current" /> Start
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  ready: 'Ready', occupied: 'Occupied', occupied_vip: 'VIP', cleaning: 'Cleaning', dirty: 'Dirty', maintenance: 'Maintenance',
};
/** bg/on token pair per status — see src/index.css's --color-room-* family. */
const ROOM_STATUS_COLOR: Record<RoomStatus, { bg: string; on: string }> = {
  ready: { bg: 'bg-[var(--color-room-ready)]', on: 'text-[var(--color-room-ready-on)]' },
  occupied: { bg: 'bg-[var(--color-room-occupied)]', on: 'text-[var(--color-room-occupied-on)]' },
  occupied_vip: { bg: 'bg-[var(--color-room-vip)]', on: 'text-[var(--color-room-vip-on)]' },
  cleaning: { bg: 'bg-[var(--color-room-cleaning)]', on: 'text-[var(--color-room-cleaning-on)]' },
  dirty: { bg: 'bg-[var(--color-room-dirty)]', on: 'text-[var(--color-room-dirty-on)]' },
  maintenance: { bg: 'bg-[var(--color-room-maintenance)]', on: 'text-[var(--color-room-maintenance-on)]' },
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-on-surface-strong-muted">{label}</p>
      <p className="text-2xl font-bold text-on-surface-strong leading-tight">{value}</p>
    </div>
  );
}

function ListCard({ title, count, icon: Icon, viewAllLabel, onViewAll, children, empty }: {
  title: string; count: number; icon: typeof Megaphone; viewAllLabel?: string; onViewAll?: () => void; children: React.ReactNode; empty: string;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-outline-variant">
        <h3 className="text-sm font-bold text-on-surface flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-primary" /> {title} {count > 0 && <span className="font-medium text-on-surface-variant">({count})</span>}
        </h3>
        {onViewAll && (
          <button onClick={onViewAll} className="text-[11px] font-semibold text-primary hover:underline">{viewAllLabel ?? 'View all'}</button>
        )}
      </div>
      {count === 0 ? (
        <p className="text-xs text-on-surface-variant text-center py-6">{empty}</p>
      ) : (
        <div className="divide-y divide-outline-variant max-h-64 overflow-y-auto">{children}</div>
      )}
    </div>
  );
}

const DEPT_LABELS: Record<ActiveShiftSession['department'], string> = {
  housekeeping: 'Housekeeping', maintenance: 'Maintenance', amenities: 'Amenities', concierge: 'Concierge',
};

/**
 * Found missing live-testing: once staff started clocking in via a badge
 * scan (department_display_scan_badge), nothing on Reception's own
 * dashboard reflected it — the only place that showed up was the display
 * itself. Self-fetching, same pattern as PropertyDetailPage's
 * OpenRequestsCard, and polled rather than wired through the parent's own
 * reload cycle since it's reading a table (display_sessions) nothing else
 * on this page touches.
 */
function WhoIsOnShiftCard({ propertyId }: { propertyId: string }) {
  const [sessions, setSessions] = useState<ActiveShiftSession[]>([]);

  useEffect(() => {
    const poll = () => fetchActiveShiftSessions(propertyId).then(setSessions).catch(() => {});
    poll();
    const interval = setInterval(poll, 8000);
    return () => clearInterval(interval);
  }, [propertyId]);

  return (
    <ListCard title="On Shift Now" count={sessions.length} icon={Users} empty="No one clocked in right now.">
      {sessions.map(s => (
        <div key={s.id} className="p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-on-surface truncate">{s.staffName}</p>
            <p className="text-[10px] text-on-surface-variant truncate">{DEPT_LABELS[s.department]}{s.displayLabel ? ` · ${s.displayLabel}` : ''}</p>
          </div>
          <span className="text-[10px] font-semibold text-success shrink-0">
            since {new Date(s.claimedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      ))}
    </ListCard>
  );
}

/**
 * The receptionist's front page — rebuilt around the TimeFrame reference:
 * stats + Add Request in the header, Guest Requests / Upcoming Arrivals /
 * Live Operations stacked on the left, a room-status grid (grouped by
 * floor, same color-block language as the reference's calendar) with a
 * room/guest search where the reference had "Today" filling the rest.
 */
export const ReceptionDashboard: React.FC<ReceptionDashboardProps> = ({
  propertyId, propertyName, currency, upiId, hasExternalPms, rooms, urgentRequests, upcomingArrivals, tasks, directory, stats,
  onResolveUrgentRequest, onUpdateTask, onRejectTask, onAssignTask, onChangeDepartment,
  onCheckInGuest, onCancelBooking, onUpdateRoom, onRefreshRooms, onOpenNewRequest, onNavigate,
}) => {
  const [etaEditArrivalId, setEtaEditArrivalId] = useState<string | null>(null);
  const [savingEta, setSavingEta] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<UrgentRequest | null>(null);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRoomForDetail, setSelectedRoomForDetail] = useState<Room | null>(null);
  const [showQuickCheckIn, setShowQuickCheckIn] = useState(false);
  const [checkInRoom, setCheckInRoom] = useState<Room | null>(null);

  const checkinableRooms = useMemo(() => rooms.filter(r => CHECKINABLE_STATUSES.includes(r.status)), [rooms]);

  const occupiedCount = rooms.filter(r => r.status === 'occupied' || r.status === 'occupied_vip').length;
  const occupancyPct = rooms.length > 0 ? Math.round((occupiedCount / rooms.length) * 100) : 0;
  const openTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'rejected');
  const notCheckedInArrivals = upcomingArrivals.filter(a => !a.checkedIn);

  const today = useMemo(() => new Date().toLocaleDateString(undefined, { month: 'long', day: '2-digit', year: 'numeric' }), []);

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(r => r.number.toLowerCase().includes(q) || (r.guestName ?? '').toLowerCase().includes(q));
  }, [rooms, search]);

  const roomsByFloor = useMemo(() => {
    const map = new Map<number, Room[]>();
    for (const r of filteredRooms) {
      if (!map.has(r.floor)) map.set(r.floor, []);
      map.get(r.floor)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [filteredRooms]);

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
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header — property name, stats, Add Request (reference: "My Calendar" + workout/heart-rate + Add Sport) */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-on-surface-strong">{propertyName || 'Cabadra'}</h1>
          <p className="text-xs text-on-surface-strong-muted mt-1">Front desk, live.</p>
        </div>
        <div className="flex items-center gap-6">
          <StatCard label="Total Sales Today" value={stats ? formatCurrency(stats.revenueToday, currency) : '—'} />
          <StatCard label="Occupancy" value={`${occupancyPct}%`} />
          <div className="flex items-center gap-2">
            {hasExternalPms ? (
              <button
                onClick={() => setShowQuickCheckIn(true)}
                className="h-10 px-3 rounded-full bg-primary-container/40 text-on-surface-strong text-xs font-bold flex items-center gap-1.5 hover:bg-primary-container/60 transition-colors whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" /> Add Check-In
              </button>
            ) : (
              <button
                onClick={() => setShowNewBooking(true)}
                className="h-10 px-3 rounded-full bg-primary-container/40 text-on-surface-strong text-xs font-bold flex items-center gap-1.5 hover:bg-primary-container/60 transition-colors whitespace-nowrap"
              >
                <CalendarPlus className="w-4 h-4" /> New Booking
              </button>
            )}
            <button
              onClick={onOpenNewRequest}
              className="h-10 px-4 rounded-full bg-surface-container-lowest text-on-surface text-xs font-bold flex items-center gap-1.5 shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Add Request
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left column — Guest Requests, Upcoming Arrivals, Live Operations, On Shift Now */}
        <div className="xl:col-span-4 flex flex-col gap-4">
          <WhoIsOnShiftCard propertyId={propertyId} />

          <ListCard title="Guest Requests" count={urgentRequests.length} icon={Megaphone} empty="Nothing outstanding — nice.">
            {urgentRequests.map(req => (
              <div key={req.id} onClick={() => setSelectedRequest(req)} className="p-3 hover:bg-surface-container-low transition-colors cursor-pointer group flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-on-surface group-hover:text-primary truncate">{req.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="bg-surface-container-low px-2 py-0.5 rounded text-[10px] font-semibold text-on-surface-variant">Room {req.roomNumber}</span>
                    <span className={`text-[10px] font-bold ${req.priority === 'High Priority' ? 'text-error' : 'text-primary'}`}>{req.priority}</span>
                  </div>
                </div>
                <CheckCircle2 className="w-4 h-4 text-on-surface-variant opacity-0 group-hover:opacity-100 shrink-0" />
              </div>
            ))}
          </ListCard>

          <ListCard title="Upcoming Arrivals" count={upcomingArrivals.length} icon={Star} empty="No arrivals scheduled today.">
            {upcomingArrivals.map(arr => (
              <div key={arr.id} className="relative p-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 relative ${
                  arr.isVip ? 'bg-[var(--color-room-vip)] text-[var(--color-room-vip-on)]' : 'bg-surface-container-high text-primary'
                }`}>
                  {arr.initials}
                  {arr.isVip && <Star className="w-2.5 h-2.5 text-[var(--color-room-vip-on)] fill-current absolute -bottom-0.5 -right-0.5 bg-surface-container-lowest rounded-full" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-on-surface truncate">{arr.guestName}</p>
                  <p className="text-[10px] text-on-surface-variant truncate">ETA: {arr.eta} · {arr.roomType}</p>
                </div>
                {arr.checkedIn ? (
                  <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-1 rounded shrink-0">Checked In</span>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    {arr.isDelayed && <span className="text-[9px] font-bold text-error bg-error-container px-1.5 py-0.5 rounded">Late</span>}
                    <button onClick={() => setEtaEditArrivalId(etaEditArrivalId === arr.id ? null : arr.id)} className="h-7 w-7 flex items-center justify-center rounded border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary" title="Update ETA">
                      <Clock className="w-3 h-3" />
                    </button>
                    <button onClick={() => onCheckInGuest(arr.id)} className="h-7 px-2 rounded border border-outline-variant text-[10px] font-bold text-on-surface hover:border-primary hover:text-primary">
                      Check In
                    </button>
                    <button onClick={() => { if (confirm(`Cancel ${arr.guestName}'s booking?`)) onCancelBooking(arr.id); }} className="h-7 w-7 flex items-center justify-center rounded border border-outline-variant text-on-surface-variant hover:border-error hover:text-error" title="Cancel booking">
                      <XCircle className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {etaEditArrivalId === arr.id && (
                  <div className="absolute top-full right-3 mt-1 flex gap-1 bg-surface-container-lowest border border-outline-variant rounded-lg p-1.5 shadow-lg z-10">
                    {[15, 30, 60].map(mins => (
                      <button key={mins} disabled={savingEta} onClick={() => handleNudgeEta(arr.id, mins)} className="h-7 px-2 rounded text-[11px] font-bold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50">
                        +{mins}m
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </ListCard>

          <ListCard title="Live Operations" count={openTasks.length} icon={ClipboardList} viewAllLabel="Open board" onViewAll={() => onNavigate('live_ops')} empty="Nothing open right now.">
            {openTasks.map(task => (
              <div key={task.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-on-surface truncate">{task.title}</p>
                  <p className="text-[10px] text-on-surface-variant truncate">Room {task.roomNumber} · {task.category}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize shrink-0 ${
                  task.status === 'in_progress' ? 'bg-warning/15 text-warning' : 'bg-surface-container-low text-on-surface-variant'
                }`}>
                  {task.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </ListCard>
        </div>

        {/* Right — date/search header + room grid, replacing the reference's calendar */}
        <div className="xl:col-span-8 bg-surface-container-lowest rounded-2xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-bold text-on-surface">{today}</h2>
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search room or guest name…"
                className="w-full h-9 pl-8 pr-3 text-xs border border-outline-variant rounded-full bg-surface-container-low text-on-surface placeholder-outline focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {roomsByFloor.length === 0 ? (
            <p className="text-xs text-on-surface-variant text-center py-12">
              {search ? `No room or guest matches "${search}".` : 'No rooms yet — add some from Rooms & Floors.'}
            </p>
          ) : (
            <div className="space-y-4 max-h-[560px] overflow-y-auto pr-1">
              {roomsByFloor.map(([floor, floorRooms]) => (
                <div key={floor}>
                  <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Floor {floor}</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {floorRooms.map(room => {
                      const c = ROOM_STATUS_COLOR[room.status];
                      return (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => setSelectedRoomForDetail(room)}
                          title={room.type}
                          className={`${c.bg} ${c.on} rounded-xl p-2.5 aspect-square flex flex-col justify-between text-left transition-all hover:brightness-95 cursor-pointer`}
                        >
                          <span className="text-sm font-bold">{room.number}</span>
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-wide opacity-80">{ROOM_STATUS_LABEL[room.status]}</p>
                            {room.guestName && <p className="text-[10px] font-medium truncate">{room.guestName}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!hasExternalPms && showNewBooking && (
        <NewBookingModal
          propertyId={propertyId}
          currency={currency}
          rooms={rooms}
          onClose={() => setShowNewBooking(false)}
          onBooked={onRefreshRooms}
        />
      )}

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

      {/* PMS-mode quick check-in: the hotel's own PMS owns bookings, so this
          skips availability search entirely — pick a room that's actually
          free right now and check the guest in, the same flow New Booking's
          absence in this mode implies but with its own entry point instead
          of making reception hunt for a ready room in the grid first. */}
      {showQuickCheckIn && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest rounded-2xl max-w-md w-full p-6 shadow-2xl border border-outline-variant space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-on-surface">Check In a Guest</h3>
              <button onClick={() => setShowQuickCheckIn(false)} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-on-surface-variant -mt-2">Pick a room that's ready, cleaning or dirty — occupied rooms aren't shown.</p>
            {checkinableRooms.length === 0 ? (
              <p className="text-xs text-on-surface-variant text-center py-8">No rooms are available to check in right now.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 overflow-y-auto">
                {checkinableRooms.map(room => {
                  const c = ROOM_STATUS_COLOR[room.status];
                  return (
                    <button
                      key={room.id}
                      onClick={() => { setShowQuickCheckIn(false); setCheckInRoom(room); }}
                      className={`${c.bg} ${c.on} rounded-xl p-2.5 aspect-square flex flex-col justify-between text-left hover:brightness-95`}
                    >
                      <span className="text-sm font-bold">{room.number}</span>
                      <p className="text-[9px] font-semibold uppercase tracking-wide opacity-80">{ROOM_STATUS_LABEL[room.status]}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {checkInRoom && (
        <CheckInModal
          propertyId={propertyId}
          room={checkInRoom}
          source={hasExternalPms ? 'imported' : 'built_in'}
          onClose={() => setCheckInRoom(null)}
          onCheckedIn={() => {
            onRefreshRooms();
            setCheckInRoom(null);
          }}
        />
      )}

      {selectedRequest && (
        <RequestActionModal
          request={selectedRequest}
          task={tasks.find(t => t.guestRequestId === selectedRequest.id)}
          directory={directory}
          onAssignTask={onAssignTask}
          onChangeDepartment={onChangeDepartment}
          onUpdateTask={onUpdateTask}
          onRejectTask={onRejectTask}
          onResolveDirect={onResolveUrgentRequest}
          onClose={() => setSelectedRequest(null)}
        />
      )}
    </div>
  );
};
