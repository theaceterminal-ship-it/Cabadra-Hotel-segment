import React, { useState } from 'react';
import { AppView } from '../types';
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
  Heart
} from 'lucide-react';

interface GuestHomeProps {
  propertyName: string;
  roomNumber: string;
  guestName: string;
  isVip: boolean;
  onNavigate: (view: AppView) => void;
  onOpenNewRequest: () => void;
  /** Real submission (guest_submit_request) — the housekeeping/amenities/spa/transfers modal below calls this instead of just showing a toast. */
  onSubmitConciergeRequest: (title: string) => Promise<void>;
  /** Real submission (guest_book_experience) for the curated-experience "Reserve Now" buttons. */
  onBookExperience: (name: string, price: number) => Promise<void>;
}

export const GuestHome: React.FC<GuestHomeProps> = ({
  propertyName,
  roomNumber,
  guestName,
  isVip,
  onNavigate,
  onOpenNewRequest,
  onSubmitConciergeRequest,
  onBookExperience,
}) => {
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [bookedExperience, setBookedExperience] = useState<string | null>(null);

  const handleBookExperience = async (title: string, price: number) => {
    try {
      await onBookExperience(title, price);
      setBookedExperience(title);
      setTimeout(() => setBookedExperience(null), 4000);
    } catch (err) {
      console.warn('Failed to book experience:', err);
    }
  };

  const handleConciergeRequest = async (title: string) => {
    try {
      await onSubmitConciergeRequest(title);
      setBookedExperience(title);
      setTimeout(() => setBookedExperience(null), 4000);
    } catch (err) {
      console.warn('Failed to submit request:', err);
    }
  };

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
              backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuApNU48JgNCtMBN-62dVkxqySJJot6g74LTZFb76CgYauRB7gZ9OBq6UNLjzWLklzLHF0WxdgSVGi7Btvz2FX9Mz9zjzCgeZm0rXMOfzC3JTMboHzUDMShFpBOSyLDvadLUW5LGJT_7r1ZGmlxCfr1XsthTQ3KOUDw2bafbxI8uzbxrQaFylTmBaNgb8QFn0NxK7Vb9s_Z23jOcyZE4TIqg5mD8gQgrgMPSzcxD_g2CHheeE2JR0Cop')`
            }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
          
          <div className="absolute bottom-0 left-0 p-6 md:p-8 w-full text-white">
            <p className="text-xs font-bold tracking-widest uppercase mb-1 opacity-90 text-[#ffdea9]">
              Welcome to
            </p>
            <h1 className="text-3xl md:text-5xl font-bold mb-1 tracking-tight text-white">
              {propertyName}
            </h1>
            <p className="text-sm font-medium opacity-90 text-white/90">
              Room {roomNumber} • {guestName}{isVip ? ' (VIP Guest)' : ''}
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

            {/* Housekeeping */}
            <div
              id="service-card-housekeeping"
              onClick={() => setActiveModal('housekeeping')}
              className="col-span-1 relative rounded-2xl overflow-hidden cursor-pointer group shadow-sm border border-[#E9ECEF] hover:shadow-md transition-all h-36 md:h-38 bg-white hover:bg-[#ecf5fe] flex flex-col items-center justify-center p-4 text-center"
            >
              <div className="bg-[#765a25]/10 rounded-full p-3 mb-2 text-[#765a25] group-hover:scale-110 transition-transform">
                <BedDouble className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[#141d23]">Housekeeping</h3>
              <p className="text-[11px] text-[#7f7668] mt-0.5">Linens &amp; Turnover</p>
            </div>

            {/* Amenities */}
            <div
              id="service-card-amenities"
              onClick={() => setActiveModal('amenities')}
              className="col-span-1 relative rounded-2xl overflow-hidden cursor-pointer group shadow-sm border border-[#E9ECEF] hover:shadow-md transition-all h-36 md:h-38 bg-white hover:bg-[#ecf5fe] flex flex-col items-center justify-center p-4 text-center"
            >
              <div className="bg-[#765a25]/10 rounded-full p-3 mb-2 text-[#765a25] group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[#141d23]">Amenities</h3>
              <p className="text-[11px] text-[#7f7668] mt-0.5">Toiletries &amp; Robes</p>
            </div>

            {/* Spa */}
            <div
              id="service-card-spa"
              onClick={() => setActiveModal('spa')}
              className="col-span-1 relative rounded-2xl overflow-hidden cursor-pointer group shadow-sm border border-[#E9ECEF] hover:shadow-md transition-all h-36 md:h-38"
            >
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                style={{ 
                  backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuAFS7M4s6kuMzdIMHsi_i8Sx1HkACaIw_EkHyv9Wj8uQoY13pxBlWhCx0yj3F3710LNSPlmyQi9BB6LLEIIKeb-m5T-QeHyYFgyheD2m1nRFSxA5RHVyGar6gbNzu9EfiQPNiUIHc4v-MAfRcE6Lfu2w7bJJGTPIEGFE0XvgwprDZse-RljkZZUEjMutE1PXNb-fxbcSjlWsIUULQ8qsoRgH1IliCt1WYzW5qat-Pcop93hPO_RCqkS')`
                }}
              ></div>
              <div className="absolute inset-0 bg-black/45"></div>
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-white">
                <Heart className="w-6 h-6 mb-1 text-[#ffdea9]" />
                <h3 className="text-sm font-bold">Spa &amp; Wellness</h3>
                <p className="text-[11px] text-white/80">Massages &amp; Sauna</p>
              </div>
            </div>

            {/* Transfers */}
            <div
              id="service-card-transfers"
              onClick={() => setActiveModal('transfers')}
              className="col-span-1 relative rounded-2xl overflow-hidden cursor-pointer group shadow-sm border border-[#E9ECEF] hover:shadow-md transition-all h-36 md:h-38 bg-white hover:bg-[#ecf5fe] flex flex-col items-center justify-center p-4 text-center"
            >
              <div className="bg-[#765a25]/10 rounded-full p-3 mb-2 text-[#765a25] group-hover:scale-110 transition-transform">
                <Car className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[#141d23]">Transfers</h3>
              <p className="text-[11px] text-[#7f7668] mt-0.5">Private Chauffeur</p>
            </div>
          </div>
        </section>

        {/* Featured Curated Experiences */}
        <section id="curated-experiences-section" className="space-y-4 pt-2">
          <h2 className="text-xl font-bold text-[#141d23] px-1">Curated For You</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Experience 1 */}
            <div 
              id="exp-card-sunset-cruise"
              className="rounded-2xl border border-[#E9ECEF] overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row group"
            >
              <div 
                className="h-44 sm:h-auto sm:w-48 bg-cover bg-center shrink-0 group-hover:scale-105 transition-transform duration-500"
                style={{ 
                  backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuBYX8P3chw_hUPPSd4cfsR-RIhg6EHiKH0sfUKPjIIlV6nxc03Zg-dANYr7bpW5Yg96gKAYI2cmmhQRkBJbAq2-8NUwROwuMf2DWGASlUHzbjYcCMFeEzyK650ekeUargGYG-EEuKOsVGJ8tKC50sUKQbN4gW3RGMhrzpcyyj86_nP4FdP5VoNv2QAHogmyk3A7AUVkToKOJibwr4aPJ2qv8fVx326LnH5jjismn_Nv1T233enDqmBc')`
                }}
              ></div>
              <div className="p-5 flex flex-col justify-between flex-grow">
                <div>
                  <span className="text-[10px] font-bold text-[#765a25] uppercase tracking-wider block mb-1">
                    Signature Excursion
                  </span>
                  <h3 className="text-lg font-bold text-[#141d23] mb-1">Sunset Yacht Cruise</h3>
                  <p className="text-xs text-[#4e463a] leading-relaxed">
                    Experience the Manhattan skyline from a private 65ft luxury yacht with complimentary champagne &amp; caviar.
                  </p>
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#E9ECEF]">
                  <span className="text-sm font-bold text-[#765a25]">$350 / couple</span>
                  <button
                    onClick={() => handleBookExperience('Sunset Yacht Cruise', 350)}
                    className="px-4 py-2 bg-[#765a25] text-white rounded-lg text-xs font-bold hover:bg-[#5c4210] transition-colors cursor-pointer"
                  >
                    Reserve Now
                  </button>
                </div>
              </div>
            </div>

            {/* Experience 2 */}
            <div 
              id="exp-card-chefs-table"
              className="rounded-2xl border border-[#E9ECEF] overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col sm:flex-row group"
            >
              <div 
                className="h-44 sm:h-auto sm:w-48 bg-cover bg-center shrink-0 group-hover:scale-105 transition-transform duration-500"
                style={{ 
                  backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuDi8-lU1mljDUbqeUFXLYJ0Uq81KOiVpfAnBmnirbOC0urK4hTGLfdERclcvG-NMUnZ3SqTiCVD2ine1-n-PtT0NEv9U_umXpevtyV_daOAtrdvqdkP3jV-TMqXnQgMbLgtlH6REwc1HJ9t1117wHQLleb5WRQ3GXk4KWfLwRRik57-x2sV8VuS3rCaWN1HUn51n5-l4_potZy6RgrXdlZv_-M5gjIpJRl9NLP7NEYLuLxQ7mj-9sa6')`
                }}
              ></div>
              <div className="p-5 flex flex-col justify-between flex-grow">
                <div>
                  <span className="text-[10px] font-bold text-[#765a25] uppercase tracking-wider block mb-1">
                    Culinary Tasting
                  </span>
                  <h3 className="text-lg font-bold text-[#141d23]">Chef's Tasting Table</h3>
                  <p className="text-xs text-[#4e463a] leading-relaxed">
                    7-course sensory dinner with master sommelier wine pairing prepared tableside by our Michelin-starred executive chef.
                  </p>
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#E9ECEF]">
                  <span className="text-sm font-bold text-[#765a25]">$280 / person</span>
                  <button
                    onClick={() => handleBookExperience("Chef's Tasting Table", 280)}
                    className="px-4 py-2 bg-[#765a25] text-white rounded-lg text-xs font-bold hover:bg-[#5c4210] transition-colors cursor-pointer"
                  >
                    Reserve Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Interactive Service Modals */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E9ECEF]">
            <div className="flex justify-between items-center pb-3 border-b border-[#E9ECEF] mb-4">
              <h3 className="text-lg font-bold text-[#141d23] capitalize">
                Request {activeModal} (Room {roomNumber})
              </h3>
              <button 
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-[#4e463a] mb-4">
              Select items or services needed. Your concierge dispatch will confirm arrival time within 5 minutes.
            </p>

            <div className="space-y-2 mb-6 text-xs">
              {activeModal === 'housekeeping' && (
                <>
                  <label className="flex items-center gap-2 p-2.5 bg-[#f6faff] rounded-lg border border-[#E9ECEF] cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-[#765a25]" />
                    <span>Complete Room Cleaning &amp; Linen Change</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 bg-[#f6faff] rounded-lg border border-[#E9ECEF] cursor-pointer">
                    <input type="checkbox" className="accent-[#765a25]" />
                    <span>Evening Turndown Service with Herbal Tea</span>
                  </label>
                </>
              )}

              {activeModal === 'amenities' && (
                <>
                  <label className="flex items-center gap-2 p-2.5 bg-[#f6faff] rounded-lg border border-[#E9ECEF] cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-[#765a25]" />
                    <span>Extra Plush Bath Towels &amp; Bathrobes</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 bg-[#f6faff] rounded-lg border border-[#E9ECEF] cursor-pointer">
                    <input type="checkbox" className="accent-[#765a25]" />
                    <span>Le Labo Santal 33 Toiletries Kit</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 bg-[#f6faff] rounded-lg border border-[#E9ECEF] cursor-pointer">
                    <input type="checkbox" className="accent-[#765a25]" />
                    <span>Hypoallergenic Feather Down Pillows</span>
                  </label>
                </>
              )}

              {activeModal === 'spa' && (
                <>
                  <label className="flex items-center gap-2 p-2.5 bg-[#f6faff] rounded-lg border border-[#E9ECEF] cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-[#765a25]" />
                    <span>60-Min Swedish Aromatherapy Massage ($180)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 bg-[#f6faff] rounded-lg border border-[#E9ECEF] cursor-pointer">
                    <input type="checkbox" className="accent-[#765a25]" />
                    <span>Deep Tissue In-Suite Session ($220)</span>
                  </label>
                </>
              )}

              {activeModal === 'transfers' && (
                <>
                  <label className="flex items-center gap-2 p-2.5 bg-[#f6faff] rounded-lg border border-[#E9ECEF] cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-[#765a25]" />
                    <span>JFK Airport Chauffeur (Mercedes S-Class) ($160)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 bg-[#f6faff] rounded-lg border border-[#E9ECEF] cursor-pointer">
                    <input type="checkbox" className="accent-[#765a25]" />
                    <span>City Hourly Chauffeur Service ($120/hr)</span>
                  </label>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-[#E9ECEF] rounded-lg text-xs font-semibold text-[#4e463a]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleConciergeRequest(`${activeModal} request`);
                  setActiveModal(null);
                }}
                className="px-5 py-2 bg-[#765a25] text-white rounded-lg text-xs font-bold hover:bg-[#5c4210]"
              >
                Confirm Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
