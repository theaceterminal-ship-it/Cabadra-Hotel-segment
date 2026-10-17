/**
 * Guest-facing data access. Every call here goes through a SECURITY DEFINER
 * RPC function (supabase/migrations/0001_init.sql), scoped by the
 * guest_token embedded in the URL — never a direct table query. There is no
 * guest login: the token in the link *is* the session.
 */

import { supabase } from './supabaseClient';
import type { MenuItem, FolioChatMessage } from '../types';

export interface GuestExperience {
  id: string;
  name: string;
  description: string;
  price: number;
  unitLabel: string;
  image: string;
}

export type Department = 'housekeeping' | 'maintenance' | 'amenities' | 'concierge';

export interface GuestServiceCategory {
  id: string;
  name: string;
  description: string;
  department: Department;
  iconKey: string;
  categoryType: 'general' | 'transportation';
}

export interface GuestTransportRoute {
  id: string;
  from: string;
  to: string;
  price: number;
  priceUnit: string;
}

export interface GuestContext {
  reservationId: string;
  partySize: number;
  property: { id: string; name: string; currency: string; image?: string };
  room: { id: string; number: string; type: string };
  guest: { name: string; vip: boolean };
  menu: MenuItem[];
  experiences: GuestExperience[];
  serviceCategories: GuestServiceCategory[];
  transportRoutes: GuestTransportRoute[];
}

export async function fetchGuestContext(token: string): Promise<GuestContext> {
  const { data, error } = await supabase.rpc('guest_get_context', { p_token: token });
  if (error) throw new Error(`Invalid or expired guest link: ${error.message}`);
  return data as GuestContext;
}

/** The other half of a printed room QR: resolves a room id to whichever reservation's guest_token is currently checked in. See guest_resolve_room_token (0011_room_qr.sql) for why this indirection exists instead of the QR encoding a token directly. */
export async function resolveRoomToken(roomId: string): Promise<string> {
  const { data, error } = await supabase.rpc('guest_resolve_room_token', { p_room_id: roomId });
  if (error) throw new Error(error.message.includes('No guest is currently') ? error.message : `Couldn't open this room: ${error.message}`);
  return data as string;
}

export interface GuestRecommendation {
  menuItemId: string;
  score: number;
  reason: string;
  menuItem?: MenuItem;
}

export async function fetchGuestRecommendations(token: string): Promise<GuestRecommendation[]> {
  const { data, error } = await supabase.rpc('guest_get_recommendations', { p_token: token, p_limit: 4 });
  if (error) throw new Error(`Failed to load recommendations: ${error.message}`);
  return (data ?? []) as GuestRecommendation[];
}

export interface OfferEvent {
  offerId: string;
  offerType?: 'menu_item' | 'service' | 'deal';
  event: 'impression' | 'action';
  /** Where this fired — 'on_open', 'cart_sheet', etc. Freeform on purpose: new surfaces shouldn't need a migration to log from. */
  surface: string;
  context?: Record<string, unknown>;
}

/**
 * Phase 1 of the Offer Engine design: log, don't rank or place yet. Never
 * throws into the caller — a logging failure must not be able to interrupt
 * browsing or ordering, so this only warns.
 */
export async function logOfferEvents(token: string, events: OfferEvent[]): Promise<void> {
  if (events.length === 0) return;
  const { error } = await supabase.rpc('guest_log_offer_events', {
    p_token: token,
    p_events: events.map((e) => ({
      offerId: e.offerId,
      offerType: e.offerType ?? 'menu_item',
      event: e.event,
      surface: e.surface,
      context: e.context ?? {},
    })),
  });
  if (error) console.warn('Failed to log offer event:', error.message);
}

export interface GuestOrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  fromRecommendation?: boolean;
  /** Per-item customization ("no onions", "extra spicy") — distinct from the order-level dietary note. */
  note?: string;
  /** Snapshotted from the menu item at order time, so the floating ETA card can compute a real estimate without a second round trip. */
  prepTime?: string;
}

export async function placeGuestOrder(token: string, items: GuestOrderItem[], notes?: string) {
  const { data, error } = await supabase.rpc('guest_place_order', { p_token: token, p_items: items, p_notes: notes ?? null });
  if (error) throw new Error(`Failed to place order: ${error.message}`);
  return data as { order: { id: string; totalAmount: number; status: string }; charge: { id: string; amount: number } };
}

