/**
 * Turns each menu item's free-text prep time ("15-20 mins") into a single
 * number of minutes to plan around — the upper bound of any range in the
 * string, since promising the optimistic end of a range is how you get a
 * guest calling down asking where their food is.
 */
export function parsePrepMinutes(prepTime?: string): number {
  if (!prepTime) return 20; // matches the UI's long-standing "20-25 mins" fallback
  const numbers = prepTime.match(/\d+/g);
  if (!numbers || numbers.length === 0) return 20;
  return Math.max(...numbers.map(Number));
}

export interface OrderEta {
  /** Minutes to plan around, from order creation — the max across every item ordered (the kitchen works on them together, not in parallel per item). */
  minutes: number;
  /** Wall-clock estimate, e.g. "7:42 PM". */
  etaLabel: string;
  /** Short human status line for the given order status. */
  statusLabel: string;
}

export function computeOrderEta(
  items: { prepTime?: string }[],
  createdAt: string,
  status: 'new' | 'preparing' | 'ready'
): OrderEta {
  const minutes = items.length > 0 ? Math.max(...items.map(i => parsePrepMinutes(i.prepTime))) : 20;
  const etaTime = new Date(new Date(createdAt).getTime() + minutes * 60_000);
  const etaLabel = etaTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const statusLabel = {
    new: 'Order received — kitchen will start shortly',
    preparing: 'Preparing your order',
    ready: 'Ready — on its way to your room',
  }[status];

  return { minutes, etaLabel, statusLabel };
}
