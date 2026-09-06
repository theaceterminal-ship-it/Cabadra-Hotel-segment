import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AppView, Property } from '../types';
import { useAuth, signOut } from '../hooks/useAuth';
import { fetchStaffProperties, createProperty } from '../lib/staffApi';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { OwnerOverview } from '../components/OwnerOverview';
import { PropertiesPortfolio } from '../components/PropertiesPortfolio';
import { SupabaseSetupNeeded } from '../components/SupabaseSetupNeeded';
import { NotificationBell } from '../components/NotificationBell';
import { usePortfolioNotifications } from '../hooks/useNotifications';
import PropertyDetailPage from './PropertyDetailPage';
import LoginPage from './LoginPage';

/**
 * The owner page: `/owner`. Supabase Auth-gated — see useAuth. Real nested
 * routes (not a local view switch) so a property's page is bookmarkable
 * and the browser back button works, same as everywhere else in the app.
 */
export default function OwnerApp() {
  const { loading, session, assignments, refreshAssignments } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [properties, setProperties] = useState<Property[]>([]);
  const [, setSelectedPropertyId] = useState<string>('');

  const ownedPropertyIds = assignments.filter(a => a.role === 'owner').map(a => a.propertyId);
  const { notifications, unreadCount, markRead } = usePortfolioNotifications(ownedPropertyIds);

  const reloadProperties = () => fetchStaffProperties().then(setProperties).catch(err => console.warn('Failed to load properties:', err));

  useEffect(() => {
    if (!session || ownedPropertyIds.length === 0) return;
    reloadProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, ownedPropertyIds.join(',')]);

  const handleAddProperty = async (input: { id: string; name: string; location: string; image?: string }) => {
    await createProperty(input.id, input.name, input.location, input.image);
    // The RPC just granted this user an owner row on a property that didn't
    // exist a moment ago — useAuth's assignments won't know that until we
    // ask it to look again.
    refreshAssignments();
    await reloadProperties();
  };

  // Old prop-drilled `(view: AppView) => void` interface, kept as-is on
  // OwnerOverview/PropertiesPortfolio so their internals didn't need to
  // change — this just maps those view names onto real routes.
  const handleLegacyNavigate = (view: AppView) => {
    if (view === 'properties') navigate('/owner/properties');
    else navigate('/owner');
  };

  if (!isSupabaseConfigured) return <SupabaseSetupNeeded />;
  if (loading) return <CenteredMessage title="Loading…" body="" />;
  if (!session) return <LoginPage roleLabel="Owner" />;

  if (ownedPropertyIds.length === 0) {
    return (
      <CenteredMessage
        title="No properties assigned yet"
        body="You're signed in, but this account isn't linked to any property as an owner. See the note at the bottom of supabase/seed.sql for how to grant access — insert a row into staff_properties with role 'owner'."
        onSignOut={signOut}
      />
    );
  }

  const isOverview = location.pathname === '/owner' || location.pathname === '/owner/';
  const isProperties = location.pathname.startsWith('/owner/properties');

  return (
    <div className="min-h-screen w-full bg-[#f6faff]">
      <nav className="bg-white border-b border-[#E9ECEF] px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-bold text-[#765a25]">Cabadra Owner</span>
          <button
            onClick={() => navigate('/owner')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${isOverview ? 'bg-[#ecf5fe] text-[#765a25]' : 'text-[#4e463a]'}`}
          >
            Overview
          </button>
          <button
            onClick={() => navigate('/owner/properties')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${isProperties ? 'bg-[#ecf5fe] text-[#765a25]' : 'text-[#4e463a]'}`}
          >
            Properties
          </button>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell notifications={notifications} unreadCount={unreadCount} onMarkRead={markRead} />
          <button onClick={() => signOut()} className="text-xs font-semibold text-[#7f7668] hover:text-[#141d23]">
            Sign out
          </button>
        </div>
      </nav>

      <Routes>
        <Route
          index
          element={
            <OwnerOverview
              properties={properties}
              onNavigate={handleLegacyNavigate}
              onSelectProperty={setSelectedPropertyId}
            />
          }
        />
        <Route
          path="properties"
          element={
            <PropertiesPortfolio
              properties={properties}
              onSelectProperty={setSelectedPropertyId}
              onNavigate={handleLegacyNavigate}
              onAddProperty={handleAddProperty}
            />
          }
        />
        <Route
          path="properties/:propertyId"
          element={<PropertyDetailPage properties={properties} onChanged={reloadProperties} />}
        />
      </Routes>
    </div>
  );
}

function CenteredMessage({ title, body, onSignOut }: { title: string; body: string; onSignOut?: () => void }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f6faff] p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-lg font-bold text-[#141d23]">{title}</h1>
        {body && <p className="text-sm text-[#4e463a]">{body}</p>}
        {onSignOut && (
          <button onClick={onSignOut} className="text-xs font-semibold text-[#765a25] hover:underline">
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
