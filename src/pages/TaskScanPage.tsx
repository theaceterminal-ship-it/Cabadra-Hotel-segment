import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, MapPin, User } from 'lucide-react';
import { resolveServiceTask, startServiceTask, completeServiceTask, ServiceTask } from '../lib/serviceTaskApi';
import { DEPARTMENT_LABELS } from '../lib/departments';
import { useSiteTheme } from '../hooks/useTheme';

const CATEGORY_LABELS = DEPARTMENT_LABELS;

/**
 * What a task's QR actually opens — no login, because whoever's fixing the
 * AC or bringing towels usually isn't a Cabadra staff account, just a name
 * in staff_directory. One task, one status, one button at a time: Start
 * when they begin, Done when they finish. Reception sees the change on
 * the Live Ops board within a few seconds and gets a notification the
 * moment it's marked done (service_task_start/complete, 0025_task_qr.sql).
 */
export default function TaskScanPage() {
  useSiteTheme();
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
        <p className="text-lg font-semibold text-on-surface">Can't open this task</p>
        <p className="text-sm text-on-surface-variant mt-2">{error}</p>
      </CenteredCard>
    );
  }

  if (!task) {
    return (
      <CenteredCard>
        <p className="text-sm text-on-surface-variant">Loading task…</p>
      </CenteredCard>
    );
  }

  return (
    <div className="min-h-screen w-full bg-surface text-on-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface-container-lowest rounded-[28px] shadow-[0_18px_50px_rgba(0,0,0,0.08)] p-6 space-y-5">
        <div className="text-center">
          <p className="text-sm font-medium text-on-surface-variant">{task.propertyName || 'Cabadra'}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">{CATEGORY_LABELS[task.category]}</p>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold text-on-surface text-balance">{task.title}</h1>
          {task.description && <p className="text-sm text-on-surface-variant">{task.description}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-on-surface-variant">
          {task.roomLabel && (
            <span className="inline-flex items-center gap-1 bg-surface-container-low rounded-full px-3 py-1">
              <MapPin className="w-3 h-3" /> Room {task.roomLabel}
            </span>
          )}
          {task.assignedTo && (
            <span className="inline-flex items-center gap-1 bg-surface-container-low rounded-full px-3 py-1">
              <User className="w-3 h-3" /> {task.assignedTo}
            </span>
          )}
          {task.priority === 'high' && (
            <span className="inline-flex items-center gap-1 bg-error/10 text-error rounded-full px-3 py-1 font-semibold">
              High priority
            </span>
          )}
        </div>

        {task.status === 'completed' ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <CheckCircle2 className="w-12 h-12 text-success" />
            <p className="text-sm font-semibold text-success">Marked done</p>
          </div>
        ) : task.status === 'in_progress' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-warning">
              <Clock className="w-3.5 h-3.5" /> In progress
            </div>
            <button
              onClick={handleComplete}
              disabled={acting}
              className="w-full h-14 rounded-full bg-primary text-on-primary text-base font-medium disabled:opacity-60"
            >
              {acting ? 'Marking done…' : 'Mark Done'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleStart}
            disabled={acting}
            className="w-full h-14 rounded-full bg-primary text-on-primary text-base font-medium disabled:opacity-60"
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
    <div className="min-h-screen w-full bg-surface text-on-surface flex items-center justify-center p-6">
      <div className="max-w-sm text-center">{children}</div>
    </div>
  );
}
