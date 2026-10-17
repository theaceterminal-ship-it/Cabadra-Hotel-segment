import React, { useState } from 'react';
import { Room, RoomStatus } from '../types';
import { GuestLinkCard } from './GuestLinkCard';
import { RoomFolioModal } from './RoomFolioModal';
import { RoomQrModal } from './RoomQrModal';
import { CheckInModal } from './CheckInModal';
import { StaffFolioChatModal } from './StaffFolioChatModal';
import { formatCurrency } from '../lib/currency';
import { Phone, Mail, FileText, UserPlus, QrCode, Receipt, MessageCircle } from 'lucide-react';

/** Rooms that can actually accept a new check-in — matches staff_checkin_new_guest's own allowed-status check (0013_guest_checkin.sql). */
export const CHECKINABLE_STATUSES: RoomStatus[] = ['ready', 'dirty', 'cleaning'];

interface RoomDetailModalProps {
  propertyId: string;
  propertyName: string;
  currency: string;
  upiId?: string;
  hasExternalPms: boolean;
  room: Room;
  onClose: () => void;
  onUpdateRoom: (updated: Room) => void;
  onRefreshRooms: () => void;
}

/**
 * The single "click a room" destination — status, guest profile, check-in,
 * QR, folio/checkout. Shared by Rooms & Floors and the Dashboard's room
 * grid so clicking a room tile means the same thing everywhere in the app,
 * instead of two hand-maintained copies drifting apart.
 */
