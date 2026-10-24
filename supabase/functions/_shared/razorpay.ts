// Shared by create-setup-order and verify-setup-payment.
//
// Razorpay keys come from Edge Function secrets, never from the browser:
//   supabase secrets set RAZORPAY_KEY_ID=rzp_test_... RAZORPAY_KEY_SECRET=...
// Test-mode keys (rzp_test_...) never move real money. Switching to live
// is just replacing both secrets with the rzp_live_ pair.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** ₹4,999 per property by default; SETUP_FEE_PAISE overrides it without a redeploy of the site. */
export function setupFeePaise(): number {
  const fromEnv = Number(Deno.env.get('SETUP_FEE_PAISE'));
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : 499900;
}

export function razorpayKeys(): { keyId: string; keySecret: string } | null {
  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

/** Calls the Razorpay REST API; throws with Razorpay's own error description on failure. */
export async function razorpay<T>(
  keys: { keyId: string; keySecret: string },
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${keys.keyId}:${keys.keySecret}`)}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const description = (data as { error?: { description?: string } })?.error?.description;
    throw new Error(description ?? `Razorpay request failed (${res.status})`);
  }
  return data as T;
}

/** Razorpay Checkout's signature: HMAC-SHA256 of "order_id|payment_id" with the key secret, hex-encoded. */
export async function isValidCheckoutSignature(
  keySecret: string,
  orderId: string,
  paymentId: string,
  signature: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keySecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${orderId}|${paymentId}`));
  const expected = Array.from(new Uint8Array(mac), b => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
