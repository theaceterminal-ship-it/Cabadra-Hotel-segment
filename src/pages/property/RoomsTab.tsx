import React, { useState } from 'react';
import Papa from 'papaparse';
import { Bed, BedDouble, Pencil, Plus, Upload, Users } from 'lucide-react';
import { Room } from '../../types';
import { addRoom, bulkAddRooms, deleteRoom, updateRoom } from '../../lib/staffApi';
import { formatCurrency } from '../../lib/currency';
import {
  ChoiceField, CsvImportModal, DeleteButton, SearchFilterBar, EmptyState, ErrorNote, Field, Modal, PhotoField, SectionHeader,
  btnPrimary, btnSecondary, downloadCsv, iconBtn, inputCls,
} from './ui';

const ROOM_TYPE_PRESETS = [
  'Standard Room', 'Deluxe Room', 'Executive Room', 'VIP Suite', 'Presidential Suite',
  'Family Suite', 'Studio Apartment', 'Luxury Villa',
];

const BED_CONFIG_PRESETS = [
  '1 Single Bed', '1 Double Bed', '1 Queen Bed', '1 King Bed', '2 Single Beds', '2 Twin Beds',
  '2 Double Beds', '2 Queen Beds', '3 Single Beds (Sleeps 3)', '4 Bunk Beds (Sleeps 4)', '5 Beds (Family Suite)',
];

const ROOMS_CSV_HEADERS = ['number', 'type', 'floor', 'occupancy', 'price'];

function downloadRoomsCsvTemplate(hasExternalPms: boolean) {
  const csv = hasExternalPms
    ? Papa.unparse({ fields: ['number', 'floor'], data: [['101', '1'], ['102', '1'], ['201', '2']] })
    : Papa.unparse({ fields: ROOMS_CSV_HEADERS, data: [['101', 'Standard Room', '1', '2', '95'], ['205', 'Deluxe Room', '2', '2', '140']] });
  downloadCsv('cabadra-rooms-template.csv', csv);
}

const emptyForm = { number: '', type: 'Standard Room', floor: '1', occupancy: '2', price: '', image: '', bedsDescription: '', bathroomDetails: '' };

