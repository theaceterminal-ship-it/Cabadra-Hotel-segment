import React, { useEffect, useMemo, useState } from 'react';
import { toCsv } from '../lib/safeText';
import { AlertTriangle, Download, Printer } from 'lucide-react';
import { BOOKING_CHANNELS, GUEST_ID_TYPES, ExtrasReport, PropertyReport, RegisterEntry, fetchExtrasReport, fetchGuestRegister, fetchReport } from '../lib/staffApi';
import { DEPARTMENT_LABELS } from '../lib/departments';
import { formatCurrency } from '../lib/currency';
import { addDays, fmtDay, todayIso } from './bookings/bookingUtils';

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom';

const CATEGORY_LABEL: Record<string, string> = { room: 'Rooms', room_service: 'Food', extra: 'Extras', laundry: 'Laundry', minibar: 'Minibar', spa: 'Spa', other: 'Services & other' };
const METHOD_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank', other: 'Other' };

function rangeFor(p: Preset, custom: { from: string; to: string }): { from: string; to: string } {
  const t = todayIso();
  const d = new Date(`${t}T12:00:00`);
  if (p === 'today') return { from: t, to: t };
  if (p === 'yesterday') return { from: addDays(t, -1), to: addDays(t, -1) };
  if (p === 'week') return { from: addDays(t, -6), to: t };
  if (p === 'month') return { from: `${t.slice(0, 8)}01`, to: t };
  if (p === 'last_month') {
    const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const last = new Date(d.getFullYear(), d.getMonth(), 0);
    const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return { from: iso(first), to: iso(last) };
  }
  return custom;
}

function downloadCsv(name: string, rows: (string | number | undefined | null)[][]) {
  const csv = toCsv(rows);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The numbers a hotel runs on, for any range: occupancy, room nights sold,
 * average rate (ADR), revenue per available room (RevPAR), revenue by
 * category, GST by rate, money in by method, where bookings came from,
 * cancellations and no-shows, and every day close with its cash
 * difference. A second tab is the guest register for the police, with
 * foreign guests flagged for Form C. Used at reception and on the owner's
 * property page alike.
 */
export function ReportsView({ propertyId, propertyName, currency, hasExternalPms = false }: {
  propertyId: string; propertyName: string; currency: string;
  /** The hotel runs another PMS (Cabadra is its guest app): extras only, no rooms metrics, no guest register (its PMS keeps that). */
  hasExternalPms?: boolean;
}) {
  const [tab, setTab] = useState<'overview' | 'register'>('overview');
  const [preset, setPreset] = useState<Preset>('week');
  const [custom, setCustom] = useState({ from: addDays(todayIso(), -29), to: todayIso() });
  const range = useMemo(() => rangeFor(preset, custom), [preset, custom]);
  const [report, setReport] = useState<PropertyReport | null>(null);
  const [extras, setExtras] = useState<ExtrasReport | null>(null);
  const [register, setRegister] = useState<RegisterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (tab === 'overview') {
      setReport(null);
      setExtras(null);
      Promise.all([fetchReport(propertyId, range.from, range.to), fetchExtrasReport(propertyId, range.from, range.to)])
        .then(([r, x]) => { setReport(r); setExtras(x); })
        .catch(err => setError(err.message));
    } else {
      setRegister(null);
      fetchGuestRegister(propertyId, range.from, range.to).then(setRegister).catch(err => setError(err.message));
    }
  }, [propertyId, range.from, range.to, tab]);

  const label = range.from === range.to ? fmtDay(range.from, { day: 'numeric', month: 'long', year: 'numeric' }) : `${fmtDay(range.from)} – ${fmtDay(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="px-4 sm:px-6 pb-10 space-y-5 max-w-6xl">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] text-on-surface">Reports</h1>
        </div>
        {!hasExternalPms && <div className="flex rounded-full bg-surface-container-low p-1 self-start">
          {(['overview', 'register'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`h-8 px-4 rounded-full text-sm font-medium ${tab === t ? 'bg-primary text-on-primary' : 'text-on-surface'}`}>{t === 'overview' ? 'Overview' : 'Guest register'}</button>
          ))}
        </div>}
      </div>

      {/* Filters: one row above everything they control. */}
      <div className="flex flex-wrap items-center gap-1.5 print:hidden">
        {([['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['month', 'This month'], ['last_month', 'Last month'], ['custom', 'Custom']] as const).map(([id, l]) => (
          <button key={id} onClick={() => setPreset(id)} className={`h-9 px-4 rounded-full text-sm font-medium ${preset === id ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest border border-outline-variant text-on-surface'}`}>{l}</button>
        ))}
        {preset === 'custom' && (
          <span className="flex items-center gap-1.5">
            <input type="date" value={custom.from} max={custom.to} onChange={e => e.target.value && setCustom(x => ({ ...x, from: e.target.value }))} className="h-9 px-3 rounded-full bg-surface-container-lowest border border-outline-variant text-sm" aria-label="From" />
            <span className="text-on-surface-variant">–</span>
            <input type="date" value={custom.to} min={custom.from} onChange={e => e.target.value && setCustom(x => ({ ...x, to: e.target.value }))} className="h-9 px-3 rounded-full bg-surface-container-lowest border border-outline-variant text-sm" aria-label="To" />
          </span>
        )}
        <span className="text-sm text-on-surface-variant ml-1">{label}</span>
      </div>

      {error && <p className="text-sm text-error bg-error/10 rounded-2xl px-4 py-3">{error}</p>}
      {tab === 'overview'
        ? (report && extras
            ? (hasExternalPms
                ? <ExtrasOverview report={report} extras={extras} currency={currency} />
                : <Overview report={report} extras={extras} currency={currency} propertyName={propertyName} />)
            : !error && <p className="text-sm text-on-surface-variant">Loading…</p>)
        : (register ? <Register entries={register} propertyName={propertyName} label={label} range={range} /> : !error && <p className="text-sm text-on-surface-variant">Loading…</p>)}
    </div>
  );
}

