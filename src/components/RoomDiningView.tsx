import React, { useState, useEffect } from 'react';
import { MenuItem, KdsOrder, AppView } from '../types';
import { fetchGuestRecommendations, placeGuestOrder, GuestRecommendation } from '../lib/guestApi';
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

interface CartEntry {
  item: MenuItem;
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

  const categories = [
    { id: 'all', label: 'All Dishes' },
    { id: 'specials', label: "Chef's Specials" },
    { id: 'mains', label: 'Mains & Grill' },
    { id: 'starters', label: 'Starters' },
    { id: 'desserts', label: 'Desserts' },
    { id: 'beverages', label: 'Beverages & Wine' },
  ];

  const filteredItems = menuItems.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const addToCart = (item: MenuItem, viaRecommendation: boolean = false) => {
    setCart((prev) => {
      const existing = prev[item.id];
      return {
        ...prev,
        [item.id]: {
          item,
          quantity: existing ? existing.quantity + 1 : 1,
          // First add wins — once a guest has taken the recommendation once,
          // a later +1 tap from the main grid still counts as the same pick.
          viaRecommendation: existing ? existing.viaRecommendation : viaRecommendation,
          note: existing?.note,
        },
      };
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return {
        ...prev,
        [itemId]: {
          ...existing,
          quantity: existing.quantity - 1,
        },
      };
    });
  };

