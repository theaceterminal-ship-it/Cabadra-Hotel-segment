import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useBackToClose } from '../hooks/useBackToClose';

let scrollLocks = 0;
function lockPageScroll(): () => void {
  if (scrollLocks++ === 0) document.body.style.overflow = 'hidden';
  return () => { if (--scrollLocks === 0) document.body.style.overflow = ''; };
}

interface ModalShellProps {
  onClose: () => void;
  /** Heading area: a title node (small label above is optional). The close button is added for you. */
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Pinned under the scrolling part (buttons). */
  footer?: React.ReactNode;
  children: React.ReactNode;
  widthClass?: string;
  zClass?: string;
}

/**
 * The frame every staff pop-up shares, so they all behave the same:
 *  - never taller than the screen: the middle scrolls, the title and the buttons stay put;
 *  - closes with the X, a tap on the dimmed background, Escape, or the phone's back button;
 *  - on a phone it sits at the bottom like a sheet.
 */
export function ModalShell({ onClose, title, eyebrow, subtitle, footer, children, widthClass = 'max-w-md', zClass = 'z-50' }: ModalShellProps) {
  useBackToClose(true, onClose);
  useEffect(() => lockPageScroll(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 ${zClass}`}
      // Only a tap that starts on the dimmed background closes it, never one that began inside and ended outside.
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-surface-container-lowest w-full ${widthClass} rounded-t-2xl sm:rounded-2xl shadow-2xl border border-outline-variant flex flex-col max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] overflow-hidden`}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-outline-variant shrink-0">
          <div className="min-w-0">
            {eyebrow && <span className="text-xs font-medium text-primary block">{eyebrow}</span>}
            <h3 className="text-xl font-semibold text-on-surface leading-tight">{title}</h3>
            {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="size-10 -mr-2 -mt-1 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container shrink-0">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-outline-variant shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>{footer}</div>}
      </div>
    </div>
  );
}
