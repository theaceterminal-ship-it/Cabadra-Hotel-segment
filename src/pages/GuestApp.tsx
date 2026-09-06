import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppView } from '../types';
import { fetchGuestContext, GuestContext, submitGuestRequest, bookGuestExperience } from '../lib/guestApi';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { GuestHome } from '../components/GuestHome';
import { RoomDiningView } from '../components/RoomDiningView';
import { NewRequestModal, NewRequestSubmission } from '../components/NewRequestModal';
import { SupabaseSetupNeeded } from '../components/SupabaseSetupNeeded';
import { OrderStatusBar } from '../components/OrderStatusBar';

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
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

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

  const handleConciergeSubmit = async (submission: NewRequestSubmission) => {
    await submitGuestRequest(token, submission.title, submission.priority);
  };

  return (
    <>
      <OrderStatusBar token={token} currency={context.property.currency} />
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
          onOpenNewRequest={() => setIsRequestModalOpen(true)}
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
      <NewRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        mode="guest"
        onSubmit={handleConciergeSubmit}
      />
    </>
  );
}

function CenteredMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f6faff] p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-bold text-[#141d23] mb-2">{title}</h1>
        <p className="text-sm text-[#4e463a]">{body}</p>
      </div>
    </div>
  );
}
