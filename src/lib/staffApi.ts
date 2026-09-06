/**
 * Staff-facing data access (owner + receptionist). Every query here relies
 * on RLS (supabase/migrations/0001_init.sql) to scope results to properties
 * the signed-in user is staff on — there is no explicit `.eq('property_id', ...)`
 * filter missing here that RLS would silently need to catch; the filters
 * below are for narrowing within an already-authorized set, not for
 * security.
 */

import { supabase } from './supabaseClient';
import type { Property, Room, RoomStatus, UpcomingArrival, UrgentRequest, LiveOpsTask, MenuItem, AppNotification, Folio } from '../types';
import { formatCurrency } from './currency';

/** Turns "Deluxe King 204" into a URL/id-safe slug. Rooms' primary key is global (not scoped by property_id), so this is prefixed with the property id to guarantee uniqueness — same convention as supabase/seed.sql. */
function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'item';
}

/** "Departing today" / "Departing in N days", matching the original mock copy's style. */
function formatCheckoutInfo(checkOutIso: string): string {
  const checkOut = new Date(checkOutIso);
  const days = Math.ceil((checkOut.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Checkout today';
  if (days === 1) return 'Departing tomorrow';
  return `Departing in ${days} days`;
}

function initialsFor(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/** "4m ago" / "2h ago" / "3d ago" from a real timestamp — replaces the old mock's hand-typed strings. */
function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

interface PropertyStats {
  totalRooms: number;
  occupiedRooms: number;
  ordersToday: number;
  revenueToday: number;
  totalRevenue: number;
  avgOrderValue: number;
  openRequests: number;
}

export async function fetchStaffProperties(): Promise<Property[]> {
  const { data, error } = await supabase.from('properties').select('*');
  if (error) throw error;
  const properties = data ?? [];

  // One stats call per property — fine at this scale (an owner's portfolio
  // is a handful of properties, not hundreds); batch/paginate if that stops
  // being true.
  const stats = await Promise.all(
    properties.map(p =>
      supabase.rpc('staff_property_stats', { p_property_id: p.id }).then(({ data, error }) => {
        if (error) throw error;
        return data as PropertyStats;
      })
    )
  );

  return properties.map((p, i) => {
    const s = stats[i];
    const occupancyPct = s.totalRooms > 0 ? Math.round((s.occupiedRooms / s.totalRooms) * 100) : 0;
    return {
      id: p.id,
      name: p.name,
      location: p.location,
      country: p.country ?? undefined,
      currency: p.currency ?? 'USD',
      status: p.status,
      occupancy: occupancyPct,
      revenueToday: formatCurrency(s.revenueToday, p.currency),
      ordersToday: s.ordersToday,
      requestsCount: s.openRequests,
      totalRooms: s.totalRooms,
      totalRevenue: formatCurrency(s.totalRevenue, p.currency),
      avgOrderValue: formatCurrency(s.avgOrderValue, p.currency),
      // A real URL (properties.image, see 0005_staff_mgmt_and_media.sql) —
      // either pasted directly or filled in by ImageUploadField's Cloudinary
      // upload button (src/components/ImageUploadField.tsx), same as menu
      // items. Empty until the owner sets one.
      image: p.image ?? '',
      modelImage: p.image ?? '',
      upiId: p.upi_id ?? undefined,
      hasExternalPms: p.has_external_pms ?? false,
    };
  });
}

/** Just the currency — Reception needs this to format money everywhere (folio, room rates, KPI cards) but has no other reason to load the full Property/stats bundle fetchStaffProperties does. */
export async function fetchPropertyCurrency(propertyId: string): Promise<string> {
  const { data, error } = await supabase.from('properties').select('currency').eq('id', propertyId).single();
  if (error) throw error;
  return data?.currency ?? 'USD';
}

/** Name + currency + UPI id + PMS mode — what Reception's folio/bill-printing/booking-UI needs but has no other reason to load the full Property/stats bundle for. */
export async function fetchPropertyMeta(propertyId: string): Promise<{ name: string; currency: string; upiId?: string; hasExternalPms: boolean }> {
  const { data, error } = await supabase.from('properties').select('name, currency, upi_id, has_external_pms').eq('id', propertyId).single();
  if (error) throw error;
  return {
    name: data?.name ?? '',
    currency: data?.currency ?? 'USD',
    upiId: data?.upi_id ?? undefined,
    hasExternalPms: data?.has_external_pms ?? false,
  };
}

/** Property-level settings an owner can change after creation — name/location/status/photo URL/PMS mode. All optional; only the fields passed are updated. */
export async function updateProperty(propertyId: string, patch: { name?: string; location?: string; status?: string; image?: string; upiId?: string; hasExternalPms?: boolean }): Promise<void> {
  const { error } = await supabase.from('properties').update({
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.location !== undefined && { location: patch.location }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.image !== undefined && { image: patch.image }),
    ...(patch.upiId !== undefined && { upi_id: patch.upiId }),
    ...(patch.hasExternalPms !== undefined && { has_external_pms: patch.hasExternalPms }),
  }).eq('id', propertyId);
  if (error) throw error;
}

export interface PortfolioStats {
  totalRooms: number;
  occupiedRooms: number;
  ordersToday: number;
  totalRevenue: number;
  avgOrderValue: number;
  openRequests: number;
}

export async function fetchPortfolioStats(propertyIds: string[]): Promise<PortfolioStats> {
  const { data, error } = await supabase.rpc('staff_portfolio_stats', { p_property_ids: propertyIds });
  if (error) throw error;
  return data as PortfolioStats;
}

export async function createProperty(
  id: string, name: string, location: string, image?: string, country?: string, currency?: string,
  hasExternalPms?: boolean, pmsName?: string,
): Promise<void> {
  const { error } = await supabase.rpc('staff_create_property', {
    p_id: id, p_name: name, p_location: location, p_image: image || null,
    p_country: country || null, p_currency: currency || 'USD',
    p_has_external_pms: hasExternalPms ?? false, p_pms_name: pmsName || null,
  });
  if (error) throw error;
}

export interface RevenueTrendPoint {
  day: string;
  revenue: number;
  orders: number;
}

export async function fetchRevenueTrend(propertyId: string, days: 7 | 30 | 90 = 7): Promise<RevenueTrendPoint[]> {
  const { data, error } = await supabase.rpc('staff_revenue_trend', { p_property_id: propertyId, p_days: days });
  if (error) throw error;
  return (data ?? []) as RevenueTrendPoint[];
}

/**
 * Rooms plus who's actually in them right now. `rooms` has no direct link
 * to a guest — occupancy is derived by joining today's checked_in
 * reservations, the same way a receptionist would actually think about it
 * ("who's in 204?" is a reservations question, not a rooms question).
 */
export async function fetchRoomsForProperty(propertyId: string): Promise<Room[]> {
  const [{ data: rooms, error: roomsError }, { data: occupied, error: resError }] = await Promise.all([
    supabase.from('rooms').select('*').eq('property_id', propertyId),
    supabase
      .from('reservations')
      .select('id, room_id, check_out, guest_token, guests(name, phone, email, id_document_url)')
      .eq('property_id', propertyId)
      .eq('status', 'checked_in'),
  ]);
  if (roomsError) throw roomsError;
  if (resError) throw resError;

  const occupancyByRoom = new Map((occupied ?? []).map(r => [r.room_id, r]));

  return (rooms ?? []).map(r => {
    const stay = occupancyByRoom.get(r.id);
    const guest = stay?.guests as unknown as { name: string; phone: string | null; email: string | null; id_document_url: string | null } | null;
    return {
      id: r.id,
      number: r.number,
      type: r.type,
      floor: r.floor,
      maxOccupancy: r.max_occupancy ?? 2,
      status: r.status,
      pricePerNight: r.price_per_night,
      guestName: guest?.name,
      guestPhone: guest?.phone ?? undefined,
      guestEmail: guest?.email ?? undefined,
      guestIdDocumentUrl: guest?.id_document_url ?? undefined,
      checkoutInfo: stay ? formatCheckoutInfo(stay.check_out) : undefined,
      notes: r.notes ?? undefined,
      cleanProgress: r.clean_progress ?? undefined,
      maintenanceEta: r.maintenance_eta ?? undefined,
      issueDescription: r.issue_description ?? undefined,
      image: r.image ?? undefined,
      guestToken: stay?.guest_token ?? undefined,
      reservationId: stay?.id,
    };
  });
}

/** Persists a room's status/ops fields (Reception) and/or its core details (owner editing type/floor/price/photo) — same function, since it's the same table and the same RLS policy covers both. */
export async function updateRoom(roomId: string, patch: {
  status?: RoomStatus; notes?: string; cleanProgress?: number; maintenanceEta?: string; issueDescription?: string;
  number?: string; type?: string; floor?: number; maxOccupancy?: number; pricePerNight?: number; image?: string;
}): Promise<void> {
  const { error } = await supabase.from('rooms').update({
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
    ...(patch.cleanProgress !== undefined && { clean_progress: patch.cleanProgress }),
    ...(patch.maintenanceEta !== undefined && { maintenance_eta: patch.maintenanceEta }),
    ...(patch.issueDescription !== undefined && { issue_description: patch.issueDescription }),
    ...(patch.number !== undefined && { number: patch.number }),
    ...(patch.type !== undefined && { type: patch.type }),
    ...(patch.floor !== undefined && { floor: patch.floor }),
    ...(patch.maxOccupancy !== undefined && { max_occupancy: patch.maxOccupancy }),
    ...(patch.pricePerNight !== undefined && { price_per_night: patch.pricePerNight }),
    ...(patch.image !== undefined && { image: patch.image }),
  }).eq('id', roomId);
  if (error) throw error;
}

/** Creates a room for real — the missing piece that made a freshly-created property a dead end (no rooms means nothing for Reception to show or a reservation to point at). */
export async function addRoom(propertyId: string, room: { number: string; type: string; floor: number; maxOccupancy?: number; pricePerNight: number; image?: string }): Promise<void> {
  const { error } = await supabase.from('rooms').insert({
    id: `${propertyId}-${slugify(room.number)}`,
    property_id: propertyId,
    number: room.number,
    type: room.type,
    floor: room.floor,
    max_occupancy: room.maxOccupancy ?? 2,
    status: 'ready',
    price_per_night: room.pricePerNight,
    image: room.image || null,
  });
  if (error) throw error;
}

/** Blocked by a foreign key (reservations.room_id) if the room has ever had a reservation — that's correct: deleting a room with real stay history should fail loudly, not cascade-delete guest records. */
export async function deleteRoom(roomId: string): Promise<void> {
  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  if (error) throw error;
}

export async function fetchMenuForProperty(propertyId: string): Promise<MenuItem[]> {
  const { data, error } = await supabase.from('menu_items').select('*').eq('property_id', propertyId).order('category');
  if (error) throw error;
  return (data ?? []).map(m => ({
    id: m.id,
    name: m.name,
    category: m.category,
    price: m.price,
    description: m.description,
    image: m.image,
    isVeg: m.is_veg,
    tags: m.tags ?? [],
    prepTime: m.prep_time ?? undefined,
  }));
}

/** menu_items' primary key is (id, property_id) — so unlike rooms, the id only needs to be unique within this one property. */
export async function addMenuItem(propertyId: string, item: Omit<MenuItem, 'id'>): Promise<void> {
  const { error } = await supabase.from('menu_items').insert({
    id: `${slugify(item.name)}-${Date.now().toString(36)}`,
    property_id: propertyId,
    name: item.name,
    category: item.category,
    price: item.price,
    description: item.description,
    image: item.image,
    is_veg: item.isVeg,
    tags: item.tags,
    prep_time: item.prepTime ?? null,
  });
  if (error) throw error;
}

/** Bulk CSV import — same insert as addMenuItem, just N rows in one round trip instead of one form submit at a time. */
export async function bulkAddMenuItems(propertyId: string, items: Omit<MenuItem, 'id'>[]): Promise<void> {
  if (items.length === 0) return;
  const rows = items.map((item, idx) => ({
    id: `${slugify(item.name)}-${Date.now().toString(36)}-${idx}`,
    property_id: propertyId,
    name: item.name,
    category: item.category,
    price: item.price,
    description: item.description,
    image: item.image,
    is_veg: item.isVeg,
    tags: item.tags,
    prep_time: item.prepTime ?? null,
  }));
  const { error } = await supabase.from('menu_items').insert(rows);
  if (error) throw error;
}

export async function deleteMenuItem(propertyId: string, itemId: string): Promise<void> {
  const { error } = await supabase.from('menu_items').delete().eq('property_id', propertyId).eq('id', itemId);
  if (error) throw error;
}

export async function updateMenuItem(propertyId: string, itemId: string, patch: Partial<Omit<MenuItem, 'id'>>): Promise<void> {
  const { error } = await supabase.from('menu_items').update({
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.category !== undefined && { category: patch.category }),
    ...(patch.price !== undefined && { price: patch.price }),
    ...(patch.description !== undefined && { description: patch.description }),
    ...(patch.image !== undefined && { image: patch.image }),
    ...(patch.isVeg !== undefined && { is_veg: patch.isVeg }),
    ...(patch.tags !== undefined && { tags: patch.tags }),
    ...(patch.prepTime !== undefined && { prep_time: patch.prepTime }),
  }).eq('property_id', propertyId).eq('id', itemId);
  if (error) throw error;
}

// ============================================================================
// EXPERIENCES — the guest home page's "Curated For You" cards, owner-managed
// instead of hardcoded (0016_experiences_and_guest_photos.sql)
// ============================================================================

export interface Experience {
  id: string;
  name: string;
  description: string;
  price: number;
  unitLabel: string;
  image: string;
}

export async function fetchExperiencesForProperty(propertyId: string): Promise<Experience[]> {
  const { data, error } = await supabase.from('experiences').select('*').eq('property_id', propertyId).order('name');
  if (error) throw error;
  return (data ?? []).map(e => ({
    id: e.id, name: e.name, description: e.description, price: e.price,
    unitLabel: e.unit_label, image: e.image ?? '',
  }));
}

export async function addExperience(propertyId: string, exp: Omit<Experience, 'id'>): Promise<void> {
  const { error } = await supabase.from('experiences').insert({
    id: `${slugify(exp.name)}-${Date.now().toString(36)}`,
    property_id: propertyId,
    name: exp.name,
    description: exp.description,
    price: exp.price,
    unit_label: exp.unitLabel,
    image: exp.image,
  });
  if (error) throw error;
}

export async function updateExperience(propertyId: string, expId: string, patch: Partial<Omit<Experience, 'id'>>): Promise<void> {
  const { error } = await supabase.from('experiences').update({
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.description !== undefined && { description: patch.description }),
    ...(patch.price !== undefined && { price: patch.price }),
    ...(patch.unitLabel !== undefined && { unit_label: patch.unitLabel }),
    ...(patch.image !== undefined && { image: patch.image }),
  }).eq('property_id', propertyId).eq('id', expId);
  if (error) throw error;
}

