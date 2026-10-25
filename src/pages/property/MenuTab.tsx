import React, { useState } from 'react';
import Papa from 'papaparse';
import { Pencil, Plus, Upload, Utensils, UtensilsCrossed } from 'lucide-react';
import { MenuItem } from '../../types';
import { addMenuItem, bulkAddMenuItems, deleteMenuItem, updateMenuItem } from '../../lib/staffApi';
import { formatCurrency } from '../../lib/currency';
import {
  CsvImportModal, DeleteButton, SearchFilterBar, EmptyState, ErrorNote, Field, Modal, PhotoField, SectionHeader, Switch,
  btnPrimary, btnSecondary, downloadCsv, iconBtn, inputCls, textareaCls,
} from './ui';

const MENU_CSV_HEADERS = ['name', 'category', 'price', 'description', 'image', 'isVeg', 'prepTime'];

function downloadMenuCsvTemplate() {
  downloadCsv('cabadra-menu-template.csv', Papa.unparse({
    fields: MENU_CSV_HEADERS,
    data: [['Paneer Tikka', 'Starters', '320', 'Char-grilled marinated cottage cheese', '', 'true', '15-20 mins']],
  }));
}

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

const emptyForm = { name: '', category: '', price: '', description: '', image: '', isVeg: true, prepTime: '' };

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
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

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
    setForm({ name: m.name, category: m.category, price: String(m.price), description: m.description, image: m.image, isVeg: m.isVeg, prepTime: m.prepTime ?? '' });
    setFormError(null);
    setEditing(m);
  };

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

  const handleCsvSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const missing = ['name', 'category', 'price'].filter(h => !results.meta.fields?.includes(h));
          if (missing.length > 0) {
            throw new Error(`The file is missing: ${missing.join(', ')}. Download the template for the exact format.`);
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
          if (items.length === 0) throw new Error('No items found in that file.');
          await bulkAddMenuItems(propertyId, items);
          setImportResult(`Added ${items.length} item${items.length === 1 ? '' : 's'}.`);
          onChanged();
        } catch (err) {
          setImportError(err instanceof Error ? err.message : 'Import failed.');
        } finally {
          setImporting(false);
        }
      },
      error: (err) => {
        setImportError(err.message);
        setImporting(false);
      },
    });
  };

  return (
    <div>
      <SectionHeader
        title="Menu"
        description={menu.length ? `${menu.length} item${menu.length === 1 ? '' : 's'} guests can order to their room.` : 'What guests can order to their room from the guest app.'}
        actions={menu.length > 0 && (
          <>
            <button onClick={() => { setShowImport(true); setImportResult(null); setImportError(null); }} className={btnSecondary}>
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
              <button onClick={() => setShowImport(true)} className={btnSecondary}><Upload className="size-4" /> Import CSV</button>
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
                      <span className="text-sm font-medium text-on-surface shrink-0">{formatCurrency(m.price, currency)}</span>
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
              <button type="submit" disabled={submitting || !form.name.trim() || !form.category.trim() || !form.price.trim()} className={btnPrimary}>
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
            <Field label={`Price (${currency})`}><input required type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="320" className={inputCls} /></Field>
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
          <PhotoField label="Photo (optional)" value={form.image} onChange={url => setForm(f => ({ ...f, image: url }))} />
          <ErrorNote>{formError}</ErrorNote>
        </Modal>
      )}

      {showImport && (
        <CsvImportModal
          title="Import menu"
          description="Add your whole menu at once from a spreadsheet saved as CSV."
          onDownloadTemplate={downloadMenuCsvTemplate}
          onFile={handleCsvSelected}
          importing={importing}
          result={importResult}
          error={importError}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
