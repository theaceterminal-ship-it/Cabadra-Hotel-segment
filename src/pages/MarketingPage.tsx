import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowRight,
  BellOff,
  Building2,
  Hash,
  MapPin,
  QrCode,
  ReceiptText,
  Smartphone,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';

/**
 * Public website at `/` for signed-out visitors — what a hotelier sees
 * before they have an account. Signed-in staff never land here; LandingPage
 * routes them straight to their app.
 *
 * Positioning: Cabadra is not a PMS. It sits alongside whatever PMS the
 * hotel already runs and captures every charge except the room itself
 * (room service, laundry, spa, transfers, experiences), handing over one
 * total at checkout to post into that PMS. The built-in basic PMS is a
 * footnote for hotels that have none, not the pitch. Name other PMS
 * products only as "works alongside", never as an integration.
 *
 * Deliberately its own palette rather than the staff theme tokens
 * (bg-surface etc.): the staff theme follows the in-app dark-mode switch,
 * while this page sits on a photo and should look the same for everyone.
 *
 * The hero photo is /landing/hero.jpg (drop the file into public/landing/).
 * Until it exists the CSS falls back to a misty green gradient, so the page
 * never renders on a blank background.
 */

/** Set once the one-time setup fee is decided. While null, the pricing card says the fee is shared during onboarding instead of showing a number. */
const SETUP_FEE_INR: number | null = null;

const HERO_BG =
  "url('/landing/hero.jpg'), linear-gradient(180deg, #e9ecea 0%, #c9d3cc 38%, #6f8a6a 72%, #8fa64e 100%)";

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
  { href: '#experiences', label: 'Experiences' },
  { href: '#pricing', label: 'Pricing' },
];

const HERO_CHIPS = ['Works with any PMS', 'Every extra charge captured', 'Guest app, no download needed'];

const FEATURES = [
  { icon: Smartphone, title: 'Guest app', body: 'Guests scan the room QR to order food, book the spa or ask for towels. Nothing to install.' },
  { icon: QrCode, title: 'Straight to the right department', body: 'Orders and requests land on the kitchen, housekeeping or spa screen. Staff pick them up with a badge scan.' },
  { icon: BellOff, title: 'No calls, slips or WhatsApp', body: 'Nothing gets lost between the guest and your team, and nobody has to chase it.' },
  { icon: ReceiptText, title: 'One checkout total', body: 'Room service, laundry, spa, transfers and experiences add up to one total. Post it into your PMS.' },
  { icon: UtensilsCrossed, title: 'No more missed charges', body: 'Each order is charged when it’s placed, so nothing is forgotten at checkout.' },
  { icon: Sparkles, title: 'New income from extras', body: 'Guests book experiences and extras from their phone, money you’re not making today.' },
];

const STEPS = [
  { n: '01', title: 'Sign up', body: 'Create your account with Google or email and password.' },
  { n: '02', title: 'One-time setup', body: 'Pay the setup fee once and your owner dashboard opens.' },
  { n: '03', title: 'Add your property', body: 'Add your menu, services and departments, then put a QR in each room. Keep your PMS as it is.' },
];

