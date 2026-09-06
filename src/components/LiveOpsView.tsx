import React, { useState } from 'react';
import { LiveOpsTask, AppView } from '../types';
import { DirectoryContact } from '../lib/staffApi';
import {
  CheckCircle2,
  AlertTriangle,
  Play,
  Check,
  Plus,
  Brush,
  CheckCheck,
  RefreshCw,
  Phone,
  UserCircle2,
} from 'lucide-react';

interface LiveOpsViewProps {
  tasks: LiveOpsTask[];
  directory: DirectoryContact[];
  onUpdateTask: (task: LiveOpsTask) => void;
  onAssignTask: (taskId: string, assignedTo: string | null) => void;
  onAddTask: (task: Omit<LiveOpsTask, 'id'>) => void;
  onRefresh: () => void;
  onNavigate: (view: AppView) => void;
}

const DEPT_LABELS: Record<DirectoryContact['department'], string> = {
  housekeeping: 'Housekeeping', maintenance: 'Maintenance', amenities: 'Amenities', concierge: 'Concierge',
};

export const LiveOpsView: React.FC<LiveOpsViewProps> = ({
  tasks,
  directory,
  onUpdateTask,
  onAssignTask,
  onAddTask,
  onRefresh,
  onNavigate,
}) => {
  const [filterCategory, setFilterCategory] = useState<'all' | 'housekeeping' | 'maintenance' | 'amenities' | 'concierge'>('all');
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // New task form state
  const [newRoom, setNewRoom] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'high' | 'standard'>('standard');
  const [newDue, setNewDue] = useState('');
  const [newCategory, setNewCategory] = useState<'housekeeping' | 'maintenance' | 'amenities' | 'concierge'>('housekeeping');

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const filteredTasks = tasks.filter(t => filterCategory === 'all' || t.category === filterCategory);

  const urgentCount = tasks.filter(t => t.priority === 'high' && t.status !== 'completed').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const pendingCount = tasks.filter(t => t.status !== 'completed').length;

  const handleAction = (task: LiveOpsTask) => {
    if (task.status === 'pending') {
      onUpdateTask({ ...task, status: 'in_progress' });
    } else if (task.status === 'in_progress') {
      onUpdateTask({ ...task, status: 'completed' });
    }
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    onAddTask({
      roomNumber: newRoom ? `Room ${newRoom}` : 'General',
      title: newTitle,
      description: 'Dispatched from Live Operations control center.',
      priority: newPriority,
      dueTime: newDue || 'Unscheduled',
      status: 'pending',
      category: newCategory,
    });
    setShowNewTaskModal(false);
    setNewTitle('');
    setNewRoom('');
    setNewDue('');
  };

  const directoryByDept = (dept: DirectoryContact['department']) => directory.filter(d => d.department === dept);

  return (
    <div id="live-ops-canvas" className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E9ECEF]">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#bd9b60] text-white rounded-lg">
            <Brush className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[#141d23]">Live Ops</h1>
            <p className="text-xs text-[#4e463a]">Housekeeping &amp; Staff Operations</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="btn-refresh-tasks"
            onClick={handleRefresh}
            className="h-9 px-3 rounded-lg bg-white border border-[#E9ECEF] text-[#4e463a] text-xs font-semibold hover:bg-[#ecf5fe] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#765a25]' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            id="btn-open-new-task-modal"
            onClick={() => setShowNewTaskModal(true)}
            className="h-9 px-3.5 rounded-lg bg-[#765a25] text-white text-xs font-semibold hover:bg-[#5c4210] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Metrics Overview (Bento Style) */}
      <section className="grid grid-cols-3 gap-3">
        <div
          id="stat-my-tasks"
          className="bg-white rounded-xl p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)] border border-[#E9ECEF] flex justify-between items-center"
        >
          <div>
            <h2 className="text-xs font-bold text-[#4e463a] uppercase tracking-wider">Active Tasks</h2>
            <p className="text-3xl font-bold text-[#765a25] mt-1">{pendingCount}</p>
          </div>
          <div className="h-11 w-11 rounded-full bg-[#bd9b60] flex items-center justify-center text-white shadow-xs shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div
          id="stat-urgent"
          className="bg-[#ffdad6] rounded-xl p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between"
        >
          <h2 className="text-xs font-bold text-[#93000a] uppercase tracking-wider">Urgent</h2>
          <div className="flex justify-between items-end mt-1">
            <p className="text-2xl font-bold text-[#93000a]">{urgentCount}</p>
            <AlertTriangle className="w-5 h-5 text-[#93000a] opacity-80" />
          </div>
        </div>

        <div
          id="stat-completed"
          className="bg-[#e6eff8] rounded-xl p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)] border border-[#E9ECEF] flex flex-col justify-between"
        >
          <h2 className="text-xs font-bold text-[#4e463a] uppercase tracking-wider">Completed</h2>
          <div className="flex justify-between items-end mt-1">
            <p className="text-2xl font-bold text-[#765a25]">{completedCount}</p>
            <Check className="w-5 h-5 text-[#765a25] opacity-80" />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Task List Section — main column */}
        <div className="xl:col-span-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-base font-bold text-[#141d23]">Active Assignments</h3>
            <div className="flex flex-wrap gap-1 text-[11px] bg-[#ecf5fe] p-1 rounded-lg border border-[#E9ECEF]">
              {(['all', 'housekeeping', 'amenities', 'maintenance', 'concierge'] as const).map(cat => (
                <button
                  key={cat}
                  id={`filter-cat-${cat}`}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-2.5 py-1 rounded capitalize font-semibold transition-colors cursor-pointer ${
                    filterCategory === cat ? 'bg-white text-[#765a25] shadow-xs' : 'text-[#4e463a]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Task Cards */}
          <div className="space-y-3">
            {filteredTasks.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-[#E9ECEF] text-gray-500 text-xs">
                No tasks in this category.
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isHigh = task.priority === 'high';
                const isDone = task.status === 'completed';
                const inProgress = task.status === 'in_progress';
                const candidates = directoryByDept(task.category);

                return (
                  <article
                    key={task.id}
                    id={`task-card-${task.id}`}
                    className={`bg-white rounded-xl border ${
                      isHigh && !isDone
                        ? 'border-[#ffdad6] shadow-[0_4px_12px_rgba(188,71,73,0.1)]'
                        : 'border-[#E9ECEF] shadow-[0_4px_12px_rgba(0,0,0,0.03)]'
                    } overflow-hidden relative transition-all ${isDone ? 'opacity-60 bg-gray-50' : ''}`}
                  >
                    {isHigh && !isDone && (
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-[#BC4749]"></div>
                    )}

                    <div className="p-4 pl-5">
                      <div className="flex justify-between items-start mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-bold text-[#141d23]">{task.roomNumber}</span>
                          {isHigh ? (
                            <span className="px-2 py-0.5 rounded bg-[#ffdad6] text-[#93000a] text-[10px] font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> High Priority
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-[#dbe4ed] text-[#4e463a] text-[10px] font-semibold">
                              Standard
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-[#f6faff] border border-[#E9ECEF] text-[#765a25] text-[10px] font-medium uppercase">
                            {task.category}
                          </span>
                        </div>
                        <span className={`text-xs font-semibold shrink-0 ${isHigh ? 'text-[#BC4749]' : 'text-[#4e463a]'}`}>
                          Due: {task.dueTime}
                        </span>
                      </div>

                      <p className="text-sm font-medium text-[#141d23] mb-1">{task.title}</p>
                      <p className="text-xs text-[#4e463a] mb-3">{task.description}</p>

                      {/* Assign to — a real person from the department directory, not just a category queue */}
                      <div className="flex items-center gap-2 mb-3">
                        <UserCircle2 className="w-3.5 h-3.5 text-[#7f7668] shrink-0" />
                        <select
                          value={task.assignedTo ?? ''}
                          onChange={(e) => onAssignTask(task.id, e.target.value || null)}
                          className="flex-1 h-8 px-2 text-xs border border-[#E9ECEF] rounded-lg bg-white focus:border-[#765a25] focus:outline-none"
                        >
                          <option value="">Unassigned — {DEPT_LABELS[task.category]} queue</option>
                          {candidates.map(c => (
                            <option key={c.id} value={c.name}>{c.name} · {c.phone}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2D6A4F] bg-[#2D6A4F]/10 px-3 py-1.5 rounded-lg w-full justify-center">
                            <CheckCheck className="w-4 h-4" /> Completed
                          </span>
                        ) : inProgress ? (
                          <button
                            onClick={() => handleAction(task)}
                            className="flex-1 h-11 bg-[#2D6A4F] text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                          >
                            <Check className="w-4 h-4" /> Mark Complete
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAction(task)}
                            className={`flex-1 h-11 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                              isHigh
                                ? 'bg-[#765a25] text-white hover:bg-[#5c4210] shadow-xs'
                                : 'bg-transparent border border-[#765a25] text-[#765a25] hover:bg-[#ecf5fe]'
                            }`}
                          >
                            {isHigh ? <Play className="w-4 h-4 fill-white" /> : null}
                            <span>{isHigh ? 'Start' : 'Accept'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        {/* Department Contacts — right column, uses the space this page used to leave empty */}
        <aside className="xl:col-span-4 space-y-3">
          <h3 className="text-sm font-bold text-[#141d23] px-1">Department Contacts</h3>
          {(Object.keys(DEPT_LABELS) as DirectoryContact['department'][]).map(dept => {
            const contacts = directoryByDept(dept);
            const openCount = tasks.filter(t => t.category === dept && t.status !== 'completed').length;
            return (
              <div key={dept} className="bg-white rounded-xl border border-[#E9ECEF] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#E9ECEF] bg-[#f6faff] flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#141d23]">{DEPT_LABELS[dept]}</h4>
                  {openCount > 0 && <span className="text-[10px] font-bold text-[#765a25] bg-[#fff8ec] px-2 py-0.5 rounded-full">{openCount} open</span>}
                </div>
                {contacts.length === 0 ? (
                  <p className="text-[11px] text-[#7f7668] text-center py-4 px-3">No contacts added yet — Owner &gt; Staff tab.</p>
                ) : (
                  <div className="divide-y divide-[#E9ECEF]">
                    {contacts.map(c => (
                      <a
                        key={c.id}
                        href={`tel:${c.phone.replace(/\s+/g, '')}`}
                        className="flex items-center justify-between px-4 py-2.5 text-xs hover:bg-[#ecf5fe] transition-colors"
                      >
                        <span className="font-semibold text-[#141d23]">{c.name}</span>
                        <span className="flex items-center gap-1 text-[#765a25] font-semibold">
                          <Phone className="w-3 h-3" /> {c.phone}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </aside>
      </div>

      {/* New Task Creation Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E9ECEF]">
            <h3 className="text-lg font-bold text-[#141d23] mb-4 pb-2 border-b border-[#E9ECEF]">
              Create Live Ops Assignment
            </h3>
            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[#141d23] block mb-1">Room Number (optional)</label>
                <input
                  type="text"
                  value={newRoom}
                  onChange={(e) => setNewRoom(e.target.value)}
                  placeholder="e.g. 308"
                  className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#141d23] block mb-1">Task Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Deliver bath sheets & pillow set"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-[#141d23] block mb-1">Due</label>
                <input
                  type="text"
                  placeholder="e.g. 11:00 AM, or 'by checkout'"
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg focus:border-[#765a25] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#141d23] block mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as 'high' | 'standard')}
                    className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg bg-white"
                  >
                    <option value="standard">Standard</option>
                    <option value="high">High Priority</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-[#141d23] block mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as typeof newCategory)}
                    className="w-full h-10 px-3 border border-[#E9ECEF] rounded-lg bg-white"
                  >
                    <option value="housekeeping">Housekeeping</option>
                    <option value="amenities">Amenities</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="concierge">Concierge</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[#E9ECEF]">
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  className="px-4 py-2 border border-[#E9ECEF] rounded-lg font-semibold text-[#4e463a] cursor-pointer hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#765a25] text-white rounded-lg font-bold hover:bg-[#5c4210] cursor-pointer shadow-xs"
                >
                  Dispatch Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
