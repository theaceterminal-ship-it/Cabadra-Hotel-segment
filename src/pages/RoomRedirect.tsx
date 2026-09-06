import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { resolveRoomToken } from '../lib/guestApi';

/**
 * What a printed room-door QR actually points at: /guest/room/:roomId.
 * Resolves to whoever's checked-in reservation is current right now, then
 * hands off to the normal token-scoped guest page — see
 * guest_resolve_room_token in 0011_room_qr.sql for why this indirection
 * exists (a QR sticker needs to outlive any one guest's stay).
 */
export default function RoomRedirect() {
  const { roomId = '' } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    resolveRoomToken(roomId)
      .then(token => navigate(`/guest/${token}`, { replace: true }))
      .catch(err => setError(err instanceof Error ? err.message : 'This room is not available right now.'));
  }, [roomId, navigate]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f6faff] p-6">
      <div className="max-w-sm text-center space-y-2">
        {error ? (
          <>
            <h1 className="text-lg font-bold text-[#141d23]">No one's checked in here yet</h1>
            <p className="text-sm text-[#4e463a]">This room doesn't have an active guest right now. Please check with the front desk.</p>
          </>
        ) : (
          <p className="text-sm text-[#4e463a]">Opening your room…</p>
        )}
      </div>
    </div>
  );
}
