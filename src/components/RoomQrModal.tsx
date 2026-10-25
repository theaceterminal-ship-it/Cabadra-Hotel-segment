import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Copy, Check, Printer, X, RefreshCw } from 'lucide-react';
import { fetchRoomQrCode, regenerateRoomQrCode } from '../lib/staffApi';

interface RoomQrModalProps {
  roomNumber: string;
  roomId: string;
  /** The room's random QR code (rooms.qr_code, 0074), if the caller already has it; looked up otherwise. */
  qrCode?: string;
  onClose: () => void;
}

/**
 * The QR you print once and stick on Room N's door — encodes
 * /guest/room/<random code> (see RoomRedirect.tsx), which resolves to
 * whoever's currently checked in at scan time. The code is random, not the
 * room number, so nobody can guess another room's link; "New code" retires
 * a sticker that's been copied. Unlike GuestLinkCard's QR (a specific
 * stay's link, useful for handing to a guest right now), this one is meant
 * to outlive any single guest.
 */
export function RoomQrModal({ roomNumber, roomId, qrCode, onClose }: RoomQrModalProps) {
  // undefined = still looking it up; null = the room has none (0074 not applied).
  const [code, setCode] = useState<string | null | undefined>(qrCode);
  const url = code ? `${window.location.origin}/guest/room/${code}` : '';
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);

  useEffect(() => {
    if (qrCode) return;
    fetchRoomQrCode(roomId).then(setCode).catch(() => setCode(null));
  }, [roomId, qrCode]);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setQrDataUrl(null);
    QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#141d23', light: '#ffffff' } })
      .then(d => { if (!cancelled) setQrDataUrl(d); });
    return () => { cancelled = true; };
  }, [url]);

  const handleNewCode = async () => {
    setRenewing(true);
    setRenewError(null);
    try {
      setCode(await regenerateRoomQrCode(roomId));
      setConfirmNew(false);
    } catch (err) {
      setRenewError(err instanceof Error ? err.message : 'Couldn’t create a new code.');
    } finally {
      setRenewing(false);
    }
  };

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
      <html><head><title>Room ${roomNumber} QR</title>
        <style>
          body { text-align: center; font-family: sans-serif; margin-top: 40px; color: #141d23; }
          h2 { font-size: 22px; margin-bottom: 4px; }
          p { font-size: 13px; color: #7f7668; margin-top: 0; }
          .qr-wrap { background: white; padding: 20px; border-radius: 16px; display: inline-block; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #E9ECEF; margin-top: 16px; }
          img { width: 260px; height: 260px; display: block; }
        </style>
      </head><body>
        <h2>Room ${roomNumber}</h2>
        <p>Scan to order room service</p>
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
            <h3 className="text-lg font-semibold text-on-surface">Room {roomNumber} QR</h3>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-on-surface-variant">
          Print once and stick it in the room — it always opens for whoever's currently checked in, no reprinting after every stay.
        </p>

        <div className="flex justify-center py-2">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR code for Room ${roomNumber}`} className="w-48 h-48 rounded-lg border border-outline-variant" />
          ) : (
            <div className="w-48 h-48 rounded-lg border border-outline-variant bg-surface-container-low animate-pulse" />
          )}
        </div>

        {url ? (
          <p className="text-[11px] text-on-surface-variant truncate px-2">{url}</p>
        ) : code === null ? (
          <p className="text-xs text-error">This room has no QR code yet. Ask whoever manages the database to apply migration 0074.</p>
        ) : null}

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 h-10 rounded-lg border border-outline-variant text-on-surface-variant text-xs font-semibold hover:bg-surface-container-low flex items-center justify-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Link'}
          </button>
          <button
            onClick={handlePrint}
            disabled={!qrDataUrl}
            className="flex-1 h-10 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>

        {code && (confirmNew ? (
          <div className="rounded-xl bg-surface-container-low p-3 text-left space-y-2">
            <p className="text-xs text-on-surface">
              The current sticker for Room {roomNumber} will stop working straight away, and you'll need to print and stick the new one.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmNew(false)} className="flex-1 h-9 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant">Keep current</button>
              <button onClick={handleNewCode} disabled={renewing} className="flex-1 h-9 rounded-lg bg-error text-on-error text-xs font-semibold disabled:opacity-60">
                {renewing ? 'Creating…' : 'Create new code'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmNew(true)} className="w-full text-[11px] text-on-surface-variant hover:text-on-surface inline-flex items-center justify-center gap-1">
            <RefreshCw className="w-3 h-3" /> Sticker copied or lost? Create a new code
          </button>
        ))}
        {renewError && <p className="text-xs text-error">{renewError}</p>}
      </div>
    </div>
  );
}