export async function deleteExperience(propertyId: string, expId: string): Promise<void> {
  const { error } = await supabase.from('experiences').delete().eq('property_id', propertyId).eq('id', expId);
  if (error) throw error;
}

// ============================================================================
// STAFF MANAGEMENT — owner granting/revoking access, no SQL required
// ============================================================================

export interface StaffMember {
  userId: string;
  email: string;
  role: 'owner' | 'receptionist';
}

export async function fetchStaffForProperty(propertyId: string): Promise<StaffMember[]> {
  const { data, error } = await supabase.rpc('staff_list_for_property', { p_property_id: propertyId });
  if (error) throw error;
  return (data ?? []) as StaffMember[];
}

/** Grants access to whoever already has an account with this email — does not create one. See staff_invite_by_email() for what happens when no such account exists yet. */
export async function inviteStaff(propertyId: string, email: string, role: 'owner' | 'receptionist'): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.rpc('staff_invite_by_email', { p_property_id: propertyId, p_email: email, p_role: role });
  if (error) throw error;
  return data as { success: boolean; message: string };
}

export async function revokeStaffAccess(propertyId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('staff_revoke_access', { p_property_id: propertyId, p_user_id: userId });
  if (error) throw error;
}

/** Reservations not yet checked in — Reception's "Upcoming Arrivals" list. */
export async function fetchArrivals(propertyId: string): Promise<UpcomingArrival[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, check_in, updated_eta, guests(name, vip), rooms(id, number, type)')
    .eq('property_id', propertyId)
    .eq('status', 'upcoming')
    .order('check_in', { ascending: true });
  if (error) throw error;

  return (data ?? []).map(r => {
    const guest = r.guests as unknown as { name: string; vip: boolean } | null;
    const room = r.rooms as unknown as { id: string; number: string; type: string } | null;
    // Once Reception moves the ETA (staff_update_arrival_eta), delay is
    // measured against that instead of the original booked check_in — the
    // guest calling ahead to say they're running late shouldn't still show
    // up as "delayed" once staff has acknowledged the new time.
    const effectiveEta = r.updated_eta ?? r.check_in;
    return {
      id: r.id,
      guestName: guest?.name ?? 'Guest',
      initials: initialsFor(guest?.name ?? '?'),
      eta: new Date(effectiveEta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      roomType: room?.type ?? '',
      isVip: guest?.vip ?? false,
      assignedRoom: room?.number,
      isDelayed: new Date(effectiveEta).getTime() < Date.now(),
      checkedIn: false,
    };
  });
}

/** Reception moving a guest's expected arrival time — e.g. a phone call saying they're running an hour late. Only valid while the reservation is still 'upcoming'; see staff_update_arrival_eta. */
export async function updateArrivalEta(reservationId: string, newEta: Date): Promise<void> {
  const { error } = await supabase.rpc('staff_update_arrival_eta', { p_reservation_id: reservationId, p_new_eta: newEta.toISOString() });
  if (error) throw error;
}

/** Checks a reservation in via staff_check_in_reservation() — updates the reservation AND the room status together, see supabase/migrations/0002_room_ops.sql. */
export async function checkInReservation(reservationId: string): Promise<void> {
  const { error } = await supabase.rpc('staff_check_in_reservation', { p_reservation_id: reservationId });
  if (error) throw error;
}

/** Cancels a future ('upcoming') booking that never happened — distinct from checkout, which is for a stay that actually occurred (staff_cancel_reservation, 0015_advance_booking.sql). */
export async function cancelReservation(reservationId: string): Promise<void> {
  const { error } = await supabase.rpc('staff_cancel_reservation', { p_reservation_id: reservationId });
  if (error) throw error;
}

export interface AvailableRoom {
  id: string;
  number: string;
  type: string;
  floor: number;
  maxOccupancy: number;
  pricePerNight: number;
  image?: string;
}

/**
 * Real date-range availability, not "what's the room's status right now" —
 * a room occupied today can still be free next Monday, and a room that's
 * 'ready' today might already be booked for next Monday. Backs New
 * Booking's search step (staff_search_available_rooms, 0015_advance_booking.sql).
 */
export async function searchAvailableRooms(
  propertyId: string, checkIn: Date, checkOut: Date, minOccupancy = 1, roomType?: string
): Promise<AvailableRoom[]> {
  const { data, error } = await supabase.rpc('staff_search_available_rooms', {
    p_property_id: propertyId,
    p_check_in: checkIn.toISOString(),
    p_check_out: checkOut.toISOString(),
    p_min_occupancy: minOccupancy,
    p_room_type: roomType || null,
  });
  if (error) throw error;
  return (data ?? []) as AvailableRoom[];
}

export interface WalkInGuestInput {
  name: string;
  phone?: string;
  email?: string;
  vip?: boolean;
  idDocumentUrl?: string;
  /** Defaults to now() server-side (a walk-in) — pass a future date to create an advance booking ('upcoming') instead of an immediate check-in. */
  checkIn?: Date;
  checkOut?: Date;
  partySize?: number;
  /** 'imported' marks a check-in made in PMS mode (the property's real booking already lives in an external PMS — this just links a guest to a room so the guest app works). Defaults to 'built_in', Cabadra's own booking. */
  source?: 'built_in' | 'imported';
}

/**
 * Creates the guest record and a reservation in one step, and assigns the
 * room (staff_checkin_new_guest, 0013/0015). A future checkIn creates an
 * 'upcoming' booking without touching the room's current status — a walk-in
 * (checkIn omitted or in the past) checks straight in. This is what makes a
 * room's printed QR (0011_room_qr.sql) actually mean something — it only
 * resolves to a real person once a reservation like this exists.
 */
export async function checkInNewGuest(propertyId: string, roomId: string, guest: WalkInGuestInput): Promise<string> {
  const { data, error } = await supabase.rpc('staff_checkin_new_guest', {
    p_property_id: propertyId,
    p_room_id: roomId,
    p_guest_name: guest.name,
    p_guest_phone: guest.phone || null,
    p_guest_email: guest.email || null,
    p_guest_vip: guest.vip ?? false,
    p_id_document_url: guest.idDocumentUrl || null,
    p_check_in: guest.checkIn ? guest.checkIn.toISOString() : new Date().toISOString(),
    p_check_out: guest.checkOut ? guest.checkOut.toISOString() : null,
    p_party_size: guest.partySize ?? 1,
    p_source: guest.source ?? 'built_in',
  });
  if (error) throw error;
  return data as string;
}

export interface StaffOrder {
  id: string;
  roomId: string;
  items: { menuItemId: string; name: string; price: number; quantity: number; fromRecommendation?: boolean }[];
  totalAmount: number;
  status: 'new' | 'preparing' | 'ready' | 'delivered' | 'rejected';
  createdAt: string;
  notes?: string;
  rejectionNote?: string;
}

/** Real guest orders for the KDS board — RLS already limits this to properties the caller is staff on. */
export async function fetchOrdersForProperty(propertyId: string): Promise<StaffOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, room_id, items, total_amount, status, created_at, notes, rejection_note')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(o => ({
    id: o.id,
    roomId: o.room_id,
    items: o.items,
    totalAmount: o.total_amount,
    status: o.status,
    createdAt: o.created_at,
    notes: o.notes ?? undefined,
    rejectionNote: o.rejection_note ?? undefined,
  }));
}

