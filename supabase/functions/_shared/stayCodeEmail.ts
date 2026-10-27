// The email a guest gets at check-in with the code that opens room service from
// the QR in their room. Written for that one guest: their name, the hotel, the
// room and the checkout day. Sent through Resend.
//
// Secrets: RESEND_API_KEY, RESEND_FROM (e.g. "Cabadra <hello@churmuri.com>", on a
// domain verified in Resend). The sender name shows the hotel: "Hotel Name via Cabadra".

export interface StayCodeDetails {
  to: string;
  code: string;
  guestName?: string | null;
  propertyName: string;
  roomNumber: string;
  checkOut?: string | null;
  /** Why this email is going out now: first time at check-in, or the guest asked again from the QR page. */
  reason?: 'checkin' | 'resend';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function firstName(name?: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

function formatDay(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
}

/** "Hotel Name via Cabadra" <address from RESEND_FROM>, with anything that could break the header removed. */
export function fromHeader(propertyName: string, resendFrom: string): string {
  const address = resendFrom.match(/<([^>]+)>/)?.[1] ?? resendFrom;
  const display = `${propertyName} via Cabadra`.replace(/[^\p{L}\p{N} .,'&()-]/gu, '').slice(0, 70).trim() || 'Cabadra';
  return `${display} <${address}>`;
}

export function renderStayCodeEmail(d: StayCodeDetails) {
  const hello = firstName(d.guestName) ? `Hi ${escapeHtml(firstName(d.guestName))},` : 'Hello,';
  const hotel = escapeHtml(d.propertyName);
  const room = escapeHtml(d.roomNumber);
  const day = formatDay(d.checkOut);
  const intro = d.reason === 'resend'
    ? `Here is a new code for Room ${room} at <strong>${hotel}</strong>. The earlier one no longer works.`
    : `Welcome to <strong>${hotel}</strong>. You are in Room ${room}. This code opens room service on your phone: food, housekeeping, requests and chat with the front desk.`;
  const introText = d.reason === 'resend'
    ? `Here is a new code for Room ${d.roomNumber} at ${d.propertyName}. The earlier one no longer works.`
    : `Welcome to ${d.propertyName}. You are in Room ${d.roomNumber}. This code opens room service on your phone: food, housekeeping, requests and chat with the front desk.`;
  const helloText = firstName(d.guestName) ? `Hi ${firstName(d.guestName)},` : 'Hello,';
  const digits = d.code.split('').map(c => `<span style="display:inline-block;width:34px;height:46px;line-height:46px;margin:0 3px;border-radius:12px;background:#f1f3ef;font-size:26px;font-weight:600">${c}</span>`).join('');
  const subject = `${d.code} is your room service code for ${d.propertyName}, Room ${d.roomNumber}`.replace(/[\r\n]/g, ' ');

  const html = `<!doctype html><html><body style="margin:0;background:#eef0ec;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
  <div style="max-width:480px;margin:0 auto;padding:32px 16px">
    <div style="font-size:15px;font-weight:600;letter-spacing:-0.01em;margin-bottom:16px;color:#444">${hotel}</div>
    <div style="background:#fff;border-radius:24px;padding:28px">
      <p style="margin:0 0 12px;font-size:15px">${hello}</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#333">${intro}</p>
      <div style="text-align:center;margin:0 0 24px">${digits}</div>
      <p style="margin:0 0 6px;font-size:14px;font-weight:600">To open it</p>
      <ol style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.7;color:#333">
        <li>In your room, scan the QR code (or tap the NFC tag).</li>
        <li>Type the six digits above, once.</li>
        <li>That is it. Your phone stays signed in${day ? ` until checkout on ${escapeHtml(day)}` : ' until you check out'}.</li>
      </ol>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#666">Please keep this code to yourself. Anyone who has it can place orders to your room. If the code stops working, tap “Send me a new code” on that page, or ask the front desk.</p>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#888;text-align:center">Sent by ${hotel} through Cabadra. You are getting this because you checked in with this email address.</p>
  </div></body></html>`;

  const text = `${helloText}\n\n${introText}\n\nYour code: ${d.code}\n\nTo open it:\n1. In your room, scan the QR code (or tap the NFC tag).\n2. Type the six digits, once.\n3. Your phone stays signed in${day ? ` until checkout on ${day}` : ' until you check out'}.\n\nPlease keep this code to yourself. If it stops working, tap "Send me a new code" on that page, or ask the front desk.\n\nSent by ${d.propertyName} through Cabadra.`;
  return { subject, html, text };
}

/** Sends the email. Throws with a reason on failure. */
export async function sendStayCodeEmail(d: StayCodeDetails): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const resendFrom = Deno.env.get('RESEND_FROM');
  if (!apiKey || !resendFrom) throw new Error('RESEND_API_KEY / RESEND_FROM not set');
  const { subject, html, text } = renderStayCodeEmail(d);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromHeader(d.propertyName, resendFrom), to: [d.to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Resend: ${(body as { message?: string }).message ?? res.status}`);
  }
}
