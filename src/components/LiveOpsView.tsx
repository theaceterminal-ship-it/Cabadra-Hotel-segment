import React, { useEffect, useState } from 'react';
import { LiveOpsTask, AppView } from '../types';
import {
  DirectoryContact,
  DepartmentDisplayAdmin,
  fetchDepartmentDisplays,
  createDepartmentDisplay,
  setDepartmentDisplayActive,
} from '../lib/staffApi';
import { TaskQrModal } from './TaskQrModal';
import { DisplayQrModal } from './DisplayQrModal';
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
  QrCode,
  X,
  Ban,
  Tablet,
  Power,
  Calendar,
} from 'lucide-react';

interface LiveOpsViewProps {
  propertyId: string;
  tasks: LiveOpsTask[];
  directory: DirectoryContact[];
  onUpdateTask: (task: LiveOpsTask) => void;
  /** The "can't do this" path — required note, only while still pending. See staff_reject_task (0045). */
  onRejectTask: (task: LiveOpsTask, note: string) => void;
  onAssignTask: (taskId: string, assignedTo: string | null) => void;
  /** Moves a misrouted task to a different department's queue (staff_reassign_task_department, 0055) — clears its assignee, since whoever was assigned belonged to the old department. */
  onChangeDepartment: (taskId: string, department: LiveOpsTask['category']) => void;
  onAddTask: (task: Omit<LiveOpsTask, 'id' | 'taskToken' | 'rejectionNote'>) => void;
  onRefresh: () => void;
  onNavigate: (view: AppView) => void;
}

const DEPT_LABELS: Record<DirectoryContact['department'], string> = {
  housekeeping: 'Housekeeping', maintenance: 'Maintenance', amenities: 'Amenities', concierge: 'Concierge',
};

