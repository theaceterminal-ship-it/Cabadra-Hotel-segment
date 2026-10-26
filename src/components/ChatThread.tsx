import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, CheckCheck, Send } from 'lucide-react';
import { FolioChatMessage } from '../types';

interface ChatThreadProps {
  messages: FolioChatMessage[];
  /** Whose screen this is — decides which side of the thread "you" render on, so the same component works for both the guest and staff wrappers. */
  viewerRole: 'guest' | 'staff';
  onSend: (body: string) => Promise<void>;
  loading?: boolean;
  /** The other side is typing right now (useChatLive). */
  otherTyping?: boolean;
  /** Called as the viewer types, to tell the other side. */
  onTyping?: () => void;
  /** What an empty thread says. */
  emptyText?: string;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string) {
  const d = new Date(iso);
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * The message list + composer, shared between the guest's chat and
 * reception's — same thread, read from opposite ends. Messages slide in,
 * your own carry ticks (one: sending, two: sent, two in green: seen), the
 * other side's typing shows as three bouncing dots, and days are separated
 * like in a phone messenger. Whoever mounts this fetches and hands down
 * fresh messages.
 */
export function ChatThread({ messages, viewerRole, onSend, loading, otherTyping, onTyping, emptyText }: ChatThreadProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);
  // Messages already there when the thread opens appear at once; only ones
  // that arrive while it's open slide in (animating a whole history on open
  // is what made it stutter on phones).
  const initialIds = useRef<Set<string> | null>(null);
  if (initialIds.current === null && !loading) initialIds.current = new Set(messages.map(m => m.id));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: firstScroll.current ? 'auto' : 'smooth', block: 'end' });
    if (messages.length) firstScroll.current = false;
  }, [messages.length, otherTyping]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft('');
    try {
      await onSend(body);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-surface">
        {loading ? (
          <div className="py-10 flex justify-center"><TypingDots /></div>
        ) : messages.length === 0 ? (
          <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-[80%] text-center text-[13px] text-on-surface-variant py-8">
            {emptyText ?? 'No messages yet. Say hello.'}
          </motion.p>
        ) : (
          messages.map((m, i) => {
            const mine = m.sender === viewerRole;
            const newDay = i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt);
            const grouped = !newDay && i > 0 && messages[i - 1].sender === m.sender;
            return (
              <React.Fragment key={m.id}>
                {newDay && (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full bg-surface-container-lowest px-3 py-1 text-[11px] font-medium text-on-surface-variant shadow-sm">{dayLabel(m.createdAt)}</span>
                  </div>
                )}
                <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '' : 'pt-1.5'} ${initialIds.current?.has(m.id) ? '' : 'chat-bubble-in'}`}>
                  <div
                    className={`max-w-[78%] px-3.5 pt-2 pb-1.5 text-[15px] leading-snug shadow-sm rounded-[20px] ${mine
                      ? `bg-primary text-on-primary ${grouped ? '' : 'rounded-br-md'}`
                      : `bg-surface-container-lowest text-on-surface ${grouped ? '' : 'rounded-bl-md'}`}`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-on-primary/65' : 'text-on-surface-variant'}`}>
                      {time(m.createdAt)}
                      {mine && (m.id.startsWith('local-')
                        ? <Check className="size-3 opacity-60" aria-label="Sending" />
                        : m.seen ? <CheckCheck className="size-3.5 text-[#b5d96a]" aria-label="Seen" /> : <CheckCheck className="size-3.5" aria-label="Sent" />)}
                    </p>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <AnimatePresence>
          {otherTyping && (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex justify-start pt-1.5"
            >
              <div className="rounded-[20px] rounded-bl-md bg-surface-container-lowest px-4 py-3 shadow-sm" aria-label="Typing">
                <TypingDots />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} className="flex items-end gap-2 p-3 bg-surface-container-lowest border-t border-outline-variant shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <textarea
          value={draft}
          rows={1}
          onChange={e => { setDraft(e.target.value); onTyping?.(); }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          placeholder="Message"
          aria-label="Message"
          className="flex-1 min-h-11 max-h-32 resize-none px-4 py-2.5 text-[15px] rounded-[22px] bg-surface border border-transparent focus:border-outline focus:outline-none text-on-surface placeholder:text-on-surface-variant/70"
        />
        <motion.button
          type="submit"
          disabled={!draft.trim() || sending}
          whileTap={{ scale: 0.88 }}
          animate={{ scale: draft.trim() ? 1 : 0.92, opacity: draft.trim() ? 1 : 0.45 }}
          className="size-11 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0"
          aria-label="Send"
        >
          <Send className="size-[18px] -ml-0.5" />
        </motion.button>
      </form>
    </div>
  );
}

/** Three dots bouncing in turn, like a phone messenger's "typing…". */
export function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="size-2 rounded-full bg-on-surface-variant/60"
          animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}
