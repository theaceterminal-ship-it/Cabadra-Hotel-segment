/**
 * Tourist-heavy places in Himachal Pradesh, grouped by district, for the
 * property City picker and the website's setup bar. Stored on the property
 * as "Place, District" (just "District" when they're the same town), so
 * properties can later be grouped by area, e.g. for local experiences.
 * Anything not listed is still allowed as free text.
 */
export const HIMACHAL_PLACES: { district: string; places: string[] }[] = [
  { district: 'Shimla', places: ['Shimla', 'Kufri', 'Mashobra', 'Naldehra', 'Narkanda', 'Fagu', 'Tattapani'] },
  { district: 'Solan', places: ['Kasauli', 'Chail', 'Barog', 'Solan', 'Dagshai'] },
  { district: 'Kullu', places: ['Manali', 'Solang', 'Kullu', 'Kasol', 'Manikaran', 'Tosh', 'Naggar', 'Jibhi', 'Tirthan Valley', 'Shoja'] },
  { district: 'Lahaul & Spiti', places: ['Sissu', 'Jispa', 'Keylong', 'Kaza', 'Tabo'] },
  { district: 'Kangra', places: ['Dharamshala', 'McLeod Ganj', 'Bir Billing', 'Palampur', 'Kangra'] },
  { district: 'Chamba', places: ['Dalhousie', 'Khajjiar', 'Chamba'] },
  { district: 'Kinnaur', places: ['Kalpa', 'Sangla', 'Chitkul', 'Reckong Peo'] },
  { district: 'Mandi', places: ['Barot', 'Mandi', 'Rewalsar', 'Prashar'] },
  { district: 'Sirmaur', places: ['Nahan', 'Paonta Sahib', 'Renuka Ji'] },
];

/** The value saved as the property's location for a listed place. */
export function placeValue(place: string, district: string): string {
  return place === district ? place : `${place}, ${district}`;
}

/** Every listed place's saved value, e.g. "Kufri, Shimla". */
export const HIMACHAL_PLACE_VALUES: string[] = HIMACHAL_PLACES.flatMap(g => g.places.map(p => placeValue(p, g.district)));

/**
 * Finds the listed value for free text such as "Kufri" or "kufri, shimla"
 * (what someone typed into the website's setup bar); null if it isn't one
 * of the listed places.
 */
export function matchHimachalPlace(text: string | undefined): string | null {
  const needle = (text ?? '').trim().toLowerCase();
  if (!needle) return null;
  for (const group of HIMACHAL_PLACES) {
    for (const place of group.places) {
      const value = placeValue(place, group.district);
      if (needle === value.toLowerCase() || needle === place.toLowerCase()) return value;
    }
  }
  return null;
}