  const setItemNote = (itemId: string, note: string) => {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      return { ...prev, [itemId]: { ...existing, note } };
    });
  };

  const cartItemsList: CartEntry[] = Object.values(cart);
  const totalCartCount: number = cartItemsList.reduce((acc, curr) => acc + curr.quantity, 0);
  const subtotal: number = cartItemsList.reduce((acc, curr) => acc + (curr.item.price * curr.quantity), 0);
  const tax: number = subtotal * 0.08875;
  const serviceCharge: number = subtotal * 0.18;
  const grandTotal: number = subtotal + tax + serviceCharge;
  const recommendedNotInCart = recommendations.filter(r => r.menuItem && !cart[r.menuItemId]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItemsList.length === 0 || placingOrder) return;
    setPlacingOrder(true);

    const orderNum = `#${Math.floor(1040 + Math.random() * 60)}`;
    const newKdsOrder: KdsOrder = {
      id: `kds-${Date.now()}`,
      orderNumber: orderNum,
      roomNumber: `Room ${roomNumber}`,
      isVip: true,
      isRush: false,
      status: 'new',
      timeElapsed: '00:01',
      timerSeconds: 1,
      notes: dietaryNote,
      items: cartItemsList.map(c => ({
        name: c.item.name,
        quantity: c.quantity,
        modifier: c.note || (c.item.category === 'specials' ? 'Chef Special Prep' : undefined),
      })),
    };

    onPlaceOrder(newKdsOrder);

    try {
      // Posts through guest_place_order() (supabase/migrations/0001_init.sql),
      // which derives the room/reservation from the token server-side — the
      // guest can never point an order at a different room. This is what
      // drives the folio charge, the owner's ticket-size analytics, and (via
      // each item's snapshotted prepTime) the floating ETA bar's estimate.
      await placeGuestOrder(
        token,
        cartItemsList.map((c) => ({
          menuItemId: c.item.id,
          name: c.item.name,
          price: c.item.price,
          quantity: c.quantity,
          fromRecommendation: cart[c.item.id]?.viaRecommendation ?? false,
          note: c.note,
          prepTime: c.item.prepTime,
        })),
        dietaryNote
      );
    } catch (err) {
      console.warn('Failed to place order via Supabase:', err);
    } finally {
      setPlacingOrder(false);
    }

    setCart({});
    setShowCartSheet(false);
    setOrderSuccess(true);
  };

  return (
    <div id="room-dining-canvas" className="flex-1 min-h-screen bg-[#f6faff] flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E9ECEF] px-4 md:px-8 py-3 flex items-center gap-3 shadow-2xs">
        <button
          id="btn-back-to-guest-home"
          onClick={() => onNavigate('guest_home')}
          className="p-2 rounded-full hover:bg-[#ecf5fe] text-[#765a25] transition-colors cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-bold text-[#141d23]">In-Room Dining</h1>
          <p className="text-xs text-[#7f7668] truncate">Serving Room {roomNumber} • {propertyName}</p>
        </div>
      </header>

      {/* Main Dining Area — bottom padding clears the floating cart bar */}
      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 pb-28 space-y-6 flex-1">
        {/* Success Alert */}
        {orderSuccess && (
          <div className="bg-[#2D6A4F] text-white p-5 rounded-2xl shadow-lg flex items-center justify-between gap-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <Check className="w-6 h-6 bg-white/20 p-1 rounded-full shrink-0" />
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
                    ? 'bg-[#765a25] text-white shadow-xs'
                    : 'bg-white text-[#4e463a] border border-[#E9ECEF] hover:bg-[#ecf5fe]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#7f7668]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dining menu..."
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-[#E9ECEF] bg-white text-xs text-[#141d23] placeholder-[#7f7668] focus:border-[#765a25] focus:outline-none shadow-2xs"
            />
          </div>
        </div>

        {/* Recommended For Your Stay — live output of the rule-based recommendation
            engine (guest_get_recommendations in the migrations), not a hand-picked list. */}
        {recommendations.length > 0 && (
          <div id="recommended-for-stay" className="bg-[#fff8ec] border border-[#f0dfb8] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-[#765a25]" />
              <h2 className="font-bold text-sm text-[#141d23]">Recommended For Your Stay</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-none">
              {recommendations.map((rec) => {
                if (!rec.menuItem) return null;
                const item = rec.menuItem as unknown as MenuItem;
                return (
                  <div
                    key={rec.menuItemId}
                    className="flex-none w-56 bg-white rounded-xl border border-[#E9ECEF] p-3 shadow-2xs"
                  >
                    <p className="font-bold text-xs text-[#141d23] leading-snug">{item.name}</p>
                    <p className="text-[11px] text-[#7f7668] italic mt-0.5 mb-2">Why: {rec.reason}</p>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-[#765a25]">{formatCurrency(item.price, currency)}</span>
                      <button
                        onClick={() => addToCart(item, true)}
                        className="h-7 px-3 rounded-lg bg-[#765a25] text-white text-[11px] font-bold hover:bg-[#5c4210] transition-colors cursor-pointer"
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
          <p className="text-[11px] text-[#7f7668]">
            Recommendations unavailable right now — browse the menu below instead.
          </p>
        )}

        {/* Menu Items Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredItems.map((item) => {
            const countInCart = cart[item.id]?.quantity || 0;
            return (
              <div
                key={item.id}
                id={`menu-item-card-${item.id}`}
                className="bg-white rounded-2xl border border-[#E9ECEF] overflow-hidden shadow-2xs hover:shadow-md transition-shadow flex flex-col group"
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
                    <div className="w-full h-full flex items-center justify-center bg-[#ecf5fe] text-[#765a25]">
                      <Utensils className="w-8 h-8 opacity-40" />
                    </div>
                  )}
                  {item.category === 'specials' && (
                    <div className="absolute top-3 left-3 bg-[#765a25] text-white px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-xs">
                      <Sparkles className="w-3 h-3 text-[#ffdea9]" />
                      <span>Chef Signature</span>
                    </div>
                  )}
                </div>

                {/* Item Details */}
                <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-1.5">
                      <h3 className="font-bold text-base text-[#141d23] leading-snug">{item.name}</h3>
                      <span className="font-bold text-base text-[#765a25] shrink-0 ml-2">
                        {formatCurrency(item.price, currency)}
                      </span>
                    </div>
                    <p className="text-xs text-[#4e463a] leading-relaxed line-clamp-2 mb-4">
                      {item.description}
                    </p>
                  </div>

                  {/* Add / Quantity Controls */}
                  <div className="flex items-center justify-between pt-3 border-t border-[#E9ECEF]">
                    <span className="text-[11px] text-[#7f7668] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{item.prepTime || '20-25 mins'}</span>
                    </span>

                    {countInCart > 0 ? (
                      <div className="flex items-center gap-2 bg-[#ecf5fe] border border-[#d1c5b5] p-1 rounded-lg">
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-8 h-8 sm:w-7 sm:h-7 rounded bg-white text-[#765a25] hover:bg-gray-100 flex items-center justify-center font-bold shadow-2xs cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-bold text-xs text-[#141d23] px-2">{countInCart}</span>
                        <button
                          onClick={() => addToCart(item)}
                          className="w-8 h-8 sm:w-7 sm:h-7 rounded bg-[#765a25] text-white hover:bg-[#5c4210] flex items-center justify-center font-bold shadow-2xs cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(item)}
                        className="h-9 px-4 rounded-lg bg-[#765a25] text-white text-xs font-bold hover:bg-[#5c4210] transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
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
          onClick={() => setShowCartSheet(true)}
          className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md z-40 h-14 px-5 rounded-2xl bg-[#765a25] text-white shadow-xl hover:bg-[#5c4210] transition-colors flex items-center justify-between cursor-pointer animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          <span className="flex items-center gap-2 font-bold text-sm">
            <span className="bg-white text-[#765a25] w-6 h-6 rounded-full flex items-center justify-center text-xs">{totalCartCount}</span>
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
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[88vh] animate-in slide-in-from-bottom duration-250">
            {/* Sheet Header */}
            <div className="p-5 pb-3 border-b border-[#E9ECEF] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-[#765a25]" />
                <h3 className="font-bold text-lg text-[#141d23]">Your Dining Tray</h3>
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
                <div className="h-64 flex flex-col items-center justify-center text-center text-[#7f7668]">
                  <Utensils className="w-12 h-12 text-[#9ea0a1] mb-2 opacity-50" />
                  <p className="font-bold text-sm text-[#141d23]">Your tray is empty</p>
                  <p className="text-xs text-[#7f7668] mt-1">Add culinary dishes to place an in-room order</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cartItemsList.map(({ item, quantity, note }) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border border-[#E9ECEF] bg-[#f6faff] space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-[#141d23] truncate">{item.name}</p>
                          <p className="text-xs text-[#765a25] font-semibold mt-0.5">
                            {formatCurrency(item.price, currency)} each
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="w-7 h-7 rounded bg-white border border-[#E9ECEF] text-[#765a25] flex items-center justify-center font-bold"
                          >
                            -
                          </button>
                          <span className="font-bold text-xs text-[#141d23] w-4 text-center">
                            {quantity}
                          </span>
                          <button
                            onClick={() => addToCart(item)}
                            className="w-7 h-7 rounded bg-[#765a25] text-white flex items-center justify-center font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Customize each item — "no onions", "extra spicy", etc. */}
                      <input
                        type="text"
                        value={note ?? ''}
                        onChange={(e) => setItemNote(item.id, e.target.value)}
                        placeholder="Customize (e.g. no onions, extra spicy)"
                        className="w-full h-8 px-2.5 text-[11px] border border-[#E9ECEF] rounded-lg bg-white focus:border-[#765a25] focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Recommendations, right where the guest is deciding what else to add */}
              {recommendedNotInCart.length > 0 && (
                <div className="pt-2">
                  <p className="text-[11px] font-bold text-[#765a25] uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> You might also like
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {recommendedNotInCart.map(rec => {
                      const item = rec.menuItem as unknown as MenuItem;
                      return (
                        <button
                          key={rec.menuItemId}
                          onClick={() => addToCart(item, true)}
                          className="flex-none flex items-center gap-2 pl-2 pr-3 h-9 rounded-full border border-[#E9ECEF] bg-white hover:border-[#765a25] text-left"
                        >
                          <span className="w-5 h-5 rounded-full bg-[#765a25] text-white flex items-center justify-center shrink-0">
                            <Plus className="w-3 h-3" />
                          </span>
                          <span className="text-[11px] font-semibold text-[#141d23] whitespace-nowrap">{item.name} · {formatCurrency(item.price, currency)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Order Customization & Notes */}
              {cartItemsList.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-[#E9ECEF] text-xs">
                  <div>
                    <label className="font-bold text-[#141d23] block mb-1">Delivering To</label>
                    {/* Not editable — the room comes from this stay's reservation
                        server-side (see guest_place_order in the migration), so a
                        guest can never redirect an order to a room that isn't theirs. */}
                    <div className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg bg-[#f6faff] flex items-center text-[#141d23] font-semibold">
                      Room {roomNumber}
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-[#141d23] block mb-1">Dietary &amp; Prep Notes</label>
                    <textarea
                      rows={2}
                      value={dietaryNote}
                      onChange={(e) => setDietaryNote(e.target.value)}
                      placeholder="e.g. Peanut allergy, dressing on side..."
                      className="w-full p-2.5 border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bill Summary & Place Order */}
            {cartItemsList.length > 0 && (
              <div className="p-5 border-t border-[#E9ECEF] bg-[#f6faff] space-y-3 shrink-0" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
                <div className="space-y-1.5 text-xs text-[#4e463a]">
                  <div className="flex justify-between">
                    <span>Food &amp; Beverage:</span>
                    <span className="font-semibold text-[#141d23]">{formatCurrency(subtotal, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>State &amp; Local Tax (8.875%):</span>
                    <span>{formatCurrency(tax, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>In-Suite Service &amp; Gratuity (18%):</span>
                    <span>{formatCurrency(serviceCharge, currency)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-[#E9ECEF] font-bold text-sm text-[#141d23]">
                    <span>Total (Charged to Room):</span>
                    <span className="text-[#765a25]">{formatCurrency(grandTotal, currency)}</span>
                  </div>
                </div>

                <button
                  id="btn-place-dining-order"
                  onClick={handleCheckout}
                  disabled={placingOrder}
                  className="w-full h-12 bg-[#765a25] text-white rounded-xl font-bold text-sm hover:bg-[#5c4210] active:scale-98 transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-60"
                >
                  <Utensils className="w-4 h-4" />
                  <span>{placingOrder ? 'Placing Order…' : 'Place In-Room Dining Order'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
