// Edge Function: verify-setup-payment
//
// Step two of the setup fee: confirms a Razorpay payment and creates the
// property it paid for (fulfil_setup_payment, service_role only). Called
// two ways:
//   - from Razorpay Checkout's success callback, with orderId, paymentId
//     and signature;
//   - with just orderId, when the dashboard finds a checkout that never
//     finished (tab closed after paying). Then it asks Razorpay directly
//     whether the order has a payment.
// Either way the payment is fetched from Razorpay and must belong to this
// order and match its amount before anything is created. An authorized
// but not yet captured payment is captured here, so it can't lapse and be
// refunded after the property already exists.
//
//
// After the owner's first property is created it also emails them a
// "set a password" link (Resend), since sign-up is Google-only.
//
// Deploy: supabase functions deploy verify-setup-payment
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (see ../_shared/razorpay.ts),
//          RESEND_API_KEY, RESEND_FROM (see ../_shared/passwordEmail.ts)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, isValidCheckoutSignature, json, razorpay, razorpayKeys } from '../_shared/razorpay.ts';
import { sendPasswordEmail } from '../_shared/passwordEmail.ts';

interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  const keys = razorpayKeys();
  if (!keys) return json({ success: false, message: 'Payments are not set up yet (missing Razorpay keys).' }, 500);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ success: false, message: 'Missing Authorization header' }, 401);
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return json({ success: false, message: 'Not signed in' }, 401);

  let body: { orderId?: string; paymentId?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON body' }, 400);
  }
  const orderId = body.orderId?.trim();
  if (!orderId) return json({ success: false, message: 'orderId is required' }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: row, error: rowErr } = await admin
    .from('property_setup_payments')
    .select('id, user_id, amount_paise, currency, status, property_id')
    .eq('razorpay_order_id', orderId)
    .maybeSingle();
  if (rowErr) return json({ success: false, message: rowErr.message }, 500);
  if (!row || row.user_id !== userData.user.id) return json({ success: false, message: 'Payment not found' }, 404);
  if (row.status === 'paid') return json({ success: true, status: 'paid', propertyId: row.property_id });

  let payment: RazorpayPayment | undefined;
  try {
    if (body.paymentId && body.signature) {
      const valid = await isValidCheckoutSignature(keys.keySecret, orderId, body.paymentId, body.signature);
      if (!valid) return json({ success: false, message: 'Payment signature did not match.' }, 400);
      payment = await razorpay<RazorpayPayment>(keys, 'GET', `/payments/${encodeURIComponent(body.paymentId)}`);
    } else {
      const list = await razorpay<{ items: RazorpayPayment[] }>(keys, 'GET', `/orders/${encodeURIComponent(orderId)}/payments`);
      payment = list.items.find(p => p.status === 'captured') ?? list.items.find(p => p.status === 'authorized');
      if (!payment) return json({ success: true, status: 'unpaid' });
    }
  } catch (err) {
    return json({ success: false, message: err instanceof Error ? err.message : 'Could not reach Razorpay' }, 502);
  }

  if (payment.order_id !== orderId || payment.amount !== row.amount_paise || payment.currency !== row.currency) {
    return json({ success: false, message: 'Payment does not match this order.' }, 400);
  }

  if (payment.status === 'authorized') {
    try {
      payment = await razorpay<RazorpayPayment>(keys, 'POST', `/payments/${encodeURIComponent(payment.id)}/capture`, {
        amount: row.amount_paise,
        currency: row.currency,
      });
    } catch (err) {
      return json({ success: false, message: err instanceof Error ? err.message : 'Could not capture the payment' }, 502);
    }
  }
  if (payment.status !== 'captured') {
    return json({ success: false, message: `Payment is ${payment.status}, not completed.` }, 400);
  }

  const { data: propertyId, error: fulfilErr } = await admin.rpc('fulfil_setup_payment', {
    p_order_id: orderId,
    p_payment_id: payment.id,
  });
  if (fulfilErr) return json({ success: false, message: fulfilErr.message }, 500);

  // The account is fully set up now: email the "set a password" link
  // (once per owner). In the background, and never allowed to affect the
  // payment result.
  const welcome = sendWelcomePasswordEmail(admin, callerClient, userData.user.id, userData.user.email, propertyId as string)
    .catch(err => console.error('Welcome password email failed:', err instanceof Error ? err.message : err));
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(welcome);
  else await welcome;

  return json({ success: true, status: 'paid', propertyId });
});

// deno-lint-ignore no-explicit-any
async function sendWelcomePasswordEmail(admin: any, callerClient: any, userId: string, email: string | undefined, propertyId: string) {
  if (!email) return;

  // Already has a password (or we can't tell): nothing to set up.
  const { data: hasPassword, error: pwErr } = await callerClient.rpc('my_auth_has_password');
  if (pwErr || hasPassword !== false) return;

  // Claim the send first, so two confirmations racing can't email twice.
  const { data: claimed } = await admin
    .from('organizations')
    .update({ password_email_sent_at: new Date().toISOString() })
    .eq('owner_user_id', userId)
    .is('password_email_sent_at', null)
    .select('id, owner_name');
  if (!claimed?.length) return;

  const { data: property } = await admin.from('properties').select('name').eq('id', propertyId).maybeSingle();
  try {
    await sendPasswordEmail(admin, email, 'welcome', { name: claimed[0].owner_name, propertyName: property?.name });
  } catch (err) {
    // Let a later payment (or the sign-in page's link) try again.
    await admin.from('organizations').update({ password_email_sent_at: null }).eq('id', claimed[0].id);
    throw err;
  }
}
