import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useScrollEdges } from '../hooks/useScrollEdges';
import { Property, Room, MenuItem } from '../types';
import {
  fetchRoomsForProperty,
  fetchMenuForProperty,
  fetchStaffForProperty,
  fetchTicketSizeAnalytics,
  fetchPendingInvites,
  fetchExperiencesForProperty,
  fetchServiceCategories,
  StaffMember,
  TicketSizeAnalytics,
  PendingInvite,
  Experience,
  ServiceCategory,
} from '../lib/staffApi';
import { OverviewTab } from './property/OverviewTab';
import { RoomsTab } from './property/RoomsTab';
import { MenuTab } from './property/MenuTab';
import { ExperiencesTab } from './property/ExperiencesTab';
import { ServicesTab } from './property/ServicesTab';
import { StaffTab } from './property/StaffTab';
import { ActivityTab } from './property/ActivityTab';
import { ReportsView } from '../components/ReportsView';

interface PropertyDetailPageProps {
  properties: Property[];
  onChanged: () => void | Promise<void>;
}

type TabId = 'overview' | 'reports' | 'rooms' | 'menu' | 'experiences' | 'services' | 'staff' | 'activity';
const TAB_IDS: TabId[] = ['overview', 'reports', 'rooms', 'menu', 'experiences', 'services', 'staff', 'activity'];

/**
 * One property's console at /owner/properties/:propertyId: a header and
 * pill tabs (Overview, Rooms, Menu, Experiences, Services, Staff). Each tab
 * lives in src/pages/property/ and shows its list with the main actions on
 * top; adding or editing anything opens a dialog instead of a form sitting
 * permanently open. The tab is kept in ?tab= so a refresh or the back
 * button returns to it.
 */
