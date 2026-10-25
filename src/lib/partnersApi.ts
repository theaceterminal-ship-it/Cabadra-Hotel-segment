import { supabase } from './supabaseClient';
import { functionErrorMessage, loadRazorpayCheckout } from './setupPayment';

/**
 * The partners marketplace from the business's side (0084, 0085): the
 * website's /partners page, and the partner page itself. A business signs
 * in like an owner (Google, or email + password once set) and its pages
 * are reached by partner id. A business made before it had an account can
 * still be opened by its emailed link (/partner/:token) until someone signs
 * in with its email; then the link asks for sign-in. Prices are decided
 * server-side (partner-create-order); nothing here names an amount.
 */

/** How a page names its business: the signed-in account's own, or a private link. */
export type PartnerRef = { partnerId: string } | { token: string };
const refParams = (ref: PartnerRef) => ('partnerId' in ref ? { p_token: null, p_partner_id: ref.partnerId } : { p_token: ref.token, p_partner_id: null });

/** Raised when an emailed link belongs to a business that has an account now. */
export class SignInRequiredError extends Error {}

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
  /** GST is added at checkout (prices set before tax). */
  gstExtra?: boolean;
  gstRate?: number;
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

export interface MyBusiness { id: string; name: string; status: 'pending' | 'approved' | 'rejected'; paidUntil: string | null; photo: string | null }

/** Links any business whose email is this account's, and lists the account's businesses. */
export async function claimMyBusinesses(): Promise<MyBusiness[]> {
  const { data, error } = await supabase.rpc('partner_claim');
  if (error) throw new Error(error.message);
  return (data ?? []) as MyBusiness[];
}

/** For the "/" redirect: is this account a partner (and so not a new hotel owner)? */
export async function isPartnerAccount(): Promise<boolean> {
  const { data, error } = await supabase.rpc('partner_is_member');
  return !error && data === true;
}

/** partner_apply: a pending application owned by this account. The business is emailed (partner-mailer). */
export async function applyAsPartner(application: PartnerApplication): Promise<string> {
  const { data, error } = await supabase.rpc('partner_apply', { p: application });
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/** The fields guests see; edits to these wait for review once the listing is approved. */
export type ListingFields = Pick<PartnerApplication, 'name' | 'category' | 'tagline' | 'description' | 'photo' | 'phone' | 'whatsapp' | 'mapsUrl' | 'address' | 'openingHours' | 'offerText' | 'areas'> & { offerCode: string };

/** 'in_review' (approved listing, waits for us), 'saved' (not live yet, saved as is) or 'unchanged'. */
export async function submitListingChanges(partnerId: string, fields: ListingFields): Promise<'in_review' | 'saved' | 'unchanged'> {
  const { data, error } = await supabase.rpc('partner_submit_changes', { p_partner_id: partnerId, p: fields });
  if (error) throw new Error(error.message);
  return data as 'in_review' | 'saved' | 'unchanged';
}

export async function withdrawListingChanges(partnerId: string) {
  const { error } = await supabase.rpc('partner_withdraw_changes', { p_partner_id: partnerId });
  if (error) throw new Error(error.message);
}

export interface PartnerDetails { email: string; ownerName: string; legalName: string; gstin: string; billingAddress: string; stateCode: string }

/** Contact email and billing details: private, saved straight away. */
export async function savePartnerDetails(partnerId: string, details: PartnerDetails) {
  const { error } = await supabase.rpc('partner_save_details', { p_partner_id: partnerId, p: details });
  if (error) throw new Error(error.message);
}

export interface PartnerInvoice {
  id: string;
  number: string;
  fy: string;
  issued_on: string;
  tax_invoice: boolean;
  description: string;
  sac_code: string;
  gst_rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  seller: { name: string; address: string; gstin: string | null; stateCode: string };
  buyer: { name: string; tradeName: string; address: string | null; gstin: string | null; stateCode: string | null; email: string | null; payment: string };
}

export async function fetchPartnerInvoice(invoiceId: string, token?: string | null): Promise<PartnerInvoice> {
  const { data, error } = await supabase.rpc('partner_invoice_get', { p_invoice_id: invoiceId, p_token: token ?? null });
  if (error) throw new Error(error.message);
  const d = data as PartnerInvoice;
  const n = (v: unknown) => Number(v);
  return { ...d, gst_rate: n(d.gst_rate), taxable: n(d.taxable), cgst: n(d.cgst), sgst: n(d.sgst), igst: n(d.igst), total: n(d.total) };
}

/** Indian states and union territories by GST state code, for billing details. */
export const GST_STATES: [string, string][] = [
  ['01', 'Jammu & Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'], ['06', 'Haryana'],
  ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'],
  ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'],
  ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['26', 'Dadra & Nagar Haveli and Daman & Diu'],
  ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
  ['35', 'Andaman & Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
];
export const stateName = (code: string | null | undefined) => GST_STATES.find(([c]) => c === code)?.[1] ?? null;

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
  source: 'guest' | 'reception';
  rating: number | null;
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
    mapsUrl: string | null;
    pendingChanges: ListingFields | null;
    changesSubmittedAt: string | null;
    changesNote: string | null;
    legalName: string | null;
    gstin: string | null;
    billingAddress: string | null;
    stateCode: string | null;
    hasAccount: boolean;
  };
  today: string;
  pricing: PartnerPricing;
  reach: { name: string; location: string }[];
  stats30: { views: number; opens: number; contacts: number };
  payments: { kind: 'listing' | 'featured'; amount: number; months: number; coversFrom: string; paidUntil: string; source: 'manual' | 'online'; createdAt: string; invoiceId: string | null; invoiceNumber: string | null }[];
  requests: PortalRequest[];
  rating: { average: number | null; count: number };
  ratings: { stars: number; comment: string | null; createdAt: string }[];
}