export async function updateOrderStatus(orderId: string, status: StaffOrder['status']): Promise<void> {
  const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
  if (error) throw error;
}

/**
 * The kitchen's "we can't make this" path — only valid while the order is
 * still 'new'. Voids the folio charge and notifies both staff and the
 * guest (staff_reject_order, 0017_kitchen_reject_order.sql).
 */
export async function rejectOrder(orderId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('staff_reject_order', { p_order_id: orderId, p_note: note });
  if (error) throw error;
}

export interface TicketSizeAnalytics {
  ordersTotal: number;
  avgOrderValueWithRecommendation: number;
  avgOrderValueWithoutRecommendation: number;
}

export async function fetchTicketSizeAnalytics(propertyId: string): Promise<TicketSizeAnalytics> {
  const { data, error } = await supabase.rpc('staff_ticket_size_analytics', { p_property_id: propertyId });
  if (error) throw error;
  return data as TicketSizeAnalytics;
}

/** Reception's "Urgent Requests" card — includes both guest-submitted (guest_submit_request) and staff-logged requests. */
export async function fetchGuestRequests(propertyId: string): Promise<UrgentRequest[]> {
  const { data, error } = await supabase
    .from('guest_requests')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id,
    title: r.title,
    timeAgo: timeAgo(r.created_at),
    roomNumber: r.room_number,
    priority: r.priority,
    isUrgent: r.priority === 'High Priority',
    status: r.status,
    department: r.department ?? 'concierge',
  }));
}

