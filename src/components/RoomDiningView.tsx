import React, { useState, useEffect } from 'react';
import { MenuItem, MenuOption, KdsOrder, AppView } from '../types';
import { fetchGuestRecommendations, placeGuestOrder, logOfferEvents, GuestRecommendation } from '../lib/guestApi';
import { formatCurrency } from '../lib/currency';
import {
  ArrowLeft,
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Check,
  Utensils,
  Clock,
  X,
  Sparkles,
  ChevronUp,
} from 'lucide-react';

/**
 * One cart line: a dish plus the exact size and add-ons chosen, so "Pizza
 * (Large) + Cheese" and "Pizza (Small)" are separate lines. `key` identifies
 * that combination.
 */
interface CartEntry {
  key: string;
  item: MenuItem;
  variation?: MenuOption;
  addons: MenuOption[];
  quantity: number;
  viaRecommendation?: boolean;
  /** Per-item customization ("no onions", "extra spicy") — separate from the order-wide dietary note. */
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
  const [cart, setCart] = useState<{ [itemId: string]: CartEntry }>({});
  const [showCartSheet, setShowCartSheet] = useState<boolean>(false);
  const [dietaryNote, setDietaryNote] = useState<string>('');
  const [orderSuccess, setOrderSuccess] = useState<boolean>(false);
  const [placingOrder, setPlacingOrder] = useState<boolean>(false);

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
  // place differently yet. Fires once per load of the on-open banner —
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
  const categories = [
    { id: 'all', label: 'All dishes' },
    ...[...new Set(menuItems.map(m => m.category).filter(Boolean))].map(c => ({ id: c, label: c })),
  ];
  // Dish being customized in the options sheet (size / add-ons), if any.
  const [optionsFor, setOptionsFor] = useState<{ item: MenuItem; viaRecommendation: boolean; surface?: string } | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const hasOptions = (item: MenuItem) => (item.variations?.length ?? 0) > 0 || (item.addons?.length ?? 0) > 0;
  // Recommendation payloads carry a slimmer copy of the dish; options live on the full menu entry.
  const fullItem = (item: MenuItem) => menuItems.find(m => m.id === item.id) ?? item;

  const filteredItems = menuItems.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const lineKey = (item: MenuItem, variation?: MenuOption, addons: MenuOption[] = []) =>
    [item.id, variation?.id ?? '', ...addons.map(a => a.id).sort()].join('|');

