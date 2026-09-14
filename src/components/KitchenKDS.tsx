import React, { useState, useEffect } from 'react';
import { KdsOrder, AppView } from '../types';
import {
  Play,
  Check,
  CheckCheck,
  Clock,
  AlertTriangle,
  ChefHat,
  Timer,
  Truck,
  Flame,
  CheckCircle2,
  X,
  Printer,
} from 'lucide-react';

// Escapes guest-typed text (item names, notes) before it goes into the
// print window's HTML — otherwise a note containing `<` or `&` would
// break the ticket layout.
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Adapted from the sibling tableorder product's printKitchenTicket() — same
// hidden-iframe + window.print() approach, so it works with zero extra
// installs on whatever printer the kitchen already has set up as default.
// Swap the internals for a QZ Tray / local print-bridge call later if you
// want silent, no-dialog kitchen printing instead.
function printKitchenTicket(order: KdsOrder) {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const itemsHtml = order.items.map(it => `
      <div class="line">
        <span class="qty">${it.quantity}x</span>
        <span class="name">${escapeHtml(it.name)}</span>
      </div>
      ${it.modifier ? `<div class="sub">${escapeHtml(it.modifier)}</div>` : ''}
    `).join('');

    const html = `
      <html>
        <head>
          <title>KOT - ${escapeHtml(order.roomNumber)}</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; width: 80mm; padding: 8px 10px; color: #000; }
            .center { text-align: center; }
            .title { font-size: 17px; font-weight: 800; letter-spacing: 1px; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 3px; }
            .line { display: flex; gap: 8px; font-size: 15px; font-weight: 800; margin-top: 8px; }
            .qty { min-width: 30px; }
            .sub { font-size: 12px; padding-left: 38px; font-style: italic; }
            .vip { text-align: center; font-weight: 900; margin-top: 6px; font-size: 13px; }
            .footer { margin-top: 12px; font-size: 10px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="center title">KITCHEN ORDER TICKET</div>
          <div class="divider"></div>
          <div class="row"><span>Room</span><span>${escapeHtml(order.roomNumber)}</span></div>
          <div class="row"><span>Order</span><span>${escapeHtml(order.orderNumber)}</span></div>
          ${order.isVip ? `<div class="vip">★ VIP ORDER ★</div>` : ''}
          <div class="divider"></div>
          ${itemsHtml}
          ${order.notes ? `<div class="divider"></div><div class="sub" style="padding-left:0">Note: ${escapeHtml(order.notes)}</div>` : ''}
          <div class="divider"></div>
          <div class="footer">Printed ${new Date().toLocaleString()}</div>
        </body>
      </html>
    `;

    const cleanup = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error('KOT print failed', e);
        }
        setTimeout(cleanup, 1500);
      }, 200);
    };

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    doc?.open();
    doc?.write(html);
    doc?.close();
  } catch (e) {
    console.error('printKitchenTicket failed', e);
  }
}

interface KitchenKDSProps {
  orders: KdsOrder[];
  onUpdateOrder: (order: KdsOrder) => void;
  /** The "can't make this" path — required note, voids the guest's charge and notifies them (staff_reject_order). */
  onRejectOrder: (orderId: string, note: string) => void;
  onNavigate: (view: AppView) => void;
}

