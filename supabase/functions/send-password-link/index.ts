// Edge Function: send-password-link
//
// "Forgot your password?" on the sign-in page. Emails a set-password link
// (see ../_shared/passwordEmail.ts) to an existing account. It also serves
// owners who signed up with Google and never set a password, or whose
// welcome email link expired.
//
// Always answers the same way whether or not the email has an account,
// so it can't be used to find out who has one. At most one email per
// account every 5 minutes and 5 a day.
//
// Deploy: supabase functions deploy send-password-link
// Secrets: RESEND_API_KEY, RESEND_FROM (see ../_shared/passwordEmail.ts)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, json } from '../_shared/razorpay.ts';
import { sendPasswordEmail } from '../_shared/passwordEmail.ts';

const SENT = { success: true, message: 'If there’s a Cabadra account for that email, we’ve sent it a link.' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON body' }, 400);
  }
  const email = body.email?.trim().toLowerCase() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ success: false, message: 'Enter a valid email address.' }, 400);
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: userId, error: lookupErr } = await admin.rpc('system_user_id_by_email', { p_email: email });
  if (lookupErr) {
    console.error('send-password-link lookup failed:', lookupErr.message);
    return json({ success: false, message: 'Something went wrong. Please try again.' }, 500);
  }
  // Internal no-login access accounts (0027) never get passwords.
  if (!userId || email.endsWith('@access.cabadra.internal')) return json(SENT);

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent, error: recentErr } = await admin
    .from('password_link_sends')
    .select('sent_at')
    .eq('user_id', userId)
    .gte('sent_at', dayAgo)
    .order('sent_at', { ascending: false });
  if (recentErr) {
    console.error('send-password-link throttle check failed:', recentErr.message);
    return json({ success: false, message: 'Something went wrong. Please try again.' }, 500);
  }
  const lastSent = recent?.[0] ? new Date(recent[0].sent_at).getTime() : 0;
  if ((recent?.length ?? 0) >= 5 || Date.now() - lastSent < 5 * 60 * 1000) return json(SENT);

  const { data: org } = await admin.from('organizations').select('owner_name').eq('owner_user_id', userId).maybeSingle();

  try {
    await sendPasswordEmail(admin, email, 'requested', { name: org?.owner_name ?? undefined });
  } catch (err) {
    // Logged, not shown: a different answer here would reveal that the
    // account exists. Check the function's logs if emails don't arrive.
    console.error('send-password-link send failed:', err instanceof Error ? err.message : err);
    return json(SENT);
  }

  await admin.from('password_link_sends').insert({ user_id: userId });
  return json(SENT);
});