export async function resolveGuestRequest(requestId: string): Promise<void> {
  const { error } = await supabase.from('guest_requests').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', requestId);
  if (error) throw error;
}

/** Reception logging a request on a guest's behalf (phone-in, walk-up) — a direct insert, since staff write their own property's requests under RLS. */
export async function logStaffRequest(propertyId: string, roomNumber: string, title: string, priority: UrgentRequest['priority'], department: UrgentRequest['department'] = 'concierge'): Promise<void> {
  const { error } = await supabase.from('guest_requests').insert({ property_id: propertyId, room_number: roomNumber, title, priority, department });
  if (error) throw error;
}

// ============================================================================
// SERVICE CATEGORIES — the guest home page's "At Your Service" grid,
// owner-managed instead of a fixed four cards (0018_service_categories.sql)
// ============================================================================

export interface ServiceCategory {
  id: string;
  name: string;
  description: string;
  department: 'housekeeping' | 'maintenance' | 'amenities' | 'concierge';
  /** 'transportation' swaps the guest-side free-text modal for a route picker (transport_routes) instead. */
  categoryType: 'general' | 'transportation';
}

export async function fetchServiceCategories(propertyId: string): Promise<ServiceCategory[]> {
  const { data, error } = await supabase.from('service_categories').select('*').eq('property_id', propertyId).order('sort_order');
  if (error) throw error;
  return (data ?? []).map(s => ({ id: s.id, name: s.name, description: s.description, department: s.department, categoryType: s.category_type ?? 'general' }));
}

