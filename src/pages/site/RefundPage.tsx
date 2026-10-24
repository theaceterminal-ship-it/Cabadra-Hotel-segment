import React from 'react';
import LegalLayout, { H2, P, UL } from './LegalLayout';
import { CONTACT_EMAIL } from '../../components/site/SiteChrome';

/**
 * Razorpay's website checks expect a refund/cancellation page and a
 * service-delivery section; both live here.
 *
 * Refund terms confirmed by the owner (25 Oct 2026): hotels claim by
 * emailing info@churmuri.com within 30 days; refunds within 7 working days.
 */
export default function RefundPage() {
  return (
    <LegalLayout
      title="Refund & cancellation"
      updated="25 October 2026"
      intro="How the one-time setup fee works, and when it’s refunded."
    >
      <H2>Delivery of the service</H2>
      <P>
        Cabadra is online software. Nothing is shipped. Each property is set up as soon as its setup fee payment is
        confirmed, and you can start adding its rooms, menu and staff straight away.
      </P>

      <H2>The setup fee</H2>
      <P>
        The setup fee is paid once for each property you add (currently ₹4,999 per property), and the amount is shown
        before you pay. Once a property has been set up, its fee is non-refundable.
      </P>

      <H2>When we refund in full</H2>
      <UL>
        <li>You were charged but the property was not set up.</li>
        <li>You were charged more than once for the same property.</li>
      </UL>
      <P>
        To request a refund, the hotel emails{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[#111] underline underline-offset-4">
          {CONTACT_EMAIL}
        </a>{' '}
        within 30 days of the payment with your account email and the Razorpay payment ID. Approved refunds go back to
        the original payment method within 7 working days. Your bank may take a little longer to show it.
      </P>

      <H2>Cancelling</H2>
      <P>
        You can stop using Cabadra at any time. To close your account and have your
        data deleted, email us from the account owner’s email address.
      </P>

      <H2>Guest charges</H2>
      <P>
        Charges for food, services and experiences during a stay are paid to the hotel, not to Cabadra. For a refund on
        any of those, please contact the hotel.
      </P>
    </LegalLayout>
  );
}
