import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, ChefHat, Copy, ExternalLink, QrCode, RotateCcw, X } from 'lucide-react';
import { KitchenLink, fetchKitchenLink, kitchenUrl } from '../lib/staffApi';

/**
 * Reception's handle on the kitchen's own screen (0082): the link to open
 * once on the kitchen's tablet or phone (copy it, or scan its QR), when
 * that screen was last open, and a reset for a lost or replaced device,
 * which switches the old link off at once.
 */
export function KitchenLinkBar({ propertyId, embedded = false }: { propertyId: string; /** Inside another card (Departments): no page padding around it. */ embedded?: boolean }) {
  const [link, setLink] = useState<KitchenLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    fetchKitchenLink(propertyId).then(setLink).catch(err => setError(err.message));
  }, [propertyId]);

  const url = link ? kitchenUrl(link.token) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy the kitchen link:', url);
    }
  };

  const showQr = async () => setQr(await QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#111111', light: '#ffffff' } }));

  const reset = async () => {
    setConfirmReset(false);
    try {
      setLink(await fetchKitchenLink(propertyId, true));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t reset the link.');
    }
  };

  const lastSeen = link?.lastUsedAt
    ? `Last open ${new Date(link.lastUsedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`
    : 'Not opened on any device yet';

  return (
    <div className={embedded ? '' : 'shrink-0 px-4 md:px-6 pt-1 pb-3'}>
      <div className="rounded-[24px] bg-surface-container-lowest border border-outline-variant p-3 pl-4 flex flex-wrap items-center gap-3">
        <span className="size-10 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0"><ChefHat className="size-5" /></span>
        <div className="flex-1 min-w-[180px]">
          <p className="text-sm font-semibold">Kitchen screen</p>
          <p className="text-xs text-on-surface-variant">{error ?? (link ? `Open this link once on the kitchen’s tablet or phone. ${lastSeen}.` : 'Loading…')}</p>
        </div>
        {link && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={copy} className="h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-medium inline-flex items-center gap-1.5">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy kitchen link'}
            </button>
            <button onClick={showQr} className="h-9 px-3.5 rounded-full bg-surface-container-low text-sm font-medium inline-flex items-center gap-1.5"><QrCode className="size-4" /> QR</button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="h-9 px-3.5 rounded-full bg-surface-container-low text-sm font-medium inline-flex items-center gap-1.5"><ExternalLink className="size-4" /> Open</a>
            {confirmReset ? (
              <span className="inline-flex items-center gap-1.5">
                <button onClick={reset} className="h-9 px-3.5 rounded-full bg-error text-on-error text-sm font-medium">Switch the old link off</button>
                <button onClick={() => setConfirmReset(false)} className="h-9 px-3 rounded-full text-sm text-on-surface-variant">Cancel</button>
              </span>
            ) : (
              <button onClick={() => setConfirmReset(true)} title="For a lost or replaced device" className="h-9 px-3.5 rounded-full bg-surface-container-low text-sm font-medium inline-flex items-center gap-1.5"><RotateCcw className="size-4" /> New link</button>
            )}
          </div>
        )}
      </div>

      {qr && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={() => setQr(null)}>
          <div className="bg-surface-container-lowest text-on-surface rounded-[28px] max-w-xs w-full p-6 text-center space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end -mt-2 -mr-2"><button onClick={() => setQr(null)} aria-label="Close" className="size-9 rounded-full hover:bg-surface-container-low flex items-center justify-center"><X className="size-5" /></button></div>
            <p className="font-semibold">Scan on the kitchen’s device</p>
            <img src={qr} alt="Kitchen screen link" className="size-56 mx-auto rounded-xl" />
            <p className="text-xs text-on-surface-variant">It opens the kitchen screen. Add it to the home screen there and it opens like an app.</p>
          </div>
        </div>
      )}
    </div>
  );
}
