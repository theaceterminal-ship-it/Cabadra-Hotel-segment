import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ListChecks, Phone, QrCode, Users } from 'lucide-react';
import {
  DepartmentDisplayAdmin, DirectoryContact, createDepartmentDisplay, fetchDepartmentDisplays, setDepartmentDisplayActive,
} from '../lib/staffApi';
import { DEPARTMENTS, Department } from '../lib/departments';
import { LiveOpsTask } from '../types';
import { DisplayQrModal } from './DisplayQrModal';
import { KitchenLinkBar } from './KitchenLinkBar';
import { DepartmentShifts } from './DepartmentShifts';

/** Front desk works from reception itself, so it has no department screen here. */
const TEAMS = DEPARTMENTS.filter(d => d.value !== 'front_desk');

/**
 * Reception's Departments: everything about each team in one place. Pick a
 * department and see its screen (the QR its tablet opens, with an on/off
 * switch; for the kitchen, the kitchen link), its staff to call, its open
 * tasks, and its shifts with who scanned in. Staff themselves are added in
 * the owner's Staff tab; the department screen is made the first time
 * someone shows its QR.
 */
export function DepartmentsView({ propertyId, directory, tasks, onOpenTasks }: {
  propertyId: string;
  directory: DirectoryContact[];
  tasks: LiveOpsTask[];
  onOpenTasks: () => void;
}) {
  const [department, setDepartment] = useState<Department>('housekeeping');
  const [displays, setDisplays] = useState<DepartmentDisplayAdmin[]>([]);
  const [qrDisplay, setQrDisplay] = useState<DepartmentDisplayAdmin | null>(null);
  const [busy, setBusy] = useState(false);

  const reloadDisplays = () => fetchDepartmentDisplays(propertyId).then(setDisplays).catch(() => {});
  useEffect(() => { reloadDisplays(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [propertyId]);

  const openCount = (d: Department) => tasks.filter(t => t.category === d && t.status !== 'completed' && t.status !== 'rejected').length;
  const staff = useMemo(() => directory.filter(c => c.department === department), [directory, department]);
  const display = displays.find(d => d.department === department && d.active) ?? null;
  const label = TEAMS.find(t => t.value === department)?.label ?? department;

  const showQr = async () => {
    if (display) { setQrDisplay(display); return; }
    setBusy(true);
    try {
      const created = await createDepartmentDisplay(propertyId, department, `${label} QR`);
      setDisplays(prev => [...prev, created]);
      setQrDisplay(created);
    } catch {
      // Nothing created; the button stays to retry.
    } finally {
      setBusy(false);
    }
  };

  // Off revokes the screen's QR at once (a lost tablet); on makes a fresh one.
  const toggle = async () => {
    setBusy(true);
    try {
      if (display) await setDepartmentDisplayActive(display.id, false);
      else await createDepartmentDisplay(propertyId, department, `${label} QR`);
      await reloadDisplays();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 pb-10 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.03em] text-on-surface">Departments</h1>
        <p className="text-sm text-on-surface-variant mt-1">Each team’s screen, staff and shifts in one place.</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
        {TEAMS.map(t => {
          const n = openCount(t.value);
          return (
            <button
              key={t.value}
              onClick={() => setDepartment(t.value)}
              className={`h-10 px-4 rounded-full text-sm font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${department === t.value ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'}`}
            >
              {t.label}
              {n > 0 && <span className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center ${department === t.value ? 'bg-surface-container-lowest text-on-surface' : 'bg-primary text-on-primary'}`}>{n}</span>}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={department} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-4">
          {/* Its screen */}
          {department === 'kitchen' ? (
            <KitchenLinkBar propertyId={propertyId} embedded />
          ) : (
            <section className="rounded-[24px] bg-surface-container-lowest border border-outline-variant p-4 flex flex-wrap items-center gap-3">
              <span className="size-10 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0"><QrCode className="size-5" /></span>
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-semibold text-on-surface">{label} screen</p>
                <p className="text-xs text-on-surface-variant">
                  {display ? 'On. Scan its QR on the team’s tablet or phone; staff then scan their badge to clock in.' : 'Off. Switch it on to get the QR for the team’s tablet or phone.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {display && <button onClick={showQr} disabled={busy} className="h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50"><QrCode className="size-4" /> Show QR</button>}
                <button
                  role="switch"
                  aria-checked={!!display}
                  aria-label={`${label} screen ${display ? 'on' : 'off'}`}
                  onClick={toggle}
                  disabled={busy}
                  className={`relative h-8 w-14 rounded-full shrink-0 transition-colors disabled:opacity-50 ${display ? 'bg-primary' : 'bg-outline'}`}
                >
                  <span className={`absolute top-1 size-6 rounded-full bg-surface-container-lowest shadow transition-all ${display ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Its staff */}
            <section className="rounded-[24px] bg-surface-container-lowest border border-outline-variant p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-on-surface inline-flex items-center gap-2"><Users className="size-4" /> Staff</h3>
                  <p className="text-xs text-on-surface-variant">Added and edited by the owner, in Staff</p>
                </div>
                {openCount(department) > 0 && (
                  <button onClick={onOpenTasks} className="h-9 px-3.5 rounded-full bg-surface-container-low text-sm font-medium inline-flex items-center gap-1.5">
                    <ListChecks className="size-4" /> {openCount(department)} open task{openCount(department) === 1 ? '' : 's'}
                  </button>
                )}
              </div>
              {staff.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-3">No {label.toLowerCase()} staff yet. The owner adds them, with their badges, in Staff.</p>
              ) : (
                <ul className="divide-y divide-outline-variant">
                  {staff.map(c => (
                    <li key={c.id} className="py-2.5 flex items-center gap-3">
                      <span className="size-9 rounded-full bg-surface-container-low flex items-center justify-center text-sm font-semibold shrink-0">{c.name.charAt(0).toUpperCase()}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-on-surface truncate">{c.name}</span>
                        {c.jobTitle && <span className="block text-xs text-on-surface-variant truncate">{c.jobTitle}</span>}
                      </span>
                      <a href={`tel:${c.phone.replace(/\s+/g, '')}`} className="h-9 px-3.5 rounded-full bg-surface-container-low text-sm font-medium inline-flex items-center gap-1.5 shrink-0">
                        <Phone className="size-4" /> {c.phone}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Its shifts */}
            <section className="rounded-[24px] bg-surface-container-lowest border border-outline-variant p-4">
              <DepartmentShifts propertyId={propertyId} department={department} />
            </section>
          </div>
        </motion.div>
      </AnimatePresence>

      {qrDisplay && <DisplayQrModal display={qrDisplay} onClose={() => setQrDisplay(null)} />}
    </div>
  );
}
