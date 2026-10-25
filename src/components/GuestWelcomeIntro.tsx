import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const EASE = [0.22, 1, 0.36, 1] as const;

/** A short line for the time of day. Warm, and true wherever the hotel is. */
function phraseFor(hour: number) {
  if (hour >= 5 && hour < 12) return 'The kettle’s on. Take your time.';
  if (hour >= 12 && hour < 17) return 'Settle in. We’ll handle the rest.';
  if (hour >= 17 && hour < 22) return 'Kick back. We’re just a tap away.';
  return 'Rest easy. We’re up if you need us.';
}

/** Played once per visit per stay; reopening the app later the same visit skips it. */
const seenKey = (token: string) => `cabadra_welcome_${token}`;

export function shouldPlayWelcome(token: string): boolean {
  try { return sessionStorage.getItem(seenKey(token)) !== '1'; } catch { return true; }
}

/**
 * The guest's welcome: "Welcome," then their name letter by letter, a
 * short line for the time of day, and then the whole screen lifts away like
 * a curtain onto the home screen. About three seconds; a tap anywhere skips
 * it. With reduced motion it's a plain fade.
 */
export function GuestWelcomeIntro({ token, guestName, propertyName, onDone }: {
  token: string;
  guestName: string;
  propertyName: string;
  onDone: () => void;
}) {
  const reduce = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const firstName = guestName.trim().split(/\s+/)[0] || guestName;
  const phrase = phraseFor(new Date().getHours());

  useEffect(() => {
    try { sessionStorage.setItem(seenKey(token), '1'); } catch { /* private mode: it plays again next time, which is fine */ }
    const t = setTimeout(() => setLeaving(true), reduce ? 1600 : 3000);
    return () => clearTimeout(t);
  }, [token, reduce]);

  return (
    <motion.div
      role="dialog"
      aria-label={`Welcome, ${firstName}`}
      onClick={() => setLeaving(true)}
      className="fixed inset-0 z-[100] bg-surface text-on-surface flex flex-col items-center justify-center px-8 overflow-hidden cursor-pointer"
      initial={false}
      animate={leaving ? (reduce ? { opacity: 0 } : { y: '-100%', borderBottomLeftRadius: 48, borderBottomRightRadius: 48 }) : { y: 0, opacity: 1 }}
      transition={{ duration: reduce ? 0.3 : 0.85, ease: EASE }}
      onAnimationComplete={() => { if (leaving) onDone(); }}
    >
      {/* Soft lime glow behind the name, breathing slowly. */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="absolute w-[120vw] max-w-[640px] aspect-square rounded-full bg-[radial-gradient(circle,rgba(181,217,106,0.45)_0%,rgba(181,217,106,0)_62%)]"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: [0.6, 1.05, 0.95], opacity: [0, 1, 0.8] }}
          transition={{ duration: 2.6, ease: 'easeOut' }}
        />
      )}

      <div className="relative text-center">
        <motion.p
          className="text-sm font-medium text-on-surface-variant"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
        >
          {propertyName}
        </motion.p>

        <span className="block overflow-hidden mt-4">
          <motion.span
            className="block text-[22px] font-medium tracking-[-0.02em] text-on-surface-variant"
            initial={{ y: reduce ? 0 : '110%', opacity: reduce ? 0 : 1 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.25, ease: EASE }}
          >
            Welcome,
          </motion.span>
        </span>

        <h1 className="mt-1 text-[54px] sm:text-[72px] leading-[1] font-semibold tracking-[-0.045em]" aria-hidden>
          {[...firstName].map((ch, i) => (
            <span key={i} className="inline-block overflow-hidden align-bottom">
              <motion.span
                className="inline-block"
                initial={{ y: reduce ? 0 : '105%', opacity: reduce ? 0 : 1, rotate: reduce ? 0 : 6 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                transition={{ duration: 0.55, delay: 0.55 + i * 0.05, ease: EASE }}
              >
                {ch === ' ' ? ' ' : ch}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.span
          aria-hidden
          className="block mx-auto mt-4 h-[3px] rounded-full bg-room-ready"
          initial={{ width: 0 }}
          animate={{ width: 56 }}
          transition={{ duration: 0.6, delay: 0.75 + firstName.length * 0.05, ease: EASE }}
        />

        <motion.p
          className="mt-5 text-[17px] text-on-surface-variant"
          initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.7, delay: 1.0 + firstName.length * 0.05, ease: EASE }}
        >
          {phrase}
        </motion.p>
      </div>

      <motion.p
        className="absolute bottom-10 text-xs text-on-surface-variant"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ delay: 1.6 }}
      >
        Tap to continue
      </motion.p>
    </motion.div>
  );
}
