// Sends a text through Twilio's Messages API.
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM.

export interface StayCodeSms {
  /** E.164, e.g. +919812345678 */
  to: string;
  code: string;
  propertyName: string;
  roomNumber: string;
}

export function stayCodeSmsBody(d: StayCodeSms): string {
  const clean = (s: string) => s.replace(/[^\p{L}\p{N} .,'&()-]/gu, '').slice(0, 40);
  return `${d.code} is your room service code for ${clean(d.propertyName)}, Room ${clean(d.roomNumber)}. Scan the QR in your room and enter it once. Do not share it. - Cabadra`;
}

export async function sendStayCodeSms(d: StayCodeSms): Promise<void> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const service = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
  const from = Deno.env.get('TWILIO_FROM');
  if (!sid || !token || (!service && !from)) throw new Error('Twilio secrets are not set');
  if (!/^\+[1-9]\d{6,14}$/.test(d.to)) throw new Error('The phone number is not in international format');

  const form = new URLSearchParams({ To: d.to, Body: stayCodeSmsBody(d) });
  if (service) form.set('MessagingServiceSid', service); else form.set('From', from!);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Twilio: ${(body as { message?: string }).message ?? res.status}`);
  }
}
