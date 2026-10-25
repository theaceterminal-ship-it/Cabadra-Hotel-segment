// Which business a partner page request is about, for partner-create-order
// and partner-verify-payment. Decided by the database as the caller
// (partner_resolve, 0085): the signed-in account's own business (partnerId,
// with the account's Authorization header), or the one a partner page link
// opens while that business has no account yet (token).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { json } from './razorpay.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The partner id, or the error response to send. */
export async function resolvePartner(req: Request, body: { token?: string; partnerId?: string }): Promise<string | Response> {
  const byAccount = !!body.partnerId && UUID.test(body.partnerId);
  if (!byAccount && !(body.token && UUID.test(body.token))) return json({ success: false, message: 'This partner link isn’t valid' }, 400);
  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data, error } = await caller.rpc('partner_resolve', {
    p_token: byAccount ? null : body.token,
    p_partner_id: byAccount ? body.partnerId : null,
  });
  if (error || typeof data !== 'string') return json({ success: false, message: error?.message ?? 'This partner link isn’t valid' }, 403);
  return data;
}
