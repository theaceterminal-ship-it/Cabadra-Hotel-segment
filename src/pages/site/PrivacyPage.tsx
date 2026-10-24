import React from 'react';
import LegalLayout, { H2, P, UL } from './LegalLayout';
import { COMPANY_LOCATION, COMPANY_NAME, CONTACT_EMAIL } from '../../components/site/SiteChrome';

/**
 * Describes what the software actually collects — keep it in step with the
 * schema (supabase/migrations) when a new kind of guest or staff data is
 * added.
 *
 * TODO(owner): not yet reviewed by a lawyer against India's DPDP Act, 2023.
 * The 30-day ID-document deletion promised below is done by
 * system_purge_expired_id_documents (0019_id_document_retention.sql) on a
 * pg_cron schedule — confirm pg_cron is enabled on the live Supabase
 * project, or the promise isn't being kept.
 */
export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy policy"
      updated="25 October 2026"
      intro={
        <>
          Cabadra is run by {COMPANY_NAME} (“we”, “us”). Hotels and homestays use it to take guest orders and requests and
          add up a stay’s extra charges. This policy explains what we collect, why, and what you can do about it.
        </>
      }
    >
      <H2>Who is responsible for guest data</H2>
      <P>
        When you stay at a hotel that uses Cabadra, the hotel decides what it asks you for and what it does with it. We
        process that information on the hotel’s behalf to run the service. For questions about a stay, contact the hotel
        first. We’re happy to help too.
      </P>

      <H2>What we collect from guests</H2>
      <UL>
        <li>Your name, and the phone number and email address the hotel records at check-in.</li>
        <li>A photo of your ID document, if the hotel uploads one at check-in.</li>
        <li>Your room, stay dates, party size and expected arrival time.</li>
        <li>What you order or request through the guest app (food, laundry, spa, transfers, experiences) and the charges that go on your folio.</li>
        <li>Messages you send the hotel through the in-app chat.</li>
        <li>Which offers and experiences you view or tap in the guest app, so the hotel can see what guests are interested in.</li>
      </UL>
      <P>You don’t need an account to use the guest app. Your room’s QR code or link is what gives you access.</P>

      <H2>What we collect from hotels and their staff</H2>
      <UL>
        <li>Owner and reception accounts: name and email address, including through Google Sign-In.</li>
        <li>Staff added by the hotel: name, department, and shift start and end times recorded by badge scans.</li>
        <li>The hotel’s own details: property name, rooms, menu, prices, services, experiences, photos and UPI ID.</li>
        <li>Payment records for the setup fee. Payments are handled by Razorpay. We never see or store card numbers, bank details or UPI PINs.</li>
      </UL>

      <H2>Why we use it</H2>
      <UL>
        <li>To get guest orders and requests to the right department and add the charges to the stay.</li>
        <li>To give the hotel one total of extra charges at checkout.</li>
        <li>To let guests and the hotel message each other during the stay.</li>
        <li>To run hotel accounts, staff access and billing.</li>
        <li>To find and fix errors in the service.</li>
      </UL>
      <P>We do not sell personal data and we do not use it for third-party advertising.</P>

      <H2>How long we keep it</H2>
      <UL>
        <li>ID document photos are deleted automatically 30 days after checkout.</li>
        <li>Other stay records (orders, charges, messages) are kept while the hotel’s account is active, because the hotel needs them for its own accounts and records.</li>
        <li>When a hotel closes its account, we delete its data on request, except where the law requires us to keep it.</li>
      </UL>

      <H2>Services we rely on</H2>
      <P>We use a small number of providers to run Cabadra. Each one only gets what it needs to do its job:</P>
      <UL>
        <li>Supabase: database and sign-in.</li>
        <li>Cloudinary: storing images such as property photos and ID documents.</li>
        <li>Cloudflare: hosting the website and apps.</li>
        <li>Google: Sign in with Google, if you choose it.</li>
        <li>Razorpay: setup fee payments.</li>
        <li>Sentry: error reports, so we can fix problems.</li>
      </UL>

      <H2>Your rights</H2>
      <P>
        Under India’s Digital Personal Data Protection Act, 2023 you can ask to see the personal data we hold about you,
        have it corrected or deleted, or withdraw consent. Email us and we’ll respond. If your request is about a stay,
        we may involve the hotel, since it controls that data.
      </P>

      <H2>Security</H2>
      <P>
        Data is sent over encrypted connections. Each hotel can only see its own data, and each guest link only opens
        that guest’s own stay.
      </P>

      <H2>Changes</H2>
      <P>We’ll update this page when what we collect or how we use it changes, and change the date at the top.</P>

      <H2>Contact</H2>
      <P>
        {COMPANY_NAME}, {COMPANY_LOCATION}
        <br />
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[#111] underline underline-offset-4">
          {CONTACT_EMAIL}
        </a>
      </P>
    </LegalLayout>
  );
}
