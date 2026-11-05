import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bed, Building2, Check, Minus, Phone, Plus, Users, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { DateRangePicker, todayLocalIso } from '../components/DatePicker';
import { PhoneField } from '../components/PhoneField';
import { addDays } from '../components/bookings/bookingUtils';
import { formatCurrency } from '../lib/currency';
import {
  PublicBookingResult, PublicHotel, PublicRoomType, clock, createPublicBooking, fetchPublicHotel, searchPublicRooms, stayTotals,
} from '../lib/publicBookingApi';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { useSiteTheme } from '../hooks/useTheme';
import { usePageTitle } from './site/usePageTitle';

type Step = 1 | 2 | 3 | 4;
const STEPS = ['Dates', 'Room', 'Details'] as const;

const inputCls = 'w-full h-12 px-5 rounded-full border border-outline-variant bg-surface-container-lowest text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-on-surface focus:outline-none transition-colors';
const rangeCls = 'w-full h-12 px-5 rounded-full border border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:border-on-surface focus:outline-none flex items-center justify-between gap-2 text-left transition-colors';
const primaryBtn = 'w-full h-12 px-7 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50';
const card = 'rounded-[20px] bg-surface-container-lowest border border-outline-variant p-4 sm:p-5';
const labelCls = 'text-[13px] text-on-surface-variant block mb-1.5 pl-1';
const longDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86400000);

/**
 * A hotel's public booking page: /book/<slug>. No sign-in. Dates, then a room type, then the
 * guest's details; the booking is made as "pay at the hotel" and lands in Reception like any
 * other advance booking (0094). With ?embed=1 it runs inside the hotel's own website (book.js).
 */
