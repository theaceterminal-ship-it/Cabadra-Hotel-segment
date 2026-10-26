import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useBackToClose } from '../hooks/useBackToClose';
import {
  Car, Check, Coffee, Copy, Flower2, MapPin, Map as MapIcon, MessageCircle, Mountain, Phone, ShoppingBag, Store, Tag,
  UtensilsCrossed, X, Clock, Send, Sparkles, Loader2, Star, Search,
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
  const [query, setQuery] = useState('');
  const seen = useRef(false);
  useBackToClose(!!open, () => setOpen(null));

  useEffect(() => {
    let cancelled = false;
    fetchPartnerListings(token).then(r => {
      if (cancelled) return;
      setArea(r.area);
      setItems(r.items);
    });
    return () => { cancelled = true; };
  }, [token]);

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return items;
    return items.filter(p => {
      const haystack = [p.name, p.tagline, p.description, p.offerText, CATEGORY[p.category]?.label, ...(SEARCH_WORDS[p.category] ?? [])]
        .filter(Boolean).join(' ').toLowerCase();
      return words.every(w => haystack.includes(w));
    });
  }, [items, query]);

  if (items.length === 0) return null;

  const log = (partnerId: string, event: PartnerEventKind) => logPartnerEvents(token, [{ partnerId, event }]);

  return (
    <section id="local-partners-section">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: EASE }}
        // Counted when the section is actually on screen, once per visit
        // (the server also keeps it to once a day per guest).
        onViewportEnter={() => {
          if (seen.current) return;
          seen.current = true;
          logPartnerEvents(token, items.map(p => ({ partnerId: p.id, event: 'impression' })));
        }}
        className="mb-4 px-1"
      >
        <p className="text-sm font-medium text-on-surface-variant">Local favourites, picked by Cabadra</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h2 className="text-[28px] leading-[1.05] font-semibold tracking-[-0.03em] text-on-surface">Around {area || 'here'}</h2>
          {items.length > 1 && <span className="text-[13px] text-on-surface-variant shrink-0 pb-1">{items.length} places</span>}
        </div>
        {items.length > 2 && (
          <label className="mt-3 relative block">
            <Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search taxi, rafting, spa…"
              aria-label="Search local places"
              className="w-full h-10 pl-10 pr-10 rounded-full bg-surface-container-lowest border border-outline-variant text-[14px] text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-on-surface/40 transition-colors"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 size-7 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant">
                <X className="size-4" />
              </button>
            )}
          </label>
        )}
      </motion.div>

      {shown.length === 0 ? (
        <div className="rounded-[28px] bg-surface-container-lowest px-5 py-8 text-center">
          <p className="text-[15px] font-medium text-on-surface">Nothing for “{query.trim()}” around {area || 'here'}</p>
          <button onClick={() => setQuery('')} className="mt-3 h-9 px-4 rounded-full bg-surface-container-high text-[13px] font-medium text-on-surface">Show all</button>
        </div>
      ) : (
        <PartnerDeck key={query.trim().toLowerCase()} items={shown} onOpen={p => { setOpen(p); log(p.id, 'tap'); }} />
      )}

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

/** Extra words a guest might search for each kind of business. */
const SEARCH_WORDS: Record<PartnerListing['category'], string[]> = {
  taxi: ['cab', 'car', 'taxi', 'transfer', 'airport', 'driver', 'ride'],
  tours: ['tour', 'guide', 'sightseeing', 'trip', 'trek', 'walk'],
  adventure: ['adventure', 'rafting', 'paragliding', 'trek', 'camping', 'zipline', 'bike', 'hike', 'ski'],
  spa: ['spa', 'massage', 'wellness', 'ayurveda', 'salon'],
  restaurant: ['food', 'eat', 'dinner', 'lunch', 'restaurant', 'dhaba'],
  cafe: ['cafe', 'coffee', 'tea', 'bakery', 'snacks'],
  shopping: ['shop', 'shopping', 'market', 'shawl', 'souvenir', 'handicraft'],
  other: [],
};

const DECK_DEPTH = 3;
/** How far each card behind sticks out above the one in front, so its label shows. */
const PEEK = 30;
/** A card leaving the stack flies off the way it was swiped (custom = direction). */
const DECK_VARIANTS = {
  gone: (dir: number) => ({ x: dir * -340, opacity: 0, rotate: dir * -8, transition: { duration: 0.32 } }),
};
const SWIPE_DISTANCE = 70;
const SWIPE_SPEED = 450;

/**
 * The partners as a stack of cards: the front one full size, the next two
 * peeking out above it. Swipe the front card either way (or tap a dot) to
 * bring up the next; tap it to open the business. A single partner is just
 * one card.
 */
