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
  /** Re-fetches staff_properties without a full page reload — needed right after an action that grants new access, e.g. creating a property (staff_create_property adds the caller's own owner row). */
  refreshAssignments: () => void;
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
  const sessionRef = useRef<Session | null>(null);

  const loadAssignments = useCallback(async (currentSession: Session | null) => {
    if (!currentSession) {
      setAssignments([]);
      return;
    }
    const { data, error } = await supabase.from('staff_properties').select('property_id, role');
    if (error) {
      console.warn('Failed to load staff_properties for signed-in user:', error);
      setAssignments([]);
      return;
    }
    setAssignments((data ?? []).map(r => ({ propertyId: r.property_id, role: r.role as StaffAssignment['role'] })));
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
    loadAssignments(sessionRef.current);
  }, [loadAssignments]);

  return { loading, session, assignments, refreshAssignments };
}

export function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signOut() {
  return supabase.auth.signOut();
}
