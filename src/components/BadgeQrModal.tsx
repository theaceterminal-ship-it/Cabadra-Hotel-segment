import React, { useEffect, useState } from 'react';
import { escapeHtml } from '../lib/safeText';
import QRCode from 'qrcode';
import { QrCode, RefreshCw, Printer, X } from 'lucide-react';
import { DirectoryContact, regenerateBadgeToken } from '../lib/staffApi';

interface BadgeQrModalProps {
  contact: DirectoryContact;
  onClose: () => void;
  onRegenerated: () => void;
}

/**
 * A staff member's own Shift Claims badge. Deliberately NOT a URL like
 * every other QR in this app (RoomQrModal, TaskQrModal) — this one is
 * meant for a USB/Bluetooth scanner acting as a keyboard on a shared
 * department-display tablet, which types out exactly what's encoded. The
 * QR's payload is the raw badgeToken, so scanning it drops that token
 * straight into the display's scan field (see DepartmentDisplayPage).
 */
export function BadgeQrModal({ contact, onClose, onRegenerated }: BadgeQrModalProps) {
  const [token, setToken] = useState(contact.badgeToken);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    QRCode.toDataURL(token, { width: 320, margin: 2, color: { dark: '#141d23', light: '#ffffff' } })
      .then(d => { if (!cancelled) setQrDataUrl(d); });
    return () => { cancelled = true; };
  }, [token]);

  const handleRegenerate = async () => {
    if (!window.confirm(`This replaces ${contact.name}'s badge — their old QR stops working immediately. Continue?`)) return;
    setRegenerating(true);
    try {
      const newToken = await regenerateBadgeToken(contact.id);
      setToken(newToken);
      onRegenerated();
    } catch {
      // The old badge keeps working either way — nothing to roll back.
    } finally {
      setRegenerating(false);
    }
  };

  const handlePrint = () => {
    if (!qrDataUrl) return;
    const win = window.open('', '_blank', 'width=420,height=560');
    if (!win) return;
    win.document.write(`
      <html><head><title>Badge — ${escapeHtml(contact.name)}</title>
        <style>
          body { text-align: center; font-family: sans-serif; margin-top: 40px; color: #141d23; }
          h2 { font-size: 20px; margin-bottom: 4px; }
          p { font-size: 13px; color: #7f7668; margin: 2px 0; }
          .qr-wrap { background: white; padding: 20px; border-radius: 16px; display: inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #E9ECEF; margin-top: 16px; }
          img { width: 240px; height: 240px; display: block; }
        </style>
      </head><body>
        <h2>${escapeHtml(contact.name)}</h2>
        <p>Scan at a department display to clock in or out</p>
        <div class="qr-wrap"><img src="${qrDataUrl}" /></div>
      </body></html>
    `);
    win.document.close();
    // Printing is triggered from here, not by a script inside the page, so the site can forbid inline scripts.
    setTimeout(() => { win.focus(); win.print(); }, 400);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-[70]">
      <div className="bg-surface-container-lowest rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant space-y-4 text-center">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-on-surface">{contact.name}'s Badge</h3>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-on-surface-variant">
          Print this and hand it to {contact.name} — scanning it on a department display's tablet claims that display for their shift, and scanning it again releases them.
        </p>

        <div className="flex justify-center py-2">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`Badge QR for ${contact.name}`} className="w-48 h-48 rounded-lg border border-outline-variant" />
          ) : (
            <div className="w-48 h-48 rounded-lg border border-outline-variant bg-surface-container-low animate-pulse" />
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex-1 h-10 rounded-lg border border-outline-variant text-on-surface-variant text-xs font-semibold hover:bg-surface-container-low disabled:opacity-50 flex items-center justify-center gap-1.5"
            title="Lost badge — this invalidates the old one"
          >
            <RefreshCw className="w-3.5 h-3.5" /> {regenerating ? 'Regenerating…' : 'Lost — Regenerate'}
          </button>
          <button
            onClick={handlePrint}
            disabled={!qrDataUrl}
            className="flex-1 h-10 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>
    </div>
  );
}
