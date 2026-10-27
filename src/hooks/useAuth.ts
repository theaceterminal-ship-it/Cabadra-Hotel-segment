import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export interface StaffAssignment {
  propertyId: string;
  role: 'owner' | 'receptionist';
}

export interface AuthState {
  loading: boolean;
  session: Session | null;
  /** Every property this signed-in user is staff on, and in what role. Empty until staff_properties has been seeded for them (see supabase/seed.sql). */
  assignments: StaffAssignment[];
  /** False from a sign-in until that account's hotels have been looked up (or the lookup failed). Until then "this account has no hotel" isn't known yet. */
  assignmentsReady: boolean;
  /** The lookup of this account's hotels failed (network, expired session), as opposed to the account having none. */
  assignmentsError: boolean;
  /** Re-fetches staff_properties without a full page reload — needed right after an action that grants new access, e.g. creating a property (staff_create_property adds the caller's own owner row). Returns a promise so a caller that's about to navigate can await it first and avoid a one-frame flash of the "no properties yet" state. */
  refreshAssignments: () => Promise<void>;
}

/**
 * Drives both staff pages' login gate. A signed-in user with zero
 * `assignments` is authenticated but not yet provisioned as staff on any
 * property — see the note at the bottom of supabase/seed.sql for how to fix
 * that from the SQL editor.
 */
export function useAuth(): AuthState {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [assignmentsReady, setAssignmentsReady] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState(false);
  const sessionRef = useRef<Session | null>(null);

  const loadAssignments = useCallback(async (currentSession: Session | null) => {
    if (!currentSession) {
      setAssignments([]);
      setAssignmentsError(false);
      setAssignmentsReady(true);
      return;
    }
    const { data, error } = await supabase.from('staff_properties').select('property_id, role');
    if (error) {
      console.warn('Failed to load staff_properties for signed-in user:', error);
      setAssignments([]);
      setAssignmentsError(true);
      setAssignmentsReady(true);
      return;
    }
    setAssignments((data ?? []).map(r => ({ propertyId: r.property_id, role: r.role as StaffAssignment['role'] })));
    setAssignmentsError(false);
    setAssignmentsReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      sessionRef.current = data.session;
      setSession(data.session);
      loadAssignments(data.session).finally(() => !cancelled && setLoading(false));
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // A different account just signed in (not a token refresh): its hotels aren't known yet.
      if (newSession?.user.id !== sessionRef.current?.user.id) setAssignmentsReady(false);
      sessionRef.current = newSession;
      setSession(newSession);
      loadAssignments(newSession);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadAssignments]);

  const refreshAssignments = useCallback(() => {
    return loadAssignments(sessionRef.current);
  }, [loadAssignments]);

  return { loading, session, assignments, assignmentsReady, assignmentsError, refreshAssignments };
}

export function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signOut() {
  return supabase.auth.signOut();
}
