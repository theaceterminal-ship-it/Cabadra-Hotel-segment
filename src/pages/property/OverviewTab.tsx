import React, { useEffect, useState } from 'react';
import { ArrowRight, Building2, CheckCircle2, ChevronRight, IndianRupee, Megaphone, UserRoundX } from 'lucide-react';
import { Property, Room, UrgentRequest } from '../../types';
import { fetchGuestRequests, resolveGuestRequest, StaffMember, TicketSizeAnalytics, updateProperty } from '../../lib/staffApi';
import { formatCurrency } from '../../lib/currency';
import { ErrorNote, Field, Modal, Panel, PhotoField, Switch, btnPrimary, btnSecondary, inputCls } from './ui';
import { BillingPanel } from './BillingPanel';
import { GuestEmailsPanel } from './GuestEmailsPanel';

const ROOM_STATUSES: { key: Room['status']; label: string; dot: string }[] = [
  { key: 'ready', label: 'Ready', dot: 'bg-room-ready' },
  { key: 'occupied', label: 'Occupied', dot: 'bg-room-occupied' },
  { key: 'occupied_vip', label: 'VIP', dot: 'bg-room-vip' },
  { key: 'cleaning', label: 'Cleaning', dot: 'bg-room-cleaning' },
  { key: 'dirty', label: 'Dirty', dot: 'bg-room-dirty' },
  { key: 'maintenance', label: 'Maintenance', dot: 'bg-room-maintenance' },
];

