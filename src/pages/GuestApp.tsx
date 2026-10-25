import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppView } from '../types';
import { GuestPwaInstallPrompt } from '../components/GuestPwaInstallPrompt';
import { fetchGuestContext, GuestContext, bookGuestExperience } from '../lib/guestApi';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { GuestHome } from '../components/GuestHome';
import { RoomDiningView } from '../components/RoomDiningView';
import { GuestActivitiesView } from '../components/GuestActivitiesView';
import { SupabaseSetupNeeded } from '../components/SupabaseSetupNeeded';
import { DynamicIslandStatusBar } from '../components/DynamicIslandStatusBar';
import { GuestFolioChat } from '../components/GuestFolioChat';

/**
 * The guest page: `/guest/:token`. No login — the token in the URL (handed
 * to the guest as a QR code / link at check-in) is the entire session. See
 * guest_get_context() in supabase/migrations/0001_init.sql (and
 * 0004_guest_context_name.sql) for what proves it's valid.
 *
 * Sub-views (home, room dining) are local state rather than nested routes —
 * matches how the original single-app prototype worked, and there's no
 * guest-shareable URL benefit to a deeper route here since the token itself
 * is the only thing worth bookmarking.
 */
export default function GuestApp() {
  const { token: urlToken } = useParams<{ token?: string }>();
  const [effectiveToken, setEffectiveToken] = useState<string | null>(() => {
    return urlToken || localStorage.getItem('cabadra_guest_token') || null;
  });
  const [context, setContext] = useState<GuestContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<Extract<AppView, 'guest_home' | 'room_dining' | 'guest_activities'>>('guest_home');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = (isDark: boolean) => {
      document.documentElement.classList.toggle('dark', isDark);

      let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
      }
      meta.content = isDark ? '#14101f' : '#9992c9';
    };

    apply(media.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // Update effectiveToken and persist to localStorage when URL token changes
  useEffect(() => {
    if (urlToken) {
      setEffectiveToken(urlToken);
      localStorage.setItem('cabadra_guest_token', urlToken);
    } else {
      const saved = localStorage.getItem('cabadra_guest_token');
      if (saved) {
        setEffectiveToken(saved);
      }
    }
  }, [urlToken]);

  // Load and validate stay context using effectiveToken
  useEffect(() => {
    if (!effectiveToken || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetchGuestContext(effectiveToken)
      .then(ctx => {
        setContext(ctx);
        localStorage.setItem('cabadra_guest_token', effectiveToken);
      })
      .catch(err => {
        console.warn('Failed to load guest context:', err);
        setError(err.message || 'Your stay has ended or link is no longer active.');
        localStorage.removeItem('cabadra_guest_token');
        setEffectiveToken(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [effectiveToken]);

  if (!isSupabaseConfigured) return <SupabaseSetupNeeded />;

  if (loading && !context) {
    return <CenteredMessage title="Opening your room…" body="Restoring your stay session..." />;
  }

  if (!effectiveToken) {
    return (
      <CenteredMessage
        title="No active stay"
        body="Scan the QR code on your room door or check the link provided by reception at check-in."
      />
    );
  }

  if (error || !context) {
    return (
      <CenteredMessage
        title="Stay completed or link expired"
        body={error || "Your reservation may have ended. Please check with the front desk."}
      />
    );
  }

  const handleNavigate = (target: AppView) => {
    if (target === 'guest_home' || target === 'room_dining' || target === 'guest_activities') {
      setView(target);
      window.scrollTo({ top: 0 });
    }
  };

  const handleBookExperience = (name: string, price: number, guestCount?: number, preferredTime?: string, notes?: string, unitLabel?: string) =>
    bookGuestExperience(effectiveToken, name, price, guestCount, preferredTime, notes, unitLabel).then(() => {});

  return (
    <>
      <GuestPwaInstallPrompt />
      {view === 'guest_home' && (
        <GuestHome
          token={effectiveToken}
          propertyName={context.property.name}
          propertyImage={context.property.image}
          roomNumber={context.room.number}
          guestName={context.guest.name}
          isVip={context.guest.vip}
          currency={context.property.currency}
          experiences={context.experiences}
          serviceCategories={context.serviceCategories}
          transportRoutes={context.transportRoutes}
          onNavigate={handleNavigate}
          onBookExperience={handleBookExperience}
        />
      )}
      {view === 'guest_activities' && (
        <GuestActivitiesView
          propertyName={context.property.name}
          experiences={context.experiences}
          currency={context.property.currency}
          onNavigate={handleNavigate}
          onBookExperience={handleBookExperience}
        />
      )}
      {view === 'room_dining' && (
        <RoomDiningView
          token={effectiveToken}
          propertyName={context.property.name}
          roomNumber={context.room.number}
          menuItems={context.menu}
          currency={context.property.currency}
          onNavigate={handleNavigate}
          onPlaceOrder={() => {}}
        />
      )}
      {/* Folio Chat across views */}
      <GuestFolioChat token={effectiveToken} />
    </>
  );
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-surface p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-bold text-on-surface mb-2">{title}</h1>
        <p className="text-sm text-on-surface-variant">{body}</p>
      </div>
    </div>
  );
}
