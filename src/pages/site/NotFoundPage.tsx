import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { SiteFooter, SiteNav, SiteShell } from '../../components/site/SiteChrome';
import { usePageTitle } from './usePageTitle';

/** Catch-all for any URL no route matches — without it the app renders an empty page. */
export default function NotFoundPage() {
  usePageTitle('Page not found');

  return (
    <SiteShell>
      <div className="px-5 sm:px-10 lg:px-14 pt-5 sm:pt-8 mx-auto max-w-7xl">
        <SiteNav />
      </div>
      <main className="mx-auto max-w-3xl px-5 sm:px-8 pt-24 sm:pt-36 text-center">
        <motion.p
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-[96px] sm:text-[160px] leading-none font-semibold tracking-[-0.05em] text-[#111]/10"
        >
          404
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-[-0.03em]">This page doesn’t exist</h1>
          <p className="mt-3 text-[15px] text-[#111]/60">
            If you’re a guest, scan the QR code in your room again to open your stay.
          </p>
          <Link to="/" className="mt-8 inline-flex h-12 px-7 items-center rounded-full bg-[#111] text-white text-[15px] font-medium hover:bg-black transition-colors">
            Back to home
          </Link>
        </motion.div>
      </main>
      <SiteFooter showCta={false} />
    </SiteShell>
  );
}
