// The emails a hotel sends its guests through Cabadra, written for one guest at a time:
//   booking_confirmation  after an advance booking: dates, directions, a call button, add to calendar
//   checkout_thanks       after check-out: a thank-you in the hotel's voice and its Google review link
//
// Everything a person typed (names, notes, addresses) goes through escapeHtml; links must be https.
// Dates are shown in India time. Sent by guest-emails-send (the queue) and, as a sample, by property-guest-email.
//
// Secrets: RESEND_API_KEY, RESEND_FROM (the Cabadra sender; see stayCodeEmail.ts).

import { fromHeader } from './stayCodeEmail.ts';

export type GuestEmailKind = 'booking_confirmation' | 'pre_arrival' | 'checkout_thanks';

export interface GuestEmailContext {
  reservation: { id: string; status: string; source: string; booking_ref?: string | null; check_in: string; check_out: string; updated_eta?: string | null; party_size?: number | null; rate_per_night?: number | null };
  guest: { name?: string | null; email?: string | null };
  room: { number: string; type?: string | null };
  property: {
    id: string; name: string; location?: string | null; image?: string | null; currency?: string | null; enabled: boolean; pre_arrival_enabled?: boolean;
    address?: string | null; phone?: string | null; reply_to?: string | null; maps_url?: string | null;
    check_in_time?: string | null; check_out_time?: string | null; welcome_note?: string | null; thanks_note?: string | null; google_review_url?: string | null;
  };
  domain?: { domain: string; local_part: string } | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: string }[];
}

const TZ = 'Asia/Kolkata';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
const esc = (s?: string | null) => escapeHtml(s ?? '');
const httpsOnly = (u?: string | null): string | null => (u && /^https:\/\/\S+$/i.test(u) ? u : null);
const firstName = (n?: string | null) => (n ?? '').trim().split(/\s+/)[0] ?? '';

/** YYYY-MM-DD of an instant as seen in India. */
function istDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
}
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
const fmtShortDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ });
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(istDay(checkIn)), b = Date.parse(istDay(checkOut));
  return Math.max(1, Math.round((b - a) / 86400000));
}
function fmtTime(hhmm?: string | null, fallbackIso?: string): string | null {
  if (hhmm && /^\d{2}:\d{2}$/.test(hhmm)) {
    const [h, m] = hhmm.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
  if (fallbackIso) return new Date(fallbackIso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).toUpperCase();
  return null;
}
function money(n: number, currency?: string | null): string {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(n); } catch { return `${n}`; }
}

function mapsLink(p: GuestEmailContext['property']): string {
  return httpsOnly(p.maps_url) ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address || p.location].filter(Boolean).join(' '))}`;
}
const phoneDigits = (p?: string | null) => (p ?? '').replace(/[^\d+]/g, '');

// ---- shared pieces ------------------------------------------------------------------
const button = (href: string, label: string, primary = true) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;${primary ? 'background:#111;color:#fff' : 'background:#f1f3ef;color:#111'}">${esc(label)}</a>`;

function shell(p: GuestEmailContext['property'], inner: string, footerNote: string): string {
  const hero = httpsOnly(p.image);
  return `<!doctype html><html><body style="margin:0;background:#eef0ec;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
  <div style="max-width:520px;margin:0 auto;padding:28px 16px">
    <div style="font-size:15px;font-weight:600;letter-spacing:-0.01em;margin-bottom:14px;color:#444">${esc(p.name)}</div>
    <div style="background:#fff;border-radius:24px;overflow:hidden">
      ${hero ? `<img src="${esc(hero)}" alt="" width="520" style="display:block;width:100%;max-height:220px;object-fit:cover">` : ''}
      <div style="padding:28px">${inner}</div>
    </div>
    <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#888;text-align:center">${footerNote}</p>
  </div></body></html>`;
}

const row = (k: string, v: string) => `<tr><td style="padding:7px 0;font-size:13px;color:#777;width:38%;vertical-align:top">${esc(k)}</td><td style="padding:7px 0;font-size:14px;color:#111;font-weight:500">${v}</td></tr>`;

