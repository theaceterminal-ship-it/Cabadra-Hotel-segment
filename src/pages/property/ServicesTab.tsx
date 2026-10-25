import React, { useEffect, useState } from 'react';
import { ArrowRight, Car, ConciergeBell, Pencil, Plus, X } from 'lucide-react';
import {
  addServiceCategory, addTransportRoute, deleteServiceCategory, deleteTransportRoute, fetchTransportRoutes,
  ServiceCategory, TransportRoute, updateServiceCategory,
} from '../../lib/staffApi';
import { formatCurrency } from '../../lib/currency';
import { DEPARTMENTS, departmentLabel, type Department, type ServiceChoice, type ServiceForm } from '../../lib/departments';
import { Chip, DeleteButton, EmptyState, ErrorNote, Field, Modal, Panel, SectionHeader, Switch, btnPrimary, btnSecondary, iconBtn, inputCls } from './ui';

type Preset = { name: string; description: string; department: Department; categoryType: ServiceCategory['categoryType']; form: ServiceForm };

const c = (label: string, price = 0): ServiceChoice => ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label, price });

/**
 * Ready-made services: picking one fills the name, team and a sensible
 * request form in one go. Prices are examples for the owner to change.
 */
const SERVICE_PRESETS: Preset[] = [
  { name: 'Housekeeping', description: 'Towels, linen, cleaning', department: 'housekeeping', categoryType: 'general',
    form: { choices: [c('Extra towels'), c('Extra pillows'), c('Fresh bed linen'), c('Toiletries refill'), c('Room cleaning'), c('Turn-down service')], multiple: true, note: true } },
  { name: 'Laundry', description: 'Washing, ironing, dry cleaning', department: 'laundry', categoryType: 'general',
    form: { choices: [c('Shirt / T-shirt', 40), c('Trousers / Jeans', 50), c('Dress / Kurta', 80), c('Jacket / Coat', 150), c('Ironing only (per piece)', 25)], multiple: true, quantity: true, askTime: true, note: true } },
  { name: 'Spa & Wellness', description: 'Massages and steam', department: 'spa', categoryType: 'general',
    form: { choices: [c('30-min foot massage', 800), c('60-min full-body massage', 2000), c('Steam / sauna', 500)], askTime: true, note: true } },
  { name: 'Airport / Railway Transfer', description: 'Pickup and drop', department: 'transport', categoryType: 'transportation',
    form: { askTime: true, note: true } },
  { name: 'Maintenance', description: 'Something not working', department: 'maintenance', categoryType: 'general',
    form: { choices: [c('AC / Heater'), c('Geyser / Hot water'), c('Lights / Electrical'), c('Plumbing / Leak'), c('Wi-Fi / TV'), c('Door lock')], note: true } },
  { name: 'Late Checkout', description: 'Subject to availability', department: 'front_desk', categoryType: 'general',
    form: { choices: [c('Until 1 pm'), c('Until 3 pm', 1000), c('Until 6 pm', 2000)], note: true } },
  { name: 'Wake-up Call', description: 'We will call your room', department: 'front_desk', categoryType: 'general',
    form: { askTime: true, note: false } },
  { name: 'Extra Bed', description: 'Mattress with bedding', department: 'housekeeping', categoryType: 'general',
    form: { choices: [c('Extra mattress', 800)], quantity: true, note: true } },
  { name: 'In-room Dining Extras', description: 'Cutlery, flask, ice', department: 'kitchen', categoryType: 'general',
    form: { choices: [c('Extra cutlery'), c('Hot water flask'), c('Ice bucket'), c('Plates & glasses')], multiple: true, note: true } },
  { name: 'Tour Desk', description: 'Local sightseeing', department: 'concierge', categoryType: 'general',
    form: { choices: [c('Local sightseeing'), c('Snow point trip'), c('Temple visit'), c('Adventure activity')], askTime: true, note: true } },
  { name: 'Doctor on Call', description: 'We will arrange a doctor', department: 'front_desk', categoryType: 'general',
    form: { note: true } },
  { name: 'Babysitting', description: 'Advance notice preferred', department: 'concierge', categoryType: 'general',
    form: { askTime: true, note: true } },
];
const SERVICE_CUSTOM = '__custom__';

