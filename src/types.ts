import type { Department } from './lib/departments';
export type AppView =
  | 'owner_overview'
  | 'properties'
  | 'reception'
  | 'dashboard'
  | 'rooms_floors'
  | 'live_ops'
  | 'reserved_experiences'
  | 'guest_crm'
  | 'sales_reports'
  | 'kitchen_kds'
  | 'active_deliveries'
  | 'guest_home'
  | 'room_dining'
  | 'guest_activities'
  | 'shift_coverage';

export type RoomStatus = 'ready' | 'occupied' | 'cleaning' | 'dirty' | 'occupied_vip' | 'maintenance';

export interface Room {
  id: string;
  number: string;
  type: string;
  floor: number;
  /** How many guests this room sleeps — what the New Booking search filters availability on. */
  maxOccupancy: number;
  bedsDescription?: string;
  bathroomDetails?: string;
  status: RoomStatus;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
  /** URL of an uploaded ID/passport photo, if one was collected at check-in — see staff_checkin_new_guest. */
  guestIdDocumentUrl?: string;
  checkoutInfo?: string;
  notes?: string;
  cleanProgress?: number;
  maintenanceEta?: string;
  issueDescription?: string;
  pricePerNight: number;
  image?: string;
  /** Random code printed in the room's QR (/guest/room/<qrCode>); never the room id, so links can't be guessed. See 0074. */
  qrCode?: string;
  /** The current guest's link token — set only when the room is genuinely occupied by a checked-in reservation. Builds their guest_token URL: /guest/:guestToken. */
  guestToken?: string;
  /** The checked-in reservation behind this room's occupancy, if any — what staff_get_folio/staff_checkout_reservation key off. */
  reservationId?: string;
}

export interface Property {
  id: string;
  name: string;
  location: string;
  country?: string;
  /** ISO 4217 code, e.g. 'USD', 'INR' — set once at property creation from the owner's chosen country. Defaults to 'USD' for properties created before currency support existed. */
  currency: string;
  status: 'active' | 'maintenance' | 'paused';
  occupancy: number;
  revenueToday: string;
  ordersToday: number;
  requestsCount: number;
  totalRooms: number;
  totalRevenue: string;
  avgOrderValue: string;
  image: string;
  modelImage: string;
  /** UPI ID for guest/front-desk payment QR codes — set once by the owner (Overview tab), optional. */
  upiId?: string;
  /** true = this hotel already runs its own PMS for bookings; Cabadra hides its own New Booking/availability-search flow and Reception just links a guest to a room via a room tile. false (default) = Cabadra is the front desk. */
  hasExternalPms: boolean;
}

/** A size (pick one; its price replaces the dish's) or an add-on (pick any; adds its price). */
export interface MenuOption {
  id: string;
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  image: string;
  isVeg: boolean;
  tags: string[];
  prepTime?: string;
  /** Sizes. When there are any, the guest must pick one. See 0073_menu_options_and_server_pricing.sql. */
  variations?: MenuOption[];
  addons?: MenuOption[];
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  specialInstructions?: string;
}

export interface KdsOrder {
  id: string;
  orderNumber: string;
  roomNumber: string;
  isVip?: boolean;
  isRush?: boolean;
  status: 'new' | 'preparing' | 'ready' | 'delivered' | 'rejected';
  timeElapsed: string;
  timerSeconds: number;
  isOverdue?: boolean;
  notes?: string;
  /** Why the kitchen rejected it — required whenever status is 'rejected'. */
  rejectionNote?: string;
  items: {
    name: string;
    quantity: number;
    modifier?: string;
    completed?: boolean;
  }[];
}

export interface LiveOpsTask {
  id: string;
  roomNumber: string;
  title: string;
  description: string;
  priority: 'high' | 'standard';
  dueTime: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  assignedTo?: string;
  category: Department;
  /** The capability token behind this task's QR — whoever scans it can start/complete this one task, no login. See service_task_resolve (0025_task_qr.sql). */
  taskToken: string;
  /** Why staff couldn't do this — required whenever status is 'rejected'. See staff_reject_task (0045). */
  rejectionNote?: string;
  /** Set only for a billable task (a late-checkout fee, an in-room massage) — posts to the guest's folio atomically on completion. See staff_complete_task (0045). */
  price?: number;
  /** The guest_requests row this task answers, if any — completing the task resolves the request in the same write. See staff_complete_task (0045). */
  guestRequestId?: string;
  createdAt?: string;
}

export interface UpcomingArrival {
  id: string;
  guestName: string;
  initials: string;
  eta: string;
  roomType: string;
  isVip?: boolean;
  isDelayed?: boolean;
  assignedRoom?: string;
  checkedIn?: boolean;
}

export interface UrgentRequest {
  id: string;
  title: string;
  timeAgo: string;
  roomNumber: string;
  priority: 'High Priority' | 'Pending Approval' | 'Standard';
  isUrgent: boolean;
  status: 'open' | 'resolved';
  /** Which department it's routed to — matches LiveOpsTask.category, so a request and a dispatched task speak the same vocabulary. */
  department: Department;
}

export interface AppNotification {
  id: string;
  type: 'new_order' | 'guest_request' | 'high_priority_request' | 'task_created' | 'new_arrival' | 'folio_chat_message';
  title: string;
  body: string;
  roomNumber?: string;
  createdAt: string;
  read: boolean;
}

/** One message in a stay's Folio Chat thread (0052) — shared shape between guestApi.ts (token-scoped) and staffApi.ts (RLS-scoped). */
export interface FolioChatMessage {
  id: string;
  sender: 'guest' | 'staff';
  body: string;
  createdAt: string;
}

export interface FolioCharge {
  id: string;
  description: string;
  amount: number;
  category: 'room_service' | 'spa' | 'laundry' | 'minibar' | 'other';
  postedAt: string;
  settled: boolean;
}

export interface Folio {
  reservationId: string;
  status: 'upcoming' | 'checked_in' | 'checked_out' | 'cancelled';
  checkIn: string;
  checkOut: string;
  charges: FolioCharge[];
  totalOutstanding: number;
  totalPaid: number;
}

export interface GuestExperienceBooking {
  id: string;
  experienceName: string;
  totalPrice: number;
  guestCount: number;
  preferredTime?: string;
  scheduledTime?: string;
  unitLabel?: string;
  notes?: string;
  status: 'pending' | 'requested' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface StaffExperienceBooking {
  id: string;
  reservationId: string;
  guestName: string;
  roomNumber: string;
  experienceName: string;
  totalPrice: number;
  guestCount: number;
  preferredTime?: string;
  scheduledTime?: string;
  unitLabel?: string;
  notes?: string;
  status: 'pending' | 'requested' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface GuestCrmEntry {
  reservationId: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestIdDocumentUrl?: string;
  vip: boolean;
  roomNumber: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  checkedOutAt?: string;
  status: 'checked_in' | 'checked_out' | 'upcoming' | 'cancelled';
  guestToken?: string;
  totalSpend: number;
}

export interface SalesReportData {
  startDate: string;
  endDate: string;
  roomSales: number;
  diningSales: number;
  experienceSales: number;
  otherSales: number;
  totalSales: number;
  cashSales: number;
  cardSales: number;
  upiSales: number;
  checkinsCount: number;
  completedOrdersCount: number;
}