// ---- booking confirmation ---------------------------------------------------------------
function buildIcs(ctx: GuestEmailContext): string {
  const { reservation: r, property: p } = ctx;
  const ymd = (iso: string) => istDay(iso).replace(/-/g, '');
  const esc2 = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cabadra//Booking//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${r.id}@cabadra`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${ymd(r.check_in)}`, `DTEND;VALUE=DATE:${ymd(r.check_out)}`,
    `SUMMARY:${esc2(`Stay at ${p.name}`)}`, `LOCATION:${esc2([p.name, p.address || p.location].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${esc2(`Booking ${r.booking_ref ?? ''}. Check-in from ${fmtTime(p.check_in_time, r.check_in) ?? ''}.`)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

export function renderBookingConfirmation(ctx: GuestEmailContext): RenderedEmail {
  const { reservation: r, guest, room, property: p } = ctx;
  const name = firstName(guest.name);
  const nights = nightsBetween(r.check_in, r.check_out);
  const inT = fmtTime(p.check_in_time, r.check_in);
  const outT = fmtTime(p.check_out_time, r.check_out);
  const address = p.address || p.location || '';
  const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Stay at ${p.name}`)}&dates=${istDay(r.check_in).replace(/-/g, '')}/${istDay(r.check_out).replace(/-/g, '')}&location=${encodeURIComponent([p.name, address].filter(Boolean).join(', '))}&details=${encodeURIComponent(`Booking ${r.booking_ref ?? ''}`)}`;
  const total = r.rate_per_night ? money(Number(r.rate_per_night) * nights, p.currency) : null;

  const rows = [
    row('Check-in', `${esc(fmtDay(r.check_in))}${inT ? `<br><span style="color:#777;font-weight:400">from ${esc(inT)}</span>` : ''}`),
    row('Check-out', `${esc(fmtDay(r.check_out))}${outT ? `<br><span style="color:#777;font-weight:400">by ${esc(outT)}</span>` : ''}`),
    row('Stay', `${nights} night${nights === 1 ? '' : 's'}${r.party_size ? `, ${r.party_size} guest${r.party_size === 1 ? '' : 's'}` : ''}`),
    row('Room', `${esc(room.type || 'Room')}<br><span style="color:#777;font-weight:400">Room number confirmed at check-in</span>`),
    r.booking_ref ? row('Booking', esc(r.booking_ref)) : '',
    total ? row('Estimated total', `${esc(total)}<br><span style="color:#777;font-weight:400">${esc(money(Number(r.rate_per_night), p.currency))} a night, before tax</span>`) : '',
    row('Payment', 'Pay at the hotel'),
  ].join('');

  const tel = phoneDigits(p.phone);
  const buttons = button(mapsLink(p), 'Get directions') + (tel ? button(`tel:${tel}`, 'Call the hotel', false) : '');

  const inner = `
      <p style="margin:0 0 6px;font-size:15px">${name ? `Hi ${esc(name)},` : 'Hello,'}</p>
      <h1 style="margin:0 0 6px;font-size:24px;line-height:1.25;letter-spacing:-0.02em">You’re booked at ${esc(p.name)}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#444">We have your room ready for ${esc(fmtShortDay(r.check_in))}. Everything you need is below.</p>
      <table role="presentation" style="border-collapse:collapse;width:100%;margin:0 0 18px;border-top:1px solid #eee">${rows}</table>
      <p style="margin:0 0 6px;font-size:13px;color:#777">Where to find us</p>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.5">${esc(p.name)}${address ? `<br>${esc(address)}` : ''}</p>
      <div style="margin:0 0 6px">${buttons}</div>
      <p style="margin:0 0 20px;font-size:13px"><a href="${esc(calUrl)}" style="color:#111">Add to your calendar</a> <span style="color:#999">(a calendar file is attached too)</span></p>
      ${p.welcome_note ? `<div style="background:#f6f7f3;border-radius:16px;padding:14px 18px;margin:0 0 20px;font-size:14px;line-height:1.55;color:#333">${esc(p.welcome_note).replace(/\n/g, '<br>')}</div>` : ''}
      <p style="margin:0;font-size:13px;line-height:1.55;color:#666">Need to change something? Reply to this email${tel ? ' or call us' : ''} and it comes straight to the hotel.</p>`;

  const text = [
    name ? `Hi ${name},` : 'Hello,', '', `You're booked at ${p.name}.`, '',
    `Check-in: ${fmtDay(r.check_in)}${inT ? `, from ${inT}` : ''}`, `Check-out: ${fmtDay(r.check_out)}${outT ? `, by ${outT}` : ''}`,
    `Stay: ${nights} night${nights === 1 ? '' : 's'}${r.party_size ? `, ${r.party_size} guest${r.party_size === 1 ? '' : 's'}` : ''}`,
    `Room: ${room.type || 'Room'} (room number confirmed at check-in)`, r.booking_ref ? `Booking: ${r.booking_ref}` : '', total ? `Estimated total: ${total}` : '', 'Payment: pay at the hotel', '',
    `${p.name}${address ? `, ${address}` : ''}`, `Directions: ${mapsLink(p)}`, tel ? `Call: ${p.phone}` : '', `Add to calendar: ${calUrl}`, '',
    p.welcome_note ?? '', p.welcome_note ? '' : '', 'Need to change something? Reply to this email and it comes straight to the hotel.',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');

  return {
    subject: `Your stay at ${p.name} is confirmed: ${fmtShortDay(r.check_in)} to ${fmtShortDay(r.check_out)}`.replace(/[\r\n]/g, ' '),
    html: shell(p, inner, `Sent by ${esc(p.name)} through Cabadra, because a booking was made with this email address.`),
    text,
    attachments: [{ filename: 'your-stay.ics', content: btoa(unescape(encodeURIComponent(buildIcs(ctx)))) }],
  };
}

