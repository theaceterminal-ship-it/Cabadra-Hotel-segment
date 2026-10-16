import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { fetchChatMessages, sendChatMessage } from '../lib/guestApi';
import { FolioChatMessage } from '../types';
import { ChatThread } from './ChatThread';

interface GuestFolioChatProps {
  token: string;
}

const POLL_MS = 5000;

/**
 * Folio Chat's guest-side entry point — a floating button, always visible
 * across both guest sub-views (guest_home, room_dining) rather than
 * tucked inside one screen, since it's about the stay, not about whatever
 * page happens to be open. Opens a slide-up thread with reception.
 */
export function GuestFolioChat({ token }: GuestFolioChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<FolioChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasUnseen, setHasUnseen] = useState(false);
  const prevCountRef = useRef(0);

  const poll = useCallback((isOpen: boolean) => {
    fetchChatMessages(token)
      .then(fresh => {
        const lastIsStaff = fresh[fresh.length - 1]?.sender === 'staff';
        if (!isOpen && fresh.length > prevCountRef.current && lastIsStaff) {
          setHasUnseen(true);
        }
        prevCountRef.current = fresh.length;
        setMessages(fresh);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    poll(open);
    const interval = setInterval(() => poll(open), POLL_MS);
    return () => clearInterval(interval);
  }, [poll, open]);

  const handleOpen = () => {
    setOpen(true);
    setHasUnseen(false);
  };

  const handleSend = async (body: string) => {
    const optimistic: FolioChatMessage = { id: `local-${Date.now()}`, sender: 'guest', body, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    await sendChatMessage(token, body);
    poll(true);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="fixed bottom-20 right-4 sm:right-6 z-40 w-14 h-14 rounded-full bg-primary text-on-primary shadow-xl flex items-center justify-center hover:bg-primary-hover transition-colors pointer-events-auto"
        title="Message the front desk"
      >
        <MessageCircle className="w-6 h-6" />
        {hasUnseen && <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-error border-2 border-surface" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-end justify-center sm:items-center">
          <div className="w-full sm:max-w-md h-[80vh] sm:h-[32rem] bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-250">
            <div className="flex items-center justify-between p-4 border-b border-outline-variant shrink-0">
              <h3 className="font-bold text-sm text-on-surface">Message the Front Desk</h3>
              <button onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-gray-200 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <ChatThread messages={messages} viewerRole="guest" onSend={handleSend} loading={loading} />
          </div>
        </div>
      )}
    </>
  );
}
