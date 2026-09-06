import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check } from 'lucide-react';

interface GuestLinkCardProps {
  guestToken: string;
}

/**
 * What actually gets a guest onto their stay's page — this is the "QR code
 * at check-in" the whole guest_token design has been assuming exists since
 * it was first built, but there was previously no UI anywhere that showed
 * it. Rendered fully client-side (the `qrcode` package), no external image
 * service involved.
 */
export function GuestLinkCard({ guestToken }: GuestLinkCardProps) {
  const url = `${window.location.origin}/guest/${guestToken}`;
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 160, margin: 1, color: { dark: '#141d23', light: '#ffffff' } })
      .then(dataUrl => { if (!cancelled) setQrDataUrl(dataUrl); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [url]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. non-HTTPS, permissions) —
      // the URL is still shown below and selectable by hand either way.
    }
  };

  return (
    <div className="bg-[#f6faff] p-3 rounded-lg border border-[#E9ECEF] flex items-center gap-3">
      {qrDataUrl && <img src={qrDataUrl} alt="Guest link QR code" className="w-16 h-16 rounded border border-[#E9ECEF] bg-white shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-[#4e463a] uppercase tracking-wider mb-1">Guest Link</p>
        <p className="text-[11px] text-[#7f7668] truncate mb-1.5">{url}</p>
        <button
          onClick={handleCopy}
          className="h-7 px-2.5 rounded bg-[#765a25] text-white text-[11px] font-bold hover:bg-[#5c4210] flex items-center gap-1.5"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy Link'}
        </button>
      </div>
    </div>
  );
}
