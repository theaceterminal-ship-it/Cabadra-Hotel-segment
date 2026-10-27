// Edge Function: stay-access-code
//
// Makes the 6-digit code that opens a stay's room-service app from the room QR,
// and emails it to the guest. The code is made in the database
// (system_issue_stay_code, 0091), mailed from here, and never sent back to the
// caller, so reception can't read it.
//
//   { action: 'issue',  reservationId }  signed-in staff of that hotel, at check-in or "send again"
//   { action: 'resend', roomCode }       the guest, from the room QR page: a new code to the address on file
//
// 'resend' always answers the same way (so it can't be used to learn whether a
// room has a guest or what their email is) and only ever mails the address on file.
// Phone codes (Twilio) are built separately and are not part of this function.
//
// Deploy: supabase functions deploy stay-access-code
// Secrets: RESEND_API_KEY, RESEND_FROM (see ../_shared/stayCodeEmail.ts)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, json } from '../_shared/razorpay.ts';
import { sendStayCodeEmail } from '../_shared/stayCodeEmail.ts';

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

  // ---- the guest asking again from the QR page ---------------------------
  if (body.action === 'resend') {
    const roomCode = (body.roomCode ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(roomCode)) return json({ success: true });
    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const { data, error } = await admin.rpc('system_guest_resend_stay_code', { p_room_code: roomCode, p_ip: ip });
    if (error) {
      console.error('stay-access-code resend failed:', error.message);
      return json({ success: true });
    }
    if (data?.reason === 'slow_down') {
      return json({ success: false, message: 'Please wait a little before asking for another code.' }, 429);
    }
    if (data?.ok) {
      try {
        await sendStayCodeEmail({ to: data.to, code: data.code, guestName: data.guest_name, propertyName: data.property_name, roomNumber: data.room_number, checkOut: data.check_out, reason: 'resend' });
      } catch (err) {
        console.error('stay-access-code resend email failed:', err instanceof Error ? err.message : err);
      }
    }
    return json({ success: true });
  }

  // ---- staff sending (or re-sending) at check-in --------------------------
  if (body.action === 'issue') {
    const reservationId = body.reservationId?.trim();
    if (!reservationId) return json({ success: false, message: 'reservationId is required' }, 400);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ success: false, message: 'Missing Authorization header' }, 401);

    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) return json({ success: false, message: 'Not signed in' }, 401);
    // Raises unless this person is staff for the stay's hotel.
    const { error: authErr } = await callerClient.rpc('staff_stay_access', { p_reservation_id: reservationId });
    if (authErr) return json({ success: false, message: 'Not allowed for this stay' }, 403);

    const { data, error } = await admin.rpc('system_issue_stay_code', { p_reservation_id: reservationId, p_channel: 'email' });
    if (error) {
      console.error('stay-access-code issue failed:', error.message);
      return json({ success: false, message: 'Could not make a code. Please try again.' }, 500);
    }
    if (!data?.ok) {
      const message = data?.reason === 'no_email'
        ? 'This guest has no email on file. Add one, or use the stay link.'
        : data?.reason === 'not_checked_in'
          ? 'The code can be sent once the guest is checked in.'
          : 'Could not make a code for this stay.';
      return json({ success: false, reason: data?.reason, message }, 200);
    }
    try {
      await sendStayCodeEmail({ to: data.to, code: data.code, guestName: data.guest_name, propertyName: data.property_name, roomNumber: data.room_number, checkOut: data.check_out, reason: 'checkin' });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'send failed';
      console.error('stay-access-code email failed:', reason);
      await admin.rpc('system_stay_code_sent', { p_reservation_id: reservationId, p_error: reason });
      return json({ success: false, reason: 'send_failed', message: 'The email could not be sent. Use the stay link, or try again.' }, 200);
    }
    await admin.rpc('system_stay_code_sent', { p_reservation_id: reservationId, p_error: null });
    return json({ success: true });
  }

  return json({ success: false, message: 'Unknown action' }, 400);
});
