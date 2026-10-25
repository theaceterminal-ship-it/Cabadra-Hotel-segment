import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BedDouble, Car, Check, Clock, Coffee, Flower2, Loader2, Map as MapIcon, MessageCircle, Mountain, Phone, Search, Send, ShoppingBag, Sparkles,
  Star, Store, Tag, Users, UtensilsCrossed, X,
} from 'lucide-react';
import { ConciergePartner, ConciergeRequest, ConciergeStay, bookPartnerForGuest, fetchConcierge } from '../lib/staffApi';

const CATEGORY: Record<string, { label: string; icon: typeof Store }> = {
  restaurant: { label: 'Restaurant', icon: UtensilsCrossed },
  cafe: { label: 'Café', icon: Coffee },
  taxi: { label: 'Taxi', icon: Car },
  tours: { label: 'Tours', icon: MapIcon },
  adventure: { label: 'Adventure', icon: Mountain },
  spa: { label: 'Spa', icon: Flower2 },
  shopping: { label: 'Shopping', icon: ShoppingBag },
  other: { label: 'Local', icon: Store },
};

const STATUS: Record<ConciergeRequest['status'], { label: string; cls: string }> = {
  new: { label: 'Waiting for them', cls: 'bg-surface-container-high text-on-surface' },
  accepted: { label: 'Accepted', cls: 'bg-room-ready text-room-ready-on' },
  declined: { label: 'Declined', cls: 'bg-error/10 text-error' },
  done: { label: 'Done', cls: 'bg-surface-container-low text-on-surface-variant' },
};

