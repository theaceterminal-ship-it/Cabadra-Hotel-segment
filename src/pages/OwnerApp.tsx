import React, { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { AppView, Property } from '../types';
import { useAuth, signOut } from '../hooks/useAuth';
import { fetchStaffProperties } from '../lib/staffApi';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { fetchMyOrganization, finishPendingSetupPayments, type Organization } from '../lib/setupPayment';
import { OwnerOverview } from '../components/OwnerOverview';
import { PropertiesPortfolio } from '../components/PropertiesPortfolio';
import { SupabaseSetupNeeded } from '../components/SupabaseSetupNeeded';
import { NotificationBell } from '../components/NotificationBell';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme, useSiteTheme } from '../hooks/useTheme';
import { usePortfolioNotifications } from '../hooks/useNotifications';
import PropertyDetailPage from './PropertyDetailPage';
import LoginPage from './LoginPage';
import OwnerOnboarding from './OwnerOnboarding';
import { usePwaManifest } from '../hooks/usePwaManifest';

/**
 * The owner page: `/owner`. Supabase Auth-gated — see useAuth. Real nested
 * routes (not a local view switch) so a property's page is bookmarkable
 * and the browser back button works, same as everywhere else in the app.
 *
 * Wears the public website's look (useSiteTheme), with a pill top bar in
 * place of the staff icon rail. A signed-in owner with no properties gets
 * OwnerOnboarding instead: business details, then the first property and
 * its one-time setup fee.
 */
export default function OwnerApp() {
  usePwaManifest('owner');
  useSiteTheme();
  const { loading, session, assignments, refreshAssignments } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useTheme();
  const [properties, setProperties] = useState<Property[]>([]);
  const [, setSelectedPropertyId] = useState<string>('');
  // undefined until loaded, null when this account hasn't filled it in yet.
  const [organization, setOrganization] = useState<Organization | null | undefined>(undefined);
  const checkedPendingPayments = useRef(false);

  const ownedPropertyIds = assignments.filter(a => a.role === 'owner').map(a => a.propertyId);
  const { notifications, unreadCount, markRead, date: notificationsDate, setDate: setNotificationsDate } = usePortfolioNotifications(ownedPropertyIds);

  const reloadProperties = () => fetchStaffProperties().then(setProperties).catch(err => console.warn('Failed to load properties:', err));

  useEffect(() => {
    if (!session || ownedPropertyIds.length === 0) return;
    reloadProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, ownedPropertyIds.join(',')]);

  useEffect(() => {
    if (!session) return;
    fetchMyOrganization()
      .then(setOrganization)
      .catch(err => {
        console.warn('Failed to load organization:', err);
        setOrganization(null);
      });

    // A setup fee paid in a tab that closed before it was confirmed:
    // finish it now, once per visit.
    if (checkedPendingPayments.current) return;
    checkedPendingPayments.current = true;
    finishPendingSetupPayments().then(async created => {
      if (created.length === 0) return;
      await refreshAssignments();
      await reloadProperties();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const handlePropertyCreated = async (propertyId: string) => {
    // The payment just granted this user an owner row on a property that
    // didn't exist a moment ago — useAuth's assignments won't know that
    // until we ask it to look again. Awaited so a brand-new owner's very
    // first property doesn't flash the onboarding screen for a frame
    // before the route below actually has somewhere to land.
    await refreshAssignments();
    await reloadProperties();
    // Land straight on the new property's own page — rooms, staff, and
    // everything else live there, not on the portfolio grid.
    navigate(`/owner/properties/${propertyId}`);
  };

  // Old prop-drilled `(view: AppView) => void` interface, kept as-is on
  // OwnerOverview/PropertiesPortfolio so their internals didn't need to
  // change — this just maps those view names onto real routes.
  const handleLegacyNavigate = (view: AppView) => {
    if (view === 'properties') navigate('/owner/properties');
    else navigate('/owner');
  };

  if (!isSupabaseConfigured) return <SupabaseSetupNeeded />;
  if (loading || (session && organization === undefined)) return <CenteredMessage title="Loading…" body="" />;
  if (!session) return <LoginPage roleLabel="Owner" />;

  if (ownedPropertyIds.length === 0) {
    return (
      <OwnerOnboarding
        organization={organization ?? null}
        onOrganizationSaved={setOrganization}
        onCreated={handlePropertyCreated}
        email={session.user.email}
        onSignOut={() => signOut()}
      />
    );
  }

  const isOverview = location.pathname === '/owner' || location.pathname === '/owner/';

  return (
    <div className="min-h-screen w-full bg-surface">
      <header className="sticky top-0 z-40 px-2 sm:px-4 pt-2 sm:pt-4">
        <div className="mx-auto max-w-7xl h-16 rounded-full bg-surface-container-lowest/85 backdrop-blur-md border border-outline-variant flex items-center justify-between gap-1.5 sm:gap-2 pl-4 sm:pl-6 pr-2">
          <Link to="/owner" className="max-[359px]:hidden text-lg sm:text-[22px] font-semibold tracking-[-0.03em] text-on-surface shrink-0">
            Cabadra
          </Link>

          <nav className="flex items-center gap-0.5 sm:gap-1 rounded-full bg-surface-container p-1 text-[13px] sm:text-sm">
            {[
              { to: '/owner', label: 'Overview', active: isOverview },
              { to: '/owner/properties', label: 'Properties', active: !isOverview },
            ].map(item => (
              <Link
                key={item.to}
                to={item.to}
                className={`h-9 px-2.5 sm:px-4 inline-flex items-center rounded-full font-medium transition-colors ${
                  item.active ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {organization && (
              <span className="hidden lg:block text-sm text-on-surface-variant max-w-[180px] truncate pr-1">{organization.name}</span>
            )}
            <div className="hidden sm:block">
              <ThemeToggle theme={theme} onChange={setTheme} />
            </div>
            <NotificationBell notifications={notifications} unreadCount={unreadCount} onMarkRead={markRead} date={notificationsDate} onDateChange={setNotificationsDate} />
            <button
              onClick={() => signOut()}
              title="Sign out"
              className="size-11 rounded-full border border-outline-variant flex items-center justify-center text-on-surface hover:bg-surface-container-low transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="pb-10">
        <Routes>
          <Route
            index
            element={
              <OwnerOverview
                properties={properties}
                onNavigate={handleLegacyNavigate}
                onAddProperty={() => navigate('/owner/properties?add=1')}
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
                organization={organization ?? null}
                onOrganizationSaved={setOrganization}
                onPropertyCreated={handlePropertyCreated}
                email={session.user.email}
              />
            }
          />
          <Route
            path="properties/:propertyId"
            element={<PropertyDetailPage properties={properties} onChanged={reloadProperties} />}
          />
        </Routes>
      </main>
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
