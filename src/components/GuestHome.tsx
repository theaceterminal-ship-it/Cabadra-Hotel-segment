import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AppView, GuestExperienceBooking } from '../types';
import { GuestExperience, GuestServiceCategory, GuestTransportRoute, fetchGuestExperienceBookings } from '../lib/guestApi';
import { formatCurrency } from '../lib/currency';
import type { Department } from '../lib/departments';
import { DynamicIslandStatusBar } from './DynamicIslandStatusBar';
import { ServiceRequestSheet } from './ServiceRequestSheet';
import { ExperienceBookingSheet } from './ExperienceBookingSheet';
import {
  ArrowRight, BedDouble, Calendar, Car, ChefHat, Check, ChevronRight, Clock, Compass, ConciergeBell,
  Flower2, Shirt, Sparkles, UtensilsCrossed, Wrench,
} from 'lucide-react';

interface GuestHomeProps {
  token: string;
  propertyName: string;
  /** The property's own photo (Owner > Overview > Cover photo); a generic hotel image until one is set. */
  propertyImage?: string;
  roomNumber: string;
  guestName: string;
  isVip: boolean;
  currency: string;
  /** Owner-managed (Experiences tab). Shown in the welcome card's carousel and "What else to do here". */
  experiences: GuestExperience[];
  /** Owner-managed (Services tab), each with its own request form (0075). */
  serviceCategories: GuestServiceCategory[];
  /** Routes behind the transport services' route picker. */
  transportRoutes: GuestTransportRoute[];
  onNavigate: (view: AppView) => void;
  /** guest_book_experience — the hotel confirms; nothing is charged here. */
  onBookExperience: (name: string, price: number, guestCount?: number, preferredTime?: string, notes?: string, unitLabel?: string) => Promise<void>;
}

const FALLBACK_HOTEL_IMAGE = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80';
const FALLBACK_DINING_IMAGE = 'https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&w=1200&q=80';
const FALLBACK_EXPERIENCE_IMAGE = 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80';

const TEAM_ICONS: Record<Department, typeof Sparkles> = {
  front_desk: ConciergeBell, housekeeping: BedDouble, maintenance: Wrench, concierge: Compass,
  laundry: Shirt, spa: Flower2, transport: Car, kitchen: ChefHat,
};

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay: 0.06 * i, ease: [0.22, 1, 0.36, 1] as const } }),
};

