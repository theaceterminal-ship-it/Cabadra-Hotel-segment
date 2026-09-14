import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Building2 } from 'lucide-react';
import { AppView, Property } from '../types';
import { useAuth, signOut } from '../hooks/useAuth';
import { fetchStaffProperties, createProperty } from '../lib/staffApi';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { OwnerOverview } from '../components/OwnerOverview';
import { PropertiesPortfolio } from '../components/PropertiesPortfolio';
import { NewPropertyForm, NewPropertyInput } from '../components/NewPropertyForm';
import { SupabaseSetupNeeded } from '../components/SupabaseSetupNeeded';
import { NotificationBell } from '../components/NotificationBell';
import { Sidebar, SidebarNavItem } from '../components/Sidebar';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme } from '../hooks/useTheme';
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
  const [theme, setTheme] = useTheme();
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

  const handleAddProperty = async (input: NewPropertyInput) => {
    await createProperty(input.id, input.name, input.location, input.image, input.country, input.currency, input.hasExternalPms, input.pmsName);
    // The RPC just granted this user an owner row on a property that didn't
    // exist a moment ago — useAuth's assignments won't know that until we
    // ask it to look again. Awaited so a brand-new owner's very first
    // property doesn't flash the "no properties yet" screen for a frame
    // before the route below actually has somewhere to land.
    await refreshAssignments();
    await reloadProperties();
    // Land straight on the new property's own page — rooms, staff, and
    // everything else live there, not on the portfolio grid.
    navigate(`/owner/properties/${input.id}`);
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

  // A brand-new sign-up has no properties yet, and self-serve creation is
  // real (staff_create_property grants the caller owner on whatever they
  // just created) — so this is "set up your first hotel," never a dead
  // end. A receptionist with zero assignments is different (that path is
  // never self-serve — see ReceptionApp's own empty state), but an owner
  // account always has this door open.
  if (ownedPropertyIds.length === 0) {
    return (
      <div className="min-h-screen w-full bg-surface flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm p-6">
          <h1 className="text-xl font-bold text-on-surface">Welcome to Cabadra</h1>
          <p className="text-sm text-outline mt-1 mb-5">Let's set up your first hotel — this takes about a minute.</p>
          <NewPropertyForm onCreate={handleAddProperty} submitLabel="Create Hotel" />
          <button onClick={() => signOut()} className="w-full text-center text-xs font-semibold text-outline hover:text-on-surface mt-4">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const isOverview = location.pathname === '/owner' || location.pathname === '/owner/';

  const navItems: SidebarNavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'properties', label: 'Properties', icon: Building2 },
  ];

  return (
    <div className="min-h-screen w-full bg-surface flex">
      <Sidebar
        navItems={navItems}
        activeId={isOverview ? 'overview' : 'properties'}
        onNavigate={(id) => navigate(id === 'overview' ? '/owner' : '/owner/properties')}
        onSignOut={() => signOut()}
      />

      <div className="flex-1 min-w-0">
        <div className="h-14 flex items-center justify-end gap-3 px-4 sm:px-6">
          <ThemeToggle theme={theme} onChange={setTheme} />
          <NotificationBell notifications={notifications} unreadCount={unreadCount} onMarkRead={markRead} />
        </div>

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
    </div>
  );
}

function CenteredMessage({ title, body, onSignOut }: { title: string; body: string; onSignOut?: () => void }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-surface p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-lg font-bold text-on-surface">{title}</h1>
        {body && <p className="text-sm text-on-surface-variant">{body}</p>}
        {onSignOut && (
          <button onClick={onSignOut} className="text-xs font-semibold text-primary hover:underline">
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
