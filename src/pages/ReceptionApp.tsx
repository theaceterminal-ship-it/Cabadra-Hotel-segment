import React, { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, BedDouble, ListChecks, UtensilsCrossed, Truck } from 'lucide-react';
import { AppView, KdsOrder, LiveOpsTask, Room, UpcomingArrival, UrgentRequest } from '../types';
import { useAuth, signOut } from '../hooks/useAuth';
import {
  fetchOrdersForProperty,
  updateOrderStatus,
  rejectOrder,
  StaffOrder,
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
  createTask,
  fetchPropertyCurrency,
} from '../lib/staffApi';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { Sidebar, SidebarNavItem } from '../components/Sidebar';
import { ReceptionDashboard } from '../components/ReceptionDashboard';
import { RoomsFloorsView } from '../components/RoomsFloorsView';
import { LiveOpsView } from '../components/LiveOpsView';
import { KitchenKDS } from '../components/KitchenKDS';
import { ActiveDeliveries } from '../components/ActiveDeliveries';
import { NewRequestModal } from '../components/NewRequestModal';
import { SupabaseSetupNeeded } from '../components/SupabaseSetupNeeded';
import { NotificationBell } from '../components/NotificationBell';
import { useNotifications } from '../hooks/useNotifications';
import LoginPage from './LoginPage';

type ReceptionTab = 'dashboard' | 'rooms_floors' | 'live_ops' | 'kitchen_kds' | 'active_deliveries';

const SIDEBAR_COLLAPSED_KEY = 'cabadra:reception-sidebar-collapsed';

function supabaseOrderToKdsOrder(order: StaffOrder, previouslySeen?: KdsOrder): KdsOrder {
  const roomNumber = order.roomId.split('-').pop() ?? order.roomId;
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(order.createdAt).getTime()) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
  const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
  return {
    id: order.id,
    orderNumber: `#${order.id.slice(0, 4)}`,
    roomNumber: `Room ${roomNumber}`,
    status: order.status,
    timeElapsed: `${minutes}:${seconds}`,
    timerSeconds: elapsedSeconds,
    isOverdue: elapsedSeconds > 900,
    items: order.items.map((i, idx) => ({
      name: i.name,
      quantity: i.quantity,
      modifier: i.fromRecommendation ? 'Guest picked from recommendations' : undefined,
      // The order model has no per-item "completed" checklist field — that's
      // local kitchen-checklist state, carried over from what's already on
      // screen instead of resetting every poll.
      completed: previouslySeen?.items[idx]?.completed,
    })),
    notes: order.notes,
    rejectionNote: order.rejectionNote,
  };
}

