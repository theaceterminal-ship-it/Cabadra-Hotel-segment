import React, { useState } from 'react';
import { Check, ImagePlus, Loader2, Plus, X } from 'lucide-react';
import { HIMACHAL_PLACES } from '../../lib/himachalPlaces';
import { uploadImageToCloudinary } from '../../lib/cloudinary';
import { PARTNER_CATEGORIES, ListingFields } from '../../lib/partnersApi';

export const partnerInput = 'w-full h-12 px-4 rounded-2xl bg-[#f4f5f2] border border-transparent text-[15px] placeholder:text-[#111]/35 focus:outline-none focus:border-[#111]/30 focus:bg-white transition-colors';

export const EMPTY_LISTING: ListingFields = {
  name: '', category: '', tagline: '', description: '', photo: '', phone: '', whatsapp: '', mapsUrl: '', address: '',
  openingHours: '', offerText: '', offerCode: '', areas: [],
};

export function PField({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-[#111]/50">{hint}</span>}
    </label>
  );
}

/**
 * What guests see about a business, in three cards: the business, how to
 * reach it, and where it serves. Used to apply (PartnerHome) and to edit
 * a listing (PartnerPortal). `children` goes under the area card, for the
 * caller's own fields and submit bar.
 */
export function ListingForm({ value, onChange, onSubmit, children }: {
  value: ListingFields;
  onChange: (v: ListingFields) => void;
  onSubmit: (e: React.FormEvent) => void;
  children?: React.ReactNode;
}) {
  const [sameWhatsapp, setSameWhatsapp] = useState(!value.whatsapp || value.whatsapp === value.phone);
  const set = <K extends keyof ListingFields>(k: K, v: ListingFields[K]) => {
    const next = { ...value, [k]: v };
    if (sameWhatsapp && k === 'phone') next.whatsapp = v as string;
    onChange(next);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-3 lg:grid-cols-[1fr_1fr]">
      <div className="rounded-[28px] bg-white p-6 sm:p-8 space-y-5">
        <p className="text-lg font-semibold tracking-[-0.01em]">Your business</p>
        <PField label="Business name">
          <input required maxLength={80} value={value.name} onChange={e => set('name', e.target.value)} className={partnerInput} placeholder="Himalayan Cabs" />
        </PField>
        <div>
          <span className="block text-sm font-medium mb-1.5">What do you do?</span>
          <div className="flex flex-wrap gap-1.5">
            {PARTNER_CATEGORIES.map(c => (
              <button type="button" key={c.id} onClick={() => set('category', c.id)} className={`h-10 px-4 rounded-full text-sm font-medium transition-colors ${value.category === c.id ? 'bg-[#111] text-white' : 'bg-[#f4f5f2] hover:bg-[#e9ebe6]'}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <PField label="One line guests will see" hint="Up to 120 characters.">
          <input maxLength={120} value={value.tagline} onChange={e => set('tagline', e.target.value)} className={partnerInput} placeholder="Airport transfers and day trips" />
        </PField>
        <PField label="About you" hint="Optional. Up to 600 characters.">
          <textarea maxLength={600} rows={4} value={value.description} onChange={e => set('description', e.target.value)} className={`${partnerInput} h-auto py-3 resize-none`} placeholder="Clean cars, local drivers who know every road." />
        </PField>
        <div className="grid grid-cols-[1fr_130px] gap-3">
          <PField label="An offer for hotel guests" hint="Optional, but offers get more calls.">
            <input maxLength={120} value={value.offerText} onChange={e => set('offerText', e.target.value)} className={partnerInput} placeholder="10% off for hotel guests" />
          </PField>
          <PField label="Code">
            <input maxLength={30} value={value.offerCode} onChange={e => set('offerCode', e.target.value.toUpperCase())} className={`${partnerInput} font-mono`} placeholder="CAB10" />
          </PField>
        </div>
        <PhotoField value={value.photo} onChange={v => set('photo', v)} />
      </div>

      <div className="space-y-3">
        <div className="rounded-[28px] bg-white p-6 sm:p-8 grid gap-5 sm:grid-cols-2">
          <p className="sm:col-span-2 text-lg font-semibold tracking-[-0.01em]">How guests reach you</p>
          <PField label="Phone guests call">
            <input required type="tel" value={value.phone} onChange={e => set('phone', e.target.value)} className={partnerInput} placeholder="98765 43210" autoComplete="tel" />
          </PField>
          <div>
            <span className="block text-sm font-medium mb-1.5">WhatsApp</span>
            {sameWhatsapp ? (
              <button type="button" onClick={() => { setSameWhatsapp(false); }} className="w-full h-12 px-4 rounded-2xl bg-[#f4f5f2] text-left text-[15px] text-[#111]/60 inline-flex items-center gap-2">
                <Check className="size-4" /> Same as phone · change
              </button>
            ) : (
              <input type="tel" value={value.whatsapp} onChange={e => set('whatsapp', e.target.value)} className={partnerInput} placeholder="WhatsApp number" />
            )}
          </div>
          <PField label="Address" wide>
            <input maxLength={200} value={value.address} onChange={e => set('address', e.target.value)} className={partnerInput} placeholder="Upper Mall, Kasauli" />
          </PField>
          <PField label="Google Maps link" hint="Optional. Share → Copy link in Google Maps.">
            <input type="url" value={value.mapsUrl} onChange={e => set('mapsUrl', e.target.value)} className={partnerInput} placeholder="https://maps.app.goo.gl/…" />
          </PField>
          <PField label="Opening hours">
            <input maxLength={80} value={value.openingHours} onChange={e => set('openingHours', e.target.value)} className={partnerInput} placeholder="7am – 10pm, every day" />
          </PField>
        </div>

        <div className="rounded-[28px] bg-white p-6 sm:p-8">
          <p className="text-lg font-semibold tracking-[-0.01em]">Where you serve</p>
          <p className="mt-1 text-sm text-[#111]/55">You show to guests at hotels in these places. Pick a district to cover all of it.</p>
          <div className="mt-4"><AreaChips value={value.areas} onChange={v => set('areas', v)} /></div>
        </div>
        {children}
      </div>
    </form>
  );
}

function PhotoField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadImageToCloudinary(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };
  return (
    <div>
      <span className="block text-sm font-medium mb-1.5">A photo</span>
      {value ? (
        <div className="relative rounded-2xl overflow-hidden h-40">
          <img src={value} alt="" className="w-full h-full object-cover" />
          <button type="button" onClick={() => onChange('')} aria-label="Remove photo" className="absolute top-2 right-2 size-8 rounded-full bg-white/90 flex items-center justify-center"><X className="size-4" /></button>
        </div>
      ) : (
        <label className="h-28 rounded-2xl border-2 border-dashed border-black/10 flex flex-col items-center justify-center gap-1.5 text-sm text-[#111]/55 cursor-pointer hover:bg-[#f4f5f2] transition-colors">
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          {uploading ? 'Uploading…' : 'Your car, your shop, your view'}
          <input type="file" accept="image/*" className="sr-only" onChange={pick} />
        </label>
      )}
      {error && <p className="mt-1.5 text-xs text-[#8a1c0a]">{error}</p>}
    </div>
  );
}

const titleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());

/** Districts and their places, the same list hotels pick their location from, so areas match hotels. */
export function AreaChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [other, setOther] = useState('');
  const toggle = (a: string) => onChange(value.includes(a) ? value.filter(x => x !== a) : [...value, a]);
  const known = new Set(HIMACHAL_PLACES.flatMap(g => [g.district.toLowerCase(), ...g.places.map(p => p.toLowerCase())]));
  const extras = value.filter(v => !known.has(v));
  const addOther = () => {
    const v = other.trim().toLowerCase();
    if (v && !value.includes(v)) onChange([...value, v]);
    setOther('');
  };
  return (
    <div className="space-y-3">
      {HIMACHAL_PLACES.map(g => {
        const d = g.district.toLowerCase();
        const districtOn = value.includes(d);
        return (
          <div key={g.district} className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => toggle(d)} className={`h-9 px-3.5 rounded-full text-sm font-semibold transition-colors ${districtOn ? 'bg-[#111] text-white' : 'bg-[#f4f5f2] hover:bg-[#e9ebe6]'}`}>
              {g.district} <span className={`font-normal ${districtOn ? 'text-white/65' : 'text-[#111]/45'}`}>district</span>
            </button>
            {g.places.filter(p => p.toLowerCase() !== d).map(p => {
              const on = value.includes(p.toLowerCase());
              return (
                <button type="button" key={p} disabled={districtOn} onClick={() => toggle(p.toLowerCase())} className={`h-9 px-3.5 rounded-full text-sm transition-colors disabled:opacity-35 ${on ? 'bg-[#d4ff5a] font-medium' : 'border border-black/10 hover:bg-[#f4f5f2]'}`}>
                  {p}
                </button>
              );
            })}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {extras.map(x => (
          <span key={x} className="h-9 pl-3.5 pr-1 rounded-full bg-[#d4ff5a] text-sm inline-flex items-center gap-1">
            {titleCase(x)}
            <button type="button" onClick={() => toggle(x)} aria-label={`Remove ${x}`} className="size-7 rounded-full hover:bg-black/10 flex items-center justify-center"><X className="size-3.5" /></button>
          </span>
        ))}
        <input value={other} onChange={e => setOther(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOther(); } }} placeholder="Another place" className="h-9 w-40 px-3.5 rounded-full border border-black/10 text-sm focus:outline-none focus:border-[#111]/40" />
        <button type="button" onClick={addOther} className="size-9 rounded-full bg-[#f4f5f2] flex items-center justify-center" aria-label="Add place"><Plus className="size-4" /></button>
      </div>
    </div>
  );
}
