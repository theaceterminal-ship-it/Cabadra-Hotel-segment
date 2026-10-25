import React, { useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import { fetchPartnerSettings, savePartnerSettings, PartnerSettings } from '../../lib/staffApi';
import { ErrorNote, Panel, Switch } from './ui';

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'restaurant', label: 'Restaurants' },
  { id: 'cafe', label: 'Cafés' },
  { id: 'taxi', label: 'Taxis' },
  { id: 'tours', label: 'Tours' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'spa', label: 'Spas' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'other', label: 'Other' },
];

/**
 * The owner's say over "Around {place}" in the guest app: local businesses
 * Cabadra lists near this property (0078). Off entirely, or by category.
 * Restaurants and cafés start blocked so guests aren't sent away from the
 * hotel's own dining. Saves on every change.
 */
export function PartnerSettingsPanel({ propertyId }: { propertyId: string }) {
  const [settings, setSettings] = useState<PartnerSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPartnerSettings(propertyId).then(setSettings).catch(err => setError(err.message));
  }, [propertyId]);

  const save = async (enabled: boolean, blocked: string[]) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, enabled, blocked });
    setSaving(true);
    setError(null);
    try {
      await savePartnerSettings(propertyId, enabled, blocked);
      setSettings(await fetchPartnerSettings(propertyId));
    } catch (err) {
      setSettings(previous);
      setError(err instanceof Error ? err.message : 'Couldn’t save that.');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return error ? <ErrorNote>{error}</ErrorNote> : null;

  const toggleCategory = (id: string) => {
    const blocked = settings.blocked.includes(id) ? settings.blocked.filter(c => c !== id) : [...settings.blocked, id];
    save(settings.enabled, blocked);
  };

  return (
    <Panel className="mt-8">
      <div className="flex items-start gap-4">
        <span className="size-11 shrink-0 rounded-full bg-surface flex items-center justify-center text-on-surface"><Store className="size-5" /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold tracking-[-0.01em] text-on-surface">Local partners</h3>
              <p className="text-sm text-on-surface-variant mt-1 max-w-xl">
                Nearby businesses Cabadra lists for your guests, in an “Around here” row below your own experiences. Guests contact them directly; it costs you nothing.
              </p>
            </div>
            <Switch checked={settings.enabled} onChange={v => save(v, settings.blocked)} disabled={saving} label="Show local partners to guests" />
          </div>

          {settings.enabled && (
            <>
              <p className="text-sm font-medium text-on-surface mt-5">Show these kinds of business</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORIES.map(c => {
                  const shown = !settings.blocked.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={saving}
                      aria-pressed={shown}
                      onClick={() => toggleCategory(c.id)}
                      className={`h-9 px-4 rounded-full text-sm font-medium transition-colors disabled:opacity-60 ${shown ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant line-through decoration-1'}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[13px] text-on-surface-variant mt-3">
                {settings.liveCount === 0 ? 'No partners near you yet.' : `${settings.liveCount} ${settings.liveCount === 1 ? 'partner is' : 'partners are'} showing to your guests now.`}
                {' '}Restaurants and cafés start off so guests aren’t sent away from your own dining.
              </p>
            </>
          )}
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
        </div>
      </div>
    </Panel>
  );
}
