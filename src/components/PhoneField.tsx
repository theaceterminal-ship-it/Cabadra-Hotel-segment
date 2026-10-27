import React, { useEffect, useState } from 'react';

/** Dial codes offered at reception. India first; the guest's own country is chosen, never guessed. */
export const COUNTRY_CODES: { dial: string; name: string }[] = [
  { dial: '+91', name: 'India' }, { dial: '+1', name: 'USA / Canada' }, { dial: '+44', name: 'United Kingdom' },
  { dial: '+61', name: 'Australia' }, { dial: '+64', name: 'New Zealand' }, { dial: '+65', name: 'Singapore' },
  { dial: '+971', name: 'UAE' }, { dial: '+966', name: 'Saudi Arabia' }, { dial: '+974', name: 'Qatar' },
  { dial: '+968', name: 'Oman' }, { dial: '+973', name: 'Bahrain' }, { dial: '+965', name: 'Kuwait' },
  { dial: '+977', name: 'Nepal' }, { dial: '+975', name: 'Bhutan' }, { dial: '+94', name: 'Sri Lanka' },
  { dial: '+880', name: 'Bangladesh' }, { dial: '+92', name: 'Pakistan' }, { dial: '+93', name: 'Afghanistan' },
  { dial: '+960', name: 'Maldives' }, { dial: '+66', name: 'Thailand' }, { dial: '+60', name: 'Malaysia' },
  { dial: '+62', name: 'Indonesia' }, { dial: '+63', name: 'Philippines' }, { dial: '+84', name: 'Vietnam' },
  { dial: '+81', name: 'Japan' }, { dial: '+82', name: 'South Korea' }, { dial: '+86', name: 'China' },
  { dial: '+852', name: 'Hong Kong' }, { dial: '+49', name: 'Germany' }, { dial: '+33', name: 'France' },
  { dial: '+39', name: 'Italy' }, { dial: '+34', name: 'Spain' }, { dial: '+31', name: 'Netherlands' },
  { dial: '+41', name: 'Switzerland' }, { dial: '+46', name: 'Sweden' }, { dial: '+7', name: 'Russia' },
  { dial: '+972', name: 'Israel' }, { dial: '+27', name: 'South Africa' }, { dial: '+254', name: 'Kenya' },
  { dial: '+20', name: 'Egypt' }, { dial: '+55', name: 'Brazil' }, { dial: '+52', name: 'Mexico' },
];

/** Splits "+919812345678" into its dial code and the rest (longest dial code wins). No code: India. */
export function splitPhone(value: string): { dial: string; national: string } {
  const v = value.replace(/[\s()-]/g, '');
  if (v.startsWith('+')) {
    const hit = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length).find(c => v.startsWith(c.dial));
    if (hit) return { dial: hit.dial, national: v.slice(hit.dial.length) };
    return { dial: '+91', national: v.slice(1) };
  }
  return { dial: '+91', national: v };
}

/** The number as stored: "+<dial><digits>", or '' when no digits were typed. */
export function joinPhone(dial: string, national: string): string {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `${dial}${digits}` : '';
}

const fieldCls = 'h-10 text-sm border border-outline-variant rounded-lg focus:border-primary focus:outline-none bg-surface-container-lowest';

/** A phone number with a country-code dropdown. onChange gets the full number ("+91…") or ''. */
export function PhoneField({ value, onChange, placeholder = '98765 43210' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const parsed = splitPhone(value);
  // The chosen country is kept here, because an empty number carries no country with it.
  const [dial, setDial] = useState(parsed.dial);
  useEffect(() => { if (value) setDial(splitPhone(value).dial); }, [value]);
  const national = value ? parsed.national : '';
  return (
    <div className="flex gap-1.5">
      <select
        value={dial}
        onChange={e => { setDial(e.target.value); onChange(joinPhone(e.target.value, national)); }}
        aria-label="Country code"
        className={`${fieldCls} w-[118px] shrink-0 px-1.5`}
      >
        {COUNTRY_CODES.map(c => <option key={c.dial + c.name} value={c.dial}>{c.dial} {c.name}</option>)}
      </select>
      <input
        type="tel"
        inputMode="tel"
        value={national}
        onChange={e => onChange(joinPhone(dial, e.target.value))}
        placeholder={placeholder}
        className={`${fieldCls} flex-1 min-w-0 px-3`}
      />
    </div>
  );
}
