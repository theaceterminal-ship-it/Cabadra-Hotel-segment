import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Link2 } from 'lucide-react';
import { fetchBookingLink, setBookingLink } from '../../lib/publicBookingApi';
import { ErrorNote, Panel, Switch, btnPrimary, btnSecondary } from './ui';

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {})}
      className={btnSecondary}
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />} {done ? 'Copied' : label}
    </button>
  );
}

/**
 * The hotel's public booking link (0094) and the Book now button for its own website. Off until the
 * owner turns it on; bookings arrive in Reception as "website" bookings, pay at the hotel.
 */
export function BookingLinkPanel({ propertyId }: { propertyId: string }) {
  const [state, setState] = useState<{ slug: string | null; enabled: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBookingLink(propertyId).then(setState).catch(() => setError('Online booking isn’t set up on this account yet. Ask Cabadra to apply the latest update.'));
  }, [propertyId]);

  const toggle = async (next: boolean) => {
    setSaving(true); setError(null);
    try { setState(await setBookingLink(propertyId, next)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t change that.'); }
    finally { setSaving(false); }
  };

  if (!state) return error ? <ErrorNote>{error}</ErrorNote> : null;

  const origin = window.location.origin;
  const link = state.slug ? `${origin}/book/${state.slug}` : '';
  const floating = state.slug ? `<script src="${origin}/book.js" data-hotel="${state.slug}" async></script>` : '';
  const ownButton = state.slug ? `<script src="${origin}/book.js" data-hotel="${state.slug}" data-button="none" async></script>\n<a href="#" data-cabadra-book>Book now</a>` : '';
  const codeCls = 'block rounded-xl bg-surface-container px-3.5 py-3 text-[12px] font-mono text-on-surface whitespace-pre-wrap break-all';

  return (
    <Panel>
      <div className="flex items-start gap-4">
        <span className="size-11 shrink-0 rounded-full bg-surface flex items-center justify-center text-on-surface"><Link2 className="size-5" /></span>
        <div className="flex-1">
          <h3 className="text-base font-semibold tracking-[-0.01em] text-on-surface">Booking link</h3>
          <p className="text-sm text-on-surface-variant mt-1 max-w-xl">Guests pick dates and a room type on their own and the booking appears in Reception, marked “website”. They pay at the hotel. Put the link on Instagram, Google or WhatsApp, or add a Book now button to your website.</p>
        </div>
        <Switch checked={state.enabled} onChange={toggle} disabled={saving} label="Booking link on" />
      </div>
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}

      {state.enabled && state.slug && (
        <div className="mt-5 space-y-5">
          <div>
            <p className="text-sm font-medium text-on-surface mb-2">Your link</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 min-w-0 h-11 px-4 rounded-xl bg-surface-container flex items-center text-[13px] font-mono text-on-surface"><span className="truncate">{link}</span></div>
              <div className="flex gap-2">
                <CopyButton text={link} />
                <a href={link} target="_blank" rel="noopener noreferrer" className={btnPrimary}><ExternalLink className="size-4" /> Open</a>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant mt-2">Rooms with the same type are offered together, so give matching rooms the same type name and price in Rooms.</p>
          </div>

          <div>
            <p className="text-sm font-medium text-on-surface">A Book now button on your website</p>
            <p className="text-xs text-on-surface-variant mt-0.5 mb-2">Paste this just before the closing &lt;/body&gt; tag, or into your site builder’s custom code box. It adds a button in the corner that opens booking in a popup.</p>
            <code className={codeCls}>{floating}</code>
            <div className="mt-2"><CopyButton text={floating} label="Copy code" /></div>
          </div>

          <div>
            <p className="text-sm font-medium text-on-surface">Use a button you already have</p>
            <p className="text-xs text-on-surface-variant mt-0.5 mb-2">This version adds no button of its own. Anything marked <span className="font-mono">data-cabadra-book</span> opens booking.</p>
            <code className={codeCls}>{ownButton}</code>
            <div className="mt-2"><CopyButton text={ownButton} label="Copy code" /></div>
          </div>
        </div>
      )}
    </Panel>
  );
}