export async function addServiceCategory(propertyId: string, cat: Omit<ServiceCategory, 'id'>): Promise<void> {
  const { error } = await supabase.from('service_categories').insert({
    id: `${slugify(cat.name)}-${Date.now().toString(36)}`,
    property_id: propertyId,
    name: cat.name,
    description: cat.description,
    department: cat.department,
    category_type: cat.categoryType,
  });
  if (error) throw error;
}

export async function updateServiceCategory(propertyId: string, catId: string, patch: Partial<Omit<ServiceCategory, 'id'>>): Promise<void> {
  const { error } = await supabase.from('service_categories').update({
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.description !== undefined && { description: patch.description }),
    ...(patch.department !== undefined && { department: patch.department }),
    ...(patch.categoryType !== undefined && { category_type: patch.categoryType }),
  }).eq('property_id', propertyId).eq('id', catId);
  if (error) throw error;
}

export async function deleteServiceCategory(propertyId: string, catId: string): Promise<void> {
  const { error } = await supabase.from('service_categories').delete().eq('property_id', propertyId).eq('id', catId);
  if (error) throw error;
}

// ============================================================================
// TRANSPORT ROUTES — the route catalog behind a 'transportation'-type
// service category (0023_transport_routes.sql)
// ============================================================================

export interface TransportRoute {
  id: string;
  from: string;
  to: string;
  price: number;
  priceUnit: string;
}

