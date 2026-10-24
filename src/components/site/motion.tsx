import React from 'react';
import { motion, type Variants } from 'motion/react';

/**
 * Shared scroll animations for the public website. Every animation here
 * goes through MotionConfig reducedMotion="user" (set in SiteShell), so a
 * visitor with "reduce motion" turned on gets the content without the
 * movement.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

export const stagger = (gap = 0.08, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/** Fades and lifts its children in once, when they first scroll into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'p';
}) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      variants={{
        hidden: { opacity: 0, y: 28 },
        show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE, delay } },
      }}
    >
      {children}
    </Tag>
  );
}

/** A grid or list whose items (wrapped in RevealItem) come in one after another. */
export function RevealGroup({
  children,
  className,
  as = 'div',
  gap = 0.08,
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'ul' | 'ol';
  gap?: number;
}) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      variants={stagger(gap)}
    >
      {children}
    </Tag>
  );
}

export function RevealItem({
  children,
  className,
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'li';
}) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={fadeUp}>
      {children}
    </Tag>
  );
}
