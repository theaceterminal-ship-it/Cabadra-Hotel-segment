import type { GuestEmailSettings } from './staffApi';

export interface BookingMessageInput {
  propertyName: string;
  guestName: string;
  roomType?: string;
  /** YYYY-MM-DD */
  checkInDate: string;
  checkOutDate: string;
  nights?: number;
  partySize?: number;
  ref?: string;
  /** Advance already received, shown only when above zero. */
  advancePaid?: number;
  currencyLabel?: string;
}

type MessageSettings = Pick<GuestEmailSettings, 'checkInTime' | 'checkOutTime' | 'mapsUrl' | 'welcomeNote' | 'phone'>;

const day = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** "14:00" → "2:00 PM"; anything else is returned as typed. */
function clock(hhmm: string): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The booking confirmation reception can edit and send on WhatsApp. WhatsApp shows *text* in bold. */
export function buildBookingMessage(b: BookingMessageInput, s: Partial<MessageSettings> = {}): string {
  const first = b.guestName.trim().split(/\s+/)[0] || 'there';
  const lines: string[] = [
    `Hello ${first}, your booking at *${b.propertyName}* is confirmed.`,
    '',
    `Check-in: ${day(b.checkInDate)}${s.checkInTime ? ` (from ${clock(s.checkInTime)})` : ''}`,
    `Check-out: ${day(b.checkOutDate)}${s.checkOutTime ? ` (by ${clock(s.checkOutTime)})` : ''}`,
  ];
  const stay = [
    b.roomType,
    b.nights ? `${b.nights} night${b.nights === 1 ? '' : 's'}` : '',
    b.partySize ? `${b.partySize} guest${b.partySize === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ');
  if (stay) lines.push(`Room: ${stay}`);
  if (b.advancePaid && b.advancePaid > 0) lines.push(`Advance received: ${b.currencyLabel ?? ''}${b.advancePaid.toLocaleString('en-IN')}`);
  if (b.ref) lines.push(`Booking ref: #${b.ref}`);
  if (s.mapsUrl) lines.push('', `Directions: ${s.mapsUrl}`);
  if (s.phone) lines.push(`Call us: ${s.phone}`);
  if (s.welcomeNote?.trim()) lines.push('', s.welcomeNote.trim());
  lines.push('', `We look forward to hosting you.`, b.propertyName);
  return lines.join('\n');
}

/** wa.me link for a guest's number (10-digit Indian numbers get 91). With no number, WhatsApp asks who to send it to. */
export function whatsappLink(phone: string | undefined, text: string): string {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
