import React, { useState } from 'react';
import { ImageUploadField } from './ImageUploadField';
import { COUNTRIES, currencyForCountry } from '../lib/currency';

const PMS_OPTIONS = ['eZee Absolute', 'Cloudbeds', 'Mews', 'IDS Next', 'Hotelogix', 'RMS Cloud', 'Oracle OPERA', 'Other', 'Not sure'];

export interface NewPropertyInput {
  id: string;
  name: string;
  location: string;
  image?: string;
  country?: string;
  currency?: string;
  hasExternalPms: boolean;
  pmsName?: string;
}

interface NewPropertyFormProps {
  onCreate: (input: NewPropertyInput) => Promise<void>;
  /** Omit for the full-page first-hotel screen, which has nothing to cancel back to. */
  onCancel?: () => void;
  submitLabel?: string;
}

/**
 * Business basics + the PMS question, in one flat form rather than a
 * multi-step wizard — a receptionist or owner filling this in shouldn't
 * need to navigate "step 1 of 2." Used both for a brand-new owner's very
 * first hotel (OwnerApp's empty state) and for adding a second/third
 * property later (PropertiesPortfolio's Add Property modal) — every
 * property gets asked the same question, since a chain owner might run
 * some hotels with a PMS and some without.
 */
export function NewPropertyForm({ onCreate, onCancel, submitLabel = 'Save Property' }: NewPropertyFormProps) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [image, setImage] = useState('');
  const [country, setCountry] = useState('US');
  const [usesPms, setUsesPms] = useState<'yes' | 'no' | ''>('');
  const [pmsChoice, setPmsChoice] = useState('');
  const [pmsOther, setPmsOther] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedPmsName = pmsChoice === 'Other' ? pmsOther.trim() : pmsChoice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !usesPms) return;
    setCreating(true);
    setError(null);
    try {
      await onCreate({
        id: name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        name: name.trim(),
        location: location.trim() || 'Location TBD',
        image: image.trim() || undefined,
        country,
        currency: currencyForCountry(country),
        hasExternalPms: usesPms === 'yes',
        pmsName: usesPms === 'yes' ? (resolvedPmsName || undefined) : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create property.');
      setCreating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-xs">
      <div>
        <label className="font-semibold text-[#141d23] block mb-1">Hotel Name</label>
        <input
          type="text"
          required
          placeholder="e.g., The Bellagio Suite"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none"
        />
      </div>

      <div>
        <label className="font-semibold text-[#141d23] block mb-1">Location / City</label>
        <input
          type="text"
          required
          placeholder="e.g., Beverly Hills, CA"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none"
        />
      </div>

      <div>
        <label className="font-semibold text-[#141d23] block mb-1">Country</label>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none bg-white"
        >
          {COUNTRIES.map(c => (
            <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>
          ))}
        </select>
        <p className="text-[10px] text-[#7f7668] mt-1">
          Sets this property's currency to {currencyForCountry(country)}. Can't be changed after creation.
        </p>
      </div>

      <ImageUploadField label="Photo (optional)" value={image} onChange={setImage} />

      <div className="pt-1 border-t border-[#E9ECEF]" />

      <div>
        <label className="font-semibold text-[#141d23] block mb-1">Do you already manage bookings elsewhere?</label>
        <p className="text-[10px] text-[#7f7668] mb-2">
          "PMS" is the software a hotel uses to track reservations and room availability — eZee, Cloudbeds, or even
          a paper register/spreadsheet all count. This just decides which screens Cabadra shows you next.
        </p>
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => setUsesPms('yes')}
            className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
              usesPms === 'yes' ? 'border-[#765a25] bg-[#fff8ec]' : 'border-[#E9ECEF] hover:border-[#765a25]'
            }`}
          >
            <span className={`block text-xs font-bold ${usesPms === 'yes' ? 'text-[#765a25]' : 'text-[#141d23]'}`}>Yes, we already have one</span>
            <span className="block text-[10px] text-[#7f7668] mt-0.5">Cabadra hides its own booking screens — you'll just link guests to rooms, and your PMS stays in charge of bookings.</span>
          </button>
          <button
            type="button"
            onClick={() => { setUsesPms('no'); setPmsChoice(''); setPmsOther(''); }}
            className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
              usesPms === 'no' ? 'border-[#765a25] bg-[#fff8ec]' : 'border-[#E9ECEF] hover:border-[#765a25]'
            }`}
          >
            <span className={`block text-xs font-bold ${usesPms === 'no' ? 'text-[#765a25]' : 'text-[#141d23]'}`}>No — set Cabadra up as our front desk</span>
            <span className="block text-[10px] text-[#7f7668] mt-0.5">You'll get room booking and availability search too, not just the guest-experience side.</span>
          </button>
        </div>

        {usesPms === 'yes' && (
          <div className="mt-3 space-y-2">
            <label className="font-semibold text-[#141d23] block">Which one?</label>
            <select
              value={pmsChoice}
              onChange={(e) => setPmsChoice(e.target.value)}
              className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none bg-white"
            >
              <option value="">Select…</option>
              {PMS_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {pmsChoice === 'Other' && (
              <input
                type="text"
                placeholder="Name it"
                value={pmsOther}
                onChange={(e) => setPmsOther(e.target.value)}
                className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none"
              />
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-[#7f7668]">You can change this later from the property's Overview tab if it turns out wrong.</p>

      <p className="text-[11px] text-[#7f7668]">
        Rooms and a menu aren't created here yet — you'll add those separately once the property exists.
      </p>

      {error && <p className="text-red-600">{error}</p>}

      <div className={`flex ${onCancel ? 'justify-end' : 'justify-stretch'} gap-2 pt-4 border-t border-[#E9ECEF]`}>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-[#E9ECEF] rounded-lg text-[#4e463a] font-medium">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={creating || !name.trim() || !usesPms}
          className={`${onCancel ? '' : 'w-full'} px-5 py-2 h-10 bg-[#765a25] text-white rounded-lg font-semibold hover:bg-[#5c4210] disabled:opacity-60`}
        >
          {creating ? 'Creating…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
