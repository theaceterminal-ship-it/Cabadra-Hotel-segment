import React, { useEffect, useState } from 'react';
import { AppView, GuestExperienceBooking } from '../types';
import { GuestExperience, GuestServiceCategory, GuestTransportRoute, fetchGuestExperienceBookings } from '../lib/guestApi';
import { formatCurrency } from '../lib/currency';
import { DynamicIslandStatusBar } from './DynamicIslandStatusBar';
import { ServiceRequestSheet } from './ServiceRequestSheet';
import {
  Utensils,
  Sparkles,
  Car,
  BedDouble,
  Bed,
  Wine,
  Clock,
  MapPin,
  Check,
  Calendar,
  X,
  Compass,
  Heart,
  Wrench,
  MessageCircle,
} from 'lucide-react';

interface GuestHomeProps {
  token: string;
  propertyName: string;
  /** The property's own uploaded photo (Owner > Overview > Property Photo). Falls back to a generic hotel image when the owner hasn't set one yet. */
  propertyImage?: string;
  roomNumber: string;
  guestName: string;
  isVip: boolean;
  currency: string;
  /** Owner-managed via the Experiences tab — empty until they add one, no more hardcoded demo cards. */
  experiences: GuestExperience[];
  /** Owner-managed via the Services tab (0018_service_categories.sql) — replaces the old fixed Housekeeping/Amenities/Spa/Transfers grid, since not every property offers the same things. */
  serviceCategories: GuestServiceCategory[];
  /** The route catalog behind any 'transportation'-type service category — a guest picks from these instead of typing a destination out by hand. */
  transportRoutes: GuestTransportRoute[];
  onNavigate: (view: AppView) => void;
  /** Real submission (guest_book_experience) for the curated-experience "Reserve Now" buttons. */
  onBookExperience: (name: string, price: number, guestCount?: number, preferredTime?: string, notes?: string, unitLabel?: string) => Promise<void>;
}

const SERVICE_ICONS: Record<string, typeof Sparkles> = {
  bed: BedDouble, sparkles: Sparkles, heart: Heart, car: Car, wrench: Wrench, message: MessageCircle,
};
function serviceIconFor(key: string) {
  return SERVICE_ICONS[key] ?? Compass;
}

