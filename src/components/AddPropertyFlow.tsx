import React, { useState } from 'react';
import { NewPropertyForm } from './NewPropertyForm';
import {
  payForNewProperty,
  readWebsiteSetupDraft,
  saveMyOrganization,
  type Organization,
} from '../lib/setupPayment';

export type AddPropertyStage = 'business' | 'property' | 'payment';

interface AddPropertyFlowProps {
  organization: Organization | null;
  onOrganizationSaved: (org: Organization) => void;
  /** Runs once the payment is confirmed and the property exists. */
  onCreated: (propertyId: string) => Promise<void>;
  onCancel?: () => void;
  email?: string;
  onStageChange?: (stage: AddPropertyStage) => void;
}

/**
 * Business details (once per account) → property details → setup-fee
 * payment. Used full-page for a brand-new owner (OwnerOnboarding) and in
 * the Add Property modal for owners adding another property; an older
 * account that predates organizations is asked for its business details
 * the first time it adds a property.
 */
export function AddPropertyFlow({
  organization,
  onOrganizationSaved,
  onCreated,
  onCancel,
  email,
  onStageChange,
}: AddPropertyFlowProps) {
  const [busyLabel, setBusyLabel] = useState<string | undefined>();
  const websiteDraft = readWebsiteSetupDraft();

  if (!organization) {
    return (
      <OrganizationForm
        onCancel={onCancel}
        onSaved={org => {
          onOrganizationSaved(org);
          onStageChange?.('property');
        }}
      />
    );
  }

  const handleCreate = async (input: Parameters<typeof payForNewProperty>[0]) => {
    setBusyLabel('Opening payment…');
    try {
      const propertyId = await payForNewProperty(
        input,
        { name: organization.ownerName, email, contact: organization.phone },
        {
          onCheckoutOpen: () => {
            setBusyLabel('Waiting for payment…');
            onStageChange?.('payment');
          },
          onVerifying: () => setBusyLabel('Confirming payment…'),
        },
      );
      setBusyLabel('Setting up your property…');
      await onCreated(propertyId);
    } catch (err) {
      onStageChange?.('property');
      setBusyLabel(undefined);
      throw err;
    }
  };

  return (
    <NewPropertyForm
      onCreate={handleCreate}
      onCancel={onCancel}
      busyLabel={busyLabel}
      initialName={websiteDraft.property}
      initialLocation={websiteDraft.city}
    />
  );
}

const inputClass =
  'w-full h-12 px-5 rounded-full border border-outline-variant bg-surface-container-lowest text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-on-surface focus:outline-none transition-colors';

function OrganizationForm({ onSaved, onCancel }: { onSaved: (org: Organization) => void; onCancel?: () => void }) {
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveMyOrganization({ name, ownerName, phone }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save your details.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="text-[13px] text-on-surface-variant block mb-1.5 pl-1">Business name</span>
        <input
          required
          maxLength={120}
          placeholder="Pine View Hospitality"
          value={name}
          onChange={e => setName(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="text-[13px] text-on-surface-variant block mb-1.5 pl-1">Your name</span>
        <input
          required
          maxLength={120}
          autoComplete="name"
          value={ownerName}
          onChange={e => setOwnerName(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="text-[13px] text-on-surface-variant block mb-1.5 pl-1">Phone</span>
        <input
          required
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          pattern="[+0-9 ()-]{6,20}"
          title="A phone number, digits only (spaces, +, - and brackets are fine)"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className={inputClass}
        />
      </label>

      {error && <p className="text-[13px] text-error pl-1">{error}</p>}

      <div className={`flex gap-2 pt-2 ${onCancel ? 'justify-end' : ''}`}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-12 px-6 rounded-full border border-outline-variant text-sm font-medium text-on-surface hover:bg-surface-container-low"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className={`${onCancel ? '' : 'w-full'} h-12 px-7 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50`}
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}
