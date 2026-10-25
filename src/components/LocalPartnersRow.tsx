import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Car, Check, Coffee, Copy, Flower2, MapPin, Map as MapIcon, MessageCircle, Mountain, Phone, ShoppingBag, Store, Tag,
  UtensilsCrossed, X, Clock,
} from 'lucide-react';
import { fetchPartnerListings, logPartnerEvents, PartnerListing, PartnerEventKind } from '../lib/guestApi';

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
                <span className="absolute top-3 left-3 rounded-full bg-white/85 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-[#111]">Partner</span>
              </div>
              <div className="p-4">
                <p className="text-[12px] text-on-surface-variant flex items-center gap-1"><Icon className="size-3.5" /> {CATEGORY[p.category]?.label ?? 'Local'}</p>
                <p className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-on-surface truncate">{p.name}</p>
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

function PartnerSheet({ partner, propertyName, onClose, onAction }: {
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

          <p className="text-[12px] text-on-surface-variant">
            A local business Cabadra partners with. You deal with them directly; {propertyName} isn’t involved and nothing about you is shared.
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
