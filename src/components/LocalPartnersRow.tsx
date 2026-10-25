import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Car, Check, Coffee, Copy, Flower2, MapPin, Map as MapIcon, MessageCircle, Mountain, Phone, ShoppingBag, Store, Tag,
  UtensilsCrossed, X, Clock, Send, Sparkles, Loader2, Star,
} from 'lucide-react';
import {
  fetchPartnerListings, fetchPartnerRequests, logPartnerEvents, ratePartner, sendPartnerRequest, PartnerListing, PartnerEventKind, PartnerRequest,
} from '../lib/guestApi';

const EASE = [0.22, 1, 0.36, 1] as const;

const CATEGORY: Record<PartnerListing['category'], { label: string; icon: typeof Store }> = {
  restaurant: { label: 'Restaurant', icon: UtensilsCrossed },
  cafe: { label: 'Café', icon: Coffee },
  taxi: { label: 'Taxi', icon: Car },
  tours: { label: 'Tours', icon: MapIcon },
  adventure: { label: 'Adventure', icon: Mountain },
  spa: { label: 'Spa', icon: Flower2 },
  shopping: { label: 'Shopping', icon: ShoppingBag },
  other: { label: 'Local', icon: Store },
};

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** wa.me wants digits with the country code; a bare 10-digit Indian number gets 91. */
function whatsappHref(number: string, propertyName: string) {
  let digits = number.replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  const text = encodeURIComponent(`Hi, I found you on Cabadra while staying at ${propertyName}.`);
  return `https://wa.me/${digits}?text=${text}`;
}

