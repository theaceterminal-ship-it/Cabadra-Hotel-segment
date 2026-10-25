import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight, BarChart3, BellRing, Car, Check, CheckCircle2, ImagePlus, Loader2, MapPin, MessageCircle, Phone, Plus, Sparkles, Tag, X,
} from 'lucide-react';
import { SiteFooter, SiteNav, SiteShell } from '../../components/site/SiteChrome';
import { Reveal, RevealGroup, RevealItem, fadeUp, stagger } from '../../components/site/motion';
import { usePageTitle } from './usePageTitle';
import { HIMACHAL_PLACES } from '../../lib/himachalPlaces';
import { uploadImageToCloudinary } from '../../lib/cloudinary';
import { PARTNER_CATEGORIES, PartnerApplication, PartnerPricing, fetchPartnerPricing, inr, submitPartnerApplication } from '../../lib/partnersApi';

const EASE = [0.22, 1, 0.36, 1] as const;

const EMPTY: PartnerApplication = {
  name: '', category: '', ownerName: '', phone: '', whatsapp: '', email: '', areas: [], address: '', mapsUrl: '',
  openingHours: '', tagline: '', description: '', offerText: '', photo: '',
};

const STEPS = [
  { title: 'Apply', body: 'Tell us about your business and the places you serve. It takes five minutes.' },
  { title: 'We check it', body: 'Every listing is checked by a person, usually within two working days.' },
  { title: 'Pay and go live', body: 'Pay online from your partner page. Guests nearby see you straight away.' },
];

const PERKS = [
  { icon: Phone, title: 'Guests reach you directly', body: 'Call, WhatsApp and directions go straight to you. No middleman, no cut of your sale.' },
  { icon: MessageCircle, title: 'Booking requests', body: 'Guests can send a request (“cab to Kasauli at 9”) with their name, phone and hotel. You get it by email.' },
  { icon: BarChart3, title: 'A report every month', body: 'How many guests saw you, opened your listing, called, messaged and asked for directions.' },
  { icon: BellRing, title: 'Reminders before it runs out', body: 'We email you before your listing ends, so you never drop off by accident.' },
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
                <a href="#apply" className="group h-12 px-7 inline-flex items-center gap-2 rounded-full bg-[#111] text-white text-[15px] font-medium hover:bg-black transition-colors">
                  Apply now <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </a>
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

const input = 'w-full h-12 px-4 rounded-2xl bg-[#f4f5f2] border border-transparent text-[15px] placeholder:text-[#111]/35 focus:outline-none focus:border-[#111]/30 focus:bg-white transition-colors';

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-[#111]/50">{hint}</span>}
    </label>
  );
}

