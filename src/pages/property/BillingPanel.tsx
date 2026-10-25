import React, { useEffect, useState } from 'react';
import { Check, Receipt } from 'lucide-react';
import { BillingSettings, fetchBillingSettings, saveBillingSettings } from '../../lib/staffApi';
import { ErrorNote, Field, Panel, Switch, btnPrimary, inputCls } from './ui';

/**
 * What goes on this property's bills (0079): the business details printed
 * at the top, GST on or off with its rates, and the bill number prefix.
 * Rates default to the current Indian slabs (rooms up to ₹7,500 a night 5%,
 * above that 18%; food 5%; other services 18%) and are the owner's to
 * change: their CA has the last word. Prices are entered before tax.
 */
export function BillingPanel({ propertyId }: { propertyId: string }) {
  const [form, setForm] = useState<BillingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBillingSettings(propertyId).then(setForm).catch(err => setError(err.message));
  }, [propertyId]);

  if (!form) return error ? <ErrorNote>{error}</ErrorNote> : null;

  const set = <K extends keyof BillingSettings>(key: K, value: BillingSettings[K]) => {
    setSaved(false);
    setForm(f => (f ? { ...f, [key]: value } : f));
  };
  const num = (key: 'roomLowRate' | 'roomHighRate' | 'roomThreshold' | 'foodRate' | 'otherRate') => (
    <input type="number" min={0} step="0.5" value={form[key]} onChange={e => set(key, Number(e.target.value))} className={inputCls} />
  );

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveBillingSettings(propertyId, { ...form, gstin: form.gstin.trim().toUpperCase(), invoicePrefix: form.invoicePrefix.trim().toUpperCase() });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <form onSubmit={save} className="space-y-5">
        <div className="flex items-start gap-4">
          <span className="size-11 shrink-0 rounded-full bg-surface flex items-center justify-center text-on-surface"><Receipt className="size-5" /></span>
          <div>
            <h3 className="text-base font-semibold tracking-[-0.01em] text-on-surface">Bills &amp; GST</h3>
            <p className="text-sm text-on-surface-variant mt-1 max-w-xl">What’s printed on every bill. Bills are numbered at check-out, one series per financial year.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Business name on the bill" hint="Your registered name, if different from the hotel’s.">
            <input value={form.legalName} onChange={e => set('legalName', e.target.value)} placeholder="Ace Hospitality LLP" className={inputCls} />
          </Field>
          <Field label="Bill number prefix" hint={`Bills read ${form.invoicePrefix.toUpperCase() || 'INV'}/25-26/0001.`}>
            <input value={form.invoicePrefix} onChange={e => set('invoicePrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))} className={inputCls} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} className={`${inputCls} h-auto py-3`} />
          </Field>
          <Field label="Phone"><input value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} /></Field>
        </div>

        <div className="rounded-[20px] bg-surface-container-low p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-on-surface">Charge GST</p>
              <p className="text-xs text-on-surface-variant mt-0.5">Only if you’re GST registered. Applies to charges posted from now on; bills already issued don’t change.</p>
            </div>
            <Switch checked={form.gstEnabled} onChange={v => set('gstEnabled', v)} label="Charge GST" />
          </div>
          <Field label="GSTIN">
            <input value={form.gstin} onChange={e => set('gstin', e.target.value.toUpperCase().slice(0, 15))} placeholder="02ABCDE1234F1Z5" className={`${inputCls} font-mono`} />
          </Field>
          {form.gstEnabled && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Rooms up to (₹/night)">{num('roomThreshold')}</Field>
              <Field label="…at GST %">{num('roomLowRate')}</Field>
              <Field label="Rooms above, GST %">{num('roomHighRate')}</Field>
              <Field label="Food GST %">{num('foodRate')}</Field>
              <Field label="Other services GST %">{num('otherRate')}</Field>
            </div>
          )}
          {form.gstEnabled && <p className="text-xs text-on-surface-variant">These are the usual rates; confirm them with your CA. The tax is split equally into CGST and SGST on the bill.</p>}
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-success inline-flex items-center gap-1"><Check className="size-4" /> Saved</span>}
          <button disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Panel>
  );
}
