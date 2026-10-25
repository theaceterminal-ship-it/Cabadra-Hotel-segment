/**
 * The kitchen's own screen (/kitchen/:token, 0082): no login, the token in
 * the link is the key. Reception copies the link from its Kitchen tab.
 */
import { supabase } from './supabaseClient';
import type { KdsOrder } from '../types';

interface KitchenOrderRow {
  id: string;
  status: KdsOrder['status'];
  items: { name: string; quantity: number; fromRecommendation?: boolean }[] | null;
  notes?: string;
  rejectionNote?: string;
  createdAt: string;
  roomNumber?: string;
  vip: boolean;
}

export interface KitchenSnapshot {
  propertyName: string;
  serverTime: string;
  orders: KitchenOrderRow[];
}

export async function fetchKitchenOrders(token: string): Promise<KitchenSnapshot> {
  const { data, error } = await supabase.rpc('kitchen_display_orders', { p_token: token });
  if (error) throw new Error(error.message);
  return data as KitchenSnapshot;
}

/** new → preparing/ready, preparing → ready, ready → preparing. Delivery is the runner's, not the kitchen's. */
export async function setKitchenOrderStatus(token: string, orderId: string, status: 'preparing' | 'ready'): Promise<void> {
  const { error } = await supabase.rpc('kitchen_display_set_status', { p_token: token, p_order_id: orderId, p_status: status });
  if (error) throw new Error(error.message);
}

/** Only a new order, with a reason the guest sees; its charge comes off the bill. */
export async function rejectKitchenOrder(token: string, orderId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('kitchen_display_reject', { p_token: token, p_order_id: orderId, p_note: note });
  if (error) throw new Error(error.message);
}

/** Server time minus the device's clock, so timers are right on a tablet whose clock is off. */
export function toKdsOrder(row: KitchenOrderRow, skewMs: number, previous?: KdsOrder): KdsOrder {
  const elapsed = Math.max(0, Math.round((Date.now() + skewMs - new Date(row.createdAt).getTime()) / 1000));
  return {
    id: row.id,
    orderNumber: `#${row.id.slice(0, 4).toUpperCase()}`,
    roomNumber: `Room ${row.roomNumber ?? '?'}`,
    isVip: row.vip,
    status: row.status,
    timeElapsed: `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`,
    timerSeconds: elapsed,
    isOverdue: elapsed > 900 && (row.status === 'new' || row.status === 'preparing'),
    notes: row.notes,
    rejectionNote: row.rejectionNote,
    items: (row.items ?? []).map((i, idx) => ({
      name: i.name,
      quantity: i.quantity,
      // The tick-off checklist is local to the screen; keep it across refreshes.
      completed: previous?.items[idx]?.completed,
    })),
  };
}
