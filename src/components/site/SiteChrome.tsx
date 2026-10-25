import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { ArrowUpRight, Mail, MapPin, Menu, X } from 'lucide-react';

/**
 * Header, footer and page frame shared by the public website: the home
 * page (MarketingPage) and the legal/contact pages under src/pages/site.
 * Kept in one place so a link or the contact address only ever changes
 * here.
 */

export const CONTACT_EMAIL = 'info@churmuri.com';
/** Cabadra is run by Churmuri; this is the business named on the legal pages. */
export const COMPANY_NAME = 'Churmuri';
export const COMPANY_LOCATION = 'Solan, Himachal Pradesh, India';

/** Section anchors on the home page. On any other page they link back to `/#…`. */
export const NAV_LINKS = [
  { hash: 'features', label: 'Features' },
  { hash: 'how', label: 'How it works' },
  { hash: 'experiences', label: 'Experiences' },
  { hash: 'pricing', label: 'Pricing' },
];

const LEGAL_LINKS = [
  { to: '/privacy', label: 'Privacy policy' },
  { to: '/terms', label: 'Terms & conditions' },
  { to: '/refund-policy', label: 'Refund & cancellation' },
];

/**
 * Wraps every public page: honours the visitor's "reduce motion" setting
 * for all animations inside, and scrolls to the top (or to the #anchor) on
 * navigation, which a single-page app doesn't do by itself.
 */
export function SiteShell({ children }: { children: React.ReactNode }) {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      // Wait a frame so the target section has rendered after a route change.
      requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }));
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="site-shell min-h-screen bg-[#eef0ec] text-[#111] font-sans antialiased">{children}</div>
    </MotionConfig>
  );
}

function navHref(hash: string, onHome: boolean) {
  return onHome ? `#${hash}` : `/#${hash}`;
}

/** Top bar: logo, section links, and the Sign in / Sign up pair. Collapses into a menu below md. */
export function SiteNav() {
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="relative z-30">
      <div className="flex items-center justify-between gap-4">
        <Link to="/" className="text-[26px] sm:text-[30px] font-semibold tracking-[-0.03em]">
          Cabadra
        </Link>
        <nav className="hidden md:flex items-center gap-10 text-[15px] text-[#1b1b1b]/85">
          {NAV_LINKS.map(link => (
            <a key={link.hash} href={navHref(link.hash, onHome)} className="relative hover:text-black transition-colors after:absolute after:left-0 after:-bottom-1 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-300 hover:after:scale-x-100">
              {link.label}
            </a>
          ))}
          <Link to="/partners" className={`relative hover:text-black transition-colors after:absolute after:left-0 after:-bottom-1 after:h-px after:w-full after:origin-left after:bg-current after:transition-transform after:duration-300 hover:after:scale-x-100 ${pathname === '/partners' ? 'text-black after:scale-x-100' : 'after:scale-x-0'}`}>
            Partners
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden sm:inline-flex h-10 px-5 items-center rounded-full border border-black/15 bg-white/50 backdrop-blur text-sm font-medium hover:bg-white/80 transition-colors"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="h-10 px-4 sm:px-5 inline-flex items-center rounded-full bg-[#111] text-white text-sm font-medium hover:bg-black transition-colors"
          >
            Sign up
          </Link>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="md:hidden size-10 inline-flex items-center justify-center rounded-full border border-black/15 bg-white/50 backdrop-blur"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="md:hidden absolute left-0 right-0 top-14 rounded-3xl bg-white p-3 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
          >
            {NAV_LINKS.map(link => (
              <a
                key={link.hash}
                href={navHref(link.hash, onHome)}
                onClick={() => setOpen(false)}
                className="block rounded-2xl px-4 py-3 text-[15px] font-medium hover:bg-[#f2f2f0]"
              >
                {link.label}
              </a>
            ))}
            <Link to="/partners" className="block rounded-2xl px-4 py-3 text-[15px] font-medium hover:bg-[#f2f2f0]">
              Partners · for local businesses
            </Link>
            <Link to="/contact" className="block rounded-2xl px-4 py-3 text-[15px] font-medium hover:bg-[#f2f2f0]">
              Contact
            </Link>
            <Link to="/login" className="mt-2 flex h-12 items-center justify-center rounded-full border border-black/15 text-[15px] font-medium">
              Sign in
            </Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

/** Closing call to action plus the full site footer: product, company and legal links, contact details. */
export function SiteFooter({ showCta = true }: { showCta?: boolean }) {
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  const year = new Date().getFullYear();

  return (
    <footer className="mx-auto max-w-6xl px-5 sm:px-8 pt-24 sm:pt-32 pb-8">
      {showCta && (
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '0px 0px -10% 0px' }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-[32px] bg-[#111] text-white p-8 sm:p-12 flex flex-col md:flex-row md:items-center justify-between gap-8"
        >
          <div>
            <p className="text-[28px] sm:text-4xl font-semibold tracking-[-0.03em]">Ready when your guests are.</p>
            <p className="mt-2 text-[15px] text-white/60">Keep your PMS. Start capturing every extra.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/login" className="h-12 px-6 inline-flex items-center rounded-full border border-white/25 text-[15px] font-medium hover:bg-white/10 transition-colors">
              Sign in
            </Link>
            <Link to="/signup" className="group h-12 px-6 inline-flex items-center gap-1.5 rounded-full bg-white text-[#111] text-[15px] font-medium hover:bg-white/90 transition-colors">
              Sign up
              <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </motion.div>
      )}

      <div className={`${showCta ? 'mt-3' : ''} rounded-[32px] bg-white p-8 sm:p-12`}>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link to="/" className="text-[28px] font-semibold tracking-[-0.03em]">
              Cabadra
            </Link>
            <p className="mt-3 max-w-xs text-[15px] text-[#111]/60 leading-relaxed">
              The guest app and charge capture layer for hotels and homestays. Works alongside your PMS.
            </p>
          </div>

          <FooterColumn title="Product">
            {NAV_LINKS.map(link => (
              <FooterLink key={link.hash} href={navHref(link.hash, onHome)}>
                {link.label}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title="Company">
            <FooterLink to="/contact">Contact us</FooterLink>
            <FooterLink to="/partners">List your business</FooterLink>
            <FooterLink to="/signup">Create an account</FooterLink>
            <FooterLink to="/login">Sign in</FooterLink>
          </FooterColumn>

          <FooterColumn title="Legal">
            {LEGAL_LINKS.map(link => (
              <FooterLink key={link.to} to={link.to}>
                {link.label}
              </FooterLink>
            ))}
          </FooterColumn>
        </div>

        <div className="mt-10 pt-6 border-t border-black/10 flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm text-[#111]/55">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-6">
            <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 hover:text-[#111] transition-colors">
              <Mail className="size-4" />
              {CONTACT_EMAIL}
            </a>
            <span className="inline-flex items-center gap-2">
              <MapPin className="size-4" />
              {COMPANY_LOCATION}
            </span>
          </div>
          <p>
            © {year} Cabadra · A {COMPANY_NAME} product
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-[#111]/45">{title}</p>
      <ul className="mt-4 space-y-3">{children}</ul>
    </div>
  );
}

function FooterLink({ to, href, children }: { to?: string; href?: string; children: React.ReactNode }) {
  const className = 'text-[15px] text-[#111]/75 hover:text-[#111] transition-colors';
  return (
    <li>
      {to ? (
        <Link to={to} className={className}>
          {children}
        </Link>
      ) : (
        <a href={href} className={className}>
          {children}
        </a>
      )}
    </li>
  );
}
