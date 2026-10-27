import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { StaffAssignment } from '../hooks/useAuth';

/**
 * What reception shows when the signed-in account has no receptionist role.
 * It says which situation it is, because three different things used to show
 * the same "not linked to a hotel" text:
 *  - the account's hotels couldn't be loaded (a network blip or expired session): offer a retry;
 *  - it's an owner (right password, wrong door): point to the Owner dashboard;
 *  - it really has no hotel: say who is signed in, so a wrong-email sign-in is obvious.
 */
export function NoHotelNotice({ email, assignments, error, onRetry, onSignOut }: {
  email?: string;
  assignments: StaffAssignment[];
  error: boolean;
  onRetry: () => Promise<void> | void;
  onSignOut: () => void;
}) {
  const [retrying, setRetrying] = React.useState(false);
  const isOwner = assignments.some(a => a.role === 'owner');

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="max-w-md text-center space-y-3">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-on-surface">We couldn’t check your access</h1>
            <p className="text-sm text-on-surface-variant">
              Your sign-in worked, but we couldn’t load which hotel you work at. That’s usually a weak connection or a session that ran out. Try again, and if it keeps happening, sign out and back in.
            </p>
            <button
              onClick={async () => { setRetrying(true); try { await onRetry(); } finally { setRetrying(false); } }}
              disabled={retrying}
              className="h-10 px-5 rounded-full bg-primary text-on-primary text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60"
            >
              {retrying && <Loader2 className="size-4 animate-spin" />} Try again
            </button>
          </>
        ) : isOwner ? (
          <>
            <h1 className="text-lg font-semibold text-on-surface">This is the owner’s login</h1>
            <p className="text-sm text-on-surface-variant">
              {email ? <>You’re signed in as <span className="font-medium text-on-surface">{email}</span>, an owner. </> : null}
              Reception is for front-desk logins. Owners run their hotel from the Owner dashboard, and share the reception link from its Staff tab with the front desk.
            </p>
            <Link to="/owner" className="h-10 px-5 rounded-full bg-primary text-on-primary text-sm font-medium inline-flex items-center">Go to the Owner dashboard</Link>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-on-surface">No hotel linked to this login</h1>
            <p className="text-sm text-on-surface-variant">
              {email ? <>You’re signed in as <span className="font-medium text-on-surface">{email}</span>, and that account isn’t linked to a hotel. </> : 'This account isn’t linked to a hotel. '}
              If that’s the wrong email, sign out and use the one your owner invited. Otherwise ask your hotel’s owner to invite it, or to give you the reception link, from their property’s Staff tab.
            </p>
          </>
        )}
        <div><button onClick={onSignOut} className="text-xs font-semibold text-primary hover:underline">Sign out</button></div>
      </div>
    </div>
  );
}
