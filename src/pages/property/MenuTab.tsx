import React, { useRef, useState } from 'react';
import { FileUp, Pencil, Plus, Upload, Utensils, UtensilsCrossed, X } from 'lucide-react';
import { MenuItem, MenuOption } from '../../types';
import { addMenuItem, bulkAddMenuItems, deleteMenuItem, updateMenuItem } from '../../lib/staffApi';
import { formatCurrency } from '../../lib/currency';
import { attachZipPhotos, ImportPreview, MENU_TEMPLATE_CSV, readMenuFile } from '../../lib/menuImport';
import {
  Chip, DeleteButton, SearchFilterBar, EmptyState, ErrorNote, Field, Modal, PhotoField, SectionHeader, Switch,
  btnPrimary, btnSecondary, downloadCsv, iconBtn, inputCls, textareaCls,
} from './ui';

/** The Indian food-label mark: a square with a dot, green for veg, red for non-veg. */
function VegMark({ veg }: { veg: boolean }) {
  return (
    <span
      title={veg ? 'Veg' : 'Non-veg'}
      className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border ${veg ? 'border-[#2f8a3a]' : 'border-[#b3261e]'}`}
    >
      <span className={`size-1.5 rounded-full ${veg ? 'bg-[#2f8a3a]' : 'bg-[#b3261e]'}`} />
    </span>
  );
}

/** Options as edited in the form: price kept as typed until saved. */
type OptionDraft = { id: string; name: string; price: string };

const emptyForm = { name: '', category: '', price: '', description: '', image: '', isVeg: true, prepTime: '', variations: [] as OptionDraft[], addons: [] as OptionDraft[] };

const toDrafts = (options: MenuOption[] | undefined): OptionDraft[] => (options ?? []).map(o => ({ id: o.id, name: o.name, price: String(o.price) }));
/** Drops blank rows and rows without a positive price. */
const fromDrafts = (drafts: OptionDraft[]): MenuOption[] =>
  drafts
    .map(d => ({ id: d.id, name: d.name.trim(), price: Math.round((parseFloat(d.price) || 0) * 100) / 100 }))
    .filter(o => o.name && o.price > 0);
/** The price shown for a dish: its cheapest size when it has sizes. */
const displayPrice = (m: MenuItem) => (m.variations?.length ? Math.min(...m.variations.map(v => v.price)) : m.price);

/** Items saved without a category are listed under this heading rather than hidden. */
const categoryOf = (m: MenuItem) => m.category?.trim() || 'Other';

export function MenuTab({ propertyId, currency, menu, onChanged }: { propertyId: string; currency: string; menu: MenuItem[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('');
  const [diet, setDiet] = useState<'' | 'veg' | 'nonveg'>('');
  const [query, setQuery] = useState('');
  const [showImport, setShowImport] = useState(false);

  const categories = [...new Set(menu.map(categoryOf))].sort();
  const q = query.trim().toLowerCase();
  const visibleItems = menu.filter(m =>
    (!q || m.name.toLowerCase().includes(q) || (m.description ?? '').toLowerCase().includes(q)) &&
    (!category || categoryOf(m) === category) &&
    (!diet || (diet === 'veg') === m.isVeg)
  );
  const visibleCategories = categories.filter(c => visibleItems.some(m => categoryOf(m) === c));
  const filtering = q !== '' || category !== '' || diet !== '';

  const openNew = () => {
    setForm({ ...emptyForm, category });
    setFormError(null);
    setEditing('new');
  };
  const openEdit = (m: MenuItem) => {
    setForm({
      name: m.name, category: m.category, price: String(m.price), description: m.description, image: m.image, isVeg: m.isVeg,
      prepTime: m.prepTime ?? '', variations: toDrafts(m.variations), addons: toDrafts(m.addons),
    });
    setFormError(null);
    setEditing(m);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const variations = fromDrafts(form.variations);
    const addons = fromDrafts(form.addons);
    if (!form.name.trim() || !form.category.trim() || (!variations.length && !(parseFloat(form.price) > 0))) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(), category: form.category.trim(),
        // With sizes, the dish's own price is its cheapest size (shown as "from ₹…"); the server charges the size picked.
        price: variations.length ? Math.min(...variations.map(v => v.price)) : parseFloat(form.price),
        description: form.description.trim(), image: form.image.trim(), isVeg: form.isVeg,
        tags: editing && editing !== 'new' ? editing.tags : [],
        prepTime: form.prepTime.trim() || undefined,
        variations,
        addons,
      };
      if (editing && editing !== 'new') await updateMenuItem(propertyId, editing.id, payload);
      else await addMenuItem(propertyId, payload);
      setEditing(null);
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save menu item.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    setListError(null);
    try {
      await deleteMenuItem(propertyId, itemId);
      onChanged();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to delete item.');
    }
  };

  return (
    <div>
      <SectionHeader
        title="Menu"
        description={menu.length ? `${menu.length} item${menu.length === 1 ? '' : 's'} guests can order to their room.` : 'What guests can order to their room from the guest app.'}
        actions={menu.length > 0 && (
          <>
            <button onClick={() => setShowImport(true)} className={btnSecondary}>
              <Upload className="size-4" /> Import
            </button>
            <button onClick={openNew} className={btnPrimary}><Plus className="size-4" /> Add item</button>
          </>
        )}
      />

      {listError && <div className="mb-4"><ErrorNote>{listError}</ErrorNote></div>}

      {menu.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="No menu items yet"
          body="Add dishes one by one, or import your whole menu from a spreadsheet."
          action={
            <>
              <button onClick={() => setShowImport(true)} className={btnSecondary}><Upload className="size-4" /> Import menu</button>
              <button onClick={openNew} className={btnPrimary}><Plus className="size-4" /> Add item</button>
            </>
          }
        />
      ) : (
        <>
          <SearchFilterBar
            query={query}
            onQuery={setQuery}
            placeholder="Search dishes"
            groups={[
              { id: 'category', label: 'Category', value: category, onChange: setCategory, options: categories.map(c => ({ value: c, label: c })) },
              { id: 'diet', label: 'Diet', value: diet, onChange: v => setDiet(v as '' | 'veg' | 'nonveg'), options: [{ value: 'veg', label: 'Veg' }, { value: 'nonveg', label: 'Non-veg' }] },
            ]}
          />
          {filtering && visibleItems.length === 0 && (
            <p className="text-sm text-on-surface-variant text-center py-12">No dishes match. Try another search or clear the filters.</p>
          )}

          <div className="space-y-6">
            {visibleCategories.map(cat => (
              <section key={cat}>
                <p className="text-sm font-medium text-on-surface-variant mb-2">{cat}</p>
                <div className="rounded-[20px] bg-surface-container-lowest border border-outline-variant divide-y divide-outline-variant overflow-hidden">
                  {visibleItems.filter(m => categoryOf(m) === cat).map(m => (
                    <div key={m.id} onClick={() => openEdit(m)} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-container-low transition-colors">
                      <div className="size-12 shrink-0 rounded-xl overflow-hidden bg-surface-container flex items-center justify-center text-on-surface-variant">
                        {m.image ? <img src={m.image} alt="" className="size-full object-cover" /> : <Utensils className="size-5 opacity-50" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <VegMark veg={m.isVeg} />
                          <p className="text-sm font-medium text-on-surface truncate">{m.name}</p>
                        </div>
                        <p className="text-xs text-on-surface-variant truncate mt-0.5">
                          {[m.description, m.prepTime].filter(Boolean).join(' · ') || 'No description'}
                        </p>
                      </div>
                      <div className="hidden sm:flex gap-1.5 shrink-0">
                        {!!m.variations?.length && <Chip>{m.variations.length} sizes</Chip>}
                        {!!m.addons?.length && <Chip>{m.addons.length} add-ons</Chip>}
                      </div>
                      <span className="text-sm font-medium text-on-surface shrink-0">
                        {m.variations?.length ? <span className="text-xs font-normal text-on-surface-variant">from </span> : null}
                        {formatCurrency(displayPrice(m), currency)}
                      </span>
                      <div className="flex shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(m)} className={iconBtn} aria-label={`Edit ${m.name}`}><Pencil className="size-4" /></button>
                        <DeleteButton onDelete={() => handleDelete(m.id)} label="Delete item" />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {editing && (
        <Modal
          title={editing === 'new' ? 'Add a menu item' : editing.name}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
          footer={
            <>
              <button type="button" onClick={() => setEditing(null)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={submitting || !form.name.trim() || !form.category.trim() || (!fromDrafts(form.variations).length && !(parseFloat(form.price) > 0))} className={btnPrimary}>
                {submitting ? 'Saving…' : editing === 'new' ? 'Add item' : 'Save'}
              </button>
            </>
          }
        >
          <Field label="Name"><input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Paneer Tikka" className={inputCls} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <input required list="menu-categories" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Starters" className={inputCls} />
              <datalist id="menu-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </Field>
            {fromDrafts(form.variations).length > 0 ? (
              <Field label={`Price (${currency})`} hint="Set by the sizes below.">
                <input disabled value={`from ${Math.min(...fromDrafts(form.variations).map(v => v.price))}`} className={`${inputCls} opacity-60`} />
              </Field>
            ) : (
              <Field label={`Price (${currency})`}><input required type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="320" className={inputCls} /></Field>
            )}
          </div>
          <Field label="Description (optional)">
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Char-grilled marinated cottage cheese" className={textareaCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3 items-end">
            <Field label="Ready in (optional)"><input value={form.prepTime} onChange={e => setForm(f => ({ ...f, prepTime: e.target.value }))} placeholder="15-20 mins" className={inputCls} /></Field>
            <div className="h-11 flex items-center justify-between gap-3 px-4 rounded-xl border border-outline-variant">
              <span className="flex items-center gap-2 text-sm text-on-surface"><VegMark veg={form.isVeg} /> {form.isVeg ? 'Veg' : 'Non-veg'}</span>
              <Switch checked={form.isVeg} onChange={v => setForm(f => ({ ...f, isVeg: v }))} label="Vegetarian" />
            </div>
          </div>
          <OptionListEditor
            title="Sizes"
            hint="Guests pick one, and its price replaces the dish's price. E.g. Half / Full, or 6 pcs / 10 pcs."
            addLabel="Add a size"
            prefix="var"
            currency={currency}
            value={form.variations}
            onChange={variations => setForm(f => ({ ...f, variations }))}
          />
          <OptionListEditor
            title="Add-ons"
            hint="Guests can pick any of these; each adds its price. E.g. Extra cheese, Butter."
            addLabel="Add an add-on"
            prefix="add"
            currency={currency}
            value={form.addons}
            onChange={addons => setForm(f => ({ ...f, addons }))}
          />
          <PhotoField label="Photo (optional)" value={form.image} onChange={url => setForm(f => ({ ...f, image: url }))} />
          <ErrorNote>{formError}</ErrorNote>
        </Modal>
      )}

      {showImport && (
        <MenuImportModal
          onClose={() => setShowImport(false)}
          onImport={async items => {
            await bulkAddMenuItems(propertyId, items);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

/** Editable rows of name + price, used for both sizes and add-ons. */
function OptionListEditor({ title, hint, addLabel, prefix, currency, value, onChange }: {
  title: string; hint: string; addLabel: string; prefix: 'var' | 'add'; currency: string;
  value: OptionDraft[]; onChange: (v: OptionDraft[]) => void;
}) {
  const update = (i: number, patch: Partial<OptionDraft>) => onChange(value.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const add = () => onChange([...value, { id: `${prefix}${Date.now().toString(36)}${value.length}`, name: '', price: '' }]);
  return (
    <div>
      <p className="text-[13px] text-on-surface pl-1">{title} <span className="text-on-surface-variant">(optional)</span></p>
      <p className="text-xs text-on-surface-variant pl-1 mt-0.5 mb-2">{hint}</p>
      {value.length > 0 && (
        <div className="space-y-2 mb-2">
          {value.map((o, i) => (
            <div key={o.id} className="flex gap-2">
              <input value={o.name} onChange={e => update(i, { name: e.target.value })} placeholder="Name" className={inputCls} />
              <input
                type="number"
                min="0"
                step="0.01"
                value={o.price}
                onChange={e => update(i, { price: e.target.value })}
                placeholder={currency}
                aria-label={`${o.name || title} price`}
                className={`${inputCls} !w-28 shrink-0`}
              />
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className={`${iconBtn} shrink-0 mt-1`} aria-label="Remove">
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={add} className="h-9 px-3 rounded-full text-sm text-on-surface hover:bg-surface-container inline-flex items-center gap-1.5">
        <Plus className="size-4" /> {addLabel}
      </button>
    </div>
  );
}

/**
 * Import from Cabadra's template, a Churmuri menu export (CSV or JSON), or a
 * zip of menu.csv plus photos. Shows what was read before anything is saved.
 */
function MenuImportModal({ onClose, onImport }: { onClose: () => void; onImport: (items: Omit<MenuItem, 'id'>[]) => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'idle' | 'reading' | 'uploading' | 'saving' | 'done'>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    setError(null);
    setStage('reading');
    try {
      const result = await readMenuFile(file);
      if (result.items.length === 0) throw new Error('No dishes found in that file. It needs at least Name and Price columns.');
      setPreview(result);
      setStage('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t read that file.');
      setStage('idle');
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    setError(null);
    try {
      setStage('uploading');
      const items = await attachZipPhotos(preview, (done, total) => setProgress({ done, total }));
      setStage('saving');
      await onImport(items);
      setSavedCount(items.length);
      setStage('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
      setStage('idle');
    }
  };

  const busy = stage === 'reading' || stage === 'uploading' || stage === 'saving';
  const withOptions = preview?.items.filter(i => i.variations?.length || i.addons?.length).length ?? 0;
  const categories = preview ? new Set(preview.items.map(i => i.category)).size : 0;

  return (
    <Modal
      title="Import menu"
      description="From a spreadsheet (CSV), a Churmuri menu export, or a .zip with menu.csv and photos."
      onClose={onClose}
      footer={
        stage === 'done' ? (
          <button type="button" onClick={onClose} className={btnPrimary}>Done</button>
        ) : (
          <>
            <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
            {preview ? (
              <button type="button" onClick={handleImport} disabled={busy} className={btnPrimary}>
                {stage === 'uploading'
                  ? `Uploading photos${progress ? ` ${progress.done}/${progress.total}` : '…'}`
                  : stage === 'saving' ? 'Saving…' : `Import ${preview.items.length} dishes`}
              </button>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={btnPrimary}>
                {stage === 'reading' ? 'Reading…' : 'Choose file'}
              </button>
            )}
          </>
        )
      }
    >
      <input ref={fileRef} type="file" accept=".csv,.json,.zip,text/csv,application/zip" onChange={handleFile} className="hidden" />

      {stage === 'done' ? (
        <p className="rounded-2xl bg-[#e6f2df] text-[#2f6b1a] text-sm px-4 py-3">Added {savedCount} dishes to the menu.</p>
      ) : preview ? (
        <>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="w-full flex items-center gap-3 rounded-2xl border border-outline-variant px-4 py-3 text-left hover:bg-surface-container-low">
            <FileUp className="size-5 text-on-surface-variant shrink-0" />
            <span className="flex-1 min-w-0 text-sm text-on-surface truncate">{fileName}</span>
            <span className="text-xs text-on-surface-variant underline underline-offset-2">Change</span>
          </button>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-surface-container-low p-3"><p className="text-xl font-semibold">{preview.items.length}</p><p className="text-xs text-on-surface-variant">dishes</p></div>
            <div className="rounded-2xl bg-surface-container-low p-3"><p className="text-xl font-semibold">{categories}</p><p className="text-xs text-on-surface-variant">categories</p></div>
            <div className="rounded-2xl bg-surface-container-low p-3"><p className="text-xl font-semibold">{withOptions}</p><p className="text-xs text-on-surface-variant">with sizes/add-ons</p></div>
          </div>
          {preview.images.size > 0 && <p className="text-sm text-on-surface-variant">{preview.images.size} photos in the zip will be matched to dishes and uploaded.</p>}
          {preview.skipped.length > 0 && (
            <div className="rounded-2xl bg-[#fbeedd] text-[#6b4511] text-sm px-4 py-3">
              <p className="font-medium">{preview.skipped.length} row{preview.skipped.length === 1 ? '' : 's'} will be skipped:</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {preview.skipped.slice(0, 6).map(sk => <li key={sk.row}>Line {sk.row}: {sk.reason}</li>)}
                {preview.skipped.length > 6 && <li>…and {preview.skipped.length - 6} more</li>}
              </ul>
            </div>
          )}
          <p className="text-xs text-on-surface-variant">Dishes are added to your current menu; nothing is replaced.</p>
        </>
      ) : (
        <div className="space-y-3 text-sm text-on-surface">
          <p>Columns it understands: <span className="text-on-surface-variant">Name, Price, Category, Description, FoodType (veg / nonveg), ImageUrl or ImageFile, Variations, Addons, ETA.</span></p>
          <p>Sizes and add-ons go in one cell each, like <code className="px-1.5 py-0.5 rounded bg-surface-container text-xs">Small:220|Large:420</code>.</p>
          <button type="button" onClick={() => downloadCsv('cabadra-menu-template.csv', MENU_TEMPLATE_CSV)} className="font-medium underline underline-offset-2">
            Download a template
          </button>
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}