function greeting(hour: number) {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The guest's home screen. The hotel's name lives in the welcome card (not
 * squeezed into a corner); the top bar carries the room and the live status
 * pill. Things to do sit inside the welcome card as an auto-sliding
 * carousel, where every guest sees them, and again lower down with a link to
 * the full list (GuestActivitiesView).
 */
export const GuestHome: React.FC<GuestHomeProps> = ({
  token, propertyName, propertyImage, roomNumber, guestName, isVip, currency,
  experiences, serviceCategories, transportRoutes, onNavigate, onBookExperience,
}) => {
  const [activeService, setActiveService] = useState<GuestServiceCategory | null>(null);
  const [booking, setBooking] = useState<GuestExperience | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reserved, setReserved] = useState<GuestExperienceBooking[]>([]);
  const firstName = guestName.trim().split(/\s+/)[0] || guestName;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => fetchGuestExperienceBookings(token).then(d => { if (!cancelled) setReserved(d); }).catch(() => {});
    load();
    const interval = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  const showToast = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <div id="guest-home-canvas" className="w-full min-h-screen bg-surface pb-28">
      <header className="sticky top-0 z-30 px-4 pt-3 pb-3 bg-gradient-to-b from-surface via-surface/90 to-surface/0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="h-10 pl-2 pr-3.5 rounded-full bg-surface-container-lowest/90 backdrop-blur-md border border-white/60 shadow-sm flex items-center gap-2 text-on-surface shrink-0">
            <span className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center"><BedDouble className="w-4 h-4" /></span>
            <span className="text-[13px] font-semibold">Room {roomNumber}</span>
            {isVip && <span className="text-[10px] font-bold text-room-vip">VIP</span>}
          </div>
          <DynamicIslandStatusBar token={token} currency={currency} roomNumber={roomNumber} className="min-w-0 flex justify-end" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 space-y-8">
        <WelcomeCard
          propertyName={propertyName}
          propertyImage={propertyImage}
          firstName={firstName}
          experiences={experiences}
          currency={currency}
          onPick={setBooking}
          onSeeAll={() => onNavigate('guest_activities')}
        />

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-2xl bg-success text-on-success px-4 py-3 flex items-center gap-3 shadow-lg"
            >
              <Check className="w-5 h-5 shrink-0" />
              <p className="text-sm font-semibold">{toast}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <section id="at-your-service-section">
          <motion.h2 variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} className="text-xl font-bold text-on-surface mb-3 px-1">
            At your service
          </motion.h2>

          <motion.button
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onNavigate('room_dining')}
            id="service-card-dining"
            className="relative w-full h-48 rounded-[28px] overflow-hidden text-left shadow-md group"
          >
            <img src={FALLBACK_DINING_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-3 text-white">
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-white/20 backdrop-blur rounded-full px-2.5 py-1">
                  <UtensilsCrossed className="w-3.5 h-3.5" /> In-room dining
                </span>
                <p className="text-2xl font-bold mt-2 leading-tight">Hungry? We’ll bring it up.</p>
              </div>
              <span className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shrink-0 transition-transform group-hover:translate-x-0.5">
                <ArrowRight className="w-5 h-5" />
              </span>
            </div>
          </motion.button>

          {(serviceCategories ?? []).length > 0 && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              {serviceCategories.map((cat, i) => {
                const Icon = TEAM_ICONS[cat.department] ?? Sparkles;
                return (
                  <motion.button
                    key={cat.id}
                    id={`service-card-${cat.id}`}
                    custom={i}
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setActiveService(cat)}
                    className="rounded-[24px] bg-surface-container-lowest p-4 text-left shadow-sm hover:shadow-md transition-shadow flex flex-col items-start justify-start"
                  >
                    <span className="w-10 h-10 rounded-full bg-highlight text-on-highlight flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </span>
                    <p className="text-sm font-bold text-on-surface mt-3 leading-snug">{cat.name}</p>
                    {cat.description && <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{cat.description}</p>}
                  </motion.button>
                );
              })}
            </div>
          )}
        </section>

        {reserved.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-on-surface mb-3 px-1">Your bookings</h2>
            <div className="rounded-[24px] bg-surface-container-lowest divide-y divide-outline-variant shadow-sm overflow-hidden">
              {reserved.map(b => {
                const confirmed = b.status === 'confirmed';
                return (
                  <div key={b.id} className="flex items-center gap-3 p-4">
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${confirmed ? 'bg-success text-on-success' : 'bg-surface-container-low text-on-surface-variant'}`}>
                      {confirmed ? <Calendar className="w-4.5 h-4.5" /> : <Clock className="w-4.5 h-4.5" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-on-surface truncate">{b.experienceName}</p>
                      <p className="text-xs text-on-surface-variant truncate">
                        {b.scheduledTime ? `Confirmed for ${b.scheduledTime}` : b.status === 'cancelled' ? 'Cancelled' : b.status === 'completed' ? 'Completed' : `Waiting for the hotel to confirm${b.preferredTime ? ` · you asked for ${b.preferredTime}` : ''}`}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-on-surface shrink-0">{formatCurrency(b.totalPrice, currency)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {experiences.length > 0 && (
          <section id="curated-experiences-section">
            <div className="flex items-end justify-between mb-3 px-1">
              <div>
                <h2 className="text-xl font-bold text-on-surface">What else to do here</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">Arranged by {propertyName}</p>
              </div>
              <button onClick={() => onNavigate('guest_activities')} className="text-sm font-semibold text-on-surface inline-flex items-center gap-0.5">
                See all <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 pb-2 -mx-4 px-4 scrollbar-none">
              {experiences.map((exp, i) => (
                <motion.button
                  key={exp.id}
                  id={`exp-card-${exp.id}`}
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setBooking(exp)}
                  className="snap-start shrink-0 w-[70%] sm:w-64 rounded-[24px] bg-surface-container-lowest overflow-hidden text-left shadow-sm"
                >
                  <div className="h-36 bg-surface-container-high">
                    <img src={exp.image || FALLBACK_EXPERIENCE_IMAGE} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-bold text-on-surface truncate">{exp.name}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{formatCurrency(exp.price, currency)} {exp.unitLabel}</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </section>
        )}
      </main>

      {activeService && (
        <ServiceRequestSheet
          token={token}
          service={activeService}
          routes={transportRoutes}
          currency={currency}
          onClose={() => setActiveService(null)}
          onSent={name => showToast(`${name}: request sent`)}
        />
      )}

      <AnimatePresence>
        {booking && (
          <ExperienceBookingSheet
            key={booking.id}
            experience={booking}
            currency={currency}
            onClose={() => setBooking(null)}
            onBook={async (guests, when, notes) => {
              await onBookExperience(booking.name, booking.price, guests, when, notes, booking.unitLabel);
              setBooking(null);
              showToast(`${booking.name}: the hotel will confirm your time`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * The welcome card: the hotel's photo and name, the guest's greeting, and
 * (when the hotel lists any) a swipeable carousel of things to do that
 * advances on its own until the guest touches it.
 */
function WelcomeCard({ propertyName, propertyImage, firstName, experiences, currency, onPick, onSeeAll }: {
  propertyName: string;
  propertyImage?: string;
  firstName: string;
  experiences: GuestExperience[];
  currency: string;
  onPick: (exp: GuestExperience) => void;
  onSeeAll: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const pausedUntil = useRef(0);
  const now = new Date();
  const slides = experiences.slice(0, 6);

  // Auto-advance every 4.5s; any touch or scroll by the guest pauses it for 10s.
  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => {
      const track = trackRef.current;
      if (!track || Date.now() < pausedUntil.current) return;
      const next = (index + 1) % slides.length;
      const card = track.children[next] as HTMLElement | undefined;
      if (card) track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' });
    }, 4500);
    return () => clearInterval(timer);
  }, [index, slides.length]);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const width = (track.children[0] as HTMLElement | undefined)?.offsetWidth ?? 1;
    setIndex(Math.round(track.scrollLeft / (width + 10)));
  };

  return (
    <motion.section
      id="guest-hero-banner"
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative rounded-[32px] overflow-hidden shadow-xl bg-surface-container-high"
    >
      <motion.img
        src={propertyImage || FALLBACK_HOTEL_IMAGE}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        initial={{ scale: 1.08 }}
        animate={{ scale: 1 }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/25 to-black/80" />

      <div className="relative px-5 pt-5 pb-5 text-white">
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="inline-flex text-[12px] font-medium bg-white/15 backdrop-blur rounded-full px-3 py-1">
          Welcome to {propertyName}
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="text-[34px] leading-[1.05] font-bold tracking-tight mt-3">
          {greeting(now.getHours())},<br />{firstName}
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="text-sm text-white/80 mt-2">
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </motion.p>

        {slides.length > 0 ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5 }} className="mt-8">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[13px] font-semibold text-white/90 inline-flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Things to do here</p>
              <button onClick={onSeeAll} className="text-[13px] font-semibold text-white inline-flex items-center gap-0.5">See all <ChevronRight className="w-4 h-4" /></button>
            </div>
            <div
              ref={trackRef}
              onScroll={onScroll}
              onPointerDown={() => { pausedUntil.current = Date.now() + 10_000; }}
              onTouchStart={() => { pausedUntil.current = Date.now() + 10_000; }}
              className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-px-1 scrollbar-none -mx-1 px-1"
            >
              {slides.map(exp => (
                <button
                  key={exp.id}
                  onClick={() => onPick(exp)}
                  className={`snap-start shrink-0 ${slides.length > 1 ? 'w-[86%]' : 'w-full'} flex items-center gap-3 rounded-[22px] bg-white/15 backdrop-blur-md border border-white/25 p-2.5 text-left`}
                >
                  <img src={exp.image || FALLBACK_EXPERIENCE_IMAGE} alt="" className="w-16 h-16 rounded-[16px] object-cover shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold truncate">{exp.name}</span>
                    {exp.description && <span className="block text-xs text-white/80 truncate mt-0.5">{exp.description}</span>}
                    <span className="block text-xs font-semibold mt-1">{formatCurrency(exp.price, currency)} <span className="font-normal text-white/75">{exp.unitLabel}</span></span>
                  </span>
                  <span className="h-8 px-3 rounded-full bg-white text-black text-xs font-bold flex items-center shrink-0">Book</span>
                </button>
              ))}
            </div>
            {slides.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-3">
                {slides.map((s, i) => (
                  <motion.span key={s.id} animate={{ width: i === index ? 18 : 6, opacity: i === index ? 1 : 0.5 }} className="h-1.5 rounded-full bg-white" />
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <p className="mt-10 text-sm text-white/85">Your stay, our priority. Ask for anything below.</p>
        )}
      </div>
    </motion.section>
  );
}