function ApplySection() {
  const [form, setForm] = useState<PartnerApplication>(EMPTY);
  const [sameWhatsapp, setSameWhatsapp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const set = <K extends keyof PartnerApplication>(k: K, v: PartnerApplication[K]) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.category) { setError('Pick what kind of business it is.'); return; }
    if (form.areas.length === 0) { setError('Pick at least one place you serve.'); return; }
    setBusy(true);
    try {
      const token = await submitPartnerApplication({ ...form, whatsapp: sameWhatsapp ? form.phone : form.whatsapp });
      setDone(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send your application.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="apply" className="scroll-mt-6 mx-auto max-w-6xl px-5 sm:px-8 pt-24 sm:pt-32">
      <Reveal>
        <p className="text-sm font-medium text-[#111]/50">Apply</p>
        <h2 className="mt-3 text-[32px] sm:text-5xl leading-[1.05] font-semibold tracking-[-0.03em] max-w-2xl">List your business</h2>
        <p className="mt-4 max-w-xl text-[15px] text-[#111]/60">No account needed. We’ll email you a private link to your partner page, where you follow the review and pay once approved.</p>
      </Reveal>

      <AnimatePresence mode="wait">
        {done ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }} className="mt-10 rounded-[28px] bg-white p-8 sm:p-12 text-center">
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 18 }} className="mx-auto size-16 rounded-full bg-[#d4ff5a] flex items-center justify-center">
              <CheckCircle2 className="size-8" />
            </motion.span>
            <h3 className="mt-6 text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">Thanks, we’ve got it</h3>
            <p className="mt-3 mx-auto max-w-md text-[15px] text-[#111]/60">We’ve emailed you a link to your partner page. We’ll check your listing, usually within two working days, and email you when it’s approved.</p>
            <Link to={`/partner/${done}`} className="group mt-8 h-12 px-7 inline-flex items-center gap-2 rounded-full bg-[#111] text-white text-[15px] font-medium hover:bg-black transition-colors">
              Open your partner page <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
        ) : (
          <motion.form key="form" onSubmit={submit} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -10 }} className="mt-10 grid gap-3 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-[28px] bg-white p-6 sm:p-8 space-y-5">
              <p className="text-lg font-semibold tracking-[-0.01em]">Your business</p>
              <Field label="Business name">
                <input required maxLength={80} value={form.name} onChange={e => set('name', e.target.value)} className={input} placeholder="Himalayan Cabs" />
              </Field>
              <div>
                <span className="block text-sm font-medium mb-1.5">What do you do?</span>
                <div className="flex flex-wrap gap-1.5">
                  {PARTNER_CATEGORIES.map(c => (
                    <button type="button" key={c.id} onClick={() => set('category', c.id)} className={`h-10 px-4 rounded-full text-sm font-medium transition-colors ${form.category === c.id ? 'bg-[#111] text-white' : 'bg-[#f4f5f2] hover:bg-[#e9ebe6]'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="One line guests will see" hint="Up to 120 characters.">
                <input maxLength={120} value={form.tagline} onChange={e => set('tagline', e.target.value)} className={input} placeholder="Airport transfers and day trips" />
              </Field>
              <Field label="About you" hint="Optional. Up to 600 characters.">
                <textarea maxLength={600} rows={4} value={form.description} onChange={e => set('description', e.target.value)} className={`${input} h-auto py-3 resize-none`} placeholder="Clean cars, local drivers who know every road." />
              </Field>
              <Field label="An offer for hotel guests" hint="Optional, but listings with an offer get more calls.">
                <input maxLength={120} value={form.offerText} onChange={e => set('offerText', e.target.value)} className={input} placeholder="10% off for hotel guests" />
              </Field>
              <PhotoField value={form.photo} onChange={v => set('photo', v)} />
            </div>

            <div className="space-y-3">
              <div className="rounded-[28px] bg-white p-6 sm:p-8 grid gap-5 sm:grid-cols-2">
                <p className="sm:col-span-2 text-lg font-semibold tracking-[-0.01em]">How to reach you</p>
                <Field label="Your name">
                  <input required maxLength={80} value={form.ownerName} onChange={e => set('ownerName', e.target.value)} className={input} placeholder="Ravi Thakur" autoComplete="name" />
                </Field>
                <Field label="Email" hint="Your partner page link and guest requests come here.">
                  <input required type="email" value={form.email} onChange={e => set('email', e.target.value)} className={input} placeholder="you@example.com" autoComplete="email" />
                </Field>
                <Field label="Phone guests call">
                  <input required type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className={input} placeholder="98765 43210" autoComplete="tel" />
                </Field>
                <div>
                  <span className="block text-sm font-medium mb-1.5">WhatsApp</span>
                  {sameWhatsapp ? (
                    <button type="button" onClick={() => setSameWhatsapp(false)} className="w-full h-12 px-4 rounded-2xl bg-[#f4f5f2] text-left text-[15px] text-[#111]/60 inline-flex items-center gap-2">
                      <Check className="size-4" /> Same as phone · change
                    </button>
                  ) : (
                    <input type="tel" value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} className={input} placeholder="WhatsApp number" />
                  )}
                </div>
                <Field label="Address" wide>
                  <input maxLength={200} value={form.address} onChange={e => set('address', e.target.value)} className={input} placeholder="Upper Mall, Kasauli" />
                </Field>
                <Field label="Google Maps link" hint="Optional. Share → Copy link in Google Maps.">
                  <input type="url" value={form.mapsUrl} onChange={e => set('mapsUrl', e.target.value)} className={input} placeholder="https://maps.app.goo.gl/…" />
                </Field>
                <Field label="Opening hours">
                  <input maxLength={80} value={form.openingHours} onChange={e => set('openingHours', e.target.value)} className={input} placeholder="7am – 10pm, every day" />
                </Field>
              </div>

              <div className="rounded-[28px] bg-white p-6 sm:p-8">
                <p className="text-lg font-semibold tracking-[-0.01em]">Where you serve</p>
                <p className="mt-1 text-sm text-[#111]/55">You’ll show to guests at hotels in these places. Pick a district to cover all of it.</p>
                <div className="mt-4"><AreaChips value={form.areas} onChange={v => set('areas', v)} /></div>
              </div>

              {error && <p className="rounded-2xl bg-[#ffe9e5] px-4 py-3 text-sm text-[#8a1c0a]">{error}</p>}
              <div className="rounded-[28px] bg-[#111] text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-sm text-white/60 max-w-xs">Nothing to pay now. You pay after we approve your listing.</p>
                <button disabled={busy} className="h-12 px-7 inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#111] text-[15px] font-medium hover:bg-white/90 disabled:opacity-60 transition-colors">
                  {busy ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : <>Send application <ArrowRight className="size-4" /></>}
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </section>
  );
}

function PhotoField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadImageToCloudinary(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };
  return (
    <div>
      <span className="block text-sm font-medium mb-1.5">A photo</span>
      {value ? (
        <div className="relative rounded-2xl overflow-hidden h-40">
          <img src={value} alt="" className="w-full h-full object-cover" />
          <button type="button" onClick={() => onChange('')} aria-label="Remove photo" className="absolute top-2 right-2 size-8 rounded-full bg-white/90 flex items-center justify-center"><X className="size-4" /></button>
        </div>
      ) : (
        <label className="h-28 rounded-2xl border-2 border-dashed border-black/10 flex flex-col items-center justify-center gap-1.5 text-sm text-[#111]/55 cursor-pointer hover:bg-[#f4f5f2] transition-colors">
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          {uploading ? 'Uploading…' : 'Your car, your shop, your view'}
          <input type="file" accept="image/*" className="sr-only" onChange={pick} />
        </label>
      )}
      {error && <p className="mt-1.5 text-xs text-[#8a1c0a]">{error}</p>}
    </div>
  );
}

const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());

/** Districts and their places, the same list hotels pick their location from, so areas match hotels. */
function AreaChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [other, setOther] = useState('');
  const toggle = (a: string) => onChange(value.includes(a) ? value.filter(x => x !== a) : [...value, a]);
  const known = new Set(HIMACHAL_PLACES.flatMap(g => [g.district.toLowerCase(), ...g.places.map(p => p.toLowerCase())]));
  const extras = value.filter(v => !known.has(v));
  const addOther = () => {
    const v = other.trim().toLowerCase();
    if (v && !value.includes(v)) onChange([...value, v]);
    setOther('');
  };
  return (
    <div className="space-y-3">
      {HIMACHAL_PLACES.map(g => {
        const d = g.district.toLowerCase();
        const districtOn = value.includes(d);
        return (
          <div key={g.district} className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => toggle(d)} className={`h-9 px-3.5 rounded-full text-sm font-semibold transition-colors ${districtOn ? 'bg-[#111] text-white' : 'bg-[#f4f5f2] hover:bg-[#e9ebe6]'}`}>
              {g.district} <span className={`font-normal ${districtOn ? 'text-white/65' : 'text-[#111]/45'}`}>district</span>
            </button>
            {g.places.filter(p => p.toLowerCase() !== d).map(p => {
              const on = value.includes(p.toLowerCase());
              return (
                <button type="button" key={p} disabled={districtOn} onClick={() => toggle(p.toLowerCase())} className={`h-9 px-3.5 rounded-full text-sm transition-colors disabled:opacity-35 ${on ? 'bg-[#d4ff5a] font-medium' : 'border border-black/10 hover:bg-[#f4f5f2]'}`}>
                  {p}
                </button>
              );
            })}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {extras.map(x => (
          <span key={x} className="h-9 pl-3.5 pr-1 rounded-full bg-[#d4ff5a] text-sm inline-flex items-center gap-1">
            {titleCase(x)}
            <button type="button" onClick={() => toggle(x)} aria-label={`Remove ${x}`} className="size-7 rounded-full hover:bg-black/10 flex items-center justify-center"><X className="size-3.5" /></button>
          </span>
        ))}
        <input value={other} onChange={e => setOther(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOther(); } }} placeholder="Another place" className="h-9 w-40 px-3.5 rounded-full border border-black/10 text-sm focus:outline-none focus:border-[#111]/40" />
        <button type="button" onClick={addOther} className="size-9 rounded-full bg-[#f4f5f2] flex items-center justify-center" aria-label="Add place"><Plus className="size-4" /></button>
      </div>
    </div>
  );
}
