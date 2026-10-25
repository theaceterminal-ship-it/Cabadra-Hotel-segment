import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, BarChart3, BellRing, Car, Check, MapPin, MessageCircle, Phone, Sparkles, Star, Tag } from 'lucide-react';
import { SiteFooter, SiteNav, SiteShell } from '../../components/site/SiteChrome';
import { Reveal, RevealGroup, RevealItem, fadeUp, stagger } from '../../components/site/motion';
import { usePageTitle } from './usePageTitle';
import { PartnerPricing, fetchPartnerPricing, inr } from '../../lib/partnersApi';

const EASE = [0.22, 1, 0.36, 1] as const;

const STEPS = [
  { title: 'Sign up', body: 'Create your partner account with Google and tell us about your business. It takes five minutes.' },
  { title: 'We check it', body: 'Every listing is checked by a person, usually within two working days.' },
  { title: 'Pay and go live', body: 'Pay online from your partner page. Guests nearby see you straight away.' },
];

const PERKS = [
  { icon: Phone, title: 'Guests reach you directly', body: 'Call, WhatsApp and directions go straight to you. No middleman, no cut of your sale.' },
  { icon: MessageCircle, title: 'Booking requests', body: 'Guests can send a request (“cab to Kasauli at 9”) with their name, phone and hotel. You get it by email.' },
  { icon: BarChart3, title: 'A report every month', body: 'How many guests saw you, opened your listing, called, messaged and asked for directions.' },
  { icon: BellRing, title: 'Reminders before it runs out', body: 'We email you before your listing ends, so you never drop off by accident.' },
  { icon: Star, title: 'Ratings and front-desk bookings', body: 'Guests rate you after a booking, and hotel front desks can book you for their guests. A GST invoice for every payment.' },
];

/**
 * The website's page for local businesses (taxis, tour guides, spas, cafés)
 * who want to be listed in the guest app at hotels near them: how it works,
 * the price (from partner_settings, so it's always what Pulse says), and
 * the application form. Submitting creates a pending listing and emails a
 * private partner page link; nothing shows to guests until we approve it
 * and it's paid.
 */
