import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, MapPin, User } from 'lucide-react';
import { resolveServiceTask, startServiceTask, completeServiceTask, ServiceTask } from '../lib/serviceTaskApi';

const CATEGORY_LABELS: Record<ServiceTask['category'], string> = {
  housekeeping: 'Housekeeping',
  maintenance: 'Maintenance',
  amenities: 'Amenities',
  concierge: 'Concierge',
};

/**
 * What a task's QR actually opens — no login, because whoever's fixing the
 * AC or bringing towels usually isn't a Cabadra staff account, just a name
 * in staff_directory. One task, one status, one button at a time: Start
 * when they begin, Done when they finish. Reception sees the change on
 * the Live Ops board within a few seconds and gets a notification the
 * moment it's marked done (service_task_start/complete, 0025_task_qr.sql).
 */
export default function TaskScanPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [task, setTask] = useState<ServiceTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!token) return;
    resolveServiceTask(token)
      .then(setTask)
      .catch(err => setError(err instanceof Error ? err.message : 'This task link is invalid.'));
  }, [token]);

  const handleStart = async () => {
    setActing(true);
    try {
      const status = await startServiceTask(token);
      setTask(t => (t ? { ...t, status } : t));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start task.');
    } finally {
      setActing(false);
    }
  };

  const handleComplete = async () => {
    setActing(true);
    try {
      const status = await completeServiceTask(token);
      setTask(t => (t ? { ...t, status } : t));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark task done.');
    } finally {
      setActing(false);
    }
  };

  if (error) {
    return (
      <CenteredCard>
        <p className="text-lg font-bold text-[#141d23]">Can't open this task</p>
        <p className="text-sm text-[#7f7668] mt-2">{error}</p>
      </CenteredCard>
    );
  }

  if (!task) {
    return (
      <CenteredCard>
        <p className="text-sm text-[#7f7668]">Loading task…</p>
      </CenteredCard>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#f6faff] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#E9ECEF] shadow-sm p-6 space-y-5">
        <div className="text-center">
          <p className="text-[11px] font-bold text-[#765a25] uppercase tracking-wider">{task.propertyName || 'Cabadra'}</p>
          <p className="text-[10px] text-[#7f7668] mt-0.5">{CATEGORY_LABELS[task.category]}</p>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold text-[#141d23] text-balance">{task.title}</h1>
          {task.description && <p className="text-sm text-[#4e463a]">{task.description}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[#4e463a]">
          {task.roomLabel && (
            <span className="inline-flex items-center gap-1 bg-[#f6faff] border border-[#E9ECEF] rounded-full px-3 py-1">
              <MapPin className="w-3 h-3" /> Room {task.roomLabel}
            </span>
          )}
          {task.assignedTo && (
            <span className="inline-flex items-center gap-1 bg-[#f6faff] border border-[#E9ECEF] rounded-full px-3 py-1">
              <User className="w-3 h-3" /> {task.assignedTo}
            </span>
          )}
          {task.priority === 'high' && (
            <span className="inline-flex items-center gap-1 bg-[#ffdad6] text-[#93000a] rounded-full px-3 py-1 font-bold">
              High priority
            </span>
          )}
        </div>

        {task.status === 'completed' ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <CheckCircle2 className="w-12 h-12 text-[#2D6A4F]" />
            <p className="text-sm font-bold text-[#2D6A4F]">Marked done</p>
          </div>
        ) : task.status === 'in_progress' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#D97706]">
              <Clock className="w-3.5 h-3.5" /> In progress
            </div>
            <button
              onClick={handleComplete}
              disabled={acting}
              className="w-full h-14 rounded-xl bg-[#2D6A4F] text-white text-base font-bold disabled:opacity-60"
            >
              {acting ? 'Marking done…' : 'Mark Done'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleStart}
            disabled={acting}
            className="w-full h-14 rounded-xl bg-[#765a25] text-white text-base font-bold disabled:opacity-60"
          >
            {acting ? 'Starting…' : 'Start Task'}
          </button>
        )}
      </div>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-[#f6faff] flex items-center justify-center p-6">
      <div className="max-w-sm text-center">{children}</div>
    </div>
  );
}