function PartnerDeck({ items, onOpen }: { items: PartnerListing[]; onOpen: (p: PartnerListing) => void }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const dragged = useRef(false);
  const n = items.length;
  const go = (step: 1 | -1) => {
    setDirection(step);
    setIndex(i => (i + step + n) % n);
  };
  // depth 0 is the front card.
  const stack = Array.from({ length: Math.min(DECK_DEPTH, n) }, (_, k) => ({ partner: items[(index + k) % n], depth: k }));

  return (
    <div>
      <div className="relative" style={{ height: 260 + (Math.min(DECK_DEPTH, n) - 1) * PEEK }}>
        <AnimatePresence initial={false} custom={direction}>
          {stack.slice().reverse().map(({ partner: p, depth }) => {
            const front = depth === 0;
            const Icon = CATEGORY[p.category]?.icon ?? Store;
            return (
              <motion.div
                key={p.id}
                custom={direction}
                initial={{ opacity: 0, y: -PEEK * DECK_DEPTH, scale: 1 - 0.05 * DECK_DEPTH }}
                animate={{ opacity: 1, y: -PEEK * depth, scale: 1 - 0.05 * depth, x: 0, rotate: 0 }}
                variants={DECK_VARIANTS}
                exit="gone"
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                style={{ zIndex: DECK_DEPTH - depth, transformOrigin: 'top center' }}
                drag={front && n > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.8}
                onDragStart={() => { dragged.current = true; }}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_SPEED) go(1);
                  else if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_SPEED) go(-1);
                  setTimeout(() => { dragged.current = false; }, 0);
                }}
                onClick={() => { if (front && !dragged.current) onOpen(p); }}
                role={front ? 'button' : undefined}
                tabIndex={front ? 0 : -1}
                aria-hidden={!front}
                aria-label={front ? `${p.name}, ${CATEGORY[p.category]?.label ?? 'Local'}. Open` : undefined}
                onKeyDown={e => {
                  if (!front) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p); }
                  if (e.key === 'ArrowRight') go(1);
                  if (e.key === 'ArrowLeft') go(-1);
                }}
                className={`absolute inset-x-0 bottom-0 h-[260px] rounded-[28px] overflow-hidden bg-surface-container-high shadow-[0_18px_40px_rgba(0,0,0,0.14)] select-none ${front ? 'cursor-grab active:cursor-grabbing touch-pan-y' : 'pointer-events-none'}`}
              >
                {p.photo
                  ? <img src={p.photo} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
                  : <span className="absolute inset-0 bg-[linear-gradient(135deg,#8fa58a,#4f6b55)] flex items-center justify-center text-white/30"><Icon className="size-16" /></span>}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.38)_0%,rgba(0,0,0,0)_32%,rgba(0,0,0,0)_45%,rgba(0,0,0,0.72)_100%)]" />
                <motion.div className="absolute inset-0 bg-black pointer-events-none" initial={false} animate={{ opacity: depth * 0.12 }} />

                <div className="absolute top-2.5 left-4 right-16 flex items-center gap-1.5 text-white text-[11px] font-semibold uppercase tracking-[0.08em]">
                  <Icon className="size-3.5 shrink-0" /> <span className="truncate">{CATEGORY[p.category]?.label ?? 'Local'}</span>
                </div>
                <span className={`absolute top-3 right-3 size-10 rounded-full transition-opacity ${front ? '' : 'opacity-0'} bg-white/25 backdrop-blur-md flex items-center justify-center text-white`} title={p.featured ? 'Featured' : 'Partner'}>
                  {p.featured ? <Sparkles className="size-4" /> : <Star className="size-4" />}
                </span>

                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  {p.offerText && (
                    <p className="mb-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/90 text-[#111] px-2.5 py-1 text-[11px] font-semibold">
                      <Tag className="size-3 shrink-0" /> <span className="truncate">{p.offerText}</span>
                    </p>
                  )}
                  <p className="text-[24px] leading-[1.08] font-semibold tracking-[-0.02em] line-clamp-2">{p.name}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-white/85">
                    {p.rating != null && <span className="inline-flex items-center gap-1 font-semibold text-white"><Star className="size-3.5 fill-current" /> {p.rating}</span>}
                    {p.tagline ? <span className="line-clamp-1">{p.tagline}</span> : p.openingHours && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> {p.openingHours}</span>}
                    {p.featured && <span className="inline-flex items-center gap-1"><Sparkles className="size-3.5" /> Featured</span>}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {n > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5" role="tablist" aria-label="Local places">
          {items.map((p, i) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={i === index}
              aria-label={p.name}
              onClick={() => { setDirection(i > index ? 1 : -1); setIndex(i); }}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'w-5 bg-on-surface' : 'w-1.5 bg-on-surface/25'}`}
            />
          ))}
        </div>
      )}
    </div>
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
