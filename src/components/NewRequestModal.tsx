import React, { useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { DEPARTMENT_LABELS, DEPARTMENT_VALUES, type Department } from '../lib/departments';


const DEPT_LABELS = DEPARTMENT_LABELS;

export interface NewRequestSubmission {
  roomNumber?: string;
  title: string;
  priority: 'High Priority' | 'Standard' | 'Pending Approval';
  /** Which department's queue this lands in — a guest_requests insert now always creates its matching task automatically (0053), so this just decides where. */
  department?: Department;
}

interface NewRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 'staff' (Reception, logging on a guest's behalf) shows the room-number field and department picker; 'guest' (the guest app) shows neither — the room and department come from the service category they tapped already. */
  mode: 'staff' | 'guest';
  onSubmit: (submission: NewRequestSubmission) => void | Promise<void>;
}

export const NewRequestModal: React.FC<NewRequestModalProps> = ({
  isOpen,
  onClose,
  mode,
  onSubmit,
}) => {
  const [roomNumber, setRoomNumber] = useState('');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'High Priority' | 'Standard' | 'Pending Approval'>('High Priority');
  const [department, setDepartment] = useState<Department>('housekeeping');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || (mode === 'staff' && !roomNumber.trim())) return;

    setSubmitting(true);
    try {
      await onSubmit({
        roomNumber: mode === 'staff' ? roomNumber.trim() : undefined,
        title: title.trim(),
        priority,
        department: mode === 'staff' ? department : undefined,
      });
      setTitle('');
      setRoomNumber('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-surface-container-lowest rounded-2xl max-w-md w-full p-6 shadow-2xl border border-outline-variant space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-error-container text-on-error-container rounded-lg">
              <Megaphone className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg text-on-surface">
              {mode === 'staff' ? 'Log Guest / Urgent Request' : 'Request Something'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {mode === 'staff' && (
            <div>
              <label className="font-bold text-on-surface block mb-1">Room Number</label>
              <input
                type="text"
                required
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder="e.g. 304"
                className="w-full h-10 px-3 border border-outline-variant rounded-lg focus:border-primary focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="font-bold text-on-surface block mb-1">Request Summary</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Late Checkout Request, Extra Champagne Glasses..."
              className="w-full h-10 px-3 border border-outline-variant rounded-lg focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="font-bold text-on-surface block mb-1">Priority Level</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className="w-full h-10 px-3 border border-outline-variant rounded-lg bg-surface-container-lowest focus:border-primary focus:outline-none"
            >
              <option value="High Priority">High Priority (Urgent Notification)</option>
              <option value="Standard">Standard</option>
              <option value="Pending Approval">Pending Approval (Checkout/Upgrade)</option>
            </select>
          </div>

          {mode === 'staff' && (
            <div>
              <label className="font-bold text-on-surface block mb-1">Routes To</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value as Department)}
                className="w-full h-10 px-3 border border-outline-variant rounded-lg bg-surface-container-lowest focus:border-primary focus:outline-none"
              >
                {DEPARTMENT_VALUES.map(d => (
                  <option key={d} value={d}>{DEPT_LABELS[d]}</option>
                ))}
              </select>
              <p className="text-[10px] text-on-surface-variant mt-1">Lands on this department's Live Ops queue right away.</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-outline-variant">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-outline-variant rounded-lg text-on-surface-variant font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-hover disabled:opacity-60"
            >
              {submitting ? 'Sending…' : mode === 'staff' ? 'Log Request' : 'Send Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
