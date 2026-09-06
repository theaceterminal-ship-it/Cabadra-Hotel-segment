import React, { useEffect, useState } from 'react';
import { AppView } from '../types';
import { GuestExperience, GuestServiceCategory, GuestTransportRoute, Department } from '../lib/guestApi';
import { formatCurrency } from '../lib/currency';
import {
  Utensils,
  Sparkles,
  Car,
  BedDouble,
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
  onOpenNewRequest: () => void;
  /** Real submission (guest_submit_request), tagged with the service's department so it routes to the right team instead of Reception guessing from the title. */
  onSubmitConciergeRequest: (title: string, department: Department) => Promise<void>;
  /** Real submission (guest_book_experience) for the curated-experience "Reserve Now" buttons. */
  onBookExperience: (name: string, price: number) => Promise<void>;
}

const DEFAULT_HERO_IMAGE = 'https://lh3.googleusercontent.com/aida-public/AB6AXuApNU48JgNCtMBN-62dVkxqySJJot6g74LTZFb76CgYauRB7gZ9OBq6UNLjzWLklzLHF0WxdgSVGi7Btvz2FX9Mz9zjzCgeZm0rXMOfzC3JTMboHzUDMShFpBOSyLDvadLUW5LGJT_7r1ZGmlxCfr1XsthTQ3KOUDw2bafbxI8uzbxrQaFylTmBaNgb8QFn0NxK7Vb9s_Z23jOcyZE4TIqg5mD8gQgrgMPSzcxD_g2CHheeE2JR0Cop';

const SERVICE_ICONS: Record<string, typeof Sparkles> = {
  bed: BedDouble, sparkles: Sparkles, heart: Heart, car: Car, wrench: Wrench, message: MessageCircle,
};
function serviceIconFor(key: string) {
  return SERVICE_ICONS[key] ?? Compass;
}

