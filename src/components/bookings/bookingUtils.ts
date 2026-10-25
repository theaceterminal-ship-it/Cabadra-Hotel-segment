import type { Booking, BookingStatus } from '../../lib/staffApi';

/** YYYY-MM-DD in the desk's own timezone. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const todayIso = () => isoDate(new Date());

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000);
}

export const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', opts);

export const STATUS_LABEL: Record<BookingStatus, string> = {
  upcoming: 'Expected',
  checked_in: 'In house',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

export const STATUS_CHIP: Record<BookingStatus, string> = {
  upcoming: 'bg-surface-container-high text-on-surface',
  checked_in: 'bg-primary text-on-primary',
  checked_out: 'bg-surface-container text-on-surface-variant',
  cancelled: 'bg-error/10 text-error',
  no_show: 'bg-warning/15 text-warning',
};

/** Bookings that hold a room (shown on the calendar). */
export const holdsRoom = (b: Booking) => b.status === 'upcoming' || b.status === 'checked_in' || b.status === 'checked_out';