export const GuestHome: React.FC<GuestHomeProps> = ({
  token,
  propertyName,
  propertyImage,
  roomNumber,
  guestName,
  isVip,
  currency,
  experiences,
  serviceCategories,
  transportRoutes,
  onNavigate,
  onBookExperience,
}) => {
  const [activeModal, setActiveModal] = useState<GuestServiceCategory | null>(null);
  const [bookedExperience, setBookedExperience] = useState<string | null>(null);
  const [selectedExperience, setSelectedExperience] = useState<GuestExperience | null>(null);
  const [guestCount, setGuestCount] = useState<number>(1);
  const [preferredTime, setPreferredTime] = useState<string>('');
  const [bookingNotes, setBookingNotes] = useState<string>('');
  const [submittingExperience, setSubmittingExperience] = useState(false);
  const [reservedBookings, setReservedBookings] = useState<GuestExperienceBooking[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const loadReserved = () => {
      fetchGuestExperienceBookings(token)
        .then(data => { if (!cancelled) setReservedBookings(data); })
        .catch(() => {});
    };
    loadReserved();
    const interval = setInterval(loadReserved, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  // A live clock in the hero — small touch, but it's the first thing a
  // guest sees, and "what time is it right now, at this hotel" is a real
  // question when you've just landed somewhere with jet lag.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleBookExperience = async (title: string, price: number) => {
    try {
      await onBookExperience(title, price);
      setBookedExperience(title);
      setTimeout(() => setBookedExperience(null), 4000);
    } catch (err) {
      console.warn('Failed to book experience:', err);
    }
  };

  const nameParts = propertyName.trim().split(/\s+/);
  const firstWord = nameParts[0] || propertyName;
  const restOfName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

  return (
    <div id="guest-home-canvas" className="w-full min-h-screen bg-surface pb-24">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pt-4 sm:pt-6 space-y-5">
        {/* Top Header Bar: Hotel Name on Left (Break after first word), Dynamic Island Status Bar on Right */}
        <header className="flex flex-nowrap items-center justify-between gap-2 sm:gap-4 w-full px-1 py-1">
          <div className="min-w-0 flex-1 shrink">
            <h1 className="text-white tracking-tight drop-shadow-sm">
              <span className="block text-xl sm:text-2xl font-black leading-tight truncate">{firstWord}</span>
              {restOfName && (
                <span className="block text-xs sm:text-sm font-bold text-white/90 leading-tight truncate mt-0.5">
                  {restOfName}
                </span>
              )}
            </h1>
          </div>

          <div className="shrink-0 flex items-center justify-end">
            <DynamicIslandStatusBar token={token} currency={currency} roomNumber={roomNumber} className="relative z-30 flex flex-col items-end shrink-0" />
          </div>
        </header>

        {/* Booking Notification Toast */}
        {bookedExperience && (
          <div className="bg-success text-on-success p-4 rounded-xl shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
            <Check className="w-5 h-5 shrink-0" />
            <p className="text-xs font-semibold">
              Reservation requested for <strong>{bookedExperience}</strong>! Our concierge is confirming details.
            </p>
          </div>
        )}

        {/* Hero Card Box */}
        <section
          id="guest-hero-banner"
          className="relative rounded-[32px] overflow-hidden h-72 sm:h-80 md:h-[360px] shadow-xl group border border-outline-variant/40 bg-surface-container-high opacity-100"
        >
          {propertyImage ? (
            <img
              src={propertyImage}
              alt={propertyName}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-100"
            />
          ) : (
            <div
              className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-700 opacity-100"
              style={{
                backgroundImage: `url('https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80')`,
              }}
            />
          )}

          {/* Gradient Overlay for Text Contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-100" />

          {/* Welcome Text Box Content (Bottom Left) */}
          <div className="absolute bottom-6 left-6 sm:bottom-8 sm:left-8 right-6 text-white max-w-lg">
            <p className="text-xs sm:text-sm font-extrabold tracking-widest uppercase text-white/90">
              WELCOME,
            </p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-none mt-1 drop-shadow-md">
              {guestName}{isVip ? ' ✦' : ''}
            </h2>

            {/* Gold/Amber Accent Bar */}
            <div className="w-10 h-1 bg-amber-400 rounded-full my-3 shadow-xs" />

            <p className="text-sm sm:text-base font-semibold text-white drop-shadow-sm">
              Your stay, our priority.
            </p>

            {/* Room Pill */}
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-black/70 backdrop-blur-md border border-white/30 text-white shadow-lg mt-4 opacity-100">
              <Bed className="w-4 h-4 text-white shrink-0" />
              <span className="text-xs sm:text-sm font-bold tracking-wide">
                Room {roomNumber}{isVip ? ' • VIP' : ''}
              </span>
            </div>
          </div>
        </section>

        {/* Category Grid (Bento Style) */}
        <section id="at-your-service-section" className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-xl font-bold text-on-surface">At Your Service</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Room Dining (Large 2x2 Bento card) */}
            <div
              id="service-card-dining"
              onClick={() => onNavigate('room_dining')}
              className="col-span-2 row-span-2 relative rounded-2xl overflow-hidden cursor-pointer group shadow-sm border border-outline-variant hover:shadow-md transition-all h-60 md:h-80 opacity-100"
            >
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105 opacity-100"
                style={{ 
                  backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuDFn_TeCi5piq666qSWt3Hro67LM4aqJ3KOdCqcFwqj8IEsLL71l8pBEB0NAnUCJ1VetsgipFB4eIYXBUv4plasCoux9XaBg5ik93465PeiTVB4IeF8AUK983CQ9arBB9nZCHCDSEduj6yBSIPDvkHUtJ-LkkW2QTv-SelsUmKzC9aaeVY4FIUsVs6IlKfACSjlKXtcYIQm_-VC6aE-6sTLm5kW2FWww-KStayTJXgRSxrXYooZOu1e')`
                }}
              ></div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent opacity-100"></div>
              
              <div className="absolute bottom-0 left-0 p-5 w-full text-white">
                <div className="p-2 bg-[#bd9b60] text-white rounded-lg w-fit mb-2 shadow-xs opacity-100">
                  <Utensils className="w-5 h-5" />
                </div>
                <h3 className="text-xl md:text-2xl font-bold drop-shadow-sm">Room Dining</h3>
                <p className="text-xs text-white mt-0.5 drop-shadow-xs">Explore our curated chef specialities &amp; beverages.</p>
              </div>
            </div>

            {/* Owner-managed (Services tab) — not every property offers the same things, so this is no longer a fixed four cards. */}
            {(serviceCategories ?? []).map(cat => {
              const Icon = serviceIconFor(cat.iconKey);
              return (
                <div
                  key={cat.id}
                  id={`service-card-${cat.id}`}
                  onClick={() => setActiveModal(cat)}
                  className="col-span-1 relative rounded-2xl overflow-hidden cursor-pointer group shadow-sm border border-outline-variant hover:shadow-md transition-all h-36 md:h-38 bg-surface-container-lowest hover:bg-surface-container-low flex flex-col items-center justify-center p-4 text-center opacity-100"
                >
                  <div className="bg-primary/10 rounded-full p-3 mb-2 text-primary group-hover:scale-110 transition-transform opacity-100">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-on-surface">{cat.name}</h3>
                  {cat.description && <p className="text-[11px] text-on-surface-variant mt-0.5">{cat.description}</p>}
                </div>
              );
            })}
          </div>
        </section>

        {/* Guest's Active Reserved Experiences Live Status Banner */}
        {reservedBookings.length > 0 && (
          <section id="your-reserved-experiences-section" className="space-y-3 pt-2 animate-in fade-in duration-300">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <span>Your Experience Reservations ({reservedBookings.length})</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {reservedBookings.map(b => (
                <div
                  key={b.id}
                  className="p-4 rounded-2xl border border-outline-variant/60 bg-surface-container-lowest shadow-sm flex flex-col justify-between space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-on-surface">{b.experienceName}</h3>
                      <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">
                        {b.guestCount} Guests ({b.unitLabel || 'per person'}) · {formatCurrency(b.totalPrice, currency)}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold capitalize shrink-0 ${
                        b.status === 'confirmed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : b.status === 'completed'
                          ? 'bg-blue-100 text-blue-800'
                          : b.status === 'cancelled'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {b.status === 'confirmed'
                        ? '🗓️ Confirmed'
                        : b.status === 'pending' || b.status === 'requested'
                        ? '⏳ Concierge Reviewing'
                        : b.status}
                    </span>
                  </div>

                  {b.scheduledTime ? (
                    <div className="flex items-center gap-1.5 p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-xs font-bold border border-emerald-200/60">
                      <Calendar className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span>Scheduled Slot: {b.scheduledTime}</span>
                    </div>
                  ) : b.preferredTime ? (
                    <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Requested Slot: {b.preferredTime}</span>
                    </div>
                  ) : null}

                  {b.notes && (
                    <p className="text-[11px] text-on-surface-variant italic bg-surface-container-low p-2 rounded-lg">
                      "{b.notes}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Featured Curated Experiences — matching Hero Greeting Box Design Language */}
        {(experiences ?? []).length > 0 && (
          <section id="curated-experiences-section" className="space-y-4 pt-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xl font-bold text-on-surface">Curated For You</h2>
              <span className="text-xs font-semibold text-primary">Exclusive Experiences</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {experiences.map((exp) => (
                <div
                  key={exp.id}
                  id={`exp-card-${exp.id}`}
                  className="relative rounded-[28px] overflow-hidden h-72 sm:h-80 shadow-lg group border border-outline-variant/40 bg-surface-container-high transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl opacity-100"
                >
                  {/* Full-bleed Background Experience Image */}
                  {exp.image ? (
                    <img
                      src={exp.image}
                      alt={exp.name}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-100"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 bg-cover bg-center group-hover:scale-105 transition-transform duration-700 opacity-100"
                      style={{
                        backgroundImage: `url('https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80')`,
                      }}
                    />
                  )}

                  {/* Gradient Overlay for Text Contrast */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-100" />

                  {/* Top-Right Price Tag Pill */}
                  <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-md rounded-full px-3.5 py-1.5 text-white border border-white/30 shadow-md opacity-100">
                    <span className="text-xs sm:text-sm font-extrabold text-amber-300">
                      {formatCurrency(exp.price, currency)}
                    </span>
                    <span className="text-[10px] text-white font-medium ml-1">
                      {exp.unitLabel}
                    </span>
                  </div>

                  {/* Bottom Content Card (Matching Greeting Box) */}
                  <div className="absolute bottom-5 left-5 right-5 text-white flex flex-col justify-end">
                    <p className="text-[11px] font-extrabold tracking-widest uppercase text-amber-300">
                      CURATED EXPERIENCE
                    </p>
                    <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight mt-0.5 drop-shadow-sm">
                      {exp.name}
                    </h3>

                    {/* Gold Accent Bar */}
                    <div className="w-8 h-1 bg-amber-400 rounded-full my-2 shadow-2xs" />

                    {exp.description && (
                      <p className="text-xs sm:text-sm font-semibold text-white line-clamp-2 leading-snug drop-shadow-xs">
                        {exp.description}
                      </p>
                    )}

                    {/* Reserve Action Button */}
                    <div className="pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedExperience(exp);
                          setGuestCount(1);
                          setPreferredTime('');
                          setBookingNotes('');
                        }}
                        className="px-5 py-2.5 rounded-full bg-primary text-on-primary text-xs font-extrabold hover:bg-primary-hover transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2 opacity-100"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Reserve Now</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Service request — the owner's form for this service (0075): options, route, time, note */}
      {activeModal && (
        <ServiceRequestSheet
          token={token}
          service={activeModal}
          routes={transportRoutes}
          currency={currency}
          onClose={() => setActiveModal(null)}
          onSent={name => {
            setBookedExperience(name);
            setTimeout(() => setBookedExperience(null), 4000);
          }}
        />
      )}

      {/* Experience Booking Modal with Guest Count & Preferred Schedule */}
      {selectedExperience && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-surface-container-lowest rounded-2xl max-w-md w-full p-6 shadow-2xl border border-outline-variant space-y-4">
            <div className="flex justify-between items-start pb-3 border-b border-outline-variant">
              <div>
                <h3 className="text-lg font-bold text-on-surface">{selectedExperience.name}</h3>
                <p className="text-xs text-primary font-bold">{formatCurrency(selectedExperience.price, currency)} {selectedExperience.unitLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExperience(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {selectedExperience.image && (
              <div className="h-36 w-full rounded-xl overflow-hidden bg-surface-container-low border border-outline-variant">
                <img src={selectedExperience.image} alt={selectedExperience.name} className="w-full h-full object-cover" />
              </div>
            )}

            {selectedExperience.description && (
              <p className="text-xs text-on-surface-variant leading-relaxed">{selectedExperience.description}</p>
            )}

            {/* Party Size Selector */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-on-surface block">Number of Guests / Party Size</label>
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-outline-variant rounded-xl bg-surface-container-low overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setGuestCount(g => Math.max(1, g - 1))}
                    className="w-10 h-10 flex items-center justify-center text-lg font-bold hover:bg-surface-container-high transition-colors cursor-pointer text-on-surface"
                  >
                    -
                  </button>
                  <span className="w-12 text-center text-sm font-extrabold text-on-surface">{guestCount}</span>
                  <button
                    type="button"
                    onClick={() => setGuestCount(g => g + 1)}
                    className="w-10 h-10 flex items-center justify-center text-lg font-bold hover:bg-surface-container-high transition-colors cursor-pointer text-on-surface"
                  >
                    +
                  </button>
                </div>
                <span className="text-xs font-semibold text-on-surface-variant">
                  ({selectedExperience.unitLabel || 'per person'})
                </span>
              </div>
            </div>

            {/* Preferred Date & Time */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-on-surface block">Preferred Date &amp; Time (Optional)</label>
              <input
                type="text"
                value={preferredTime}
                onChange={e => setPreferredTime(e.target.value)}
                placeholder="e.g. Today at 4:30 PM or Tomorrow morning"
                className="w-full h-10 px-3 text-xs border border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container-lowest"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-on-surface block">Special Requests or Preferences (Optional)</label>
              <textarea
                value={bookingNotes}
                onChange={e => setBookingNotes(e.target.value)}
                placeholder="e.g. Dietary preferences, surprise setup..."
                rows={2}
                className="w-full p-2.5 text-xs border border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container-lowest resize-none"
              />
            </div>

            {/* Total Price Summary */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
              <span className="text-xs font-bold text-primary">Estimated Total ({currency})</span>
              <span className="text-base font-extrabold text-primary">
                {formatCurrency(selectedExperience.price * guestCount, currency)}
              </span>
            </div>

            {/* Submit Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedExperience(null)}
                className="flex-1 h-10 rounded-xl border border-outline-variant text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingExperience}
                onClick={async () => {
                  setSubmittingExperience(true);
                  try {
                    await onBookExperience(
                      selectedExperience.name,
                      selectedExperience.price,
                      guestCount,
                      preferredTime,
                      bookingNotes,
                      selectedExperience.unitLabel
                    );
                    setBookedExperience(selectedExperience.name);
                    setSelectedExperience(null);
                    setTimeout(() => setBookedExperience(null), 5000);
                  } catch (err) {
                    console.warn('Failed to submit experience booking:', err);
                  } finally {
                    setSubmittingExperience(false);
                  }
                }}
                className="flex-1 h-10 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {submittingExperience ? 'Sending Request...' : 'Send Reservation Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
