import Papa from 'papaparse';
import JSZip from 'jszip';
import type { MenuItem, MenuOption } from '../types';
import { uploadImageToCloudinary, isCloudinaryConfigured } from './cloudinary';

/**
 * Menu import for the property page. Reads Cabadra's own template and
 * Churmuri's menu export as-is (same column aliases as Churmuri's
 * lib/menu-import.js, so a Churmuri CSV or zip imports without editing),
 * including sizes and add-ons written in one cell:
 *   Variations: "Small:220|Medium:320|Large:420"
 *   Addons:     "Extra Cheese:40|Olives:30"
 * A .zip may hold menu.csv plus photos; an ImageFile column (or a photo
 * named after the dish) links each row to its photo, which is uploaded.
 */

export type ImportedItem = Omit<MenuItem, 'id'> & { imageFile?: string };

export interface ImportPreview {
  items: ImportedItem[];
  skipped: { row: number; reason: string }[];
  /** Photos found in a zip, by lower-case file name. */
  images: Map<string, JSZip.JSZipObject>;
}

/** "₹ 1,250/-" → 1250; null when there's no usable positive number. */
function cleanPrice(raw: unknown): number | null {
  const s = String(raw ?? '').replace(/[^0-9.]/g, '');
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function truthy(v: unknown) {
  return ['true', 'yes', 'y', '1'].includes(String(v ?? '').trim().toLowerCase());
}

/** "Small:220|Medium:320" (or a JSON array of {name, price}) → options. Bad entries are dropped, not fatal. */
export function parseOptions(raw: unknown, prefix: 'var' | 'add'): MenuOption[] {
  if (!raw) return [];
  const parts: { name: string; price: unknown }[] = Array.isArray(raw)
    ? raw.map(r => ({ name: String(r?.name ?? r?.Name ?? ''), price: r?.price ?? r?.Price }))
    : String(raw).split('|').map(part => {
        const sep = part.indexOf(':');
        return { name: sep === -1 ? part : part.slice(0, sep), price: sep === -1 ? '' : part.slice(sep + 1) };
      });
  return parts
    .map((p, i) => {
      const name = p.name.trim();
      const price = cleanPrice(p.price);
      return name && price !== null ? { id: `${prefix}${i}`, name, price } : null;
    })
    .filter((o): o is MenuOption => o !== null);
}

/** "Small:220|Medium:320" for the template and the editor's round trip. */
export function formatOptions(options: MenuOption[] | undefined): string {
  return (options ?? []).map(o => `${o.name}:${o.price}`).join('|');
}

function rowsToItems(rows: Record<string, unknown>[]): Pick<ImportPreview, 'items' | 'skipped'> {
  const items: ImportedItem[] = [];
  const skipped: ImportPreview['skipped'] = [];

  rows.forEach((raw, i) => {
    // Header names vary between tools; compare them lower-cased and without spaces/underscores.
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) row[k.toLowerCase().replace(/[\s_-]/g, '')] = v;
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = row[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
      return '';
    };

    const line = i + 2; // header is line 1
    const name = get('name', 'item', 'itemname', 'dish');
    if (!name) {
      skipped.push({ row: line, reason: 'no name' });
      return;
    }
    const variations = parseOptions(row.variations ?? row.sizes, 'var');
    const addons = parseOptions(row.addons ?? row.addon, 'add');
    // With sizes, the dish's own price is its cheapest size (shown as "from ₹…").
    const price = cleanPrice(get('price', 'amount', 'rate', 'cost', 'priceinr')) ?? (variations.length ? Math.min(...variations.map(v => v.price)) : null);
    if (price === null) {
      skipped.push({ row: line, reason: `${name}: no usable price` });
      return;
    }
    const foodType = get('foodtype', 'type', 'veg', 'isveg').toLowerCase();
    const isVeg = foodType === '' ? true : foodType.startsWith('non') ? false : foodType === 'false' || foodType === 'no' ? false : true;
    const eta = get('etaminutes', 'eta', 'preptime', 'prep');
    const prepTime = eta ? (/^\d+$/.test(eta) ? `${eta} mins` : eta) : undefined;
    const tags = [truthy(get('chefspecial', 'chef')) && 'chef-special', truthy(get('featured')) && 'featured'].filter(Boolean) as string[];

    items.push({
      name,
      category: get('category', 'section', 'group') || 'Other',
      price,
      description: get('description', 'desc', 'details'),
      image: get('imageurl', 'image', 'photo'),
      imageFile: get('imagefile') || undefined,
      isVeg,
      tags,
      prepTime,
      variations,
      addons,
    });
  });

  return { items, skipped };
}

