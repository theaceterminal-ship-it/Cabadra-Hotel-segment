// Edge Function: stay-access-code-sms  (NOT deployed; see ../README.md)
//
// The text-message twin of stay-access-code. Same two actions, same rules:
//   { action: 'issue',  reservationId }  signed-in staff of that hotel
//   { action: 'resend', roomCode }       the guest, from the room QR page
// The code is made in the database and never returned to the caller.
//
// Deploy (after the steps in ../README.md): supabase functions deploy stay-access-code-sms
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, json } from '../_shared/razorpay.ts';
import { sendStayCodeSms } from '../_shared/smsTwilio.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  let body: { action?: string; reservationId?: string; roomCode?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON body' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if (body.action === 'resend') {
    const roomCode = (body.roomCode ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(roomCode)) return json({ success: true });
    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const { data, error } = await admin.rpc('system_guest_resend_stay_code', { p_room_code: roomCode, p_ip: ip });
    if (error) {
      console.error('stay-access-code-sms resend failed:', error.message);
      return json({ success: true });
    }
    if (data?.reason === 'slow_down') return json({ success: false, message: 'Please wait a little before asking for another code.' }, 429);
    if (data?.ok && data.channel === 'sms') {
      try {
        await sendStayCodeSms({ to: data.to, code: data.code, propertyName: data.property_name, roomNumber: data.room_number });
      } catch (err) {
        console.error('stay-access-code-sms resend failed:', err instanceof Error ? err.message : err);
      }
    }
    return json({ success: true });
  }

  if (body.action === 'issue') {
    const reservationId = body.reservationId?.trim();
    if (!reservationId) return json({ success: false, message: 'reservationId is required' }, 400);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, message: 'Missing Authorization header' }, 401);
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) return json({ success: false, message: 'Not signed in' }, 401);
    const { error: authErr } = await callerClient.rpc('staff_stay_access', { p_reservation_id: reservationId });
    if (authErr) return json({ success: false, message: 'Not allowed for this stay' }, 403);

    const { data, error } = await admin.rpc('system_issue_stay_code', { p_reservation_id: reservationId, p_channel: 'sms' });
    if (error) return json({ success: false, message: 'Could not make a code. Please try again.' }, 500);
    if (!data?.ok) {
      const message = data?.reason === 'no_phone' ? 'This guest has no phone number on file. Add one, or use the stay link.' : 'Could not make a code for this stay.';
      return json({ success: false, reason: data?.reason, message });
    }
    try {
      await sendStayCodeSms({ to: data.to, code: data.code, propertyName: data.property_name, roomNumber: data.room_number });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'send failed';
      await admin.rpc('system_stay_code_sent', { p_reservation_id: reservationId, p_error: reason });
      return json({ success: false, reason: 'send_failed', message: 'The text could not be sent. Use the stay link, or try again.' });
    }
    await admin.rpc('system_stay_code_sent', { p_reservation_id: reservationId, p_error: null });
    return json({ success: true });
  }

  return json({ success: false, message: 'Unknown action' }, 400);
});
