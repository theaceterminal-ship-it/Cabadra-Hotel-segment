import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, BedDouble, Loader2, MessageCircle, Search } from 'lucide-react';
import { ChatInboxRow, fetchChatInbox } from '../lib/staffApi';
import { StaffChatPanel } from './StaffChatPanel';

const INBOX_POLL_MS = 8000;

const when = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

/**
 * Reception's Messages (0086): every guest conversation at the hotel,
 * by room, with unread ones first and a count of what nobody has read yet.
 * Rooms staying now are listed even with no messages, so the desk can
 * write first. Opening one shows the thread beside the list (on a phone,
 * in place of it) with live typing both ways.
 */
export function ChatInboxView({ propertyId, onUnreadChange }: { propertyId: string; onUnreadChange?: (n: number) => void }) {
  const [rows, setRows] = useState<ChatInboxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState(false);

  const unreadRef = useRef(onUnreadChange);
  unreadRef.current = onUnreadChange;
  const load = useCallback(() => fetchChatInbox(propertyId).then(r => {
    setRows(r);
    setError(null);
    unreadRef.current?.(r.reduce((n, x) => n + x.unread, 0));
  }).catch(err => setError(err.message)), [propertyId]);

  useEffect(() => {
    load();
    const t = setInterval(load, INBOX_POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (rows ?? []).filter(r => !q || (r.roomNumber ?? '').toLowerCase().includes(q) || r.guestName.toLowerCase().includes(q)), [rows, q]);
  const current = rows?.find(r => r.reservationId === selected) ?? null;
  const withMessages = shown.filter(r => r.lastAt);
  const quiet = shown.filter(r => !r.lastAt);

  return (
    <div className="px-4 sm:px-6 pb-6 max-w-6xl">
      <div className="mb-4">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] text-on-surface">Messages</h1>
        <p className="text-sm text-on-surface-variant mt-1">Guests write from their app. Reply here and they see it straight away.</p>
      </div>
      {error && <p className="rounded-2xl bg-error/10 text-error text-sm px-4 py-3 mb-3">{error}</p>}

      <div className="grid lg:grid-cols-[340px_1fr] gap-3 h-[calc(100svh-220px)] min-h-[460px]">
        <div className={`rounded-[24px] bg-surface-container-lowest flex flex-col overflow-hidden ${current ? 'hidden lg:flex' : 'flex'}`}>
          <label className="relative block p-3 border-b border-outline-variant">
            <Search className="size-4 absolute left-6 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Room or guest" className="w-full h-10 pl-10 pr-3 rounded-full bg-surface-container-low text-sm text-on-surface focus:outline-none" />
          </label>
          <div className="flex-1 overflow-y-auto">
            {!rows ? (
              <div className="py-12 flex justify-center"><Loader2 className="size-5 animate-spin text-on-surface-variant" /></div>
            ) : shown.length === 0 ? (
              <p className="p-6 text-sm text-on-surface-variant text-center">{rows.length ? 'No one matches.' : 'No guests staying and no messages yet.'}</p>
            ) : (
              <>
                {withMessages.map(r => <Row key={r.reservationId} r={r} active={r.reservationId === selected} onOpen={() => setSelected(r.reservationId)} />)}
                {quiet.length > 0 && (
                  <>
                    <p className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Staying now · no messages</p>
                    {quiet.map(r => <Row key={r.reservationId} r={r} active={r.reservationId === selected} onOpen={() => setSelected(r.reservationId)} />)}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className={`rounded-[24px] bg-surface-container-lowest overflow-hidden flex-col ${current ? 'flex' : 'hidden lg:flex'}`}>
          <AnimatePresence mode="wait">
            {current ? (
              <motion.div key={current.reservationId} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex flex-col h-full min-h-0">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant shrink-0">
                  <button onClick={() => setSelected(null)} className="lg:hidden size-9 rounded-full hover:bg-surface-container-low flex items-center justify-center" aria-label="Back to messages"><ArrowLeft className="size-5" /></button>
                  <span className="size-10 rounded-full bg-primary text-on-primary flex items-center justify-center text-sm font-semibold shrink-0">{current.roomNumber ?? '—'}</span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-on-surface truncate">Room {current.roomNumber ?? '—'} · {current.guestName}</p>
                    <p className={`text-[12px] ${typing ? 'text-success font-medium' : 'text-on-surface-variant'}`}>{typing ? 'typing…' : current.status === 'checked_in' ? 'Staying now' : current.status === 'checked_out' ? 'Checked out' : 'Arriving'}</p>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <StaffChatPanel propertyId={propertyId} reservationId={current.reservationId} chatChannel={current.chatChannel} onActivity={load} onTypingChange={setTyping} />
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col items-center justify-center text-center p-8">
                <span className="size-14 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant"><MessageCircle className="size-6" /></span>
                <p className="mt-3 font-medium text-on-surface">Pick a conversation</p>
                <p className="text-sm text-on-surface-variant">Unread ones are at the top.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Row({ r, active, onOpen }: { r: ChatInboxRow; active: boolean; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-outline-variant/60 transition-colors ${active ? 'bg-surface-container-low' : 'hover:bg-surface-container-low/60'}`}>
      <span className={`size-11 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${r.unread ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'}`}>
        {r.roomNumber ?? <BedDouble className="size-4" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`text-[14px] truncate ${r.unread ? 'font-semibold text-on-surface' : 'font-medium text-on-surface'}`}>Room {r.roomNumber ?? '—'} · {r.guestName}</span>
          <span className={`text-[11px] shrink-0 ${r.unread ? 'text-success font-semibold' : 'text-on-surface-variant'}`}>{when(r.lastAt)}</span>
        </span>
        <span className="flex items-center justify-between gap-2 mt-0.5">
          <span className={`text-[13px] truncate ${r.unread ? 'text-on-surface' : 'text-on-surface-variant'}`}>
            {r.lastBody ? `${r.lastSender === 'staff' ? 'You: ' : ''}${r.lastBody}` : 'No messages yet'}
          </span>
          {r.unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-success text-on-success text-[11px] font-semibold flex items-center justify-center shrink-0">{r.unread}</span>}
        </span>
      </span>
    </button>
  );
}