export async function submitGuestRequest(
  token: string,
  title: string,
  priority: 'High Priority' | 'Standard' | 'Pending Approval' = 'Standard',
  department: Department = 'concierge'
): Promise<string> {
  const { data, error } = await supabase.rpc('guest_submit_request', { p_token: token, p_title: title, p_priority: priority, p_department: department });
  if (error) throw new Error(`Failed to send request: ${error.message}`);
  return data as string;
}

export interface ActiveGuestRequest {
  id: string;
  title: string;
  department: Department;
  priority: 'High Priority' | 'Standard' | 'Pending Approval';
  createdAt: string;
  /** Null until staff turns this into a Live Ops task — most self-submitted requests stay null and the only signal is "received" until it resolves and drops off this list. See guest_get_active_requests (0051). */
  taskStatus?: 'pending' | 'in_progress' | 'completed' | 'rejected';
  rejectionNote?: string;
}

/** Every request still open for this stay — the request-side counterpart to fetchActiveOrder, for a status bar that tells a guest "we got your towel request" instead of leaving them to wonder. */
export async function fetchActiveGuestRequests(token: string): Promise<ActiveGuestRequest[]> {
  const { data, error } = await supabase.rpc('guest_get_active_requests', { p_token: token });
  if (error) throw new Error(`Failed to check request status: ${error.message}`);
  return (data ?? []) as ActiveGuestRequest[];
}

export async function dismissGuestRequest(token: string, requestId: string): Promise<void> {
  const { error } = await supabase.rpc('guest_dismiss_request', { p_token: token, p_request_id: requestId });
  if (error) {
    console.warn('Failed to dismiss request:', error.message);
  }
}

export async function bookGuestExperience(
  token: string,
  experienceName: string,
  price: number,
  guestCount: number = 1,
  preferredTime?: string,
  notes?: string,
  unitLabel?: string
): Promise<any> {
  const { data, error } = await supabase.rpc('guest_book_experience', {
    p_token: token,
    p_experience_name: experienceName,
    p_price: price,
    p_guest_count: guestCount,
    p_preferred_time: preferredTime || null,
    p_notes: notes || null,
    p_unit_label: unitLabel || 'per person',
  });
  if (error) throw new Error(`Failed to reserve experience: ${error.message}`);
  return data;
}

export async function fetchGuestExperienceBookings(token: string): Promise<GuestExperienceBooking[]> {
  const { data, error } = await supabase.rpc('guest_fetch_experience_bookings', { p_token: token });
  if (error) throw new Error(`Failed to load reserved experiences: ${error.message}`);
  return (data ?? []) as GuestExperienceBooking[];
}

export interface ActiveOrder {
  id: string;
  status: 'new' | 'preparing' | 'ready' | 'rejected';
  items: GuestOrderItem[];
  totalAmount: number;
  createdAt: string;
  /** Why the kitchen couldn't make it — set whenever status is 'rejected'; the charge is already off the folio by the time the guest sees this. */
  rejectionNote?: string;
}

/** The guest home page's "active order" banner — null when nothing's in flight. */
export async function fetchActiveOrder(token: string): Promise<ActiveOrder | null> {
  const { data, error } = await supabase.rpc('guest_get_active_order', { p_token: token });
  if (error) throw new Error(`Failed to check active order: ${error.message}`);
  return (data ?? null) as ActiveOrder | null;
}

/** Folio Chat (0052) — the whole thread for this stay, oldest first. Polled, not Realtime: the guest side is anon with no RLS visibility into folio_chat_messages (same reasoning as every other guest_* read), and Realtime's postgres_changes still enforces RLS, so there's nothing for an anon subscription to see here. */
export async function fetchChatMessages(token: string): Promise<FolioChatMessage[]> {
  const { data, error } = await supabase.rpc('guest_fetch_chat_messages', { p_token: token });
  if (error) throw new Error(`Failed to load messages: ${error.message}`);
  return (data ?? []) as FolioChatMessage[];
}

export async function sendChatMessage(token: string, body: string): Promise<FolioChatMessage> {
  const { data, error } = await supabase.rpc('guest_send_chat_message', { p_token: token, p_body: body });
  if (error) throw new Error(`Failed to send message: ${error.message}`);
  return data as FolioChatMessage;
}