// ---- thank-you after check-out ------------------------------------------------------------
export function renderCheckoutThanks(ctx: GuestEmailContext): RenderedEmail {
  const { reservation: r, guest, property: p } = ctx;
  const name = firstName(guest.name);
  const nights = nightsBetween(r.check_in, r.check_out);
  const review = httpsOnly(p.google_review_url);
  const replyTo = p.reply_to;
  const feedbackLink = replyTo ? `mailto:${encodeURIComponent(replyTo).replace(/%40/g, '@')}?subject=${encodeURIComponent(`My stay at ${p.name}`)}` : null;
  const tel = phoneDigits(p.phone);

  const inner = `
      <p style="margin:0 0 6px;font-size:15px">${name ? `Dear ${esc(name)},` : 'Hello,'}</p>
      <h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;letter-spacing:-0.02em">Thank you for staying with us</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#333">${nights} night${nights === 1 ? '' : 's'} at ${esc(p.name)} went by quickly for us, and we hope they gave you the rest, the good food and the little moments you came looking for.</p>
      ${p.thanks_note ? `<div style="background:#f6f7f3;border-radius:16px;padding:14px 18px;margin:0 0 16px;font-size:14px;line-height:1.6;color:#333">${esc(p.thanks_note).replace(/\n/g, '<br>')}</div>` : ''}
      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#333">A few honest words from you mean the world to a small hotel like ours, and they help the next traveller choose well.</p>
      <div style="margin:0 0 6px">${review ? button(review, 'Share your stay on Google') : ''}${feedbackLink ? button(feedbackLink, review ? 'Tell us privately' : 'Tell us how it went', !review) : ''}</div>
      <p style="margin:12px 0 0;font-size:14px;line-height:1.65;color:#333">Until we see you again,<br><strong>${esc(p.name)}</strong></p>
      <p style="margin:18px 0 0;font-size:13px;line-height:1.55;color:#666">Planning another trip? Reply to this email${tel ? ' or call us' : ''} and we will take care of the booking directly.</p>`;

  const text = [
    name ? `Dear ${name},` : 'Hello,', '', 'Thank you for staying with us.', '',
    `${nights} night${nights === 1 ? '' : 's'} at ${p.name} went by quickly for us, and we hope they gave you the rest, the good food and the little moments you came looking for.`, '',
    p.thanks_note ?? '', p.thanks_note ? '' : '',
    'A few honest words from you mean the world to a small hotel like ours, and they help the next traveller choose well.', '',
    review ? `Share your stay on Google: ${review}` : '', feedbackLink ? `Tell us privately: just reply to this email.` : '', '',
    `Until we see you again,\n${p.name}`,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');

  return {
    subject: `Thank you for staying with us${name ? `, ${name}` : ''}`.replace(/[\r\n]/g, ' '),
    html: shell(p, inner, `Sent by ${esc(p.name)} through Cabadra, because you stayed with us.`),
    text,
  };
}


// ---- the day before: something ready on arrival ----------------------------------------------
export interface ArrivalOffer { url: string; name: string; price: number; image?: string | null }

/** A photo sized for an email: Cloudinary pictures are cropped to 520x300 JPEG; any other https picture is used as it is. */
function emailPhoto(u?: string | null): string | null {
  const url = httpsOnly(u);
  if (!url) return null;
  return /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?![^/]*[,_])/.test(url)
    ? url.replace('/image/upload/', '/image/upload/c_fill,w_520,h_300,q_auto,f_jpg/')
    : url;
}

