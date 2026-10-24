// Edge Function: create-setup-order
//
// Step one of paying the one-time setup fee for a new property. Saves the
// property form as a draft (property_setup_payments) and creates the
// matching Razorpay order. The amount is decided here, never by the
// browser. The property itself is only created by verify-setup-payment,
// once Razorpay confirms the payment. See
// supabase/migrations/0067_organizations_and_setup_fee.sql.
//
// Deploy: supabase functions deploy create-setup-order
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (see ../_shared/razorpay.ts)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, json, razorpay, razorpayKeys, setupFeePaise } from '../_shared/razorpay.ts';

interface PropertyDraft {
  name: string;
  location: string;
  image?: string;
  country?: string;
  currency?: string;
  hasExternalPms: boolean;
  pmsName?: string;
}

/** Keeps only the fields fulfil_setup_payment reads, trimmed and length-capped. */
function cleanDraft(raw: unknown): PropertyDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const name = str(d.name, 120);
  if (!name) return null;
  return {
    name,
    location: str(d.location, 160),
    image: str(d.image, 1000) || undefined,
    country: str(d.country, 2) || undefined,
    currency: str(d.currency, 3) || undefined,
    hasExternalPms: d.hasExternalPms === true,
    pmsName: str(d.pmsName, 80) || undefined,
  };
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
  const user = userData.user;

  let body: { property?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON body' }, 400);
  }
  const draft = cleanDraft(body.property);
  if (!draft) return json({ success: false, message: 'Property name is required.' }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle();
  if (orgErr) return json({ success: false, message: orgErr.message }, 500);
  if (!org) return json({ success: false, message: 'Add your business details before adding a property.' }, 400);

  // A checkout that's opened and abandoned costs nothing, but there's no
  // reason for one account to open dozens an hour.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await admin
    .from('property_setup_payments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since);
  if (countErr) return json({ success: false, message: countErr.message }, 500);
  if ((count ?? 0) >= 20) {
    return json({ success: false, message: 'Too many payment attempts. Please try again in an hour.' }, 429);
  }

  const amount = setupFeePaise();
  const { data: row, error: insertErr } = await admin
    .from('property_setup_payments')
    .insert({ user_id: user.id, organization_id: org.id, amount_paise: amount, currency: 'INR', property_draft: draft })
    .select('id')
    .single();
  if (insertErr || !row) return json({ success: false, message: insertErr?.message ?? 'Could not start checkout' }, 500);

  let order: { id: string; amount: number; currency: string };
  try {
    order = await razorpay(keys, 'POST', '/orders', {
      amount,
      currency: 'INR',
      receipt: row.id,
      notes: { setup_payment_id: row.id, user_id: user.id, property_name: draft.name },
    });
  } catch (err) {
    await admin.from('property_setup_payments').delete().eq('id', row.id);
    return json({ success: false, message: err instanceof Error ? err.message : 'Could not create the Razorpay order' }, 502);
  }

  const { error: updateErr } = await admin
    .from('property_setup_payments')
    .update({ razorpay_order_id: order.id })
    .eq('id', row.id);
  if (updateErr) return json({ success: false, message: updateErr.message }, 500);

  return json({
    success: true,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: keys.keyId,
  });
});