  const addLine = (item: MenuItem, variation: MenuOption | undefined, addons: MenuOption[], quantity: number, viaRecommendation: boolean, surface?: string) => {
    const key = lineKey(item, variation, addons);
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
          note: existing?.note,
        },
      };
    });
    // Only the FIRST add of a dish counts as the recommendation's
    // conversion — a repeat +1 is normal ordering, not a second acceptance.
    if (viaRecommendation && firstOfDish) {
      logOfferEvents(token, [{ offerId: item.id, event: 'action', surface: surface ?? 'unknown' }]);
    }
  };

  /** Dishes with sizes or add-ons open the options sheet; plain ones go straight in. */
  const addToCart = (rawItem: MenuItem, viaRecommendation: boolean = false, surface?: string) => {
    const item = fullItem(rawItem);
    if (hasOptions(item)) {
      setOptionsFor({ item, viaRecommendation, surface });
      return;
    }
    addLine(item, undefined, [], 1, viaRecommendation, surface);
  };

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

  /** Minus on a plain dish's card. (Dishes with options are adjusted per line in the cart.) */
  const removeFromCart = (itemId: string) => {
    const line = Object.values(cart).find(c => c.item.id === itemId);
    if (line) changeLineQty(line.key, -1);
  };

  const setItemNote = (key: string, note: string) => {
    setCart((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      return { ...prev, [key]: { ...existing, note } };
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

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setShowCartSheet(false);
      setOrderSuccess(true);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Your order didn’t go through. Please try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <div id="room-dining-canvas" className="flex-1 min-h-screen bg-surface flex flex-col">
      {/* Sticky Header — pt-12 leaves space for the floating Dynamic Island status bar */}
      <header className="sticky top-0 z-30 bg-surface-container-lowest/95 backdrop-blur-md border-b border-outline-variant px-4 md:px-8 pt-12 pb-3 flex items-center gap-3 shadow-2xs">
        <button
          id="btn-back-to-guest-home"
          onClick={() => onNavigate('guest_home')}
          className="p-2 rounded-full hover:bg-surface-container-low text-primary transition-colors cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-bold text-on-surface">In-Room Dining</h1>
          <p className="text-xs text-on-surface-variant truncate">Serving Room {roomNumber} • {propertyName}</p>
        </div>
      </header>

      {/* Main Dining Area — bottom padding clears the floating cart bar */}
      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 pb-28 space-y-6 flex-1">
        {/* Success Alert */}
        {orderSuccess && (
          <div className="bg-success text-on-success p-5 rounded-2xl shadow-lg flex items-center justify-between gap-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <Check className="w-6 h-6 bg-surface-container-lowest/20 p-1 rounded-full shrink-0" />
              <div>
                <p className="font-bold text-base">Order Placed!</p>
                <p className="text-xs text-white/90">Track live status from the bar at the top of your screen.</p>
              </div>
            </div>
            <button onClick={() => setOrderSuccess(false)} className="p-1 text-white/80 hover:text-white shrink-0">
              &times;
            </button>
          </div>
        )}

        {/* Search & Category Filter Tabs */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant hover:bg-surface-container-low'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dining menu..."
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-outline-variant bg-surface-container-lowest text-xs text-on-surface placeholder-outline focus:border-primary focus:outline-none shadow-2xs"
            />
          </div>
        </div>

        {/* Recommended For Your Stay — live output of the rule-based recommendation
            engine (guest_get_recommendations in the migrations), not a hand-picked list. */}
        {recommendations.length > 0 && (
          <div id="recommended-for-stay" className="bg-highlight border border-warning rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="font-bold text-sm text-on-surface">Recommended For Your Stay</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
              {recommendations.map((rec) => {
                if (!rec.menuItem) return null;
                const item = rec.menuItem as unknown as MenuItem;
                return (
                  <div
                    key={rec.menuItemId}
                    className="flex-none w-56 bg-surface-container-lowest rounded-xl border border-outline-variant p-3 shadow-2xs"
                  >
                    <p className="font-bold text-xs text-on-surface leading-snug">{item.name}</p>
                    <p className="text-[11px] text-on-surface-variant italic mt-0.5 mb-2">Why: {rec.reason}</p>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-primary">{formatCurrency(fromPrice(fullItem(item)), currency)}</span>
                      <button
                        onClick={() => addToCart(item, true, 'on_open')}
                        className="h-7 px-3 rounded-lg bg-primary text-on-primary text-[11px] font-bold hover:bg-primary-hover transition-colors cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {recsError && (
          <p className="text-[11px] text-on-surface-variant">
            Recommendations unavailable right now — browse the menu below instead.
          </p>
        )}

        {/* Menu Items Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredItems.map((item) => {
            const countInCart = countForDish(item.id);
            const withOptions = hasOptions(item);
            return (
              <div
                key={item.id}
                id={`menu-item-card-${item.id}`}
                className="bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden shadow-2xs hover:shadow-md transition-shadow flex flex-col group"
              >
                {/* Food Image */}
                <div className="relative h-40 sm:h-48 w-full overflow-hidden bg-gray-100">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-surface-container-low text-primary">
                      <Utensils className="w-8 h-8 opacity-40" />
                    </div>
                  )}
                  {item.category === 'specials' && (
                    <div className="absolute top-3 left-3 bg-primary text-on-primary px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-xs">
                      <Sparkles className="w-3 h-3 text-inverse-primary" />
                      <span>Chef Signature</span>
                    </div>
                  )}
                </div>

                {/* Item Details */}
                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-1.5">
                      <h3 className="font-bold text-base text-on-surface leading-snug">{item.name}</h3>
                      <span className="font-bold text-base text-primary shrink-0 ml-2">
                        {item.variations?.length ? <span className="text-xs font-semibold text-on-surface-variant mr-1">from</span> : null}
                        {formatCurrency(fromPrice(item), currency)}
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2 mb-4">
                      {item.description}
                    </p>
                  </div>

                  {/* Add / Quantity Controls */}
                  <div className="flex items-center justify-between pt-3 border-t border-outline-variant">
                    <span className="text-[11px] text-on-surface-variant flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{item.prepTime || '20-25 mins'}</span>
                    </span>

                    {countInCart > 0 && !withOptions ? (
                      <div className="flex items-center gap-2 bg-surface-container-low border border-[#d1c5b5] p-1 rounded-lg">
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-8 h-8 sm:w-7 sm:h-7 rounded bg-surface-container-lowest text-primary hover:bg-gray-100 flex items-center justify-center font-bold shadow-2xs cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-bold text-xs text-on-surface px-2">{countInCart}</span>
                        <button
                          onClick={() => addToCart(item)}
                          className="w-8 h-8 sm:w-7 sm:h-7 rounded bg-primary text-on-primary hover:bg-primary-hover flex items-center justify-center font-bold shadow-2xs cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(item)}
                        className="h-9 px-4 rounded-lg bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{countInCart > 0 ? `Add · ${countInCart} in cart` : withOptions ? 'Choose' : 'Add'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating cart bar — the primary way into the cart on mobile; thumb-reachable at the bottom rather than a header icon. Only appears once there's something to view. */}
      {totalCartCount > 0 && !showCartSheet && (
        <button
          id="btn-open-cart"
          onClick={() => {
            setShowCartSheet(true);
            // Snapshot at the moment of opening — not a live subscription
            // that re-fires every time the cart changes while the sheet is up.
            if (recommendedNotInCart.length > 0) {
              logOfferEvents(
                token,
                recommendedNotInCart.map((r) => ({ offerId: r.menuItemId, event: 'impression', surface: 'cart_sheet' }))
              );
            }
          }}
          className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md z-40 h-14 px-5 rounded-2xl bg-primary text-on-primary shadow-xl hover:bg-primary-hover transition-colors flex items-center justify-between cursor-pointer animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <span className="flex items-center gap-2 font-bold text-sm">
            <span className="bg-surface-container-lowest text-primary w-6 h-6 rounded-full flex items-center justify-center text-xs">{totalCartCount}</span>
            View Cart
          </span>
          <span className="flex items-center gap-1.5 font-bold text-sm">
            {formatCurrency(grandTotal, currency)} <ChevronUp className="w-4 h-4" />
          </span>
        </button>
      )}

      {/* Cart Bottom Sheet */}
      {showCartSheet && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-2xs flex items-end justify-center">
          <div className="w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl shadow-2xl flex flex-col max-h-[88vh] animate-in slide-in-from-bottom duration-250">
            {/* Sheet Header */}
            <div className="p-5 pb-3 border-b border-outline-variant flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg text-on-surface">Your Dining Tray</h3>
              </div>
              <button
                onClick={() => setShowCartSheet(false)}
                className="p-1 rounded-full hover:bg-gray-200 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {cartItemsList.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center text-on-surface-variant">
                  <Utensils className="w-12 h-12 text-[#9ea0a1] mb-2 opacity-50" />
                  <p className="font-bold text-sm text-on-surface">Your tray is empty</p>
                  <p className="text-xs text-on-surface-variant mt-1">Add culinary dishes to place an in-room order</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cartItemsList.map((line) => (
                    <div
                      key={line.key}
                      className="p-3 rounded-xl border border-outline-variant bg-surface-container-low space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-on-surface truncate">
                            {line.item.name}{line.variation ? ` (${line.variation.name})` : ''}
                          </p>
                          {line.addons.length > 0 && (
                            <p className="text-[11px] text-on-surface-variant truncate">+ {line.addons.map(a => a.name).join(', ')}</p>
                          )}
                          <p className="text-xs text-primary font-semibold mt-0.5">
                            {formatCurrency(unitPrice(line), currency)} each
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <button
                            onClick={() => changeLineQty(line.key, -1)}
                            aria-label="One less"
                            className="w-7 h-7 rounded bg-surface-container-lowest border border-outline-variant text-primary flex items-center justify-center font-bold"
                          >
                            -
                          </button>
                          <span className="font-bold text-xs text-on-surface w-4 text-center">
                            {line.quantity}
                          </span>
                          <button
                            onClick={() => changeLineQty(line.key, 1)}
                            aria-label="One more"
                            className="w-7 h-7 rounded bg-primary text-on-primary flex items-center justify-center font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Customize each item — "no onions", "extra spicy", etc. */}
                      <input
                        type="text"
                        value={line.note ?? ''}
                        onChange={(e) => setItemNote(line.key, e.target.value)}
                        placeholder="Customize (e.g. no onions, extra spicy)"
                        className="w-full h-8 px-2.5 text-[11px] border border-outline-variant rounded-lg bg-surface-container-lowest focus:border-primary focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendations, right where the guest is deciding what else to add */}
              {recommendedNotInCart.length > 0 && (
                <div className="pt-2">
                  <p className="text-[11px] font-bold text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> You might also like
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {recommendedNotInCart.map(rec => {
                      const item = rec.menuItem as unknown as MenuItem;
                      return (
                        <button
                          key={rec.menuItemId}
                          onClick={() => addToCart(item, true, 'cart_sheet')}
                          className="flex-none flex items-center gap-2 pl-2 pr-3 h-9 rounded-full border border-outline-variant bg-surface-container-lowest hover:border-primary text-left"
                        >
                          <span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                            <Plus className="w-3 h-3" />
                          </span>
                          <span className="text-[11px] font-semibold text-on-surface whitespace-nowrap">{item.name} · {formatCurrency(fromPrice(fullItem(item)), currency)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Order Customization & Notes */}
              {cartItemsList.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-outline-variant text-xs">
                  <div>
                    <label className="font-bold text-on-surface block mb-1">Delivering To</label>
                    {/* Not editable — the room comes from this stay's reservation
                        server-side (see guest_place_order in the migration), so a
                        guest can never redirect an order to a room that isn't theirs. */}
                    <div className="w-full h-10 px-3 border border-outline-variant rounded-lg bg-surface-container-low flex items-center text-on-surface font-semibold">
                      Room {roomNumber}
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-on-surface block mb-1">Dietary &amp; Prep Notes</label>
                    <textarea
                      rows={2}
                      value={dietaryNote}
                      onChange={(e) => setDietaryNote(e.target.value)}
                      placeholder="e.g. Peanut allergy, dressing on side..."
                      className="w-full p-2.5 border border-outline-variant rounded-lg focus:border-primary focus:outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bill Summary & Place Order */}
            {cartItemsList.length > 0 && (
              <div className="p-5 border-t border-outline-variant bg-surface-container-low space-y-3 shrink-0" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-on-surface-variant">Charged to Room {roomNumber}</span>
                  <span className="font-bold text-base text-on-surface">{formatCurrency(grandTotal, currency)}</span>
                </div>
                {orderError && <p className="text-xs text-error">{orderError}</p>}

                <button
                  id="btn-place-dining-order"
                  onClick={handleCheckout}
                  disabled={placingOrder}
                  className="w-full h-12 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary-hover active:scale-98 transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-60"
                >
                  <Utensils className="w-4 h-4" />
                  <span>{placingOrder ? 'Placing Order…' : 'Place In-Room Dining Order'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {optionsFor && (
        <DishOptionsSheet
          item={optionsFor.item}
          currency={currency}
          onClose={() => setOptionsFor(null)}
          onAdd={(variation, addons, quantity) => {
            addLine(optionsFor.item, variation, addons, quantity, optionsFor.viaRecommendation, optionsFor.surface);
            setOptionsFor(null);
          }}
        />
      )}
    </div>
  );
};

/** Size (pick one) and add-ons (pick any) for one dish, with a quantity and the line's real price. */
function DishOptionsSheet({ item, currency, onClose, onAdd }: {
  item: MenuItem;
  currency: string;
  onClose: () => void;
  onAdd: (variation: MenuOption | undefined, addons: MenuOption[], quantity: number) => void;
}) {
  const variations = item.variations ?? [];
  const addons = item.addons ?? [];
  const [variationId, setVariationId] = useState<string>(variations[0]?.id ?? '');
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);

  const variation = variations.find(v => v.id === variationId);
  const chosenAddons = addons.filter(a => addonIds.includes(a.id));
  const unit = (variation ? variation.price : item.price) + chosenAddons.reduce((sum, a) => sum + a.price, 0);
  const toggleAddon = (id: string) => setAddonIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-end justify-center" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl shadow-2xl flex flex-col max-h-[88vh] animate-in slide-in-from-bottom duration-250">
        <div className="p-5 pb-3 border-b border-outline-variant flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-lg text-on-surface leading-snug">{item.name}</h3>
            {item.description && <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">{item.description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full hover:bg-surface-container-low text-on-surface-variant shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {variations.length > 0 && (
            <div>
              <p className="text-xs font-bold text-on-surface mb-2">Size <span className="font-normal text-on-surface-variant">· choose one</span></p>
              <div className="space-y-2">
                {variations.map(v => (
                  <label key={v.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer ${variationId === v.id ? 'border-primary bg-highlight' : 'border-outline-variant'}`}>
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
              <p className="text-xs font-bold text-on-surface mb-2">Add-ons <span className="font-normal text-on-surface-variant">· optional</span></p>
              <div className="space-y-2">
                {addons.map(a => (
                  <label key={a.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer ${addonIds.includes(a.id) ? 'border-primary bg-highlight' : 'border-outline-variant'}`}>
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
        </div>

        <div className="p-5 border-t border-outline-variant flex items-center gap-3 shrink-0" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
          <div className="flex items-center gap-2 bg-surface-container-low border border-outline-variant p-1 rounded-xl">
            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} aria-label="One less" className="w-9 h-9 rounded-lg bg-surface-container-lowest text-primary flex items-center justify-center">
              <Minus className="w-4 h-4" />
            </button>
            <span className="font-bold text-sm text-on-surface w-5 text-center">{quantity}</span>
            <button onClick={() => setQuantity(q => Math.min(20, q + 1))} aria-label="One more" className="w-9 h-9 rounded-lg bg-surface-container-lowest text-primary flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => onAdd(variation, chosenAddons, quantity)}
            disabled={variations.length > 0 && !variation}
            className="flex-1 h-12 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary-hover disabled:opacity-60"
          >
            Add · {formatCurrency(unit * quantity, currency)}
          </button>
        </div>
      </div>
    </div>
  );
}