export const LiveOpsView: React.FC<LiveOpsViewProps> = ({
  propertyId,
  tasks,
  directory,
  onUpdateTask,
  onRejectTask,
  onAssignTask,
  onChangeDepartment,
  onAddTask,
  onRefresh,
  onNavigate,
}) => {
  const [filterCategory, setFilterCategory] = useState<'all' | 'housekeeping' | 'maintenance' | 'amenities' | 'concierge'>('all');
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [qrTask, setQrTask] = useState<LiveOpsTask | null>(null);
  const [rejectingTask, setRejectingTask] = useState<LiveOpsTask | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  // Department Displays — generated here, since Reception is where the
  // physical tablets actually live, not Owner (where staff_directory badges
  // are issued instead, PropertyDetailPage's Staff tab). One QR per
  // department is the whole idea — staff scans it before their shift and
  // it opens straight into that department's queue, so this auto-creates
  // (or reuses) exactly one active display per department instead of
  // asking anyone to name/configure one first.
  const [displays, setDisplays] = useState<DepartmentDisplayAdmin[]>([]);
  const [qrDisplay, setQrDisplay] = useState<DepartmentDisplayAdmin | null>(null);
  const [gettingQrFor, setGettingQrFor] = useState<DirectoryContact['department'] | null>(null);

  const reloadDisplays = () => fetchDepartmentDisplays(propertyId).then(setDisplays).catch(() => {});
  useEffect(() => { reloadDisplays(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [propertyId]);

  const handleShowDepartmentQr = async (department: DepartmentDisplayAdmin['department']) => {
    const existing = displays.find(d => d.department === department && d.active);
    if (existing) {
      setQrDisplay(existing);
      return;
    }
    setGettingQrFor(department);
    try {
      const created = await createDepartmentDisplay(propertyId, department, `${DEPT_LABELS[department]} QR`);
      setDisplays(prev => [...prev, created]);
      setQrDisplay(created);
    } catch {
      // Nothing created, nothing to show — the button just stays clickable to retry.
    } finally {
      setGettingQrFor(null);
    }
  };

  const handleToggleDisplay = async (display: DepartmentDisplayAdmin) => {
    await setDepartmentDisplayActive(display.id, !display.active).catch(() => {});
    reloadDisplays();
  };

  const handleConfirmReject = () => {
    if (!rejectingTask || !rejectNote.trim()) return;
    onRejectTask(rejectingTask, rejectNote.trim());
    setRejectingTask(null);
    setRejectNote('');
  };

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

  function getLocalDateString(d: Date | string): string {
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return '';
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const todayStr = getLocalDateString(new Date());

  const [dateFilterMode, setDateFilterMode] = useState<'today' | 'custom' | 'all'>('today');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);

  const filteredTasks = tasks.filter(t => {
    // 1. Category Filter
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;

    // 2. Date Filter
    if (dateFilterMode === 'all') return true;

    const taskDateStr = getLocalDateString(t.createdAt);
    if (!taskDateStr) return true;

    if (dateFilterMode === 'today') {
      return taskDateStr === todayStr;
    }

    if (dateFilterMode === 'custom') {
      if (startDate && taskDateStr < startDate) return false;
      if (endDate && taskDateStr > endDate) return false;
      return true;
    }

    return true;
  });

  const urgentCount = filteredTasks.filter(t => t.priority === 'high' && t.status !== 'completed' && t.status !== 'rejected').length;
  const completedCount = filteredTasks.filter(t => t.status === 'completed').length;
  const pendingCount = filteredTasks.filter(t => t.status !== 'completed' && t.status !== 'rejected').length;

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#bd9b60] text-white rounded-lg">
            <Brush className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-on-surface">Live Ops</h1>
            <p className="text-xs text-on-surface-variant">Housekeeping &amp; Staff Operations</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="btn-refresh-tasks"
            onClick={handleRefresh}
            className="h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface-variant text-xs font-semibold hover:bg-surface-container-low transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            id="btn-open-new-task-modal"
            onClick={() => setShowNewTaskModal(true)}
            className="h-9 px-3.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
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
          className="bg-surface-container-lowest rounded-xl p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)] border border-outline-variant flex justify-between items-center"
        >
          <div>
            <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Active Tasks</h2>
            <p className="text-3xl font-bold text-primary mt-1">{pendingCount}</p>
          </div>
          <div className="h-11 w-11 rounded-full bg-[#bd9b60] flex items-center justify-center text-white shadow-xs shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div
          id="stat-urgent"
          className="bg-error-container rounded-xl p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between"
        >
          <h2 className="text-xs font-bold text-on-error-container uppercase tracking-wider">Urgent</h2>
          <div className="flex justify-between items-end mt-1">
            <p className="text-2xl font-bold text-on-error-container">{urgentCount}</p>
            <AlertTriangle className="w-5 h-5 text-on-error-container opacity-80" />
          </div>
        </div>

        <div
          id="stat-completed"
          className="bg-[#e6eff8] rounded-xl p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)] border border-outline-variant flex flex-col justify-between"
        >
          <h2 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Completed</h2>
          <div className="flex justify-between items-end mt-1">
            <p className="text-2xl font-bold text-primary">{completedCount}</p>
            <Check className="w-5 h-5 text-primary opacity-80" />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Task List Section — main column */}
        <div className="xl:col-span-8 space-y-4">
          {/* Controls Bar: Date Filter + Department Category Filter */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface-container-lowest p-3 rounded-xl border border-outline-variant shadow-2xs">
            {/* Date Range Selector */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-on-surface flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-primary" /> Date:
              </span>
              <div className="flex bg-surface-container-low p-0.5 rounded-lg border border-outline-variant text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setDateFilterMode('today');
                    setStartDate(todayStr);
                    setEndDate(todayStr);
                  }}
                  className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                    dateFilterMode === 'today' ? 'bg-surface-container-lowest text-primary shadow-xs' : 'text-on-surface-variant'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilterMode('custom')}
                  className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                    dateFilterMode === 'custom' ? 'bg-surface-container-lowest text-primary shadow-xs' : 'text-on-surface-variant'
                  }`}
                >
                  Custom Range
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilterMode('all')}
                  className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                    dateFilterMode === 'all' ? 'bg-surface-container-lowest text-primary shadow-xs' : 'text-on-surface-variant'
                  }`}
                >
                  All Time
                </button>
              </div>

              {dateFilterMode === 'custom' && (
                <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 px-2 text-xs border border-outline-variant rounded-lg bg-surface-container-lowest text-on-surface focus:border-primary focus:outline-none"
                  />
                  <span className="text-xs text-on-surface-variant">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 px-2 text-xs border border-outline-variant rounded-lg bg-surface-container-lowest text-on-surface focus:border-primary focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Department / Category Filter */}
            <div className="flex flex-wrap gap-1 text-[11px] bg-surface-container-low p-1 rounded-lg border border-outline-variant">
              {(['all', 'housekeeping', 'amenities', 'maintenance', 'concierge'] as const).map(cat => (
                <button
                  key={cat}
                  id={`filter-cat-${cat}`}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-2.5 py-1 rounded capitalize font-semibold transition-colors cursor-pointer ${
                    filterCategory === cat ? 'bg-surface-container-lowest text-primary shadow-xs' : 'text-on-surface-variant'
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
              <div className="p-8 text-center bg-surface-container-lowest rounded-xl border border-outline-variant text-gray-500 text-xs">
                No tasks in this category.
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isHigh = task.priority === 'high';
                const isDone = task.status === 'completed';
                const isRejected = task.status === 'rejected';
                const inProgress = task.status === 'in_progress';
                const candidates = directoryByDept(task.category);

                return (
                  <article
                    key={task.id}
                    id={`task-card-${task.id}`}
                    className={`bg-surface-container-lowest rounded-xl border ${
                      isHigh && !isDone && !isRejected
                        ? 'border-error-container shadow-[0_4px_12px_rgba(188,71,73,0.1)]'
                        : 'border-outline-variant shadow-[0_4px_12px_rgba(0,0,0,0.03)]'
                    } overflow-hidden relative transition-all ${isDone || isRejected ? 'opacity-60 bg-gray-50' : ''}`}
                  >
                    {isHigh && !isDone && !isRejected && (
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-error"></div>
                    )}

                    <div className="p-4 pl-5">
                      <div className="flex justify-between items-start mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-bold text-on-surface">{task.roomNumber}</span>
                          {isHigh ? (
                            <span className="px-2 py-0.5 rounded bg-error-container text-on-error-container text-[10px] font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> High Priority
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-[#dbe4ed] text-on-surface-variant text-[10px] font-semibold">
                              Standard
                            </span>
                          )}
                          {/* Moves a misrouted request to a different department's
                              queue — the thing "Assign to" (a person within a
                              department) couldn't already do. */}
                          <select
                            value={task.category}
                            onChange={(e) => onChangeDepartment(task.id, e.target.value as LiveOpsTask['category'])}
                            title="Move to a different department"
                            className="h-6 px-1.5 rounded bg-surface-container-low border border-outline-variant text-primary text-[10px] font-medium uppercase focus:outline-none focus:border-primary"
                          >
                            {(Object.keys(DEPT_LABELS) as LiveOpsTask['category'][]).map(d => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        </div>
                        <span className={`text-xs font-semibold shrink-0 ${isHigh ? 'text-error' : 'text-on-surface-variant'}`}>
                          Due: {task.dueTime}
                        </span>
                      </div>

                      <p className="text-sm font-medium text-on-surface mb-1">{task.title}</p>
                      <p className="text-xs text-on-surface-variant mb-3">{task.description}</p>

                      {/* Assign to — a real person from the department directory, not just a category queue */}
                      <div className="flex items-center gap-2 mb-3">
                        <UserCircle2 className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
                        <select
                          value={task.assignedTo ?? ''}
                          onChange={(e) => onAssignTask(task.id, e.target.value || null)}
                          className="flex-1 h-8 px-2 text-xs border border-outline-variant rounded-lg bg-surface-container-lowest focus:border-primary focus:outline-none"
                        >
                          <option value="">Unassigned — {DEPT_LABELS[task.category]} queue</option>
                          {candidates.map(c => (
                            <option key={c.id} value={c.name}>{c.name} · {c.phone}</option>
                          ))}
                        </select>
                        {/* Once assigned, hand them a QR — they scan it to open a no-login page with just this task, tap Start/Done. No account needed. */}
                        {task.assignedTo && !isDone && !isRejected && (
                          <button
                            type="button"
                            onClick={() => setQrTask(task)}
                            title="Generate task QR"
                            className="shrink-0 w-8 h-8 rounded-lg border border-outline-variant text-primary hover:bg-surface-container-low flex items-center justify-center"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {isRejected && task.rejectionNote && (
                        <div className="bg-error-container/30 text-on-error-container p-2.5 rounded-lg text-xs border border-error-container mb-3">
                          <span className="font-bold">Rejected: </span>
                          {task.rejectionNote}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success bg-success/10 px-3 py-1.5 rounded-lg w-full justify-center">
                            <CheckCheck className="w-4 h-4" /> Completed
                          </span>
                        ) : isRejected ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-error bg-error/10 px-3 py-1.5 rounded-lg w-full justify-center">
                            <Ban className="w-4 h-4" /> Rejected
                          </span>
                        ) : inProgress ? (
                          <button
                            onClick={() => handleAction(task)}
                            className="flex-1 h-11 bg-success text-on-success rounded-lg text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                          >
                            <Check className="w-4 h-4" /> Mark Complete
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => { setRejectingTask(task); setRejectNote(''); }}
                              className="h-11 px-3 rounded-lg border border-error text-error hover:bg-error-container/30 transition-all flex items-center justify-center cursor-pointer shrink-0"
                              title="Reject this task"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleAction(task)}
                              className={`flex-1 h-11 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                                isHigh
                                  ? 'bg-primary text-on-primary hover:bg-primary-hover shadow-xs'
                                  : 'bg-transparent border border-primary text-primary hover:bg-surface-container-low'
                              }`}
                            >
                              {isHigh ? <Play className="w-4 h-4 fill-white" /> : null}
                              <span>{isHigh ? 'Start' : 'Accept'}</span>
                            </button>
                          </>
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
          <h3 className="text-sm font-bold text-on-surface px-1">Department Contacts</h3>
          {(Object.keys(DEPT_LABELS) as DirectoryContact['department'][]).map(dept => {
            const contacts = directoryByDept(dept);
            const openCount = tasks.filter(t => t.category === dept && t.status !== 'completed').length;
            return (
              <div key={dept} className="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden">
                <div className="px-4 py-2.5 border-b border-outline-variant bg-surface-container-low flex items-center justify-between">
                  <h4 className="text-xs font-bold text-on-surface">{DEPT_LABELS[dept]}</h4>
                  {openCount > 0 && <span className="text-[10px] font-bold text-primary bg-highlight px-2 py-0.5 rounded-full">{openCount} open</span>}
                </div>
                {contacts.length === 0 ? (
                  <p className="text-[11px] text-on-surface-variant text-center py-4 px-3">No contacts added yet — Owner &gt; Staff tab.</p>
                ) : (
                  <div className="divide-y divide-outline-variant">
                    {contacts.map(c => (
                      <a
                        key={c.id}
                        href={`tel:${c.phone.replace(/\s+/g, '')}`}
                        className="flex items-center justify-between px-4 py-2.5 text-xs hover:bg-surface-container-low transition-colors"
                      >
                        <span className="font-semibold text-on-surface">{c.name}</span>
                        <span className="flex items-center gap-1 text-primary font-semibold">
                          <Phone className="w-3 h-3" /> {c.phone}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* One QR per department — scan it before your shift, it opens
              straight into that department's queue. Auto-created the first
              time anyone taps "Show QR" for a department, nothing to name
              or configure first. */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden">
            <div className="px-4 py-2.5 border-b border-outline-variant bg-surface-container-low">
              <h4 className="text-xs font-bold text-on-surface">Department QR Codes</h4>
              <p className="text-[10px] text-on-surface-variant mt-0.5">Scan before a shift — opens that department's queue.</p>
            </div>
            <div className="divide-y divide-outline-variant">
              {(Object.keys(DEPT_LABELS) as DepartmentDisplayAdmin['department'][]).map(dept => {
                const existing = displays.find(d => d.department === dept && d.active);
                return (
                  <div key={dept} className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <span className="font-semibold text-on-surface">{DEPT_LABELS[dept]}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {existing && (
                        <button
                          onClick={() => handleToggleDisplay(existing)}
                          className="text-error hover:bg-surface-container-low p-1.5 rounded"
                          title="Revoke this QR — a fresh one is made next time you tap Show QR"
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleShowDepartmentQr(dept)}
                        disabled={gettingQrFor === dept}
                        className="h-8 px-3 rounded-lg bg-primary text-on-primary text-[11px] font-bold hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Tablet className="w-3.5 h-3.5" /> {gettingQrFor === dept ? 'Getting QR…' : 'Show QR'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {qrTask && <TaskQrModal task={qrTask} onClose={() => setQrTask(null)} />}
      {qrDisplay && <DisplayQrModal display={qrDisplay} onClose={() => setQrDisplay(null)} />}

      {rejectingTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant space-y-3">
            <h3 className="text-lg font-bold text-on-surface">Reject this task?</h3>
            <p className="text-xs text-on-surface-variant">
              {rejectingTask.title} — {rejectingTask.roomNumber}. Say why so whoever's tracking it knows what happened.
            </p>
            <textarea
              autoFocus
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. No spare rooms to move linens from, short-staffed tonight..."
              className="w-full p-2.5 text-sm border border-outline-variant rounded-lg focus:border-error focus:outline-none resize-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setRejectingTask(null)}
                className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={!rejectNote.trim()}
                className="px-4 py-2 bg-error text-on-error rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50"
              >
                Reject Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Task Creation Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest rounded-2xl max-w-md w-full p-6 shadow-2xl border border-outline-variant">
            <h3 className="text-lg font-bold text-on-surface mb-4 pb-2 border-b border-outline-variant">
              Create Live Ops Assignment
            </h3>
            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-on-surface block mb-1">Room Number (optional)</label>
                <input
                  type="text"
                  value={newRoom}
                  onChange={(e) => setNewRoom(e.target.value)}
                  placeholder="e.g. 308"
                  className="w-full h-10 px-3 border border-outline-variant rounded-lg focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-on-surface block mb-1">Task Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Deliver bath sheets & pillow set"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full h-10 px-3 border border-outline-variant rounded-lg focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-on-surface block mb-1">Due</label>
                <input
                  type="text"
                  placeholder="e.g. 11:00 AM, or 'by checkout'"
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  className="w-full h-10 px-3 border border-outline-variant rounded-lg focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-on-surface block mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as 'high' | 'standard')}
                    className="w-full h-10 px-3 border border-outline-variant rounded-lg bg-surface-container-lowest"
                  >
                    <option value="standard">Standard</option>
                    <option value="high">High Priority</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-on-surface block mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as typeof newCategory)}
                    className="w-full h-10 px-3 border border-outline-variant rounded-lg bg-surface-container-lowest"
                  >
                    <option value="housekeeping">Housekeeping</option>
                    <option value="amenities">Amenities</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="concierge">Concierge</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  className="px-4 py-2 border border-outline-variant rounded-lg font-semibold text-on-surface-variant cursor-pointer hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary text-on-primary rounded-lg font-bold hover:bg-primary-hover cursor-pointer shadow-xs"
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