export async function fetchTransportRoutes(propertyId: string): Promise<TransportRoute[]> {
  const { data, error } = await supabase.from('transport_routes').select('*').eq('property_id', propertyId).order('from_location');
  if (error) throw error;
  return (data ?? []).map(r => ({ id: r.id, from: r.from_location, to: r.to_location, price: r.price, priceUnit: r.price_unit }));
}

export async function addTransportRoute(propertyId: string, route: Omit<TransportRoute, 'id'>): Promise<void> {
  const { error } = await supabase.from('transport_routes').insert({
    id: `${slugify(route.from)}-${slugify(route.to)}-${Date.now().toString(36)}`,
    property_id: propertyId,
    from_location: route.from,
    to_location: route.to,
    price: route.price,
    price_unit: route.priceUnit,
  });
  if (error) throw error;
}

export async function deleteTransportRoute(propertyId: string, routeId: string): Promise<void> {
  const { error } = await supabase.from('transport_routes').delete().eq('property_id', propertyId).eq('id', routeId);
  if (error) throw error;
}

export async function fetchTasks(propertyId: string): Promise<LiveOpsTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(t => ({
    id: t.id,
    roomNumber: t.room_label,
    title: t.title,
    description: t.description,
    priority: t.priority,
    dueTime: t.due_label,
    status: t.status,
    assignedTo: t.assigned_to ?? undefined,
    taskToken: t.task_token,
    category: t.category,
  }));
}

