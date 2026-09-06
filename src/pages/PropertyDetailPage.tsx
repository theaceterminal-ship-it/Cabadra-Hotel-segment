import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { Property, Room, MenuItem } from '../types';
import {
  fetchRoomsForProperty,
  addRoom,
  updateRoom,
  deleteRoom,
  fetchMenuForProperty,
  addMenuItem,
  updateMenuItem,
  bulkAddMenuItems,
  deleteMenuItem,
  updateProperty,
  fetchStaffForProperty,
  inviteStaff,
  revokeStaffAccess,
  fetchTicketSizeAnalytics,
  sendStaffInviteEmail,
  fetchPendingInvites,
  cancelPendingInvite,
  fetchExperiencesForProperty,
  addExperience,
  updateExperience,
  deleteExperience,
  fetchServiceCategories,
  addServiceCategory,
  updateServiceCategory,
  deleteServiceCategory,
  fetchTransportRoutes,
  addTransportRoute,
  deleteTransportRoute,
  fetchStaffDirectory,
  addDirectoryContact,
  deleteDirectoryContact,
  StaffMember,
  TicketSizeAnalytics,
  PendingInvite,
  Experience,
  ServiceCategory,
  TransportRoute,
  DirectoryContact,
} from '../lib/staffApi';
import { ImageUploadField } from '../components/ImageUploadField';
import { formatCurrency } from '../lib/currency';
import {
  ArrowLeft, Plus, Trash2, BedDouble, UtensilsCrossed, Users, Pencil,
  LayoutDashboard, Upload, Download, AlertTriangle, Sparkles, ConciergeBell,
} from 'lucide-react';

const inputCls = "w-full h-9 px-2 text-xs border border-[#E9ECEF] rounded focus:border-[#765a25] focus:outline-none";
const labelCls = "text-[10px] font-bold text-[#4e463a] block mb-1";

interface PropertyDetailPageProps {
  properties: Property[];
  onChanged: () => void;
}

/**
 * The full-page replacement for the old "Manage Rooms & Menu" modal — a
 * property is a whole console (overview, rooms, menu, staff), not
 * something that fits in a box. Routed at /owner/properties/:propertyId so
 * it's bookmarkable and the browser back button just works.
 */
export default function PropertyDetailPage({ properties, onChanged }: PropertyDetailPageProps) {
  const { propertyId = '' } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const property = properties.find(p => p.id === propertyId);

  const [tab, setTab] = useState<'overview' | 'rooms' | 'menu' | 'experiences' | 'services' | 'staff'>('overview');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [services, setServices] = useState<ServiceCategory[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [ticketAnalytics, setTicketAnalytics] = useState<TicketSizeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState(property?.image ?? '');
  const [savingImage, setSavingImage] = useState(false);

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
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    setImageUrl(property?.image ?? '');
  }, [property?.image]);

  const handleReload = async () => {
    await reload();
    onChanged();
  };

  const handleSaveImage = async () => {
    setSavingImage(true);
    try {
      await updateProperty(propertyId, { image: imageUrl.trim() });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save photo.');
    } finally {
      setSavingImage(false);
    }
  };

  if (!property && !loading) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <p className="text-sm text-[#4e463a]">Property not found, or you don't have access to it.</p>
        <button onClick={() => navigate('/owner/properties')} className="mt-3 text-sm font-semibold text-[#765a25] hover:underline">
          Back to Properties
        </button>
      </div>
    );
  }

  const tabs: { id: typeof tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'rooms', label: `Rooms (${rooms.length})`, icon: BedDouble },
    { id: 'menu', label: `Menu (${menu.length})`, icon: UtensilsCrossed },
    { id: 'experiences', label: `Experiences (${experiences.length})`, icon: Sparkles },
    { id: 'services', label: `Services (${services.length})`, icon: ConciergeBell },
    { id: 'staff', label: `Staff (${staff.length})`, icon: Users },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <button
        onClick={() => navigate('/owner/properties')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#765a25] hover:underline cursor-pointer w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Properties</span>
      </button>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[#141d23]">{property?.name ?? propertyId}</h1>
          <p className="text-sm text-[#4e463a] mt-1">{property?.location}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[#E9ECEF] overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-bold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id ? 'border-[#765a25] text-[#765a25]' : 'border-transparent text-[#7f7668] hover:text-[#4e463a]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-sm text-[#7f7668] text-center py-12">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600 text-center py-12">{error}</p>
      ) : tab === 'overview' ? (
        <OverviewTab
          property={property!}
          imageUrl={imageUrl}
          setImageUrl={setImageUrl}
          onSaveImage={handleSaveImage}
          savingImage={savingImage}
          rooms={rooms}
          staff={staff}
          ticketAnalytics={ticketAnalytics}
        />
      ) : tab === 'rooms' ? (
        <RoomsTab propertyId={propertyId} currency={property?.currency ?? 'USD'} rooms={rooms} onChanged={handleReload} />
      ) : tab === 'menu' ? (
        <MenuTab propertyId={propertyId} currency={property?.currency ?? 'USD'} menu={menu} onChanged={handleReload} />
      ) : tab === 'experiences' ? (
        <ExperiencesTab propertyId={propertyId} currency={property?.currency ?? 'USD'} experiences={experiences} onChanged={handleReload} />
      ) : tab === 'services' ? (
        <ServicesTab propertyId={propertyId} currency={property?.currency ?? 'USD'} services={services} onChanged={handleReload} />
      ) : (
        <StaffTab propertyId={propertyId} staff={staff} pendingInvites={pendingInvites} onChanged={handleReload} />
      )}
    </div>
  );
}

