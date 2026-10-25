import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Link2, Trash2, X } from 'lucide-react';
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