const ago = (ts: string) => {
  const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/**
 * Reception's concierge (0085): the local partners Cabadra lists near this
 * hotel, and booking one for a guest who asked at the desk. The business
 * gets the guest's name, phone and room by email, exactly like a request
 * the guest sends from their own app, and the guest sees it there too.
 * Partners without an email can only be called. Below, every request to a
 * partner from this hotel in the last 14 days, from the desk or the app.
 */
export function ConciergeView({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<{ stays: ConciergeStay[]; partners: ConciergePartner[]; requests: ConciergeRequest[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<ConciergePartner | null>(null);
  const [category, setCategory] = useState<string>('all');

  const load = useCallback(() => fetchConcierge(propertyId).then(d => { setData(d); setError(null); }).catch(err => setError(err.message)), [propertyId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const categories = useMemo(() => Array.from(new Set(data?.partners.map(p => p.category) ?? [])), [data]);
  const shown = data?.partners.filter(p => category === 'all' || p.category === category) ?? [];

  return (
    <div className="px-4 sm:px-6 pb-10 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] text-on-surface">Concierge</h1>
        <p className="text-sm text-on-surface-variant mt-1">Book a local partner for a guest: a cab, a tour, a spa slot. They get the guest’s details and reply to the guest directly.</p>
      </div>
      {error && <p className="rounded-2xl bg-error/10 text-error text-sm px-4 py-3">{error}</p>}
      {!data ? (
        !error && <div className="py-16 flex justify-center"><Loader2 className="size-6 animate-spin text-on-surface-variant" /></div>
      ) : data.partners.length === 0 ? (
        <div className="rounded-[28px] bg-surface-container-lowest p-10 text-center">
          <Store className="size-8 mx-auto text-on-surface-variant" />
          <p className="mt-3 font-semibold text-on-surface">No local partners here yet</p>
          <p className="text-sm text-on-surface-variant mt-1">Businesses listed by Cabadra near you show up here. The owner can turn kinds of business on or off under Experiences › Local partners.</p>
        </div>
      ) : (
        <>
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {['all', ...categories].map(c => (
                <button key={c} onClick={() => setCategory(c)} className={`h-9 px-4 rounded-full text-sm font-medium transition-colors ${category === c ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface hover:bg-surface-container'}`}>
                  {c === 'all' ? 'All' : CATEGORY[c]?.label ?? c}
                </button>
              ))}
            </div>
          )}
          <motion.div layout className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((p, i) => {
              const Icon = CATEGORY[p.category]?.icon ?? Store;
              return (
                <motion.div key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.04 }} className="rounded-[24px] bg-surface-container-lowest overflow-hidden flex flex-col">
                  <div className="flex gap-3 p-4">
                    {p.photo ? <img src={p.photo} alt="" className="size-16 rounded-2xl object-cover shrink-0" /> : <span className="size-16 rounded-2xl bg-surface-container-low flex items-center justify-center shrink-0 text-on-surface-variant"><Icon className="size-6" /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-on-surface-variant inline-flex items-center gap-1"><Icon className="size-3.5" /> {CATEGORY[p.category]?.label ?? 'Local'}{p.featured && <span className="ml-1 inline-flex items-center gap-0.5 font-medium text-on-surface"><Sparkles className="size-3" /> Featured</span>}</p>
                      <p className="font-semibold text-on-surface truncate">{p.name}</p>
                      {p.tagline && <p className="text-[13px] text-on-surface-variant line-clamp-1">{p.tagline}</p>}
                      <p className="mt-1 text-[12px] text-on-surface-variant flex flex-wrap gap-x-3">
                        {p.rating.count >= 3 && p.rating.average != null && <span className="inline-flex items-center gap-1 font-medium text-on-surface"><Star className="size-3 fill-current" /> {p.rating.average}</span>}
                        {p.openingHours && <span className="inline-flex items-center gap-1"><Clock className="size-3" />{p.openingHours}</span>}
                      </p>
                    </div>
                  </div>
                  {p.offerText && <p className="mx-4 mb-3 inline-flex self-start items-center gap-1.5 rounded-full bg-room-ready text-room-ready-on px-2.5 py-1 text-[12px] font-medium"><Tag className="size-3.5" /> {p.offerText}</p>}
                  <div className="mt-auto p-3 pt-0 flex gap-2">
                    {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="h-10 px-4 rounded-full bg-surface-container-low text-on-surface text-sm font-medium inline-flex items-center gap-1.5"><Phone className="size-4" /> Call</a>}
                    {p.takesRequests
                      ? <button onClick={() => setBooking(p)} className="flex-1 h-10 rounded-full bg-primary text-on-primary text-sm font-medium inline-flex items-center justify-center gap-1.5"><Send className="size-4" /> Book for a guest</button>
                      : <span className="flex-1 h-10 rounded-full text-[12px] text-on-surface-variant inline-flex items-center justify-center text-center px-2">Call to book: no email for requests</span>}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </>
      )}

      {data && data.requests.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-on-surface">Recent requests</h2>
          <div className="mt-3 rounded-[24px] bg-surface-container-lowest divide-y divide-outline-variant overflow-hidden">
            {data.requests.map(r => (
              <div key={r.id} className="px-4 py-3 flex flex-wrap items-start gap-x-4 gap-y-1">
                <div className="flex-1 min-w-[220px]">
                  <p className="text-sm font-medium text-on-surface">{r.partnerName} <span className="font-normal text-on-surface-variant">· {r.guestName ?? 'Guest'}{r.roomNumber ? `, room ${r.roomNumber}` : ''}</span></p>
                  <p className="text-sm text-on-surface line-clamp-2">“{r.message}”</p>
                  <p className="text-[12px] text-on-surface-variant flex flex-wrap gap-x-3">
                    <span>{ago(r.createdAt)} · {r.source === 'reception' ? 'booked by the desk' : 'from the guest app'}</span>
                    {r.preferredTime && <span className="inline-flex items-center gap-1"><Clock className="size-3" />{r.preferredTime}</span>}
                    {r.partySize && <span className="inline-flex items-center gap-1"><Users className="size-3" />{r.partySize}</span>}
                  </p>
                  {r.businessNote && <p className="text-[12px] text-on-surface mt-0.5">Their reply: {r.businessNote}</p>}
                </div>
                <span className={`h-6 px-2.5 rounded-full text-xs font-medium inline-flex items-center shrink-0 ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <AnimatePresence>
        {booking && data && <BookDialog partner={booking} stays={data.stays} onClose={() => setBooking(null)} onBooked={() => { setBooking(null); load(); }} />}
      </AnimatePresence>
    </div>
  );
}

function BookDialog({ partner, stays, onClose, onBooked }: { partner: ConciergePartner; stays: ConciergeStay[]; onClose: () => void; onBooked: () => void }) {
  const [query, setQuery] = useState('');
  const [stay, setStay] = useState<ConciergeStay | null>(null);
  const [message, setMessage] = useState('');
  const [when, setWhen] = useState('');
  const [people, setPeople] = useState('');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const matches = stays.filter(s => !q || s.guestName.toLowerCase().includes(q) || (s.roomNumber ?? '').toLowerCase().includes(q));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stay) return;
    setBusy(true);
    setError(null);
    try {
      await bookPartnerForGuest({
        reservationId: stay.reservationId, partnerId: partner.id, message: message.trim(),
        preferredTime: when.trim() || undefined, partySize: people ? Number(people) : undefined, phone: phone.trim() || undefined, guestAgreed: agreed,
      });
      onBooked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send it.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full h-11 px-4 rounded-2xl bg-surface-container-low border border-transparent text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-outline';

  return (
    <motion.div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <motion.form onSubmit={submit} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 320 }} className="w-full sm:max-w-lg max-h-[92svh] overflow-y-auto bg-surface-container-lowest rounded-t-[28px] sm:rounded-[28px] p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-on-surface-variant">Book for a guest</p>
            <h3 className="text-xl font-semibold tracking-[-0.02em] text-on-surface">{partner.name}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="size-9 rounded-full hover:bg-surface-container-low flex items-center justify-center"><X className="size-5" /></button>
        </div>

        <div>
          <p className="text-sm font-medium text-on-surface mb-1.5">Guest</p>
          {stay ? (
            <div className="flex items-center justify-between rounded-2xl bg-surface-container-low px-4 py-2.5">
              <span className="text-sm"><span className="font-medium">{stay.guestName}</span><span className="text-on-surface-variant">{stay.roomNumber ? ` · room ${stay.roomNumber}` : ''}{stay.status === 'upcoming' ? ' · arriving' : ''}</span></span>
              <button type="button" onClick={() => setStay(null)} className="text-sm font-medium text-on-surface-variant hover:text-on-surface">Change</button>
            </div>
          ) : (
            <>
              <label className="relative block"><Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Name or room" className={`${field} pl-10`} /></label>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-2xl border border-outline-variant divide-y divide-outline-variant">
                {matches.length === 0 ? <p className="px-4 py-3 text-sm text-on-surface-variant">{stays.length ? 'No one matches.' : 'No guests staying or arriving today.'}</p> : matches.map(s => (
                  <button type="button" key={s.reservationId} onClick={() => { setStay(s); if (!s.hasPhone) setPhone(''); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-container-low flex items-center gap-2">
                    <BedDouble className="size-4 text-on-surface-variant shrink-0" /><span className="font-medium">{s.roomNumber ?? '—'}</span><span className="truncate">{s.guestName}</span>{s.status === 'upcoming' && <span className="text-xs text-on-surface-variant">arriving</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-on-surface mb-1.5">What they want</p>
          <textarea required minLength={2} maxLength={500} rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder={partner.category === 'taxi' ? 'Cab to Chandigarh airport, 2 bags' : 'What the guest asked for'} className={`${field} h-auto py-2.5 resize-none`} />
        </div>
        <div className="grid grid-cols-[1fr_100px] gap-2">
          <input maxLength={80} value={when} onChange={e => setWhen(e.target.value)} placeholder="When? e.g. tomorrow 5am" className={field} />
          <input type="number" min={1} max={50} value={people} onChange={e => setPeople(e.target.value)} placeholder="People" className={field} />
        </div>
        {stay && !stay.hasPhone && <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="Guest’s phone (none on the booking)" className={field} />}
        {stay?.hasPhone && <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Different phone for this? (optional)" className={field} />}

        <label className="flex items-start gap-2.5 text-[13px] text-on-surface-variant">
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-[#111]" />
          <span>The guest asked us to book this and is happy for {partner.name} to get their name, phone and room number.</span>
        </label>
        {error && <p className="rounded-2xl bg-error/10 text-error text-sm px-4 py-2.5">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-11 px-5 rounded-full bg-surface-container-low text-sm font-medium">Cancel</button>
          <button disabled={busy || !stay || !agreed} className="flex-1 h-11 rounded-full bg-primary text-on-primary text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Send to {partner.name}
          </button>
        </div>
        <p className="text-[12px] text-on-surface-variant inline-flex items-center gap-1.5"><MessageCircle className="size-3.5" /> They reply to the guest on WhatsApp or by phone; you’ll see their answer here.</p>
      </motion.form>
    </motion.div>
  );
}