export function OverviewTab({ property, rooms, staff, ticketAnalytics, onChanged, onGoToStaff }: {
  property: Property;
  rooms: Room[];
  staff: StaffMember[];
  ticketAnalytics: TicketSizeAnalytics | null;
  onChanged: () => Promise<void> | void;
  onGoToStaff: () => void;
}) {
  const hasReceptionist = staff.some(s => s.role === 'receptionist');

  return (
    <div className="space-y-4">
      {!hasReceptionist && (
        <button
          onClick={onGoToStaff}
          className="w-full flex items-center gap-3 rounded-[20px] bg-[#fbeedd] text-[#6b4511] px-5 py-4 text-left hover:brightness-[0.98] transition"
        >
          <UserRoundX className="size-5 shrink-0" />
          <span className="flex-1 text-sm">
            <span className="font-medium">No reception access yet.</span> Set up the reception link so the front desk can check guests in.
          </span>
          <ArrowRight className="size-4 shrink-0" />
        </button>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Occupancy" value={`${property.occupancy}%`} />
        <Stat label="Rooms" value={String(property.totalRooms)} />
        <Stat label="Revenue today" value={property.revenueToday} />
        <Stat label="Open requests" value={String(property.requestsCount)} />
      </div>

      {!property.hasExternalPms && rooms.length > 0 && (
        <Panel>
          <p className="text-sm font-medium text-on-surface mb-3">Rooms right now</p>
          <div className="flex flex-wrap gap-2">
            {ROOM_STATUSES.map(s => (
              <span key={s.key} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-surface-container text-sm text-on-surface">
                <span className={`size-2 rounded-full ${s.dot}`} />
                {s.label}
                <span className="font-semibold">{rooms.filter(r => r.status === s.key).length}</span>
              </span>
            ))}
          </div>
        </Panel>
      )}

      {property.requestsCount > 0 && <OpenRequests propertyId={property.id} />}

      {ticketAnalytics && ticketAnalytics.ordersTotal > 0 && (
        <Panel>
          <p className="text-sm font-medium text-on-surface">Suggestions in the guest app</p>
          <p className="text-xs text-on-surface-variant mt-0.5">Average order value across {ticketAnalytics.ordersTotal} order{ticketAnalytics.ordersTotal === 1 ? '' : 's'}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface-container-low p-4">
              <p className="text-xl font-semibold text-on-surface">{formatCurrency(ticketAnalytics.avgOrderValueWithRecommendation, property.currency)}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">With a suggestion</p>
            </div>
            <div className="rounded-2xl bg-surface-container-low p-4">
              <p className="text-xl font-semibold text-on-surface">{formatCurrency(ticketAnalytics.avgOrderValueWithoutRecommendation, property.currency)}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">Without</p>
            </div>
          </div>
        </Panel>
      )}

      <PropertySettings property={property} onChanged={onChanged} />

      <BillingPanel propertyId={property.id} />

      <GuestEmailsPanel propertyId={property.id} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-surface-container-lowest border border-outline-variant p-4 sm:p-5">
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className="text-2xl font-semibold tracking-[-0.02em] text-on-surface mt-1">{value}</p>
    </div>
  );
}

/** Guest requests still open, resolvable here the same way Reception resolves them. */
function OpenRequests({ propertyId }: { propertyId: string }) {
  const [requests, setRequests] = useState<UrgentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const reload = () => fetchGuestRequests(propertyId).then(setRequests).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [propertyId]);

  const open = requests.filter(r => r.status === 'open');
  if (loading || open.length === 0) return null;

  const handleResolve = async (id: string) => {
    setResolvingId(id);
    try {
      await resolveGuestRequest(id);
      reload();
    } catch {
      // Nothing changed; the row stays so they can try again.
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <Panel>
      <p className="text-sm font-medium text-on-surface flex items-center gap-2"><Megaphone className="size-4 text-error" /> Open requests</p>
      <div className="mt-2 divide-y divide-outline-variant">
        {open.map(r => (
          <div key={r.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-on-surface truncate">{r.title}</p>
              <p className="text-xs text-on-surface-variant">Room {r.roomNumber} · {r.timeAgo}</p>
            </div>
            <button onClick={() => handleResolve(r.id)} disabled={resolvingId === r.id} className={`${btnSecondary} h-9`}>
              <CheckCircle2 className="size-4" /> {resolvingId === r.id ? 'Resolving…' : 'Resolve'}
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Cover photo, PMS mode and UPI ID as a short settings list; each edit opens in its own dialog. */
function PropertySettings({ property, onChanged }: { property: Property; onChanged: () => Promise<void> | void }) {
  const [hasExternalPms, setHasExternalPms] = useState(property.hasExternalPms);
  const [savingPms, setSavingPms] = useState(false);
  const [pmsError, setPmsError] = useState<string | null>(null);
  const [editing, setEditing] = useState<'photo' | 'upi' | null>(null);

  useEffect(() => setHasExternalPms(property.hasExternalPms), [property.hasExternalPms]);

  const handlePmsToggle = async (next: boolean) => {
    setHasExternalPms(next); // optimistic: a switch should feel instant
    setSavingPms(true);
    setPmsError(null);
    try {
      await updateProperty(property.id, { hasExternalPms: next });
      await onChanged();
    } catch (err) {
      setHasExternalPms(!next);
      setPmsError(err instanceof Error ? err.message : 'Couldn’t save that change.');
    } finally {
      setSavingPms(false);
    }
  };

  return (
    <Panel className="!p-0 overflow-hidden">
      <p className="text-sm font-medium text-on-surface px-5 sm:px-6 pt-5">Property settings</p>
      <div className="divide-y divide-outline-variant mt-2">
        <button onClick={() => setEditing('photo')} className="w-full flex items-center gap-4 px-5 sm:px-6 py-4 text-left hover:bg-surface-container-low transition-colors">
          <span className="size-12 shrink-0 rounded-xl overflow-hidden bg-surface-container flex items-center justify-center text-on-surface-variant">
            {property.image ? <img src={property.image} alt="" className="size-full object-cover" /> : <Building2 className="size-5" />}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-on-surface">Cover photo</span>
            <span className="block text-xs text-on-surface-variant mt-0.5">{property.image ? 'Shown on your properties list and the guest app' : 'Not set'}</span>
          </span>
          <ChevronRight className="size-4 text-on-surface-variant" />
        </button>

        <div className="flex items-center gap-4 px-5 sm:px-6 py-4">
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-on-surface">We use another PMS</span>
            <span className="block text-xs text-on-surface-variant mt-0.5">
              {hasExternalPms
                ? 'On: your PMS keeps bookings. Reception just adds the guest to a room.'
                : 'Off: Cabadra is your front desk, with bookings and availability.'}
            </span>
            {pmsError && <span className="block text-xs text-error mt-1">{pmsError}</span>}
          </span>
          <Switch checked={hasExternalPms} onChange={handlePmsToggle} disabled={savingPms} label="We use another PMS" />
        </div>

        <button onClick={() => setEditing('upi')} className="w-full flex items-center gap-4 px-5 sm:px-6 py-4 text-left hover:bg-surface-container-low transition-colors">
          <span className="size-12 shrink-0 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant">
            <IndianRupee className="size-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-on-surface">UPI ID</span>
            <span className="block text-xs text-on-surface-variant mt-0.5 truncate">{property.upiId || 'Not set. Reception can show it as a QR for guests to pay.'}</span>
          </span>
          <ChevronRight className="size-4 text-on-surface-variant" />
        </button>
      </div>

      {editing === 'photo' && <PhotoDialog property={property} onClose={() => setEditing(null)} onSaved={onChanged} />}
      {editing === 'upi' && <UpiDialog property={property} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </Panel>
  );
}

function PhotoDialog({ property, onClose, onSaved }: { property: Property; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [image, setImage] = useState(property.image ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateProperty(property.id, { image: image.trim() });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save photo.');
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Cover photo"
      onClose={onClose}
      onSubmit={handleSave}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
          <button type="submit" disabled={saving || image === (property.image ?? '')} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      {image && <img src={image} alt="" className="w-full h-44 rounded-2xl object-cover" />}
      <PhotoField label="Photo" value={image} onChange={setImage} />
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}

function UpiDialog({ property, onClose, onSaved }: { property: Property; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [upiId, setUpiId] = useState(property.upiId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateProperty(property.id, { upiId: upiId.trim() });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save UPI ID.');
      setSaving(false);
    }
  };

  return (
    <Modal
      title="UPI ID"
      description="Reception can show this as a QR code when a guest pays by UPI. Payments are still confirmed by reception."
      onClose={onClose}
      onSubmit={handleSave}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
          <button type="submit" disabled={saving || upiId === (property.upiId ?? '')} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <Field label="UPI ID"><input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="pineview@okhdfcbank" className={inputCls} autoFocus /></Field>
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}