function Overview({ report: r, extras, currency, propertyName }: { report: PropertyReport; extras: ExtrasReport; currency: string; propertyName: string }) {
  const c = (n: number) => formatCurrency(n, currency);
  const exportDaily = () => downloadCsv(`${propertyName} ${r.from} to ${r.to}.csv`, [
    ['Date', 'Rooms occupied', 'Rooms', 'Occupancy %', 'Room revenue'],
    ...r.daily.map(d => [d.date, d.occupied, r.rooms, d.occupancy, d.roomRevenue]),
  ]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <Kpi label="Occupancy" value={`${r.occupancy}%`} hint={`${r.roomNightsSold} of ${r.roomNightsAvailable} room nights`} />
        <Kpi label="Average rate (ADR)" value={c(r.adr)} hint="room revenue ÷ nights sold" />
        <Kpi label="RevPAR" value={c(r.revpar)} hint="room revenue ÷ rooms available" />
        <Kpi label="Room revenue" value={c(r.roomRevenue)} hint="before GST" />
        <Kpi label="All revenue" value={c(r.revenueTotal)} hint={r.taxTotal > 0 ? `+ ${c(r.taxTotal)} GST` : 'before GST'} strong />
      </div>

      {r.daily.length > 1 && <OccupancyChart daily={r.daily} rooms={r.rooms} currency={currency} onExport={exportDaily} />}

      <div className="grid md:grid-cols-2 gap-3">
        <Card title="Revenue by category (before GST)">
          <Rows rows={Object.entries(r.revenueByCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => [CATEGORY_LABEL[k] ?? k, c(v)])} empty="Nothing billed." total={['Total', c(r.revenueTotal)]} />
        </Card>
        <Card title="Money in, by method (refunds netted)">
          <Rows rows={(['cash', 'upi', 'card', 'bank', 'other'] as const).filter(m => r.payments[m] !== 0).map(m => [METHOD_LABEL[m], c(r.payments[m])])} empty="No payments." total={['Total', c(r.payments.total)]} />
          {r.payments.refunds > 0 && <p className="text-xs text-on-surface-variant mt-2">Includes {c(r.payments.refunds)} refunded.</p>}
        </Card>
        <Card title="GST collected">
          {r.taxByRate.length === 0 ? <p className="text-sm text-on-surface-variant">No GST charged in this period.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-on-surface-variant text-left"><th className="font-medium pb-1">Rate</th><th className="font-medium pb-1 text-right">Taxable</th><th className="font-medium pb-1 text-right">CGST</th><th className="font-medium pb-1 text-right">SGST</th></tr></thead>
              <tbody>
                {r.taxByRate.map(t => (
                  <tr key={t.rate}><td>{t.rate}%</td><td className="text-right">{c(t.taxable)}</td><td className="text-right">{c(t.cgst)}</td><td className="text-right">{c(t.sgst)}</td></tr>
                ))}
                <tr className="font-semibold border-t border-outline-variant"><td className="pt-1.5">Total</td><td /><td className="text-right pt-1.5" colSpan={2}>{c(r.taxTotal)}</td></tr>
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Bookings">
          <Rows
            rows={[
              ['Made in this period', String(r.bookingsMade)],
              ...Object.entries(r.bookingsByChannel).sort((a, b) => b[1] - a[1]).map(([k, v]) => [`  via ${BOOKING_CHANNELS.find(x => x.id === k)?.label ?? k}`, String(v)] as [string, string]),
              ['Arrivals', String(r.arrivals)],
              ['Cancellations', String(r.cancellations)],
              ['No-shows', String(r.noShows)],
              ['Average stay', `${r.averageStay} nights`],
            ]}
            empty=""
          />
        </Card>
      </div>

      <div>
        <p className="text-sm font-medium text-on-surface-variant mb-2 px-1">Beyond rooms</p>
        <ExtrasSections extras={extras} currency={currency} />
      </div>

      <DayCloses report={r} currency={currency} />
    </div>
  );
}

function DayCloses({ report: r, currency }: { report: PropertyReport; currency: string }) {
  const c = (n: number) => formatCurrency(n, currency);
  return (
      <Card title="Day closes">
        {r.dayCloses.length === 0 ? <p className="text-sm text-on-surface-variant">No days closed in this period.</p> : (
          <div className="divide-y divide-outline-variant -mx-1">
            {r.dayCloses.map(d => {
              const off = Math.abs(d.cashDifference) >= 0.005;
              return (
                <div key={d.date} className="px-1 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="w-28 font-medium">{fmtDay(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="text-on-surface-variant">Collected {c(d.expected.total)}</span>
                  <span className="text-on-surface-variant">Cash {c(d.expected.cash)} expected, {c(d.countedCash)} counted</span>
                  <span className={`inline-flex items-center gap-1 font-medium ${off ? 'text-warning' : 'text-success'}`}>
                    {off && <AlertTriangle className="size-3.5" />}
                    {off ? (d.cashDifference < 0 ? `${c(-d.cashDifference)} short` : `${c(d.cashDifference)} over`) : 'Exact'}
                  </span>
                  {(d.note || d.closedBy) && <span className="w-full text-xs text-on-surface-variant">{d.closedBy}{d.note ? ` · “${d.note}”` : ''}</span>}
                </div>
              );
            })}
          </div>
        )}
      </Card>
  );
}

/** What a hotel that runs its own PMS gets from Cabadra: the guest app's business. */
function ExtrasOverview({ report: r, extras: x, currency }: { report: PropertyReport; extras: ExtrasReport; currency: string }) {
  const c = (n: number) => formatCurrency(n, currency);
  const takeUp = x.suggestions.shown > 0 ? Math.round((100 * x.suggestions.taken) / x.suggestions.shown) : 0;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <Kpi label="Food orders" value={String(x.orders.count)} hint={`${x.orders.roomsOrdering} ${x.orders.roomsOrdering === 1 ? 'stay' : 'stays'} ordered`} />
        <Kpi label="Average order" value={c(x.orders.average)} />
        <Kpi label="Requests" value={String(x.requests.count)} hint={x.requests.resolved ? `resolved in ~${x.requests.avgMinutesToResolve} min` : 'none resolved yet'} />
        <Kpi label="Suggestions taken" value={`${takeUp}%`} hint={`${x.suggestions.taken} of ${x.suggestions.shown} shown`} />
        <Kpi label="Billed through Cabadra" value={c(r.revenueTotal)} hint={r.taxTotal > 0 ? `+ ${c(r.taxTotal)} GST` : 'before GST'} strong />
      </div>
      <ExtrasSections extras={x} currency={currency} />
      <div className="grid md:grid-cols-2 gap-3">
        <Card title="Billed by category (before GST)">
          <Rows rows={Object.entries(r.revenueByCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => [CATEGORY_LABEL[k] ?? k, c(v)])} empty="Nothing billed." total={['Total', c(r.revenueTotal)]} />
        </Card>
        <Card title="Money in, by method (refunds netted)">
          <Rows rows={(['cash', 'upi', 'card', 'bank', 'other'] as const).filter(m => r.payments[m] !== 0).map(m => [METHOD_LABEL[m], c(r.payments[m])])} empty="No payments." total={['Total', c(r.payments.total)]} />
        </Card>
      </div>
      <DayCloses report={r} currency={currency} />
    </div>
  );
}

