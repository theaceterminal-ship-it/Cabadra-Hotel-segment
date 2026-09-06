import React, { useState } from 'react';
import { Megaphone, X } from 'lucide-react';

export interface NewRequestSubmission {
  roomNumber?: string;
  title: string;
  priority: 'High Priority' | 'Standard' | 'Pending Approval';
  autoDispatchTask?: boolean;
}

interface NewRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 'staff' (Reception, logging on a guest's behalf) shows the room-number field and the auto-dispatch-task option; 'guest' (the guest app) shows neither — the room comes from their reservation already. */
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
  const [autoDispatchTask, setAutoDispatchTask] = useState(true);
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
        autoDispatchTask: mode === 'staff' ? autoDispatchTask : undefined,
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
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E9ECEF] space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-[#E9ECEF]">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#ffdad6] text-[#93000a] rounded-lg">
              <Megaphone className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-lg text-[#141d23]">
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
              <label className="font-bold text-[#141d23] block mb-1">Room Number</label>
              <input
                type="text"
                required
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder="e.g. 304"
                className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="font-bold text-[#141d23] block mb-1">Request Summary</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Late Checkout Request, Extra Champagne Glasses..."
              className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none"
            />
          </div>

          <div>
            <label className="font-bold text-[#141d23] block mb-1">Priority Level</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg bg-white focus:border-[#765a25] focus:outline-none"
            >
              <option value="High Priority">High Priority (Urgent Notification)</option>
              <option value="Standard">Standard</option>
              <option value="Pending Approval">Pending Approval (Checkout/Upgrade)</option>
            </select>
          </div>

          {mode === 'staff' && (
            <div className="bg-[#ecf5fe] p-3 rounded-lg border border-[#E9ECEF]">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-[#141d23]">
                <input
                  type="checkbox"
                  checked={autoDispatchTask}
                  onChange={(e) => setAutoDispatchTask(e.target.checked)}
                  className="accent-[#765a25]"
                />
                <span>Auto-dispatch task to Live Ops Housekeeping board</span>
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-[#E9ECEF]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#E9ECEF] rounded-lg text-[#4e463a] font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-[#765a25] text-white rounded-lg font-bold hover:bg-[#5c4210] disabled:opacity-60"
            >
              {submitting ? 'Sending…' : mode === 'staff' ? 'Log Request' : 'Send Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
