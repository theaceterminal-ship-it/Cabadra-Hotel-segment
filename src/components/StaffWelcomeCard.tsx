import React from 'react';
import { motion } from 'motion/react';
import { Clock } from 'lucide-react';

const FALLBACK_HOTEL_IMAGE = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80';
const EASE = [0.22, 1, 0.36, 1] as const;

function greeting(hour: number) {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** A short line for the time of day: warm, not a poster. */
function lineFor(hour: number) {
  if (hour >= 5 && hour < 12) return 'A fresh day. Someone’s stay starts with you.';
  if (hour >= 12 && hour < 17) return 'Guests notice the little things. Thank you for them.';
  if (hour >= 17 && hour < 22) return 'Evening rush. You’ve got this.';
  return 'Quiet hours matter too. Thanks for being here.';
}

/**
 * The staff's own welcome, built like the guest app's welcome card at half
 * the height: the hotel's photo, a fog wash, and the greeting in ink. On a
 * department screen it greets whoever just scanned their badge (name, job
 * title or department, since when); at reception it greets whoever is
 * signed in. `bye` thanks someone who just clocked out; with no name it
 * invites a badge scan.
 */
export function StaffWelcomeCard({ name, fallbackName, role, propertyName, propertyImage, since, shiftName, state = 'on' }: {
  name?: string;
  /** Who to greet when there's no person's name (a shared reception login): "front desk team". Without it, the card asks for a badge scan. */
  fallbackName?: string;
  /** "Supervisor · Housekeeping", "Front desk". */
  role?: string;
  propertyName: string;
  propertyImage?: string;
  since?: string;
  shiftName?: string;
  state?: 'on' | 'bye';
}) {
  const now = new Date();
  const first = name?.trim().split(/\s+/)[0];
  const title = !first
    ? fallbackName ? `${greeting(now.getHours())}, ${fallbackName}` : 'Scan your badge to start'
    : state === 'bye'
      ? `Thank you, ${first}`
      : `${greeting(now.getHours())}, ${first}`;
  const line = !first
    ? fallbackName ? lineFor(now.getHours()) : 'Your shift, your tasks, all in one place.'
    : state === 'bye'
      ? 'You’re clocked out. Rest well, see you next shift.'
      : lineFor(now.getHours());

  return (
    <motion.section
      key={`${first ?? ''}-${state}`}
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="relative h-[180px] rounded-[28px] overflow-hidden bg-surface-container-high"
    >
      <motion.img
        src={propertyImage || FALLBACK_HOTEL_IMAGE}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        initial={{ scale: 1.08 }}
        animate={{ scale: 1 }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-surface/95 from-20% via-surface/70 via-55% to-surface/10" />
      <div className="relative h-full flex flex-col justify-center px-5 sm:px-6">
        <p className="text-xs font-medium text-on-surface-variant truncate">{propertyName}{role ? ` · ${role}` : ''}</p>
        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.5, ease: EASE }}
          className="mt-1 text-[26px] sm:text-[30px] leading-[1.05] font-semibold tracking-[-0.03em] text-on-surface max-w-[80%]"
        >
          {title}
        </motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="mt-1.5 text-sm text-on-surface-variant max-w-[75%]">
          {line}
        </motion.p>
        {first && state === 'on' && since && (
          <p className="mt-2.5 inline-flex self-start items-center gap-1.5 rounded-full bg-surface-container-lowest/80 backdrop-blur px-3 py-1 text-xs font-medium text-on-surface">
            <span className="relative flex size-2"><span className="absolute inset-0 rounded-full bg-room-ready animate-ping opacity-70" /><span className="relative size-2 rounded-full bg-room-ready" /></span>
            <Clock className="size-3.5" /> On shift since {new Date(since).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}{shiftName ? ` · ${shiftName}` : ''}
          </p>
        )}
      </div>
    </motion.section>
  );
}
