// Edge Function: provision-access-link
//
// Creates (or returns the existing) no-login reception link for a property.
// Two Admin API steps only the service_role key can do: finding/creating
// the dedicated shared "reception" account this link points at, and
// (via redeem-access-link, separately) minting the actual sign-in each
// time the link is opened. See supabase/migrations/0027_no_login_access_links.sql.
//
// Deploy: supabase functions deploy provision-access-link
// (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically for every Edge Function on a linked project.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const DEDICATED_EMAIL = (propertyId: string, role: string) => `access-${role}-${propertyId}@access.cabadra.internal`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let body: { propertyId?: string; role?: string; regenerate?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON body' }, 400);
  }

  const propertyId = body.propertyId?.trim();
  const role = body.role;
  const regenerate = body.regenerate === true;
  if (!propertyId || role !== 'receptionist') {
    return json({ success: false, message: 'propertyId and role ("receptionist") are required' }, 400);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ success: false, message: 'Missing Authorization header' }, 401);

  // Scoped to the caller's own JWT — only an owner of this property may
  // provision or regenerate its access link.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return json({ success: false, message: 'Not signed in' }, 401);

  const { data: ownerRows, error: ownerErr } = await callerClient
    .from('staff_properties')
    .select('role')
    .eq('property_id', propertyId)
    .eq('role', 'owner')
    .limit(1);
  if (ownerErr) return json({ success: false, message: ownerErr.message }, 500);
  if (!ownerRows || ownerRows.length === 0) {
    return json({ success: false, message: 'Only an owner of this property can manage its access link' }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  if (regenerate) {
    // Rotate the token only — the underlying shared account is reused, so
    // regenerating doesn't disturb anything RLS attributes to it, it just
    // makes the old bookmarked URL stop working immediately.
    const { error: delErr } = await adminClient
      .from('property_access_links')
      .delete()
      .eq('property_id', propertyId)
      .eq('role', role);
    if (delErr) return json({ success: false, message: delErr.message }, 500);
  } else {
    const { data: existing, error: existingErr } = await adminClient
      .from('property_access_links')
      .select('id')
      .eq('property_id', propertyId)
      .eq('role', role)
      .maybeSingle();
    if (existingErr) return json({ success: false, message: existingErr.message }, 500);
    if (existing) return json({ success: true, token: existing.id });
  }

  const dedicatedEmail = DEDICATED_EMAIL(propertyId, role);

  // Does the dedicated account already exist (e.g. from before a token was
  // regenerated)? Reuse it rather than piling up orphaned auth users.
  let dedicatedUserId: string | null = null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return json({ success: false, message: `Failed to check existing accounts: ${error.message}` }, 500);
    const match = data.users.find((u) => u.email?.toLowerCase() === dedicatedEmail);
    if (match) { dedicatedUserId = match.id; break; }
    if (data.users.length < 200) break;
  }

  if (!dedicatedUserId) {
    // A random password nobody ever needs — this account only ever signs
    // in via a magic link minted by redeem-access-link, never a password.
    const randomPassword = crypto.randomUUID() + crypto.randomUUID();
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: dedicatedEmail,
      password: randomPassword,
      email_confirm: true,
    });
    if (createErr || !created?.user) return json({ success: false, message: createErr?.message ?? 'Failed to create access account' }, 500);
    dedicatedUserId = created.user.id;

    const { error: grantErr } = await adminClient
      .from('staff_properties')
      .upsert({ user_id: dedicatedUserId, property_id: propertyId, role }, { onConflict: 'user_id,property_id' });
    if (grantErr) return json({ success: false, message: grantErr.message }, 500);
  }

  const { data: link, error: linkErr } = await adminClient
    .from('property_access_links')
    .insert({ property_id: propertyId, role, staff_user_id: dedicatedUserId })
    .select('id')
    .single();
  if (linkErr) return json({ success: false, message: linkErr.message }, 500);

  return json({ success: true, token: link.id });
});