export async function fetchPartnerPortal(ref: PartnerRef): Promise<PartnerPortal> {
  const { data, error } = 'partnerId' in ref
    ? await supabase.rpc('partner_page_get', { p_partner_id: ref.partnerId })
    : await supabase.rpc('partner_portal_get', { p_token: ref.token });
  if (error) {
    if (error.message.startsWith('SIGN_IN_REQUIRED')) throw new SignInRequiredError(error.message.replace(/^SIGN_IN_REQUIRED:\s*/, ''));
    throw new Error(error.message);
  }
  const d = data as PartnerPortal;
  return {
    ...d,
    rating: { average: d.rating?.average == null ? null : Number(d.rating.average), count: Number(d.rating?.count ?? 0) },
    pricing: { ...d.pricing, listingFeeMonthly: Number(d.pricing.listingFeeMonthly), featuredFeeMonthly: Number(d.pricing.featuredFeeMonthly) },
    payments: d.payments.map(p => ({ ...p, amount: Number(p.amount) })),
  };
}

export async function updatePartnerRequest(ref: PartnerRef, requestId: string, status: 'accepted' | 'declined' | 'done', note?: string) {
  const { error } = await supabase.rpc('partner_update_request', { ...refParams(ref), p_request_id: requestId, p_status: status, p_note: note ?? null });
  if (error) throw new Error(error.message);
}

interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** The last checkout opened from this browser, so one paid but never confirmed (tab closed) finishes on the next visit. */
const pendingKey = (ref: PartnerRef) => `cabadra:partner-order:${'partnerId' in ref ? ref.partnerId : ref.token}`;

async function verifyPartnerPayment(body: PartnerRef & { orderId: string; paymentId?: string; signature?: string }) {
  const { data, error } = await supabase.functions.invoke('partner-verify-payment', { body });
  if (error) throw new Error(await functionErrorMessage(error, 'Couldn’t confirm the payment. If you were charged, refresh in a minute and it will finish on its own.'));
  return data as { success: boolean; status?: 'paid' | 'unpaid'; kind?: string; until?: string; message?: string };
}

/** Opens Razorpay Checkout for a listing or featured spot; resolves with the new end date once verified. */
export async function payFromPartnerPage(
  ref: PartnerRef,
  kind: 'listing' | 'featured',
  months: number,
  callbacks?: { onVerifying?: () => void },
): Promise<string> {
  await loadRazorpayCheckout();
  const { data, error } = await supabase.functions.invoke('partner-create-order', { body: { ...ref, kind, months } });
  if (error) throw new Error(await functionErrorMessage(error, 'Couldn’t start the payment. Please try again.'));
  const order = data as { success: boolean; orderId?: string; amount?: number; currency?: string; keyId?: string; prefill?: Record<string, string>; message?: string };
  if (!order.success || !order.orderId || !order.keyId) throw new Error(order.message ?? 'Couldn’t start the payment.');
  try { localStorage.setItem(pendingKey(ref), order.orderId); } catch { /* storage blocked: no recovery, the callback still works */ }

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
          const result = await verifyPartnerPayment({ ...ref, orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature });
          if (!result.success || result.status !== 'paid') throw new Error(result.message ?? 'Couldn’t confirm the payment.');
          try { localStorage.removeItem(pendingKey(ref)); } catch { /* ignore */ }
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
export async function finishPendingPartnerPayment(ref: PartnerRef): Promise<boolean> {
  let orderId: string | null = null;
  try { orderId = localStorage.getItem(pendingKey(ref)); } catch { return false; }
  if (!orderId) return false;
  try {
    const result = await verifyPartnerPayment({ ...ref, orderId });
    if (result.success) localStorage.removeItem(pendingKey(ref));
    return result.success && result.status === 'paid';
  } catch {
    return false;
  }
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
