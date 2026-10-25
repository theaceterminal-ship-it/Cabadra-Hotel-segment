import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Loader2, Plus, Store } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from './site/usePageTitle';
import { PartnerAuthCard } from '../components/partners/PartnerAuthCard';
import { PartnerPortal, PartnerShell } from '../components/partners/PartnerPortal';
import { EMPTY_LISTING, ListingForm, PField, partnerInput } from '../components/partners/ListingForm';
import {
  ListingFields, MyBusiness, PartnerPortal as PortalData, applyAsPartner, claimMyBusinesses, fetchPartnerPortal, finishPendingPartnerPayment,
} from '../lib/partnersApi';

const LAST_KEY = 'cabadra:partner-last';

/**
 * /partner: a local business's home on Cabadra. Signed out, it's sign in /
 * sign up (PartnerAuthCard). Signed in, the account's businesses are
 * linked by email (partner_claim) and then: none yet means the
 * application form; one opens straight onto its partner page; several
 * get a picker. "Add another business" applies for one more.
 */
export default function PartnerHomePage() {
  const { loading, session } = useAuth();
  const [params] = useSearchParams();
  const [businesses, setBusinesses] = useState<MyBusiness[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  usePageTitle('Partner page');

  const load = useCallback(async () => {
    try {
      const list = await claimMyBusinesses();
      setBusinesses(list);
      let last: string | null = null;
      try { last = localStorage.getItem(LAST_KEY); } catch { /* storage blocked */ }
      setCurrent(c => c ?? (list.length === 1 ? list[0].id : list.find(b => b.id === last)?.id ?? null));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load your businesses.');
    }
  }, []);

  useEffect(() => {
    if (session) load();
    else { setBusinesses(null); setCurrent(null); }
  }, [session?.user.id, load]);

  const open = (id: string) => {
    setCurrent(id);
    setAdding(false);
    try { localStorage.setItem(LAST_KEY, id); } catch { /* ignore */ }
  };

  if (loading || (session && !businesses && !error)) {
    return <PartnerShell><div className="py-24 flex justify-center"><Loader2 className="size-6 animate-spin text-[#111]/40" /></div></PartnerShell>;
  }
  if (!session) {
    return <PartnerShell><PartnerAuthCard initialMode={params.has('new') ? 'sign_up' : 'sign_in'} /></PartnerShell>;
  }

  const email = session.user.email;
  if (error) return <PartnerShell email={email}><p className="rounded-2xl bg-[#ffe9e5] px-4 py-3 text-sm text-[#8a1c0a]">{error}</p></PartnerShell>;

  if (adding || businesses!.length === 0) {
    return (
      <PartnerShell email={email} onSwitch={businesses!.length ? () => setAdding(false) : undefined}>
        <ApplyForm email={email ?? ''} first={businesses!.length === 0} onApplied={async id => { await load(); open(id); }} />
      </PartnerShell>
    );
  }

  if (!current) {
    return (
      <PartnerShell email={email}>
        <p className="text-sm font-medium text-[#111]/50">Your businesses</p>
        <h1 className="mt-1 text-[34px] sm:text-5xl leading-[1.03] font-semibold tracking-[-0.035em]">Which one?</h1>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {businesses!.map((b, i) => (
            <motion.button key={b.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => open(b.id)} className="text-left rounded-[28px] bg-white p-5 flex items-center gap-4 hover:shadow-[0_18px_50px_rgba(0,0,0,0.08)] transition-shadow">
              {b.photo ? <img src={b.photo} alt="" className="size-14 rounded-2xl object-cover" /> : <span className="size-14 rounded-2xl bg-[#eef0ec] flex items-center justify-center"><Store className="size-5" /></span>}
              <span className="min-w-0 flex-1"><span className="block font-semibold truncate">{b.name}</span><span className="block text-sm text-[#111]/55">{b.status === 'pending' ? 'In review' : b.status === 'rejected' ? 'Not approved' : 'Approved'}</span></span>
              <ArrowRight className="size-4 text-[#111]/40" />
            </motion.button>
          ))}
          <button onClick={() => setAdding(true)} className="rounded-[28px] border-2 border-dashed border-black/10 p-5 flex items-center gap-3 text-[15px] font-medium hover:bg-white/50"><Plus className="size-5" /> Add another business</button>
        </div>
      </PartnerShell>
    );
  }

  return <SignedInPortal key={current} partnerId={current} email={email} onSwitch={() => setCurrent(null)} />;
}

function SignedInPortal({ partnerId, email, onSwitch }: { partnerId: string; email?: string; onSwitch: () => void }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = { partnerId };
  const load = useCallback(() => fetchPartnerPortal({ partnerId }).then(d => { setData(d); setError(null); }).catch(err => setError(err.message)), [partnerId]);
  useEffect(() => {
    load();
    finishPendingPartnerPayment({ partnerId }).then(applied => { if (applied) load(); });
  }, [load, partnerId]);
  usePageTitle(data?.partner.name ?? 'Partner page');
  return (
    <PartnerShell email={email} businessName={data?.partner.name} onSwitch={onSwitch}>
      {error ? <p className="rounded-2xl bg-[#ffe9e5] px-4 py-3 text-sm text-[#8a1c0a]">{error}</p>
        : !data ? <div className="py-24 flex justify-center"><Loader2 className="size-6 animate-spin text-[#111]/40" /></div>
          : <PartnerPortal data={data} partnerRef={ref} reload={load} />}
    </PartnerShell>
  );
}

function ApplyForm({ email, first, onApplied }: { email: string; first: boolean; onApplied: (id: string) => void }) {
  const [form, setForm] = useState<ListingFields>(EMPTY_LISTING);
  const [contactEmail, setContactEmail] = useState(email);
  const [ownerName, setOwnerName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.category) { setError('Pick what kind of business it is.'); return; }
    if (form.areas.length === 0) { setError('Pick at least one place you serve.'); return; }
    setBusy(true);
    try {
      setDoneId(await applyAsPartner({ ...form, email: contactEmail, ownerName }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send your application.');
    } finally {
      setBusy(false);
    }
  };

  if (doneId) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="rounded-[28px] bg-white p-8 sm:p-12 text-center max-w-2xl mx-auto">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 18 }} className="mx-auto size-16 rounded-full bg-[#d4ff5a] flex items-center justify-center"><CheckCircle2 className="size-8" /></motion.span>
        <h2 className="mt-6 text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">Thanks, we’ve got it</h2>
        <p className="mt-3 mx-auto max-w-md text-[15px] text-[#111]/60">We check every business by hand, usually within two working days, and email you when it’s done. Once approved, you pay here and go live.</p>
        <button onClick={() => onApplied(doneId)} className="mt-8 h-12 px-7 inline-flex items-center gap-2 rounded-full bg-[#111] text-white text-[15px] font-medium">Open your partner page <ArrowRight className="size-4" /></button>
      </motion.div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-[#111]/50">{first ? 'Welcome to Cabadra Partners' : 'Add another business'}</p>
      <h1 className="mt-1 text-[34px] sm:text-5xl leading-[1.03] font-semibold tracking-[-0.035em]">Tell us about your business</h1>
      <p className="mt-3 max-w-xl text-[15px] text-[#111]/60">
        {first ? 'Already listed with us under a different email? Sign out and sign in with that one, and we’ll find it.' : 'Each business gets its own listing, payments and invoices.'}
      </p>
      <div className="mt-8">
        <ListingForm value={form} onChange={setForm} onSubmit={submit}>
          <div className="rounded-[28px] bg-white p-6 sm:p-8 grid gap-5 sm:grid-cols-2">
            <p className="sm:col-span-2 text-lg font-semibold tracking-[-0.01em]">You</p>
            <PField label="Your name"><input required maxLength={80} value={ownerName} onChange={e => setOwnerName(e.target.value)} className={partnerInput} placeholder="Ravi Thakur" autoComplete="name" /></PField>
            <PField label="Email for requests and reports"><input required type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={partnerInput} /></PField>
          </div>
          {error && <p className="rounded-2xl bg-[#ffe9e5] px-4 py-3 text-sm text-[#8a1c0a]">{error}</p>}
          <div className="rounded-[28px] bg-[#111] text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-white/60 max-w-xs">Nothing to pay now. You pay after we approve your listing.</p>
            <button disabled={busy} className="h-12 px-7 inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#111] text-[15px] font-medium disabled:opacity-60">
              {busy ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <>Send application <ArrowRight className="size-4" /></>}
            </button>
          </div>
        </ListingForm>
      </div>
    </div>
  );
}
