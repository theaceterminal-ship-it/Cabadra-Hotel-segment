import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Chip, ErrorNote, Panel, SectionHeader, btnPrimary, btnSecondary } from './ui';
import { DatePicker, fromIso, todayLocalIso } from '../../components/DatePicker';

interface AuditRow {
  id: number;
  at: string;
  table_name: string;
  row_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actor_id: string | null;
  actor_email: string | null;
  actor_kind: 'user' | 'guest_or_system' | 'service';
  via: string | null;
  ip: string | null;
  changes: Record<string, unknown> | null;
}

interface SecurityEventRow {
  id: number;
  at: string;
  kind: string;
  actor_email: string | null;
  actor_kind: string;
  via: string | null;
  ip: string | null;
  target_table: string | null;
  detail: Record<string, unknown> | null;
}

const EVENT_TEXT: Record<string, string> = {
  bill_line_tamper: 'Tried to change or remove a posted bill line',
  payment_tamper: 'Tried to change or remove a recorded payment',
  room_edit_blocked: 'Tried to change a room’s details or price without being the owner',
  cross_property_attempt: 'Tried to reach another hotel’s data',
  guest_flood: 'A guest link sent far too many requests, and was stopped',
  room_qr_guessing: 'Someone kept trying room codes that don’t exist',
  room_qr_rate_limited: 'A room’s code was looked up too many times in a minute',
  audit_log_tamper: 'Tried to edit or erase the activity log',
  direct_write_blocked: 'Tried to write straight to protected records',
};

const AREAS: { id: string; label: string; tables: string[] }[] = [
  { id: 'all', label: 'Everything', tables: [] },
  { id: 'blocked', label: 'Blocked attempts', tables: [] },
  { id: 'money', label: 'Money', tables: ['folio_charges', 'folio_payments', 'invoices', 'day_closes'] },
  { id: 'stays', label: 'Stays & orders', tables: ['reservations', 'guests', 'orders', 'experience_bookings'] },
  { id: 'setup', label: 'Rooms & menu', tables: ['rooms', 'menu_items', 'experiences', 'service_categories', 'transport_routes'] },
  { id: 'people', label: 'Staff & access', tables: ['staff_properties', 'staff_directory', 'property_access_links', 'pending_staff_invites', 'department_displays', 'shifts'] },
  { id: 'hotel', label: 'Hotel settings', tables: ['properties'] },
  { id: 'deleted', label: 'Deleted', tables: ['folio_chat_messages', 'guest_requests', 'tasks'] },
];

const TABLE_NOUN: Record<string, string> = {
  folio_charges: 'a bill line', folio_payments: 'a payment', invoices: 'an invoice', day_closes: 'a day close', reservations: 'a stay',
  guests: 'a guest record', orders: 'an order', experience_bookings: 'an experience booking', rooms: 'a room', menu_items: 'a dish',
  experiences: 'an experience', service_categories: 'a service', transport_routes: 'a transport route', staff_properties: 'a team member’s access',
  staff_directory: 'a department staff member', property_access_links: 'the reception link', pending_staff_invites: 'a staff invite',
  department_displays: 'a department screen', shifts: 'a shift', properties: 'the hotel’s settings', folio_chat_messages: 'a chat message',
  guest_requests: 'a guest request', tasks: 'a task',
};

const COLUMN_LABEL: Record<string, string> = {
  price_per_night: 'price per night', price: 'price', amount: 'amount', status: 'status', description: 'description', rate_per_night: 'room rate',
  check_in: 'check-in', check_out: 'check-out', voided_at: 'voided', void_reason: 'reason', voided_by: 'voided by', max_occupancy: 'capacity',
  name: 'name', phone: 'phone', role: 'role', active: 'on/off', available: 'available', total_amount: 'total', notes: 'notes', room_id: 'room',
  pre_arrival_enabled: 'offering something ready on arrival', guest_emails_enabled: 'guest emails', maps_url: 'map link', google_review_url: 'Google review link',
  welcome_note: 'welcome note', thanks_note: 'thank-you note', check_in_time: 'check-in time', check_out_time: 'check-out time',
  upi_id: 'UPI id', has_external_pms: 'uses another booking system', image: 'photo', location: 'location', legal_name: 'business name',
  billing_address: 'bill address', billing_phone: 'bill phone', billing_email: 'bill email', gstin: 'GSTIN', gst_enabled: 'GST', invoice_prefix: 'bill prefix',
  access_mode: 'room service access', qr_code: 'door QR code',
};
const labelOf = (c: string) => COLUMN_LABEL[c] ?? c.replace(/_/g, ' ');

const fmt = (v: unknown): string => {
  if (v === true) return 'on';
  if (v === false) return 'off';
  if (v === null || v === undefined || v === '') return 'empty';
  if (typeof v === 'number') return v.toLocaleString('en-IN');
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  if (typeof v === 'object') return 'updated';
  return String(v).length > 60 ? `${String(v).slice(0, 60)}…` : String(v);
};