function OverviewTab({ property, imageUrl, setImageUrl, onSaveImage, savingImage, rooms, staff, ticketAnalytics }: {
  property: Property; imageUrl: string; setImageUrl: (v: string) => void; onSaveImage: () => void; savingImage: boolean;
  rooms: Room[]; staff: StaffMember[]; ticketAnalytics: TicketSizeAnalytics | null;
}) {
  const hasReceptionist = staff.some(s => s.role === 'receptionist');

  return (
    <div className="space-y-6">
      {!hasReceptionist && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-[#fff8ec] border border-[#f0dfb8]">
          <AlertTriangle className="w-4 h-4 text-[#765a25] shrink-0 mt-0.5" />
          <p className="text-xs text-[#4e463a]">
            No receptionist assigned to this property yet — day-to-day check-ins, room status, and the kitchen board need
            someone with reception access. Grant it from the <strong>Staff</strong> tab.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Occupancy" value={`${property.occupancy}%`} />
        <StatCard label="Rooms" value={String(property.totalRooms)} />
        <StatCard label="Revenue Today" value={property.revenueToday} />
        <StatCard label="Open Requests" value={String(property.requestsCount)} />
      </div>

      {ticketAnalytics && ticketAnalytics.ordersTotal > 0 && (
        <div className="bg-[#fff8ec] rounded-xl p-5 border border-[#f0dfb8] flex flex-wrap items-center gap-6 justify-between">
          <div>
            <span className="text-xs font-semibold text-[#765a25] uppercase tracking-wider">Recommendation Engine Impact</span>
            <p className="text-xs text-[#7f7668] mt-1">{ticketAnalytics.ordersTotal} order{ticketAnalytics.ordersTotal === 1 ? '' : 's'} total</p>
          </div>
          <div className="flex gap-8">
            <div>
              <div className="text-xl font-bold text-[#2D6A4F]">{formatCurrency(ticketAnalytics.avgOrderValueWithRecommendation, property.currency)}</div>
              <div className="text-[11px] text-[#4e463a]">Avg · with recommendation</div>
            </div>
            <div>
              <div className="text-xl font-bold text-[#141d23]">{formatCurrency(ticketAnalytics.avgOrderValueWithoutRecommendation, property.currency)}</div>
              <div className="text-[11px] text-[#4e463a]">Avg · without</div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E9ECEF] p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#141d23]">Property Photo</h3>
        <div className="flex items-end gap-2 max-w-md">
          <div className="flex-1">
            <ImageUploadField label="" value={imageUrl} onChange={setImageUrl} />
          </div>
          <button
            onClick={onSaveImage}
            disabled={savingImage || imageUrl === property.image}
            className="h-9 px-3 rounded bg-[#765a25] text-white text-xs font-bold hover:bg-[#5c4210] disabled:opacity-40 whitespace-nowrap"
          >
            {savingImage ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <PmsModeCard property={property} />

      <UpiSettingsCard property={property} />

      <div className="bg-white rounded-xl border border-[#E9ECEF] p-5">
        <h3 className="text-sm font-bold text-[#141d23] mb-3">Room Status</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
          {(['ready', 'occupied', 'occupied_vip', 'cleaning', 'dirty', 'maintenance'] as const).map(status => (
            <div key={status} className="bg-[#f6faff] rounded-lg p-2 border border-[#E9ECEF]">
              <div className="text-lg font-bold text-[#141d23]">{rooms.filter(r => r.status === status).length}</div>
              <div className="text-[10px] text-[#7f7668] capitalize">{status.replace('_', ' ')}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The one switch that decides whether Cabadra is this hotel's front desk
 * or sits on top of one they already have. Off: Reception gets the full
 * New Booking flow (search availability, book ahead, cancel). On: that
 * flow disappears — the hotel's real PMS already owns bookings, so
 * Reception's only job is tapping a room and typing who's in it, which
 * is all the guest-experience features (QR, folio, requests) actually
 * need to work. No integration exists yet either way — this just keeps
 * Cabadra's own screens out of the way of a front desk it doesn't own.
 */
function PmsModeCard({ property }: { property: Property }) {
  const [hasExternalPms, setHasExternalPms] = useState(property.hasExternalPms);
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    const next = !hasExternalPms;
    setHasExternalPms(next); // optimistic — a settings switch should feel instant
    setSaving(true);
    try {
      await updateProperty(property.id, { hasExternalPms: next });
    } catch {
      setHasExternalPms(!next); // revert on failure
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#E9ECEF] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-[#141d23]">Does this hotel already use a PMS?</h3>
          <p className="text-xs text-[#7f7668] mt-1 max-w-md">
            {hasExternalPms
              ? 'On — Reception skips booking screens entirely. They just tap a room and add the guest’s name so the room’s QR code, folio and requests work for them.'
              : 'Off — Cabadra is the front desk here. Reception uses New Booking to search availability and book rooms.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={hasExternalPms}
          onClick={handleToggle}
          disabled={saving}
          className={`shrink-0 w-12 h-7 rounded-full relative transition-colors disabled:opacity-60 ${hasExternalPms ? 'bg-[#765a25]' : 'bg-[#E9ECEF]'}`}
        >
          <span
            className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${hasExternalPms ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>
    </div>
  );
}

/** Lets an owner set a UPI ID once so Reception can show a payment QR without re-typing it — folio settlement itself stays manual (Reception confirms what was collected), this just makes "how do they actually pay" concrete for UPI specifically. */
function UpiSettingsCard({ property }: { property: Property }) {
  const [upiId, setUpiId] = useState(property.upiId ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateProperty(property.id, { upiId });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // Best-effort — the input keeps whatever the owner typed either way.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-[#E9ECEF] p-5 space-y-3">
      <h3 className="text-sm font-bold text-[#141d23]">Payment (UPI)</h3>
      <p className="text-xs text-[#7f7668]">Set once — Reception can show this as a QR at checkout or mid-stay for a guest paying by UPI. Folio settlement is still confirmed manually either way.</p>
      <div className="flex items-end gap-2 max-w-md">
        <div className="flex-1">
          <label className={labelCls}>UPI ID</label>
          <input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="hotelname@okhdfcbank" className={inputCls} />
        </div>
        <button
          onClick={handleSave}
          disabled={saving || upiId === (property.upiId ?? '')}
          className="h-9 px-3 rounded bg-[#765a25] text-white text-xs font-bold hover:bg-[#5c4210] disabled:opacity-40 whitespace-nowrap"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-[#E9ECEF]">
      <div className="text-[10px] font-semibold text-[#4e463a] uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-bold text-[#141d23]">{value}</div>
    </div>
  );
}

function RoomsTab({ propertyId, currency, rooms, onChanged }: { propertyId: string; currency: string; rooms: Room[]; onChanged: () => void }) {
  const emptyForm = { number: '', type: '', floor: '1', occupancy: '2', price: '', image: '' };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const startEdit = (r: Room) => {
    setEditingId(r.id);
    setForm({ number: r.number, type: r.type, floor: String(r.floor), occupancy: String(r.maxOccupancy), price: String(r.pricePerNight), image: r.image ?? '' });
  };
  const cancelEdit = () => { setEditingId(null); setForm(emptyForm); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.number.trim() || !form.type.trim() || !form.price.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        number: form.number.trim(), type: form.type.trim(),
        floor: parseInt(form.floor) || 1, maxOccupancy: parseInt(form.occupancy) || 2, pricePerNight: parseFloat(form.price) || 0,
        image: form.image.trim() || undefined,
      };
      if (editingId) {
        await updateRoom(editingId, payload);
      } else {
        await addRoom(propertyId, payload);
      }
      cancelEdit();
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save room.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (roomId: string) => {
    try {
      await deleteRoom(roomId);
      if (editingId === roomId) cancelEdit();
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete room — it may already have reservation history.');
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-2 bg-[#f6faff] p-3 rounded-lg border border-[#E9ECEF]">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div>
            <label className={labelCls}>Number</label>
            <input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} placeholder="101" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <input value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} placeholder="King Suite" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Floor</label>
            <input type="number" value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Sleeps</label>
            <input type="number" min={1} value={form.occupancy} onChange={e => setForm(f => ({ ...f, occupancy: e.target.value }))} placeholder="2" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Price/night ({currency})</label>
            <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="195" className={inputCls} />
          </div>
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <ImageUploadField label="Photo (optional)" value={form.image} onChange={url => setForm(f => ({ ...f, image: url }))} />
          </div>
          <button type="submit" disabled={submitting} className="h-9 px-4 rounded-lg bg-[#765a25] text-white text-xs font-bold flex items-center justify-center gap-1 hover:bg-[#5c4210] disabled:opacity-60 whitespace-nowrap">
            {editingId ? 'Save Changes' : <><Plus className="w-3.5 h-3.5" /> Add</>}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="h-9 px-3 rounded-lg border border-[#E9ECEF] text-xs font-semibold text-[#4e463a]">
              Cancel
            </button>
          )}
        </div>
      </form>
      {formError && <p className="text-xs text-red-600">{formError}</p>}

      <div className="space-y-1.5">
        {rooms.length === 0 ? (
          <p className="text-xs text-[#7f7668] text-center py-6">No rooms yet — add one above.</p>
        ) : (
          rooms.map(r => (
            <div key={r.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${editingId === r.id ? 'border-[#765a25] bg-[#fff8ec]' : 'border-[#E9ECEF]'}`}>
              <span className="font-semibold text-[#141d23]">Room {r.number}</span>
              <span className="text-[#7f7668]">{r.type} · Floor {r.floor} · Sleeps {r.maxOccupancy} · {formatCurrency(r.pricePerNight, currency)}/night</span>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(r)} className="text-[#765a25] hover:text-[#5c4210] p-1">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(r.id)} className="text-[#BC4749] hover:text-red-700 p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const MENU_CSV_HEADERS = ['name', 'category', 'price', 'description', 'image', 'isVeg', 'prepTime'];

function downloadMenuCsvTemplate() {
  const csv = Papa.unparse({
    fields: MENU_CSV_HEADERS,
    data: [
      ['Paneer Tikka', 'Indian', '14', 'Char-grilled marinated cottage cheese', 'https://...', 'true', '15-20 mins'],
    ],
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cabadra-menu-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function MenuTab({ propertyId, currency, menu, onChanged }: { propertyId: string; currency: string; menu: MenuItem[]; onChanged: () => void }) {
  const emptyForm = { name: '', category: '', price: '', description: '', image: '', isVeg: true, prepTime: '' };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const csvInputRef = React.useRef<HTMLInputElement>(null);

  const startEdit = (m: MenuItem) => {
    setEditingId(m.id);
    setForm({ name: m.name, category: m.category, price: String(m.price), description: m.description, image: m.image, isVeg: m.isVeg, prepTime: m.prepTime ?? '' });
  };
  const cancelEdit = () => { setEditingId(null); setForm(emptyForm); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.category.trim() || !form.price.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(), category: form.category.trim(), price: parseFloat(form.price) || 0,
        description: form.description.trim(), image: form.image.trim(), isVeg: form.isVeg, tags: [],
        prepTime: form.prepTime.trim() || undefined,
      };
      if (editingId) {
        await updateMenuItem(propertyId, editingId, payload);
      } else {
        await addMenuItem(propertyId, payload);
      }
      cancelEdit();
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save menu item.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await deleteMenuItem(propertyId, itemId);
      if (editingId === itemId) cancelEdit();
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete item.');
    }
  };

  const handleCsvSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    setFormError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const missingHeaders = ['name', 'category', 'price'].filter(h => !results.meta.fields?.includes(h));
          if (missingHeaders.length > 0) {
            throw new Error(`CSV is missing required column(s): ${missingHeaders.join(', ')}. Download the template for the exact format.`);
          }
          const items = results.data
            .filter(row => row.name?.trim())
            .map(row => ({
              name: row.name.trim(),
              category: (row.category || 'Uncategorized').trim(),
              price: parseFloat(row.price) || 0,
              description: (row.description || '').trim(),
              image: (row.image || '').trim(),
              isVeg: /^(true|yes|1)$/i.test((row.isVeg || '').trim()),
              tags: [],
              prepTime: row.prepTime?.trim() || undefined,
            }));
          if (items.length === 0) throw new Error('No valid rows found in that CSV.');
          await bulkAddMenuItems(propertyId, items);
          setImportResult(`Imported ${items.length} item${items.length === 1 ? '' : 's'}.`);
          onChanged();
        } catch (err) {
          setFormError(err instanceof Error ? err.message : 'Import failed.');
        } finally {
          setImporting(false);
        }
      },
      error: (err) => {
        setFormError(err.message);
        setImporting(false);
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 bg-[#ecf5fe] p-3 rounded-lg border border-[#E9ECEF]">
        <span className="text-xs font-bold text-[#141d23]">Bulk import:</span>
        <button type="button" onClick={downloadMenuCsvTemplate} className="h-8 px-3 rounded bg-white border border-[#E9ECEF] text-[#4e463a] text-[11px] font-semibold hover:bg-gray-50 flex items-center gap-1.5">
          <Download className="w-3 h-3" /> Download Template
        </button>
        <input ref={csvInputRef} type="file" accept=".csv" onChange={handleCsvSelected} className="hidden" />
        <button type="button" onClick={() => csvInputRef.current?.click()} disabled={importing} className="h-8 px-3 rounded bg-[#765a25] text-white text-[11px] font-bold hover:bg-[#5c4210] disabled:opacity-60 flex items-center gap-1.5">
          <Upload className="w-3 h-3" /> {importing ? 'Importing…' : 'Import CSV'}
        </button>
        {importResult && <span className="text-[11px] text-[#2D6A4F] font-semibold">{importResult}</span>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2 bg-[#f6faff] p-3 rounded-lg border border-[#E9ECEF]">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="col-span-2">
            <label className={labelCls}>Item Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Paneer Tikka" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Indian" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Price ({currency})</label>
            <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="14" className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Char-grilled marinated cottage cheese..." className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Prep Time (ETA)</label>
            <input value={form.prepTime} onChange={e => setForm(f => ({ ...f, prepTime: e.target.value }))} placeholder="15-20 mins" className={inputCls} />
          </div>
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <ImageUploadField label="Photo (optional)" value={form.image} onChange={url => setForm(f => ({ ...f, image: url }))} />
          </div>
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#141d23] h-9">
            <input type="checkbox" checked={form.isVeg} onChange={e => setForm(f => ({ ...f, isVeg: e.target.checked }))} className="accent-[#765a25]" /> Veg
          </label>
          <button type="submit" disabled={submitting} className="h-9 px-4 rounded-lg bg-[#765a25] text-white text-xs font-bold flex items-center justify-center gap-1 hover:bg-[#5c4210] disabled:opacity-60 whitespace-nowrap">
            {editingId ? 'Save Changes' : <><Plus className="w-3.5 h-3.5" /> Add</>}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="h-9 px-3 rounded-lg border border-[#E9ECEF] text-xs font-semibold text-[#4e463a]">
              Cancel
            </button>
          )}
        </div>
      </form>
      {formError && <p className="text-xs text-red-600">{formError}</p>}

      <div className="space-y-1.5">
        {menu.length === 0 ? (
          <p className="text-xs text-[#7f7668] text-center py-6">No menu items yet — add one above or import a CSV.</p>
        ) : (
          menu.map(m => (
            <div key={m.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${editingId === m.id ? 'border-[#765a25] bg-[#fff8ec]' : 'border-[#E9ECEF]'}`}>
              <span className="font-semibold text-[#141d23]">{m.name}</span>
              <span className="text-[#7f7668]">{m.category} · {formatCurrency(m.price, currency)} · {m.isVeg ? 'Veg' : 'Non-veg'}{m.prepTime ? ` · ${m.prepTime}` : ''}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(m)} className="text-[#765a25] hover:text-[#5c4210] p-1">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(m.id)} className="text-[#BC4749] hover:text-red-700 p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** The guest home page's "Curated For You" cards — owner-managed instead of hardcoded demo copy. Same shape/flow as MenuTab, minus category/veg/CSV, plus a free-text unit label ("per couple", "per person", "per hour"). */
function ExperiencesTab({ propertyId, currency, experiences, onChanged }: { propertyId: string; currency: string; experiences: Experience[]; onChanged: () => void }) {
  const emptyForm = { name: '', description: '', price: '', unitLabel: 'per person', image: '' };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const startEdit = (exp: Experience) => {
    setEditingId(exp.id);
    setForm({ name: exp.name, description: exp.description, price: String(exp.price), unitLabel: exp.unitLabel, image: exp.image });
  };
  const cancelEdit = () => { setEditingId(null); setForm(emptyForm); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.price.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(), description: form.description.trim(),
        price: parseFloat(form.price) || 0, unitLabel: form.unitLabel.trim() || 'per person',
        image: form.image.trim(),
      };
      if (editingId) {
        await updateExperience(propertyId, editingId, payload);
      } else {
        await addExperience(propertyId, payload);
      }
      cancelEdit();
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save experience.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (expId: string) => {
    try {
      await deleteExperience(propertyId, expId);
      if (editingId === expId) cancelEdit();
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete experience.');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#7f7668]">
        These show up as "Curated For You" cards on the guest home page. Nothing shows there until you add one here.
      </p>

      <form onSubmit={handleSubmit} className="space-y-2 bg-[#f6faff] p-3 rounded-lg border border-[#E9ECEF]">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="col-span-2">
            <label className={labelCls}>Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Sunset Yacht Cruise" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Price ({currency})</label>
            <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="350" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Unit</label>
            <input value={form.unitLabel} onChange={e => setForm(f => ({ ...f, unitLabel: e.target.value }))} placeholder="per couple" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Description</label>
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Private 65ft luxury yacht with complimentary champagne..." className={inputCls} />
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <ImageUploadField label="Photo (optional)" value={form.image} onChange={url => setForm(f => ({ ...f, image: url }))} />
          </div>
          <button type="submit" disabled={submitting} className="h-9 px-4 rounded-lg bg-[#765a25] text-white text-xs font-bold flex items-center justify-center gap-1 hover:bg-[#5c4210] disabled:opacity-60 whitespace-nowrap">
            {editingId ? 'Save Changes' : <><Plus className="w-3.5 h-3.5" /> Add</>}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="h-9 px-3 rounded-lg border border-[#E9ECEF] text-xs font-semibold text-[#4e463a]">
              Cancel
            </button>
          )}
        </div>
      </form>
      {formError && <p className="text-xs text-red-600">{formError}</p>}

      <div className="space-y-1.5">
        {experiences.length === 0 ? (
          <p className="text-xs text-[#7f7668] text-center py-6">No experiences yet — add one above.</p>
        ) : (
          experiences.map(exp => (
            <div key={exp.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${editingId === exp.id ? 'border-[#765a25] bg-[#fff8ec]' : 'border-[#E9ECEF]'}`}>
              <span className="font-semibold text-[#141d23]">{exp.name}</span>
              <span className="text-[#7f7668]">{formatCurrency(exp.price, currency)} {exp.unitLabel}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(exp)} className="text-[#765a25] hover:text-[#5c4210] p-1">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(exp.id)} className="text-[#BC4749] hover:text-red-700 p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const DEPARTMENTS: { value: ServiceCategory['department']; label: string }[] = [
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'amenities', label: 'Amenities' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'concierge', label: 'Concierge' },
];

/** The guest home page's "At Your Service" grid — owner-managed instead of a fixed Housekeeping/Amenities/Spa/Transfers set every property showed identically. Department decides which Live Ops queue a resulting request lands in. */
function ServicesTab({ propertyId, currency, services, onChanged }: { propertyId: string; currency: string; services: ServiceCategory[]; onChanged: () => void }) {
  const emptyForm = { name: '', description: '', department: 'concierge' as ServiceCategory['department'], categoryType: 'general' as ServiceCategory['categoryType'] };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const startEdit = (s: ServiceCategory) => {
    setEditingId(s.id);
    setForm({ name: s.name, description: s.description, department: s.department, categoryType: s.categoryType });
  };
  const cancelEdit = () => { setEditingId(null); setForm(emptyForm); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = { name: form.name.trim(), description: form.description.trim(), department: form.department, categoryType: form.categoryType };
      if (editingId) {
        await updateServiceCategory(propertyId, editingId, payload);
      } else {
        await addServiceCategory(propertyId, payload);
      }
      cancelEdit();
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save service.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteServiceCategory(propertyId, id);
      if (editingId === id) cancelEdit();
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete service.');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#7f7668]">
        These show up as "At Your Service" cards on the guest home page — add whatever this property actually
        offers (housekeeping, spa, airport transfers, business center...). A guest's request is tagged with the
        department here, so it routes straight to the right Live Ops queue instead of Reception guessing from a title.
      </p>

      <form onSubmit={handleSubmit} className="space-y-2 bg-[#f6faff] p-3 rounded-lg border border-[#E9ECEF]">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className={labelCls}>Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Spa & Wellness" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Routes To</label>
            <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value as ServiceCategory['department'] }))} className={`${inputCls} bg-white`}>
              {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Short Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Massages & Sauna" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Guest Form Type</label>
            <select value={form.categoryType} onChange={e => setForm(f => ({ ...f, categoryType: e.target.value as ServiceCategory['categoryType'] }))} className={`${inputCls} bg-white`}>
              <option value="general">Free-text note</option>
              <option value="transportation">Route picker (below)</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 items-end justify-end">
          <button type="submit" disabled={submitting} className="h-9 px-4 rounded-lg bg-[#765a25] text-white text-xs font-bold flex items-center justify-center gap-1 hover:bg-[#5c4210] disabled:opacity-60 whitespace-nowrap">
            {editingId ? 'Save Changes' : <><Plus className="w-3.5 h-3.5" /> Add</>}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="h-9 px-3 rounded-lg border border-[#E9ECEF] text-xs font-semibold text-[#4e463a]">
              Cancel
            </button>
          )}
        </div>
      </form>
      {formError && <p className="text-xs text-red-600">{formError}</p>}

      <div className="space-y-1.5">
        {services.length === 0 ? (
          <p className="text-xs text-[#7f7668] text-center py-6">No services yet — the guest home page's "At Your Service" section stays empty until you add one.</p>
        ) : (
          services.map(s => (
            <div key={s.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${editingId === s.id ? 'border-[#765a25] bg-[#fff8ec]' : 'border-[#E9ECEF]'}`}>
              <span className="font-semibold text-[#141d23]">{s.name}</span>
              <span className="text-[#7f7668] capitalize">
                {s.description}{s.description ? ' · ' : ''}routes to {s.department}
                {s.categoryType === 'transportation' && ' · route picker'}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(s)} className="text-[#765a25] hover:text-[#5c4210] p-1">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(s.id)} className="text-[#BC4749] hover:text-red-700 p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {services.some(s => s.categoryType === 'transportation') && (
        <TransportRoutesManager propertyId={propertyId} currency={currency} />
      )}
    </div>
  );
}

/** Only shown once a Services entry is set to the route-picker type — the actual route catalog behind it. One shared list per property (a property realistically has one Transfers category, not several with different routes). */
function TransportRoutesManager({ propertyId, currency }: { propertyId: string; currency: string }) {
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ from: '', to: '', price: '', priceUnit: 'per trip' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => fetchTransportRoutes(propertyId).then(setRoutes).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [propertyId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.from.trim() || !form.to.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await addTransportRoute(propertyId, { from: form.from.trim(), to: form.to.trim(), price: parseFloat(form.price) || 0, priceUnit: form.priceUnit.trim() || 'per trip' });
      setForm({ from: '', to: '', price: '', priceUnit: 'per trip' });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add route.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTransportRoute(propertyId, id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete route.');
    }
  };

  return (
    <div className="border-t border-[#E9ECEF] pt-4 space-y-3">
      <h3 className="text-sm font-bold text-[#141d23]">Transport Routes</h3>
      <p className="text-xs text-[#7f7668]">Where this property actually takes guests — the guest sees these as a searchable pick list, not a blank box.</p>

      <form onSubmit={handleAdd} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end bg-[#f6faff] p-3 rounded-lg border border-[#E9ECEF]">
        <div>
          <label className={labelCls}>From</label>
          <input value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))} placeholder="Hotel" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>To</label>
          <input value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} placeholder="Airport (JFK)" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Price</label>
          <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="60" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Unit</label>
          <input value={form.priceUnit} onChange={e => setForm(f => ({ ...f, priceUnit: e.target.value }))} placeholder="per trip" className={inputCls} />
        </div>
        <button type="submit" disabled={submitting} className="h-9 rounded-lg bg-[#765a25] text-white text-xs font-bold hover:bg-[#5c4210] disabled:opacity-60 flex items-center justify-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="space-y-1.5">
        {loading ? null : routes.length === 0 ? (
          <p className="text-xs text-[#7f7668] text-center py-4">No routes yet.</p>
        ) : (
          routes.map(r => (
            <div key={r.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#E9ECEF] text-xs">
              <span className="font-semibold text-[#141d23]">{r.from} → {r.to}</span>
              <span className="text-[#7f7668]">{formatCurrency(r.price, currency)} {r.priceUnit}</span>
              <button onClick={() => handleDelete(r.id)} className="text-[#BC4749] hover:text-red-700 p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StaffTab({ propertyId, staff, pendingInvites, onChanged }: { propertyId: string; staff: StaffMember[]; pendingInvites: PendingInvite[]; onChanged: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'receptionist'>('receptionist');
  const [submitting, setSubmitting] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  // Set only right after a "no account found" response — offers the
  // end-to-end path (send a real invite email) as a follow-up action rather
  // than the default, since granting an existing account is instant and
  // free while sending an email hits the invite-staff Edge Function.
  const [noAccountFor, setNoAccountFor] = useState<{ email: string; role: 'owner' | 'receptionist' } | null>(null);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setMessage(null);
    setNoAccountFor(null);
    try {
      const result = await inviteStaff(propertyId, email.trim(), role);
      setMessage({ type: result.success ? 'success' : 'error', text: result.message });
      if (result.success) {
        setEmail('');
        onChanged();
      } else {
        setNoAccountFor({ email: email.trim(), role });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to grant access.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendInviteEmail = async () => {
    if (!noAccountFor) return;
    setSendingInvite(true);
    try {
      const result = await sendStaffInviteEmail(propertyId, noAccountFor.email, noAccountFor.role);
      setMessage({ type: result.success ? 'success' : 'error', text: result.message });
      if (result.success) {
        setEmail('');
        setNoAccountFor(null);
        onChanged();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send invite email.' });
    } finally {
      setSendingInvite(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    try {
      await revokeStaffAccess(propertyId, userId);
      onChanged();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to revoke access.' });
    }
  };

  const handleCancelPending = async (inviteEmail: string) => {
    try {
      await cancelPendingInvite(propertyId, inviteEmail);
      onChanged();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to cancel invite.' });
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2 items-end bg-[#f6faff] p-3 rounded-lg border border-[#E9ECEF]">
        <div className="flex-1 w-full">
          <label className={labelCls}>Grant access by email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@hotel.com" className={inputCls} />
          <p className="text-[10px] text-[#7f7668] mt-1">Already have an account? This grants access instantly. New email? You'll get the option to send a real invite next.</p>
        </div>
        <select value={role} onChange={e => setRole(e.target.value as 'owner' | 'receptionist')} className={`${inputCls} w-32 bg-white`}>
          <option value="receptionist">Receptionist</option>
          <option value="owner">Owner</option>
        </select>
        <button type="submit" disabled={submitting} className="h-9 px-4 rounded-lg bg-[#765a25] text-white text-xs font-bold hover:bg-[#5c4210] disabled:opacity-60 whitespace-nowrap">
          {submitting ? 'Checking…' : 'Grant Access'}
        </button>
      </form>

      {message && (
        <p className={`text-xs ${message.type === 'error' ? 'text-red-600' : 'text-[#2D6A4F]'}`}>{message.text}</p>
      )}

      {noAccountFor && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#fff8ec] border border-[#f0dfb8]">
          <p className="text-xs text-[#4e463a]">
            No account yet for <strong>{noAccountFor.email}</strong>. Send them a real invite email — they'll get {noAccountFor.role} access
            the moment they set a password.
          </p>
          <button
            onClick={handleSendInviteEmail}
            disabled={sendingInvite}
            className="h-8 px-3 rounded-lg bg-[#765a25] text-white text-[11px] font-bold hover:bg-[#5c4210] disabled:opacity-60 whitespace-nowrap"
          >
            {sendingInvite ? 'Sending…' : 'Send Invite Email'}
          </button>
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div className="space-y-1.5">
          <label className={labelCls}>Pending invites</label>
          {pendingInvites.map(p => (
            <div key={p.email} className="flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-[#E9ECEF] text-xs">
              <span className="font-semibold text-[#141d23]">{p.email}</span>
              <span className="capitalize px-2 py-0.5 rounded bg-[#fff8ec] text-[#765a25] font-bold text-[10px]">{p.role} · invited</span>
              <button onClick={() => handleCancelPending(p.email)} className="text-[#BC4749] hover:text-red-700 p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {staff.length === 0 ? (
          <p className="text-xs text-[#7f7668] text-center py-6">No staff records visible — run supabase/migrations/0005_staff_mgmt_and_media.sql if this looks wrong.</p>
        ) : (
          staff.map(s => (
            <div key={s.userId} className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#E9ECEF] text-xs">
              <span className="font-semibold text-[#141d23]">{s.email}</span>
              <span className="capitalize px-2 py-0.5 rounded bg-[#ecf5fe] text-[#765a25] font-bold text-[10px]">{s.role}</span>
              <button onClick={() => handleRevoke(s.userId)} className="text-[#BC4749] hover:text-red-700 p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <DirectoryContacts propertyId={propertyId} />
    </div>
  );
}

const DEPT_LABELS: Record<DirectoryContact['department'], string> = {
  housekeeping: 'Housekeeping', maintenance: 'Maintenance', amenities: 'Amenities', concierge: 'Concierge',
};

/** Phone numbers for the people Live Ops tasks actually get assigned to — deliberately separate from login access above; most of these people don't need or want a Cabadra account. */
function DirectoryContacts({ propertyId }: { propertyId: string }) {
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', phone: '', department: 'housekeeping' as DirectoryContact['department'] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => fetchStaffDirectory(propertyId).then(setContacts).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [propertyId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await addDirectoryContact(propertyId, { name: form.name.trim(), phone: form.phone.trim(), department: form.department });
      setForm({ name: '', phone: '', department: form.department });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contact.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDirectoryContact(id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove contact.');
    }
  };

  return (
    <div className="border-t border-[#E9ECEF] pt-4 space-y-3">
      <h3 className="text-sm font-bold text-[#141d23]">Department Contacts</h3>
      <p className="text-xs text-[#7f7668]">
        Who Live Ops tasks actually get assigned to — a name and phone number per department, not a login. Reception sees these directly on the Live Ops board.
      </p>

      <form onSubmit={handleAdd} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end bg-[#f6faff] p-3 rounded-lg border border-[#E9ECEF]">
        <div>
          <label className={labelCls}>Name</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Priya" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Department</label>
          <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value as DirectoryContact['department'] }))} className={`${inputCls} bg-white`}>
            {(Object.keys(DEPT_LABELS) as DirectoryContact['department'][]).map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
          </select>
        </div>
        <button type="submit" disabled={submitting} className="h-9 rounded-lg bg-[#765a25] text-white text-xs font-bold hover:bg-[#5c4210] disabled:opacity-60 flex items-center justify-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="space-y-1.5">
        {loading ? null : contacts.length === 0 ? (
          <p className="text-xs text-[#7f7668] text-center py-4">No contacts yet.</p>
        ) : (
          contacts.map(c => (
            <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#E9ECEF] text-xs">
              <span className="font-semibold text-[#141d23]">{c.name}</span>
              <span className="text-[#7f7668]">{c.phone} · {DEPT_LABELS[c.department]}</span>
              <button onClick={() => handleDelete(c.id)} className="text-[#BC4749] hover:text-red-700 p-1">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
