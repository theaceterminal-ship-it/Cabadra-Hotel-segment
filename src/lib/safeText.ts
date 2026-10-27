/**
 * Text that came from a person (a guest's request, a name someone typed)
 * must be made safe before it goes anywhere that interprets it.
 */

/** For HTML we build by hand (print windows): & < > " ' all escaped, so text can never become markup or break out of an attribute. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * One CSV cell. A cell that starts with = + - @ (or a tab / carriage return) is
 * run as a formula by Excel and Sheets, so "=HYPERLINK(...)" typed into a name
 * would execute on whoever opens the export; a leading apostrophe makes it
 * plain text. Quotes, commas and line breaks are escaped as CSV requires.
 */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (rows: unknown[][]): string => rows.map(r => r.map(csvCell).join(',')).join('\n');
