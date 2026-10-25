/**
 * Guest-facing data access. Every call here goes through a SECURITY DEFINER
 * RPC function (supabase/migrations/0001_init.sql), scoped by the
 * guest_token embedded in the URL — never a direct table query. There is no
 * guest login: the token in the link *is* the session.
 */

import { supabase } from './supabaseClient';
import type { MenuItem, FolioChatMessage } from '../types';
import type { Department, ServiceForm } from './departments';

export interface GuestExperience {
  id: string;
  name: string;
  description: string;
  price: number;
  unitLabel: string;
  image: string;
}

export type { Department } from './departments';

export interface GuestServiceCategory {
  id: string;
  name: string;
  description: string;
  department: Department;
  iconKey: string;
  categoryType: 'general' | 'transportation';
  /** The owner-built request form (0075). */
  form?: ServiceForm;
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
  // Since 0072 "no one checked in" comes back as NULL (so failed lookups
  // still count toward the rate limit) rather than as an error.
  if (!data) throw new Error('No guest is currently checked into this room');
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

/**
 * One line of a room-service order as the browser sends it: only what the
 * guest chose. Prices and names are looked up server-side from the menu
 * (guest_place_order, 0073), so nothing here can change what's charged.
 */
export interface GuestOrderItem {
  menuItemId: string;
  quantity: number;
  /** Required when the dish has sizes. */
  variationId?: string;
  addonIds?: string[];
  fromRecommendation?: boolean;
  /** Per-item customization ("no onions", "extra spicy") — distinct from the order-level dietary note. */
  note?: string;
}

/** A line of a placed order as stored server-side: name and price filled in from the menu, choices spelled out in the name. */
export interface GuestOrderLine {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
  /** Snapshotted from the menu item at order time, so the floating ETA card can compute a real estimate without a second round trip. */
  prepTime?: string;
  fromRecommendation?: boolean;
  variationId?: string;
  addons?: { id: string; name: string; price: number }[];
}

/** What the "Complete your order" box offers: the kind of dish the cart lacks, why, and the best-accepted dishes of that kind. */
export interface CheckoutSuggestion {
  gap: string;
  reason: string;
  pitch: string;
  items: MenuItem[];
}

/** A local business listed by Cabadra for guests near this hotel (0078). Contact only: the guest reaches the business directly. */
export interface PartnerListing {
  id: string;
  name: string;
  category: 'restaurant' | 'cafe' | 'taxi' | 'tours' | 'adventure' | 'spa' | 'shopping' | 'other';
  tagline?: string;
  description?: string;
  photo?: string;
  phone?: string;
  whatsapp?: string;
  mapsUrl?: string;
  address?: string;
  openingHours?: string;
  offerText?: string;
  offerCode?: string;
  /** Paid to be shown first (0084). */
  featured?: boolean;
  /** Has an email for booking requests to go to (0084). */
  takesRequests?: boolean;
}

export type PartnerEventKind = 'impression' | 'tap' | 'call' | 'whatsapp' | 'directions' | 'code';

/** guest_get_partner_listings (0078): the partners this hotel's guests can see today, and the place to title the row with. Empty on any error: ads never get in a guest's way. */
export async function fetchPartnerListings(token: string): Promise<{ area: string; items: PartnerListing[] }> {
  const { data, error } = await supabase.rpc('guest_get_partner_listings', { p_token: token });
  if (error || !data) return { area: '', items: [] };
  const d = data as { area?: string; items?: PartnerListing[] };
  return { area: d.area ?? '', items: d.items ?? [] };
}

/** Fire-and-forget: what the guest did with a listing. The server dedupes, so a re-render can't inflate a business's numbers. */
export function logPartnerEvents(token: string, events: { partnerId: string; event: PartnerEventKind }[]): void {
  if (events.length === 0) return;
  supabase.rpc('guest_log_partner_events', { p_token: token, p_events: events.slice(0, 20) })
    .then(({ error }) => { if (error) console.warn('Failed to log partner event:', error.message); });
}

export interface PartnerRequest {
  id: string;
  partnerId: string;
  partnerName: string;
  message: string;
  preferredTime?: string;
  status: 'new' | 'accepted' | 'declined' | 'done';
  businessNote?: string;
  createdAt: string;
}

/**
 * guest_partner_request (0084): asks a listed business for something (a cab
 * at 9, a table for four). The guest's name, phone and hotel go to that
 * business only because they ticked to share them; the server refuses
 * without it.
 */
export async function sendPartnerRequest(token: string, input: { partnerId: string; message: string; preferredTime?: string; partySize?: number; phone?: string; consent: boolean }) {
  const { data, error } = await supabase.rpc('guest_partner_request', {
    p_token: token,
    p_partner_id: input.partnerId,
    p_message: input.message,
    p_preferred_time: input.preferredTime ?? null,
    p_party_size: input.partySize ?? null,
    p_phone: input.phone ?? null,
    p_consent: input.consent,
  });
  if (error) throw new Error(/failed to fetch|network/i.test(error.message) ? 'Couldn’t send it. Check your connection and try again.' : error.message);
  return data as { id: string; status: string };
}

/** This stay's requests to local businesses and what they answered. Empty on any error. */
export async function fetchPartnerRequests(token: string): Promise<PartnerRequest[]> {
  const { data, error } = await supabase.rpc('guest_partner_requests', { p_token: token });
  if (error || !data) return [];
  return data as PartnerRequest[];
}

/** guest_checkout_suggestion (0076). Null when the order has no real gap, or on any error: never worth blocking an order over. */
export async function fetchCheckoutSuggestion(token: string, cartItemIds: string[]): Promise<CheckoutSuggestion | null> {
  const { data, error } = await supabase.rpc('guest_checkout_suggestion', { p_token: token, p_cart_item_ids: cartItemIds });
  if (error || !data) return null;
  const s = data as CheckoutSuggestion;
  return s.items?.length ? s : null;
}

export async function placeGuestOrder(token: string, items: GuestOrderItem[], notes?: string) {
  const { data, error } = await supabase.rpc('guest_place_order', { p_token: token, p_items: items, p_notes: notes ?? null });
  if (error) {
    // The server's own reasons ("Choose a size for…") are written for guests; a dropped connection isn't.
    throw new Error(/failed to fetch|network/i.test(error.message) ? 'Couldn’t reach the hotel. Check your connection and try again.' : error.message);
  }
  return data as { order: { id: string; totalAmount: number; status: string }; charge: { id: string; amount: number } };
}

/**
 * A request through a service's own form (0075). Only the picks go up; the
 * server works out the title and price from the hotel's own choices or
 * route. A price is charged to the room when staff mark the request done.
 */
export async function submitServiceRequest(
  token: string,
  serviceId: string,
  input: { choices?: { id: string; quantity?: number }[]; routeId?: string; time?: string; note?: string },
): Promise<{ id: string; price: number; title: string }> {
  const { data, error } = await supabase.rpc('guest_submit_service_request', {
    p_token: token,
    p_service_id: serviceId,
    p_choices: input.choices ?? [],
    p_route_id: input.routeId ?? null,
    p_time: input.time ?? null,
    p_note: input.note ?? null,
  });
  if (error) {
    throw new Error(/failed to fetch|network/i.test(error.message) ? 'Couldn’t reach the hotel. Check your connection and try again.' : error.message);
  }
  return data as { id: string; price: number; title: string };
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
  items: GuestOrderLine[];
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
