/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import OwnerApp from './pages/OwnerApp';
import ReceptionApp from './pages/ReceptionApp';
import GuestApp from './pages/GuestApp';

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
      <Route path="/owner/*" element={<OwnerApp />} />
      <Route path="/reception/*" element={<ReceptionApp />} />
      <Route path="/guest/:token" element={<GuestApp />} />
    </Routes>
  );
}
