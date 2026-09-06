/**
 * Country selection at property setup, and the currency formatting every
 * money value in the app should go through instead of a hardcoded '$'.
 * Formatting itself is delegated to Intl.NumberFormat — it already knows
 * the correct symbol, decimal places, and placement for any real currency
 * code, so there's no hand-maintained symbol table to keep in sync.
 */

export interface CountryOption {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  currency: string; // ISO 4217
}

// Not exhaustive — covers the markets this app is realistically deployed
// in today. Add a row here for any country a real customer needs; nothing
// else has to change (formatCurrency works for any valid ISO 4217 code).
export const COUNTRIES: CountryOption[] = [
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'ES', name: 'Spain', currency: 'EUR' },
  { code: 'IT', name: 'Italy', currency: 'EUR' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR' },
  { code: 'IE', name: 'Ireland', currency: 'EUR' },
  { code: 'JP', name: 'Japan', currency: 'JPY' },
  { code: 'CN', name: 'China', currency: 'CNY' },
  { code: 'HK', name: 'Hong Kong', currency: 'HKD' },
  { code: 'TH', name: 'Thailand', currency: 'THB' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR' },
  { code: 'PH', name: 'Philippines', currency: 'PHP' },
  { code: 'VN', name: 'Vietnam', currency: 'VND' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN' },
  { code: 'EG', name: 'Egypt', currency: 'EGP' },
  { code: 'BR', name: 'Brazil', currency: 'BRL' },
  { code: 'MX', name: 'Mexico', currency: 'MXN' },
  { code: 'AR', name: 'Argentina', currency: 'ARS' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD' },
  { code: 'CH', name: 'Switzerland', currency: 'CHF' },
  { code: 'SE', name: 'Sweden', currency: 'SEK' },
  { code: 'NO', name: 'Norway', currency: 'NOK' },
  { code: 'TR', name: 'Turkey', currency: 'TRY' },
  { code: 'QA', name: 'Qatar', currency: 'QAR' },
  { code: 'KW', name: 'Kuwait', currency: 'KWD' },
  { code: 'LK', name: 'Sri Lanka', currency: 'LKR' },
  { code: 'NP', name: 'Nepal', currency: 'NPR' },
  { code: 'PK', name: 'Pakistan', currency: 'PKR' },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT' },
  { code: 'KR', name: 'South Korea', currency: 'KRW' },
  { code: 'MV', name: 'Maldives', currency: 'MVR' },
];

export function currencyForCountry(countryCode: string): string {
  return COUNTRIES.find(c => c.code === countryCode)?.currency ?? 'USD';
}

const formatterCache = new Map<string, Intl.NumberFormat>();

/** Formats a plain number in a given ISO 4217 currency, e.g. formatCurrency(1234.5, 'INR') -> "₹1,234.50". Falls back to USD for an unset/unrecognized currency so old properties (created before currency support) don't crash. */
export function formatCurrency(amount: number, currencyCode?: string | null): string {
  const code = currencyCode && currencyCode.length === 3 ? currencyCode : 'USD';
  let formatter = formatterCache.get(code);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: code });
    } catch {
      formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
    }
    formatterCache.set(code, formatter);
  }
  return formatter.format(amount);
}
