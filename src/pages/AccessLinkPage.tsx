import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { redeemAccessLink } from '../lib/staffApi';
import { supabase } from '../lib/supabaseClient';

/**
 * What a property's no-login reception link (/access/:token) actually
 * opens. No form, nothing to click — it redeems the token for a one-time
 * sign-in token_hash (redeem-access-link) and completes the sign-in itself
 * via verifyOtp, then lands straight on /reception with a real session.
 * The dedicated account this signs into is shared by design — see
 * 0027_no_login_access_links.sql for the trade-off this makes on purpose.
 */
export default function AccessLinkPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const tokenHash = await redeemAccessLink(token);
        const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
        if (verifyErr) throw verifyErr;
        if (!cancelled) setStatus('done');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'This link is invalid or has been revoked.');
          setStatus('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (status === 'done') return <Navigate to="/reception" replace />;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f6faff] p-6">
      <div className="max-w-sm text-center space-y-3">
        {status === 'working' ? (
          <p className="text-sm text-[#4e463a]">Opening reception…</p>
        ) : (
          <>
            <h1 className="text-lg font-bold text-[#141d23]">Can't open this link</h1>
            <p className="text-sm text-[#4e463a]">{error}</p>
            <p className="text-xs text-[#7f7668]">Ask this hotel's owner for a fresh link from their Staff tab.</p>
          </>
        )}
      </div>
    </div>
  );
}
