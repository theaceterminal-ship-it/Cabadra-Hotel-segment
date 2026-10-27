import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LayoutDashboard, BedDouble, ListChecks, CalendarDays, Sparkles, Users, TrendingUp, ClipboardCheck, ConciergeBell, MessageCircle, Building2, ArrowLeft } from 'lucide-react';
import { StaffPwaInstallPrompt } from '../components/StaffPwaInstallPrompt';
import { ReservedExperiencesView } from '../components/ReservedExperiencesView';
import { GuestCrmView } from '../components/GuestCrmView';
import { ReportsView } from '../components/ReportsView';
import { DayCloseView } from '../components/DayCloseView';
import { AppView, LiveOpsTask, Room, UpcomingArrival, UrgentRequest } from '../types';
import { useAuth, signOut } from '../hooks/useAuth';
import {
  fetchRoomsForProperty,
  updateRoom,
  fetchArrivals,
  checkInReservation,
  cancelReservation,
  fetchGuestRequests,
  resolveGuestRequest,
  logStaffRequest,
  fetchTasks,
  updateTaskStatus,
  completeTask,
  rejectTask,
  updateTaskAssignment,
  reassignTaskDepartment,
  createTask,
  fetchStaffDirectory,
  DirectoryContact,
  fetchPropertyMeta,
  fetchPropertyStats,
  PropertyStats,
} from '../lib/staffApi';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { MobileNav, Sidebar, SidebarNavItem } from '../components/Sidebar';
import { ReceptionDashboard } from '../components/ReceptionDashboard';
import { StaffWelcomeCard } from '../components/StaffWelcomeCard';
import { BookingsView } from '../components/bookings/BookingsView';
import { RoomsFloorsView } from '../components/RoomsFloorsView';
import { LiveOpsView } from '../components/LiveOpsView';
import { ConciergeView } from '../components/ConciergeView';
import { ChatInboxView } from '../components/ChatInboxView';
import { fetchChatInbox } from '../lib/staffApi';
import { DepartmentsView } from '../components/DepartmentsView';
import { NoHotelNotice } from '../components/NoHotelNotice';
import { ReadyToDeliver } from '../components/ReadyToDeliver';
import { NewRequestModal } from '../components/NewRequestModal';
import { SupabaseSetupNeeded } from '../components/SupabaseSetupNeeded';
import { NotificationBell } from '../components/NotificationBell';
import { ThemeToggle } from '../components/ThemeToggle';
import { useSiteTheme, useTheme } from '../hooks/useTheme';
import { useNotifications } from '../hooks/useNotifications';
import LoginPage from './LoginPage';
import { usePwaManifest } from '../hooks/usePwaManifest';

type ReceptionTab = 'dashboard' | 'messages' | 'concierge' | 'bookings' | 'day_close' | 'rooms_floors' | 'live_ops' | 'departments' | 'reserved_experiences' | 'guest_crm' | 'sales_reports';