function periodWords(eta: string): { greeting: string; ask: string } {
  const h = Number(new Date(eta).toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }).slice(0, 2));
  if (h < 11) return { greeting: 'a warm breakfast', ask: 'Fancy something for breakfast when you walk in?' };
  if (h < 15) return { greeting: 'lunch', ask: 'Arriving around lunchtime? We can have it waiting.' };
  if (h < 19) return { greeting: 'a hot cup or a bowl of something warm', ask: 'Arriving in the afternoon? Something warm can be waiting for you.' };
  return { greeting: 'dinner', ask: 'Arriving in the evening? We can have dinner ready.' };
}

export function renderPreArrival(ctx: GuestEmailContext, offers: ArrivalOffer[]): RenderedEmail {
  const { reservation: r, guest, property: p } = ctx;
  const name = firstName(guest.name);
  const eta = r.updated_eta ?? r.check_in;
  const etaTime = new Date(eta).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).toUpperCase();
  const { ask } = periodWords(eta);
  const address = p.address || p.location || '';
  const tel = phoneDigits(p.phone);
  const safeOffers = offers.filter(o => httpsOnly(o.url));
  const offerButtons = safeOffers.map(o => {
    const photo = emailPhoto(o.image);
    return `<a href="${esc(o.url)}" style="display:block;margin:0 0 12px;border-radius:18px;overflow:hidden;background:#fff;border:1px solid #e3e6df;text-decoration:none;color:#111">
          ${photo ? `<img src="${esc(photo)}" alt="${esc(o.name)}" width="520" style="display:block;width:100%;height:auto;max-height:170px;object-fit:cover">` : ''}
          <table role="presentation" style="border-collapse:collapse;width:100%"><tr>
            <td style="padding:12px 14px;font-size:15px;font-weight:600;line-height:1.35">${esc(o.name)}<br><span style="font-weight:400;font-size:13px;color:#666">${esc(money(o.price, p.currency))}</span></td>
            <td style="padding:12px 14px;text-align:right;white-space:nowrap"><span style="display:inline-block;background:#111;color:#fff;border-radius:999px;padding:9px 16px;font-size:13px;font-weight:600">Have it ready</span></td>
          </tr></table></a>`;
  }).join('');

  const inner = `
      <p style="margin:0 0 6px;font-size:15px">${name ? `Hi ${esc(name)},` : 'Hello,'}</p>
      <h1 style="margin:0 0 6px;font-size:24px;line-height:1.25;letter-spacing:-0.02em">See you ${esc(fmtShortDay(eta) === fmtShortDay(new Date().toISOString()) ? 'today' : fmtShortDay(eta))}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#444">We are getting ready for you at ${esc(p.name)}. You are expected around <strong>${esc(etaTime)}</strong>${p.check_in_time ? `, and check-in is from ${esc(fmtTime(p.check_in_time) ?? '')}` : ''}.</p>
      <div style="margin:0 0 4px">${button(mapsLink(p), 'Get directions')}${tel ? button(`tel:${tel}`, 'Call the hotel', false) : ''}</div>
      ${address ? `<p style="margin:0 0 22px;font-size:13px;line-height:1.5;color:#666">${esc(address)}</p>` : ''}
      <div style="background:#f6f7f3;border-radius:20px;padding:20px 20px 12px;margin:0 0 18px">
        <p style="margin:0 0 4px;font-size:16px;font-weight:600">${esc(ask)}</p>
        <p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#666">Tap one and the kitchen has it ready around the time you arrive. You pay at the hotel, and there is nothing else to do.</p>
        ${offerButtons}
        <p style="margin:6px 0 8px;font-size:12px;color:#888">Not hungry? Ignore this. Nothing happens unless you tap.</p>
      </div>
      <p style="margin:0;font-size:13px;line-height:1.55;color:#666">Running late or early? Reply to this email${tel ? ' or call us' : ''}.</p>`;

  const text = [
    name ? `Hi ${name},` : 'Hello,', '', `See you soon at ${p.name}. You are expected around ${etaTime}.`, '',
    ask, 'Tap one and the kitchen has it ready around the time you arrive. You pay at the hotel.', '',
    ...safeOffers.map(o => `${o.name} (${money(o.price, p.currency)}): ${o.url}`), '',
    `Directions: ${mapsLink(p)}`, tel ? `Call: ${p.phone}` : '', '', 'Not hungry? Ignore this. Nothing happens unless you tap.',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');

  return {
    subject: `See you ${fmtShortDay(eta)} at ${p.name}: something ready when you arrive?`.replace(/[\r\n]/g, ' '),
    html: shell(p, inner, `Sent by ${esc(p.name)} through Cabadra, because a booking was made with this email address.`),
    text,
  };
}

