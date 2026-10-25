import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  ArrowRight, BarChart3, Check, CheckCircle2, Clock, Eye, Hotel, Inbox, Loader2, MapPin, MessageCircle, MousePointerClick, Phone,
  Receipt, Sparkles, Tag, Users, X,
} from 'lucide-react';
import { CONTACT_EMAIL } from '../components/site/SiteChrome';
import { usePageTitle } from './site/usePageTitle';
import {
  PARTNER_CATEGORIES, PartnerPortal, PortalRequest, fetchPartnerPortal, finishPendingPartnerPayment, inr, payFromPartnerPage, updatePartnerRequest,
} from '../lib/partnersApi';

const EASE = [0.22, 1, 0.36, 1] as const;
const MONTHS = [1, 3, 6, 12] as const;

const fmtDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);
const ago = (ts: string) => {
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
function waHref(phone: string, text: string) {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * A local business's own page on the partners marketplace (0084), opened
 * from the link we email them. No login: the token in the link is the key.
 * Shows where the listing stands (in review, approved and waiting for
 * payment, live, lapsed), lets them pay for it or for a featured spot,
 * their last 30 days, guests' booking requests to accept or decline, and
 * a preview of the listing as guests see it.
 */
export default function PartnerPortalPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<PartnerPortal | null>(null);
  const [error, setError] = useState<string | null>(null);
  usePageTitle(data?.partner.name ?? 'Partner page');

  const load = useCallback(() => fetchPartnerPortal(token).then(d => { setData(d); setError(null); }).catch(err => setError(err.message)), [token]);

  useEffect(() => {
    load();
    finishPendingPartnerPayment(token).then(applied => { if (applied) load(); });
  }, [token, load]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-[#eef0ec] text-[#111] font-sans antialiased">
        <header className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 flex items-center justify-between gap-4">
          <Link to="/partners" className="text-[24px] font-semibold tracking-[-0.03em]">Cabadra <span className="font-normal text-[#111]/45">Partners</span></Link>
          <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Partner listing${data ? `: ${data.partner.name}` : ''}`)}`} className="h-10 px-4 inline-flex items-center rounded-full border border-black/15 bg-white/50 text-sm font-medium hover:bg-white/80 transition-colors">Help</a>
        </header>
        <main className="mx-auto max-w-6xl px-5 sm:px-8 pt-8 pb-20">
          {error ? (
            <div className="rounded-[28px] bg-white p-8 sm:p-12 text-center">
              <p className="text-2xl font-semibold tracking-[-0.02em]">This link doesn’t open a partner page</p>
              <p className="mt-2 text-[15px] text-[#111]/60">Check you used the whole link from our email, or write to {CONTACT_EMAIL}.</p>
              <Link to="/partners" className="mt-6 h-11 px-6 inline-flex items-center rounded-full bg-[#111] text-white text-sm font-medium">Go to Cabadra Partners</Link>
            </div>
          ) : !data ? (
            <div className="py-24 flex justify-center"><Loader2 className="size-6 animate-spin text-[#111]/40" /></div>
          ) : (
            <Portal data={data} token={token} reload={load} />
          )}
        </main>
      </div>
    </MotionConfig>
  );
}

function Portal({ data, token, reload }: { data: PartnerPortal; token: string; reload: () => void }) {
  const p = data.partner;
  const live = p.status === 'approved' && p.active && !!p.paidUntil && p.paidUntil >= data.today;
  const featured = live && !!p.featuredUntil && p.featuredUntil >= data.today;
  const newRequests = data.requests.filter(r => r.status === 'new').length;

  return (
    <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }} className="space-y-3">
      <motion.div variants={fade}>
        <p className="text-sm font-medium text-[#111]/50">{p.ownerName ? `Hi ${p.ownerName.split(/\s+/)[0]}` : 'Your partner page'}</p>
        <h1 className="mt-1 text-[34px] sm:text-5xl leading-[1.03] font-semibold tracking-[-0.035em]">{p.name}</h1>
      </motion.div>

      <motion.div variants={fade}><StatusCard data={data} live={live} featured={featured} /></motion.div>

      {p.status === 'approved' && (
        <motion.div variants={fade}><PayCard data={data} token={token} live={live} featured={featured} onPaid={reload} /></motion.div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          {p.status === 'approved' && (
            <motion.section variants={fade} className="rounded-[28px] bg-white p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-[-0.01em] inline-flex items-center gap-2"><BarChart3 className="size-5" /> Last 30 days</h2>
                <span className="text-xs text-[#111]/45">Full report by email on the 1st</span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <Stat icon={Eye} label="Guests saw you" value={data.stats30.views} />
                <Stat icon={MousePointerClick} label="Opened" value={data.stats30.opens} />
                <Stat icon={Phone} label="Got in touch" value={data.stats30.contacts} />
              </div>
            </motion.section>
          )}
          <motion.section variants={fade} className="rounded-[28px] bg-white p-6 sm:p-8">
            <h2 className="text-lg font-semibold tracking-[-0.01em] inline-flex items-center gap-2">
              <Inbox className="size-5" /> Guest requests
              {newRequests > 0 && <span className="h-6 min-w-6 px-2 rounded-full bg-[#111] text-white text-xs font-semibold inline-flex items-center justify-center">{newRequests} new</span>}
            </h2>
            {data.requests.length === 0 ? (
              <p className="mt-3 text-[15px] text-[#111]/55">When a guest asks you for something from the app, it shows up here and in your email. Reply on WhatsApp or by phone, then mark it here so they see your answer.</p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {data.requests.map(r => <RequestRow key={r.id} r={r} token={token} businessName={p.name} onChange={reload} />)}
              </div>
            )}
          </motion.section>
        </div>

        <div className="space-y-3">
          <motion.section variants={fade} className="rounded-[28px] bg-white p-6 sm:p-7">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">How guests see you</h2>
            <ListingPreview data={data} featured={featured} />
            <p className="mt-4 text-xs text-[#111]/50">To change your details, photo or offer, email {CONTACT_EMAIL}.</p>
          </motion.section>
          <motion.section variants={fade} className="rounded-[28px] bg-white p-6 sm:p-7">
            <h2 className="text-lg font-semibold tracking-[-0.01em] inline-flex items-center gap-2"><Hotel className="size-5" /> Where you show</h2>
            {data.reach.length === 0 ? (
              <p className="mt-2 text-[15px] text-[#111]/55">No Cabadra hotels in {p.areas.map(titleCase).join(', ') || 'your areas'} yet. You show up as soon as one joins.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-[#111]/55">{data.reach.length} hotel{data.reach.length === 1 ? '' : 's'} in {p.areas.map(titleCase).join(', ')}</p>
                <ul className="mt-3 space-y-1.5">
                  {data.reach.slice(0, 12).map(h => (
                    <li key={h.name + h.location} className="text-[15px] flex items-baseline justify-between gap-3"><span className="font-medium truncate">{h.name}</span><span className="text-xs text-[#111]/45 shrink-0">{h.location.split(',')[0]}</span></li>
                  ))}
                  {data.reach.length > 12 && <li className="text-sm text-[#111]/45">and {data.reach.length - 12} more</li>}
                </ul>
              </>
            )}
          </motion.section>
          {data.payments.length > 0 && (
            <motion.section variants={fade} className="rounded-[28px] bg-white p-6 sm:p-7">
              <h2 className="text-lg font-semibold tracking-[-0.01em] inline-flex items-center gap-2"><Receipt className="size-5" /> Payments</h2>
              <ul className="mt-3 divide-y divide-black/5">
                {data.payments.map(pay => (
                  <li key={pay.createdAt} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="block font-medium">{pay.kind === 'featured' ? 'Featured' : 'Listing'} · {pay.months} month{pay.months === 1 ? '' : 's'}</span>
                      <span className="block text-xs text-[#111]/50">{fmtDate(pay.coversFrom)} – {fmtDate(pay.paidUntil)}</span>
                    </span>
                    <span className="font-semibold">{inr(pay.amount)}</span>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
        </div>
      </div>
    </motion.div>
  );
}

const fade = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } } };
const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());

function StatusCard({ data, live, featured }: { data: PartnerPortal; live: boolean; featured: boolean }) {
  const p = data.partner;
  let tone = 'bg-white';
  let title: string;
  let body: string;
  let Icon = Clock;
  if (p.status === 'pending') {
    title = 'We’re checking your listing';
    body = `You applied ${p.appliedAt ? fmtDate(p.appliedAt) : 'recently'}. We usually reply within two working days, by email.`;
  } else if (p.status === 'rejected') {
    title = 'We can’t list this right now';
    body = p.reviewNote ? `Our note: ${p.reviewNote}` : `If something has changed, write to ${CONTACT_EMAIL}.`;
    Icon = X;
  } else if (live) {
    const left = daysBetween(data.today, p.paidUntil!);
    tone = 'bg-[#111] text-white';
    title = featured ? 'You’re live and featured' : 'You’re live';
    body = `Guests nearby can see ${p.name} until ${fmtDate(p.paidUntil!)} (${left === 0 ? 'last day today' : `${left} day${left === 1 ? '' : 's'} left`}).${featured ? ` Featured until ${fmtDate(p.featuredUntil!)}.` : ''}`;
    Icon = CheckCircle2;
  } else if (!p.active) {
    title = 'Your listing is paused';
    body = `It isn’t showing to guests. Write to ${CONTACT_EMAIL} to turn it back on.`;
  } else if (p.paidUntil) {
    tone = 'bg-[#ffe9e5]';
    title = 'Your listing has run out';
    body = `It ended on ${fmtDate(p.paidUntil)}, so guests can’t see you. Renew below and you’re back straight away.`;
  } else {
    tone = 'bg-[#d4ff5a]';
    title = 'You’re approved. Pay to go live';
    body = 'Pick how many months below. Guests near you see your listing as soon as the payment goes through.';
    Icon = CheckCircle2;
  }
  return (
    <div className={`rounded-[28px] p-6 sm:p-8 flex items-start gap-4 ${tone}`}>
      <span className={`size-11 shrink-0 rounded-full flex items-center justify-center ${tone.includes('#111') ? 'bg-white/10' : 'bg-white/70'}`}>
        {live ? (
          <span className="relative flex size-3"><span className="absolute inset-0 rounded-full bg-[#d4ff5a] animate-ping opacity-70" /><span className="relative size-3 rounded-full bg-[#d4ff5a]" /></span>
        ) : <Icon className="size-5" />}
      </span>
      <div>
        <p className="text-xl sm:text-2xl font-semibold tracking-[-0.02em]">{title}</p>
        <p className={`mt-1 text-[15px] ${tone.includes('#111') ? 'text-white/65' : 'text-[#111]/65'}`}>{body}</p>
      </div>
    </div>
  );
}

function PayCard({ data, token, live, featured, onPaid }: { data: PartnerPortal; token: string; live: boolean; featured: boolean; onPaid: () => void }) {
  const [kind, setKind] = useState<'listing' | 'featured'>('listing');
  const [months, setMonths] = useState<number>(live ? 3 : 1);
  const [busy, setBusy] = useState<'paying' | 'verifying' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paidUntil, setPaidUntil] = useState<string | null>(null);
  const fee = kind === 'listing' ? data.pricing.listingFeeMonthly : data.pricing.featuredFeeMonthly;

  const pay = async () => {
    setBusy('paying');
    setError(null);
    try {
      const until = await payFromPartnerPage(token, kind, months, { onVerifying: () => setBusy('verifying') });
      setPaidUntil(until);
      onPaid();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setBusy(null);
    }
  };

  const extendsFrom = kind === 'listing' ? (live ? data.partner.paidUntil : null) : (featured ? data.partner.featuredUntil : null);

  return (
    <section className="rounded-[28px] bg-white p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{live ? 'Renew or add more' : 'Pay for your listing'}</h2>
        {live && (
          <div className="inline-flex rounded-full bg-[#f4f5f2] p-1">
            {(['listing', 'featured'] as const).map(k => (
              <button key={k} onClick={() => setKind(k)} className={`h-9 px-4 rounded-full text-sm font-medium transition-colors inline-flex items-center gap-1.5 ${kind === k ? 'bg-[#111] text-white' : ''}`}>
                {k === 'featured' && <Sparkles className="size-3.5" />}{k === 'listing' ? 'Listing' : 'Featured spot'}
              </button>
            ))}
          </div>
        )}
      </div>
      {kind === 'featured' && <p className="mt-2 text-sm text-[#111]/60">Show first in the row at every hotel you reach, with a Featured badge.</p>}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {MONTHS.map(m => (
          <button key={m} onClick={() => setMonths(m)} className={`rounded-2xl p-4 text-left border transition-colors ${months === m ? 'border-[#111] bg-[#111] text-white' : 'border-black/10 hover:border-black/25'}`}>
            <span className="block text-[15px] font-semibold">{m} month{m === 1 ? '' : 's'}</span>
            <span className={`block mt-0.5 text-sm ${months === m ? 'text-white/65' : 'text-[#111]/55'}`}>{inr(fee * m)}</span>
          </button>
        ))}
      </div>
      {extendsFrom && <p className="mt-3 text-xs text-[#111]/50">Starts when the current one ends, on {fmtDate(extendsFrom)}, so nothing is lost.</p>}
      {error && <p className="mt-3 rounded-2xl bg-[#ffe9e5] px-4 py-3 text-sm text-[#8a1c0a]">{error}</p>}
      <AnimatePresence>
        {paidUntil && (
          <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 rounded-2xl bg-[#d4ff5a] px-4 py-3 text-sm font-medium inline-flex items-center gap-2">
            <Check className="size-4" /> Paid. {kind === 'featured' ? 'Featured' : 'Listed'} until {fmtDate(paidUntil)}. A receipt is on its way to your email.
          </motion.p>
        )}
      </AnimatePresence>
      <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-[#111]/55">UPI, cards and netbanking through Razorpay. No auto-renewal.</p>
        <button onClick={pay} disabled={!!busy} className="h-12 px-7 inline-flex items-center justify-center gap-2 rounded-full bg-[#111] text-white text-[15px] font-medium hover:bg-black disabled:opacity-60 transition-colors">
          {busy ? <><Loader2 className="size-4 animate-spin" /> {busy === 'verifying' ? 'Confirming…' : 'Opening…'}</> : <>Pay {inr(fee * months)} <ArrowRight className="size-4" /></>}
        </button>
      </div>
    </section>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[#f4f5f2] p-4">
      <Icon className="size-4 text-[#111]/50" />
      <p className="mt-3 text-3xl font-semibold tracking-[-0.03em]">{value.toLocaleString('en-IN')}</p>
      <p className="mt-0.5 text-xs text-[#111]/55">{label}</p>
    </div>
  );
}

const STATUS_CHIP: Record<PortalRequest['status'], { label: string; cls: string }> = {
  new: { label: 'New', cls: 'bg-[#111] text-white' },
  accepted: { label: 'Accepted', cls: 'bg-[#d4ff5a]' },
  declined: { label: 'Declined', cls: 'bg-[#f4f5f2] text-[#111]/60' },
  done: { label: 'Done', cls: 'bg-[#f4f5f2] text-[#111]/60' },
};

function RequestRow({ r, token, businessName, onChange }: { r: PortalRequest; token: string; businessName: string; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const set = async (status: 'accepted' | 'declined' | 'done') => {
    setBusy(true);
    setError(null);
    try {
      await updatePartnerRequest(token, r.id, status, note);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t update it.');
    } finally {
      setBusy(false);
    }
  };
  const chip = STATUS_CHIP[r.status];
  const open = r.status === 'new' || r.status === 'accepted';
  return (
    <div className={`rounded-2xl border p-4 ${r.status === 'new' ? 'border-[#111]/25' : 'border-black/5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{r.guestName ?? 'A guest'} <span className="font-normal text-[#111]/50">· {r.hotelName}{r.roomNumber ? `, room ${r.roomNumber}` : ''}</span></p>
          <p className="mt-1 text-[15px] leading-snug">“{r.message}”</p>
          <p className="mt-1.5 text-xs text-[#111]/50 flex flex-wrap gap-x-3 gap-y-1">
            <span>{ago(r.createdAt)}</span>
            {r.preferredTime && <span className="inline-flex items-center gap-1"><Clock className="size-3" />{r.preferredTime}</span>}
            {r.partySize && <span className="inline-flex items-center gap-1"><Users className="size-3" />{r.partySize}</span>}
          </p>
          {r.businessNote && <p className="mt-1.5 text-xs text-[#111]/60">Your reply: {r.businessNote}</p>}
        </div>
        <span className={`shrink-0 h-6 px-2.5 rounded-full text-xs font-semibold inline-flex items-center ${chip.cls}`}>{chip.label}</span>
      </div>
      {r.guestPhone && open && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <a href={waHref(r.guestPhone, `Hi ${r.guestName ?? ''}, this is ${businessName}. About your request: "${r.message}"`)} target="_blank" rel="noreferrer" className="h-9 px-3.5 rounded-full bg-[#111] text-white text-sm font-medium inline-flex items-center gap-1.5"><MessageCircle className="size-4" /> WhatsApp</a>
          <a href={`tel:${r.guestPhone.replace(/[^\d+]/g, '')}`} className="h-9 px-3.5 rounded-full bg-[#f4f5f2] text-sm font-medium inline-flex items-center gap-1.5"><Phone className="size-4" /> {r.guestPhone}</a>
        </div>
      )}
      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="A note for the guest (optional)" className="flex-1 min-w-[180px] h-9 px-3.5 rounded-full bg-[#f4f5f2] text-sm focus:outline-none focus:bg-white border border-transparent focus:border-black/15" />
          {r.status === 'new' && <button disabled={busy} onClick={() => set('accepted')} className="h-9 px-3.5 rounded-full bg-[#d4ff5a] text-sm font-medium disabled:opacity-50">Accept</button>}
          {r.status === 'new' && <button disabled={busy} onClick={() => set('declined')} className="h-9 px-3.5 rounded-full border border-black/10 text-sm font-medium disabled:opacity-50">Decline</button>}
          {r.status === 'accepted' && <button disabled={busy} onClick={() => set('done')} className="h-9 px-3.5 rounded-full border border-black/10 text-sm font-medium disabled:opacity-50">Mark done</button>}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-[#8a1c0a]">{error}</p>}
    </div>
  );
}

function ListingPreview({ data, featured }: { data: PartnerPortal; featured: boolean }) {
  const p = data.partner;
  const category = PARTNER_CATEGORIES.find(c => c.id === p.category)?.label ?? 'Local';
  return (
    <div className="mt-4 rounded-[22px] bg-[#eef0ec] p-3">
      <div className="rounded-[18px] bg-white overflow-hidden">
        <div className="relative h-36 bg-[linear-gradient(135deg,#c9d6c1,#8fa58a)]">
          {p.photo && <img src={p.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold">{featured ? <><Sparkles className="size-3" /> Featured</> : 'Partner'}</span>
        </div>
        <div className="p-4">
          <p className="text-xs text-[#111]/50">{category}</p>
          <p className="text-[17px] font-semibold tracking-[-0.01em]">{p.name}</p>
          {p.tagline && <p className="mt-0.5 text-sm text-[#111]/60">{p.tagline}</p>}
          {p.offerText && <p className="mt-2 text-sm font-medium inline-flex items-center gap-1.5"><Tag className="size-3.5" /> {p.offerText}</p>}
          {p.address && <p className="mt-1.5 text-xs text-[#111]/50 inline-flex items-center gap-1"><MapPin className="size-3" /> {p.address}</p>}
        </div>
      </div>
    </div>
  );
}