/** Food, requests and experiences: shared by both kinds of hotel. */
function ExtrasSections({ extras: x, currency }: { extras: ExtrasReport; currency: string }) {
  const c = (n: number) => formatCurrency(n, currency);
  return (
    <div className="grid md:grid-cols-3 gap-3">
      <Card title="Most ordered">
        {x.topItems.length === 0 ? <p className="text-sm text-on-surface-variant">No orders yet.</p> : (
          <ol className="space-y-1.5 text-sm">
            {x.topItems.map((t, i) => (
              <li key={t.name} className="flex justify-between gap-3">
                <span className="truncate"><span className="text-on-surface-variant mr-1.5">{i + 1}.</span>{t.name} <span className="text-on-surface-variant">× {t.qty}</span></span>
                <span className="font-medium shrink-0">{c(t.revenue)}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-on-surface-variant mt-3">{x.orders.count} orders · {c(x.orders.revenue)}{x.orders.rejected ? ` · ${x.orders.rejected} the kitchen couldn’t make` : ''}</p>
      </Card>
      <Card title="Guest requests">
        <Rows
          rows={[
            ['Asked', String(x.requests.count)],
            ['Resolved', String(x.requests.resolved)],
            ['Still open', String(x.requests.open)],
            ['Average time to resolve', x.requests.resolved ? `${x.requests.avgMinutesToResolve} min` : '—'],
            ...Object.entries(x.requests.byDepartment).sort((a, b) => b[1] - a[1]).map(([d, n]) => [`  ${DEPARTMENT_LABELS[d as keyof typeof DEPARTMENT_LABELS] ?? d}`, String(n)] as [string, string]),
          ]}
          empty=""
        />
      </Card>
      <Card title="Experiences booked">
        <Rows rows={[['Bookings', String(x.experiences.count)], ['Guests', String(x.experiences.guests)], ['Value', c(x.experiences.revenue)]]} empty="" />
      </Card>
    </div>
  );
}

/** Rooms occupied per night: one series, so no legend; hover a bar for its numbers; the CSV is the table view. */
function OccupancyChart({ daily, rooms, currency, onExport }: { daily: PropertyReport['daily']; rooms: number; currency: string; onExport: () => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(rooms, 1);
  const h = daily[hover ?? -1];
  return (
    <Card
      title="Rooms occupied each night"
      action={<button onClick={onExport} className="h-8 px-3 rounded-full bg-surface-container-low text-xs font-medium inline-flex items-center gap-1.5 print:hidden"><Download className="size-3.5" /> CSV</button>}
    >
      <div className="relative">
        <div className="flex items-end gap-[2px] h-36 border-b border-outline-variant" onMouseLeave={() => setHover(null)}>
          {daily.map((d, i) => (
            <div key={d.date} className="flex-1 h-full flex items-end cursor-default" onMouseEnter={() => setHover(i)}>
              <div
                className={`w-full rounded-t-[4px] transition-opacity ${hover === null || hover === i ? 'bg-primary' : 'bg-primary/40'}`}
                style={{ height: `${(d.occupied / max) * 100}%`, minHeight: d.occupied > 0 ? 2 : 0 }}
              />
            </div>
          ))}
        </div>
        {h && (
          <div className="absolute -top-2 right-0 rounded-xl bg-surface-container-lowest border border-outline-variant shadow-lg px-3 py-2 text-xs pointer-events-none">
            <p className="font-semibold text-on-surface">{fmtDay(h.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
            <p className="text-on-surface-variant">{h.occupied} of {rooms} rooms · {h.occupancy}%</p>
            <p className="text-on-surface-variant">Room revenue {formatCurrency(h.roomRevenue, currency)}</p>
          </div>
        )}
        <div className="flex justify-between text-[11px] text-on-surface-variant mt-1.5">
          <span>{fmtDay(daily[0].date)}</span>
          <span>{rooms} rooms</span>
          <span>{fmtDay(daily[daily.length - 1].date)}</span>
        </div>
      </div>
    </Card>
  );
}

function Register({ entries, propertyName, label, range }: { entries: RegisterEntry[]; propertyName: string; label: string; range: { from: string; to: string } }) {
  const foreign = entries.filter(e => e.foreign);
  const missing = entries.filter(e => !e.nationality || !e.idNumber || !e.address);
  const idLabel = (t?: string) => GUEST_ID_TYPES.find(x => x.id === t)?.label ?? '';
  const dt = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

  const exportCsv = () => downloadCsv(`Guest register ${propertyName} ${range.from} to ${range.to}.csv`, [
    ['Arrived', 'Left', 'Booking', 'Room', 'Guests', 'Name', 'Nationality', 'Address', 'Phone', 'Email', 'ID type', 'ID number', 'ID photo on file'],
    ...entries.map(e => [dt(e.arrived), dt(e.left), e.ref, e.room, e.guests, e.name, e.nationality, e.address, e.phone, e.email, idLabel(e.idType), e.idNumber, e.idPhotoOnFile ? 'Yes' : 'No']),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button onClick={exportCsv} className="h-9 px-4 rounded-full bg-surface-container-lowest border border-outline-variant text-sm font-medium inline-flex items-center gap-1.5"><Download className="size-4" /> CSV</button>
        <button onClick={() => window.print()} className="h-9 px-4 rounded-full bg-surface-container-lowest border border-outline-variant text-sm font-medium inline-flex items-center gap-1.5"><Printer className="size-4" /> Print</button>
        {missing.length > 0 && <span className="text-sm text-warning">{missing.length} {missing.length === 1 ? 'guest is' : 'guests are'} missing nationality, address or ID: fill them in from the booking.</span>}
      </div>
      {foreign.length > 0 && (
        <p className="rounded-[20px] bg-warning/10 text-on-surface px-4 py-3 text-sm flex gap-2 print:hidden">
          <AlertTriangle className="size-4 mt-0.5 text-warning shrink-0" />
          <span>{foreign.length} foreign {foreign.length === 1 ? 'guest' : 'guests'} in this period. Form C must be filed on the Bureau of Immigration’s portal within 24 hours of arrival.</span>
        </p>
      )}
      <div className="print-only-root rounded-[24px] bg-surface-container-lowest border border-outline-variant overflow-x-auto print:border-0 print:bg-white print:text-black">
        <p className="hidden print:block px-2 pb-2 font-semibold">{propertyName} · Guest register · {label}</p>
        {entries.length === 0 ? <p className="p-6 text-sm text-on-surface-variant">No arrivals in this period.</p> : (
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-on-surface-variant border-b border-outline-variant">
                {['Arrived', 'Left', 'Room', 'Guest', 'Nationality', 'Address', 'ID', 'Phone'].map(h => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {entries.map(e => (
                <tr key={e.reservationId} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{dt(e.arrived)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-on-surface-variant">{e.left ? dt(e.left) : 'In house'}</td>
                  <td className="px-3 py-2">{e.room}</td>
                  <td className="px-3 py-2"><span className="font-medium">{e.name}</span><span className="block text-xs text-on-surface-variant">{e.guests} {e.guests === 1 ? 'guest' : 'guests'} · #{e.ref}</span></td>
                  <td className="px-3 py-2">{e.nationality ?? <span className="text-warning">—</span>}{e.foreign && <span className="ml-1.5 text-[11px] font-medium text-warning">Form C</span>}</td>
                  <td className="px-3 py-2 max-w-[220px]">{e.address ?? <span className="text-warning">—</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{e.idNumber ? `${idLabel(e.idType)} ${e.idNumber}` : <span className="text-warning">—</span>}{e.idPhotoOnFile && <span className="block text-[11px] text-on-surface-variant">Photo on file</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{e.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={`rounded-[20px] p-4 ${strong ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest border border-outline-variant'}`}>
      <p className={`text-xs ${strong ? 'opacity-75' : 'text-on-surface-variant'}`}>{label}</p>
      <p className="mt-1.5 text-xl font-semibold tracking-[-0.02em]">{value}</p>
      {hint && <p className={`text-[11px] mt-0.5 ${strong ? 'opacity-75' : 'text-on-surface-variant'}`}>{hint}</p>}
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] bg-surface-container-lowest border border-outline-variant p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm font-medium text-on-surface-variant">{title}</p>
        {action}
      </div>
      {children}
    </section>
  );
}

function Rows({ rows, empty, total }: { rows: [string, string][]; empty: string; total?: [string, string] }) {
  if (rows.length === 0) return <p className="text-sm text-on-surface-variant">{empty}</p>;
  return (
    <dl className="space-y-1.5 text-sm">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3"><dt className={k.startsWith('  ') ? 'pl-3 text-on-surface-variant' : ''}>{k.trim()}</dt><dd className="font-medium">{v}</dd></div>
      ))}
      {total && <div className="flex justify-between pt-1.5 border-t border-outline-variant font-semibold"><dt>{total[0]}</dt><dd>{total[1]}</dd></div>}
    </dl>
  );
}
