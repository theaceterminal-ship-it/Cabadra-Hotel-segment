import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { fetchChatMessages, sendStaffChatMessage } from '../lib/staffApi';
import { FolioChatMessage } from '../types';
import { ChatThread } from './ChatThread';

interface StaffFolioChatModalProps {
  propertyId: string;
  reservationId: string;
  roomNumber: string;
  guestName?: string;
  onClose: () => void;
}

const POLL_MS = 5000;

/**
 * Folio Chat's staff-side entry point, opened from RoomDetailModal
 * alongside Folio & Checkout — the thread is per-reservation, same as the
 * folio itself. Unlike the guest side, this reads/writes the table
 * directly under RLS (is_staff_for_property), no RPC needed.
 */
export function StaffFolioChatModal({ propertyId, reservationId, roomNumber, guestName, onClose }: StaffFolioChatModalProps) {
  const [messages, setMessages] = useState<FolioChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const poll = useCallback(() => {
    fetchChatMessages(reservationId)
      .then(setMessages)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reservationId]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  const handleSend = async (body: string) => {
    const optimistic: FolioChatMessage = { id: `local-${Date.now()}`, sender: 'staff', body, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    await sendStaffChatMessage(propertyId, reservationId, body);
    poll();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-[70]">
      <div className="bg-surface-container-lowest rounded-2xl max-w-md w-full h-[32rem] shadow-2xl border border-outline-variant flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-outline-variant shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm text-on-surface">Room {roomNumber}{guestName ? ` · ${guestName}` : ''}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <ChatThread messages={messages} viewerRole="staff" onSend={handleSend} loading={loading} />
      </div>
    </div>
  );
}
