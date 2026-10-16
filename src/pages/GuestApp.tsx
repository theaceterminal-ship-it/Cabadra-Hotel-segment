import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppView } from '../types';
import { fetchGuestContext, GuestContext, submitGuestRequest, bookGuestExperience } from '../lib/guestApi';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { GuestHome } from '../components/GuestHome';
import { RoomDiningView } from '../components/RoomDiningView';
import { SupabaseSetupNeeded } from '../components/SupabaseSetupNeeded';
import { OrderStatusBar } from '../components/OrderStatusBar';
import { RequestStatusBar } from '../components/RequestStatusBar';

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
  const { token } = useParams<{ token: string }>();
  const [context, setContext] = useState<GuestContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<Extract<AppView, 'guest_home' | 'room_dining'>>('guest_home');

  // Staff get an explicit light/dark toggle (useTheme) that deliberately
  // ignores the OS, per its own comment — a receptionist's front-desk
  // machine keeps whatever was picked last. A guest has no such toggle and
  // no reason to trust a stray `dark` class left on this browser by a
  // staff session on the same device, so the guest page instead follows
  // the guest's own phone/browser setting directly via
  // prefers-color-scheme, live — including if they flip their OS theme
  // while this page is still open. The `<meta name="theme-color">` tag
  // keeps the mobile browser's address/status bar matching this page's own
  // background (bg-surface) rather than showing a mismatched strip.
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
      // Matches --color-surface for .dark / :root in src/index.css.
      meta.content = isDark ? '#14101f' : '#9992c9';
    };

    apply(media.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!token || !isSupabaseConfigured) return;
    fetchGuestContext(token)
      .then(setContext)
      .catch(err => setError(err.message));
  }, [token]);

  if (!isSupabaseConfigured) return <SupabaseSetupNeeded />;

  if (!token) {
    return <CenteredMessage title="No guest link" body="This page needs a guest link — check the QR code or URL your hotel gave you at check-in." />;
  }

  if (error) {
    return <CenteredMessage title="Link not recognized" body={error} />;
  }

  if (!context) {
    return <CenteredMessage title="Loading your stay…" body="One moment." />;
  }

  // AppView carries views this page doesn't own (owner/reception ones); the
  // handler below only ever sets the two guest sub-views.
  const handleNavigate = (target: AppView) => {
    if (target === 'guest_home' || target === 'room_dining') setView(target);
  };

  return (
    <>
      {/* Both bars position themselves via this one shared fixed stack instead
          of each claiming "fixed top-0" independently, which would make a
          second bar sit exactly on top of the first instead of below it. */}
      <div className="fixed top-0 inset-x-0 z-40 flex flex-col items-center gap-2 px-3 pt-3 pointer-events-none">
        <OrderStatusBar token={token} currency={context.property.currency} />
        <RequestStatusBar token={token} />
      </div>
      {view === 'guest_home' && (
        <GuestHome
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
          onSubmitConciergeRequest={(title, department) => submitGuestRequest(token, title, 'Standard', department).then(() => {})}
          onBookExperience={(name, price) => bookGuestExperience(token, name, price).then(() => {})}
        />
      )}
      {view === 'room_dining' && (
        <RoomDiningView
          token={token}
          propertyName={context.property.name}
          roomNumber={context.room.number}
          menuItems={context.menu}
          currency={context.property.currency}
          onNavigate={handleNavigate}
          onPlaceOrder={() => {}}
        />
      )}
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