/** One plain-English line for what happened. */
function summarise(r: AuditRow): string {
  const noun = TABLE_NOUN[r.table_name] ?? r.table_name;
  const c = r.changes ?? {};
  if (r.action === 'INSERT') {
    const d = (c as Record<string, unknown>).description ?? (c as Record<string, unknown>).name ?? (c as Record<string, unknown>).title;
    const amt = (c as Record<string, unknown>).amount ?? (c as Record<string, unknown>).total_amount ?? (c as Record<string, unknown>).price;
    return `Added ${noun}${d ? `: ${fmt(d)}` : ''}${amt !== undefined ? ` (${fmt(amt)})` : ''}`;
  }
  if (r.action === 'DELETE') {
    const d = (c as Record<string, unknown>).name ?? (c as Record<string, unknown>).title ?? (c as Record<string, unknown>).description ?? (c as Record<string, unknown>).body;
    return `Deleted ${noun}${d ? `: ${fmt(d)}` : ''}`;
  }
  const keys = Object.keys(c);
  if ('voided_at' in c) return `Voided ${noun}${'void_reason' in c ? ` (“${fmt((c.void_reason as { new?: unknown })?.new)}”)` : ''}`;
  const parts = keys.slice(0, 3).map(k => {
    const ch = c[k] as { old?: unknown; new?: unknown; changed?: boolean };
    return ch?.changed ? `${labelOf(k)} changed` : `${labelOf(k)}: ${fmt(ch?.old)} → ${fmt(ch?.new)}`;
  });
  return `Changed ${noun}: ${parts.join(', ')}${keys.length > 3 ? ` and ${keys.length - 3} more` : ''}`;
}

const who = (r: AuditRow) => r.actor_email ?? (r.actor_kind === 'service' ? 'Cabadra, automatically' : 'a guest or an automatic job');
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** The fields an entry changed, in plain words: "Price per night   3,000 → 3,500". Nothing technical is shown. */
function changedFields(r: AuditRow): { label: string; before: string; after: string | null }[] {
  if (r.action !== 'UPDATE' || !r.changes) return [];
  return Object.entries(r.changes as Record<string, { old?: unknown; new?: unknown; changed?: boolean }>).map(([k, ch]) => ({
    label: labelOf(k),
    before: fmt(ch?.old),
    after: ch?.changed ? null : fmt(ch?.new),
  }));
}

const PAGE = 30;

/** The start of a day (local time) and of the next one, as the timestamps the database compares. */
function dayRange(iso: string): [string, string] {
  const start = fromIso(iso);
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  return [start.toISOString(), next.toISOString()];
}

/**
 * Who did what: every change to stays, orders, bills, payments, prices, staff and
 * settings, with who made it. It can't be edited or erased by anyone, so a bill line
 * or a price can't change without leaving a line here. Only the owner sees this tab.
 *
 * Nothing is loaded until the owner asks (Show activity), and then only the chosen
 * day, 30 lines at a time, so opening the tab costs no database reads. Today is
 * chosen to begin with.
 */
