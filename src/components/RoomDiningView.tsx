import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MenuItem, MenuOption, KdsOrder, AppView } from '../types';
import {
  fetchGuestRecommendations, fetchCheckoutSuggestion, placeGuestOrder, logOfferEvents,
  GuestRecommendation, CheckoutSuggestion,
} from '../lib/guestApi';
import { formatCurrency } from '../lib/currency';
import { DynamicIslandStatusBar } from './DynamicIslandStatusBar';
import {
  ArrowLeft, Search, ShoppingBag, Plus, Minus, Check, Utensils, Clock, X, Sparkles, ChevronUp, PencilLine, BedDouble,
} from 'lucide-react';

/**
 * One cart line: a dish plus the exact size, add-ons and note chosen, so
 * "Pizza (Large) + Cheese" and "Pizza (Small)" are separate lines. `key`
 * identifies that combination as it was first added.
 */
interface CartEntry {
  key: string;
  item: MenuItem;
  variation?: MenuOption;
  addons: MenuOption[];
  quantity: number;
  viaRecommendation?: boolean;
  /** Per-item customization ("no onions", "extra spicy") — separate from the order-wide note. */
  note?: string;
}

interface RoomDiningViewProps {
  /** The guest_token from the URL — proves this browser represents this stay. Never a login. */
  token: string;
  propertyName: string;
  roomNumber: string;
  menuItems: MenuItem[];
  currency: string;
  onNavigate: (view: AppView) => void;
  onPlaceOrder: (order: KdsOrder) => void;
}

/** The dish sheet: adding a dish (from the grid, a pick or the checkout prompt), or editing a line already in the cart. */
interface DishSheetState {
  item: MenuItem;
  viaRecommendation: boolean;
  surface?: string;
  editKey?: string;
}

/** How long "Complete your order" waits before placing the order the guest already asked for (Churmuri's MEAL_PROMPT_AUTO_MS). */
const CHECKOUT_PROMPT_MS = 10_000;
/** The suggestion is a nice-to-have; a slow network must not hold the order up. */
const SUGGESTION_TIMEOUT_MS = 2500;

