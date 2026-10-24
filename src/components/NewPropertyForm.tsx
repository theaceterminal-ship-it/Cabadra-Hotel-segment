import React, { useState } from 'react';
import { ImageUploadField } from './ImageUploadField';
import { COUNTRIES, currencyForCountry } from '../lib/currency';
import { SETUP_FEE_INR, type PropertyDraft } from '../lib/setupPayment';

const PMS_OPTIONS = ['eZee Absolute', 'Cloudbeds', 'Mews', 'IDS Next', 'Hotelogix', 'RMS Cloud', 'Oracle OPERA', 'Other', 'Not sure'];

export type NewPropertyInput = PropertyDraft;

interface NewPropertyFormProps {
  /** Pays for and creates the property; throws (with a message to show) on failure or cancel. */
  onCreate: (input: NewPropertyInput) => Promise<void>;
  /** Omit for the full-page onboarding screen, which has nothing to cancel back to. */
  onCancel?: () => void;
  /** Prefill from the website's setup bar. */
  initialName?: string;
  initialLocation?: string;
  /** Shown on the submit button while a payment is open or being confirmed. */
  busyLabel?: string;
}

const inputClass =
  'w-full h-12 px-5 rounded-full border border-outline-variant bg-surface-container-lowest text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-on-surface focus:outline-none transition-colors';

/**
 * Business basics + the PMS question, in one flat form rather than a
 * multi-step wizard. Used both for a brand-new owner's first property
 * (OwnerOnboarding) and for adding more later (PropertiesPortfolio's Add
 * Property modal) — every property gets asked the same question, since a
 * chain owner might run some hotels with a PMS and some without.
 *
 * Submitting opens the one-time setup-fee checkout; the property only
 * exists once that payment is confirmed (see lib/setupPayment.ts). The
 * property id is chosen server-side, so it isn't part of the input.
 */
export function NewPropertyForm({ onCreate, onCancel, initialName = '', initialLocation = '', busyLabel }: NewPropertyFormProps) {
  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState(initialLocation);
  const [image, setImage] = useState('');
  const [country, setCountry] = useState('IN');
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

  const choiceClass = (selected: boolean) =>
    `text-left px-5 py-3.5 rounded-2xl border transition-colors ${
      selected ? 'border-on-surface bg-highlight' : 'border-outline-variant hover:border-on-surface-variant'
    }`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="text-[13px] text-on-surface-variant block mb-1.5 pl-1">Property name</span>
        <input
          type="text"
          required
          placeholder="Pine View Cottage"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[13px] text-on-surface-variant block mb-1.5 pl-1">City</span>
          <input
            type="text"
            required
            placeholder="Kufri, Shimla"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-[13px] text-on-surface-variant block mb-1.5 pl-1">Country</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass}>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-on-surface-variant pl-1 -mt-2">
        Guest prices for this property will be in {currencyForCountry(country)}. This can’t be changed later.
      </p>

      <ImageUploadField label="Photo (optional)" value={image} onChange={setImage} />

      <div className="pt-2">
        <p className="text-sm font-medium text-on-surface pl-1">Do you already use a PMS?</p>
        <p className="text-xs text-on-surface-variant mt-1 mb-3 pl-1">
          eZee, Cloudbeds, or even a paper register all count. Cabadra works alongside it either way.
        </p>
        <div className="grid grid-cols-1 gap-2">
          <button type="button" onClick={() => setUsesPms('yes')} className={choiceClass(usesPms === 'yes')}>
            <span className="block text-sm font-medium text-on-surface">Yes, we have one</span>
            <span className="block text-xs text-on-surface-variant mt-0.5">Your PMS keeps bookings. Cabadra hands you one total of extras at checkout.</span>
          </button>
          <button
            type="button"
            onClick={() => { setUsesPms('no'); setPmsChoice(''); setPmsOther(''); }}
            className={choiceClass(usesPms === 'no')}
          >
            <span className="block text-sm font-medium text-on-surface">No, use Cabadra’s simple one</span>
            <span className="block text-xs text-on-surface-variant mt-0.5">You also get rooms, bookings and check-in.</span>
          </button>
        </div>

        {usesPms === 'yes' && (
          <div className="mt-3 space-y-2">
            <select value={pmsChoice} onChange={(e) => setPmsChoice(e.target.value)} className={inputClass}>
              <option value="">Which one?</option>
              {PMS_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {pmsChoice === 'Other' && (
              <input
                type="text"
                placeholder="Name it"
                value={pmsOther}
                onChange={(e) => setPmsOther(e.target.value)}
                className={inputClass}
              />
            )}
          </div>
        )}
      </div>

      {error && <p className="text-[13px] text-error pl-1">{error}</p>}

      <div className="pt-3">
        <div className="flex items-center justify-between rounded-2xl bg-surface-container-low px-5 py-3.5">
          <span className="text-sm text-on-surface-variant">One-time setup fee</span>
          <span className="text-base font-semibold text-on-surface">₹{SETUP_FEE_INR.toLocaleString('en-IN')}</span>
        </div>
        <div className={`flex gap-2 mt-3 ${onCancel ? 'justify-end' : ''}`}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={creating}
              className="h-12 px-6 rounded-full border border-outline-variant text-sm font-medium text-on-surface hover:bg-surface-container-low disabled:opacity-60"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={creating || !name.trim() || !usesPms}
            className={`${onCancel ? '' : 'w-full'} h-12 px-7 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50`}
          >
            {creating ? (busyLabel ?? 'Opening payment…') : `Pay ₹${SETUP_FEE_INR.toLocaleString('en-IN')} and add property`}
          </button>
        </div>
        <p className="text-xs text-on-surface-variant text-center mt-3">
          Secure payment by Razorpay. Rooms, menu and staff come next, on the property’s page.
        </p>
      </div>
    </form>
  );
}
