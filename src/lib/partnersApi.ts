import { supabase } from './supabaseClient';
import { functionErrorMessage, loadRazorpayCheckout } from './setupPayment';

/**
 * The partners marketplace from the business's side (0084): the website's
 * /partners page (pricing and the application form) and the business's
 * private partner page (/partner/:token). There's no login: the portal
 * token in the link is the credential, like a guest's link. Prices are
 * decided server-side (partner-create-order); nothing here names an amount.
 */

export type PartnerCategory = 'restaurant' | 'cafe' | 'taxi' | 'tours' | 'adventure' | 'spa' | 'shopping' | 'other';

export const PARTNER_CATEGORIES: { id: PartnerCategory; label: string }[] = [
  { id: 'taxi', label: 'Taxi & cabs' },
  { id: 'tours', label: 'Tours & guides' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'spa', label: 'Spa & wellness' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'cafe', label: 'Café' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'other', label: 'Something else' },
];

export interface PartnerPricing {
  listingFeeMonthly: number;
  featuredFeeMonthly: number;
  currency: 'INR';
}

export async function fetchPartnerPricing(): Promise<PartnerPricing | null> {
  const { data, error } = await supabase.rpc('public_partner_pricing');
  if (error || !data) return null;
  return { ...(data as PartnerPricing), listingFeeMonthly: Number((data as PartnerPricing).listingFeeMonthly), featuredFeeMonthly: Number((data as PartnerPricing).featuredFeeMonthly) };
}

export interface PartnerApplication {
  name: string;
  category: PartnerCategory | '';
  ownerName: string;
  phone: string;
  whatsapp: string;
  email: string;
  areas: string[];
  address: string;
  mapsUrl: string;
  openingHours: string;
  tagline: string;
  description: string;
  offerText: string;
  photo: string;
}

/** partner-signup: saves a pending application and emails the business its partner page link. */
export async function submitPartnerApplication(application: PartnerApplication): Promise<string> {
  const { data, error } = await supabase.functions.invoke('partner-signup', { body: { application } });
  if (error) throw new Error(await functionErrorMessage(error, 'Couldn’t send your application. Please try again.'));
  const r = data as { success: boolean; portalToken?: string; message?: string };
  if (!r.success || !r.portalToken) throw new Error(r.message ?? 'Couldn’t send your application.');
  return r.portalToken;
}

export interface PortalRequest {
  id: string;
  guestName: string | null;
  guestPhone: string | null;
  hotelName: string;
  roomNumber: string | null;
  message: string;
  preferredTime: string | null;
  partySize: number | null;
  status: 'new' | 'accepted' | 'declined' | 'done';
  businessNote: string | null;
  createdAt: string;
}

export interface PartnerPortal {
  partner: {
    id: string;
    name: string;
    category: PartnerCategory;
    tagline: string | null;
    description: string | null;
    photo: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    ownerName: string | null;
    address: string | null;
    openingHours: string | null;
    offerText: string | null;
    offerCode: string | null;
    areas: string[];
    status: 'pending' | 'approved' | 'rejected';
    reviewNote: string | null;
    active: boolean;
    paidUntil: string | null;
    featuredUntil: string | null;
    appliedAt: string | null;
  };
  today: string;
  pricing: PartnerPricing;
  reach: { name: string; location: string }[];
  stats30: { views: number; opens: number; contacts: number };
  payments: { kind: 'listing' | 'featured'; amount: number; months: number; coversFrom: string; paidUntil: string; source: 'manual' | 'online'; createdAt: string }[];
  requests: PortalRequest[];
}

export async function fetchPartnerPortal(token: string): Promise<PartnerPortal> {
  const { data, error } = await supabase.rpc('partner_portal_get', { p_token: token });
  if (error) throw new Error(error.message);
  const d = data as PartnerPortal;
  return {
    ...d,
    pricing: { ...d.pricing, listingFeeMonthly: Number(d.pricing.listingFeeMonthly), featuredFeeMonthly: Number(d.pricing.featuredFeeMonthly) },
    payments: d.payments.map(p => ({ ...p, amount: Number(p.amount) })),
  };
}

export async function updatePartnerRequest(token: string, requestId: string, status: 'accepted' | 'declined' | 'done', note?: string) {
  const { error } = await supabase.rpc('partner_portal_update_request', { p_token: token, p_request_id: requestId, p_status: status, p_note: note ?? null });
  if (error) throw new Error(error.message);
}

interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** The last checkout opened from this browser, so one paid but never confirmed (tab closed) finishes on the next visit. */
const pendingKey = (token: string) => `cabadra:partner-order:${token}`;

async function verifyPartnerPayment(body: { token: string; orderId: string; paymentId?: string; signature?: string }) {
  const { data, error } = await supabase.functions.invoke('partner-verify-payment', { body });
  if (error) throw new Error(await functionErrorMessage(error, 'Couldn’t confirm the payment. If you were charged, refresh in a minute and it will finish on its own.'));
  return data as { success: boolean; status?: 'paid' | 'unpaid'; kind?: string; until?: string; message?: string };
}

/** Opens Razorpay Checkout for a listing or featured spot; resolves with the new end date once verified. */
export async function payFromPartnerPage(
  token: string,
  kind: 'listing' | 'featured',
  months: number,
  callbacks?: { onVerifying?: () => void },
): Promise<string> {
  await loadRazorpayCheckout();
  const { data, error } = await supabase.functions.invoke('partner-create-order', { body: { token, kind, months } });
  if (error) throw new Error(await functionErrorMessage(error, 'Couldn’t start the payment. Please try again.'));
  const order = data as { success: boolean; orderId?: string; amount?: number; currency?: string; keyId?: string; prefill?: Record<string, string>; message?: string };
  if (!order.success || !order.orderId || !order.keyId) throw new Error(order.message ?? 'Couldn’t start the payment.');
  try { localStorage.setItem(pendingKey(token), order.orderId); } catch { /* storage blocked: no recovery, the callback still works */ }

  return new Promise<string>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'Cabadra Partners',
      description: `${kind === 'featured' ? 'Featured spot' : 'Listing'} · ${months} month${months === 1 ? '' : 's'}`,
      prefill: order.prefill,
      theme: { color: '#111111' },
      handler: async (resp: RazorpayCheckoutResponse) => {
        callbacks?.onVerifying?.();
        try {
          const result = await verifyPartnerPayment({ token, orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature });
          if (!result.success || result.status !== 'paid') throw new Error(result.message ?? 'Couldn’t confirm the payment.');
          try { localStorage.removeItem(pendingKey(token)); } catch { /* ignore */ }
          resolve(result.until ?? '');
        } catch (err) {
          reject(err);
        }
      },
      modal: { ondismiss: () => reject(new Error('Payment cancelled. You haven’t been charged.')) },
    });
    checkout.on('payment.failed', resp => console.warn('Razorpay payment failed:', resp.error?.description));
    checkout.open();
  });
}

/** Finishes a checkout from this browser that was paid but never confirmed. True when it applied one. */
export async function finishPendingPartnerPayment(token: string): Promise<boolean> {
  let orderId: string | null = null;
  try { orderId = localStorage.getItem(pendingKey(token)); } catch { return false; }
  if (!orderId) return false;
  try {
    const result = await verifyPartnerPayment({ token, orderId });
    if (result.success) localStorage.removeItem(pendingKey(token));
    return result.success && result.status === 'paid';
  } catch {
    return false;
  }
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
