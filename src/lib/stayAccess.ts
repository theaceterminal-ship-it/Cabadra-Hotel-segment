import { supabase } from './supabaseClient';

/**
 * Who may open a stay's guest app from the room QR (0091). Staff side: what a
 * stay's access looks like, sending the emailed code, switching to the stay
 * link. Guest side: what the QR shows, entering the code, asking for a new one.
 * The code itself is made and mailed on the server and never reaches a browser
 * other than the guest's own inbox.
 */

/** Text-message codes (Twilio) are built but not deployed; see supabase/pending/twilio-sms. */
export const SMS_OTP_ENABLED = false;

export type StayAccessMode = 'open' | 'link' | 'email' | 'sms';

export interface StayAccessInfo {
  reservationId: string;
  status: string;
  guestName: string;
  roomNumber: string;
  guestToken: string;
  accessMode: StayAccessMode;
  hasEmail: boolean;
  emailHint?: string;
  hasPhone: boolean;
  codeSentTo?: string;
  codeChannel?: 'email' | 'sms';
  codeIssuedAt?: string;
  codeLastSentAt?: string;
  codeSendError?: string;
  codeVerifiedCount: number;
  codeLockedUntil?: string;
  codeThrownAway: boolean;
}

export async function fetchStayAccess(reservationId: string): Promise<StayAccessInfo> {
  const { data, error } = await supabase.rpc('staff_stay_access', { p_reservation_id: reservationId });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  return {
    reservationId: d.reservation_id as string,
    status: d.status as string,
    guestName: (d.guest_name as string) ?? '',
    roomNumber: (d.room_number as string) ?? '',
    guestToken: d.guest_token as string,
    accessMode: d.access_mode as StayAccessMode,
    hasEmail: d.has_email === true,
    emailHint: (d.email_hint as string) ?? undefined,
    hasPhone: d.has_phone === true,
    codeSentTo: (d.code_sent_to as string) ?? undefined,
    codeChannel: (d.code_channel as 'email' | 'sms') ?? undefined,
    codeIssuedAt: (d.code_issued_at as string) ?? undefined,
    codeLastSentAt: (d.code_last_sent_at as string) ?? undefined,
    codeSendError: (d.code_send_error as string) ?? undefined,
    codeVerifiedCount: Number(d.code_verified_count ?? 0),
    codeLockedUntil: (d.code_locked_until as string) ?? undefined,
    codeThrownAway: d.code_thrown_away === true,
  };
}

/** Makes a fresh code and emails it to the guest. The code is not returned. */
export async function sendStayCodeByEmail(reservationId: string): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await supabase.functions.invoke('stay-access-code', { body: { action: 'issue', reservationId } });
  if (error) return { ok: false, message: 'Could not reach the server. Try again, or use the stay link.' };
  const res = data as { success?: boolean; message?: string };
  return res?.success ? { ok: true } : { ok: false, message: res?.message ?? 'The code could not be sent.' };
}

/** Drops any code and makes the personal stay link the way in. */
export async function switchToStayLink(reservationId: string): Promise<void> {
  const { error } = await supabase.rpc('staff_set_stay_access_link', { p_reservation_id: reservationId });
  if (error) throw new Error(error.message);
}

// ---- the prompt that follows a check-in -------------------------------------
export const STAY_ACCESS_EVENT = 'cabadra:stay-access';
/** 'auto' = email the code if the guest has an email, else the stay link; 'link' = reception chose the stay link in the check-in box. */
export type StayAccessChoice = 'auto' | 'link';

export function promptStayAccess(reservationId: string, choice: StayAccessChoice = 'auto'): void {
  window.dispatchEvent(new CustomEvent(STAY_ACCESS_EVENT, { detail: { reservationId, choice } }));
}

// ---- the guest, at the room QR ----------------------------------------------
export type RoomGate =
  | { status: 'open'; token: string }
  | { status: 'none' }
  | { status: 'slow_down' }
  | { status: 'link_required'; propertyName: string; roomNumber: string }
  | { status: 'code_required'; channel: 'email' | 'sms'; hint: string; propertyName: string; roomNumber: string; locked: boolean; needsNewCode: boolean };

export async function fetchRoomGate(roomCode: string, savedToken?: string | null): Promise<RoomGate> {
  const { data, error } = await supabase.rpc('guest_room_gate', { p_room_code: roomCode, p_token: savedToken || null });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  switch (d.status) {
    case 'open': return { status: 'open', token: d.token as string };
    case 'link_required': return { status: 'link_required', propertyName: d.property_name as string, roomNumber: d.room_number as string };
    case 'code_required':
      return {
        status: 'code_required', channel: d.channel as 'email' | 'sms', hint: (d.hint as string) ?? '',
        propertyName: d.property_name as string, roomNumber: d.room_number as string,
        locked: d.locked === true, needsNewCode: d.needs_new_code === true,
      };
    case 'slow_down': return { status: 'slow_down' };
    default: return { status: 'none' };
  }
}

export type VerifyResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'wrong' | 'locked' | 'needs_new_code' | 'slow_down' | 'none'; attemptsLeft?: number; retryAfterSeconds?: number };

export async function verifyStayCode(roomCode: string, code: string): Promise<VerifyResult> {
  const { data, error } = await supabase.rpc('guest_verify_stay_code', { p_room_code: roomCode, p_code: code });
  if (error) throw new Error(error.message);
  const d = data as Record<string, unknown>;
  if (d.ok === true) return { ok: true, token: d.token as string };
  return { ok: false, reason: d.reason as 'wrong', attemptsLeft: d.attempts_left as number | undefined, retryAfterSeconds: d.retry_after_seconds as number | undefined };
}

/** "Send me a new code": always to the address on file; the answer never says whether anything was sent. */
export async function requestNewStayCode(roomCode: string): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await supabase.functions.invoke('stay-access-code', { body: { action: 'resend', roomCode } });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    return { ok: false, message: status === 429 ? 'Please wait a little before asking for another code.' : 'Could not send it just now. Please try again, or ask the front desk.' };
  }
  const res = data as { success?: boolean; message?: string };
  return res?.success ? { ok: true } : { ok: false, message: res?.message };
}
