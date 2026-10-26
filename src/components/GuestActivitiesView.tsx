import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Check, Search, Sparkles } from 'lucide-react';
import type { AppView } from '../types';
import type { GuestExperience } from '../lib/guestApi';
import { formatCurrency } from '../lib/currency';
import { useBackToClose } from '../hooks/useBackToClose';
import { ExperienceBookingSheet } from './ExperienceBookingSheet';

const FALLBACK_EXPERIENCE_IMAGE = 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80';

/**
 * Everything the hotel has listed to do, on one screen, reached from "See
 * all" on the home screen. Booking works the same as from the home screen:
 * a request the hotel confirms, nothing charged here.
 */
export function GuestActivitiesView({ propertyName, experiences, currency, onNavigate, onBookExperience }: {
  propertyName: string;
  experiences: GuestExperience[];
  currency: string;
  onNavigate: (view: AppView) => void;
  onBookExperience: (name: string, price: number, guestCount?: number, preferredTime?: string, notes?: string, unitLabel?: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [booking, setBooking] = useState<GuestExperience | null>(null);
  useBackToClose(!!booking, () => setBooking(null));
  const [toast, setToast] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return experiences;
    return experiences.filter(e => `${e.name} ${e.description}`.toLowerCase().includes(q));
  }, [experiences, query]);

  return (
    <div className="w-full min-h-screen bg-surface pb-28">
      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
          <button onClick={() => onNavigate('guest_home')} aria-label="Back" className="w-10 h-10 rounded-full bg-surface-container-lowest shadow-sm flex items-center justify-center text-on-surface">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-on-surface leading-tight">Things to do</h1>
            <p className="text-xs text-on-surface-variant truncate">Arranged by {propertyName}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        {experiences.length > 4 && (
          <label className="flex items-center gap-2 h-11 px-4 rounded-full bg-surface-container-lowest shadow-sm">
            <Search className="w-4 h-4 text-on-surface-variant" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search activities" className="flex-1 bg-transparent text-sm text-on-surface focus:outline-none" />
          </label>
        )}

        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-2xl bg-success text-on-success px-4 py-3 flex items-center gap-3 shadow-lg">
              <Check className="w-5 h-5 shrink-0" />
              <p className="text-sm font-semibold">{toast}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {shown.length === 0 ? (
          <div className="py-16 text-center text-on-surface-variant">
            <span className="w-12 h-12 rounded-full bg-surface-container-lowest flex items-center justify-center mx-auto"><Sparkles className="w-5 h-5" /></span>
            <p className="text-sm font-semibold text-on-surface mt-3">{experiences.length ? 'Nothing matches that' : 'Nothing listed yet'}</p>
            <p className="text-xs mt-1">Ask the front desk what’s on nearby.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {shown.map((exp, i) => (
              <motion.button
                key={exp.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setBooking(exp)}
                className="rounded-[28px] bg-surface-container-lowest overflow-hidden text-left hover:shadow-[0_18px_50px_rgba(0,0,0,0.08)] transition-shadow duration-300"
              >
                <div className="relative h-44 bg-surface-container-high">
                  <img src={exp.image || FALLBACK_EXPERIENCE_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <span className="absolute bottom-3 left-3 text-xs font-semibold bg-white/90 text-black rounded-full px-3 py-1">
                    {formatCurrency(exp.price, currency)} <span className="font-normal">{exp.unitLabel}</span>
                  </span>
                </div>
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-on-surface">{exp.name}</p>
                    {exp.description && <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{exp.description}</p>}
                  </div>
                  <span className="h-9 px-4 rounded-full bg-primary text-on-primary text-xs font-semibold flex items-center shrink-0">Book</span>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </main>

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
              setToast(`${booking.name}: the hotel will confirm your time`);
              setTimeout(() => setToast(null), 4000);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
