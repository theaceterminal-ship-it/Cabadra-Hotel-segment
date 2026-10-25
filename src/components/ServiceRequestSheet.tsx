import React, { useMemo, useState } from 'react';
import { Car, Check, MapPin, Minus, Plus, X } from 'lucide-react';
import { GuestServiceCategory, GuestTransportRoute, submitServiceRequest } from '../lib/guestApi';
import { departmentLabel, type Department } from '../lib/departments';
import { formatCurrency } from '../lib/currency';

// For services saved before request forms existed (no options): one tap
// fills the note with a common ask for that team.
const NOTE_SUGGESTIONS: Record<Department, string[]> = {
  housekeeping: ['Extra towels', 'Extra pillows & blankets', 'Toiletries refill', 'Fresh linens', 'Turn-down service'],
  maintenance: ['AC not cooling', 'Leaking tap or plumbing', 'Light/bulb not working', 'TV or Wi-Fi issue', 'Door lock issue'],
  concierge: ['Luggage assistance', 'Local sightseeing info', 'Restaurant reservation', 'Taxi booking'],
  front_desk: ['Late checkout request', 'Wake-up call', 'Extra key card', 'Invoice copy', 'Doctor on call'],
  laundry: ['Laundry pickup', 'Ironing', 'Dry cleaning', 'Shoe shine'],
  spa: ['Book a massage', 'Book a sauna session', 'Spa timings'],
  transport: ['Airport drop', 'Railway station drop', 'Local cab for the day'],
  kitchen: ['Extra cutlery', 'Hot water flask', 'Ice bucket', 'Plates & glasses'],
};

/** "18:30" → "6:30 pm" */
function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/**
 * The guest's request form for one service, built from the owner's
 * settings (service_categories.form, 0075): options to tap (one or several,
 * with a quantity where asked), the route list for transfers, a time and a
 * note. The total shown is what the server will charge to the room when
 * staff mark the request done; the server works it out again itself.
 */