/** Reads a .csv, .json or .zip (menu.csv + photos) file into a preview. Throws with a message to show. */
export async function readMenuFile(file: File): Promise<ImportPreview> {
  const lower = file.name.toLowerCase();
  let text: string;
  const images = new Map<string, JSZip.JSZipObject>();

  if (lower.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file);
    let csv: JSZip.JSZipObject | null = null;
    zip.forEach((path, entry) => {
      if (entry.dir || path.startsWith('__MACOSX/')) return;
      const name = path.split('/').pop()!.toLowerCase();
      if (name.endsWith('.csv') && !csv) csv = entry;
      else if (/\.(jpe?g|png|webp|gif)$/.test(name)) images.set(name, entry);
    });
    if (!csv) throw new Error('No .csv file found inside the zip. Put menu.csv in it, next to the photos.');
    text = await (csv as JSZip.JSZipObject).async('string');
  } else {
    text = await file.text();
  }

  if (lower.endsWith('.json')) {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed?.items;
    if (!Array.isArray(rows)) throw new Error('The JSON must be a list of dishes, or an object with an "items" list.');
    return { ...rowsToItems(rows), images };
  }

  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (!result.meta.fields?.length) throw new Error('No header row found. The first line should name the columns (Name, Price, Category…).');
  return { ...rowsToItems(result.data), images };
}

/** Finds a dish's photo in the zip: its ImageFile, else a photo named after the dish. Case and extension don't matter. */
function findPhoto(item: ImportedItem, images: Map<string, JSZip.JSZipObject>): JSZip.JSZipObject | null {
  const stem = (s: string) => s.split('/').pop()!.toLowerCase().replace(/\.[a-z0-9]+$/, '');
  const wanted = [item.imageFile, item.name].filter(Boolean).map(s => stem(s!));
  for (const [name, entry] of images) {
    const s = stem(name);
    if (wanted.includes(s) || wanted.includes(s.replace(/[-_]+/g, ' '))) return entry;
  }
  return null;
}

/**
 * Uploads each dish's zip photo (5 at a time) and returns the items ready
 * to save. A photo that fails to upload just leaves that dish without one.
 */
export async function attachZipPhotos(
  preview: ImportPreview,
  onProgress?: (done: number, total: number) => void,
): Promise<Omit<MenuItem, 'id'>[]> {
  const items = preview.items.map(({ imageFile: _imageFile, ...rest }) => ({ ...rest }));
  if (preview.images.size === 0 || !isCloudinaryConfigured) return items;

  const jobs = preview.items
    .map((item, i) => ({ i, entry: item.image ? null : findPhoto(item, preview.images) }))
    .filter((j): j is { i: number; entry: JSZip.JSZipObject } => j.entry !== null);

  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const blob = await job.entry.async('blob');
        const fileName = job.entry.name.split('/').pop()!;
        items[job.i].image = await uploadImageToCloudinary(new File([blob], fileName, { type: blob.type || 'image/jpeg' }));
      } catch {
        // Leave this dish without a photo; the rest still import.
      }
      onProgress?.(++done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, worker));
  return items;
}

/** Template in the same column layout as Churmuri's export. */
export const MENU_TEMPLATE_CSV =
  'Name,Price,Category,Description,FoodType,ImageUrl,ImageFile,Variations,Addons,ETA\n' +
  'Paneer Tikka,320,Starters,Char-grilled cottage cheese,veg,,,,"Extra Mint Chutney:20",18\n' +
  'Margherita Pizza,,Mains,Classic tomato and mozzarella,veg,,margherita.jpg,"Small:220|Medium:320|Large:420","Extra Cheese:40|Olives:30",20\n' +
  'Chicken Momos,260,Starters,Steamed with chilli chutney,nonveg,,,"6 pcs:180|10 pcs:260",,15\n';
