import React, { useState } from 'react';
import { Check, Clock, MapPin, Play, X } from 'lucide-react';
import { DisplayTask } from '../lib/displayApi';

interface DisplayTaskQueueProps {
  tasks: DisplayTask[];
  actingOn: string | null;
  onStart: (task: DisplayTask) => void;
  onComplete: (task: DisplayTask) => void;
  onReject: (task: DisplayTask, note: string) => void;
}

/**
 * The task list + accept/complete/reject actions, shared between
 * DepartmentDisplayPage (a shared kiosk tablet) and StaffBadgePage (one
 * staff member's own phone, after their badge scan) — same queue, same
 * actions, just reached two different ways. Owns its own reject-reason
 * modal so neither caller needs to duplicate that state.
 */
export function DisplayTaskQueue({ tasks, actingOn, onStart, onComplete, onReject }: DisplayTaskQueueProps) {
  const [rejectingTask, setRejectingTask] = useState<DisplayTask | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const handleConfirmReject = () => {
    if (!rejectingTask || !rejectNote.trim()) return;
    onReject(rejectingTask, rejectNote.trim());
    setRejectingTask(null);
    setRejectNote('');
  };

  return (
    <>
      {tasks.length === 0 ? (
        <div className="p-10 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant text-on-surface-variant text-sm">
          Nothing waiting right now.
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => {
            const inProgress = task.status === 'in_progress';
            const isHigh = task.priority === 'high';
            return (
              <article
                key={task.id}
                className={`bg-surface-container-lowest rounded-2xl border p-4 sm:p-5 ${isHigh ? 'border-error-container' : 'border-outline-variant'}`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {task.roomLabel && (
                    <span className="inline-flex items-center gap-1 bg-surface-container-low border border-outline-variant rounded-full px-2.5 py-1 text-xs text-on-surface-variant">
                      <MapPin className="w-3 h-3" /> {task.roomLabel}
                    </span>
                  )}
                  {task.dueLabel && (
                    <span className="inline-flex items-center gap-1 bg-surface-container-low border border-outline-variant rounded-full px-2.5 py-1 text-xs text-on-surface-variant">
                      <Clock className="w-3 h-3" /> {task.dueLabel}
                    </span>
                  )}
                  {isHigh && (
                    <span className="bg-error-container text-on-error-container rounded-full px-2.5 py-1 text-xs font-semibold">
                      High Priority
                    </span>
                  )}
                </div>

                <p className="font-semibold text-on-surface">{task.title}</p>
                {task.description && <p className="text-sm text-on-surface-variant mt-1">{task.description}</p>}
                {task.assignedTo && <p className="text-xs text-on-surface-variant mt-2">Assigned to {task.assignedTo}</p>}

                <div className="flex gap-2 mt-4">
                  {!inProgress && (
                    <button
                      onClick={() => setRejectingTask(task)}
                      disabled={actingOn === task.id}
                      className="h-12 px-4 rounded-xl border border-error text-error font-semibold flex items-center justify-center disabled:opacity-50"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                  {inProgress ? (
                    <button
                      onClick={() => onComplete(task)}
                      disabled={actingOn === task.id}
                      className="flex-1 h-12 rounded-xl bg-success text-on-success font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Check className="w-5 h-5" /> {actingOn === task.id ? 'Marking done…' : 'Mark Done'}
                    </button>
                  ) : (
                    <button
                      onClick={() => onStart(task)}
                      disabled={actingOn === task.id}
                      className="flex-1 h-12 rounded-xl bg-primary text-on-primary font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Play className="w-5 h-5 fill-current" /> {actingOn === task.id ? 'Starting…' : 'Accept'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {rejectingTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant space-y-3">
            <h3 className="text-lg font-semibold text-on-surface">Reject this task?</h3>
            <p className="text-xs text-on-surface-variant">{rejectingTask.title}. Say why so whoever's tracking it knows what happened.</p>
            <textarea
              autoFocus
              rows={3}
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="e.g. Short-staffed tonight, no spare linens..."
              className="w-full p-2.5 text-sm border border-outline-variant rounded-lg focus:border-error focus:outline-none resize-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setRejectingTask(null)}
                className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface-variant"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={!rejectNote.trim()}
                className="px-4 py-2 bg-error text-on-error rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                Reject Task
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
