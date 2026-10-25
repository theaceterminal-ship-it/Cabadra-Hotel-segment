// Edge Function: partner-verify-payment
//
// Step two of a partner page payment: confirms the Razorpay payment and
// applies it (system_fulfil_partner_order, 0084, exactly once per order):
// the listing or featured spot is extended, the payment is recorded as
// online, and hotel commission is shared out if it's switched on. Called
// from Checkout's success callback (orderId, paymentId, signature), or
// with just orderId when the partner page finds a checkout that never
// finished; then Razorpay is asked whether the order has a payment. Same
// checks as verify-setup-payment: the payment must belong to this order
// and match its amount, and an authorized payment is captured first.
// Emails a receipt.
//
// Deploy: supabase functions deploy partner-verify-payment
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RESEND_API_KEY, RESEND_FROM

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, isValidCheckoutSignature, json, razorpay, razorpayKeys } from '../_shared/razorpay.ts';
import { figuresHtml, formatDate, inBackground, inr, invoiceUrl, partnerPageUrl, sendPartnerEmail } from '../_shared/partnerEmail.ts';
import { resolvePartner } from '../_shared/partnerAuth.ts';

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
  if (!keys) return json({ success: false, message: 'Online payments are not set up yet.' }, 500);

  let body: { token?: string; partnerId?: string; orderId?: string; paymentId?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON body' }, 400);
  }
  const orderId = body.orderId?.trim();
  if (!orderId) return json({ success: false, message: 'orderId is required' }, 400);
  const partnerId = await resolvePartner(req, body);
  if (typeof partnerId !== 'string') return partnerId;

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: row, error: rowErr } = await admin
    .from('partner_orders')
    .select('id, amount_paise, status, partner_id')
    .eq('razorpay_order_id', orderId)
    .maybeSingle();
  if (rowErr) return json({ success: false, message: rowErr.message }, 500);
  if (!row || row.partner_id !== partnerId) return json({ success: false, message: 'Payment not found' }, 404);
  if (row.status === 'paid') return json({ success: true, status: 'paid' });

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

  if (payment.order_id !== orderId || payment.amount !== row.amount_paise || payment.currency !== 'INR') {
    return json({ success: false, message: 'Payment does not match this order.' }, 400);
  }
  if (payment.status === 'authorized') {
    try {
      payment = await razorpay<RazorpayPayment>(keys, 'POST', `/payments/${encodeURIComponent(payment.id)}/capture`, {
        amount: row.amount_paise,
        currency: 'INR',
      });
    } catch (err) {
      return json({ success: false, message: err instanceof Error ? err.message : 'Could not capture the payment' }, 502);
    }
  }
  if (payment.status !== 'captured') return json({ success: false, message: `Payment is ${payment.status}, not completed.` }, 400);

  const { data: result, error: fulfilErr } = await admin.rpc('system_fulfil_partner_order', {
    p_order_id: row.id,
    p_razorpay_payment_id: payment.id,
  });
  if (fulfilErr) return json({ success: false, message: fulfilErr.message }, 500);
  const r = result as { alreadyPaid: boolean; kind: 'listing' | 'featured'; until: string; amount?: number; months?: number; partnerName?: string; email?: string | null; portalToken?: string; paymentId?: string };

  if (!r.alreadyPaid && r.email && r.portalToken) {
    const { data: inv } = await admin.from('partner_invoices').select('id, number').eq('payment_id', r.paymentId).maybeSingle();
    const what = r.kind === 'featured' ? 'Featured spot' : 'Listing';
    inBackground(sendPartnerEmail(r.email, {
      subject: `Payment received: ${r.partnerName}`,
      paragraphs: [
        `Thank you. We’ve received your payment for ${r.partnerName}.`,
        figuresHtml([
          ['For', `${what}, ${r.months} month${r.months === 1 ? '' : 's'}`],
          ['Amount', inr(r.amount ?? 0)],
          [r.kind === 'featured' ? 'Featured until' : 'Listed until', formatDate(r.until)],
          ['Razorpay payment', payment.id],
          ...(inv ? [['Invoice', inv.number] as [string, string]] : []),
        ]),
      ],
      button: inv ? { label: 'View your invoice', href: invoiceUrl(inv.id) } : { label: 'Open your partner page', href: partnerPageUrl(r.portalToken) },
      footnote: 'Your invoices are also on your partner page. We’ll remind you a few days before it runs out.',
    }));
  }

  return json({ success: true, status: 'paid', kind: r.kind, until: r.until });
});
