import React, { useEffect, useState } from 'react';
import { ArrowRight, Car, ConciergeBell, Pencil, Plus } from 'lucide-react';
import {
  addServiceCategory, addTransportRoute, deleteServiceCategory, deleteTransportRoute, fetchTransportRoutes,
  ServiceCategory, TransportRoute, updateServiceCategory,
} from '../../lib/staffApi';
import { formatCurrency } from '../../lib/currency';
import { Chip, DeleteButton, EmptyState, ErrorNote, Field, Modal, Panel, SectionHeader, btnPrimary, btnSecondary, iconBtn, inputCls } from './ui';

const DEPARTMENTS: { value: ServiceCategory['department']; label: string }[] = [
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'amenities', label: 'Amenities' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'concierge', label: 'Concierge' },
];
const departmentLabel = (d: ServiceCategory['department']) => DEPARTMENTS.find(x => x.value === d)?.label ?? d;

/** Picking one fills name, description and department (and, for Airport Transfer, the route picker) in one go. "Other" opens a blank form. */
const SERVICE_PRESETS: { name: string; description: string; department: ServiceCategory['department']; categoryType: ServiceCategory['categoryType'] }[] = [
  { name: 'Housekeeping Request', description: 'Extra towels, linens, amenities', department: 'housekeeping', categoryType: 'general' },
  { name: 'Spa & Wellness', description: 'Massages & sauna', department: 'amenities', categoryType: 'general' },
  { name: 'Airport Transfer', description: 'Pickup & drop', department: 'concierge', categoryType: 'transportation' },
  { name: 'Laundry & Dry Cleaning', description: 'Same-day service', department: 'housekeeping', categoryType: 'general' },
  { name: 'In-Room Dining Extras', description: 'Beyond the room-service menu', department: 'concierge', categoryType: 'general' },
  { name: 'Late Checkout', description: 'Subject to availability', department: 'concierge', categoryType: 'general' },
  { name: 'Business Center', description: 'Printing, meeting room, Wi-Fi support', department: 'amenities', categoryType: 'general' },
  { name: 'Pool & Gym Access', description: 'Hours & towel service', department: 'amenities', categoryType: 'general' },
  { name: 'Car Rental', description: 'Self-drive or with driver', department: 'concierge', categoryType: 'general' },
  { name: 'Tour Desk', description: 'Local sightseeing & bookings', department: 'concierge', categoryType: 'general' },
  { name: 'Babysitting / Childcare', description: 'On request, advance notice preferred', department: 'concierge', categoryType: 'general' },
  { name: 'Maintenance Issue', description: 'AC, plumbing, electrical', department: 'maintenance', categoryType: 'general' },
];
const SERVICE_CUSTOM = '__custom__';

const emptyForm = { name: '', description: '', department: 'concierge' as ServiceCategory['department'], categoryType: 'general' as ServiceCategory['categoryType'] };

