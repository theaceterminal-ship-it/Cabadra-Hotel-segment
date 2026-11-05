import React, { useEffect, useState } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { fetchGuestEmailSettings, type GuestEmailSettings } from '../../lib/staffApi';
import { buildBookingMessage, whatsappLink, type BookingMessageInput } from '../../lib/bookingMessage';

const settingsCache = new Map<string, Promise<GuestEmailSettings | null>>();
const loadSettings = (propertyId: string) => {
  let p = settingsCache.get(propertyId);
  if (!p) {
    p = fetchGuestEmailSettings(propertyId).catch(() => null);
    settingsCache.set(propertyId, p);
  }
  return p;
};

/**
 * The booking confirmation, filled in from the booking and the hotel's guest-email
 * settings (check-in times, maps link, welcome note). Reception can edit it, then
 * opens WhatsApp with it ready to send. No WhatsApp API: it only opens the chat.
 */
export function BookingWhatsAppShare({ propertyId, booking, guestPhone, onDone }: {
  propertyId: string;
  booking: BookingMessageInput;
  guestPhone?: string;
  onDone?: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    loadSettings(propertyId).then(s => { if (live) setText(buildBookingMessage(booking, s ?? {})); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, booking.checkInDate, booking.checkOutDate, booking.roomType, booking.ref]);

  if (text === null) return <p className="text-sm text-on-surface-variant">Preparing the message…</p>;

  return (
    <div className="space-y-3 text-left">
      <label className="block">
        <span className="text-xs text-on-surface-variant block mb-1">Message to the guest. Edit it if you like.</span>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={11}
          className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest p-3 text-sm text-on-surface focus:border-on-surface focus:outline-none"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <a
          href={whatsappLink(guestPhone, text)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onDone}
          className="h-10 px-4 rounded-full text-sm font-medium inline-flex items-center gap-1.5 bg-primary text-on-primary hover:bg-primary-hover"
        >
          <MessageCircle className="size-4" /> Send on WhatsApp
        </a>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {})}
          className="h-10 px-4 rounded-full text-sm font-medium inline-flex items-center gap-1.5 bg-surface-container-low text-on-surface hover:bg-surface-container"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {!guestPhone && <p className="text-xs text-on-surface-variant">No phone number on this booking, so WhatsApp will ask who to send it to.</p>}
    </div>
  );
}