export function RoomsTab({ propertyId, currency, rooms, hasExternalPms, onChanged }: {
  propertyId: string; currency: string; rooms: Room[]; hasExternalPms: boolean; onChanged: () => void;
}) {
  // null = closed, 'new' = adding, otherwise the room being edited.
  const [editing, setEditing] = useState<Room | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [bedsFilter, setBedsFilter] = useState('');
  const [floorFilter, setFloorFilter] = useState('');

  const allFloors = [...new Set(rooms.map(r => r.floor))].sort((a, b) => a - b);
  const usedTypes = [...new Set(rooms.map(r => r.type).filter(Boolean))].sort();
  const usedBeds = [...new Set(rooms.map(r => r.bedsDescription ?? '').filter(Boolean))].sort();

  const q = query.trim().toLowerCase();
  const visibleRooms = rooms.filter(r =>
    (!q || r.number.toLowerCase().includes(q)) &&
    (!typeFilter || r.type === typeFilter) &&
    (!bedsFilter || r.bedsDescription === bedsFilter) &&
    (!floorFilter || String(r.floor) === floorFilter)
  );
  const floors = [...new Set(visibleRooms.map(r => r.floor))].sort((a, b) => a - b);
  const filtering = q !== '' || typeFilter !== '' || bedsFilter !== '' || floorFilter !== '';

  const openNew = () => {
    setForm(emptyForm);
    setFormError(null);
    setEditing('new');
  };
  const openEdit = (r: Room) => {
    setForm({
      number: r.number,
      type: r.type || 'Standard Room',
      floor: String(r.floor || 1),
      occupancy: String(r.maxOccupancy || 2),
      price: String(r.pricePerNight || 0),
      image: r.image ?? '',
      bedsDescription: r.bedsDescription ?? '',
      bathroomDetails: r.bathroomDetails ?? '',
    });
    setFormError(null);
    setEditing(r);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.number.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        number: form.number.trim(),
        type: form.type.trim() || 'Standard Room',
        floor: parseInt(form.floor) || 1,
        maxOccupancy: parseInt(form.occupancy) || 2,
        pricePerNight: parseFloat(form.price) || 0,
        image: form.image.trim() || undefined,
        bedsDescription: form.bedsDescription.trim() || undefined,
        bathroomDetails: form.bathroomDetails.trim() || undefined,
      };
      if (editing && editing !== 'new') await updateRoom(editing.id, payload);
      else await addRoom(propertyId, payload);
      setEditing(null);
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save room.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (roomId: string) => {
    setListError(null);
    try {
      await deleteRoom(roomId);
      onChanged();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to delete room — it may already have reservation history.');
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
          if (!results.meta.fields?.includes('number')) {
            throw new Error('The file is missing the "number" column. Download the template for the exact format.');
          }
          const roomRows = results.data
            .filter(row => row.number?.trim())
            .map(row => ({
              number: row.number.trim(),
              type: row.type?.trim() || undefined,
              floor: row.floor ? parseInt(row.floor) || 1 : undefined,
              maxOccupancy: row.occupancy ? parseInt(row.occupancy) || 2 : undefined,
              pricePerNight: row.price ? parseFloat(row.price) || 0 : undefined,
            }));
          if (roomRows.length === 0) throw new Error('No rooms found in that file.');
          await bulkAddRooms(propertyId, roomRows);
          setImportResult(`Added ${roomRows.length} room${roomRows.length === 1 ? '' : 's'}.`);
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

  const set = (key: keyof typeof emptyForm) => (v: string) => setForm(f => ({ ...f, [key]: v }));

  return (
    <div>
      <SectionHeader
        title="Rooms"
        description={rooms.length ? `${rooms.length} room${rooms.length === 1 ? '' : 's'} on ${allFloors.length} floor${allFloors.length === 1 ? '' : 's'}.` : 'Each room gets its own QR code for the guest app.'}
        actions={rooms.length > 0 && (
          <>
            <button onClick={() => { setShowImport(true); setImportResult(null); setImportError(null); }} className={btnSecondary}>
              <Upload className="size-4" /> Import
            </button>
            <button onClick={openNew} className={btnPrimary}><Plus className="size-4" /> Add room</button>
          </>
        )}
      />

      {listError && <div className="mb-4"><ErrorNote>{listError}</ErrorNote></div>}

      {rooms.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title="No rooms yet"
          body="Add rooms one by one, or import a whole list from a spreadsheet."
          action={
            <>
              <button onClick={() => setShowImport(true)} className={btnSecondary}><Upload className="size-4" /> Import CSV</button>
              <button onClick={openNew} className={btnPrimary}><Plus className="size-4" /> Add room</button>
            </>
          }
        />
      ) : (
        <>
        <SearchFilterBar
          query={query}
          onQuery={setQuery}
          placeholder="Search by room number"
          groups={[
            { id: 'type', label: 'Type', value: typeFilter, onChange: setTypeFilter, options: usedTypes.map(t => ({ value: t, label: t })) },
            { id: 'beds', label: 'Beds', value: bedsFilter, onChange: setBedsFilter, options: usedBeds.map(b => ({ value: b, label: b })) },
            { id: 'floor', label: 'Floor', value: floorFilter, onChange: setFloorFilter, options: allFloors.map(f => ({ value: String(f), label: `Floor ${f}` })) },
          ].filter(g => g.options.length > 0)}
        />
        {filtering && visibleRooms.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-12">No rooms match. Try another number or clear the filters.</p>
        ) : (
        <div className="space-y-8">
          {floors.map(floor => {
            const floorRooms = visibleRooms.filter(r => r.floor === floor);
            return (
              <section key={floor}>
                <p className="text-sm font-medium text-on-surface-variant mb-3">
                  Floor {floor} <span className="text-on-surface-variant/70">· {floorRooms.length}</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {floorRooms.map(r => (
                    <div
                      key={r.id}
                      onClick={() => openEdit(r)}
                      className="group cursor-pointer rounded-[20px] bg-surface-container-lowest border border-outline-variant overflow-hidden hover:border-on-surface-variant transition-colors"
                    >
                      <div className="h-24 bg-surface-container flex items-center justify-center text-on-surface-variant">
                        {r.image ? <img src={r.image} alt={`Room ${r.number}`} className="size-full object-cover" /> : <Bed className="size-6 opacity-50" />}
                      </div>
                      <div className="p-3.5">
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0">
                            <p className="text-base font-semibold text-on-surface leading-tight">{r.number}</p>
                            <p className="text-xs text-on-surface-variant truncate mt-0.5">{r.type}</p>
                          </div>
                          <div className="flex -mr-1.5 -mt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button onClick={() => openEdit(r)} className={iconBtn} aria-label={`Edit room ${r.number}`}><Pencil className="size-4" /></button>
                            <DeleteButton onDelete={() => handleDelete(r.id)} label="Delete room" />
                          </div>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between text-xs text-on-surface-variant">
                          <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {r.maxOccupancy}</span>
                          {!hasExternalPms && <span className="font-medium text-on-surface">{formatCurrency(r.pricePerNight, currency)}<span className="text-on-surface-variant font-normal"> /night</span></span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        )}
        </>
      )}

      {editing && (
        <Modal
          title={editing === 'new' ? 'Add a room' : `Room ${editing.number}`}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
          footer={
            <>
              <button type="button" onClick={() => setEditing(null)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={submitting || !form.number.trim()} className={btnPrimary}>
                {submitting ? 'Saving…' : editing === 'new' ? 'Add room' : 'Save'}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Room number"><input required value={form.number} onChange={e => set('number')(e.target.value)} placeholder="101" className={inputCls} autoFocus /></Field>
            <Field label="Floor"><input type="number" value={form.floor} onChange={e => set('floor')(e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label="Room type">
            <ChoiceField options={[...ROOM_TYPE_PRESETS, ...usedTypes]} value={form.type} onChange={set('type')} placeholder="Choose a room type" newLabel="Add a new type…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sleeps"><input type="number" min={1} value={form.occupancy} onChange={e => set('occupancy')(e.target.value)} className={inputCls} /></Field>
            <Field label={`Price per night (${currency})`}><input type="number" value={form.price} onChange={e => set('price')(e.target.value)} placeholder="2500" className={inputCls} /></Field>
          </div>
          <Field label="Beds (optional)">
            <ChoiceField options={[...BED_CONFIG_PRESETS, ...usedBeds]} value={form.bedsDescription} onChange={set('bedsDescription')} placeholder="Choose beds" newLabel="Something else…" optional />
          </Field>
          <Field label="Bathroom (optional)">
            <input value={form.bathroomDetails} onChange={e => set('bathroomDetails')(e.target.value)} placeholder="Attached bath with geyser" className={inputCls} />
          </Field>
          <PhotoField label="Photo (optional)" value={form.image} onChange={set('image')} />
          <ErrorNote>{formError}</ErrorNote>
        </Modal>
      )}

      {showImport && (
        <CsvImportModal
          title="Import rooms"
          description="Add many rooms at once from a spreadsheet saved as CSV."
          onDownloadTemplate={() => downloadRoomsCsvTemplate(hasExternalPms)}
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
