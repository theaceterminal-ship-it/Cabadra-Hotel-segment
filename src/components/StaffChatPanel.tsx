import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchChatMessages, markStaffChatSeen, sendStaffChatMessage } from '../lib/staffApi';
import { FolioChatMessage } from '../types';
import { ChatThread } from './ChatThread';
import { useChatLive } from '../hooks/useChatLive';

const POLL_MS = 3000;

/**
 * Reception's side of one stay's chat: the thread, live "typing…" both
 * ways (when the realtime channel is known), and the guest's messages
 * marked seen while it's open. Used by the Messages inbox and by the room
 * card's chat. `onTypingChange` lets the caller show "typing…" in its
 * header.
 */
export function StaffChatPanel({ propertyId, reservationId, chatChannel, onActivity, onTypingChange }: {
  propertyId: string;
  reservationId: string;
  chatChannel: string | null;
  /** Called after a send or new message, so an inbox can refresh its list. */
  onActivity?: () => void;
  onTypingChange?: (typing: boolean) => void;
}) {
  const [messages, setMessages] = useState<FolioChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const activityRef = useRef(onActivity);
  activityRef.current = onActivity;
  const typingRef = useRef(onTypingChange);
  typingRef.current = onTypingChange;

  const poll = useCallback(() => {
    fetchChatMessages(reservationId)
      .then(fresh => {
        // Open in front of the desk: the guest's new messages are read.
        if (fresh.some(m => m.sender === 'guest' && !m.seen)) markStaffChatSeen(reservationId).then(() => activityRef.current?.());
        setMessages(prev => (fresh.length === prev.length && fresh.every((m, i) => m.id === prev[i]?.id && m.seen === prev[i]?.seen) ? prev : fresh));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reservationId]);

  const { otherTyping, sendTyping, announceMessage } = useChatLive(chatChannel, 'staff', poll);
  useEffect(() => { typingRef.current?.(otherTyping); }, [otherTyping]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  const handleSend = async (body: string) => {
    const optimistic: FolioChatMessage = { id: `local-${Date.now()}`, sender: 'staff', body, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    await sendStaffChatMessage(propertyId, reservationId, body);
    announceMessage();
    poll();
    activityRef.current?.();
  };

  return (
    <ChatThread
      messages={messages}
      viewerRole="staff"
      onSend={handleSend}
      loading={loading}
      otherTyping={otherTyping}
      onTyping={sendTyping}
      emptyText="No messages with this room yet. Write to welcome them or answer a question."
    />
  );
}