type ChoiceDraft = { id: string; label: string; price: string };
const emptyForm = {
  name: '', description: '', department: 'front_desk' as Department, categoryType: 'general' as ServiceCategory['categoryType'],
  choices: [] as ChoiceDraft[], multiple: false, quantity: false, askTime: false, note: true,
};
type FormState = typeof emptyForm;

const fromService = (s: Pick<ServiceCategory, 'name' | 'description' | 'department' | 'categoryType' | 'form'>): FormState => ({
  name: s.name, description: s.description, department: s.department, categoryType: s.categoryType,
  choices: (s.form.choices ?? []).map(ch => ({ id: ch.id, label: ch.label, price: ch.price ? String(ch.price) : '' })),
  multiple: !!s.form.multiple, quantity: !!s.form.quantity, askTime: !!s.form.askTime, note: s.form.note !== false,
});

/** The form as saved: blank choices dropped, prices rounded, route picker forced to the transport team. */
const toForm = (f: FormState): ServiceForm => {
  const choices = f.categoryType === 'transportation' ? [] : f.choices
    .map(ch => ({ id: ch.id, label: ch.label.trim(), price: Math.max(0, Math.round((parseFloat(ch.price) || 0) * 100) / 100) }))
    .filter(ch => ch.label);
  return {
    ...(choices.length ? { choices } : {}),
    multiple: choices.length > 1 && f.multiple,
    quantity: choices.length > 0 && f.quantity,
    askTime: f.askTime,
    note: f.note,
  };
};

function formSummary(s: ServiceCategory, currency: string): string {
  if (s.categoryType === 'transportation') return 'Guests pick a route';
  const choices = s.form.choices ?? [];
  const priced = choices.filter(ch => ch.price > 0);
  const parts = [
    choices.length ? `${choices.length} option${choices.length === 1 ? '' : 's'}` : 'Note only',
    priced.length ? `from ${formatCurrency(Math.min(...priced.map(ch => ch.price)), currency)}` : '',
    s.form.askTime ? 'asks for a time' : '',
  ];
  return parts.filter(Boolean).join(' · ');
}

/**
 * The guest app's services. Each one routes to a team and has its own
 * request form: tap-to-choose options (priced ones are charged to the room
 * when staff mark the request done), and optionally a quantity, a time and
 * a note. Transport services can use the route picker instead.
 */