export const GuestHome: React.FC<GuestHomeProps> = ({
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
  onOpenNewRequest,
  onSubmitConciergeRequest,
  onBookExperience,
}) => {
  const [activeModal, setActiveModal] = useState<GuestServiceCategory | null>(null);
  const [requestNote, setRequestNote] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [routeSearch, setRouteSearch] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [bookedExperience, setBookedExperience] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

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

  const handleConciergeRequest = async (title: string, department: Department) => {
    try {
      await onSubmitConciergeRequest(title, department);
      setBookedExperience(title);
      setTimeout(() => setBookedExperience(null), 4000);
    } catch (err) {
      console.warn('Failed to submit request:', err);
    }
  };

  const handleSubmitServiceRequest = async () => {
    if (!activeModal) return;
    setSubmittingRequest(true);
    try {
      let title: string;
      if (activeModal.categoryType === 'transportation') {
        const route = transportRoutes.find(r => r.id === selectedRouteId);
        if (!route) return;
        title = `Transfer: ${route.from} → ${route.to} (${formatCurrency(route.price, currency)} ${route.priceUnit})${requestNote.trim() ? ` — ${requestNote.trim()}` : ''}`;
      } else {
        title = requestNote.trim() ? `${activeModal.name}: ${requestNote.trim()}` : activeModal.name;
      }
      await handleConciergeRequest(title, activeModal.department);
    } finally {
      setSubmittingRequest(false);
      setActiveModal(null);
      setRequestNote('');
      setSelectedRouteId('');
      setRouteSearch('');
    }
  };

  const filteredRoutes = transportRoutes.filter(r =>
    !routeSearch.trim() ||
    r.from.toLowerCase().includes(routeSearch.toLowerCase()) ||
    r.to.toLowerCase().includes(routeSearch.toLowerCase())
  );

  return (
    <div id="guest-home-canvas" className="w-full min-h-screen bg-[#f6faff] pb-24">
      {/* Main Container */}
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Booking Notification Toast */}
        {bookedExperience && (
          <div className="bg-[#2D6A4F] text-white p-4 rounded-xl shadow-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
            <Check className="w-5 h-5 shrink-0" />
            <p className="text-xs font-semibold">
              Reservation requested for <strong>{bookedExperience}</strong>! Our concierge is confirming details.
            </p>
          </div>
        )}

        {/* Hero Section */}
        <section 
          id="guest-hero-banner"
          className="relative rounded-2xl overflow-hidden h-64 md:h-96 shadow-[0_4px_24px_rgba(0,0,0,0.1)] group"
        >
          <div 
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
            style={{
              backgroundImage: `url('${propertyImage || DEFAULT_HERO_IMAGE}')`
            }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
          
          <div className="absolute top-4 right-4 md:top-6 md:right-6 bg-black/35 backdrop-blur-sm rounded-xl px-3.5 py-2 text-right text-white">
            <p className="text-lg md:text-xl font-bold font-mono tabular-nums leading-none">
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-[10px] md:text-[11px] opacity-80 mt-0.5">
              {now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          </div>

          <div className="absolute bottom-0 left-0 p-6 md:p-8 w-full text-white">
            <p className="text-xs font-bold tracking-widest uppercase mb-1 opacity-90 text-[#ffdea9]">
              Welcome, {guestName}{isVip ? ' ✦' : ''}
            </p>
            <h1 className="text-3xl md:text-5xl font-bold mb-1 tracking-tight text-white">
              at {propertyName}
            </h1>
            <p className="text-sm font-medium opacity-90 text-white/90">
              Room {roomNumber}{isVip ? ' • VIP Guest' : ''}
            </p>
          </div>
        </section>

        {/* Category Grid (Bento Style) */}
        <section id="at-your-service-section" className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-xl font-bold text-[#141d23]">At Your Service</h2>
            <button
              onClick={onOpenNewRequest}
              className="text-xs font-bold text-[#765a25] hover:underline"
            >
              + Custom Concierge Request
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Room Dining (Large 2x2 Bento card) */}
            <div
              id="service-card-dining"
              onClick={() => onNavigate('room_dining')}
              className="col-span-2 row-span-2 relative rounded-2xl overflow-hidden cursor-pointer group shadow-sm border border-[#E9ECEF] hover:shadow-md transition-all h-60 md:h-80"
            >
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                style={{ 
                  backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuDFn_TeCi5piq666qSWt3Hro67LM4aqJ3KOdCqcFwqj8IEsLL71l8pBEB0NAnUCJ1VetsgipFB4eIYXBUv4plasCoux9XaBg5ik93465PeiTVB4IeF8AUK983CQ9arBB9nZCHCDSEduj6yBSIPDvkHUtJ-LkkW2QTv-SelsUmKzC9aaeVY4FIUsVs6IlKfACSjlKXtcYIQm_-VC6aE-6sTLm5kW2FWww-KStayTJXgRSxrXYooZOu1e')`
                }}
              ></div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"></div>
              
              <div className="absolute bottom-0 left-0 p-5 w-full text-white">
                <div className="p-2 bg-[#bd9b60] text-white rounded-lg w-fit mb-2 shadow-xs">
                  <Utensils className="w-5 h-5" />
                </div>
                <h3 className="text-xl md:text-2xl font-bold">Room Dining</h3>
                <p className="text-xs text-white/90 mt-0.5">Explore our curated chef specialities &amp; beverages.</p>
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
                  className="col-span-1 relative rounded-2xl overflow-hidden cursor-pointer group shadow-sm border border-[#E9ECEF] hover:shadow-md transition-all h-36 md:h-38 bg-white hover:bg-[#ecf5fe] flex flex-col items-center justify-center p-4 text-center"
                >
                  <div className="bg-[#765a25]/10 rounded-full p-3 mb-2 text-[#765a25] group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-[#141d23]">{cat.name}</h3>
                  {cat.description && <p className="text-[11px] text-[#7f7668] mt-0.5">{cat.description}</p>}
                </div>
              );
            })}
          </div>
        </section>

        {/* Featured Curated Experiences — owner-managed (Experiences tab), not hardcoded. Section just doesn't render until the owner adds one. */}
        {(experiences ?? []).length > 0 && (
          <section id="curated-experiences-section" className="space-y-4 pt-2">
            <h2 className="text-xl font-bold text-[#141d23] px-1">Curated For You</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {experiences.map((exp) => (
                <div
                  key={exp.id}
                  id={`exp-card-${exp.id}`}
                  className="rounded-2xl border border-[#E9ECEF] overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row group"
                >
                  <div
                    className="h-44 sm:h-auto sm:w-48 bg-cover bg-center bg-[#ecf5fe] shrink-0 group-hover:scale-105 transition-transform duration-500"
                    style={exp.image ? { backgroundImage: `url('${exp.image}')` } : undefined}
                  ></div>
                  <div className="p-5 flex flex-col justify-between flex-grow">
                    <div>
                      <h3 className="text-lg font-bold text-[#141d23] mb-1">{exp.name}</h3>
                      <p className="text-xs text-[#4e463a] leading-relaxed">{exp.description}</p>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#E9ECEF]">
                      <span className="text-sm font-bold text-[#765a25]">{formatCurrency(exp.price, currency)} {exp.unitLabel}</span>
                      <button
                        onClick={() => handleBookExperience(exp.name, exp.price)}
                        className="px-4 py-2 bg-[#765a25] text-white rounded-lg text-xs font-bold hover:bg-[#5c4210] transition-colors cursor-pointer"
                      >
                        Reserve Now
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Service Request Modal — one generic form for any owner-defined category, tagged with its department on submit */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E9ECEF]">
            <div className="flex justify-between items-center pb-3 border-b border-[#E9ECEF] mb-4">
              <h3 className="text-lg font-bold text-[#141d23]">
                Request {activeModal.name} (Room {roomNumber})
              </h3>
              <button
                onClick={() => { setActiveModal(null); setRequestNote(''); setSelectedRouteId(''); setRouteSearch(''); }}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            {activeModal.description && <p className="text-xs text-[#4e463a] mb-3">{activeModal.description}</p>}

            {activeModal.categoryType === 'transportation' ? (
              <>
                <label className="text-[11px] font-bold text-[#4e463a] block mb-1">Where to?</label>
                <div className="relative mb-2">
                  <MapPin className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7f7668]" />
                  <input
                    value={routeSearch}
                    onChange={(e) => setRouteSearch(e.target.value)}
                    placeholder="Search a destination..."
                    className="w-full h-9 pl-8 pr-2.5 text-xs border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto mb-4">
                  {filteredRoutes.length === 0 ? (
                    <p className="text-xs text-[#7f7668] text-center py-6">No routes match — ask the front desk directly.</p>
                  ) : (
                    filteredRoutes.map(route => (
                      <label
                        key={route.id}
                        className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border cursor-pointer text-xs ${
                          selectedRouteId === route.id ? 'border-[#765a25] bg-[#fff8ec]' : 'border-[#E9ECEF] hover:bg-[#f6faff]'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <input type="radio" name="route" checked={selectedRouteId === route.id} onChange={() => setSelectedRouteId(route.id)} className="accent-[#765a25]" />
                          {route.from} <Car className="w-3 h-3 text-[#7f7668]" /> {route.to}
                        </span>
                        <span className="font-bold text-[#765a25] shrink-0">{formatCurrency(route.price, currency)} {route.priceUnit}</span>
                      </label>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <label className="text-[11px] font-bold text-[#4e463a] block mb-1">Anything specific? (optional)</label>
                <textarea
                  rows={3}
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  placeholder="e.g. Extra pillows, 3pm arrival, allergic to lavender..."
                  className="w-full p-2.5 text-xs border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none resize-none mb-4"
                />
              </>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setActiveModal(null); setRequestNote(''); setSelectedRouteId(''); setRouteSearch(''); }}
                className="px-4 py-2 border border-[#E9ECEF] rounded-lg text-xs font-semibold text-[#4e463a]"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitServiceRequest}
                disabled={submittingRequest || (activeModal.categoryType === 'transportation' && !selectedRouteId)}
                className="px-5 py-2 bg-[#765a25] text-white rounded-lg text-xs font-bold hover:bg-[#5c4210] disabled:opacity-60"
              >
                {submittingRequest ? 'Sending…' : 'Confirm Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
