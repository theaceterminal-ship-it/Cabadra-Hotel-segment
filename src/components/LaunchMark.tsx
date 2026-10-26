import React from 'react';
import { motion } from 'motion/react';

/**
 * The Cabadra mark ("C" with the lime dot), centred on the app background:
 * what the guest sees between the phone's launch screen and the welcome.
 * Drawn exactly like the placeholder in index.html, so the hand-over from
 * the static page to React is invisible; it only starts breathing gently
 * if loading takes a moment.
 */
export function LaunchMark() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-surface" role="status" aria-label="Loading">
      <motion.span
        className="relative text-on-surface"
        style={{ font: '300 112px/1 Geist, -apple-system, Segoe UI, Roboto, sans-serif', letterSpacing: '-0.04em' }}
        animate={{ opacity: [1, 0.55, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
      >
        C
        <span className="absolute rounded-full bg-[#b5d96a]" style={{ right: -6, bottom: 14, width: 22, height: 22 }} />
      </motion.span>
    </div>
  );
}