function directionsHref(p: PartnerListing) {
  if (p.mapsUrl) return p.mapsUrl;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address].filter(Boolean).join(', '))}`;
}

/**
 * "Around {place}": local businesses Cabadra lists for this hotel's guests
 * (0078), each marked Partner. Contact only: the guest calls, messages or
 * gets directions themselves, and nothing about them is passed on. Renders
 * nothing when there's nothing to show (no partners here yet, the hotel
 * turned them off, or any error).
 */
export function LocalPartnersRow({ token, propertyName }: { token: string; propertyName: string }) {
  const [area, setArea] = useState('');
  const [items, setItems] = useState<PartnerListing[]>([]);
  const [open, setOpen] = useState<PartnerListing | null>(null);
  const seen = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchPartnerListings(token).then(r => {
      if (cancelled) return;
      setArea(r.area);
      setItems(r.items);
    });
    return () => { cancelled = true; };
  }, [token]);

  if (items.length === 0) return null;

  const log = (partnerId: string, event: PartnerEventKind) => logPartnerEvents(token, [{ partnerId, event }]);

  return (
    <section id="local-partners-section">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: EASE }}
        // Counted when the row is actually on screen, once per visit (the
        // server also keeps it to once a day per guest).
        onViewportEnter={() => {
          if (seen.current) return;
          seen.current = true;
          logPartnerEvents(token, items.map(p => ({ partnerId: p.id, event: 'impression' })));
        }}
        className="mb-4 px-1"
      >
        <p className="text-sm font-medium text-on-surface-variant">Local favourites, picked by Cabadra</p>
        <h2 className="mt-1 text-[28px] leading-[1.05] font-semibold tracking-[-0.03em] text-on-surface">Around {area || 'here'}</h2>
      </motion.div>

      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 pb-2 -mx-4 px-4 scrollbar-none">
        {items.map((p, i) => {
          const Icon = CATEGORY[p.category]?.icon ?? Store;
          return (
            <motion.button
              key={p.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: Math.min(i, 5) * 0.07, ease: EASE }}
              whileTap={{ scale: 0.985 }}
              onClick={() => { setOpen(p); log(p.id, 'tap'); }}
              className="group snap-start shrink-0 w-[72%] sm:w-64 rounded-[28px] bg-surface-container-lowest overflow-hidden text-left hover:shadow-[0_18px_50px_rgba(0,0,0,0.08)] transition-shadow duration-300"
            >
              <div className="relative h-36 bg-surface-container-high">
                {p.photo
                  ? <img src={p.photo} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  : <span className="absolute inset-0 flex items-center justify-center text-on-surface-variant"><Icon className="size-8 opacity-40" /></span>}
                <span className="absolute top-3 left-3 rounded-full bg-white/85 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-[#111] inline-flex items-center gap-1">
                  {p.featured ? <><Sparkles className="size-3" /> Featured</> : 'Partner'}
                </span>
              </div>
              <div className="p-4">
                <p className="text-[12px] text-on-surface-variant flex items-center gap-1"><Icon className="size-3.5" /> {CATEGORY[p.category]?.label ?? 'Local'}</p>
                <p className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-on-surface truncate">{p.name}</p>
                {p.rating != null && <p className="mt-0.5 text-[12px] font-medium text-on-surface inline-flex items-center gap-1"><Star className="size-3 fill-current" /> {p.rating} <span className="font-normal text-on-surface-variant">({p.ratingCount})</span></p>}
                {p.tagline && <p className="mt-0.5 text-[13px] text-on-surface-variant line-clamp-1">{p.tagline}</p>}
                {p.offerText && (
                  <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-room-ready text-room-ready-on px-2.5 py-1 text-[12px] font-medium">
                    <Tag className="size-3.5 shrink-0" /> <span className="truncate">{p.offerText}</span>
                  </p>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {open && (
          <PartnerSheet
            key={open.id}
            token={token}
            partner={open}
            propertyName={propertyName}
            onClose={() => setOpen(null)}
            onAction={kind => log(open.id, kind)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function PartnerSheet({ token, partner, propertyName, onClose, onAction }: {
  token: string;
  partner: PartnerListing;
  propertyName: string;
  onClose: () => void;
  onAction: (kind: PartnerEventKind) => void;
}) {
  const [codeShown, setCodeShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const Icon = CATEGORY[partner.category]?.icon ?? Store;

  const copyCode = async () => {
    if (!partner.offerCode) return;
    try { await navigator.clipboard.writeText(partner.offerCode); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the code is on screen anyway */ }
  };

  const actions = [
    partner.phone && { kind: 'call' as const, label: 'Call', icon: Phone, href: telHref(partner.phone) },
    partner.whatsapp && { kind: 'whatsapp' as const, label: 'WhatsApp', icon: MessageCircle, href: whatsappHref(partner.whatsapp, propertyName) },
    { kind: 'directions' as const, label: 'Directions', icon: MapPin, href: directionsHref(partner) },
  ].filter(Boolean) as { kind: PartnerEventKind; label: string; icon: typeof Phone; href: string }[];

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="w-full sm:max-w-md max-h-[92svh] flex flex-col bg-surface-container-lowest text-on-surface rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      >
        <div className={`relative ${partner.photo ? 'h-52' : 'h-24'} bg-surface-container-high shrink-0`}>
          {partner.photo && <motion.img initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: 0.8 }} src={partner.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <span className="absolute top-3 left-3 rounded-full bg-white/85 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-[#111]">Partner</span>
          <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 size-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <p className="text-[13px] text-on-surface-variant flex items-center gap-1"><Icon className="size-4" /> {CATEGORY[partner.category]?.label ?? 'Local'}</p>
            <h3 className="mt-1 text-[26px] leading-tight font-semibold tracking-[-0.03em]">{partner.name}</h3>
            {partner.tagline && <p className="mt-1 text-[15px] text-on-surface-variant">{partner.tagline}</p>}
            {partner.rating != null && <p className="mt-1.5 text-sm font-medium inline-flex items-center gap-1"><Star className="size-4 fill-current" /> {partner.rating} <span className="font-normal text-on-surface-variant">from {partner.ratingCount} guest{partner.ratingCount === 1 ? '' : 's'}</span></p>}
          </div>

          {partner.description && <p className="text-sm text-on-surface-variant leading-relaxed">{partner.description}</p>}

          {(partner.address || partner.openingHours) && (
            <div className="rounded-[20px] bg-surface p-4 space-y-2 text-sm">
              {partner.address && <p className="flex items-start gap-2"><MapPin className="size-4 mt-0.5 shrink-0 text-on-surface-variant" /> {partner.address}</p>}
              {partner.openingHours && <p className="flex items-start gap-2"><Clock className="size-4 mt-0.5 shrink-0 text-on-surface-variant" /> {partner.openingHours}</p>}
            </div>
          )}

          {partner.offerText && (
            <div className="rounded-[20px] bg-room-ready/25 p-4">
              <p className="text-sm font-medium flex items-center gap-2"><Tag className="size-4" /> {partner.offerText}</p>
              {partner.offerCode && (
                codeShown ? (
                  <motion.button
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={copyCode}
                    className="mt-3 w-full h-12 rounded-full bg-surface-container-lowest border-2 border-dashed border-on-surface/30 font-mono text-base font-semibold tracking-[0.2em] flex items-center justify-center gap-2"
                  >
                    {partner.offerCode}
                    {copied ? <Check className="size-4" /> : <Copy className="size-4 text-on-surface-variant" />}
                  </motion.button>
                ) : (
                  <button onClick={() => { setCodeShown(true); onAction('code'); }} className="mt-3 h-10 px-5 rounded-full bg-primary text-on-primary text-[13px] font-medium">
                    Show offer code
                  </button>
                )
              )}
              {partner.offerCode && codeShown && <p className="mt-2 text-[12px] text-on-surface-variant">Show this code when you pay.</p>}
            </div>
          )}

          {partner.takesRequests && <RequestBox token={token} partner={partner} propertyName={propertyName} />}

          <p className="text-[12px] text-on-surface-variant">
            A local business Cabadra partners with. You deal with them directly; {propertyName} isn’t involved, and nothing about you is shared unless you send them a request.
          </p>
        </div>

        <div className="p-4 border-t border-outline-variant grid gap-2 shrink-0" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))`, paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {actions.map((a, i) => (
            <a
              key={a.kind}
              href={a.href}
              target={a.kind === 'call' ? undefined : '_blank'}
              rel="noopener noreferrer"
              onClick={() => onAction(a.kind)}
              className={`h-12 rounded-full text-[14px] font-medium flex items-center justify-center gap-2 ${i === 0 ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface'}`}
            >
              <a.icon className="size-4" /> {a.label}
            </a>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

const REQUEST_STATUS: Record<PartnerRequest['status'], string> = {
  new: 'Sent, waiting for them',
  accepted: 'Accepted',
  declined: 'They can’t do it',
  done: 'Done',
};

/**
 * "Send a request": the guest writes what they want (a cab at 9, a table
 * for four) and, only by ticking the box, shares their name, phone and
 * hotel with this business, which replies on WhatsApp or by phone. Their
 * earlier requests to this business show with its answer.
 */
function RequestBox({ token, partner, propertyName }: { token: string; partner: PartnerListing; propertyName: string }) {
  const [mine, setMine] = useState<PartnerRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [when, setWhen] = useState('');
  const [people, setPeople] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = () => fetchPartnerRequests(token).then(all => setMine(all.filter(r => r.partnerId === partner.id)));
  useEffect(() => { load(); }, [token, partner.id]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendPartnerRequest(token, {
        partnerId: partner.id,
        message: message.trim(),
        preferredTime: when.trim() || undefined,
        partySize: people ? Number(people) : undefined,
        phone: phone.trim() || undefined,
        consent,
      });
      setSent(true);
      setOpen(false);
      setMessage('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send it.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded-[16px] bg-surface-container-lowest border border-outline-variant px-3.5 text-sm focus:outline-none focus:border-on-surface/40';

  return (
    <div className="rounded-[20px] bg-surface p-4">
      {mine.length > 0 && (
        <div className="mb-3 space-y-2">
          {mine.slice(0, 3).map(r => (
            <div key={r.id} className="rounded-[14px] bg-surface-container-lowest px-3.5 py-2.5 text-sm">
              {r.source === 'reception' && <p className="text-[11px] font-medium text-on-surface-variant">Booked for you by the front desk</p>}
              <p className="line-clamp-1">“{r.message}”</p>
              <p className={`mt-0.5 text-[12px] font-medium ${r.status === 'accepted' || r.status === 'done' ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                {REQUEST_STATUS[r.status]}{r.businessNote ? `: ${r.businessNote}` : ''}
              </p>
              {(r.status === 'accepted' || r.status === 'done') && <RateRequest token={token} request={r} partnerName={partner.name} onRated={load} />}
            </div>
          ))}
        </div>
      )}
      <AnimatePresence initial={false} mode="wait">
        {open ? (
          <motion.form key="form" onSubmit={send} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} className="space-y-2.5 overflow-hidden">
            <p className="text-sm font-medium">What would you like?</p>
            <textarea required minLength={2} maxLength={500} rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder={partner.category === 'taxi' ? 'A cab to Kasauli and back' : 'Tell them what you’d like'} className={`${field} py-2.5 resize-none`} />
            <div className="grid grid-cols-[1fr_88px] gap-2">
              <input maxLength={80} value={when} onChange={e => setWhen(e.target.value)} placeholder="When? e.g. tomorrow 9am" className={`${field} h-11`} />
              <input type="number" min={1} max={50} value={people} onChange={e => setPeople(e.target.value)} placeholder="People" className={`${field} h-11`} />
            </div>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Your phone (if not the one on your booking)" className={`${field} h-11`} />
            <label className="flex items-start gap-2.5 text-[13px] text-on-surface-variant pt-1">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-[#111]" />
              <span>Share my name, phone and that I’m staying at {propertyName} with {partner.name} so they can reply.</span>
            </label>
            {error && <p className="text-[13px] text-error">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setOpen(false)} className="h-11 px-4 rounded-full text-sm font-medium bg-surface-container-lowest">Cancel</button>
              <button disabled={busy || !consent || message.trim().length < 2} className="flex-1 h-11 rounded-full bg-primary text-on-primary text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send request
              </button>
            </div>
          </motion.form>
        ) : (
          <motion.div key="cta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{sent ? 'Request sent' : 'Ask them to book you in'}</p>
              <p className="text-[12px] text-on-surface-variant">{sent ? 'They’ll reply on WhatsApp or call you.' : 'They reply on WhatsApp or by phone.'}</p>
            </div>
            <button onClick={() => { setOpen(true); setSent(false); }} className="h-10 px-4 rounded-full bg-primary text-on-primary text-[13px] font-medium inline-flex items-center gap-1.5 shrink-0">
              <Send className="size-3.5" /> {sent ? 'Another' : 'Request'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Stars for a request the business took. Once only; a comment is optional. */
function RateRequest({ token, request, partnerName, onRated }: { token: string; request: PartnerRequest; partnerName: string; onRated: () => void }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (request.rating) {
    return <p className="mt-1.5 text-[12px] text-on-surface-variant inline-flex items-center gap-1">You rated them <Star className="size-3 fill-current text-on-surface" /> {request.rating}</p>;
  }
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await ratePartner(token, request.id, stars, comment.trim() || undefined);
      onRated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save that.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 pt-2 border-t border-outline-variant">
      <p className="text-[12px] text-on-surface-variant">How was {partnerName}?</p>
      <div className="mt-1 flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(n => (
          <motion.button key={n} whileTap={{ scale: 0.85 }} onClick={() => setStars(n)} aria-label={`${n} star${n === 1 ? '' : 's'}`} className="p-1">
            <Star className={`size-6 transition-colors ${n <= stars ? 'fill-on-surface text-on-surface' : 'text-on-surface-variant/40'}`} />
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {stars > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <div className="mt-1.5 flex gap-1.5">
              <input value={comment} onChange={e => setComment(e.target.value)} maxLength={300} placeholder="A few words (optional)" className="flex-1 min-w-0 h-9 px-3 rounded-full bg-surface border border-outline-variant text-[13px] focus:outline-none" />
              <button onClick={send} disabled={busy} className="h-9 px-4 rounded-full bg-primary text-on-primary text-[13px] font-medium disabled:opacity-50">{busy ? '…' : 'Rate'}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className="mt-1 text-[12px] text-error">{error}</p>}
    </div>
  );
}