export function renderGuestEmail(kind: GuestEmailKind, ctx: GuestEmailContext, offers: ArrivalOffer[] = []): RenderedEmail {
  if (kind === 'pre_arrival') return renderPreArrival(ctx, offers);
  return kind === 'booking_confirmation' ? renderBookingConfirmation(ctx) : renderCheckoutThanks(ctx);
}

// ---- who it is sent as ---------------------------------------------------------------------
export interface Sender { from: string; via: 'own_domain' | 'cabadra' }

/** The hotel's own verified domain when it has one, otherwise "Hotel Name via Cabadra". */
export function pickSenders(ctx: GuestEmailContext, resendFrom: string): Sender[] {
  const cabadra: Sender = { from: fromHeader(ctx.property.name, resendFrom), via: 'cabadra' };
  if (!ctx.domain) return [cabadra];
  const display = ctx.property.name.replace(/[^\p{L}\p{N} .,'&()-]/gu, '').slice(0, 70).trim() || 'Reservations';
  return [{ from: `${display} <${ctx.domain.local_part}@${ctx.domain.domain}>`, via: 'own_domain' }, cabadra];
}

export class ResendError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function sendWithResend(args: { from: string; to: string; replyTo?: string | null; email: RenderedEmail }): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new ResendError('RESEND_API_KEY not set', 0);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: args.from, to: [args.to], subject: args.email.subject, html: args.email.html, text: args.email.text,
      ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      ...(args.email.attachments?.length ? { attachments: args.email.attachments } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ResendError(`Resend: ${(body as { message?: string }).message ?? res.status}`, res.status);
  }
}
