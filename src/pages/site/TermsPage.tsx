import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout, { H2, P, UL } from './LegalLayout';
import { COMPANY_LOCATION, COMPANY_NAME, CONTACT_EMAIL } from '../../components/site/SiteChrome';

/**
 * TODO(owner): the limitation-of-liability clause carries real legal
 * weight; have a lawyer set its exact wording.
 */
export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms & conditions"
      updated="25 October 2026"
      intro={
        <>
          These terms govern use of Cabadra, run by {COMPANY_NAME}. By using it as a hotel, a member of a hotel’s staff,
          or a guest, you agree to them.
        </>
      }
    >
      <H2>What Cabadra is</H2>
      <P>
        Cabadra is software that hotels and homestays use alongside their own property management system (PMS). Guests
        order and make requests through a guest app, staff receive them on department screens, and the stay’s extra
        charges are added up into one total for checkout.
      </P>
      <P>
        Cabadra is not a hotel and is not a party to the stay. Rooms, food, services and experiences are provided by the
        hotel, and the contract for them is between the guest and the hotel.
      </P>

      <H2>Charges and checkout</H2>
      <UL>
        <li>The hotel sets its own prices, and is responsible for checking the checkout total before posting it into its PMS or billing the guest.</li>
        <li>Guests pay the hotel directly. Cabadra does not collect payments from guests.</li>
        <li>A dispute about a charge, a refund or the quality of a service is between the guest and the hotel. We’re happy to help the two of you get in touch.</li>
      </UL>

      <H2>Hotel accounts</H2>
      <UL>
        <li>The account owner is responsible for keeping their sign-in secure and for everything done under the account.</li>
        <li>The hotel is responsible for the accuracy of its menu, prices, services and experiences.</li>
        <li>The hotel is responsible for who it gives staff access to, and for what they do with it.</li>
        <li>The hotel must have a lawful basis for any guest data it collects, including ID documents, and must tell guests how it uses it.</li>
        <li>Cabadra may not be used for anything unlawful, or to collect guest data for purposes beyond running the stay.</li>
      </UL>

      <H2>Setup fee</H2>
      <P>
        Access to the owner dashboard requires a one-time setup fee, shown before you pay. Payments are processed by
        Razorpay. Refunds are covered by our{' '}
        <Link to="/refund-policy" className="font-medium text-[#111] underline underline-offset-4">
          refund & cancellation policy
        </Link>
        .
      </P>

      <H2>Your data</H2>
      <P>
        The hotel’s data belongs to the hotel. We use it only to provide Cabadra, as described in our{' '}
        <Link to="/privacy" className="font-medium text-[#111] underline underline-offset-4">
          privacy policy
        </Link>
        .
      </P>

      <H2>Availability</H2>
      <P>
        We work to keep Cabadra running reliably, but we don’t guarantee it will always be available, error-free or
        uninterrupted. Keep your own records in your PMS.
      </P>

      <H2>Limitation of liability</H2>
      <P>
        To the fullest extent the law allows, {COMPANY_NAME} is not liable for indirect, incidental or consequential
        losses arising from use of Cabadra, including a missed or late request, a charge entered incorrectly, or an
        outage. Our total liability to a hotel is limited to the setup fee it paid.
      </P>

      <H2>Ending use</H2>
      <P>
        A hotel may stop using Cabadra at any time. We may suspend or close an account that breaches these terms or
        misuses the service.
      </P>

      <H2>Changes</H2>
      <P>We may update these terms as Cabadra changes. Continuing to use it after an update means you accept the new terms.</P>

      <H2>Governing law</H2>
      <P>These terms are governed by the laws of India. The courts at Solan, Himachal Pradesh have exclusive jurisdiction over any dispute arising from them.</P>

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