export async function updateTaskStatus(taskId: string, status: LiveOpsTask['status']): Promise<void> {
  const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId);
  if (error) throw error;
}

/** "Assign to" — a name from the property's staff_directory, not a login. Passing null clears it back to an unassigned department queue. */
export async function updateTaskAssignment(taskId: string, assignedTo: string | null): Promise<void> {
  const { error } = await supabase.from('tasks').update({ assigned_to: assignedTo }).eq('id', taskId);
  if (error) throw error;
}

/** taskToken is excluded — it's generated server-side by the tasks table's default (gen_random_uuid()), not something a new-task form could know in advance. See service_task_resolve (0025_task_qr.sql). */
export async function createTask(propertyId: string, task: Omit<LiveOpsTask, 'id' | 'taskToken'>): Promise<void> {
  const { error } = await supabase.from('tasks').insert({
    property_id: propertyId,
    room_label: task.roomNumber,
    title: task.title,
    description: task.description,
    priority: task.priority,
    due_label: task.dueTime,
    status: task.status,
    category: task.category,
    assigned_to: task.assignedTo ?? null,
  });
  if (error) throw error;
}

// ============================================================================
// STAFF DIRECTORY — department contact numbers, separate from login access
// (0022_staff_directory.sql). Who a Live Ops task actually gets assigned to.
// ============================================================================

export interface DirectoryContact {
  id: string;
  name: string;
  phone: string;
  department: 'housekeeping' | 'maintenance' | 'amenities' | 'concierge';
}

export async function fetchStaffDirectory(propertyId: string): Promise<DirectoryContact[]> {
  const { data, error } = await supabase.from('staff_directory').select('*').eq('property_id', propertyId).order('name');
  if (error) throw error;
  return (data ?? []).map(d => ({ id: d.id, name: d.name, phone: d.phone, department: d.department }));
}

export async function addDirectoryContact(propertyId: string, contact: Omit<DirectoryContact, 'id'>): Promise<void> {
  const { error } = await supabase.from('staff_directory').insert({
    property_id: propertyId, name: contact.name, phone: contact.phone, department: contact.department,
  });
  if (error) throw error;
}