export function ActivityTab({ propertyId }: { propertyId: string }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [events, setEvents] = useState<SecurityEventRow[]>([]);
  const [area, setArea] = useState('all');
  const [day, setDay] = useState(todayLocalIso());
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [started, setStarted] = useState(false);

  const load = useCallback(async (before?: number) => {
    setLoading(true);
    const [from, to] = dayRange(day);
    if (area === 'blocked') {
      let eq = supabase.from('security_events').select('*').eq('property_id', propertyId).gte('at', from).lt('at', to).order('id', { ascending: false }).limit(PAGE + 1);
      if (before) eq = eq.lt('id', before);
      const { data, error: err } = await eq;
      setLoading(false);
      if (err) { setError('Couldn’t load this just now. Please try again.'); return; }
      setError(null);
      const page = (data ?? []) as SecurityEventRow[];
      setMore(page.length > PAGE);
      setEvents(prev => (before ? [...prev, ...page.slice(0, PAGE)] : page.slice(0, PAGE)));
      return;
    }
    let q = supabase.from('audit_log').select('*').eq('property_id', propertyId).gte('at', from).lt('at', to).order('id', { ascending: false }).limit(PAGE + 1);
    const tables = AREAS.find(a => a.id === area)?.tables ?? [];
    if (tables.length) q = q.in('table_name', tables);
    if (before) q = q.lt('id', before);
    const { data, error: err } = await q;
    setLoading(false);
    if (err) { setError('Couldn’t load this just now. Please try again.'); return; }
    setError(null);
    const page = (data ?? []) as AuditRow[];
    setMore(page.length > PAGE);
    setRows(prev => (before ? [...prev, ...page.slice(0, PAGE)] : page.slice(0, PAGE)));
  }, [propertyId, area, day]);

  // Only once the owner has asked; after that, picking another day or area reloads.
  useEffect(() => { if (started) { setRows([]); setEvents([]); setOpen(null); load(); } }, [load, started]);

  const dayLabel = day === todayLocalIso() ? 'today' : fromIso(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });

  return (
    <Panel>
      <SectionHeader
        title="Activity"
        description="Who changed what, and when: stays, orders, bills, payments, prices, staff and settings. Nobody can edit or erase this list."
        actions={
          <DatePicker
            value={day}
            onChange={d => d && setDay(d)}
            max={todayLocalIso()}
            aria-label="Day"
            className="h-10 px-4 gap-2 rounded-full bg-surface-container-low text-sm font-medium text-on-surface flex items-center"
          />
        }
      />
      <div className="flex flex-wrap gap-1.5 mb-4">
        {AREAS.map(a => (
          <button key={a.id} onClick={() => setArea(a.id)} className={`h-9 px-4 rounded-full text-sm font-medium transition-colors ${area === a.id ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface'}`}>
            {a.label}
          </button>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!started ? (
        <div className="py-10 text-center">
          <ShieldCheck className="size-7 mx-auto mb-2 text-on-surface-variant opacity-60" />
          <p className="text-sm text-on-surface-variant mb-4">Pick a day and press the button. Nothing is loaded until you ask.</p>
          <button onClick={() => setStarted(true)} className={btnPrimary}>Show activity for {dayLabel}</button>
        </div>
      ) : area === 'blocked' ? (
        events.length === 0 && !loading && !error ? (
          <div className="py-10 text-center text-sm text-on-surface-variant">
            <ShieldCheck className="size-7 mx-auto mb-2 opacity-50" />
            Nothing was blocked {dayLabel}.
          </div>
        ) : (
          <ul className="rounded-[20px] border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {events.map(e => (
              <li key={e.id} className="px-4 py-3 flex items-start gap-3">
                <span className="w-16 shrink-0 text-xs font-medium text-on-surface-variant pt-0.5">{timeOf(e.at)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-on-surface">{EVENT_TEXT[e.kind] ?? 'A request was blocked'}</span>
                  <span className="block text-xs text-on-surface-variant mt-0.5">{e.actor_email ?? 'Someone who was not signed in'}{e.ip ? ` · from ${e.ip}` : ''}</span>
                </span>
                <Chip tone="warn">Blocked</Chip>
              </li>
            ))}
          </ul>
        )
      ) : rows.length === 0 && !loading && !error ? (
        <div className="py-10 text-center text-sm text-on-surface-variant">
          <ShieldCheck className="size-7 mx-auto mb-2 opacity-50" />
          Nothing was recorded {dayLabel}.
        </div>
      ) : (
        <ul className="rounded-[20px] border border-outline-variant divide-y divide-outline-variant overflow-hidden">
          {rows.map(r => {
            const fields = changedFields(r);
            const expandable = fields.length > 0;
            const isOpen = open === r.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={!expandable}
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${expandable ? 'hover:bg-surface-container-low cursor-pointer' : 'cursor-default'}`}
                >
                  <span className="w-16 shrink-0 text-xs font-medium text-on-surface-variant pt-0.5">{timeOf(r.at)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-on-surface">{summarise(r)}</span>
                    <span className="block text-xs text-on-surface-variant mt-0.5">by {who(r)}</span>
                  </span>
                  {r.actor_kind === 'user' ? <Chip>Staff</Chip> : r.actor_kind === 'service' ? <Chip tone="warn">Automatic</Chip> : <Chip tone="neutral">Guest</Chip>}
                  {expandable && <ChevronDown className={`size-4 mt-1 text-on-surface-variant shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                </button>
                {isOpen && (
                  <ul className="mx-4 mb-3 ml-[5.75rem] rounded-xl bg-surface-container-low divide-y divide-outline-variant overflow-hidden text-xs">
                    {fields.map(f => (
                      <li key={f.label} className="px-3 py-2 flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium text-on-surface">{f.label.charAt(0).toUpperCase() + f.label.slice(1)}</span>
                        <span className="text-on-surface-variant">
                          {f.after === null ? 'was changed' : <>{f.before} <span aria-hidden>→</span> <span className="font-medium text-on-surface">{f.after}</span></>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {started && (
        <div className="mt-4 flex justify-center gap-2">
          {loading ? <Loader2 className="size-5 animate-spin text-on-surface-variant" /> : (
            <>
              <button onClick={() => load()} className={btnSecondary}>Refresh</button>
              {more && <button onClick={() => load(area === 'blocked' ? events[events.length - 1]?.id : rows[rows.length - 1]?.id)} className={btnSecondary}>Show earlier</button>}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