export const KitchenKDS: React.FC<KitchenKDSProps> = ({
  orders,
  onUpdateOrder,
  onRejectOrder,
  onNavigate,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [rejectingOrder, setRejectingOrder] = useState<KdsOrder | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  // Live ticking clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const newOrders = orders.filter(o => o.status === 'new');
  const preparingOrders = orders.filter(o => o.status === 'preparing');
  const readyOrders = orders.filter(o => o.status === 'ready');

  const handleStartPreparing = (order: KdsOrder) => {
    printKitchenTicket(order);
    onUpdateOrder({
      ...order,
      status: 'preparing',
    });
  };

  const handleConfirmReject = () => {
    if (!rejectingOrder || !rejectNote.trim()) return;
    onRejectOrder(rejectingOrder.id, rejectNote.trim());
    setRejectingOrder(null);
    setRejectNote('');
  };

  const handleToggleItemComplete = (order: KdsOrder, itemIndex: number) => {
    const updatedItems = [...order.items];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      completed: !updatedItems[itemIndex].completed,
    };
    onUpdateOrder({
      ...order,
      items: updatedItems,
    });
  };

  const handleMarkReady = (order: KdsOrder) => {
    onUpdateOrder({
      ...order,
      status: 'ready',
    });
  };

  // Doesn't mark the order delivered — "ready" already means ready for
  // pickup/dispatch. Active Deliveries is where a runner actually confirms
  // hand-off, so the status only moves to 'delivered' there.
  const handleDispatchRunner = (order: KdsOrder) => {
    onNavigate('active_deliveries');
  };

  return (
    <div id="kitchen-kds-canvas" className="flex-1 flex flex-col h-full bg-surface-container-low overflow-hidden">
      {/* Top KDS Header */}
      <header className="bg-surface-container-lowest shadow-2xs w-full h-16 flex justify-between items-center px-4 md:px-8 shrink-0 border-b border-outline-variant z-20">
        <div className="flex items-center gap-3 md:gap-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary text-on-primary rounded-lg">
              <ChefHat className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-primary">Kitchen KDS</span>
          </div>

          <span className="hidden sm:flex items-center gap-2 text-xs font-semibold text-on-surface-variant bg-surface-container-low px-3 py-1 rounded-full border border-outline-variant">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
            <span>Room Dining • Online</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-mono text-xl md:text-2xl font-bold text-on-surface bg-surface-container-low px-3 py-1 rounded-lg border border-outline-variant">
            <Clock className="w-4 h-4 text-primary" />
            <span>{currentTime || '17:59:00'}</span>
          </div>
        </div>
      </header>

      {/* Main KDS Columns Container */}
      <main className="flex-1 overflow-x-auto p-4 md:p-6 flex gap-6">
        {/* COLUMN 1: NEW ORDERS */}
        <section className="flex-none w-[85vw] sm:w-[360px] md:w-[380px] lg:w-[400px] flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant">
            <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
              <span>New</span>
            </h2>
            <span className="bg-[#bd9b60] text-white px-2.5 py-0.5 rounded-full text-xs font-bold shadow-xs">
              {newOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {newOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-outline border-2 border-dashed border-outline-variant rounded-xl">
                No new incoming tickets
              </div>
            ) : (
              newOrders.map((order) => (
                <article
                  key={order.id}
                  id={`kds-card-${order.id}`}
                  className="bg-surface-container-lowest border-2 border-warning rounded-xl p-4 flex flex-col shadow-sm relative overflow-hidden"
                >
                  {/* Timer Header Badge */}
                  <div className="absolute top-0 right-0 bg-warning text-on-warning px-3 py-1 rounded-bl-lg text-xs font-bold flex items-center gap-1">
                    <Timer className="w-3.5 h-3.5" />
                    <span>{order.timeElapsed}</span>
                  </div>

                  <div className="flex justify-between items-start mb-3 pr-20">
                    <div>
                      <h3 className="text-2xl font-bold text-on-surface">{order.roomNumber}</h3>
                      <p className="text-xs text-outline">
                        Order {order.orderNumber} {order.isVip ? '• VIP Guest' : ''}
                      </p>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="space-y-2 mb-4">
                    {order.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-start py-1.5 border-b border-outline-variant border-dashed"
                      >
                        <span className="font-semibold text-sm text-on-surface">
                          {item.quantity}x {item.name}
                        </span>
                        {item.modifier && (
                          <span className="text-xs text-outline">{item.modifier}</span>
                        )}
                      </div>
                    ))}

                    {order.notes && (
                      <div className="bg-error-container/30 text-on-error-container p-2.5 rounded-lg text-xs border border-error-container mt-2">
                        <span className="font-bold">Note: </span>
                        {order.notes}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons: accept (prints the KOT), reprint, or reject with a required reason */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setRejectingOrder(order); setRejectNote(''); }}
                      className="h-11 px-3 rounded-lg border border-error text-error hover:bg-error-container/30 transition-all flex items-center justify-center cursor-pointer shrink-0"
                      title="Reject this order"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => printKitchenTicket(order)}
                      className="h-11 px-3 rounded-lg border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary transition-all flex items-center justify-center cursor-pointer shrink-0"
                      title="Print / reprint ticket"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button
                      id={`btn-start-prep-${order.id}`}
                      onClick={() => handleStartPreparing(order)}
                      className="flex-1 h-11 bg-primary text-on-primary rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-primary-hover active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Start Preparing</span>
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        {/* COLUMN 2: PREPARING */}
        <section className="flex-none w-[85vw] sm:w-[360px] md:w-[380px] lg:w-[400px] flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant">
            <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
              <span>Preparing</span>
            </h2>
            <span className="bg-[#e2e2e5] text-[#636467] px-2.5 py-0.5 rounded-full text-xs font-bold">
              {preparingOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {preparingOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-outline border-2 border-dashed border-outline-variant rounded-xl">
                No orders currently in preparation
              </div>
            ) : (
              preparingOrders.map((order) => {
                const isOverdue = order.isOverdue || order.timerSeconds > 900;
                return (
                  <article
                    key={order.id}
                    id={`kds-card-${order.id}`}
                    className={`bg-surface-container-lowest border-2 ${
                      isOverdue ? 'border-error' : 'border-[#bd9b60]'
                    } rounded-xl p-4 flex flex-col shadow-sm relative overflow-hidden`}
                  >
                    {/* Timer Tag */}
                    <div
                      className={`absolute top-0 right-0 ${
                        isOverdue ? 'bg-error text-on-error animate-pulse' : 'bg-[#bd9b60] text-white'
                      } px-3 py-1 rounded-bl-lg text-xs font-bold flex items-center gap-1`}
                    >
                      <Timer className="w-3.5 h-3.5" />
                      <span>{order.timeElapsed}</span>
                    </div>

                    <div className="flex justify-between items-start mb-3 pr-28">
                      <div>
                        <h3 className="text-2xl font-bold text-on-surface">{order.roomNumber}</h3>
                        <p className="text-xs text-outline">
                          Order {order.orderNumber} {order.isRush ? '• Rush' : ''}
                        </p>
                      </div>
                    </div>

                    {/* Interactive item checklist */}
                    <div className="space-y-2 mb-4">
                      {order.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2.5 py-1.5 border-b border-outline-variant border-dashed"
                        >
                          <button
                            onClick={() => handleToggleItemComplete(order, idx)}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer ${
                              item.completed
                                ? 'bg-success border-success text-white'
                                : 'border-outline-variant hover:border-success text-transparent'
                            }`}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <span
                            className={`text-sm font-semibold flex-1 ${
                              item.completed ? 'line-through text-outline' : 'text-on-surface'
                            }`}
                          >
                            {item.quantity}x {item.name}
                          </span>
                        </div>
                      ))}

                      {order.notes && (
                        <div className="bg-surface-container-low text-on-surface-variant p-2.5 rounded-lg text-xs border border-outline-variant">
                          {order.notes}
                        </div>
                      )}
                    </div>

                    {/* Action Button */}
                    <button
                      id={`btn-mark-ready-${order.id}`}
                      onClick={() => handleMarkReady(order)}
                      className="w-full h-11 bg-success text-on-success rounded-lg text-sm font-bold uppercase tracking-wider hover:opacity-95 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-success/20"
                    >
                      <CheckCheck className="w-4 h-4" />
                      <span>Mark Ready</span>
                    </button>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* COLUMN 3: READY FOR PICKUP */}
        <section className="flex-none w-[85vw] sm:w-[360px] md:w-[380px] lg:w-[400px] flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant">
            <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
              <span>Ready for Pickup</span>
            </h2>
            <span className="bg-success/20 text-success px-2.5 py-0.5 rounded-full text-xs font-bold">
              {readyOrders.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {readyOrders.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-outline-variant rounded-xl p-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-[#9ea0a1] mb-2" />
                <p className="text-sm font-semibold text-on-surface-variant">No items waiting for pickup</p>
                <p className="text-xs text-outline mt-1">Orders marked ready will appear here for staff delivery dispatch</p>
              </div>
            ) : (
              readyOrders.map((order) => (
                <article
                  key={order.id}
                  id={`kds-ready-card-${order.id}`}
                  className="bg-surface-container-lowest border-2 border-success rounded-xl p-4 flex flex-col shadow-sm relative overflow-hidden"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-2xl font-bold text-on-surface">{order.roomNumber}</h3>
                      <p className="text-xs text-success font-bold">Ready on Expediter Station</p>
                    </div>
                    <span className="bg-success text-on-success text-xs px-2 py-1 rounded-md font-bold">
                      Order {order.orderNumber}
                    </span>
                  </div>

                  <div className="space-y-1 mb-4 text-xs text-on-surface-variant">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{it.quantity}x {it.name}</span>
                        <span className="text-success font-bold">✓ Plated</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => handleDispatchRunner(order)}
                    className="w-full h-11 bg-primary text-on-primary rounded-lg text-sm font-bold hover:bg-primary-hover flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Truck className="w-4 h-4" />
                    <span>Dispatch to Runner &rarr;</span>
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      </main>

      {rejectingOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant space-y-3">
            <h3 className="text-lg font-bold text-on-surface">Reject Order {rejectingOrder.orderNumber}?</h3>
            <p className="text-xs text-outline">
              The guest sees this reason and isn't charged for it — say why so they know what happened.
            </p>
            <textarea
              autoFocus
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. Out of paneer tonight, kitchen closing in 5 mins..."
              className="w-full p-2.5 text-sm border border-outline-variant rounded-lg focus:border-error focus:outline-none resize-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setRejectingOrder(null)}
                className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={!rejectNote.trim()}
                className="px-4 py-2 bg-error text-on-error rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50"
              >
                Reject Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
