import React, { useState } from 'react';
import { Pencil, Plus, Sparkles } from 'lucide-react';
import { addExperience, deleteExperience, Experience, updateExperience } from '../../lib/staffApi';
import { formatCurrency } from '../../lib/currency';
import { PresetSelect } from '../../components/PresetSelect';
import { DeleteButton, EmptyState, ErrorNote, Field, Modal, PhotoField, SectionHeader, btnPrimary, btnSecondary, iconBtn, inputCls, textareaCls } from './ui';

const EXPERIENCE_PRESETS = [
  'Bonfire & Dinner', 'Guided Trek', 'Paragliding', 'Village Walk', 'Cooking Class',
  'Spa Package', 'Sightseeing Tour', 'Airport Transfer', 'Photography Session', 'Yoga Session',
];

const UNIT_LABEL_PRESETS = ['per person', 'per couple', 'per family', 'per group', 'per session', 'per hour'];

const emptyForm = { name: '', description: '', price: '', unitLabel: 'per person', image: '' };

/** The guest app's "Exclusive Experiences": owner-managed, nothing shows there until one is added here. */
export function ExperiencesTab({ propertyId, currency, experiences, onChanged }: {
  propertyId: string; currency: string; experiences: Experience[]; onChanged: () => void;
}) {
  const [editing, setEditing] = useState<Experience | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const openNew = () => {
    setForm(emptyForm);
    setFormError(null);
    setEditing('new');
  };
  const openEdit = (exp: Experience) => {
    setForm({ name: exp.name, description: exp.description, price: String(exp.price), unitLabel: exp.unitLabel, image: exp.image });
    setFormError(null);
    setEditing(exp);
  };

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
      if (editing && editing !== 'new') await updateExperience(propertyId, editing.id, payload);
      else await addExperience(propertyId, payload);
      setEditing(null);
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save experience.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setListError(null);
    try {
      await deleteExperience(propertyId, id);
      onChanged();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to delete experience.');
    }
  };

  return (
    <div>
      <SectionHeader
        title="Experiences"
        description="Treks, bonfires, transfers and more. Guests see these in the guest app and can book them."
        actions={experiences.length > 0 && <button onClick={openNew} className={btnPrimary}><Plus className="size-4" /> Add experience</button>}
      />

      {listError && <div className="mb-4"><ErrorNote>{listError}</ErrorNote></div>}

      {experiences.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No experiences yet"
          body="Add what you offer, like a bonfire dinner or a guided trek. Guests can book it from their phone."
          action={<button onClick={openNew} className={btnPrimary}><Plus className="size-4" /> Add experience</button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {experiences.map(exp => (
            <div
              key={exp.id}
              onClick={() => openEdit(exp)}
              className="group cursor-pointer rounded-[20px] bg-surface-container-lowest border border-outline-variant overflow-hidden hover:border-on-surface-variant transition-colors"
            >
              <div className="h-36 bg-surface-container flex items-center justify-center text-on-surface-variant">
                {exp.image ? <img src={exp.image} alt="" className="size-full object-cover" /> : <Sparkles className="size-6 opacity-50" />}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-medium text-on-surface truncate">{exp.name}</p>
                    <p className="text-sm text-on-surface-variant mt-0.5">
                      <span className="font-medium text-on-surface">{formatCurrency(exp.price, currency)}</span> {exp.unitLabel}
                    </p>
                  </div>
                  <div className="flex -mr-1.5 -mt-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(exp)} className={iconBtn} aria-label={`Edit ${exp.name}`}><Pencil className="size-4" /></button>
                    <DeleteButton onDelete={() => handleDelete(exp.id)} label="Delete experience" />
                  </div>
                </div>
                {exp.description && <p className="text-xs text-on-surface-variant mt-2 line-clamp-2">{exp.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing === 'new' ? 'Add an experience' : editing.name}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
          footer={
            <>
              <button type="button" onClick={() => setEditing(null)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={submitting || !form.name.trim() || !form.price.trim()} className={btnPrimary}>
                {submitting ? 'Saving…' : editing === 'new' ? 'Add experience' : 'Save'}
              </button>
            </>
          }
        >
          <Field label="Name">
            <PresetSelect presets={EXPERIENCE_PRESETS} value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} className={inputCls} placeholder="Bonfire & Dinner" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Price (${currency})`}><input required type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="1200" className={inputCls} /></Field>
            <Field label="Charged">
              <PresetSelect presets={UNIT_LABEL_PRESETS} value={form.unitLabel} onChange={v => setForm(f => ({ ...f, unitLabel: v }))} className={inputCls} placeholder="per person" />
            </Field>
          </div>
          <Field label="Description (optional)">
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Evening bonfire with a set dinner under the stars" className={textareaCls} />
          </Field>
          <PhotoField label="Photo (optional)" value={form.image} onChange={url => setForm(f => ({ ...f, image: url }))} />
          <ErrorNote>{formError}</ErrorNote>
        </Modal>
      )}
    </div>
  );
}