const FAQS = [
  { q: 'Do I have to replace my PMS?', a: 'No. Cabadra works alongside eZee, Hotelogix or whatever you use today. At checkout you get one total of extras to post into your PMS. No integration needed.' },
  { q: 'What if I don’t have a PMS?', a: 'A simple one is built in, with rooms, bookings and check-in. Use it for as long as it’s enough.' },
  { q: 'Do guests need to download an app?', a: 'No. They scan the QR in their room and it opens in the browser. They can add it to their home screen if they like.' },
  { q: 'Does every staff member need a login?', a: 'No. Departments work from their own screen, and staff start a shift by scanning their badge.' },
  { q: 'Can I run more than one property?', a: 'Yes. Add properties from your owner dashboard at any time. Each one keeps its own menu, services, staff and settings.' },
];

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-[#eef0ec] text-[#111] font-sans antialiased">
      <Hero />
      <WorksAlongside />
      <Features />
      <HowItWorks />
      <Experiences />
      <Pricing />
      <Faq />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="p-2 sm:p-4">
      <div
        className="relative overflow-hidden rounded-[28px] sm:rounded-[40px] min-h-[100svh] sm:min-h-[calc(100svh-2rem)] flex flex-col bg-cover bg-center"
        style={{ backgroundImage: HERO_BG }}
      >
        {/* A light haze at the top keeps the dark headline readable without washing out the sky behind the white highlight; a light shade at the bottom lifts the setup bar. */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(242,244,242,0.45)_0%,rgba(242,244,242,0.15)_30%,rgba(0,0,0,0)_55%,rgba(0,0,0,0.12)_100%)]" />

        <div className="relative z-10 flex flex-col flex-1 px-5 sm:px-10 lg:px-14 pt-5 sm:pt-8 pb-5 sm:pb-10">
          <Nav />

          <div className="mt-14 sm:mt-20 pb-10 sm:pb-0 text-center">
            <h1 className="mx-auto max-w-4xl text-[40px] leading-[1.02] sm:text-6xl lg:text-[76px] font-semibold tracking-[-0.035em]">
              Keep Your PMS.{' '}
              <br className="hidden sm:block" />
              Capture <span className="text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.25)]">Every Extra</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[15px] sm:text-lg text-[#1b1b1b]/80">
              Room service, laundry, spa, transfers and experiences, ordered from the guest app and added up for checkout. You post one total into your PMS.
            </p>
          </div>

          <div className="hidden sm:grid mt-auto gap-8 lg:grid-cols-3 items-end pt-10 pb-10">
            <ul className="flex flex-col gap-2.5">
              {HERO_CHIPS.map(text => (
                <li key={text}>
                  <NotchedChip>{text}</NotchedChip>
                </li>
              ))}
            </ul>

            <div className="hidden lg:flex justify-center">
              <a href="#how" className="group relative block size-[120px]" aria-label="See how it works">
                <span className="absolute z-10 -top-9 -left-8 text-left text-[17px] leading-tight font-medium text-[#111]">
                  See how
                  <br />
                  <span className="pl-8">it works</span>
                </span>
                <span className="absolute inset-0 rounded-full border-2 border-[#111]/80 bg-white/15 backdrop-blur-sm transition-transform duration-300 group-hover:scale-105" />
                <span className="absolute inset-0 flex items-center justify-center text-[#111]">
                  <ArrowDown className="size-7 transition-transform duration-300 group-hover:translate-y-1" />
                </span>
              </a>
            </div>

            <div className="hidden lg:flex justify-end">
              <LiveTaskCard />
            </div>
          </div>

          <SetupBar />
        </div>
      </div>
    </section>
  );
}