export const RoomDiningView: React.FC<RoomDiningViewProps> = ({
  token,
  propertyName,
  roomNumber,
  menuItems,
  currency,
  onNavigate,
  onPlaceOrder,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<{ [lineKey: string]: CartEntry }>({});
  const [showCartSheet, setShowCartSheet] = useState<boolean>(false);
  const [dietaryNote, setDietaryNote] = useState<string>('');
  const [orderSuccess, setOrderSuccess] = useState<boolean>(false);
  const [placingOrder, setPlacingOrder] = useState<boolean>(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [dishSheet, setDishSheet] = useState<DishSheetState | null>(null);
  const [suggestion, setSuggestion] = useState<CheckoutSuggestion | null>(null);
  const [checkingSuggestion, setCheckingSuggestion] = useState(false);
  // The prompt is asked once per cart: a guest who says "no thanks" and then
  // edits the cart isn't asked again on the way out.
  const promptedThisCart = useRef(false);

  // Recommendations come from the live rule-based engine in
  // supabase/migrations/0001_init.sql's guest_get_recommendations(), scoped
  // by this stay's token server-side — nothing client-side picks the room.
  const [recommendations, setRecommendations] = useState<GuestRecommendation[]>([]);
  const [recsError, setRecsError] = useState<boolean>(false);

  useEffect(() => {
    fetchGuestRecommendations(token)
      .then(setRecommendations)
      .catch(() => setRecsError(true));
  }, [token]);

  // Phase 1 of the Offer Engine design: log impressions, don't rank or
  // place differently yet. Fires once per load of the on-open picks —
  // "recommendations" only changes reference when the fetch above resolves.
  useEffect(() => {
    if (recommendations.length > 0) {
      logOfferEvents(
        token,
        recommendations.map((r) => ({ offerId: r.menuItemId, event: 'impression', surface: 'on_open' }))
      );
    }
  }, [recommendations, token]);

  // The hotel's own categories, in menu order — not a fixed list that only
  // matched demo data.
  const categoryNames = useMemo(() => [...new Set(menuItems.map(m => m.category).filter(Boolean))], [menuItems]);
  const hasOptions = (item: MenuItem) => (item.variations?.length ?? 0) > 0 || (item.addons?.length ?? 0) > 0;
  // Recommendation payloads carry a slimmer copy of the dish; options live on the full menu entry.
  const fullItem = (item: MenuItem) => menuItems.find(m => m.id === item.id) ?? item;

  const query = searchQuery.trim().toLowerCase();
  const filteredItems = menuItems.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch = !query || item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query);
    return matchesCat && matchesSearch;
  });
  // "All dishes" with no search reads as the menu, section by section; anything narrower is one grid.
  const sections = selectedCategory === 'all' && !query
    ? categoryNames.map(c => ({ title: c, items: filteredItems.filter(i => i.category === c) })).filter(s => s.items.length > 0)
    : [{ title: '', items: filteredItems }];

  const lineKey = (item: MenuItem, variation?: MenuOption, addons: MenuOption[] = [], note = '') =>
    [item.id, variation?.id ?? '', ...addons.map(a => a.id).sort(), note.trim().toLowerCase()].join('|');

  const addLine = (item: MenuItem, variation: MenuOption | undefined, addons: MenuOption[], quantity: number, viaRecommendation: boolean, surface?: string, note = '') => {
    const key = lineKey(item, variation, addons, note);
    const firstOfDish = !Object.values(cart).some(c => c.item.id === item.id);
    setCart((prev) => {
      const existing = prev[key];
      return {
        ...prev,
        [key]: {
          key,
          item,
          variation,
          addons,
          quantity: (existing?.quantity ?? 0) + quantity,
          // First add wins — once a guest has taken the recommendation once,
          // a later +1 tap from the main grid still counts as the same pick.
          viaRecommendation: existing ? existing.viaRecommendation : viaRecommendation,
          note: existing?.note ?? (note.trim() || undefined),
        },
      };
    });
    // Only the FIRST add of a dish counts as the recommendation's
    // conversion — a repeat +1 is normal ordering, not a second acceptance.
    if (viaRecommendation && firstOfDish) {
      logOfferEvents(token, [{ offerId: item.id, event: 'action', surface: surface ?? 'unknown' }]);
    }
  };

  /** Editing a line from the cart: same dish, new choices. Keeps the line's recommendation credit. */
  const replaceLine = (oldKey: string, variation: MenuOption | undefined, addons: MenuOption[], quantity: number, note: string) => {
    setCart((prev) => {
      const old = prev[oldKey];
      if (!old) return prev;
      const copy = { ...prev };
      delete copy[oldKey];
      const key = lineKey(old.item, variation, addons, note);
      const merged = copy[key];
      copy[key] = {
        ...old,
        key,
        variation,
        addons,
        note: note.trim() || undefined,
        quantity: (merged?.quantity ?? 0) + quantity,
      };
      return copy;
    });
  };

  /** The + on a card: plain dishes go straight in; dishes with sizes or add-ons open the sheet. */
  const quickAdd = (rawItem: MenuItem, viaRecommendation: boolean = false, surface?: string) => {
    const item = fullItem(rawItem);
    if (hasOptions(item)) {
      setDishSheet({ item, viaRecommendation, surface });
      return;
    }
    addLine(item, undefined, [], 1, viaRecommendation, surface);
  };

  const openDish = (rawItem: MenuItem, viaRecommendation = false, surface?: string) =>
    setDishSheet({ item: fullItem(rawItem), viaRecommendation, surface });

  const changeLineQty = (key: string, delta: number) => {
    setCart((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      const quantity = existing.quantity + delta;
      if (quantity <= 0) {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      return { ...prev, [key]: { ...existing, quantity } };
    });
  };

  const unitPrice = (c: Pick<CartEntry, 'item' | 'variation' | 'addons'>) =>
    (c.variation ? c.variation.price : c.item.price) + c.addons.reduce((sum, a) => sum + a.price, 0);
  const countForDish = (itemId: string) => Object.values(cart).filter(c => c.item.id === itemId).reduce((n, c) => n + c.quantity, 0);
  /** Price shown on a dish card: from the cheapest size when it has sizes. */
  const fromPrice = (item: MenuItem) => (item.variations?.length ? Math.min(...item.variations.map(v => v.price)) : item.price);

  const cartItemsList: CartEntry[] = Object.values(cart);
  const totalCartCount: number = cartItemsList.reduce((acc, curr) => acc + curr.quantity, 0);
  // Exactly what guest_place_order charges to the room — no invented taxes
  // or service charge on top.
  const grandTotal: number = cartItemsList.reduce((acc, curr) => acc + unitPrice(curr) * curr.quantity, 0);
  const recommendedNotInCart = recommendations.filter(r => r.menuItem && countForDish(r.menuItemId) === 0);

  useEffect(() => {
    if (cartItemsList.length === 0) promptedThisCart.current = false;
  }, [cartItemsList.length]);

  const placeOrder = async () => {
    if (cartItemsList.length === 0 || placingOrder) return;
    setPlacingOrder(true);
    setOrderError(null);

    try {
      // guest_place_order (0073) derives the room from the token and prices
      // every line from the menu server-side; only the choices go up.
      const result = await placeGuestOrder(
        token,
        cartItemsList.map((c) => ({
          menuItemId: c.item.id,
          quantity: c.quantity,
          variationId: c.variation?.id,
          addonIds: c.addons.map(a => a.id),
          fromRecommendation: c.viaRecommendation ?? false,
          note: c.note,
        })),
        dietaryNote
      );

      const newKdsOrder: KdsOrder = {
        id: result.order.id,
        orderNumber: `#${result.order.id.slice(0, 4).toUpperCase()}`,
        roomNumber: `Room ${roomNumber}`,
        isVip: true,
        isRush: false,
        status: 'new',
        timeElapsed: '00:01',
        timerSeconds: 1,
        notes: dietaryNote,
        items: cartItemsList.map(c => ({
          name: [c.item.name, c.variation ? `(${c.variation.name})` : '', c.addons.length ? `+ ${c.addons.map(a => a.name).join(', ')}` : ''].filter(Boolean).join(' '),
          quantity: c.quantity,
          modifier: c.note || undefined,
        })),
      };
      onPlaceOrder(newKdsOrder);

      setCart({});
      setDietaryNote('');
      setSuggestion(null);
      setShowCartSheet(false);
      setOrderSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSuggestion(null);
      setOrderError(err instanceof Error ? err.message : 'Your order didn’t go through. Please try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  /**
   * Place order: first, once per cart, ask whether the order has an obvious
   * gap (guest_checkout_suggestion, 0076). If it does, the "Complete your
   * order" prompt opens and places the order itself when the guest is done;
   * if not, or the question takes too long, the order goes straight in.
   */
  const handleCheckout = async () => {
    if (cartItemsList.length === 0 || placingOrder || checkingSuggestion) return;
    if (!promptedThisCart.current) {
      promptedThisCart.current = true;
      setCheckingSuggestion(true);
      const found = await Promise.race([
        fetchCheckoutSuggestion(token, [...new Set(cartItemsList.map(c => c.item.id))]),
        new Promise<null>(resolve => setTimeout(() => resolve(null), SUGGESTION_TIMEOUT_MS)),
      ]);
      setCheckingSuggestion(false);
      if (found) {
        setSuggestion(found);
        logOfferEvents(token, found.items.map(i => ({ offerId: i.id, event: 'impression', surface: 'checkout', context: { gap: found.gap } })));
        return;
      }
    }
    await placeOrder();
  };

  const openCart = () => {
    setShowCartSheet(true);
    // Snapshot at the moment of opening — not a live subscription that
    // re-fires every time the cart changes while the sheet is up.
    if (recommendedNotInCart.length > 0) {
      logOfferEvents(
        token,
        recommendedNotInCart.map((r) => ({ offerId: r.menuItemId, event: 'impression', surface: 'cart_sheet' }))
      );
    }
  };

  const editingLine = dishSheet?.editKey ? cart[dishSheet.editKey] : undefined;

  return (
    <div id="room-dining-canvas" className="flex-1 min-h-screen bg-surface flex flex-col">
      <header className="sticky top-0 z-30 bg-surface/85 backdrop-blur-md border-b border-white/50">
        <div className="max-w-5xl mx-auto px-4 pt-3 pb-2 flex items-center gap-3">
          <button
            id="btn-back-to-guest-home"
            onClick={() => onNavigate('guest_home')}
            aria-label="Back"
            className="w-10 h-10 rounded-full bg-surface-container-lowest shadow-sm flex items-center justify-center text-on-surface shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-on-surface leading-tight truncate">In-room dining</h1>
            <p className="text-xs text-on-surface-variant truncate flex items-center gap-1">
              <BedDouble className="w-3.5 h-3.5 shrink-0" /> Delivered to Room {roomNumber}
            </p>
          </div>
          <DynamicIslandStatusBar token={token} currency={currency} roomNumber={roomNumber} className="shrink-0" />
        </div>

        <div className="max-w-5xl mx-auto px-4 pb-2">
          <label className="flex items-center gap-2 h-11 px-4 rounded-full bg-surface-container-lowest shadow-sm">
            <Search className="w-4 h-4 text-on-surface-variant shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search dishes at ${propertyName}`}
              className="flex-1 min-w-0 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="text-on-surface-variant"><X className="w-4 h-4" /></button>
            )}
          </label>
        </div>

        <div className="max-w-5xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-none">
          {[{ id: 'all', label: 'All dishes' }, ...categoryNames.map(c => ({ id: c, label: c }))].map((cat) => {
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`relative px-4 h-9 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${active ? 'text-on-primary' : 'bg-surface-container-lowest text-on-surface-variant'}`}
              >
                {active && <motion.span layoutId="dining-cat-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
                <span className="relative">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="max-w-5xl mx-auto w-full px-4 pt-4 pb-32 space-y-7 flex-1">
        <AnimatePresence>
          {orderSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12 }}
              className="bg-success text-on-success p-4 rounded-[22px] shadow-lg flex items-center gap-3"
            >
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: 'spring' }} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Check className="w-5 h-5" />
              </motion.span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">Order placed</p>
                <p className="text-xs opacity-90">The kitchen has it. Tap the status pill at the top to follow it.</p>
              </div>
              <button onClick={() => setOrderSuccess(false)} aria-label="Dismiss" className="p-1 opacity-80 shrink-0"><X className="w-4 h-4" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Picked for you — live output of the rule-based recommendation
            engine (guest_get_recommendations in the migrations), not a hand-picked list. */}
        {recommendations.length > 0 && !query && selectedCategory === 'all' && (
          <section id="recommended-for-stay">
            <h2 className="text-base font-bold text-on-surface mb-3 flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Picked for you</h2>
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scroll-px-4 scrollbar-none snap-x">
              {recommendations.map((rec, i) => {
                if (!rec.menuItem) return null;
                const item = fullItem(rec.menuItem as unknown as MenuItem);
                return (
                  <motion.div
                    key={rec.menuItemId}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="snap-start shrink-0 w-40"
                  >
                    <DishCard
                      item={item}
                      qty={countForDish(item.id)}
                      currency={currency}
                      price={fromPrice(item)}
                      fromLabel={!!item.variations?.length}
                      onOpen={() => openDish(item, true, 'on_open')}
                      onAdd={() => quickAdd(item, true, 'on_open')}
                      subline={rec.reason}
                    />
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}
        {recsError && (
          <p className="text-[11px] text-on-surface-variant">Picks aren’t available right now. The full menu is below.</p>
        )}

        {sections.map(section => (
          <section key={section.title || 'results'}>
            {section.title && <h2 className="text-base font-bold text-on-surface mb-3">{section.title}</h2>}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-5">
              {section.items.map((item, i) => (
                <motion.div
                  key={item.id}
                  id={`menu-item-card-${item.id}`}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '0px 0px -40px 0px' }}
                  transition={{ duration: 0.35, delay: (i % 4) * 0.04 }}
                  className="min-w-0"
                >
                  <DishCard
                    item={item}
                    qty={countForDish(item.id)}
                    currency={currency}
                    price={fromPrice(item)}
                    fromLabel={!!item.variations?.length}
                    onOpen={() => openDish(item)}
                    onAdd={() => quickAdd(item)}
                    subline={item.description}
                  />
                </motion.div>
              ))}
            </div>
          </section>
        ))}

        {filteredItems.length === 0 && (
          <div className="py-16 text-center text-on-surface-variant">
            <span className="w-12 h-12 rounded-full bg-surface-container-lowest flex items-center justify-center mx-auto"><Utensils className="w-5 h-5" /></span>
            <p className="text-sm font-semibold text-on-surface mt-3">{menuItems.length ? 'No dishes match that' : 'The menu isn’t up yet'}</p>
            <p className="text-xs mt-1">{menuItems.length ? 'Try another word or category.' : 'Call the front desk to order.'}</p>
          </div>
        )}
      </div>

      {/* Floating cart bar — thumb-reachable at the bottom; only once there's something in it. */}
      <AnimatePresence>
        {totalCartCount > 0 && !showCartSheet && (
          <motion.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="fixed bottom-4 inset-x-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-md z-40"
          >
            <button
              id="btn-open-cart"
              onClick={openCart}
              className="w-full h-14 pl-3 pr-5 rounded-full bg-primary text-on-primary shadow-xl flex items-center justify-between"
            >
              <span className="flex items-center gap-2.5 font-bold text-sm">
                <motion.span
                  key={totalCartCount}
                  initial={{ scale: 1.35 }}
                  animate={{ scale: 1 }}
                  className="relative w-9 h-9 rounded-full bg-white/15 flex items-center justify-center"
                >
                  <ShoppingBag className="w-4.5 h-4.5" />
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-warning text-white text-[11px] font-bold flex items-center justify-center">{totalCartCount}</span>
                </motion.span>
                View cart
              </span>
              <span className="flex items-center gap-1.5 font-bold text-sm">
                {formatCurrency(grandTotal, currency)} <ChevronUp className="w-4 h-4" />
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCartSheet && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={e => e.target === e.currentTarget && setShowCartSheet(false)}
          >
            <motion.div
              className="w-full sm:max-w-md bg-surface-container-lowest rounded-t-[28px] shadow-2xl flex flex-col max-h-[90svh]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            >
              <div className="px-5 pt-3 pb-3 shrink-0">
                <div className="w-10 h-1 rounded-full bg-outline-variant mx-auto mb-3" />
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg text-on-surface">Your order</h3>
                    <p className="text-xs text-on-surface-variant">{totalCartCount} {totalCartCount === 1 ? 'item' : 'items'} · to Room {roomNumber}</p>
                  </div>
                  <button onClick={() => setShowCartSheet(false)} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-surface-container-low flex items-center justify-center text-on-surface-variant">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5">
                {cartItemsList.length === 0 ? (
                  <div className="py-14 flex flex-col items-center justify-center text-center text-on-surface-variant">
                    <ShoppingBag className="w-10 h-10 mb-2 opacity-50" />
                    <p className="font-bold text-sm text-on-surface">Your cart is empty</p>
                    <p className="text-xs mt-1">Add a dish to order to your room.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-outline-variant">
                    <AnimatePresence initial={false}>
                      {cartItemsList.map((line) => (
                        <motion.div
                          key={line.key}
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="flex items-center gap-3 py-3">
                            <button onClick={() => setDishSheet({ item: fullItem(line.item), viaRecommendation: !!line.viaRecommendation, editKey: line.key })} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                              <DishThumb item={line.item} className="w-14 h-14 rounded-2xl" />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <VegMark veg={line.item.isVeg} />
                                  <span className="font-bold text-sm text-on-surface truncate">{line.item.name}</span>
                                </span>
                                {(line.variation || line.addons.length > 0) && (
                                  <span className="block text-[11px] text-on-surface-variant truncate">
                                    {[line.variation?.name, ...line.addons.map(a => `+ ${a.name}`)].filter(Boolean).join(' · ')}
                                  </span>
                                )}
                                <span className="flex items-center gap-1 text-[11px] text-on-surface-variant mt-0.5 truncate">
                                  <PencilLine className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{line.note ? `“${line.note}”` : 'Add a note or change'}</span>
                                </span>
                              </span>
                            </button>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <span className="text-sm font-bold text-on-surface">{formatCurrency(unitPrice(line) * line.quantity, currency)}</span>
                              <Stepper value={line.quantity} onMinus={() => changeLineQty(line.key, -1)} onPlus={() => changeLineQty(line.key, 1)} />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {/* Goes well with — right where the guest is deciding what else to add. */}
                {recommendedNotInCart.length > 0 && cartItemsList.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-on-surface mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Goes well with your order</p>
                    <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-5 px-5 scrollbar-none">
                      {recommendedNotInCart.map(rec => {
                        const item = fullItem(rec.menuItem as unknown as MenuItem);
                        return (
                          <div key={rec.menuItemId} className="shrink-0 w-56 flex items-center gap-2.5 p-2 rounded-2xl bg-surface-container-low">
                            <DishThumb item={item} className="w-12 h-12 rounded-xl" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-bold text-on-surface truncate">{item.name}</span>
                              <span className="block text-[11px] text-on-surface-variant">{formatCurrency(fromPrice(item), currency)}</span>
                            </span>
                            <button onClick={() => quickAdd(item, true, 'cart_sheet')} aria-label={`Add ${item.name}`} className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {cartItemsList.length > 0 && (
                  <label className="block">
                    <span className="text-xs font-bold text-on-surface">Note for the kitchen <span className="font-normal text-on-surface-variant">(optional)</span></span>
                    <textarea
                      rows={2}
                      value={dietaryNote}
                      onChange={(e) => setDietaryNote(e.target.value)}
                      placeholder="Allergies, cutlery for two, ring before entering…"
                      className="mt-1.5 w-full p-3 text-sm border border-outline-variant rounded-2xl bg-surface-container-lowest focus:border-primary focus:outline-none resize-none"
                    />
                  </label>
                )}
              </div>

              {cartItemsList.length > 0 && (
                <div className="px-5 pt-3 border-t border-outline-variant space-y-2.5 shrink-0" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
                  <div className="flex justify-between items-baseline">
                    {/* The room comes from this stay's reservation server-side (guest_place_order), never from the page. */}
                    <span className="text-xs text-on-surface-variant">Charged to Room {roomNumber}</span>
                    <span className="font-bold text-lg text-on-surface">{formatCurrency(grandTotal, currency)}</span>
                  </div>
                  {orderError && <p className="text-xs text-error">{orderError}</p>}
                  <motion.button
                    id="btn-place-dining-order"
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCheckout}
                    disabled={placingOrder || checkingSuggestion}
                    className="w-full h-13 py-3.5 bg-primary text-on-primary rounded-full font-bold text-sm flex items-center justify-center gap-2 shadow-md disabled:opacity-70"
                  >
                    {placingOrder || checkingSuggestion ? (
                      <><span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> {placingOrder ? 'Placing your order…' : 'One moment…'}</>
                    ) : (
                      <>Place order · {formatCurrency(grandTotal, currency)}</>
                    )}
                  </motion.button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {suggestion && (
          <CompleteOrderModal
            suggestion={suggestion}
            currency={currency}
            placing={placingOrder}
            paused={!!dishSheet}
            isAdded={id => countForDish(id) > 0}
            priceOf={item => fromPrice(fullItem(item))}
            total={grandTotal}
            onAdd={item => quickAdd(item, true, 'checkout')}
            onOpen={item => openDish(item, true, 'checkout')}
            onPlace={placeOrder}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dishSheet && (
          <DishSheet
            key={dishSheet.editKey ?? dishSheet.item.id}
            item={dishSheet.item}
            currency={currency}
            initial={editingLine ? { variationId: editingLine.variation?.id, addonIds: editingLine.addons.map(a => a.id), quantity: editingLine.quantity, note: editingLine.note ?? '' } : undefined}
            inCart={countForDish(dishSheet.item.id)}
            onClose={() => setDishSheet(null)}
            onRemove={dishSheet.editKey ? () => { changeLineQty(dishSheet.editKey!, -Infinity); setDishSheet(null); } : undefined}
            onSave={(variation, addons, quantity, note) => {
              if (dishSheet.editKey) replaceLine(dishSheet.editKey, variation, addons, quantity, note);
              else addLine(dishSheet.item, variation, addons, quantity, dishSheet.viaRecommendation, dishSheet.surface, note);
              setDishSheet(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

/** India's veg / non-veg mark: a square with a dot, green or red. */
function VegMark({ veg }: { veg: boolean }) {
  return (
    <span aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'} className={`w-3.5 h-3.5 shrink-0 rounded-[3px] border-[1.5px] flex items-center justify-center ${veg ? 'border-[#1f8a4c]' : 'border-[#b3261e]'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${veg ? 'bg-[#1f8a4c]' : 'bg-[#b3261e]'}`} />
    </span>
  );
}

function DishThumb({ item, className }: { item: MenuItem; className: string }) {
  const [broken, setBroken] = useState(false);
  return item.image && !broken
    ? <img src={item.image} alt="" loading="lazy" onError={() => setBroken(true)} className={`${className} object-cover shrink-0 bg-surface-container-high`} />
    : <span className={`${className} shrink-0 bg-surface-container-high flex items-center justify-center text-on-surface-variant`}><Utensils className="w-5 h-5 opacity-50" /></span>;
}

function Stepper({ value, onMinus, onPlus }: { value: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-surface-container-low p-0.5">
      <button onClick={onMinus} aria-label="One less" className="w-7 h-7 rounded-full bg-surface-container-lowest text-on-surface flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
      <span className="w-5 text-center text-xs font-bold text-on-surface">{value}</span>
      <button onClick={onPlus} aria-label="One more" className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
    </div>
  );
}

/**
 * A dish tile the way Churmuri shows one: only the photo is a card (with the
 * + inside it); name, a line about it and the price sit on the page below.
 * Tapping the photo or name opens the dish sheet.
 */
function DishCard({ item, qty, currency, price, fromLabel, subline, onOpen, onAdd }: {
  item: MenuItem;
  qty: number;
  currency: string;
  price: number;
  fromLabel: boolean;
  subline?: string;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const [pulses, setPulses] = useState<number[]>([]);
  const [broken, setBroken] = useState(false);
  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    const id = Date.now() + Math.random();
    setPulses(p => [...p, id]);
    setTimeout(() => setPulses(p => p.filter(x => x !== id)), 700);
    onAdd();
  };

  return (
    <div className="min-w-0">
      <motion.div
        onClick={onOpen}
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.98 }}
        className="relative aspect-[4/3] rounded-[18px] overflow-hidden bg-surface-container-high shadow-sm hover:shadow-lg transition-shadow cursor-pointer"
      >
        {item.image && !broken
          ? <img src={item.image} alt={item.name} loading="lazy" onError={() => setBroken(true)} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-on-surface-variant"><Utensils className="w-8 h-8 opacity-40" /></div>}
        {qty > 0 && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-2 left-2 min-w-6 h-6 px-2 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center shadow">
            {qty} in cart
          </motion.span>
        )}
        <AnimatePresence>
          {pulses.map(id => (
            <motion.span key={id} initial={{ opacity: 1, y: 0 }} animate={{ opacity: 0, y: -36 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }} className="absolute bottom-12 right-4 text-sm font-bold text-white drop-shadow pointer-events-none">
              +1
            </motion.span>
          ))}
        </AnimatePresence>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={handleAdd}
          aria-label={`Add ${item.name}`}
          className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-surface-container-lowest text-on-surface shadow-md flex items-center justify-center"
        >
          <Plus className="w-5 h-5" />
        </motion.button>
      </motion.div>
      <button onClick={onOpen} className="block w-full text-left pt-2 px-0.5">
        <span className="flex items-center gap-1.5">
          <VegMark veg={item.isVeg} />
          <span className="font-bold text-sm text-on-surface truncate">{item.name}</span>
        </span>
        {subline && <span className="block text-[11.5px] text-on-surface-variant truncate mt-0.5">{subline}</span>}
        <span className="block text-[15px] font-bold text-on-surface mt-1">
          {fromLabel && <span className="text-[11px] font-semibold text-on-surface-variant mr-1">from</span>}
          {formatCurrency(price, currency)}
        </span>
      </button>
    </div>
  );
}

/**
 * Everything about one dish: photo, description, size (pick one), add-ons
 * (pick any), a note for the kitchen and how many. Also edits a line already
 * in the cart (`initial`), with a way to take it out.
 */
function DishSheet({ item, currency, initial, inCart, onClose, onSave, onRemove }: {
  item: MenuItem;
  currency: string;
  initial?: { variationId?: string; addonIds: string[]; quantity: number; note: string };
  inCart: number;
  onClose: () => void;
  onSave: (variation: MenuOption | undefined, addons: MenuOption[], quantity: number, note: string) => void;
  onRemove?: () => void;
}) {
  const variations = item.variations ?? [];
  const addons = item.addons ?? [];
  const [variationId, setVariationId] = useState<string>(initial?.variationId ?? variations[0]?.id ?? '');
  const [addonIds, setAddonIds] = useState<string[]>(initial?.addonIds ?? []);
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [note, setNote] = useState(initial?.note ?? '');
  const [broken, setBroken] = useState(false);

  const variation = variations.find(v => v.id === variationId);
  const chosenAddons = addons.filter(a => addonIds.includes(a.id));
  const unit = (variation ? variation.price : item.price) + chosenAddons.reduce((sum, a) => sum + a.price, 0);
  const toggleAddon = (id: string) => setAddonIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));

  return (
    <motion.div
      className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="w-full sm:max-w-md bg-surface-container-lowest rounded-t-[28px] sm:rounded-[28px] shadow-2xl flex flex-col max-h-[92svh] overflow-hidden"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
      >
        <div className={`relative ${item.image && !broken ? 'h-52' : 'h-24'} bg-surface-container-high shrink-0`}>
          {item.image && !broken
            ? <motion.img initial={{ scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: 0.8 }} src={item.image} alt="" onError={() => setBroken(true)} className="absolute inset-0 w-full h-full object-cover" />
            : <div className="absolute inset-0 flex items-center justify-center text-on-surface-variant"><Utensils className="w-10 h-10 opacity-40" /></div>}
          <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <VegMark veg={item.isVeg} />
              <h3 className="font-bold text-xl text-on-surface leading-snug">{item.name}</h3>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-on-surface-variant">
              <span className="font-bold text-base text-on-surface">{formatCurrency(variation ? variation.price : item.price, currency)}</span>
              {item.prepTime && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {item.prepTime}</span>}
              {inCart > 0 && !initial && <span className="inline-flex items-center gap-1 font-semibold"><Check className="w-3.5 h-3.5" /> {inCart} in cart</span>}
            </div>
            {item.description && <p className="text-sm text-on-surface-variant leading-relaxed mt-2">{item.description}</p>}
          </div>

          {variations.length > 0 && (
            <div>
              <p className="text-sm font-bold text-on-surface mb-2">Size <span className="font-normal text-on-surface-variant">· choose one</span></p>
              <div className="space-y-2">
                {variations.map(v => (
                  <label key={v.id} className={`flex items-center justify-between gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${variationId === v.id ? 'border-primary bg-highlight' : 'border-outline-variant'}`}>
                    <span className="flex items-center gap-2.5 text-sm text-on-surface">
                      <input type="radio" name="dish-size" checked={variationId === v.id} onChange={() => setVariationId(v.id)} className="accent-primary" />
                      {v.name}
                    </span>
                    <span className="text-sm font-semibold text-on-surface">{formatCurrency(v.price, currency)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {addons.length > 0 && (
            <div>
              <p className="text-sm font-bold text-on-surface mb-2">Add-ons <span className="font-normal text-on-surface-variant">· optional</span></p>
              <div className="space-y-2">
                {addons.map(a => (
                  <label key={a.id} className={`flex items-center justify-between gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${addonIds.includes(a.id) ? 'border-primary bg-highlight' : 'border-outline-variant'}`}>
                    <span className="flex items-center gap-2.5 text-sm text-on-surface">
                      <input type="checkbox" checked={addonIds.includes(a.id)} onChange={() => toggleAddon(a.id)} className="accent-primary" />
                      {a.name}
                    </span>
                    <span className="text-sm text-on-surface-variant">+ {formatCurrency(a.price, currency)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-sm font-bold text-on-surface">Note for this dish <span className="font-normal text-on-surface-variant">(optional)</span></span>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={140}
              placeholder="No onions, extra spicy…"
              className="mt-2 w-full h-11 px-4 rounded-2xl border border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:border-primary focus:outline-none"
            />
          </label>

          {onRemove && (
            <button onClick={onRemove} className="text-sm font-semibold text-error">Remove from order</button>
          )}
        </div>

        <div className="p-5 border-t border-outline-variant flex items-center gap-3 shrink-0" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-1 rounded-full bg-surface-container-low p-1">
            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} aria-label="One less" className="w-10 h-10 rounded-full bg-surface-container-lowest text-on-surface flex items-center justify-center"><Minus className="w-4 h-4" /></button>
            <span className="font-bold text-sm text-on-surface w-6 text-center">{quantity}</span>
            <button onClick={() => setQuantity(q => Math.min(20, q + 1))} aria-label="One more" className="w-10 h-10 rounded-full bg-surface-container-lowest text-on-surface flex items-center justify-center"><Plus className="w-4 h-4" /></button>
          </div>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => onSave(variation, chosenAddons, quantity, note)}
            disabled={variations.length > 0 && !variation}
            className="flex-1 h-12 bg-primary text-on-primary rounded-full font-bold text-sm disabled:opacity-60"
          >
            {initial ? 'Update' : 'Add'} · {formatCurrency(unit * quantity, currency)}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * "Complete your order", ported from Churmuri's MealCompletionModal. It
 * interrupts a guest who has already pressed Place order, so it doesn't get
 * to sit there: unless they engage, it places the order after 10 seconds.
 * Adding something cancels the countdown (never place an order out from
 * under someone mid-decision), and so does an open dish sheet. There's no
 * backdrop-dismiss and no corner ✕: the way out is the full-width button,
 * and it places the order, which is what the guest asked for.
 */
function CompleteOrderModal({ suggestion, currency, placing, paused, isAdded, priceOf, total, onAdd, onOpen, onPlace }: {
  suggestion: CheckoutSuggestion;
  currency: string;
  placing: boolean;
  paused: boolean;
  isAdded: (id: string) => boolean;
  priceOf: (item: MenuItem) => number;
  total: number;
  onAdd: (item: MenuItem) => void;
  onOpen: (item: MenuItem) => void;
  onPlace: () => void;
}) {
  const [remaining, setRemaining] = useState(CHECKOUT_PROMPT_MS);
  const engaged = suggestion.items.some(i => isAdded(i.id));
  // onPlace is rebuilt on every render; held in a ref so the countdown
  // depends only on whether it should be running (see the Churmuri note on
  // the timer that never reached zero).
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;

  useEffect(() => {
    if (engaged || placing || paused) return undefined;
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const left = CHECKOUT_PROMPT_MS - (Date.now() - startedAt);
      setRemaining(left);
      if (left <= 0) { clearInterval(tick); onPlaceRef.current(); }
    }, 100);
    return () => clearInterval(tick);
  }, [engaged, placing, paused]);

  const secondsLeft = Math.max(0, Math.ceil(remaining / 1000));

  return (
    <motion.div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-order-title"
        className="w-full max-w-md bg-surface-container-lowest rounded-[28px] shadow-2xl overflow-hidden max-h-[86svh] overflow-y-auto"
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
      >
        <div className="relative bg-primary text-on-primary px-6 pt-7 pb-5 text-center">
          {!engaged && !placing && (
            <div className="absolute top-0 inset-x-0 h-1 bg-white/25">
              <div className="h-full bg-white transition-[width] duration-100 ease-linear" style={{ width: `${Math.max(0, (remaining / CHECKOUT_PROMPT_MS) * 100)}%` }} />
            </div>
          )}
          <h3 id="complete-order-title" className="text-2xl font-bold leading-tight">{suggestion.pitch}</h3>
          <p className="text-[13px] font-semibold opacity-85 mt-1">{suggestion.reason}</p>
        </div>

        <div className="p-5 space-y-2.5">
          {suggestion.items.map((item, i) => {
            const added = isAdded(item.id);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.08 }}
                className="flex items-center gap-3 p-2.5 rounded-2xl border border-outline-variant"
              >
                <button onClick={() => onOpen(item)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <DishThumb item={item} className="w-14 h-14 rounded-xl" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <VegMark veg={item.isVeg} />
                      <span className="font-bold text-sm text-on-surface truncate">{item.name}</span>
                    </span>
                    <span className="block font-bold text-sm text-on-surface mt-0.5">{formatCurrency(priceOf(item), currency)}</span>
                  </span>
                </button>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => onAdd(item)}
                  disabled={added || placing}
                  className={`shrink-0 h-10 px-5 rounded-full text-sm font-bold ${added ? 'bg-success/15 text-success' : 'bg-primary text-on-primary'}`}
                >
                  {added ? <span className="inline-flex items-center gap-1"><Check className="w-4 h-4" /> Added</span> : 'Add'}
                </motion.button>
              </motion.div>
            );
          })}

          <button
            onClick={onPlace}
            disabled={placing}
            className="w-full mt-3 h-13 py-3.5 rounded-2xl bg-highlight text-on-highlight text-[15px] font-bold disabled:opacity-60"
          >
            {placing
              ? 'Placing your order…'
              : engaged
                ? `Place my order · ${formatCurrency(total, currency)}`
                : `No thanks, place my order${secondsLeft > 0 ? ` · ${secondsLeft}s` : ''}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
