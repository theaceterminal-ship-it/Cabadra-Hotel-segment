import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, Building2, LifeBuoy, Receipt } from 'lucide-react';
import { COMPANY_LOCATION, COMPANY_NAME, CONTACT_EMAIL, SiteFooter, SiteNav, SiteShell } from '../../components/site/SiteChrome';
import { fadeUp, stagger } from '../../components/site/motion';
import { usePageTitle } from './usePageTitle';

/** Every option opens the visitor's own mail app with the subject filled in — there's no form backend to store messages. */
const TOPICS = [
  { icon: Building2, title: 'Set up my hotel', body: 'Questions before you sign up, or help getting started.', subject: 'Setting up my hotel on Cabadra' },
  { icon: LifeBuoy, title: 'Support', body: 'Something isn’t working the way it should.', subject: 'Cabadra support' },
  { icon: Receipt, title: 'Billing & refunds', body: 'Your setup fee, a payment or a refund.', subject: 'Cabadra billing' },
];

export default function ContactPage() {
  usePageTitle('Contact');

  return (
    <SiteShell>
      <div className="px-5 sm:px-10 lg:px-14 pt-5 sm:pt-8 mx-auto max-w-7xl">
        <SiteNav />
      </div>

      <main className="mx-auto max-w-6xl px-5 sm:px-8 pt-16 sm:pt-24">
        <motion.div initial="hidden" animate="show" variants={stagger(0.1)} className="max-w-2xl">
          <motion.p variants={fadeUp} className="text-sm font-medium text-[#111]/50">
            Contact
          </motion.p>
          <motion.h1 variants={fadeUp} className="mt-3 text-[40px] sm:text-6xl leading-[1.02] font-semibold tracking-[-0.035em]">
            Talk to us
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-5 text-[17px] sm:text-lg text-[#111]/65">
            Email us about setting up your hotel, a problem, or your bill. We’ll reply by email.
          </motion.p>
        </motion.div>

        <motion.div initial="hidden" animate="show" variants={stagger(0.08, 0.25)} className="mt-12 grid gap-3 md:grid-cols-3">
          {TOPICS.map(({ icon: Icon, title, body, subject }) => (
            <motion.a
              key={title}
              variants={fadeUp}
              whileHover={{ y: -4 }}
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`}
              className="group rounded-[28px] bg-white p-6 sm:p-7 block"
            >
              <div className="flex items-start justify-between">
                <span className="size-11 rounded-full bg-[#eef0ec] flex items-center justify-center">
                  <Icon className="size-5" />
                </span>
                <ArrowUpRight className="size-5 text-[#111]/35 transition-all group-hover:text-[#111] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <h2 className="mt-8 text-lg font-semibold tracking-[-0.01em]">{title}</h2>
              <p className="mt-2 text-[15px] text-[#111]/60 leading-relaxed">{body}</p>
            </motion.a>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-3 rounded-[28px] bg-[#111] text-white p-7 sm:p-10 flex flex-col md:flex-row md:items-end justify-between gap-6"
        >
          <div>
            <p className="text-sm text-white/55">Email</p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="mt-2 block text-[26px] sm:text-4xl font-semibold tracking-[-0.03em] hover:underline underline-offset-8">
              {CONTACT_EMAIL}
            </a>
          </div>
          <div className="text-[15px] text-white/60">
            {COMPANY_NAME}
            <br />
            {COMPANY_LOCATION}
          </div>
        </motion.div>
      </main>

      <SiteFooter showCta={false} />
    </SiteShell>
  );
}
