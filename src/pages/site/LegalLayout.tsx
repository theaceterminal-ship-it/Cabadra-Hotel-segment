import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { SiteFooter, SiteNav, SiteShell } from '../../components/site/SiteChrome';
import { usePageTitle } from './usePageTitle';

/**
 * Frame for the long-form public pages (privacy, terms, refunds, contact):
 * the site header on a plain background, a readable text column, and the
 * full footer without the sign-up banner.
 */
export default function LegalLayout({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  /** Shown as "Last updated …". Change it whenever the wording changes. */
  updated?: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  usePageTitle(title);

  return (
    <SiteShell>
      <div className="px-5 sm:px-10 lg:px-14 pt-5 sm:pt-8 mx-auto max-w-7xl">
        <SiteNav />
      </div>

      <main className="mx-auto max-w-3xl px-5 sm:px-8 pt-16 sm:pt-24">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <Link to="/" className="text-sm font-medium text-[#111]/50 hover:text-[#111] transition-colors">
            ← Back to home
          </Link>
          <h1 className="mt-6 text-[40px] sm:text-6xl leading-[1.02] font-semibold tracking-[-0.035em]">{title}</h1>
          {updated && <p className="mt-4 text-sm text-[#111]/45">Last updated: {updated}</p>}
          {intro && <div className="mt-6 text-[17px] sm:text-lg text-[#111]/70 leading-relaxed">{intro}</div>}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 rounded-[32px] bg-white p-6 sm:p-10"
        >
          {children}
        </motion.div>
      </main>

      <SiteFooter showCta={false} />
    </SiteShell>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 first:mt-0 text-xl font-semibold tracking-[-0.01em]">{children}</h2>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[15px] text-[#111]/70 leading-relaxed">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mt-3 space-y-2 text-[15px] text-[#111]/70 leading-relaxed list-disc pl-5 marker:text-[#111]/30">{children}</ul>;
}