export function RoomDetailModal({ propertyId, propertyName, currency, upiId, hasExternalPms, room, onClose, onUpdateRoom, onRefreshRooms }: RoomDetailModalProps) {
  const [displayRoom, setDisplayRoom] = useState(room);
  const [showFolio, setShowFolio] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showChat, setShowChat] = useState(false);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-surface-container-lowest rounded-2xl max-w-md w-full p-6 shadow-2xl border border-outline-variant space-y-4">
          <div className="flex justify-between items-start pb-3 border-b border-outline-variant">
            <div>
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                Floor {displayRoom.floor} • Room Details
              </span>
              <h3 className="text-2xl font-bold text-on-surface">Room {displayRoom.number}</h3>
              <p className="text-xs text-on-surface-variant">{displayRoom.type}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1">&times;</button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant space-y-1.5">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Current Status:</span>
                <span className="font-bold text-on-surface uppercase">{displayRoom.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Category / Type:</span>
                <span className="font-bold text-primary">{displayRoom.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Occupancy:</span>
                <span className="font-bold text-on-surface">Sleeps {displayRoom.maxOccupancy} Guests</span>
              </div>
              {displayRoom.bedsDescription && (
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Bedding:</span>
                  <span className="font-semibold text-on-surface">{displayRoom.bedsDescription}</span>
                </div>
              )}
              {displayRoom.bathroomDetails && (
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Bathroom:</span>
                  <span className="font-semibold text-on-surface">{displayRoom.bathroomDetails}</span>
                </div>
              )}
              {displayRoom.guestName && (
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Guest Name:</span>
                  <span className="font-bold text-on-surface">{displayRoom.guestName}</span>
                </div>
              )}
              {displayRoom.notes && (
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Notes / Issue:</span>
                  <span className="font-medium text-error">{displayRoom.notes}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-outline-variant/60">
                <span className="text-on-surface-variant">Standard Rate:</span>
                <span className="font-bold text-success">{formatCurrency(displayRoom.pricePerNight, currency)} / night</span>
              </div>
            </div>

            {(displayRoom.guestPhone || displayRoom.guestEmail || displayRoom.guestIdDocumentUrl) && (
              <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant space-y-1.5">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Guest Profile</p>
                {displayRoom.guestPhone && (
                  <div className="flex items-center gap-1.5 text-on-surface"><Phone className="w-3 h-3 text-on-surface-variant" /> {displayRoom.guestPhone}</div>
                )}
                {displayRoom.guestEmail && (
                  <div className="flex items-center gap-1.5 text-on-surface"><Mail className="w-3 h-3 text-on-surface-variant" /> {displayRoom.guestEmail}</div>
                )}
                {displayRoom.guestIdDocumentUrl && (
                  <a href={displayRoom.guestIdDocumentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-primary font-semibold hover:underline">
                    <FileText className="w-3 h-3" /> View ID document
                  </a>
                )}
              </div>
            )}

            {displayRoom.guestToken && <GuestLinkCard guestToken={displayRoom.guestToken} />}

            {CHECKINABLE_STATUSES.includes(displayRoom.status) && (
              <button
                type="button"
                onClick={() => setShowCheckIn(true)}
                className="w-full h-10 rounded-lg bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover flex items-center justify-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" /> Check In Guest
              </button>
            )}

            <div>
              <label className="font-bold text-on-surface block mb-2">Housekeeping Status</label>
              <p className="text-[10px] text-on-surface-variant mb-2">Occupancy is set by checking a guest in, not chosen here — these are the states a room moves through around a stay.</p>
              <div className="grid grid-cols-2 gap-2">
                {(['ready', 'cleaning', 'dirty', 'maintenance'] as RoomStatus[]).map((st) => (
                  <button
                    key={st}
                    disabled={displayRoom.status === 'occupied' || displayRoom.status === 'occupied_vip'}
                    onClick={() => {
                      const updated = { ...displayRoom, status: st };
                      onUpdateRoom(updated);
                      setDisplayRoom(updated);
                    }}
                    className={`p-2 rounded-lg border text-xs font-bold capitalize transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      displayRoom.status === st ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:bg-surface-container-low'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-outline-variant gap-2">
            <button
              onClick={() => setShowQr(true)}
              className="h-9 px-3 rounded-lg border border-outline-variant text-on-surface-variant text-xs font-bold hover:border-primary hover:text-primary flex items-center gap-1.5 whitespace-nowrap"
            >
              <QrCode className="w-3.5 h-3.5" /> Room QR
            </button>
            <div className="flex items-center gap-2">
              {displayRoom.reservationId && (
                <button
                  onClick={() => setShowChat(true)}
                  className="h-9 px-3 rounded-lg border border-outline-variant text-on-surface-variant text-xs font-bold hover:border-primary hover:text-primary flex items-center gap-1.5 whitespace-nowrap"
                  title="Message this guest (Folio Chat)"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> Chat
                </button>
              )}
              {(displayRoom.reservationId || displayRoom.status === 'occupied' || displayRoom.status === 'occupied_vip') && (
                <button
                  type="button"
                  onClick={() => setShowFolio(true)}
                  className="h-9 px-3 rounded-lg border border-primary text-primary text-xs font-bold hover:bg-highlight flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Receipt className="w-3.5 h-3.5" /> Folio &amp; Checkout
                </button>
              )}
              <button onClick={onClose} className="px-4 py-2 bg-on-surface text-inverse-on-surface rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>

      {showFolio && (displayRoom.reservationId || displayRoom.id) && (
        <RoomFolioModal
          reservationId={displayRoom.reservationId}
          roomId={displayRoom.id}
          roomNumber={displayRoom.number}
          guestName={displayRoom.guestName}
          propertyName={propertyName}
          currency={currency}
          upiId={upiId}
          onClose={() => setShowFolio(false)}
          onCheckedOut={() => {
            onRefreshRooms();
            setShowFolio(false);
            onClose();
          }}
        />
      )}

      {showQr && <RoomQrModal roomNumber={displayRoom.number} roomId={displayRoom.id} onClose={() => setShowQr(false)} />}

      {showChat && displayRoom.reservationId && (
        <StaffFolioChatModal
          propertyId={propertyId}
          reservationId={displayRoom.reservationId}
          roomNumber={displayRoom.number}
          guestName={displayRoom.guestName}
          onClose={() => setShowChat(false)}
        />
      )}

      {showCheckIn && (
        <CheckInModal
          propertyId={propertyId}
          room={displayRoom}
          source={hasExternalPms ? 'imported' : 'built_in'}
          onClose={() => setShowCheckIn(false)}
          onCheckedIn={() => {
            onRefreshRooms();
            setShowCheckIn(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