/** The guest app's "At your service" list. Department decides which Live Ops queue a guest's request lands in. */
export function ServicesTab({ propertyId, currency, services, onChanged }: {
  propertyId: string; currency: string; services: ServiceCategory[]; onChanged: () => void;
}) {
  const [editing, setEditing] = useState<ServiceCategory | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [customMode, setCustomMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const openNew = () => {
    setForm(emptyForm);
    setCustomMode(false);
    setFormError(null);
    setEditing('new');
  };
  const openEdit = (s: ServiceCategory) => {
    setForm({ name: s.name, description: s.description, department: s.department, categoryType: s.categoryType });
    setCustomMode(!SERVICE_PRESETS.some(p => p.name === s.name));
    setFormError(null);
    setEditing(s);
  };

  const handlePresetChange = (name: string) => {
    if (name === SERVICE_CUSTOM) {
      setCustomMode(true);
      setForm(f => ({ ...f, name: '' }));
      return;
    }
    const preset = SERVICE_PRESETS.find(p => p.name === name);
    if (preset) setForm({ name: preset.name, description: preset.description, department: preset.department, categoryType: preset.categoryType });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = { name: form.name.trim(), description: form.description.trim(), department: form.department, categoryType: form.categoryType };
      if (editing && editing !== 'new') await updateServiceCategory(propertyId, editing.id, payload);
      else await addServiceCategory(propertyId, payload);
      setEditing(null);
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save service.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setListError(null);
    try {
      await deleteServiceCategory(propertyId, id);
      onChanged();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to delete service.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <SectionHeader
          title="Services"
          description="What guests can request from the guest app. Each request goes straight to the team you choose."
          actions={services.length > 0 && <button onClick={openNew} className={btnPrimary}><Plus className="size-4" /> Add service</button>}
        />

        {listError && <div className="mb-4"><ErrorNote>{listError}</ErrorNote></div>}

        {services.length === 0 ? (
          <EmptyState
            icon={ConciergeBell}
            title="No services yet"
            body="Add housekeeping, laundry, spa, airport transfers or anything else you offer."
            action={<button onClick={openNew} className={btnPrimary}><Plus className="size-4" /> Add service</button>}
          />
        ) : (
          <div className="rounded-[20px] bg-surface-container-lowest border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {services.map(s => (
              <div key={s.id} onClick={() => openEdit(s)} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-on-surface truncate">{s.name}</p>
                  {s.description && <p className="text-xs text-on-surface-variant truncate mt-0.5">{s.description}</p>}
                </div>
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                  {s.categoryType === 'transportation' && <Chip>Route picker</Chip>}
                  <Chip>{departmentLabel(s.department)}</Chip>
                </div>
                <div className="flex shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(s)} className={iconBtn} aria-label={`Edit ${s.name}`}><Pencil className="size-4" /></button>
                  <DeleteButton onDelete={() => handleDelete(s.id)} label="Delete service" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {services.some(s => s.categoryType === 'transportation') && <TransportRoutes propertyId={propertyId} currency={currency} />}

      {editing && (
        <Modal
          title={editing === 'new' ? 'Add a service' : editing.name}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
          footer={
            <>
              <button type="button" onClick={() => setEditing(null)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={submitting || !form.name.trim()} className={btnPrimary}>
                {submitting ? 'Saving…' : editing === 'new' ? 'Add service' : 'Save'}
              </button>
            </>
          }
        >
          <Field label="Service">
            {customMode ? (
              <>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Bonfire setup" className={inputCls} autoFocus />
                <button type="button" onClick={() => { setCustomMode(false); setForm(f => ({ ...f, name: '' })); }} className="mt-1.5 pl-1 text-xs text-on-surface-variant underline underline-offset-2">
                  Pick from the list instead
                </button>
              </>
            ) : (
              <select value={SERVICE_PRESETS.some(p => p.name === form.name) ? form.name : ''} onChange={e => handlePresetChange(e.target.value)} className={inputCls}>
                <option value="" disabled>Choose a service</option>
                {SERVICE_PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                <option value={SERVICE_CUSTOM}>Something else…</option>
              </select>
            )}
          </Field>
          <Field label="Short description (optional)">
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Same-day service" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Requests go to">
              <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value as ServiceCategory['department'] }))} className={inputCls}>
                {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </Field>
            <Field label="Guest fills in">
              <select value={form.categoryType} onChange={e => setForm(f => ({ ...f, categoryType: e.target.value as ServiceCategory['categoryType'] }))} className={inputCls}>
                <option value="general">A short note</option>
                <option value="transportation">A route to pick</option>
              </select>
            </Field>
          </div>
          <ErrorNote>{formError}</ErrorNote>
        </Modal>
      )}
    </div>
  );
}

/** The route list behind a "route picker" service. One shared list per property. */
function TransportRoutes({ propertyId, currency }: { propertyId: string; currency: string }) {
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
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
      setAdding(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add route.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deleteTransportRoute(propertyId, id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete route.');
    }
  };

  return (
    <Panel>
      <SectionHeader
        title="Transfer routes"
        description="The routes guests can pick from for your transfer service."
        actions={<button onClick={() => { setAdding(true); setError(null); }} className={btnSecondary}><Plus className="size-4" /> Add route</button>}
      />
      {!adding && error && <ErrorNote>{error}</ErrorNote>}
      {loading ? null : routes.length === 0 ? (
        <p className="text-sm text-on-surface-variant flex items-center gap-2"><Car className="size-4" /> No routes yet.</p>
      ) : (
        <div className="divide-y divide-outline-variant -my-1">
          {routes.map(r => (
            <div key={r.id} className="flex items-center gap-3 py-2.5">
              <p className="flex-1 min-w-0 text-sm text-on-surface flex items-center gap-1.5 truncate">
                {r.from} <ArrowRight className="size-3.5 text-on-surface-variant shrink-0" /> {r.to}
              </p>
              <span className="text-sm text-on-surface-variant shrink-0">
                <span className="font-medium text-on-surface">{formatCurrency(r.price, currency)}</span> {r.priceUnit}
              </span>
              <DeleteButton onDelete={() => handleDelete(r.id)} label="Delete route" />
            </div>
          ))}
        </div>
      )}

      {adding && (
        <Modal
          title="Add a route"
          onClose={() => setAdding(false)}
          onSubmit={handleAdd}
          footer={
            <>
              <button type="button" onClick={() => setAdding(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={submitting || !form.from.trim() || !form.to.trim()} className={btnPrimary}>{submitting ? 'Adding…' : 'Add route'}</button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><input required value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))} placeholder="Hotel" className={inputCls} autoFocus /></Field>
            <Field label="To"><input required value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} placeholder="Shimla Airport" className={inputCls} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Price (${currency})`}><input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="1800" className={inputCls} /></Field>
            <Field label="Charged"><input value={form.priceUnit} onChange={e => setForm(f => ({ ...f, priceUnit: e.target.value }))} placeholder="per trip" className={inputCls} /></Field>
          </div>
          <ErrorNote>{error}</ErrorNote>
        </Modal>
      )}
    </Panel>
  );
}