export default function PublicBookingPage() {
  useSiteTheme();
  const { slug = '' } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const embed = params.get('embed') === '1';

  const today = todayLocalIso();
  const [hotel, setHotel] = useState<PublicHotel | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [checkIn, setCheckIn] = useState(addDays(today, 1));
  const [checkOut, setCheckOut] = useState(addDays(today, 3));
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState<PublicRoomType[]>([]);
  const [roomType, setRoomType] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicBookingResult | null>(null);
  const submitting = useRef(false);

  usePageTitle(hotel ? `Book ${hotel.name}` : 'Book your stay');

  useEffect(() => {
    if (!isSupabaseConfigured) { setHotel(null); return; }
    fetchPublicHotel(slug).then(setHotel).catch(e => { setLoadError(e.message); setHotel(null); });
  }, [slug]);

  const nights = nightsBetween(checkIn, checkOut);
  const picked = rooms.find(r => r.type === roomType);
  const currency = hotel?.currency ?? 'INR';
  const money = (n: number) => formatCurrency(n, currency);

  const closeEmbed = () => window.parent?.postMessage({ type: 'cabadra-booking-close' }, '*');

  // Keys pressed while this page has focus never reach the hotel's site, so Escape is passed up.
  useEffect(() => {
    if (!embed) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') window.parent?.postMessage({ type: 'cabadra-booking-close' }, '*'); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [embed]);

  const handleSearch = async () => {
    if (nights < 1) { setError('Check-out must be after check-in.'); return; }
    setBusy(true); setError(null);
    try {
      const found = await searchPublicRooms(slug, checkIn, checkOut, guests);
      setRooms(found);
      setRoomType(t => (found.some(r => r.type === t) ? t : ''));
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t check availability. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    if (name.trim().length < 2) { setError('Enter your name.'); return; }
    if (phone.replace(/\D/g, '').length < 10) { setError('Enter a phone number with at least 10 digits.'); return; }
    submitting.current = true;
    setBusy(true); setError(null);
    try {
      setResult(await createPublicBooking({ slug, roomType, checkIn, checkOut, guests, name: name.trim(), phone, email: email.trim(), notes: notes.trim() }));
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t make the booking. Try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const goTo = (n: Step) => { setError(null); setStep(n); };

  const shell = (children: React.ReactNode) => (
    <div className="w-full min-h-screen bg-surface flex justify-center px-4 sm:px-6 pt-6 pb-10">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );

  if (hotel === undefined) return shell(<p className="text-sm text-on-surface-variant text-center py-24">Loading…</p>);
  if (hotel === null) {
    return shell(
      <div className="text-center py-24 space-y-2">
        <p className="text-lg font-semibold text-on-surface">This booking link isn’t available</p>
        <p className="text-sm text-on-surface-variant">{loadError ?? 'Check the link, or contact the hotel directly.'}</p>
        {embed && <button onClick={closeEmbed} className="mt-4 h-11 px-6 rounded-full border border-outline-variant text-sm font-medium text-on-surface hover:bg-surface-container-low">Close</button>}
      </div>
    );
  }

  return shell(
    <>
      <div className="flex items-center gap-4">
        <span className="size-14 sm:size-16 shrink-0 rounded-2xl overflow-hidden bg-surface-container-lowest border border-outline-variant flex items-center justify-center text-on-surface-variant">
          {hotel.image ? <img src={hotel.image} alt="" className="size-full object-cover" /> : <Building2 className="size-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] sm:text-[28px] leading-tight font-semibold tracking-[-0.03em] text-on-surface truncate">{hotel.name}</h1>
          <p className="text-sm text-on-surface-variant mt-0.5 truncate">{hotel.location}</p>
        </div>
        {embed && (
          <button onClick={closeEmbed} aria-label="Close" className="size-10 shrink-0 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface">
            <X className="size-5" />
          </button>
        )}
      </div>

      {step < 4 && (
        <nav className="mt-5 flex rounded-full bg-surface-container p-1" aria-label="Booking steps">
          {STEPS.map((label, i) => {
            const n = (i + 1) as Step;
            const active = step === n;
            return (
              <button
                key={label}
                type="button"
                disabled={n >= step}
                onClick={() => goTo(n)}
                aria-current={active ? 'step' : undefined}
                className={`relative flex-1 h-9 rounded-full text-sm font-medium transition-colors ${active ? 'text-on-primary' : 'text-on-surface-variant'}`}
              >
                {active && <motion.span layoutId="booking-step-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', damping: 30, stiffness: 380 }} />}
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          className="mt-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {step === 1 && (
            <div className="space-y-3">
              <div className={card}>
                <span className={labelCls}>Your stay</span>
                <DateRangePicker
                  start={checkIn}
                  end={checkOut}
                  min={today}
                  showNights
                  compact
                  startLabel="Check-in"
                  endLabel="Check-out"
                  onChange={(a, b) => { setCheckIn(a); setCheckOut(b); setError(null); }}
                  className={rangeCls}
                />
                <span className={`${labelCls} mt-4`}>Guests</span>
                <div className="h-12 rounded-full border border-outline-variant flex items-center justify-between px-2">
                  <button type="button" aria-label="Fewer guests" onClick={() => setGuests(g => Math.max(1, g - 1))} className="size-8 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container"><Minus className="size-4" /></button>
                  <span className="text-sm font-medium text-on-surface">{guests}</span>
                  <button type="button" aria-label="More guests" onClick={() => setGuests(g => Math.min(8, g + 1))} className="size-8 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container"><Plus className="size-4" /></button>
                </div>
                {error && <p className="text-[13px] text-error pl-1 mt-3">{error}</p>}
              </div>
              <button onClick={handleSearch} disabled={busy} className={primaryBtn}>{busy ? 'Checking…' : 'See available rooms'}</button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-[13px] text-on-surface-variant pl-1">{longDay(checkIn)} to {longDay(checkOut)} · {nights} night{nights === 1 ? '' : 's'} · {guests} guest{guests === 1 ? '' : 's'}</p>
              {rooms.length === 0 ? (
                <div className={card}>
                  <p className="text-sm font-medium text-on-surface">Nothing is free for these dates</p>
                  <p className="text-sm text-on-surface-variant mt-1">Try other dates or fewer guests{hotel.phone ? `, or call ${hotel.phone}` : ''}.</p>
                </div>
              ) : rooms.map(r => {
                const t = stayTotals(r.price, nights, hotel.gst);
                const selected = roomType === r.type;
                return (
                  <button
                    key={r.type}
                    type="button"
                    onClick={() => { setRoomType(r.type); setError(null); }}
                    aria-pressed={selected}
                    className={`w-full text-left rounded-[20px] border overflow-hidden transition-colors ${selected ? 'border-on-surface bg-highlight' : 'border-outline-variant bg-surface-container-lowest hover:border-on-surface-variant'}`}
                  >
                    <div className="h-36 bg-surface-container flex items-center justify-center text-on-surface-variant">
                      {r.image ? <img src={r.image} alt={r.type} className="size-full object-cover" /> : <Bed className="size-8 opacity-50" />}
                    </div>
                    <div className="p-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-on-surface">{r.type}</p>
                        <p className="text-xs text-on-surface-variant mt-1 flex items-center gap-1.5">
                          <Users className="size-3.5" /> Sleeps {r.sleeps}{r.beds ? ` · ${r.beds}` : ''}
                        </p>
                        {r.left <= 3 && <p className="text-xs text-warning mt-1.5">Only {r.left} left</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-semibold text-on-surface">{money(r.price)}</p>
                        <p className="text-xs text-on-surface-variant">per night</p>
                        <p className="text-xs text-on-surface-variant mt-1">{money(t.total)} for {nights}{hotel.gst ? ', with GST' : ''}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {error && <p className="text-[13px] text-error pl-1">{error}</p>}
              {rooms.length > 0 && (
                <button onClick={() => (roomType ? goTo(3) : setError('Choose a room to continue.'))} className={primaryBtn}>Continue</button>
              )}
            </div>
          )}

          {step === 3 && picked && (() => {
            const t = stayTotals(picked.price, nights, hotel.gst);
            return (
              <form onSubmit={handleBook} className="space-y-3">
                <button type="button" onClick={() => goTo(2)} className="inline-flex items-center gap-1.5 text-[13px] text-on-surface-variant hover:text-on-surface pl-1">
                  <ArrowLeft className="size-4" /> {picked.type}
                </button>
                <div className={`${card} text-sm space-y-1.5`}>
                  <div className="flex justify-between"><span className="text-on-surface-variant">{money(picked.price)} × {nights} night{nights === 1 ? '' : 's'}</span><span>{money(t.subtotal)}</span></div>
                  {hotel.gst && <div className="flex justify-between"><span className="text-on-surface-variant">GST {t.rate}%</span><span>{money(t.tax)}</span></div>}
                  <div className="flex justify-between font-semibold pt-2 border-t border-outline-variant"><span>Total</span><span>{money(t.total)}</span></div>
                </div>
                <div className={`${card} space-y-4`}>
                  <label className="block"><span className={labelCls}>Full name</span><input required value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={120} className={inputCls} /></label>
                  <div><span className={labelCls}>Phone</span><PhoneField pill value={phone} onChange={setPhone} /></div>
                  <label className="block"><span className={labelCls}>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" maxLength={200} className={inputCls} /></label>
                  <label className="block"><span className={labelCls}>Anything we should know</span><input value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} className={inputCls} /></label>
                </div>
                <div className="rounded-[20px] border border-on-surface bg-highlight px-5 py-3.5">
                  <p className="text-sm font-medium text-on-surface">Pay at the hotel</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">Nothing to pay now. {hotel.name} holds the room for you{hotel.checkInTime ? `; check-in is from ${clock(hotel.checkInTime)}` : ''}.</p>
                </div>
                {error && <p className="text-[13px] text-error pl-1">{error}</p>}
                <button disabled={busy} className={primaryBtn}>{busy ? 'Booking…' : 'Confirm booking'}</button>
              </form>
            );
          })()}

          {step === 4 && result && (
            <div className="space-y-3">
              <div className={`${card} text-center py-7`}>
                <span className="size-14 rounded-full bg-success text-on-success flex items-center justify-center mx-auto"><Check className="size-7" /></span>
                <p className="text-xl font-semibold tracking-[-0.02em] text-on-surface mt-4">Booking confirmed</p>
                <p className="text-sm text-on-surface-variant mt-1">Reference <span className="font-mono font-medium text-on-surface">{result.ref}</span></p>
                <div className="mt-5 rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-left space-y-1.5">
                  <div className="flex justify-between gap-3"><span className="text-on-surface-variant">Room</span><span>{result.roomType}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-on-surface-variant">Check-in</span><span>{longDay(checkIn)}{hotel.checkInTime ? `, from ${clock(hotel.checkInTime)}` : ''}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-on-surface-variant">Check-out</span><span>{longDay(checkOut)}{hotel.checkOutTime ? `, by ${clock(hotel.checkOutTime)}` : ''}</span></div>
                </div>
                <p className="text-sm text-on-surface-variant mt-4">{email.trim() ? `We’re emailing the details to ${email.trim()}. ` : ''}Keep your reference handy. You pay at the hotel.</p>
              </div>
              {hotel.phone && (
                <a href={`tel:${hotel.phone}`} className="w-full h-12 rounded-full border border-outline-variant text-sm font-medium text-on-surface inline-flex items-center justify-center gap-2 hover:bg-surface-container-low">
                  <Phone className="size-4" /> Call {hotel.name}
                </a>
              )}
              {embed && <button onClick={closeEmbed} className={primaryBtn}>Done</button>}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <p className="text-center text-xs text-on-surface-variant mt-8">Booking by Cabadra</p>
    </>
  );
}
