// Edge Function: redeem-access-link
//
// Called anonymously (this IS the auth mechanism, so there's nothing to be
// signed in with yet). Given a property_access_links token, mints a fresh
// one-time Supabase magic link for that link's dedicated account and hands
// back just enough (a token_hash) for the browser to complete the sign-in
// itself via supabase.auth.verifyOtp — see src/pages/AccessLinkPage.tsx.
//
// A brand-new magic link is minted on every open rather than reusing one,
// so the bookmarked /access/:token URL never expires even though each
// individual sign-in token is single-use and short-lived underneath.
//
// Deploy: supabase functions deploy redeem-access-link
// (no --no-verify-jwt needed: supabase-js's functions.invoke always sends
// the anon key as the bearer token when nobody's signed in yet, and that
// alone satisfies the platform's default JWT check — this function just
// never looks at *who* the caller is, only the token in the body.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON body' }, 400);
  }

  const token = body.token?.trim();
  if (!token) return json({ success: false, message: 'token is required' }, 400);

  // Defense in depth against someone hammering this endpoint trying random
  // UUIDs — the token space is unguessable either way, same reasoning as
  // guest_resolve_room_token (0020_rate_limit_and_guest_verification.sql).
  const { data: allowed, error: rateErr } = await adminClient.rpc('check_rate_limit', {
    p_bucket_key: `redeem_access_link:${token}`,
    p_max_calls: 20,
    p_window_seconds: 60,
  });
  if (rateErr) return json({ success: false, message: rateErr.message }, 500);
  if (!allowed) return json({ success: false, message: 'Too many attempts — wait a minute and try again' }, 429);

  const { data: link, error: linkErr } = await adminClient
    .from('property_access_links')
    .select('staff_user_id')
    .eq('id', token)
    .maybeSingle();
  if (linkErr) return json({ success: false, message: linkErr.message }, 500);
  if (!link) return json({ success: false, message: 'This link is invalid or has been revoked.' }, 404);

  const { data: userRes, error: userErr } = await adminClient.auth.admin.getUserById(link.staff_user_id);
  if (userErr || !userRes?.user?.email) return json({ success: false, message: 'Access account not found' }, 500);

  const { data: generated, error: genErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: userRes.user.email,
  });
  if (genErr || !generated?.properties?.hashed_token) {
    return json({ success: false, message: genErr?.message ?? 'Failed to generate sign-in link' }, 500);
  }

  return json({ success: true, tokenHash: generated.properties.hashed_token });
});