export function ServiceRequestSheet({ token, service, routes, currency, onClose, onSent }: {
  token: string;
  service: GuestServiceCategory;
  routes: GuestTransportRoute[];
  currency: string;
  onClose: () => void;
  onSent: (title: string) => void;
}) {
  const form = service.form ?? {};
  const choices = form.choices ?? [];
  const isRoute = service.categoryType === 'transportation';
  const showNote = form.note !== false;

  const [picked, setPicked] = useState<Record<string, number>>({});
  const [routeId, setRouteId] = useState('');
  const [routeSearch, setRouteSearch] = useState('');
  const [day, setDay] = useState<'Today' | 'Tomorrow'>('Today');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ title: string; price: number } | null>(null);

  const toggle = (id: string) =>
    setPicked(p => {
      if (p[id]) {
        const { [id]: _removed, ...rest } = p;
        return rest;
      }
      return form.multiple ? { ...p, [id]: 1 } : { [id]: 1 };
    });
  const setQty = (id: string, q: number) => setPicked(p => ({ ...p, [id]: Math.min(20, Math.max(1, q)) }));

  const route = routes.find(r => r.id === routeId);
  const filteredRoutes = routes.filter(r =>
    !routeSearch.trim() || `${r.from} ${r.to}`.toLowerCase().includes(routeSearch.trim().toLowerCase()),
  );
  const total = useMemo(
    () => (isRoute ? route?.price ?? 0 : choices.reduce((sum, ch) => sum + (picked[ch.id] ? ch.price * picked[ch.id] : 0), 0)),
    [isRoute, route, choices, picked],
  );

  const ready = isRoute
    ? !!routeId
    : choices.length > 0
      ? Object.keys(picked).length > 0
      : !!(note.trim() || (form.askTime && time));

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      const result = await submitServiceRequest(token, service.id, {
        choices: Object.entries(picked).map(([id, quantity]) => ({ id, quantity })),
        routeId: routeId || undefined,
        time: form.askTime && time ? `${day} ${formatTime(time)}` : undefined,
        note: showNote ? note.trim() || undefined : undefined,
      });
      setSent({ title: result.title, price: result.price });
      onSent(service.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send your request.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full sm:max-w-md max-h-[90svh] flex flex-col bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl shadow-2xl border border-outline-variant animate-in slide-in-from-bottom duration-200">
        <div className="flex items-start justify-between gap-3 p-5 pb-3 border-b border-outline-variant">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-on-surface leading-snug">{service.name}</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">{service.description || `Goes to ${departmentLabel(service.department)}`}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full text-on-surface-variant hover:bg-surface-container-low shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {sent ? (
          <div className="p-6 text-center space-y-3">
            <span className="mx-auto w-12 h-12 rounded-full bg-success text-on-success flex items-center justify-center"><Check className="w-6 h-6" /></span>
            <p className="font-bold text-on-surface">Request sent</p>
            <p className="text-sm text-on-surface-variant">
              {departmentLabel(service.department)} has it.
              {sent.price > 0 && <> {formatCurrency(sent.price, currency)} will be added to your room bill once it’s done.</>}
            </p>
            <button onClick={onClose} className="w-full h-11 rounded-xl bg-primary text-on-primary text-sm font-bold">Done</button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {isRoute ? (
                <div>
                  <p className="text-xs font-bold text-on-surface mb-2">Where to?</p>
                  {routes.length > 5 && (
                    <div className="relative mb-2">
                      <MapPin className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                      <input value={routeSearch} onChange={e => setRouteSearch(e.target.value)} placeholder="Search a destination…" className="w-full h-10 pl-9 pr-3 text-sm border border-outline-variant rounded-xl focus:border-primary focus:outline-none" />
                    </div>
                  )}
                  <div className="space-y-2">
                    {filteredRoutes.length === 0 ? (
                      <p className="text-xs text-on-surface-variant text-center py-6">No routes yet. Ask the front desk directly.</p>
                    ) : filteredRoutes.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRouteId(r.id)}
                        className={`w-full flex items-center justify-between gap-2 p-3 rounded-xl border text-left text-sm ${routeId === r.id ? 'border-primary bg-highlight' : 'border-outline-variant'}`}
                      >
                        <span className="flex items-center gap-2 text-on-surface min-w-0">
                          <span className="truncate">{r.from}</span> <Car className="w-3.5 h-3.5 text-on-surface-variant shrink-0" /> <span className="truncate">{r.to}</span>
                        </span>
                        <span className="font-semibold text-on-surface shrink-0">{formatCurrency(r.price, currency)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : choices.length > 0 ? (
                <div>
                  <p className="text-xs font-bold text-on-surface mb-2">
                    {form.multiple ? 'Choose what you need' : 'Choose one'}
                  </p>
                  <div className="space-y-2">
                    {choices.map(ch => {
                      const qty = picked[ch.id];
                      return (
                        <div key={ch.id} className={`flex items-center gap-2 p-3 rounded-xl border ${qty ? 'border-primary bg-highlight' : 'border-outline-variant'}`}>
                          <button type="button" onClick={() => toggle(ch.id)} className="flex-1 flex items-center gap-2.5 text-left min-w-0">
                            <span className={`w-5 h-5 shrink-0 flex items-center justify-center border ${form.multiple ? 'rounded-md' : 'rounded-full'} ${qty ? 'bg-primary border-primary text-on-primary' : 'border-outline'}`}>
                              {qty ? <Check className="w-3.5 h-3.5" /> : null}
                            </span>
                            <span className="text-sm text-on-surface truncate">{ch.label}</span>
                          </button>
                          {qty && form.quantity ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button type="button" onClick={() => setQty(ch.id, qty - 1)} aria-label="One less" className="w-7 h-7 rounded-lg bg-surface-container-lowest border border-outline-variant flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
                              <span className="w-5 text-center text-sm font-bold">{qty}</span>
                              <button type="button" onClick={() => setQty(ch.id, qty + 1)} aria-label="One more" className="w-7 h-7 rounded-lg bg-surface-container-lowest border border-outline-variant flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                            </div>
                          ) : null}
                          <span className="text-sm text-on-surface-variant shrink-0">{ch.price > 0 ? formatCurrency(ch.price, currency) : 'Free'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : showNote && NOTE_SUGGESTIONS[service.department]?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {NOTE_SUGGESTIONS[service.department].map(s => (
                    <button key={s} type="button" onClick={() => setNote(s)} className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${note === s ? 'border-primary bg-highlight text-primary' : 'border-outline-variant text-on-surface-variant'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              ) : null}

              {form.askTime && (
                <div>
                  <p className="text-xs font-bold text-on-surface mb-2">When?</p>
                  <div className="flex gap-2">
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-container-low p-1 text-xs font-semibold shrink-0">
                      {(['Today', 'Tomorrow'] as const).map(d => (
                        <button key={d} type="button" onClick={() => setDay(d)} className={`h-8 px-3 rounded-lg ${day === d ? 'bg-surface-container-lowest text-on-surface shadow-xs' : 'text-on-surface-variant'}`}>{d}</button>
                      ))}
                    </div>
                    <input type="time" value={time} onChange={e => setTime(e.target.value)} className="flex-1 min-w-0 h-10 px-3 text-sm border border-outline-variant rounded-xl focus:border-primary focus:outline-none" />
                  </div>
                </div>
              )}

              {showNote && (
                <div>
                  <p className="text-xs font-bold text-on-surface mb-2">Anything else? <span className="font-normal text-on-surface-variant">(optional)</span></p>
                  <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note for the team" className="w-full p-3 text-sm border border-outline-variant rounded-xl focus:border-primary focus:outline-none resize-none" />
                </div>
              )}

              {error && <p className="text-xs text-error">{error}</p>}
            </div>

            <div className="p-5 border-t border-outline-variant space-y-2" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
              {total > 0 && (
                <p className="text-xs text-on-surface-variant flex justify-between">
                  <span>Added to your room bill once done</span>
                  <span className="font-bold text-on-surface">{formatCurrency(total, currency)}</span>
                </p>
              )}
              <button onClick={handleSend} disabled={!ready || sending} className="w-full h-12 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary-hover disabled:opacity-50">
                {sending ? 'Sending…' : `Send to ${departmentLabel(service.department)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
