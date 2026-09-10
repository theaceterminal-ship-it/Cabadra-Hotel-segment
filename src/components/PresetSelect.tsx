import React, { useState, useEffect } from 'react';

interface PresetSelectProps {
  presets: string[];
  value: string;
  onChange: (v: string) => void;
  className: string;
  placeholder?: string;
}

const CUSTOM = '__custom__';

/**
 * "Pick from a list, or type your own" — the pattern this file exists to
 * spare a blank owner from staring at a bare text box with zero guidance
 * (room type, experience name, service name all used to be exactly that).
 * A select of common options plus "Other" at the end; picking "Other"
 * reveals a plain text input right underneath. Editing an existing row
 * whose value isn't in the preset list starts in custom mode automatically,
 * so their own wording is never silently overwritten by "Other".
 */
export function PresetSelect({ presets, value, onChange, className, placeholder }: PresetSelectProps) {
  const [customMode, setCustomMode] = useState(() => value !== '' && !presets.includes(value));

  useEffect(() => {
    if (value !== '' && !presets.includes(value)) setCustomMode(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (customMode) {
    return (
      <div className="space-y-1">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={className}
          autoFocus
        />
        <button
          type="button"
          onClick={() => { setCustomMode(false); onChange(''); }}
          className="text-[10px] font-semibold text-[#765a25] hover:underline"
        >
          Pick from list instead
        </button>
      </div>
    );
  }

  return (
    <select
      value={presets.includes(value) ? value : ''}
      onChange={e => {
        if (e.target.value === CUSTOM) { setCustomMode(true); onChange(''); }
        else onChange(e.target.value);
      }}
      className={`${className} bg-white`}
    >
      <option value="" disabled>Select…</option>
      {presets.map(p => <option key={p} value={p}>{p}</option>)}
      <option value={CUSTOM}>Other — type my own</option>
    </select>
  );
}
