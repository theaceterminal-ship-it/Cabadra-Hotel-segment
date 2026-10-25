import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X } from 'lucide-react';

interface QrScannerModalProps {
  title: string;
  instructions: string;
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

const ELEMENT_ID = 'qr-scanner-modal-viewport';

/**
 * A phone's own camera scanning a QR, in-browser — what lets a department
 * display's badge scan work from a staff member's personal phone instead
 * of assuming a USB/Bluetooth barcode-scanner peripheral (the only input
 * path DepartmentDisplayPage had until now). Stops the camera stream on
 * every exit path (successful scan, manual close, unmount) — a stuck-open
 * camera is the obvious failure mode for anything wrapping getUserMedia.
 */
export function QrScannerModal({ title, instructions, onScan, onClose }: QrScannerModalProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const stoppedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(ELEMENT_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          // Only the first successful decode counts — stop before handing
          // off, so onScan's own work (an RPC call) never races a second
          // frame decoding the same code again.
          if (stoppedRef.current) return;
          stoppedRef.current = true;
          scanner.stop().catch(() => {}).finally(() => scanner.clear());
          onScan(decodedText);
        },
        () => {
          // Fires continuously while no QR is in frame — expected, not an error.
        }
      )
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not access the camera. Check permissions and try again.');
      });

    return () => {
      if (stoppedRef.current) return;
      stoppedRef.current = true;
      scanner.stop().catch(() => {}).finally(() => scanner.clear());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    stoppedRef.current = true;
    scannerRef.current?.stop().catch(() => {}).finally(() => scannerRef.current?.clear());
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-[80]">
      <div className="bg-surface-container-lowest rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-outline-variant space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          </div>
          <button onClick={handleClose} className="text-on-surface-variant hover:text-on-surface p-1"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-xs text-on-surface-variant">{instructions}</p>

        {error ? (
          <p className="text-xs text-error py-6 text-center">{error}</p>
        ) : (
          <div id={ELEMENT_ID} className="w-full rounded-xl overflow-hidden bg-black" />
        )}

        <button
          onClick={handleClose}
          className="w-full h-10 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
