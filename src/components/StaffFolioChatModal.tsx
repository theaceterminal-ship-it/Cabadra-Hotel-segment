import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { fetchChatInbox } from '../lib/staffApi';
import { StaffChatPanel } from './StaffChatPanel';

interface StaffFolioChatModalProps {
  propertyId: string;
  reservationId: string;
  roomNumber: string;
  guestName?: string;
  onClose: () => void;
}

/**
 * The chat with one room, opened from its room card (RoomDetailModal). The
 * same thread as in Messages; the inbox lookup is only for the live
 * channel, so typing dots work here too.
 */
export function StaffFolioChatModal({ propertyId, reservationId, roomNumber, guestName, onClose }: StaffFolioChatModalProps) {
  const [channel, setChannel] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    fetchChatInbox(propertyId).then(rows => setChannel(rows.find(r => r.reservationId === reservationId)?.chatChannel ?? null)).catch(() => {});
  }, [propertyId, reservationId]);

  return (
    <motion.div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-[70]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="bg-surface-container-lowest rounded-[24px] max-w-md w-full h-[34rem] shadow-2xl border border-outline-variant flex flex-col overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant shrink-0">
          <span className="size-10 rounded-full bg-primary text-on-primary flex items-center justify-center text-sm font-semibold shrink-0">{roomNumber}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[15px] text-on-surface truncate">Room {roomNumber}{guestName ? ` · ${guestName}` : ''}</h3>
            <p className={`text-[12px] ${typing ? 'text-success font-medium' : 'text-on-surface-variant'}`}>{typing ? 'typing…' : 'Guest chat'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="size-9 rounded-full hover:bg-surface-container-low flex items-center justify-center text-on-surface-variant">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <StaffChatPanel propertyId={propertyId} reservationId={reservationId} chatChannel={channel} onTypingChange={setTyping} />
        </div>
      </motion.div>
    </motion.div>
  );
}
