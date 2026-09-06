/**
 * Guest-facing data access. Every call here goes through a SECURITY DEFINER
 * RPC function (supabase/migrations/0001_init.sql), scoped by the
 * guest_token embedded in the URL — never a direct table query. There is no
 * guest login: the token in the link *is* the session.
 */

import { supabase } from './supabaseClient';
import type { MenuItem } from '../types';

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

export async function bookGuestExperience(token: string, experienceName: string, price: number): Promise<string> {
  const { data, error } = await supabase.rpc('guest_book_experience', {
    p_token: token,
    p_experience_name: experienceName,
    p_price: price,
  });
  if (error) throw new Error(`Failed to book experience: ${error.message}`);
  return data as string;
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