export function ServicesTab({ propertyId, currency, services, onChanged }: {
  propertyId: string; currency: string; services: ServiceCategory[]; onChanged: () => void;
}) {
  const [editing, setEditing] = useState<ServiceCategory | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
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
    setForm(fromService(s));
    setCustomMode(!SERVICE_PRESETS.some(p => p.name === s.name));
    setFormError(null);
    setEditing(s);
  };

  const handlePresetChange = (name: string) => {
    if (name === SERVICE_CUSTOM) {
      setCustomMode(true);
      setForm({ ...emptyForm });
      return;
    }
    const preset = SERVICE_PRESETS.find(p => p.name === name);
    if (preset) setForm(fromService(preset));
  };

  const setTeam = (department: Department) =>
    setForm(f => ({ ...f, department, categoryType: department === 'transport' ? f.categoryType : 'general' }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        department: form.department,
        categoryType: form.department === 'transport' ? form.categoryType : 'general' as const,
        form: toForm(form),
      };
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

  const usesChoices = form.categoryType !== 'transportation';
  const choiceCount = form.choices.filter(ch => ch.label.trim()).length;

  return (
    <div className="space-y-8">
      <div>
        <SectionHeader
          title="Services"
          description="What guests can request from the guest app. Each request goes straight to the team you choose; priced options are charged to the room when staff mark them done."
          actions={services.length > 0 && <button onClick={openNew} className={btnPrimary}><Plus className="size-4" /> Add service</button>}
        />

        {listError && <div className="mb-4"><ErrorNote>{listError}</ErrorNote></div>}

        {services.length === 0 ? (
          <EmptyState
            icon={ConciergeBell}
            title="No services yet"
            body="Add housekeeping, laundry, spa, transfers or anything else you offer. Ready-made ones come with their options filled in."
            action={<button onClick={openNew} className={btnPrimary}><Plus className="size-4" /> Add service</button>}
          />
        ) : (
          <div className="rounded-[20px] bg-surface-container-lowest border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {services.map(s => (
              <div key={s.id} onClick={() => openEdit(s)} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-on-surface truncate">{s.name}</p>
                  <p className="text-xs text-on-surface-variant truncate mt-0.5">{formSummary(s, currency)}</p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
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
                <button type="button" onClick={() => { setCustomMode(false); setForm(emptyForm); }} className="mt-1.5 pl-1 text-xs text-on-surface-variant underline underline-offset-2">
                  Pick a ready-made one instead
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Short description">
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Same-day service" className={inputCls} />
            </Field>
            <Field label="Requests go to">
              <select value={form.department} onChange={e => setTeam(e.target.value as Department)} className={inputCls}>
                {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </Field>
          </div>

          {form.department === 'transport' && (
            <div>
              <p className="text-[13px] text-on-surface pl-1 mb-1.5">Guests choose</p>
              <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-container p-1 text-sm">
                {([['transportation', 'A route'], ['general', 'From options']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, categoryType: value }))}
                    className={`h-9 rounded-full font-medium ${form.categoryType === value ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {form.categoryType === 'transportation' && (
                <p className="text-xs text-on-surface-variant mt-2 pl-1">Routes and their prices are set under Transfer routes, below the service list.</p>
              )}
            </div>
          )}

          {usesChoices && (
            <div>
              <p className="text-[13px] text-on-surface pl-1">Options guests tap</p>
              <p className="text-xs text-on-surface-variant pl-1 mt-0.5 mb-2">Leave the price empty for free ones. With no options, guests just write a note.</p>
              {form.choices.length > 0 && (
                <div className="space-y-2 mb-2">
                  {form.choices.map((ch, i) => (
                    <div key={ch.id} className="flex gap-2">
                      <input
                        value={ch.label}
                        onChange={e => setForm(f => ({ ...f, choices: f.choices.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))}
                        placeholder="Extra towels"
                        className={inputCls}
                      />
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={ch.price}
                        onChange={e => setForm(f => ({ ...f, choices: f.choices.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) }))}
                        placeholder="Free"
                        aria-label={`${ch.label || 'Option'} price`}
                        className={`${inputCls} !w-28 shrink-0`}
                      />
                      <button type="button" onClick={() => setForm(f => ({ ...f, choices: f.choices.filter((_, j) => j !== i) }))} className={`${iconBtn} shrink-0 mt-1`} aria-label="Remove option">
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, choices: [...f.choices, { id: `opt-${Date.now().toString(36)}${f.choices.length}`, label: '', price: '' }] }))}
                className="h-9 px-3 rounded-full text-sm text-on-surface hover:bg-surface-container inline-flex items-center gap-1.5"
              >
                <Plus className="size-4" /> Add an option
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-outline-variant divide-y divide-outline-variant">
            {usesChoices && choiceCount > 1 && (
              <ToggleRow label="Guests can pick more than one" checked={form.multiple} onChange={v => setForm(f => ({ ...f, multiple: v }))} />
            )}
            {usesChoices && choiceCount > 0 && (
              <ToggleRow label="Ask how many" hint="For things counted in pieces, like laundry." checked={form.quantity} onChange={v => setForm(f => ({ ...f, quantity: v }))} />
            )}
            <ToggleRow label="Ask for a time" hint="E.g. spa slot, pickup time, wake-up call." checked={form.askTime} onChange={v => setForm(f => ({ ...f, askTime: v }))} />
            <ToggleRow label="Let guests add a note" checked={form.note} onChange={v => setForm(f => ({ ...f, note: v }))} />
          </div>
          <ErrorNote>{formError}</ErrorNote>
        </Modal>
      )}
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-on-surface">{label}</p>
        {hint && <p className="text-xs text-on-surface-variant mt-0.5">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
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
