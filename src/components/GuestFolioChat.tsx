import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { fetchChatChannel, fetchChatMessages, markChatSeen, sendChatMessage } from '../lib/guestApi';
import { FolioChatMessage } from '../types';
import { ChatThread } from './ChatThread';
import { useChatLive } from '../hooks/useChatLive';
import { useBackToClose } from '../hooks/useBackToClose';

interface GuestFolioChatProps {
  token: string;
  propertyName: string;
}

const POLL_OPEN_MS = 3000;
const POLL_CLOSED_MS = 8000;

/**
 * The guest's chat with the front desk: a floating button on every guest
 * screen that opens a chat sheet sliding up from the bottom (a plain
 * transform, no blur or shared-element morph, so it stays smooth on
 * low-end phones).
 * Live "typing…" both ways and an instant refresh when the desk replies
 * (useChatLive), with polling underneath in case Realtime is unreachable.
 * Opening it marks the desk's messages seen; the guest sees ticks on
 * their own. Back closes it.
 */
export function GuestFolioChat({ token, propertyName }: GuestFolioChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<FolioChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [channel, setChannel] = useState<string | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  useBackToClose(open, () => setOpen(false));

  useEffect(() => { fetchChatChannel(token).then(setChannel); }, [token]);

  const poll = useCallback(() => {
    fetchChatMessages(token)
      .then(fresh => {
        // Same thread as last time: keep the old array so nothing re-renders.
        setMessages(prev => (fresh.length === prev.length && fresh.every((m, i) => m.id === prev[i]?.id && m.seen === prev[i]?.seen) ? prev : fresh));
        const fromDesk = fresh.filter(m => m.sender === 'staff' && !m.seen).length;
        if (openRef.current) {
          if (fromDesk > 0) markChatSeen(token);
          setUnseen(0);
        } else {
          setUnseen(fromDesk);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const { otherTyping, sendTyping, announceMessage } = useChatLive(channel, 'guest', poll);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, open ? POLL_OPEN_MS : POLL_CLOSED_MS);
    return () => clearInterval(interval);
  }, [poll, open]);

  const handleOpen = () => {
    setOpen(true);
    setUnseen(0);
    markChatSeen(token);
  };

  const handleSend = async (body: string) => {
    const optimistic: FolioChatMessage = { id: `local-${Date.now()}`, sender: 'guest', body, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    await sendChatMessage(token, body);
    announceMessage();
    poll();
  };

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            key="fab"
            onClick={handleOpen}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.12 } }}
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed bottom-20 right-4 sm:right-6 z-40 w-14 h-14 rounded-full bg-primary text-on-primary shadow-xl flex items-center justify-center"
            title="Message the front desk"
            aria-label={unseen ? `Message the front desk, ${unseen} new` : 'Message the front desk'}
          >
            <MessageCircle className="w-6 h-6" />
            <AnimatePresence>
              {unseen > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-error text-on-error text-[11px] font-semibold flex items-center justify-center border-2 border-surface"
                >
                  {unseen}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center sm:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onMouseDown={e => e.target === e.currentTarget && setOpen(false)}
          >
            <motion.div
              className="w-full sm:max-w-md h-[86svh] sm:h-[36rem] bg-surface-container-lowest rounded-t-[28px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden will-change-transform"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant shrink-0">
                <span className="relative size-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-semibold shrink-0">
                  {propertyName.trim().charAt(0).toUpperCase() || 'R'}
                  <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-room-ready border-2 border-surface-container-lowest" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-on-surface truncate">Front desk</p>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p
                      key={otherTyping ? 'typing' : 'idle'}
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      className={`text-[12px] truncate ${otherTyping ? 'text-success font-medium' : 'text-on-surface-variant'}`}
                    >
                      {otherTyping ? 'typing…' : propertyName}
                    </motion.p>
                  </AnimatePresence>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close chat" className="size-10 rounded-full hover:bg-surface-container-low flex items-center justify-center text-on-surface-variant">
                  <ChevronDown className="w-5 h-5" />
                </button>
              </div>
              <ChatThread
                messages={messages}
                viewerRole="guest"
                onSend={handleSend}
                loading={loading}
                otherTyping={otherTyping}
                onTyping={sendTyping}
                emptyText="Ask the front desk anything: towels, a late checkout, a taxi. They usually reply within minutes."
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
