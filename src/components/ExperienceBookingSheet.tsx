import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Minus, Plus, X } from 'lucide-react';
import type { GuestExperience } from '../lib/guestApi';
import { formatCurrency } from '../lib/currency';

/**
 * Reserve an experience: party size, a preferred time and a note. The
 * request goes to the hotel to confirm (guest_book_experience prices it from
 * the hotel's own listing); nothing is charged here.
 */
export function ExperienceBookingSheet({ experience, currency, onClose, onBook }: {
  experience: GuestExperience;
  currency: string;
  onClose: () => void;
  onBook: (guestCount: number, preferredTime: string, notes: string) => Promise<void>;
}) {
  const [guests, setGuests] = useState(1);
  const [when, setWhen] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBook = async () => {
    setSending(true);
    setError(null);
    try {
      await onBook(guests, when.trim(), notes.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send your request.');
      setSending(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="w-full sm:max-w-md max-h-[92svh] flex flex-col bg-surface-container-lowest text-on-surface rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden"
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        exit={{ y: 80 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      >
        <div className="relative h-44 bg-surface-container-high shrink-0">
          {experience.image && <img src={experience.image} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-4 left-5 right-5 text-white">
            <h3 className="text-2xl font-bold leading-tight">{experience.name}</h3>
            <p className="text-sm text-white/85 mt-0.5">{formatCurrency(experience.price, currency)} {experience.unitLabel}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {experience.description && <p className="text-sm text-on-surface-variant leading-relaxed">{experience.description}</p>}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">How many?</p>
              <p className="text-xs text-on-surface-variant">{experience.unitLabel || 'per person'}</p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-surface-container-low p-1">
              <button type="button" onClick={() => setGuests(g => Math.max(1, g - 1))} aria-label="Fewer" className="w-9 h-9 rounded-full bg-surface-container-lowest flex items-center justify-center"><Minus className="w-4 h-4" /></button>
              <span className="w-6 text-center font-bold">{guests}</span>
              <button type="button" onClick={() => setGuests(g => Math.min(20, g + 1))} aria-label="More" className="w-9 h-9 rounded-full bg-surface-container-lowest flex items-center justify-center"><Plus className="w-4 h-4" /></button>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-semibold">When would suit you? <span className="font-normal text-on-surface-variant">(optional)</span></span>
            <input value={when} onChange={e => setWhen(e.target.value)} placeholder="Tomorrow morning, or today at 4 pm" className="mt-2 w-full h-11 px-4 rounded-2xl border border-outline-variant bg-surface-container-lowest text-sm focus:border-primary focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-semibold">Anything we should know? <span className="font-normal text-on-surface-variant">(optional)</span></span>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="A surprise, dietary needs…" className="mt-2 w-full p-3 rounded-2xl border border-outline-variant bg-surface-container-lowest text-sm resize-none focus:border-primary focus:outline-none" />
          </label>

          {error && <p className="text-xs text-error">{error}</p>}
        </div>

        <div className="p-5 border-t border-outline-variant shrink-0" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center justify-between text-sm mb-3">
            <span className="text-on-surface-variant">Estimated total</span>
            <span className="font-bold">{formatCurrency(experience.price * guests, currency)}</span>
          </div>
          <button onClick={handleBook} disabled={sending} className="w-full h-12 rounded-full bg-primary text-on-primary text-sm font-bold disabled:opacity-60">
            {sending ? 'Sending…' : 'Request to book'}
          </button>
          <p className="text-[11px] text-on-surface-variant text-center mt-2">The hotel confirms the time with you. You’re not charged now.</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
