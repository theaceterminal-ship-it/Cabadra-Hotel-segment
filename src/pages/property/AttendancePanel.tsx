import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ChevronDown, Clock, Download } from 'lucide-react';
import { AttendanceRow, fetchStaffAttendance } from '../../lib/staffApi';
import { DEPARTMENT_LABELS } from '../../lib/departments';
import { ErrorNote, Panel, SectionHeader, btnSecondary } from './ui';

type Range = 'week' | 'month' | 'last_month';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function rangeFor(r: Range): { from: string; to: string } {
  const now = new Date();
  if (r === 'week') { const f = new Date(now); f.setDate(f.getDate() - 6); return { from: iso(f), to: iso(now) }; }
  if (r === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
}

const hours = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(Math.round(minutes % 60)).padStart(2, '0')}m`;
const time = (ts: string) => new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/**
 * Who worked when, from the badge scans on the department screens: days
 * present and absent, hours, late starts against their shift, and clock-outs
 * that were never scanned (counted as 12 hours at most, and flagged so the
 * owner can check before paying). A row opens into its days. CSV for
 * payroll.
 */
export function AttendancePanel({ propertyId }: { propertyId: string }) {
  const [range, setRange] = useState<Range>('week');
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const { from, to } = useMemo(() => rangeFor(range), [range]);

  useEffect(() => {
    setRows(null);
    fetchStaffAttendance(propertyId, from, to).then(r => { setRows(r); setError(null); }).catch(err => setError(err.message));
  }, [propertyId, from, to]);

  const exportCsv = () => {
    if (!rows) return;
    const lines = [['Name', 'Department', 'Job title', 'Days present', 'Days absent', 'Hours', 'Late days', 'Missed clock-outs'],
      ...rows.map(r => [r.name, DEPARTMENT_LABELS[r.department], r.jobTitle ?? '', r.daysPresent, r.daysAbsent, (r.minutes / 60).toFixed(2), r.lateDays, r.missedClockOuts])];
    const csv = lines.map(l => l.map(v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: `Attendance ${from} to ${to}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel>
      <SectionHeader
        title="Attendance"
        description="From badge scans on the department screens: scan in to start a shift, scan again to finish."
        actions={rows && rows.length > 0 && <button onClick={exportCsv} className={btnSecondary}><Download className="size-4" /> CSV</button>}
      />
      <div className="flex flex-wrap gap-1.5 mb-4">
        {([['week', 'Last 7 days'], ['month', 'This month'], ['last_month', 'Last month']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setRange(id)} className={`h-9 px-4 rounded-full text-sm font-medium transition-colors ${range === id ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface'}`}>{label}</button>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!rows ? (
        !error && <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Add department staff above; their badge scans show up here.</p>
      ) : (
        <div className="rounded-[20px] border border-outline-variant divide-y divide-outline-variant overflow-hidden">
          {rows.map(r => {
            const expanded = open === r.staffId;
            return (
              <div key={r.staffId}>
                <button onClick={() => setOpen(expanded ? null : r.staffId)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-surface-container-low transition-colors">
                  <span className="relative size-9 rounded-full bg-surface-container-low flex items-center justify-center text-sm font-semibold shrink-0">
                    {r.name.charAt(0).toUpperCase()}
                    {r.onShiftNow && <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-room-ready ring-2 ring-surface-container-lowest" title="On shift now" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{r.name}</span>
                    <span className="block text-xs text-on-surface-variant truncate">{[r.jobTitle, DEPARTMENT_LABELS[r.department]].filter(Boolean).join(' · ')}{r.onShiftNow ? ' · on shift now' : ''}</span>
                  </span>
                  <span className="hidden sm:grid grid-cols-4 gap-5 text-right shrink-0">
                    <Stat label="Present" value={String(r.daysPresent)} />
                    <Stat label="Absent" value={String(r.daysAbsent)} />
                    <Stat label="Hours" value={hours(r.minutes)} />
                    <Stat label="Late" value={String(r.lateDays)} warn={r.lateDays > 0} />
                  </span>
                  {r.missedClockOuts > 0 && <span title={`${r.missedClockOuts} missed clock-out${r.missedClockOuts > 1 ? 's' : ''}`}><AlertTriangle className="size-4 text-warning shrink-0" /></span>}
                  <ChevronDown className={`size-4 text-on-surface-variant shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden bg-surface-container-low/60">
                      <div className="sm:hidden grid grid-cols-4 gap-2 px-4 pt-3 text-center">
                        <Stat label="Present" value={String(r.daysPresent)} />
                        <Stat label="Absent" value={String(r.daysAbsent)} />
                        <Stat label="Hours" value={hours(r.minutes)} />
                        <Stat label="Late" value={String(r.lateDays)} warn={r.lateDays > 0} />
                      </div>
                      {r.days.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-on-surface-variant">No clock-ins in this period.</p>
                      ) : (
                        <div className="px-4 py-2 divide-y divide-outline-variant">
                          {r.days.map(d => (
                            <div key={d.date} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                              <span className="w-28 font-medium">{new Date(`${d.date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                              <span className="text-on-surface-variant inline-flex items-center gap-1"><Clock className="size-3.5" /> {time(d.firstIn)} – {d.onNow ? 'now' : d.missedClockOut ? 'never clocked out' : time(d.lastOut)}</span>
                              <span className="font-medium">{hours(d.minutes)}</span>
                              {d.shiftName && <span className="text-xs text-on-surface-variant">{d.shiftName} shift</span>}
                              {d.late && <span className="text-xs font-medium text-warning">Late</span>}
                              {d.missedClockOut && <span className="text-xs font-medium text-warning">Counted as 12h: check before paying</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <span>
      <span className={`block text-sm font-semibold ${warn ? 'text-warning' : ''}`}>{value}</span>
      <span className="block text-[11px] text-on-surface-variant">{label}</span>
    </span>
  );
}