/** The reception page: `/reception`. Supabase Auth-gated, receptionist role. Every screen is wired to real Supabase data — no mock/local-only state left. */
export default function ReceptionApp() {
  const { loading, session, assignments } = useAuth();
  const [view, setView] = useState<ReceptionTab>('dashboard');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'; } catch { return false; }
  });

  const [rooms, setRooms] = useState<Room[]>([]);
  const [urgentRequests, setUrgentRequests] = useState<UrgentRequest[]>([]);
  const [upcomingArrivals, setUpcomingArrivals] = useState<UpcomingArrival[]>([]);
  const [tasks, setTasks] = useState<LiveOpsTask[]>([]);
  const [kdsOrders, setKdsOrders] = useState<KdsOrder[]>([]);
  const [currency, setCurrency] = useState('USD');
  const syncInFlight = useRef(false);

  const propertyId = assignments.find(a => a.role === 'receptionist')?.propertyId;
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(propertyId);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch { /* private-mode storage can throw — collapsing still works for this session */ }
      return next;
    });
  };

  const reloadRoomsAndArrivals = async (pid: string) => {
    try {
      const [freshRooms, freshArrivals] = await Promise.all([fetchRoomsForProperty(pid), fetchArrivals(pid)]);
      setRooms(freshRooms);
      setUpcomingArrivals(freshArrivals);
    } catch (err) {
      console.warn('Failed to load rooms/arrivals from Supabase:', err);
    }
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
    fetchPropertyCurrency(propertyId).then(setCurrency).catch(err => console.warn('Failed to load property currency:', err));
  }, [propertyId]);

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

  const handleUpdateTask = (updatedTask: LiveOpsTask) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    updateTaskStatus(updatedTask.id, updatedTask.status).catch(err => console.warn(`Failed to update task ${updatedTask.id}:`, err));
  };

  const handleAddTask = async (newTask: Omit<LiveOpsTask, 'id'>) => {
    if (!propertyId) return;
    try {
      await createTask(propertyId, newTask);
      await reloadTasks(propertyId);
    } catch (err) {
      console.warn('Failed to create task:', err);
    }
  };

  const handleSubmitStaffRequest = async (input: { roomNumber?: string; title: string; priority: UrgentRequest['priority']; autoDispatchTask?: boolean }) => {
    if (!propertyId || !input.roomNumber) return;
    try {
      await logStaffRequest(propertyId, input.roomNumber, input.title, input.priority);
      if (input.autoDispatchTask) {
        await createTask(propertyId, {
          roomNumber: `Room ${input.roomNumber}`,
          title: input.title,
          description: 'Auto-dispatched from urgent guest reception desk ticket.',
          priority: input.priority === 'High Priority' ? 'high' : 'standard',
          dueTime: '15 mins',
          status: 'pending',
          category: /towel|clean/i.test(input.title) ? 'housekeeping' : 'amenities',
        });
      }
      await Promise.all([reloadRequests(propertyId), reloadTasks(propertyId)]);
    } catch (err) {
      console.warn('Failed to log request:', err);
    }
  };

  const handleUpdateKdsOrder = (updatedOrder: KdsOrder) => {
    const prevStatus = kdsOrders.find(o => o.id === updatedOrder.id)?.status;
    setKdsOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    if (updatedOrder.status !== prevStatus) {
      syncInFlight.current = true;
      updateOrderStatus(updatedOrder.id, updatedOrder.status)
        .catch(err => console.warn(`Failed to sync order ${updatedOrder.id} status to Supabase:`, err))
        .finally(() => { syncInFlight.current = false; });
    }
  };

  const handleRejectOrder = async (orderId: string, note: string) => {
    setKdsOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'rejected', rejectionNote: note } : o));
    try {
      syncInFlight.current = true;
      await rejectOrder(orderId, note);
    } catch (err) {
      console.warn(`Failed to reject order ${orderId}:`, err);
      if (propertyId) {
        const orders = await fetchOrdersForProperty(propertyId).catch(() => null);
        if (orders) setKdsOrders(orders.map(o => supabaseOrderToKdsOrder(o, undefined)));
      }
    } finally {
      syncInFlight.current = false;
    }
  };

  // Polls real orders for the KDS board — this is the one screen that needs
  // live push-like behavior, since a guest can place an order at any moment
  // from a page this tab has no other way to hear from.
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    const poll = async () => {
      if (syncInFlight.current) return;
      try {
        const orders = await fetchOrdersForProperty(propertyId);
        if (cancelled) return;
        setKdsOrders(prev => orders.map(o => supabaseOrderToKdsOrder(o, prev.find(p => p.id === o.id))));
      } catch (err) {
        console.warn('Failed to poll orders from Supabase:', err);
      }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [propertyId]);

  if (!isSupabaseConfigured) return <SupabaseSetupNeeded />;
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#f6faff] text-sm text-[#4e463a]">Loading…</div>;
  if (!session) return <LoginPage roleLabel="Reception" />;

  if (!propertyId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6faff] p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-bold text-[#141d23]">No property assigned yet</h1>
          <p className="text-sm text-[#4e463a]">
            You're signed in, but this account isn't linked to a property as a receptionist. See the note at the
            bottom of supabase/seed.sql for how to grant access — insert a row into staff_properties with role 'receptionist'.
          </p>
          <button onClick={() => signOut()} className="text-xs font-semibold text-[#765a25] hover:underline">Sign out</button>
        </div>
      </div>
    );
  }

  const openRequestsCount = urgentRequests.filter(r => r.status === 'open').length;
  const openTasksCount = tasks.filter(t => t.status !== 'completed').length;
  const activeOrdersCount = kdsOrders.filter(o => o.status !== 'delivered').length;

  const navItems: SidebarNavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: openRequestsCount },
    { id: 'rooms_floors', label: 'Rooms & Floors', icon: BedDouble },
    { id: 'live_ops', label: 'Live Ops & Tasks', icon: ListChecks, badge: openTasksCount },
    { id: 'kitchen_kds', label: 'Kitchen KDS', icon: UtensilsCrossed, badge: activeOrdersCount },
    { id: 'active_deliveries', label: 'Active Deliveries', icon: Truck },
  ];

  return (
    <div className="min-h-screen w-full bg-[#f6faff] flex">
      <Sidebar
        title="Cabadra Reception"
        navItems={navItems}
        activeId={view}
        onNavigate={(id) => setView(id as ReceptionTab)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        onSignOut={() => signOut()}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-14 bg-white border-b border-[#E9ECEF] flex items-center justify-end px-4 sm:px-6 shrink-0">
          <NotificationBell notifications={notifications} unreadCount={unreadCount} onMarkRead={markRead} onMarkAllRead={markAllRead} />
        </div>

        <div className="flex-1 overflow-y-auto">
          {view === 'dashboard' && (
            <ReceptionDashboard
              propertyId={propertyId}
              currency={currency}
              rooms={rooms}
              urgentRequests={urgentRequests.filter(r => r.status === 'open')}
              upcomingArrivals={upcomingArrivals}
              tasks={tasks}
              kdsOrders={kdsOrders}
              notifications={notifications}
              onResolveUrgentRequest={handleResolveUrgentRequest}
              onCheckInGuest={handleCheckInGuest}
              onCancelBooking={handleCancelBooking}
              onRefreshRooms={() => propertyId && reloadRoomsAndArrivals(propertyId)}
              onOpenNewRequest={() => setIsRequestModalOpen(true)}
              onMarkNotificationRead={markRead}
              onNavigate={(v: AppView) => setView(v as ReceptionTab)}
            />
          )}
          {view === 'rooms_floors' && (
            <RoomsFloorsView
              propertyId={propertyId}
              currency={currency}
              rooms={rooms}
              onUpdateRoom={handleUpdateRoom}
              onOpenNewRequest={() => setIsRequestModalOpen(true)}
              onRefreshRooms={() => propertyId && reloadRoomsAndArrivals(propertyId)}
            />
          )}
          {view === 'live_ops' && (
            <LiveOpsView
              tasks={tasks}
              onUpdateTask={handleUpdateTask}
              onAddTask={handleAddTask}
              onRefresh={() => propertyId && reloadTasks(propertyId)}
              onNavigate={(v: AppView) => setView(v as ReceptionTab)}
            />
          )}
          {view === 'kitchen_kds' && (
            <KitchenKDS orders={kdsOrders} onUpdateOrder={handleUpdateKdsOrder} onRejectOrder={handleRejectOrder} onNavigate={(v: AppView) => setView(v as ReceptionTab)} />
          )}
          {view === 'active_deliveries' && <ActiveDeliveries propertyId={propertyId} onNavigate={(v: AppView) => setView(v as ReceptionTab)} />}
        </div>
      </div>

      <NewRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        mode="staff"
        onSubmit={handleSubmitStaffRequest}
      />
    </div>
  );
}
