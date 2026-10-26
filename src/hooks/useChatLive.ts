import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

const TYPING_SEND_EVERY_MS = 2000;
const TYPING_SHOWN_FOR_MS = 4000;

/**
 * The live side of a stay's chat (0086), over Supabase Realtime broadcast:
 * "typing…" from the other side, and a nudge when they've just sent a
 * message so this side fetches it at once instead of on the next poll.
 * Nothing is stored; if Realtime is unreachable the chat still works by
 * polling, just without the typing dots. The channel name is a hash of the
 * stay's guest link, which only the guest and the hotel's staff have.
 */
export function useChatLive(channelName: string | null, role: 'guest' | 'staff', onNewMessage: () => void) {
  const [otherTyping, setOtherTyping] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSent = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onNewRef = useRef(onNewMessage);
  onNewRef.current = onNewMessage;

  useEffect(() => {
    if (!channelName) return;
    const channel = supabase.channel(channelName, { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.role === role) return;
        setOtherTyping(true);
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setOtherTyping(false), TYPING_SHOWN_FOR_MS);
      })
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        if (payload?.role === role) return;
        setOtherTyping(false);
        onNewRef.current();
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      clearTimeout(hideTimer.current);
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [channelName, role]);

  /** Call on every keystroke; sends at most every two seconds. */
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (!channelRef.current || now - lastSent.current < TYPING_SEND_EVERY_MS) return;
    lastSent.current = now;
    channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { role } });
  }, [role]);

  /** Call after a message is saved, so the other side fetches it now. */
  const announceMessage = useCallback(() => {
    lastSent.current = 0;
    channelRef.current?.send({ type: 'broadcast', event: 'message', payload: { role } });
  }, [role]);

  return { otherTyping, sendTyping, announceMessage };
}
