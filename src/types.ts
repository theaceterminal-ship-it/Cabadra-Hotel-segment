import type { Department } from './lib/departments';
export type AppView =
  | 'owner_overview'
  | 'properties'
  | 'reception'
  | 'dashboard'
  | 'bookings'
  | 'day_close'
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
  | 'shift_coverage'
  | 'departments';

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
  /** The other side has opened the chat since it was sent (0086). */
  seen?: boolean;
}

export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank' | 'other';

/** One line on a stay's bill (folio_charges). Amounts are before tax; GST, when the property charges it, is per line (0079). */
export interface FolioCharge {
  id: string;
  description: string;
  amount: number;
  category: 'room' | 'room_service' | 'spa' | 'laundry' | 'minibar' | 'extra' | 'other';
  postedAt: string;
  /** The night a room charge is for. */
  stayDate?: string;
  taxRate: number;
  taxAmount: number;
  settled: boolean;
  voided: boolean;
  voidReason?: string;
}

/** Money received for a stay, or refunded (folio_payments, 0079). Never edited: a mistake is voided by the owner. */
export interface FolioPayment {
  id: string;
  kind: 'payment' | 'refund';
  amount: number;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  receivedAt: string;
  voided: boolean;
  voidReason?: string;
}

export interface FolioTotals {
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  refunded: number;
  /** total - paid + refunded. Negative means the guest is owed a refund. */
  balance: number;
}

export interface Folio {
  reservationId: string;
  status: 'upcoming' | 'checked_in' | 'checked_out' | 'cancelled';
  checkIn: string;
  checkOut: string;
  ratePerNight?: number;
  /** False for a property that bills rooms in its own PMS: only extras go on Cabadra's bill. */
  billsRoomNights: boolean;
  gstEnabled: boolean;
  charges: FolioCharge[];
  payments: FolioPayment[];
  totals: FolioTotals;
  /** Same as totals.balance; kept for older screens. */
  totalOutstanding: number;
  totalPaid: number;
  invoice: { number: string; shareToken: string; issuedAt: string } | null;
}

/** A bill as printed and as the guest's link shows it: build_bill (0079), frozen into the invoice at check-out. */
export interface Bill {
  number: string | null;
  issuedAt?: string;
  /** True before check-out: the bill so far, not yet numbered. */
  provisional?: boolean;
  shareToken?: string;
  currency: string;
  hotel: { name: string; legalName?: string; address?: string; phone?: string; email?: string; gstin?: string; gstEnabled: boolean };
  guest: { name?: string; phone?: string; email?: string };
  stay: { room?: string; roomType?: string; checkIn: string; checkOut: string; nights: number; ratePerNight?: number; guests?: number };
  lines: { date: string; description: string; category: string; amount: number; taxRate: number; taxAmount: number }[];
  taxSummary: { rate: number; taxable: number; tax: number; cgst: number; sgst: number }[];
  payments: { date: string; kind: 'payment' | 'refund'; method: PaymentMethod; amount: number; reference?: string }[];
  totals: FolioTotals;
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