function Nav() {
  return (
    <header className="flex items-center justify-between gap-4">
      <Link to="/" className="text-[26px] sm:text-[30px] font-semibold tracking-[-0.03em]">
        Cabadra
      </Link>
      <nav className="hidden md:flex items-center gap-10 text-[15px] text-[#1b1b1b]/85">
        {NAV_LINKS.map(link => (
          <a key={link.href} href={link.href} className="hover:text-black transition-colors">
            {link.label}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <Link
          to="/login"
          className="h-10 px-4 sm:px-5 inline-flex items-center rounded-full border border-black/15 bg-white/50 backdrop-blur text-sm font-medium hover:bg-white/80 transition-colors"
        >
          Sign in
        </Link>
        <Link
          to="/signup"
          className="h-10 px-4 sm:px-5 inline-flex items-center rounded-full bg-[#111] text-white text-sm font-medium hover:bg-black transition-colors"
        >
          Sign up
        </Link>
      </div>
    </header>
  );
}

/**
 * Outlined label with a pointed left edge and a line that fades out to the
 * right. Fixed width so the notch is the same size on every chip. The
 * frosted backing (clipped to the same notch) keeps the dark text readable
 * whether the chip lands on sky or on dark hillside.
 */
function NotchedChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative flex items-center h-12 w-[290px] pl-7 text-[15px] font-medium text-[#111]">
      <span
        aria-hidden="true"
        className="absolute inset-0 backdrop-blur-md bg-[linear-gradient(90deg,rgba(255,255,255,0.72)_0%,rgba(255,255,255,0.55)_75%,rgba(255,255,255,0)_100%)] [clip-path:polygon(15px_0,100%_0,100%_100%,15px_100%,0_50%)]"
      />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 290 48" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="chip-fade" x1="0" x2="290" y1="0" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#111" stopOpacity="0.75" />
            <stop offset="0.75" stopColor="#111" stopOpacity="0.35" />
            <stop offset="1" stopColor="#111" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M290 0.75H15L1 24L15 47.25H290" stroke="url(#chip-fade)" strokeWidth="1.5" />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}

/** A still of a guest order going to the kitchen and onto the stay's total — illustrates the product, not a live feed. */
function LiveTaskCard() {
  return (
    <div className="w-[300px] rounded-3xl border border-white/40 bg-white/25 backdrop-blur-xl p-4 text-white shadow-[0_8px_40px_rgba(0,0,0,0.12)]">
      <div className="flex items-center gap-3">
        <span className="size-10 shrink-0 rounded-full bg-white/90 text-[#111] flex items-center justify-center">
          <UtensilsCrossed className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] text-white/80">Room 204 · Guest app</p>
          <p className="text-[15px] font-medium truncate">Masala chai × 2</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/90 px-3.5 py-2.5 text-[#111]">
        <span className="inline-flex items-center gap-1.5 text-[13px]">
          <span className="size-2 rounded-full bg-[#5fae3e]" />
          Sent to kitchen
        </span>
        <span className="text-[13px] font-medium">₹180 on folio</span>
      </div>
    </div>
  );
}

/** Sits right under the hero. Plain text on purpose: these are PMS products Cabadra works next to, not integrations or partners, so no logos. */
function WorksAlongside() {
  return (
    <p className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-14 text-center text-[15px] sm:text-lg text-[#111]/60">
      Works alongside <span className="text-[#111] font-medium">eZee</span>,{' '}
      <span className="text-[#111] font-medium">Hotelogix</span> or any other PMS. No integration needed.
    </p>
  );
}

/**
 * Stands in for the reference design's search bar. Whatever the visitor
 * types is carried to /signup as query params so the sign-up screen can
 * greet the property by name; onboarding can read the same params later.
 */
function SetupBar() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [rooms, setRooms] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (name.trim()) params.set('property', name.trim());
    if (city.trim()) params.set('city', city.trim());
    if (rooms.trim()) params.set('rooms', rooms.trim());
    const qs = params.toString();
    navigate(qs ? `/signup?${qs}` : '/signup');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-sm:mt-auto rounded-[28px] sm:rounded-full bg-white p-2.5 sm:p-3 shadow-[0_10px_40px_rgba(0,0,0,0.12)] flex flex-col sm:flex-row gap-2 sm:gap-3"
    >
      <BarField icon={Building2} label="Property name" className="sm:flex-[1.6]">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Pine View Cottage" className={barInput} />
      </BarField>
      <BarField icon={MapPin} label="City" className="sm:flex-1">
        <input value={city} onChange={e => setCity(e.target.value)} placeholder="Kufri, Shimla" className={barInput} />
      </BarField>
      <BarField icon={Hash} label="Rooms" className="sm:flex-[0.8]">
        <input
          value={rooms}
          onChange={e => setRooms(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          placeholder="12"
          className={barInput}
        />
      </BarField>
      <button
        type="submit"
        className="h-14 sm:h-auto sm:min-h-[68px] px-8 rounded-full bg-[#111] text-white text-base font-medium hover:bg-black transition-colors inline-flex items-center justify-center gap-2 shrink-0"
      >
        Get started
        <ArrowRight className="size-4" />
      </button>
    </form>
  );
}

const barInput = 'w-full bg-transparent text-[15px] text-[#111] placeholder:text-[#111]/35 focus:outline-none';

function BarField({
  icon: Icon,
  label,
  className = '',
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex items-center gap-3 rounded-full border border-black/10 px-3 py-2.5 sm:py-3 focus-within:border-black/40 transition-colors cursor-text ${className}`}
    >
      <span className="size-10 shrink-0 rounded-full bg-[#f2f2f0] flex items-center justify-center text-[#111]">
        <Icon className="size-[18px]" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-[#111]/50">{label}</span>
        {children}
      </span>
    </label>
  );
}

function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: React.ReactNode; body?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-medium text-[#111]/50">{eyebrow}</p>
      <h2 className="mt-3 text-[32px] sm:text-5xl leading-[1.05] font-semibold tracking-[-0.03em]">{title}</h2>
      {body && <p className="mt-4 text-[15px] sm:text-lg text-[#111]/65">{body}</p>}
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-6 mx-auto max-w-6xl px-5 sm:px-8 pt-24 sm:pt-32">
      <SectionHeading
        eyebrow="Features"
        title="Less running around. More on every bill."
        body="Guests order from their phone, the right department gets it straight away, and every charge adds up to one total for checkout."
      />
      <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-[28px] bg-white p-6 sm:p-7">
            <span className="size-11 rounded-full bg-[#eef0ec] flex items-center justify-center">
              <Icon className="size-5" />
            </span>
            <h3 className="mt-8 text-lg font-semibold tracking-[-0.01em]">{title}</h3>
            <p className="mt-2 text-[15px] text-[#111]/60 leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-[15px] text-[#111]/55">
        <span className="font-medium text-[#111]">No PMS?</span> A simple one is built in, with rooms, bookings and check-in.
      </p>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-6 mx-auto max-w-6xl px-5 sm:px-8 pt-24 sm:pt-32">
      <SectionHeading eyebrow="How it works" title="Up and running in three steps" />
      <ol className="mt-12 grid gap-3 md:grid-cols-3">
        {STEPS.map(step => (
          <li key={step.n} className="rounded-[28px] border border-black/10 p-6 sm:p-7">
            <span className="text-sm font-medium text-[#111]/40">{step.n}</span>
            <h3 className="mt-10 text-xl font-semibold tracking-[-0.01em]">{step.title}</h3>
            <p className="mt-2 text-[15px] text-[#111]/60 leading-relaxed">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Experiences() {
  return (
    <section id="experiences" className="scroll-mt-6 mx-auto max-w-6xl px-5 sm:px-8 pt-24 sm:pt-32">
      <div
        className="relative overflow-hidden rounded-[32px] sm:rounded-[40px] bg-cover bg-center min-h-[460px] flex"
        style={{ backgroundImage: HERO_BG }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,14,10,0.72)_0%,rgba(10,14,10,0.35)_55%,rgba(10,14,10,0.1)_100%)]" />
        <div className="relative z-10 grid gap-10 lg:grid-cols-2 items-end w-full p-6 sm:p-12">
          <div className="text-white max-w-lg">
            <p className="text-sm font-medium text-white/65">Exclusive Experiences</p>
            <h2 className="mt-3 text-[32px] sm:text-5xl leading-[1.05] font-semibold tracking-[-0.03em]">
              Guests ask what to do. Answer with a tap.
            </h2>
            <p className="mt-4 text-[15px] sm:text-lg text-white/75">
              List treks, bonfires, transfers and anything else you offer. Guests book from their phone and your team gets the request straight away. That’s income you miss when nobody asks.
            </p>
          </div>
          <div className="lg:justify-self-end w-full max-w-sm rounded-3xl bg-white p-4 text-[#111]">
            <div className="flex items-start gap-3">
              <span className="size-12 shrink-0 rounded-2xl bg-[#eef0ec] flex items-center justify-center">
                <Sparkles className="size-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[#111]/50">Exclusive Experiences</p>
                <p className="text-base font-semibold">Sunset bonfire & dinner</p>
                <p className="text-[13px] text-[#111]/60">Per person · tonight, 7 pm</p>
              </div>
            </div>
            <div aria-hidden="true" className="mt-4 h-11 rounded-full bg-[#111] text-white text-sm font-medium flex items-center justify-center">
              Book now
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-6 mx-auto max-w-6xl px-5 sm:px-8 pt-24 sm:pt-32">
      <SectionHeading eyebrow="Pricing" title="One setup fee. Then it’s yours to run." />
      <div className="mt-12 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[28px] bg-[#111] text-white p-7 sm:p-10">
          <p className="text-sm text-white/60">One-time setup</p>
          <p className="mt-4 text-5xl sm:text-6xl font-semibold tracking-[-0.03em]">
            {SETUP_FEE_INR !== null ? `₹${SETUP_FEE_INR.toLocaleString('en-IN')}` : 'Setup fee'}
          </p>
          <p className="mt-3 text-[15px] text-white/60">
            {SETUP_FEE_INR !== null ? 'Paid once when you sign up.' : 'Shared with you during sign-up, before you pay anything.'}
          </p>
          <Link
            to="/signup"
            className="mt-10 h-12 px-7 inline-flex items-center gap-2 rounded-full bg-white text-[#111] text-[15px] font-medium hover:bg-white/90 transition-colors"
          >
            Get started
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <ul className="rounded-[28px] bg-white p-7 sm:p-10 space-y-4 text-[15px]">
          {[
            'Guest app for orders, requests and bookings',
            'Department screens and staff badges',
            'One total of extras per stay, ready for your PMS',
            'Experiences guests book from their phone',
            'Owner dashboard for all your properties',
            'A simple built-in PMS, if you don’t have one',
          ].map(item => (
            <li key={item} className="flex items-start gap-3">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#111]" />
              <span className="text-[#111]/75">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-24 sm:pt-32">
      <SectionHeading eyebrow="FAQ" title="Questions hoteliers ask" />
      <div className="mt-10 divide-y divide-black/10 border-y border-black/10">
        {FAQS.map(item => (
          <details key={item.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-base sm:text-lg font-medium [&::-webkit-details-marker]:hidden">
              {item.q}
              <span className="size-8 shrink-0 rounded-full border border-black/15 flex items-center justify-center text-lg leading-none transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 max-w-2xl text-[15px] text-[#111]/60 leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-5 sm:px-8 pt-24 sm:pt-32 pb-10">
      <div className="rounded-[32px] bg-white p-8 sm:p-12 flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div>
          <p className="text-[28px] sm:text-4xl font-semibold tracking-[-0.03em]">Ready when your guests are.</p>
          <p className="mt-2 text-[15px] text-[#111]/60">Keep your PMS. Start capturing every extra.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/login" className="h-12 px-6 inline-flex items-center rounded-full border border-black/15 text-[15px] font-medium hover:bg-black/5 transition-colors">
            Sign in
          </Link>
          <Link to="/signup" className="h-12 px-6 inline-flex items-center rounded-full bg-[#111] text-white text-[15px] font-medium hover:bg-black transition-colors">
            Sign up
          </Link>
        </div>
      </div>
      <p className="mt-8 text-center text-sm text-[#111]/45">© {new Date().getFullYear()} Cabadra</p>
    </footer>
  );
}
