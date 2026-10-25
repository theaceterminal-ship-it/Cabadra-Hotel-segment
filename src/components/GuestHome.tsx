import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AppView, GuestExperienceBooking } from '../types';
import { GuestExperience, GuestServiceCategory, GuestTransportRoute, fetchGuestExperienceBookings } from '../lib/guestApi';
import { formatCurrency } from '../lib/currency';
import type { Department } from '../lib/departments';
import { DynamicIslandStatusBar } from './DynamicIslandStatusBar';
import { ServiceRequestSheet } from './ServiceRequestSheet';
import { ExperienceBookingSheet } from './ExperienceBookingSheet';
import { LocalPartnersRow } from './LocalPartnersRow';
import {
  ArrowRight, ArrowUpRight, BedDouble, Calendar, Car, ChefHat, Check, Clock, Compass, ConciergeBell,
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
  /** Owner-managed (Experiences tab). Shown under "Things to do here". */
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

const EASE = [0.22, 1, 0.36, 1] as const;
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.07 * i, ease: EASE } }),
};
/** The site's card hover: no border, a soft wide shadow. */
const CARD_HOVER = 'hover:shadow-[0_18px_50px_rgba(0,0,0,0.08)] transition-shadow duration-300';

function greeting(hour: number) {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The site's section heading: a quiet eyebrow over a tight, large title. */
function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} className="flex items-end justify-between gap-3 mb-4 px-1">
      <div>
        <p className="text-sm font-medium text-on-surface-variant">{eyebrow}</p>
        <h2 className="mt-1 text-[28px] leading-[1.05] font-semibold tracking-[-0.03em] text-on-surface">{title}</h2>
      </div>
      {action}
    </motion.div>
  );
}

/**
 * The guest's home screen, in the public website's design language: fog
 * background, borderless white cards, ink pill buttons, glass panels over
 * photos. The hotel's name lives in the welcome card; the top bar carries
 * the room and the live status pill. Things to do and the guest's own
 * bookings sit together further down, with a link to the full list
 * (GuestActivitiesView).
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
    <div id="guest-home-canvas" className="w-full min-h-screen bg-surface text-on-surface pb-28">
      <header className="sticky top-0 z-30 px-4 pt-3 pb-4 bg-gradient-to-b from-surface via-surface/90 to-surface/0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="h-10 pl-1.5 pr-4 rounded-full bg-surface-container-lowest shadow-[0_4px_20px_rgba(0,0,0,0.06)] flex items-center gap-2 shrink-0">
            <span className="size-7 rounded-full bg-primary text-on-primary flex items-center justify-center"><BedDouble className="size-4" /></span>
            <span className="text-[14px] font-medium">Room {roomNumber}</span>
            {isVip && <span className="text-[10px] font-semibold rounded-full bg-room-ready text-room-ready-on px-1.5 py-0.5">VIP</span>}
          </div>
          <DynamicIslandStatusBar token={token} currency={currency} roomNumber={roomNumber} className="min-w-0 flex justify-end" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 space-y-12">
        <WelcomeCard propertyName={propertyName} propertyImage={propertyImage} firstName={firstName} roomNumber={roomNumber} />

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className="-mt-6 rounded-full bg-primary text-on-primary pl-2 pr-5 py-2 flex items-center gap-3 shadow-lg"
            >
              <span className="size-8 rounded-full bg-room-ready text-room-ready-on flex items-center justify-center shrink-0"><Check className="size-4" /></span>
              <p className="text-sm font-medium">{toast}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <section id="at-your-service-section">
          <SectionHeading eyebrow="Anything you need" title="At your service" />

          <motion.button
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            whileTap={{ scale: 0.985 }}
            onClick={() => onNavigate('room_dining')}
            id="service-card-dining"
            className="relative w-full h-60 rounded-[28px] overflow-hidden text-left group"
          >
            <img src={FALLBACK_DINING_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
            <div className="absolute inset-x-3 bottom-3 rounded-3xl border border-white/40 bg-white/25 backdrop-blur-xl p-3 pl-4 flex items-center gap-3 text-white shadow-[0_8px_40px_rgba(0,0,0,0.12)]">
              <span className="size-10 shrink-0 rounded-full bg-white/90 text-[#111] flex items-center justify-center"><UtensilsCrossed className="size-[18px]" /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] text-white/85">In-room dining</span>
                <span className="block text-[17px] font-medium truncate">Hungry? We’ll bring it up.</span>
              </span>
              <span className="size-10 shrink-0 rounded-full bg-[#111] text-white flex items-center justify-center transition-transform duration-300 group-hover:translate-x-0.5">
                <ArrowRight className="size-[18px]" />
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
                    className={`group rounded-[28px] bg-surface-container-lowest p-5 text-left flex flex-col items-start ${CARD_HOVER}`}
                  >
                    <span className="w-full flex items-start justify-between">
                      <span className="size-11 rounded-full bg-surface flex items-center justify-center transition-colors duration-300 group-hover:bg-primary group-hover:text-on-primary">
                        <Icon className="size-5" />
                      </span>
                      <ArrowUpRight className="size-4 text-on-surface-variant opacity-0 -translate-x-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
                    </span>
                    <span className="mt-6 text-[15px] font-semibold tracking-[-0.01em] leading-snug">{cat.name}</span>
                    {cat.description && <span className="mt-1 text-[13px] text-on-surface-variant leading-snug line-clamp-2">{cat.description}</span>}
                  </motion.button>
                );
              })}
            </div>
          )}
        </section>

        {(experiences.length > 0 || reserved.length > 0) && (
          <section id="curated-experiences-section">
            <SectionHeading
              eyebrow={`Arranged by ${propertyName}`}
              title="Things to do here"
              action={experiences.length > 0 && (
                <button onClick={() => onNavigate('guest_activities')} className="h-9 px-4 rounded-full bg-surface-container-lowest text-sm font-medium inline-flex items-center gap-1 shrink-0 hover:bg-primary hover:text-on-primary transition-colors">
                  See all <ArrowRight className="size-3.5" />
                </button>
              )}
            />

            {reserved.length > 0 && (
              <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                className="rounded-[28px] bg-surface-container-lowest p-2 mb-3"
              >
                <p className="px-3 pt-2 pb-1 text-sm font-medium text-on-surface-variant">Your bookings</p>
                {reserved.map(b => {
                  const confirmed = b.status === 'confirmed';
                  return (
                    <div key={b.id} className="flex items-center gap-3 p-3 rounded-[20px] hover:bg-surface-container-low transition-colors">
                      <span className={`size-11 rounded-full flex items-center justify-center shrink-0 ${confirmed ? 'bg-room-ready text-room-ready-on' : 'bg-surface text-on-surface-variant'}`}>
                        {confirmed ? <Calendar className="size-[18px]" /> : <Clock className="size-[18px]" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium truncate">{b.experienceName}</p>
                        <p className="text-[13px] text-on-surface-variant truncate">
                          {b.scheduledTime ? `Confirmed for ${b.scheduledTime}` : b.status === 'cancelled' ? 'Cancelled' : b.status === 'completed' ? 'Completed' : `Waiting for the hotel to confirm${b.preferredTime ? ` · you asked for ${b.preferredTime}` : ''}`}
                        </p>
                      </div>
                      <span className="text-sm font-medium shrink-0">{formatCurrency(b.totalPrice, currency)}</span>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {experiences.length > 0 && (
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
                    whileTap={{ scale: 0.985 }}
                    onClick={() => setBooking(exp)}
                    className={`snap-start shrink-0 ${experiences.length > 1 ? 'w-[80%] sm:w-80' : 'w-full'} relative h-72 rounded-[28px] overflow-hidden text-left group`}
                  >
                    <img src={exp.image || FALLBACK_EXPERIENCE_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
                    <span className="absolute top-3 left-3 rounded-full bg-white/80 backdrop-blur px-3 py-1 text-[13px] font-medium text-[#111]">
                      {formatCurrency(exp.price, currency)} <span className="text-[#111]/60">{exp.unitLabel}</span>
                    </span>
                    <div className="absolute inset-x-3 bottom-3 rounded-3xl border border-white/40 bg-white/25 backdrop-blur-xl p-4 flex items-end gap-3 text-white shadow-[0_8px_40px_rgba(0,0,0,0.12)]">
                      <span className="flex-1 min-w-0">
                        <span className="block text-[17px] font-medium leading-tight">{exp.name}</span>
                        {exp.description && <span className="block text-[13px] text-white/85 mt-1 line-clamp-2">{exp.description}</span>}
                      </span>
                      <span className="h-9 px-4 rounded-full bg-[#111] text-white text-[13px] font-medium flex items-center shrink-0">Book</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* After the hotel's own things to do, never before them. */}
        <LocalPartnersRow token={token} propertyName={propertyName} />
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
 * The welcome card, built like the website's hero: the hotel's photo, a fog
 * wash at the top carrying the greeting in ink, and a glass panel at the
 * bottom with the room.
 */
