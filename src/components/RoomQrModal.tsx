import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Copy, Check, Printer, X } from 'lucide-react';

interface RoomQrModalProps {
  roomNumber: string;
  roomId: string;
  onClose: () => void;
}

/**
 * The QR you print once and stick on Room N's door — encodes
 * /guest/room/:roomId (see RoomRedirect.tsx), which resolves to whoever's
 * currently checked in at scan time. Unlike GuestLinkCard's QR (a specific
 * stay's link, useful for handing to a guest right now), this one is meant
 * to outlive any single guest.
 */
export function RoomQrModal({ roomNumber, roomId, onClose }: RoomQrModalProps) {
  const url = `${window.location.origin}/guest/room/${roomId}`;
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
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-[#E9ECEF] space-y-4 text-center">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[#765a25]" />
            <h3 className="text-lg font-bold text-[#141d23]">Room {roomNumber} QR</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-[#7f7668]">
          Print once and stick it in the room — it always opens for whoever's currently checked in, no reprinting after every stay.
        </p>

        <div className="flex justify-center py-2">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR code for Room ${roomNumber}`} className="w-48 h-48 rounded-lg border border-[#E9ECEF]" />
          ) : (
            <div className="w-48 h-48 rounded-lg border border-[#E9ECEF] bg-[#f6faff] animate-pulse" />
          )}
        </div>

        <p className="text-[11px] text-[#7f7668] truncate px-2">{url}</p>

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex-1 h-10 rounded-lg border border-[#E9ECEF] text-[#4e463a] text-xs font-bold hover:bg-[#ecf5fe] flex items-center justify-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Link'}
          </button>
          <button
            onClick={handlePrint}
            disabled={!qrDataUrl}
            className="flex-1 h-10 rounded-lg bg-[#765a25] text-white text-xs font-bold hover:bg-[#5c4210] disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>
    </div>
  );
}
