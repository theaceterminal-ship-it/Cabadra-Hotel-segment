import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Link2, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { uploadImageToCloudinary, isCloudinaryConfigured } from '../../lib/cloudinary';

/**
 * Building blocks for the property page (PropertyDetailPage and its tabs).
 * One look throughout, matching the website theme the owner side wears:
 * soft white panels, pill buttons, and forms that only appear in a modal
 * when the owner asks for them, never permanently open above a list.
 */

export const btnPrimary =
  'h-10 px-4 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap';
export const btnSecondary =
  'h-10 px-4 rounded-full border border-outline-variant bg-surface-container-lowest text-sm font-medium text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap';
export const iconBtn =
  'size-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors';

export const inputCls =
  'w-full h-11 px-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-on-surface focus:outline-none transition-colors';
export const textareaCls =
  'w-full min-h-[88px] px-4 py-3 rounded-xl border border-outline-variant bg-surface-container-lowest text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-on-surface focus:outline-none transition-colors resize-y';

export function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[24px] bg-surface-container-lowest border border-outline-variant p-5 sm:p-6 ${className}`}>{children}</section>;
}

/** Title + one line of context on the left, the tab's actions on the right. */
export function SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-on-surface">{title}</h2>
        {description && <p className="text-sm text-on-surface-variant mt-1 max-w-xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-outline-variant px-6 py-12 text-center">
      <span className="mx-auto size-12 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 text-base font-medium text-on-surface">{title}</p>
      <p className="mt-1 text-sm text-on-surface-variant max-w-sm mx-auto">{body}</p>
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="rounded-2xl bg-error-container text-on-error-container text-sm px-4 py-3">{children}</p>;
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[13px] text-on-surface-variant mb-1.5 pl-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-on-surface-variant mt-1.5 pl-1">{hint}</span>}
    </label>
  );
}

/** A real switch: fixed track, knob anchored left and slid by a known distance. */
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${checked ? 'bg-primary' : 'bg-surface-container-highest'}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

/** Delete that asks once: the first tap turns it into "Delete?", the second deletes. Resets after a few seconds. */
export function DeleteButton({ onDelete, label = 'Delete' }: { onDelete: () => Promise<void> | void; label?: string }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  if (armed) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={async e => {
          e.stopPropagation();
          setBusy(true);
          try {
            await onDelete();
          } finally {
            setBusy(false);
            setArmed(false);
          }
        }}
        className="h-9 px-3 rounded-full bg-error text-on-error text-xs font-medium disabled:opacity-60"
      >
        {busy ? 'Deleting…' : `${label}?`}
      </button>
    );
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={e => {
        e.stopPropagation();
        setArmed(true);
      }}
      className={`${iconBtn} hover:text-error`}
    >
      <Trash2 className="size-4" />
    </button>
  );
}

/**
 * Centred dialog on desktop, bottom sheet on phones. Closes on Escape or a
 * click outside. The footer holds the form's buttons so they stay visible
 * while a long form scrolls.
 */
export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  onSubmit,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** When set, the body and footer are one form and the footer's submit button submits it. */
  onSubmit?: (e: React.FormEvent) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const Body = onSubmit ? 'form' : 'div';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-4"
      onMouseDown={e => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <Body
        {...(onSubmit ? { onSubmit } : {})}
        className="w-full sm:max-w-lg max-h-[92svh] flex flex-col bg-surface-container-lowest text-on-surface rounded-t-[28px] sm:rounded-[28px] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold tracking-[-0.01em]">{title}</h3>
            {description && <p className="text-sm text-on-surface-variant mt-1">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className={`${iconBtn} -mr-2 -mt-1`} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="px-6 pb-2 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-6 py-4 mt-2 border-t border-outline-variant flex justify-end gap-2">{footer}</div>}
      </Body>
    </div>
  );
}

/**
 * Bigger photo picker for the property page: a preview tile, an upload
 * button, and "paste a link" tucked behind a small toggle. (Reception's
 * check-in forms keep the compact ImageUploadField.)
 */
export function PhotoField({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(!isCloudinaryConfigured);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      onChange(await uploadImageToCloudinary(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <span className="block text-[13px] text-on-surface-variant mb-1.5 pl-1">{label}</span>
      <div className="flex items-center gap-3">
        <div className="size-20 shrink-0 rounded-2xl overflow-hidden bg-surface-container border border-outline-variant flex items-center justify-center text-on-surface-variant">
          {value ? <img src={value} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6 opacity-60" />}
        </div>
        <div className="flex flex-wrap gap-2">
          {isCloudinaryConfigured && (
            <>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={btnSecondary}>
                {uploading ? 'Uploading…' : value ? 'Replace photo' : 'Upload photo'}
              </button>
            </>
          )}
          {value && (
            <button type="button" onClick={() => onChange('')} className={`${btnSecondary} text-error`}>
              Remove
            </button>
          )}
          {isCloudinaryConfigured && !showUrl && (
            <button type="button" onClick={() => setShowUrl(true)} className="h-10 px-2 text-sm text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1">
              <Link2 className="size-4" /> Paste a link
            </button>
          )}
        </div>
      </div>
      {showUrl && (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="https://…" className={`${inputCls} mt-3`} />
      )}
      {error && <p className="text-xs text-error mt-1.5 pl-1">{error}</p>}
    </div>
  );
}

/** Small rounded label, e.g. a department or "Veg". */
export function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const tones = {
    neutral: 'bg-surface-container text-on-surface-variant',
    good: 'bg-[#e6f2df] text-[#2f6b1a]',
    warn: 'bg-[#fbeedd] text-[#8a5a14]',
    bad: 'bg-error-container text-on-error-container',
  };
  return <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

/** Shared CSV import dialog for Rooms and Menu. */
export function CsvImportModal({
  title,
  description,
  onDownloadTemplate,
  onFile,
  importing,
  result,
  error,
  onClose,
}: {
  title: string;
  description: string;
  onDownloadTemplate: () => void;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importing: boolean;
  result: string | null;
  error: string | null;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnSecondary}>{result ? 'Done' : 'Cancel'}</button>
          <input ref={fileRef} type="file" accept=".csv" onChange={onFile} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={importing} className={btnPrimary}>
            {importing ? 'Importing…' : 'Choose CSV file'}
          </button>
        </>
      }
    >
      <ol className="space-y-3 text-sm text-on-surface">
        <li className="flex gap-3">
          <span className="size-6 shrink-0 rounded-full bg-surface-container flex items-center justify-center text-xs font-medium">1</span>
          <span>
            Download the template and fill it in.{' '}
            <button type="button" onClick={onDownloadTemplate} className="font-medium underline underline-offset-2">Download template</button>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="size-6 shrink-0 rounded-full bg-surface-container flex items-center justify-center text-xs font-medium">2</span>
          <span>Choose the file. Everything in it is added at once.</span>
        </li>
      </ol>
      {result && <p className="rounded-2xl bg-[#e6f2df] text-[#2f6b1a] text-sm px-4 py-3">{result}</p>}
      <ErrorNote>{error}</ErrorNote>
    </Modal>
  );
}

/** Starts a CSV download in the browser. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * A dropdown of choices that never turns into a bare text box: the list is
 * the built-in options plus whatever this property already uses (so an
 * existing room's own type is always in it), with "Add a new…" at the end
 * for typing one in.
 */
export function ChoiceField({
  options,
  value,
  onChange,
  placeholder = 'Choose',
  newLabel = 'Add a new one…',
  optional = false,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  newLabel?: string;
  /** Lets the owner pick "Not set" to clear it. */
  optional?: boolean;
}) {
  const all = [...new Set([...options, ...(value.trim() ? [value.trim()] : [])].map(o => o.trim()).filter(Boolean))];
  const [typing, setTyping] = useState(false);

  if (typing) {
    return (
      <div className="flex gap-2">
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={inputCls} autoFocus />
        <button
          type="button"
          onClick={() => { setTyping(false); if (!value.trim() && !optional) onChange(all[0] ?? ''); }}
          className={`${btnSecondary} shrink-0`}
        >
          List
        </button>
      </div>
    );
  }

  return (
    <select
      value={value.trim()}
      onChange={e => {
        if (e.target.value === '__new__') {
          setTyping(true);
          onChange('');
        } else onChange(e.target.value);
      }}
      className={inputCls}
    >
      <option value="" disabled={!optional}>{optional ? 'Not set' : placeholder}</option>
      {all.map(o => <option key={o} value={o}>{o}</option>)}
      <option value="__new__">{newLabel}</option>
    </select>
  );
}

export interface FilterGroup {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}

/**
 * Search box plus a Filter button. The button shows how many filters are
 * on; its panel lists one row of choices per group, and active filters
 * also appear as removable chips under the bar.
 */
export function SearchFilterBar({
  query,
  onQuery,
  placeholder,
  groups,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder: string;
  groups: FilterGroup[];
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const active = groups.filter(g => g.value !== '');

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="mb-5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="size-4 text-on-surface-variant absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full h-11 pl-11 pr-4 rounded-full border border-outline-variant bg-surface-container-lowest text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-on-surface focus:outline-none transition-colors"
          />
        </div>
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className={`h-11 px-4 rounded-full border text-sm font-medium inline-flex items-center gap-2 transition-colors ${
              active.length ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:bg-surface-container-low'
            }`}
          >
            <SlidersHorizontal className="size-4" />
            <span className="hidden sm:inline">Filter</span>
            {active.length > 0 && <span className="text-xs">{active.length}</span>}
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-2 z-40 w-[min(320px,calc(100vw-2rem))] rounded-[20px] bg-surface-container-lowest border border-outline-variant shadow-xl p-4 space-y-4">
              {groups.map(g => (
                <div key={g.id}>
                  <p className="text-xs text-on-surface-variant mb-2">{g.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[{ value: '', label: 'Any' }, ...g.options].map(o => (
                      <button
                        key={o.value || 'any'}
                        type="button"
                        onClick={() => g.onChange(o.value)}
                        className={`h-8 px-3 rounded-full text-[13px] transition-colors ${
                          g.value === o.value ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {active.length > 0 && (
                <button type="button" onClick={() => active.forEach(g => g.onChange(''))} className="text-sm text-on-surface-variant underline underline-offset-2">
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {active.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {active.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => g.onChange('')}
              className="h-8 pl-3 pr-2 rounded-full bg-surface-container text-[13px] text-on-surface inline-flex items-center gap-1.5 hover:bg-surface-container-high"
            >
              {g.label}: {g.options.find(o => o.value === g.value)?.label ?? g.value}
              <X className="size-3.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
