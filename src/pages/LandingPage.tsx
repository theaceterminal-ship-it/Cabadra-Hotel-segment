import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoginPage from './LoginPage';

/**
 * `/` — one sign-in form, not a chooser between "Owner" and "Reception."
 * Nobody should have to know which of those they are before they've even
 * signed in: the database already knows (staff_properties), so this page
 * just asks it and routes accordingly. An owner and a receptionist land on
 * different apps, but neither has to pick — see OwnerApp/ReceptionApp for
 * what each actually renders.
 *
 * A brand-new sign-up has zero assignments either way — that's not an
 * error state, it's "hasn't created their first hotel yet," which is
 * exactly what OwnerApp's own empty state now handles (self-serve,
 * staff_create_property grants owner on whatever gets created). Reception
 * access is the one path that's deliberately not self-serve — see
 * ReceptionApp's empty state for that message instead.
 *
 * Deliberately no link to the guest page here either: a guest never types
 * a URL, they scan the QR their hotel gives them, which lands directly on
 * /guest/:token.
 */
export default function LandingPage() {
  const { loading, session, assignments } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#f6faff] text-sm text-[#4e463a]">Loading…</div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  const isOwner = assignments.some(a => a.role === 'owner');
  const isReceptionist = assignments.some(a => a.role === 'receptionist');

  if (isOwner) return <Navigate to="/owner" replace />;
  if (isReceptionist) return <Navigate to="/reception" replace />;

  // Signed in, no role anywhere yet — a brand-new owner. /owner's own
  // empty state is "let's set up your first hotel," not a dead end.
  return <Navigate to="/owner" replace />;
}
