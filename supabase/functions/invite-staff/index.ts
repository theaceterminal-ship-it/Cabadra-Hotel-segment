// Edge Function: invite-staff
//
// The one step this app's client code genuinely cannot do: create a brand
// new Supabase Auth user and email them an invite. That's an Admin API
// operation (auth.admin.inviteUserByEmail) gated behind the service_role
// key, which must never reach the browser — see src/lib/supabaseClient.ts.
// So this function holds that key instead, runs the two authorization
// checks itself, then either grants an existing account access directly or
// creates + invites a new one. See supabase/migrations/0008_staff_onboarding.sql
// for the pending_staff_invites table and trigger this leans on.
//
// Deploy: supabase functions deploy invite-staff
// (SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// injected automatically for every Edge Function on a linked project — no
// `supabase secrets set` needed for those three.)

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
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let body: { propertyId?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON body' }, 400);
  }

  const propertyId = body.propertyId?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = body.role;
  if (!propertyId || !email || (role !== 'owner' && role !== 'receptionist')) {
    return json({ success: false, message: 'propertyId, email, and role (owner|receptionist) are required' }, 400);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ success: false, message: 'Missing Authorization header' }, 401);

  // Scoped to the caller's own JWT — RLS decides what they can see, exactly
  // like a normal client request. This is how we check "is this caller
  // actually an owner of this property" without duplicating that logic here.
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
    return json({ success: false, message: 'Only an owner of this property can invite staff' }, 403);
  }

  // From here on we need the Admin API, so switch to a service-role client.
  // Never sent to or accepted from the browser — this is the only place in
  // the whole app this key exists.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Does an account already exist for this email? admin.listUsers() has no
  // server-side email filter, so we page through — fine at staff-invite
  // volume (this is not a bulk-import path).
  let existingUserId: string | null = null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return json({ success: false, message: `Failed to check existing accounts: ${error.message}` }, 500);
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) { existingUserId = match.id; break; }
    if (data.users.length < 200) break; // last page
  }

  if (existingUserId) {
    // Same "grant access" as staff_invite_by_email — via admin client so it
    // isn't blocked by the fact the caller (not existingUserId) is the one
    // authenticated here.
    const { error: grantErr } = await adminClient
      .from('staff_properties')
      .upsert({ user_id: existingUserId, property_id: propertyId, role }, { onConflict: 'user_id,property_id' });
    if (grantErr) return json({ success: false, message: grantErr.message }, 500);
    return json({ success: true, message: 'Access granted to their existing account.', pending: false });
  }

  // Brand new email: queue the pending invite FIRST, so the moment
  // inviteUserByEmail's insert into auth.users fires
  // trg_handle_new_user_staff_invites, staff_properties is already waiting
  // for them — access is live before they've even opened the email.
  const { error: queueErr } = await callerClient.rpc('staff_queue_pending_invite', {
    p_property_id: propertyId,
    p_email: email,
    p_role: role,
  });
  if (queueErr) return json({ success: false, message: queueErr.message }, 500);

  const redirectTo = req.headers.get('Origin') ? `${req.headers.get('Origin')}/login` : undefined;
  const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
  if (inviteErr) {
    // Roll back the queued invite so a failed email doesn't leave a dangling
    // grant waiting for an account that will never show up this way.
    await callerClient.rpc('staff_cancel_pending_invite', { p_property_id: propertyId, p_email: email });
    return json({ success: false, message: `Failed to send invite email: ${inviteErr.message}` }, 500);
  }

  return json({ success: true, message: `Invite email sent to ${email}. They'll have access as soon as they set a password.`, pending: true });
});