export async function deleteDirectoryContact(contactId: string): Promise<void> {
  const { error } = await supabase.from('staff_directory').delete().eq('id', contactId);
  if (error) throw error;
}

// ============================================================================
// ROOM FOLIO — itemized bill for a stay, settled in one payment at checkout
// ============================================================================

export async function fetchFolio(reservationId: string): Promise<Folio> {
  const { data, error } = await supabase.rpc('staff_get_folio', { p_reservation_id: reservationId });
  if (error) throw error;
  return data as Folio;
}

/** Settles every unsettled folio charge and checks the reservation out — see staff_checkout_reservation (0006_room_folio_checkout.sql) for the room-status/reservation-status side effects. */
export async function checkoutReservation(reservationId: string, paymentMethod: 'cash' | 'card' | 'upi' | 'other'): Promise<{ reservationId: string; amountCharged: number; paymentMethod: string }> {
  const { data, error } = await supabase.rpc('staff_checkout_reservation', { p_reservation_id: reservationId, p_payment_method: paymentMethod });
  if (error) throw error;
  return data as { reservationId: string; amountCharged: number; paymentMethod: string };
}

/** A deposit at check-in, a UPI payment mid-stay — recorded as a negative folio line that nets against real charges immediately, not held separately until checkout (staff_record_folio_payment, 0021_folio_payments_and_upi.sql). */
export async function recordFolioPayment(reservationId: string, amount: number, description: string, method: 'cash' | 'card' | 'upi' | 'other'): Promise<void> {
  const { error } = await supabase.rpc('staff_record_folio_payment', {
    p_reservation_id: reservationId, p_amount: amount, p_description: description, p_method: method,
  });
  if (error) throw error;
}

// ============================================================================
// NOTIFICATIONS — system-generated only; staff can read and mark-read, never post
// ============================================================================

export async function fetchNotifications(propertyId: string, limit = 30): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(n => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    roomNumber: n.room_number ?? undefined,
    createdAt: n.created_at,
    read: n.read_at != null,
  }));
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc('staff_mark_notification_read', { p_notification_id: notificationId });
  if (error) throw error;
}

export async function markAllNotificationsRead(propertyId: string): Promise<void> {
  const { error } = await supabase.rpc('staff_mark_all_notifications_read', { p_property_id: propertyId });
  if (error) throw error;
}

/** Subscribes to new notifications on a property in real time. Call the returned function to unsubscribe (e.g. on unmount). */
export function subscribeToNotifications(propertyId: string, onInsert: (row: AppNotification) => void): () => void {
  const channel = supabase
    .channel(`notifications-${propertyId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `property_id=eq.${propertyId}` },
      (payload) => {
        const n = payload.new as { id: string; type: AppNotification['type']; title: string; body: string; room_number: string | null; created_at: string };
        onInsert({ id: n.id, type: n.type, title: n.title, body: n.body, roomNumber: n.room_number ?? undefined, createdAt: n.created_at, read: false });
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

// ============================================================================
// STAFF ONBOARDING — inviting an email with no account yet
// ============================================================================

/**
 * The end-to-end path for a brand new email: calls the invite-staff Edge
 * Function (supabase/functions/invite-staff), which holds the service_role
 * key this app's client never touches. It creates the Supabase Auth user,
 * emails them a real invite, and (via staff_queue_pending_invite +
 * 0008_staff_onboarding.sql's trigger) grants them property access the
 * instant that account is created — not after they click through.
 * Falls back gracefully if the function hasn't been deployed yet.
 */
export async function sendStaffInviteEmail(propertyId: string, email: string, role: 'owner' | 'receptionist'): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('invite-staff', {
    body: { propertyId, email, role },
  });
  if (error) {
    return {
      success: false,
      message: `Couldn't reach the invite service (${error.message}). Has supabase/functions/invite-staff been deployed? Run: supabase functions deploy invite-staff`,
    };
  }
  return data as { success: boolean; message: string };
}

export interface PendingInvite {
  email: string;
  role: 'owner' | 'receptionist';
  createdAt: string;
}

export async function fetchPendingInvites(propertyId: string): Promise<PendingInvite[]> {
  const { data, error } = await supabase.rpc('staff_list_pending_invites', { p_property_id: propertyId });
  if (error) throw error;
  return (data ?? []) as PendingInvite[];
}

export async function cancelPendingInvite(propertyId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc('staff_cancel_pending_invite', { p_property_id: propertyId, p_email: email });
  if (error) throw error;
}