export default function PartnersPage() {
  usePageTitle('For local businesses');
  const [pricing, setPricing] = useState<PartnerPricing | null>(null);

  useEffect(() => {
    fetchPartnerPricing().then(setPricing);
  }, []);

  return (
    <SiteShell>
      <div className="px-5 sm:px-10 lg:px-14 pt-5 sm:pt-8 mx-auto max-w-7xl">
        <SiteNav />
      </div>

      <main>
        <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-12 sm:pt-20">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] items-center">
            <motion.div initial="hidden" animate="show" variants={stagger(0.1)}>
              <motion.p variants={fadeUp} className="text-sm font-medium text-[#111]/50">Cabadra Partners</motion.p>
              <motion.h1 variants={fadeUp} className="mt-3 text-[40px] sm:text-6xl leading-[1.02] font-semibold tracking-[-0.035em]">
                Be the first name guests see nearby
              </motion.h1>
              <motion.p variants={fadeUp} className="mt-5 max-w-xl text-[17px] sm:text-lg text-[#111]/65">
                Guests at hotels and homestays across Himachal open the Cabadra app on their phone. List your taxi, tours, spa or shop in it, and they call you, not someone else.
              </motion.p>
              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-2">
                <Link to="/partner?new" className="group h-12 px-7 inline-flex items-center gap-2 rounded-full bg-[#111] text-white text-[15px] font-medium hover:bg-black transition-colors">
                  Apply now <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link to="/partner" className="h-12 px-6 inline-flex items-center rounded-full border border-black/15 bg-white/50 text-[15px] font-medium hover:bg-white/80 transition-colors">Partner sign in</Link>
                <a href="#pricing" className="h-12 px-6 inline-flex items-center rounded-full border border-black/15 bg-white/50 text-[15px] font-medium hover:bg-white/80 transition-colors">
                  {pricing ? `From ${inr(pricing.listingFeeMonthly)} a month` : 'See pricing'}
                </a>
              </motion.div>
            </motion.div>
            <PhonePreview />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-24 sm:pt-32">
          <Reveal>
            <p className="text-sm font-medium text-[#111]/50">How it works</p>
            <h2 className="mt-3 text-[32px] sm:text-5xl leading-[1.05] font-semibold tracking-[-0.03em] max-w-2xl">Three steps, then guests find you</h2>
          </Reveal>
          <RevealGroup className="mt-10 grid gap-3 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <RevealItem key={s.title} className="rounded-[28px] bg-white p-6 sm:p-7">
                <span className="size-10 rounded-full bg-[#111] text-white flex items-center justify-center text-sm font-semibold">{i + 1}</span>
                <h3 className="mt-8 text-lg font-semibold tracking-[-0.01em]">{s.title}</h3>
                <p className="mt-2 text-[15px] text-[#111]/60 leading-relaxed">{s.body}</p>
              </RevealItem>
            ))}
          </RevealGroup>
          <RevealGroup className="mt-3 grid gap-3 sm:grid-cols-2">
            {PERKS.map(({ icon: Icon, title, body }) => (
              <RevealItem key={title} className="rounded-[28px] bg-white/60 border border-black/5 p-6 sm:p-7 flex gap-4">
                <span className="size-11 shrink-0 rounded-full bg-white flex items-center justify-center"><Icon className="size-5" /></span>
                <span>
                  <span className="block text-[17px] font-semibold tracking-[-0.01em]">{title}</span>
                  <span className="mt-1 block text-[15px] text-[#111]/60 leading-relaxed">{body}</span>
                </span>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>

        <section id="pricing" className="scroll-mt-6 mx-auto max-w-6xl px-5 sm:px-8 pt-24 sm:pt-32">
          <Reveal>
            <p className="text-sm font-medium text-[#111]/50">Pricing</p>
            <h2 className="mt-3 text-[32px] sm:text-5xl leading-[1.05] font-semibold tracking-[-0.03em] max-w-2xl">One monthly fee. No commission on your sales.</h2>
          </Reveal>
          <div className="mt-10 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
            <Reveal className="rounded-[28px] bg-[#111] text-white p-7 sm:p-10">
              <p className="text-sm text-white/60">Listing</p>
              <p className="mt-4 text-5xl sm:text-6xl font-semibold tracking-[-0.03em]">{pricing ? inr(pricing.listingFeeMonthly) : '—'}<span className="text-xl font-medium text-white/50"> / month</span></p>
              <ul className="mt-6 space-y-2.5 text-[15px] text-white/75">
                {['Shown at every hotel in the areas you serve', 'Call, WhatsApp, directions and your offer code', 'Guest booking requests by email', 'Monthly report and renewal reminders', 'Pay for 1, 3, 6 or 12 months. No auto-renewal.'].map(t => (
                  <li key={t} className="flex items-start gap-2.5"><Check className="size-4 mt-0.5 shrink-0 text-[#d4ff5a]" />{t}</li>
                ))}
              </ul>
              <a href="#apply" className="group mt-9 h-12 px-7 inline-flex items-center gap-2 rounded-full bg-white text-[#111] text-[15px] font-medium hover:bg-white/90 transition-colors">
                Apply now <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </a>
            </Reveal>
            <Reveal delay={0.1} className="rounded-[28px] bg-white p-7 sm:p-10 flex flex-col">
              <p className="text-sm text-[#111]/50 inline-flex items-center gap-1.5"><Sparkles className="size-4" /> Featured add-on</p>
              <p className="mt-4 text-4xl sm:text-5xl font-semibold tracking-[-0.03em]">+{pricing ? inr(pricing.featuredFeeMonthly) : '—'}<span className="text-lg font-medium text-[#111]/45"> / month</span></p>
              <p className="mt-4 text-[15px] text-[#111]/65 leading-relaxed">Go to the front of the row with a Featured badge, so you’re the first thing guests see. Add it any time from your partner page once your listing is live.</p>
              <p className="mt-auto pt-8 text-sm text-[#111]/50 leading-relaxed">Restaurants and cafés show at hotels that choose to show them, since many hotels have their own kitchen.</p>
            </Reveal>
          </div>
        </section>

        <ApplySection />
      </main>

      <SiteFooter showCta={false} />
    </SiteShell>
  );
}

/** What a guest sees: the "Around {place}" row in the guest app, drawn small. */
function PhonePreview() {
  const cards = [
    { name: 'Himalayan Cabs', tag: 'Airport & sightseeing', icon: Car, featured: true },
    { name: 'Pine Trails', tag: 'Guided treks', icon: MapPin, featured: false },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 30, rotate: -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.9, delay: 0.3, ease: EASE }} className="mx-auto w-full max-w-[340px]">
      <div className="rounded-[44px] bg-[#111] p-3 shadow-[0_40px_80px_rgba(0,0,0,0.18)]">
        <div className="rounded-[34px] bg-[#eef0ec] px-4 pt-6 pb-6">
          <p className="text-[11px] font-medium text-[#111]/50">Local favourites, picked by Cabadra</p>
          <p className="mt-0.5 text-xl font-semibold tracking-[-0.02em]">Around Kasauli</p>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {cards.map(({ name, tag, icon: Icon, featured }, i) => (
              <motion.div key={name} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 + i * 0.15, duration: 0.6, ease: EASE }} className="rounded-[22px] bg-white overflow-hidden">
                <div className={`h-24 relative ${i === 0 ? 'bg-[linear-gradient(135deg,#c9d6c1,#8fa58a)]' : 'bg-[linear-gradient(135deg,#d9d2c3,#a89a80)]'}`}>
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold"><Icon className="size-3" />{featured ? 'Featured' : 'Partner'}</span>
                </div>
                <div className="p-2.5">
                  <p className="text-[13px] font-semibold leading-tight">{name}</p>
                  <p className="mt-0.5 text-[11px] text-[#111]/55 leading-tight">{tag}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.6, ease: EASE }} className="mt-3 rounded-[22px] bg-white p-3.5">
            <p className="text-[13px] font-semibold">Himalayan Cabs</p>
            <p className="mt-0.5 text-[11px] text-[#111]/55 inline-flex items-center gap-1"><Tag className="size-3" /> 10% off for hotel guests</p>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-[11px] font-medium">
              <span className="h-8 rounded-full bg-[#111] text-white inline-flex items-center justify-center gap-1"><Phone className="size-3" />Call</span>
              <span className="h-8 rounded-full bg-[#eef0ec] inline-flex items-center justify-center gap-1"><MessageCircle className="size-3" />WhatsApp</span>
              <span className="h-8 rounded-full bg-[#eef0ec] inline-flex items-center justify-center">Request</span>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

/** Applying needs an account now (0085): sign up with Google, then the form on /partner. */
function ApplySection() {
  return (
    <section id="apply" className="scroll-mt-6 mx-auto max-w-6xl px-5 sm:px-8 pt-24 sm:pt-32">
      <Reveal className="rounded-[32px] bg-[#111] text-white p-8 sm:p-12 grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-end">
        <div>
          <p className="text-sm text-white/55">Apply</p>
          <h2 className="mt-3 text-[32px] sm:text-5xl leading-[1.05] font-semibold tracking-[-0.03em]">List your business</h2>
          <p className="mt-4 max-w-md text-[15px] text-white/65">Create your partner account with Google, tell us about your business, and we’ll check it within two working days. Nothing to pay until you’re approved.</p>
        </div>
        <div className="flex flex-col gap-2 md:items-end">
          <Link to="/partner?new" className="group md:w-64 h-12 px-7 inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#111] text-[15px] font-medium hover:bg-white/90 transition-colors">
            Sign up with Google <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link to="/partner" className="md:w-64 h-12 px-7 inline-flex items-center justify-center rounded-full border border-white/25 text-[15px] font-medium hover:bg-white/10 transition-colors">
            Already a partner? Sign in
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
