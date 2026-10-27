import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Chip, ErrorNote, Panel, SectionHeader, btnSecondary } from './ui';

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
};
const labelOf = (c: string) => COLUMN_LABEL[c] ?? c.replace(/_/g, ' ');

const fmt = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'empty';
  if (typeof v === 'number') return v.toLocaleString('en-IN');
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80);
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

const who = (r: AuditRow) => r.actor_email ?? (r.actor_kind === 'service' ? 'Cabadra system' : 'A guest or an automatic job');

const PAGE = 30;

/**
 * Who did what (audit_log, 0087): every change to bookings, orders, bill
 * lines, payments, room and menu prices, staff and settings, with the login
 * that made it and what it was before. It can't be edited or erased by
 * anyone, which is the point: a bill line or a price can't be changed
 * without leaving a record here. Only the owner sees this tab.
 *
 * Nothing is fetched until the owner asks (the button below), and then only
 * 30 rows at a time, so opening the tab costs no database reads.
 */
export function ActivityTab({ propertyId }: { propertyId: string }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [events, setEvents] = useState<SecurityEventRow[]>([]);
  const [area, setArea] = useState('all');
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [started, setStarted] = useState(false);

  const load = useCallback(async (before?: number) => {
    setLoading(true);
    if (area === 'blocked') {
      let eq = supabase.from('security_events').select('*').eq('property_id', propertyId).order('id', { ascending: false }).limit(PAGE + 1);
      if (before) eq = eq.lt('id', before);
      const { data, error: err } = await eq;
      setLoading(false);
      if (err) { setError(err.message); return; }
      setError(null);
      const page = (data ?? []) as SecurityEventRow[];
      setMore(page.length > PAGE);
      setEvents(prev => (before ? [...prev, ...page.slice(0, PAGE)] : page.slice(0, PAGE)));
      return;
    }
    let q = supabase.from('audit_log').select('*').eq('property_id', propertyId).order('id', { ascending: false }).limit(PAGE + 1);
    const tables = AREAS.find(a => a.id === area)?.tables ?? [];
    if (tables.length) q = q.in('table_name', tables);
    if (before) q = q.lt('id', before);
    const { data, error: err } = await q;
    setLoading(false);
    if (err) { setError(err.message); return; }
    setError(null);
    const page = (data ?? []) as AuditRow[];
    setMore(page.length > PAGE);
    setRows(prev => (before ? [...prev, ...page.slice(0, PAGE)] : page.slice(0, PAGE)));
  }, [propertyId, area]);

  // Only once the owner has asked; after that, changing the filter reloads.
  useEffect(() => { if (started) { setRows([]); setEvents([]); load(); } }, [load, started]);

  return (
    <Panel>
      <SectionHeader
        title="Activity"
        description="Every change to stays, orders, bills, payments, prices, staff and settings, and who made it. Nobody can edit or erase this list."
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
          <p className="text-sm text-on-surface-variant mb-4">The latest 30 changes load when you ask, so this page stays light.</p>
          <button onClick={() => setStarted(true)} className={btnSecondary}>Show activity</button>
        </div>
      ) : area === 'blocked' ? (
        events.length === 0 && !loading && !error ? (
          <div className="py-10 text-center text-sm text-on-surface-variant">
            <ShieldCheck className="size-7 mx-auto mb-2 opacity-50" />
            No blocked attempts recorded. If someone tries something they shouldn’t, it will show here with who it was.
          </div>
        ) : (
          <div className="rounded-[20px] border border-outline-variant divide-y divide-outline-variant overflow-hidden">
            {events.map(e => (
              <div key={e.id} className="px-4 py-3">
                <span className="block text-sm text-on-surface">{EVENT_TEXT[e.kind] ?? e.kind}</span>
                <span className="block text-xs text-on-surface-variant mt-0.5">
                  {new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' })} · {e.actor_email ?? 'Not signed in'}
                  {e.ip ? ` · ${e.ip}` : ''}{e.target_table ? ` · ${e.target_table.replace(/_/g, ' ')}` : ''}
                </span>
                {e.detail && Object.keys(e.detail).length > 0 && (
                  <span className="block text-[11px] font-mono text-on-surface-variant mt-1 break-words">{JSON.stringify(e.detail).slice(0, 200)}</span>
                )}
              </div>
            ))}
          </div>
        )
      ) : rows.length === 0 && !loading && !error ? (
        <div className="py-10 text-center text-sm text-on-surface-variant">
          <ShieldCheck className="size-7 mx-auto mb-2 opacity-50" />
          Nothing recorded here yet. New changes will show up as they happen.
        </div>
      ) : (
        <div className="rounded-[20px] border border-outline-variant divide-y divide-outline-variant overflow-hidden">
          {rows.map(r => (
            <div key={r.id}>
              <button onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-surface-container-low transition-colors">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-on-surface">{summarise(r)}</span>
                  <span className="block text-xs text-on-surface-variant mt-0.5">
                    {new Date(r.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' })} · {who(r)}
                  </span>
                </span>
                {r.actor_kind === 'user' ? <Chip>Staff</Chip> : r.actor_kind === 'service' ? <Chip tone="warn">System</Chip> : <Chip tone="neutral">Guest / auto</Chip>}
                <ChevronDown className={`size-4 mt-1 text-on-surface-variant shrink-0 transition-transform ${open === r.id ? 'rotate-180' : ''}`} />
              </button>
              {open === r.id && (
                <div className="px-4 pb-4 text-xs text-on-surface-variant space-y-2 bg-surface-container-low/60">
                  <p>
                    <span className="font-medium text-on-surface">{TABLE_NOUN[r.table_name] ?? r.table_name}</span> · {r.action.toLowerCase()}
                    {r.row_id ? <> · <span className="font-mono">{r.row_id.slice(0, 13)}</span></> : null}
                    {r.via ? <> · via <span className="font-mono">{r.via}</span></> : null}
                    {r.ip ? <> · from <span className="font-mono">{r.ip}</span></> : null}
                  </p>
                  {r.changes && (
                    <pre className="whitespace-pre-wrap break-words rounded-xl bg-surface-container-lowest border border-outline-variant p-3 text-[11px] leading-relaxed text-on-surface max-h-64 overflow-auto">{JSON.stringify(r.changes, null, 2)}</pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {started && (
        <div className="mt-4 flex justify-center gap-2">
          {loading ? <Loader2 className="size-5 animate-spin text-on-surface-variant" /> : (
            <>
              <button onClick={() => load()} className={btnSecondary}>Refresh</button>
              {more && <button onClick={() => load(area === 'blocked' ? events[events.length - 1]?.id : rows[rows.length - 1]?.id)} className={btnSecondary}>Show older</button>}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
