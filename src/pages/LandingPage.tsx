import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type StaffAssignment } from '../hooks/useAuth';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import MarketingPage from './MarketingPage';
import { isPartnerAccount } from '../lib/partnersApi';

/**
 * `/` — the public website for a signed-out visitor (MarketingPage), and a
 * straight redirect into the right app for anyone already signed in, so
 * staff who bookmarked `/` still land where they work.
 *
 * Signing in itself lives at /login and /signup (AuthPage). Nobody picks
 * "Owner" or "Reception" there either: the database already knows
 * (staff_properties), and SignedInRedirect routes accordingly.
 *
 * Deliberately no link to the guest page here: a guest never types a URL,
 * they scan the QR their hotel gives them, which lands directly on
 * /guest/:token.
 */
export default function LandingPage() {
  const { loading, session, assignments } = useAuth();

  // The website must render even when Supabase isn't reachable or
  // configured — nobody can be signed in then anyway.
  if (!isSupabaseConfigured) return <MarketingPage />;

  // Session restore reads local storage, so this is a blink. Showing the
  // fog background instead of the website avoids a flash of marketing copy
  // for staff who are about to be redirected.
  if (loading) return <div className="min-h-screen bg-[#eef0ec]" />;

  if (session) return <SignedInRedirect assignments={assignments} />;

  return <MarketingPage />;
}

/**
 * An owner and a receptionist land on different apps, but neither has to
 * pick. A brand-new sign-up has zero assignments — that's not an error,
 * it's "hasn't created their first hotel yet," which OwnerApp's empty state
 * handles (staff_create_property grants owner on whatever gets created).
 * Reception access is deliberately not self-serve — see ReceptionApp's
 * empty state for that message instead.
 */
export function SignedInRedirect({ assignments }: { assignments: StaffAssignment[] }) {
  const isOwner = assignments.some(a => a.role === 'owner');
  const isReceptionist = assignments.some(a => a.role === 'receptionist');
  // No hotel access: a local business (partners, 0085) goes to its partner
  // page rather than into new-owner onboarding.
  const [partner, setPartner] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isOwner && !isReceptionist) isPartnerAccount().then(setPartner);
  }, [isOwner, isReceptionist]);

  if (isOwner) return <Navigate to="/owner" replace />;
  if (isReceptionist) return <Navigate to="/reception" replace />;
  if (partner === null) return <div className="min-h-screen bg-[#eef0ec]" />;
  return <Navigate to={partner ? '/partner' : '/owner'} replace />;
}
