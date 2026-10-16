import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Copy, Check, Printer, X } from 'lucide-react';
import { DepartmentDisplayAdmin } from '../lib/staffApi';

const DEPT_LABELS: Record<DepartmentDisplayAdmin['department'], string> = {
  housekeeping: 'Housekeeping', maintenance: 'Maintenance', amenities: 'Amenities', concierge: 'Concierge',
};

interface DisplayQrModalProps {
  display: DepartmentDisplayAdmin;
  onClose: () => void;
}

/**
 * What gets taped to the housekeeping tablet (or whatever device will stay
 * open on /display/:token for a whole shift) to re-open it if it's ever
 * closed. A URL, same shape as RoomQrModal/TaskQrModal — unlike
 * BadgeQrModal, this one IS meant to be opened as a page, not typed by a
 * keyboard-wedge scanner.
 */
export function DisplayQrModal({ display, onClose }: DisplayQrModalProps) {
  const url = `${window.location.origin}/display/${display.token}`;
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#141d23', light: '#ffffff' } })
      .then(d => { if (!cancelled) setQrDataUrl(d); });
    return () => { cancelled = true; };
  }, [url]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // URL is still shown/selectable below either way.
    }
  };

  const handlePrint = () => {
    if (!qrDataUrl) return;
    const win = window.open('', '_blank', 'width=420,height=560');
    if (!win) return;
    win.document.write(`
      <html><head><title>Display — ${display.label}</title>
        <style>
          body { text-align: center; font-family: sans-serif; margin-top: 40px; color: #141d23; }
          h2 { font-size: 20px; margin-bottom: 4px; }
          p { font-size: 13px; color: #7f7668; margin: 2px 0; }
          .qr-wrap { background: white; padding: 20px; border-radius: 16px; display: inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #E9ECEF; margin-top: 16px; }
          img { width: 240px; height: 240px; display: block; }
        </style>
      </head><body>
        <h2>${display.label}</h2>
        <p>${DEPT_LABELS[display.department]}</p>
        <p>Scan to re-open this display</p>
        <div class="qr-wrap"><img src="${qrDataUrl}" /></div>
        <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-[70]">
      <div className="bg-surface-container-lowest rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant space-y-4 text-center">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold text-on-surface">Display QR</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
        </div>

        <div className="text-left bg-surface-container-low border border-outline-variant rounded-lg p-3">
          <p className="text-sm font-bold text-on-surface">{display.label}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">{DEPT_LABELS[display.department]}</p>
        </div>

        <p className="text-xs text-on-surface-variant">
          Open this on the tablet that'll stay on this department's queue for the shift, or scan it to re-open after a restart.
        </p>

        <div className="flex justify-center py-2">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR code for ${display.label}`} className="w-48 h-48 rounded-lg border border-outline-variant" />
          ) : (
            <div className="w-48 h-48 rounded-lg border border-outline-variant bg-surface-container-low animate-pulse" />
          )}
        </div>

        <p className="text-[11px] text-on-surface-variant truncate px-2">{url}</p>

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 h-10 rounded-lg border border-outline-variant text-on-surface-variant text-xs font-bold hover:bg-surface-container-low flex items-center justify-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Link'}
          </button>
          <button
            onClick={handlePrint}
            disabled={!qrDataUrl}
            className="flex-1 h-10 rounded-lg bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>
    </div>
  );
}
