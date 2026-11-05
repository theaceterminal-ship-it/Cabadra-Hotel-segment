import { supabase } from './supabaseClient';

export interface PublicHotel {
  name: string;
  location: string;
  image: string | null;
  currency: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  phone: string | null;
  mapsUrl: string | null;
  /** Present only when the hotel charges GST: the room rate depends on the price per night. */
  gst: { lowRate: number; highRate: number; threshold: number } | null;
}

export interface PublicRoomType {
  type: string;
  /** The lowest price per night among the free rooms of this type. */
  price: number;
  sleeps: number;
  beds: string | null;
  image: string | null;
  left: number;
}

export interface PublicBookingResult {
  ref: string;
  roomType: string;
  hotel: string;
}

const clean = (message: string) => message.replace(/^.*?:\s*(?=[A-Z])/, '');

export async function fetchPublicHotel(slug: string): Promise<PublicHotel | null> {
  const { data, error } = await supabase.rpc('public_booking_property', { p_slug: slug });
  if (error) throw new Error(clean(error.message));
  return (data as PublicHotel | null) ?? null;
}

export async function searchPublicRooms(slug: string, checkIn: string, checkOut: string, guests: number): Promise<PublicRoomType[]> {
  const { data, error } = await supabase.rpc('public_booking_search', { p_slug: slug, p_check_in: checkIn, p_check_out: checkOut, p_guests: guests });
  if (error) throw new Error(clean(error.message));
  return (data ?? []) as PublicRoomType[];
}

export async function createPublicBooking(input: {
  slug: string; roomType: string; checkIn: string; checkOut: string; guests: number;
  name: string; phone: string; email: string; notes: string;
}): Promise<PublicBookingResult> {
  const { data, error } = await supabase.rpc('public_booking_create', {
    p_slug: input.slug, p_room_type: input.roomType, p_check_in: input.checkIn, p_check_out: input.checkOut, p_guests: input.guests,
    p_name: input.name, p_phone: input.phone, p_email: input.email || null, p_notes: input.notes || null,
  });
  if (error) throw new Error(clean(error.message));
  return data as PublicBookingResult;
}

/** The owner's side: whether the property's booking link is on, and its slug. */
export async function fetchBookingLink(propertyId: string): Promise<{ slug: string | null; enabled: boolean }> {
  const { data, error } = await supabase.from('properties').select('booking_slug, booking_enabled').eq('id', propertyId).single();
  if (error) throw error;
  return { slug: data.booking_slug ?? null, enabled: data.booking_enabled ?? false };
}

export async function setBookingLink(propertyId: string, enabled: boolean): Promise<{ slug: string | null; enabled: boolean }> {
  const { data, error } = await supabase.rpc('owner_set_booking_link', { p_property_id: propertyId, p_enabled: enabled });
  if (error) throw new Error(clean(error.message));
  return data as { slug: string | null; enabled: boolean };
}

/** The GST on a stay: the rate follows the price per night, as on the hotel's own bill. */
export function stayTotals(price: number, nights: number, gst: PublicHotel['gst']) {
  const subtotal = price * nights;
  const rate = gst ? (price <= gst.threshold ? gst.lowRate : gst.highRate) : 0;
  const tax = Math.round(subtotal * rate) / 100;
  return { subtotal, rate, tax, total: subtotal + tax };
}

/** "14:00" → "2:00 PM". */
export function clock(hhmm: string | null | undefined): string {
  const m = hhmm ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm) : null;
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}