/** The reception page: `/reception`. Supabase Auth-gated, receptionist role. Every screen is wired to real Supabase data — no mock/local-only state left. */
export default function ReceptionApp() {
  usePwaManifest('staff');
  const { loading, session, assignments, assignmentsReady, assignmentsError, refreshAssignments } = useAuth();
  const [view, setView] = useState<ReceptionTab>('dashboard');
  // Guest messages nobody at the desk has read yet, for the Messages badge.
  const [unreadChats, setUnreadChats] = useState(0);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  // The website's palette and shapes, the same as the owner side; the toggle still switches it to dark.
  useSiteTheme();
  const [theme, setTheme] = useTheme();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [urgentRequests, setUrgentRequests] = useState<UrgentRequest[]>([]);
  const [upcomingArrivals, setUpcomingArrivals] = useState<UpcomingArrival[]>([]);
  const [tasks, setTasks] = useState<LiveOpsTask[]>([]);
  const [directory, setDirectory] = useState<DirectoryContact[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [propertyName, setPropertyName] = useState('');
  const [upiId, setUpiId] = useState<string | undefined>(undefined);
  const [hasExternalPms, setHasExternalPms] = useState(false);
  const [propertyImage, setPropertyImage] = useState<string | undefined>();
  const [stats, setStats] = useState<PropertyStats | null>(null);

  const propertyId = assignments.find(a => a.role === 'receptionist')?.propertyId;
  const { notifications, unreadCount, markRead, markAllRead, date: notificationsDate, setDate: setNotificationsDate } = useNotifications(propertyId);

  const reloadRoomsAndArrivals = async (pid: string) => {
    try {
      const [freshRooms, freshArrivals] = await Promise.all([fetchRoomsForProperty(pid), fetchArrivals(pid)]);
      setRooms(freshRooms);
      setUpcomingArrivals(freshArrivals);
    } catch (err) {
      console.warn('Failed to load rooms/arrivals from Supabase:', err);
    }
    // Occupancy/sales-today ride along with every room reload — checkin,
    // checkout, and order updates all already call this.
    fetchPropertyStats(pid).then(setStats).catch(err => console.warn('Failed to load property stats:', err));
  };

  const reloadRequests = async (pid: string) => {
    try {
      setUrgentRequests(await fetchGuestRequests(pid));
    } catch (err) {
      console.warn('Failed to load guest requests from Supabase:', err);
    }
  };

  const reloadTasks = async (pid: string) => {
    try {
      setTasks(await fetchTasks(pid));
    } catch (err) {
      console.warn('Failed to load tasks from Supabase:', err);
    }
  };

  useEffect(() => {
    if (!propertyId) return;
    reloadRoomsAndArrivals(propertyId);
    reloadRequests(propertyId);
    reloadTasks(propertyId);
    fetchPropertyMeta(propertyId).then(meta => { setCurrency(meta.currency); setPropertyName(meta.name); setUpiId(meta.upiId); setHasExternalPms(meta.hasExternalPms); setPropertyImage(meta.image); }).catch(err => console.warn('Failed to load property currency:', err));
    fetchStaffDirectory(propertyId).then(setDirectory).catch(err => console.warn('Failed to load staff directory:', err));
  }, [propertyId]);

  const handleAssignTask = (taskId: string, assignedTo: string | null) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, assignedTo: assignedTo ?? undefined } : t));
    updateTaskAssignment(taskId, assignedTo).catch(err => console.warn(`Failed to assign task ${taskId}:`, err));
  };

  const handleChangeTaskDepartment = (taskId: string, department: LiveOpsTask['category']) => {
    // Clears assigned_to locally too — the RPC clears it server-side for
    // the same reason (0055): whoever was assigned belonged to the old
    // department's queue, not necessarily this one.
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, category: department, assignedTo: undefined } : t));
    reassignTaskDepartment(taskId, department).catch(err => {
      console.warn(`Failed to move task ${taskId} to ${department}:`, err);
      if (propertyId) reloadTasks(propertyId);
    });
  };

  const handleUpdateRoom = (updatedRoom: Room) => {
    // Optimistic update so the modal feels instant, then persist and
    // reconcile — a failed write is rare enough that a console warning plus
    // the next reload catching it up is an acceptable trade-off here.
    setRooms(prev => prev.map(r => r.id === updatedRoom.id ? updatedRoom : r));
    updateRoom(updatedRoom.id, {
      status: updatedRoom.status,
      notes: updatedRoom.notes,
      cleanProgress: updatedRoom.cleanProgress,
      maintenanceEta: updatedRoom.maintenanceEta,
      issueDescription: updatedRoom.issueDescription,
    }).catch(err => console.warn(`Failed to save room ${updatedRoom.id} to Supabase:`, err));
  };

  const handleResolveUrgentRequest = (requestId: string) => {
    setUrgentRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'resolved' } : r));
    resolveGuestRequest(requestId).catch(err => console.warn(`Failed to resolve request ${requestId}:`, err));
  };

  const handleCheckInGuest = async (arrivalId: string) => {
    setUpcomingArrivals(prev => prev.map(a => a.id === arrivalId ? { ...a, checkedIn: true } : a));
    try {
      await checkInReservation(arrivalId);
      if (propertyId) await reloadRoomsAndArrivals(propertyId);
    } catch (err) {
      console.warn(`Failed to check in reservation ${arrivalId}:`, err);
    }
  };

  const handleCancelBooking = async (arrivalId: string) => {
    setUpcomingArrivals(prev => prev.filter(a => a.id !== arrivalId));
    try {
      await cancelReservation(arrivalId);
    } catch (err) {
      console.warn(`Failed to cancel booking ${arrivalId}:`, err);
      if (propertyId) await reloadRoomsAndArrivals(propertyId); // undo the optimistic removal on failure
    }
  };

  const handleUpdateTask = async (updatedTask: LiveOpsTask) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));

    // Extract digits and find target room for real-time status transition
    const digits = updatedTask.roomNumber?.replace(/[^0-9]/g, '');
    const isHousekeeping = updatedTask.category === 'housekeeping' || updatedTask.title.toLowerCase().includes('clean');

    if (digits && isHousekeeping) {
      const targetRoom = rooms.find(r => r.number === digits || r.id.endsWith(`-${digits}`) || r.id === updatedTask.roomNumber);

      if (updatedTask.status === 'in_progress') {
        setRooms(prev => prev.map(r => (r.number === digits || r.id === targetRoom?.id) ? { ...r, status: 'cleaning' } : r));
        if (targetRoom) {
          updateRoom(targetRoom.id, { status: 'cleaning' }).catch(err => console.warn('Failed to update room to cleaning:', err));
        }
      } else if (updatedTask.status === 'completed') {
        setRooms(prev => prev.map(r => (r.number === digits || r.id === targetRoom?.id) ? { ...r, status: 'ready', cleanProgress: 100 } : r));
        if (targetRoom) {
          updateRoom(targetRoom.id, { status: 'ready', cleanProgress: 100 }).catch(err => console.warn('Failed to update room to ready:', err));
        }
      }
    }

    try {
      if (updatedTask.status === 'completed') {
        await completeTask(updatedTask.id);
      } else {
        await updateTaskStatus(updatedTask.id, updatedTask.status as 'pending' | 'in_progress');
      }
    } catch (err) {
      console.warn(`Failed to update task ${updatedTask.id}:`, err);
    } finally {
      if (propertyId) {
        await Promise.all([reloadRoomsAndArrivals(propertyId), reloadTasks(propertyId)]);
      }
    }
  };

  const handleRejectTask = (task: LiveOpsTask, note: string) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'rejected', rejectionNote: note } : t));
    rejectTask(task.id, note).catch(err => {
      console.warn(`Failed to reject task ${task.id}:`, err);
      if (propertyId) reloadTasks(propertyId);
    });
  };

  const handleAddTask = async (newTask: Omit<LiveOpsTask, 'id' | 'taskToken'>) => {
    if (!propertyId) return;
    try {
      await createTask(propertyId, newTask);
      await reloadTasks(propertyId);
    } catch (err) {
      console.warn('Failed to create task:', err);
    }
  };

  const handleSubmitStaffRequest = async (input: { roomNumber?: string; title: string; priority: UrgentRequest['priority']; department?: UrgentRequest['department'] }) => {
    if (!propertyId || !input.roomNumber) return;
    try {
      // The matching task (department, linked via guest_request_id) is
      // created automatically by a DB trigger now (0053) — a
      // guest_requests insert always gets dispatched, from either origin,
      // so there's no separate dispatch step here to duplicate it.
      await logStaffRequest(propertyId, input.roomNumber, input.title, input.priority, input.department ?? 'concierge');
      await Promise.all([reloadRequests(propertyId), reloadTasks(propertyId)]);
    } catch (err) {
      console.warn('Failed to log request:', err);
    }
  };

  // Live Realtime Polling for Rooms, Guest Requests & Live Ops Tasks
  useEffect(() => {
    if (!propertyId) return;
    const poll = () => {
      reloadRoomsAndArrivals(propertyId);
      reloadRequests(propertyId);
      reloadTasks(propertyId);
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [propertyId]);

  // The Messages badge, kept fresh on every tab (the inbox itself refreshes faster while open).
  useEffect(() => {
    if (!propertyId || view === 'messages') return;
    const poll = () => fetchChatInbox(propertyId).then(rows => setUnreadChats(rows.reduce((n, r) => n + r.unread, 0))).catch(() => {});
    poll();
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [propertyId, view]);

  if (!isSupabaseConfigured) return <SupabaseSetupNeeded />;
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-surface text-sm text-on-surface-strong">Loading…</div>;
  if (!session) return <LoginPage roleLabel="Reception" />;
  // Just signed in: wait for the account's hotels instead of flashing "no hotel" first.
  if (!assignmentsReady) return <div className="min-h-screen flex items-center justify-center bg-surface text-sm text-on-surface-strong">Loading…</div>;

  if (!propertyId) {
    return <NoHotelNotice email={session.user.email} assignments={assignments} error={assignmentsError} onRetry={refreshAssignments} onSignOut={() => signOut()} />;
  }

  const openRequestsCount = urgentRequests.filter(r => r.status === 'open').length;
  const openTasksCount = tasks.filter(t => t.status !== 'completed' && t.status !== 'rejected').length;

  const navItems: SidebarNavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: openRequestsCount },
    { id: 'messages', label: 'Messages', icon: MessageCircle, badge: unreadChats },
    // Bookings are the built-in PMS's; a hotel on its own PMS books there.
    ...(hasExternalPms ? [] : [{ id: 'bookings', label: 'Bookings', icon: CalendarDays }]),
    { id: 'rooms_floors', label: 'Rooms', icon: BedDouble },
    { id: 'live_ops', label: 'Tasks', icon: ListChecks, badge: openTasksCount },
    // Each team's screen QR, staff, shifts, and the kitchen link.
    { id: 'departments', label: 'Departments', icon: Building2 },
    { id: 'reserved_experiences', label: 'Experiences', icon: Sparkles },
    { id: 'concierge', label: 'Concierge', icon: ConciergeBell },
    { id: 'guest_crm', label: 'Guests', icon: Users },
  ];

  return (
    <div className="min-h-screen w-full bg-surface flex">
      <Sidebar
        navItems={navItems}
        activeId={view}
        onNavigate={(id) => setView(id as ReceptionTab)}
        onSignOut={() => signOut()}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-14 flex items-center justify-end gap-3 px-4 sm:px-6 shrink-0 sticky top-0 z-30 bg-surface/90 backdrop-blur-xl md:static md:bg-transparent md:backdrop-blur-0">
          <span className="md:hidden size-8 rounded-full bg-primary text-on-primary flex items-center justify-center text-sm font-semibold shrink-0">C</span>
          <p className="mr-auto text-sm font-medium text-on-surface-variant truncate">{propertyName}</p>
          <div className="hidden md:block"><ThemeToggle theme={theme} onChange={setTheme} /></div>
          <NotificationBell notifications={notifications} unreadCount={unreadCount} onMarkRead={markRead} onMarkAllRead={markAllRead} date={notificationsDate} onDateChange={setNotificationsDate} onOpen={n => { if (n.type === 'folio_chat_message') setView('messages'); }} />
        </div>
        <StaffPwaInstallPrompt />

        <div className="flex-1 overflow-y-auto pt-0 pb-24 md:pb-0">
          {/* A short fade-and-rise between screens, so switching tabs feels like moving, not flickering. */}
          <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            className="h-full"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
          {view === 'dashboard' && (
            <>
            <div className="px-4 sm:px-6 pb-2">
              <StaffWelcomeCard
                name={(session?.user.user_metadata?.full_name || session?.user.user_metadata?.name) as string | undefined}
                fallbackName="front desk team"
                role={assignments.find(a => a.propertyId === propertyId)?.role === 'owner' ? 'Owner' : 'Front desk'}
                propertyName={propertyName}
                propertyImage={propertyImage}
              />
              {/* The day's paperwork, from the dashboard rather than the sidebar. */}
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setView('day_close')} className="h-10 px-4 rounded-full bg-surface-container-lowest border border-outline-variant text-sm font-medium text-on-surface inline-flex items-center gap-2 hover:bg-surface-container-low transition-colors">
                  <ClipboardCheck className="size-4" /> Day close
                </button>
                <button onClick={() => setView('sales_reports')} className="h-10 px-4 rounded-full bg-surface-container-lowest border border-outline-variant text-sm font-medium text-on-surface inline-flex items-center gap-2 hover:bg-surface-container-low transition-colors">
                  <TrendingUp className="size-4" /> Reports
                </button>
              </div>
              {propertyId && <div className="mt-3"><ReadyToDeliver propertyId={propertyId} /></div>}
            </div>
            <ReceptionDashboard
              propertyId={propertyId}
              propertyName={propertyName}
              currency={currency}
              upiId={upiId}
              hasExternalPms={hasExternalPms}
              rooms={rooms}
              urgentRequests={urgentRequests.filter(r => r.status === 'open')}
              upcomingArrivals={upcomingArrivals}
              tasks={tasks}
              directory={directory}
              stats={stats}
              onResolveUrgentRequest={handleResolveUrgentRequest}
              onUpdateTask={handleUpdateTask}
              onRejectTask={handleRejectTask}
              onAssignTask={handleAssignTask}
              onChangeDepartment={handleChangeTaskDepartment}
              onCheckInGuest={handleCheckInGuest}
              onCancelBooking={handleCancelBooking}
              onUpdateRoom={handleUpdateRoom}
              onRefreshRooms={() => propertyId && reloadRoomsAndArrivals(propertyId)}
              onOpenNewRequest={() => setIsRequestModalOpen(true)}
              onNavigate={(v: AppView) => setView(v as ReceptionTab)}
            />
            </>
          )}
          {view === 'bookings' && propertyId && !hasExternalPms && (
            <BookingsView
              propertyId={propertyId}
              propertyName={propertyName}
              currency={currency}
              upiId={upiId}
              rooms={rooms}
              onRefreshRooms={() => reloadRoomsAndArrivals(propertyId)}
            />
          )}
          {view === 'rooms_floors' && (
            <RoomsFloorsView
              propertyId={propertyId}
              propertyName={propertyName}
              currency={currency}
              upiId={upiId}
              hasExternalPms={hasExternalPms}
              rooms={rooms}
              onUpdateRoom={handleUpdateRoom}
              onOpenNewRequest={() => setIsRequestModalOpen(true)}
              onRefreshRooms={() => propertyId && reloadRoomsAndArrivals(propertyId)}
            />
          )}
          {view === 'live_ops' && (
            <LiveOpsView
              propertyId={propertyId ?? ''}
              currency={currency}
              tasks={tasks}
              directory={directory}
              rooms={rooms}
              onUpdateTask={handleUpdateTask}
              onRejectTask={handleRejectTask}
              onAssignTask={handleAssignTask}
              onChangeDepartment={handleChangeTaskDepartment}
              onAddTask={handleAddTask}
              onRefresh={() => propertyId && reloadTasks(propertyId)}
              onNavigate={(v: AppView) => setView(v as ReceptionTab)}
            />
          )}
          {view === 'reserved_experiences' && (
            <ReservedExperiencesView propertyId={propertyId ?? ''} currency={currency} />
          )}
          {view === 'guest_crm' && (
            <GuestCrmView
              propertyId={propertyId ?? ''}
              propertyName={propertyName}
              currency={currency}
              upiId={upiId}
              onRefreshRooms={() => propertyId && reloadRoomsAndArrivals(propertyId)}
            />
          )}
          {view === 'concierge' && propertyId && <ConciergeView propertyId={propertyId} />}
          {view === 'messages' && propertyId && <ChatInboxView propertyId={propertyId} onUnreadChange={setUnreadChats} />}
          {(view === 'day_close' || view === 'sales_reports') && (
            <div className="px-4 sm:px-6 pb-2">
              <button onClick={() => setView('dashboard')} className="h-9 pl-2 pr-3.5 rounded-full text-sm font-medium text-on-surface-variant hover:bg-surface-container-low inline-flex items-center gap-1.5">
                <ArrowLeft className="size-4" /> Dashboard
              </button>
            </div>
          )}
          {view === 'departments' && propertyId && <DepartmentsView propertyId={propertyId} directory={directory} tasks={tasks} onOpenTasks={() => setView('live_ops')} />}
          {view === 'day_close' && propertyId && <DayCloseView propertyId={propertyId} propertyName={propertyName} currency={currency} />}
          {view === 'sales_reports' && propertyId && <ReportsView propertyId={propertyId} propertyName={propertyName} currency={currency} hasExternalPms={hasExternalPms} />}
          </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <MobileNav
        navItems={navItems}
        primaryIds={hasExternalPms ? ['dashboard', 'messages', 'live_ops', 'departments'] : ['dashboard', 'bookings', 'messages', 'live_ops']}
        activeId={view}
        onNavigate={(id) => setView(id as ReceptionTab)}
        onSignOut={() => signOut()}
        extra={<ThemeToggle theme={theme} onChange={setTheme} />}
      />

      <NewRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        mode="staff"
        rooms={rooms}
        onSubmit={handleSubmitStaffRequest}
      />
    </div>
  );
}
