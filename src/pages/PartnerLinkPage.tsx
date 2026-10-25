import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from './site/usePageTitle';
import { CONTACT_EMAIL } from '../components/site/SiteChrome';
import { PartnerPortal, PartnerShell } from '../components/partners/PartnerPortal';
import { PartnerPortal as PortalData, SignInRequiredError, fetchPartnerPortal, finishPendingPartnerPayment } from '../lib/partnersApi';

/**
 * /partner/:token, the link in older emails. While the business has no
 * account it opens the partner page (pay, requests; editing needs an
 * account). Once someone has signed in with the business's email the link
 * stops working by itself and sends them to sign in, so a forwarded email
 * can't expose guests' phone numbers.
 */
export default function PartnerLinkPage() {
  const { token = '' } = useParams();
  const { session } = useAuth();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  usePageTitle(data?.partner.name ?? 'Partner page');

  const load = useCallback(() => fetchPartnerPortal({ token })
    .then(d => { setData(d); setError(null); })
    .catch(err => (err instanceof SignInRequiredError ? setNeedsSignIn(true) : setError(err.message))), [token]);

  useEffect(() => {
    load();
    finishPendingPartnerPayment({ token }).then(applied => { if (applied) load(); });
  }, [load, token]);

  if (needsSignIn && session) return <Navigate to="/partner" replace />;

  return (
    <PartnerShell businessName={data?.partner.name}>
      {needsSignIn ? (
        <div className="rounded-[28px] bg-white p-8 sm:p-12 text-center max-w-xl mx-auto">
          <span className="mx-auto size-14 rounded-full bg-[#eef0ec] flex items-center justify-center"><Lock className="size-6" /></span>
          <p className="mt-5 text-2xl font-semibold tracking-[-0.02em]">Sign in to open your partner page</p>
          <p className="mt-2 text-[15px] text-[#111]/60">This business has an account now, so its old link doesn’t open anything by itself. Sign in with the account you created.</p>
          <Link to="/partner" className="mt-6 h-12 px-6 inline-flex items-center gap-2 rounded-full bg-[#111] text-white text-[15px] font-medium">Sign in <ArrowRight className="size-4" /></Link>
        </div>
      ) : error ? (
        <div className="rounded-[28px] bg-white p-8 sm:p-12 text-center">
          <p className="text-2xl font-semibold tracking-[-0.02em]">This link doesn’t open a partner page</p>
          <p className="mt-2 text-[15px] text-[#111]/60">Sign in instead, or write to {CONTACT_EMAIL}.</p>
          <Link to="/partner" className="mt-6 h-11 px-6 inline-flex items-center rounded-full bg-[#111] text-white text-sm font-medium">Sign in</Link>
        </div>
      ) : !data ? (
        <div className="py-24 flex justify-center"><Loader2 className="size-6 animate-spin text-[#111]/40" /></div>
      ) : (
        <>
          {!data.partner.hasAccount && (
            <div className="mb-5 rounded-[24px] bg-white/70 border border-black/5 px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>Make this page yours: sign in with Google{data.partner.email ? ` using ${data.partner.email}` : ''} to edit your listing and keep it private.</span>
              <Link to="/partner" className="h-9 px-4 inline-flex items-center gap-1.5 rounded-full bg-[#111] text-white font-medium">Sign in <ArrowRight className="size-3.5" /></Link>
            </div>
          )}
          <PartnerPortal data={data} partnerRef={{ token }} reload={load} />
        </>
      )}
    </PartnerShell>
  );
}