export default function PropertyDetailPage({ properties, onChanged }: PropertyDetailPageProps) {
  const { propertyId = '' } = useParams<{ propertyId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const property = properties.find(p => p.id === propertyId);

  const tabParam = searchParams.get('tab') as TabId | null;
  const tab: TabId = tabParam && TAB_IDS.includes(tabParam) ? tabParam : 'overview';
  const tabsScroll = useScrollEdges<HTMLElement>('x');
  const setTab = (next: TabId) =>
    setSearchParams(params => {
      if (next === 'overview') params.delete('tab');
      else params.set('tab', next);
      return params;
    }, { replace: true });

  const [rooms, setRooms] = useState<Room[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [services, setServices] = useState<ServiceCategory[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [ticketAnalytics, setTicketAnalytics] = useState<TicketSizeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const [freshRooms, freshMenu, freshExperiences, freshServices, freshStaff, analytics, freshPending] = await Promise.all([
        fetchRoomsForProperty(propertyId),
        fetchMenuForProperty(propertyId),
        fetchExperiencesForProperty(propertyId).catch(() => []), // older projects may not have run 0016 yet
        fetchServiceCategories(propertyId).catch(() => []), // older projects may not have run 0018 yet
        fetchStaffForProperty(propertyId).catch(() => []), // older projects may not have run 0005 yet
        fetchTicketSizeAnalytics(propertyId).catch(() => null),
        fetchPendingInvites(propertyId).catch(() => []), // older projects may not have run 0008 yet
      ]);
      setRooms(freshRooms);
      setMenu(freshMenu);
      setExperiences(freshExperiences);
      setServices(freshServices);
      setStaff(freshStaff);
      setTicketAnalytics(analytics);
      setPendingInvites(freshPending);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // Refreshes this page's lists and the parent's property (name, photo,
  // PMS mode, counts), so a change shows everywhere at once.
  const handleReload = async () => {
    await Promise.all([reload(), onChanged()]);
  };

  if (!property && !loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-on-surface-variant">This property doesn’t exist, or you don’t have access to it.</p>
        <Link to="/owner/properties" className="mt-4 inline-flex h-10 px-4 items-center rounded-full border border-outline-variant text-sm font-medium text-on-surface">
          Back to properties
        </Link>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'reports', label: 'Reports' },
    { id: 'rooms', label: 'Rooms', count: rooms.length },
    { id: 'menu', label: 'Menu', count: menu.length },
    { id: 'experiences', label: 'Experiences', count: experiences.length },
    { id: 'services', label: 'Services', count: services.length },
    { id: 'staff', label: 'Staff' },
    { id: 'activity', label: 'Activity' },
  ];

  const currency = property?.currency ?? 'INR';

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16">
      <Link
        to="/owner/properties"
        className="inline-flex items-center gap-1.5 h-9 pl-2 pr-3 -ml-2 rounded-full text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
      >
        <ArrowLeft className="size-4" /> Properties
      </Link>

      <div className="mt-3 flex items-center gap-4">
        <span className="size-14 sm:size-16 shrink-0 rounded-2xl overflow-hidden bg-surface-container-lowest border border-outline-variant flex items-center justify-center text-on-surface-variant">
          {property?.image ? <img src={property.image} alt="" className="size-full object-cover" /> : <Building2 className="size-6" />}
        </span>
        <div className="min-w-0">
          <h1 className="text-[28px] sm:text-[36px] leading-tight font-semibold tracking-[-0.03em] text-on-surface truncate">{property?.name ?? propertyId}</h1>
          <p className="text-sm text-on-surface-variant mt-0.5 truncate">
            {property?.location}
            {property && <> · {property.hasExternalPms ? 'Works alongside your PMS' : 'Cabadra front desk'}</>}
          </p>
        </div>
      </div>

      {/* Scrolls sideways on a narrow screen with no scrollbar; arrows show there's more. */}
      <div className="relative mt-6 -mx-4 sm:mx-0">
        <nav ref={tabsScroll.ref} className="overflow-x-auto scrollbar-none px-4 sm:px-0" aria-label="Property sections">
          <div className="inline-flex gap-1 rounded-full bg-surface-container p-1">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`relative h-9 px-4 rounded-full text-sm font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${
                  tab === t.id ? 'text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab === t.id && <motion.span layoutId="property-tab-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', damping: 30, stiffness: 380 }} />}
                <span className="relative">{t.label}</span>
                {t.count !== undefined && t.count > 0 && (
                  <span className={`relative text-xs ${tab === t.id ? 'text-on-primary/70' : 'text-on-surface-variant/70'}`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </nav>
        {tabsScroll.edges.before && (
          <button onClick={() => tabsScroll.scrollBy(-1)} aria-label="Scroll tabs left" className="absolute left-0 inset-y-0 w-10 flex items-center justify-start pl-1 bg-gradient-to-r from-surface via-surface/90 to-transparent">
            <ChevronLeft className="size-4 text-on-surface-variant" />
          </button>
        )}
        {tabsScroll.edges.after && (
          <button onClick={() => tabsScroll.scrollBy(1)} aria-label="Scroll tabs right" className="absolute right-0 inset-y-0 w-10 flex items-center justify-end pr-1 bg-gradient-to-l from-surface via-surface/90 to-transparent">
            <ChevronRight className="size-4 text-on-surface-variant" />
          </button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tab}
        className="mt-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {loading ? (
          <p className="text-sm text-on-surface-variant text-center py-16">Loading…</p>
        ) : error ? (
          <p className="rounded-2xl bg-error-container text-on-error-container text-sm px-4 py-3">{error}</p>
        ) : tab === 'overview' ? (
          <OverviewTab
            property={property!}
            rooms={rooms}
            staff={staff}
            ticketAnalytics={ticketAnalytics}
            onChanged={handleReload}
            onGoToStaff={() => setTab('staff')}
          />
        ) : tab === 'reports' ? (
          // Same reports the front desk sees, including every day close and its cash difference.
          <div className="-mx-4 sm:-mx-6"><ReportsView propertyId={propertyId} propertyName={property?.name ?? ''} currency={currency} hasExternalPms={property?.hasExternalPms ?? false} /></div>
        ) : tab === 'rooms' ? (
          <RoomsTab propertyId={propertyId} currency={currency} rooms={rooms} hasExternalPms={property?.hasExternalPms ?? false} onChanged={handleReload} />
        ) : tab === 'menu' ? (
          <MenuTab propertyId={propertyId} currency={currency} menu={menu} onChanged={handleReload} />
        ) : tab === 'experiences' ? (
          <ExperiencesTab propertyId={propertyId} currency={currency} experiences={experiences} onChanged={handleReload} />
        ) : tab === 'services' ? (
          <ServicesTab propertyId={propertyId} currency={currency} services={services} onChanged={handleReload} />
        ) : tab === 'activity' ? (
          <ActivityTab propertyId={propertyId} />
        ) : (
          <StaffTab propertyId={propertyId} staff={staff} pendingInvites={pendingInvites} onChanged={handleReload} />
        )}
      </motion.div>
      </AnimatePresence>
    </div>
  );
}
