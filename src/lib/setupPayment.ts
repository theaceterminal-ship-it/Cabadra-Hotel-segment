import { supabase } from './supabaseClient';

/**
 * Paid onboarding, browser side: the owner's business details
 * (organizations) and the one-time setup fee per property, paid with
 * Razorpay Checkout. The amount and the property creation are decided
 * server-side (create-setup-order / verify-setup-payment Edge Functions,
 * 0067_organizations_and_setup_fee.sql); nothing here can create a
 * property on its own.
 */

/** Display only — the amount actually charged comes from create-setup-order. */
export const SETUP_FEE_INR = 4999;

export interface Organization {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
}

export interface PropertyDraft {
  name: string;
  location: string;
  image?: string;
  country?: string;
  currency?: string;
  hasExternalPms: boolean;
  pmsName?: string;
}

/** What a visitor typed into the website's setup bar, kept across sign-up (including the Google redirect) so onboarding can prefill it. */
const WEBSITE_DRAFT_KEY = 'cabadra:website-setup-draft';

export interface WebsiteSetupDraft {
  property?: string;
  city?: string;
  rooms?: string;
}

export function rememberWebsiteSetupDraft(params: URLSearchParams) {
  const draft: WebsiteSetupDraft = {
    property: params.get('property') ?? undefined,
    city: params.get('city') ?? undefined,
    rooms: params.get('rooms') ?? undefined,
  };
  if (!draft.property && !draft.city && !draft.rooms) return;
  try {
    sessionStorage.setItem(WEBSITE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage blocked — onboarding just starts with empty fields.
  }
}

export function readWebsiteSetupDraft(): WebsiteSetupDraft {
  try {
    return JSON.parse(sessionStorage.getItem(WEBSITE_DRAFT_KEY) ?? '{}') as WebsiteSetupDraft;
  } catch {
    return {};
  }
}

export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (body && typeof body.message === 'string') return body.message;
    } catch {
      // Not JSON (function not deployed, gateway error) — use the fallback.
    }
  }
  return fallback;
}

export async function fetchMyOrganization(): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, owner_name, phone')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, name: data.name, ownerName: data.owner_name, phone: data.phone };
}

export async function saveMyOrganization(input: { name: string; ownerName: string; phone: string }): Promise<Organization> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('organizations')
    .upsert(
      {
        owner_user_id: userId,
        name: input.name.trim(),
        owner_name: input.ownerName.trim(),
        phone: input.phone.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_user_id' },
    )
    .select('id, name, owner_name, phone')
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, ownerName: data.owner_name, phone: data.phone };
}

interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: (resp: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let checkoutScript: Promise<void> | null = null;

export function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (!checkoutScript) {
    checkoutScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        checkoutScript = null;
        reject(new Error('Couldn’t load Razorpay. Check your connection and try again.'));
      };
      document.body.appendChild(script);
    });
  }
  return checkoutScript;
}

async function verifySetupPayment(body: { orderId: string; paymentId?: string; signature?: string }) {
  const { data, error } = await supabase.functions.invoke('verify-setup-payment', { body });
  if (error) throw new Error(await functionErrorMessage(error, 'Couldn’t confirm the payment. If you were charged, refresh in a minute and it will finish on its own.'));
  return data as { success: boolean; status?: 'paid' | 'unpaid'; propertyId?: string; message?: string };
}

/**
 * Opens Razorpay Checkout for one property's setup fee and resolves with
 * the new property's id once the payment is verified and the property
 * exists. Rejects if the guest closes the checkout or the payment fails.
 */
export async function payForNewProperty(
  draft: PropertyDraft,
  prefill: { name?: string; email?: string; contact?: string },
  callbacks?: { onCheckoutOpen?: () => void; onVerifying?: () => void },
): Promise<string> {
  await loadRazorpayCheckout();

  const { data, error } = await supabase.functions.invoke('create-setup-order', { body: { property: draft } });
  if (error) throw new Error(await functionErrorMessage(error, 'Couldn’t start the payment. Please try again.'));
  const order = data as { success: boolean; orderId?: string; amount?: number; currency?: string; keyId?: string; message?: string };
  if (!order.success || !order.orderId || !order.keyId) throw new Error(order.message ?? 'Couldn’t start the payment.');

  return new Promise<string>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'Cabadra',
      description: `One-time setup · ${draft.name}`,
      prefill,
      theme: { color: '#111111' },
      handler: async (resp: RazorpayCheckoutResponse) => {
        callbacks?.onVerifying?.();
        try {
          const result = await verifySetupPayment({
            orderId: resp.razorpay_order_id,
            paymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          if (!result.success || !result.propertyId) throw new Error(result.message ?? 'Couldn’t confirm the payment.');
          resolve(result.propertyId);
        } catch (err) {
          reject(err);
        }
      },
      modal: {
        ondismiss: () => reject(new Error('Payment cancelled. You haven’t been charged.')),
      },
    });
    checkout.on('payment.failed', resp => {
      // Razorpay keeps its modal open so the payer can retry with another
      // method; this only reports why the last attempt failed.
      console.warn('Razorpay payment failed:', resp.error?.description);
    });
    checkout.open();
    callbacks?.onCheckoutOpen?.();
  });
}

/**
 * Finishes checkouts that were paid but never confirmed (tab closed right
 * after paying, network dropped before the callback). Asks Razorpay about
 * each recent unconfirmed order; returns the ids of properties created.
 */
export async function finishPendingSetupPayments(): Promise<string[]> {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('property_setup_payments')
    .select('razorpay_order_id')
    .eq('status', 'created')
    .not('razorpay_order_id', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error || !data?.length) return [];

  const created: string[] = [];
  for (const row of data) {
    try {
      const result = await verifySetupPayment({ orderId: row.razorpay_order_id as string });
      if (result.success && result.status === 'paid' && result.propertyId) created.push(result.propertyId);
    } catch (err) {
      console.warn('Pending setup payment check failed:', err);
    }
  }
  return created;
}
