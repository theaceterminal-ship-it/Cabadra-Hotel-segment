/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import SetPasswordPage from './pages/SetPasswordPage';
import OwnerApp from './pages/OwnerApp';
import ReceptionApp from './pages/ReceptionApp';
import GuestApp from './pages/GuestApp';
import RoomRedirect from './pages/RoomRedirect';
import TaskScanPage from './pages/TaskScanPage';
import AccessLinkPage from './pages/AccessLinkPage';
import DepartmentDisplayPage from './pages/DepartmentDisplayPage';
import PrivacyPage from './pages/site/PrivacyPage';
import TermsPage from './pages/site/TermsPage';
import RefundPage from './pages/site/RefundPage';
import ContactPage from './pages/site/ContactPage';
import PartnersPage from './pages/site/PartnersPage';
import PartnerHomePage from './pages/PartnerHomePage';
import PartnerLinkPage from './pages/PartnerLinkPage';
import PartnerInvoicePage from './pages/PartnerInvoicePage';
import NotFoundPage from './pages/site/NotFoundPage';
import BillPage from './pages/BillPage';
import KitchenPage from './pages/KitchenPage';

/**
 * Three separate pages, not one role-switcher: an owner and a receptionist
 * each sign in (Supabase Auth) to their own page and never see the other's
 * nav; a guest gets a token-scoped link with no login at all (GuestApp).
 * See src/hooks/useAuth.ts and src/lib/guestApi.ts for how each is scoped.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage mode="sign_in" />} />
      <Route path="/signup" element={<AuthPage mode="sign_up" />} />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/refund-policy" element={<RefundPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/partners" element={<PartnersPage />} />
      <Route path="/partner" element={<PartnerHomePage />} />
      <Route path="/partner/invoice/:invoiceId" element={<PartnerInvoicePage />} />
      <Route path="/partner/:token" element={<PartnerLinkPage />} />
      <Route path="/owner/*" element={<OwnerApp />} />
      <Route path="/reception/*" element={<ReceptionApp />} />
      <Route path="/guest/room/:roomId" element={<RoomRedirect />} />
      <Route path="/guest/:token" element={<GuestApp />} />
      <Route path="/guest" element={<GuestApp />} />
      <Route path="/task/:token" element={<TaskScanPage />} />
      <Route path="/display/:token" element={<DepartmentDisplayPage />} />
      <Route path="/access/:token" element={<AccessLinkPage />} />
      <Route path="/bill/:token" element={<BillPage />} />
      <Route path="/kitchen/:token" element={<KitchenPage />} />
      <Route path="/kitchen" element={<KitchenPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