function WelcomeCard({ propertyName, propertyImage, firstName, roomNumber }: {
  propertyName: string;
  propertyImage?: string;
  firstName: string;
  roomNumber: string;
}) {
  const now = new Date();

  return (
    <motion.section
      id="guest-hero-banner"
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, ease: EASE }}
      className="relative h-[360px] rounded-[32px] overflow-hidden bg-surface-container-high"
    >
      <motion.img
        src={propertyImage || FALLBACK_HOTEL_IMAGE}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 1.6, ease: 'easeOut' }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-surface/95 from-10% via-surface/50 via-35% to-transparent to-65%" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent" />

      <div className="relative h-full flex flex-col p-5">
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, ease: EASE }} className="text-sm font-medium text-on-surface-variant">
          Welcome to {propertyName}
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6, ease: EASE }} className="mt-2 text-[38px] leading-[1.02] font-semibold tracking-[-0.035em] text-on-surface">
          {greeting(now.getHours())},<br />{firstName}
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.7, ease: EASE }}
          className="mt-auto rounded-3xl border border-white/40 bg-white/25 backdrop-blur-xl p-3 flex items-center gap-3 text-white shadow-[0_8px_40px_rgba(0,0,0,0.12)]"
        >
          <span className="size-10 shrink-0 rounded-full bg-white/90 text-[#111] flex items-center justify-center"><BedDouble className="size-[18px]" /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] text-white/85">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <span className="block text-[15px] font-medium truncate">Room {roomNumber} · Checked in</span>
          </span>
          <span className="relative flex size-2.5 mr-1.5 shrink-0">
            <span className="absolute inset-0 rounded-full bg-room-ready animate-ping opacity-70" />
            <span className="relative size-2.5 rounded-full bg-room-ready" />
          </span>
        </motion.div>
      </div>
    </motion.section>
  );
}
