import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { FolioChatMessage } from '../types';

interface ChatThreadProps {
  messages: FolioChatMessage[];
  /** Whose screen this is — decides which side of the thread "you" render on, so the same component works for both the guest and staff wrappers. */
  viewerRole: 'guest' | 'staff';
  onSend: (body: string) => Promise<void>;
  loading?: boolean;
}

/**
 * The message list + composer, shared between GuestFolioChat and
 * StaffFolioChatModal — same thread, read from opposite ends. Not
 * Realtime-driven (see guestApi.ts's fetchChatMessages comment); whoever
 * mounts this is responsible for polling and handing down fresh messages.
 */
export function ChatThread({ messages, viewerRole, onSend, loading }: ChatThreadProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

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
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {loading ? (
          <p className="text-xs text-on-surface-variant text-center py-6">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-on-surface-variant text-center py-6">No messages yet — say hello.</p>
        ) : (
          messages.map(m => {
            const mine = m.sender === viewerRole;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface'}`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${mine ? 'text-on-primary/70' : 'text-on-surface-variant'}`}>
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} className="flex items-center gap-2 p-3 border-t border-outline-variant shrink-0">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 h-10 px-3 text-sm border border-outline-variant rounded-lg bg-surface-container-lowest focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="h-10 w-10 rounded-lg bg-primary text-on-primary flex items-center justify-center disabled:opacity-40 shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
