import React, { useState } from 'react';
import { LiveOpsTask, AppView, Room } from '../types';
import { DirectoryContact } from '../lib/staffApi';
import { TaskQrModal } from './TaskQrModal';
import Papa from 'papaparse';
import {
  CheckCircle2,
  AlertTriangle,
  Play,
  Check,
  Plus,
  Brush,
  RefreshCw,
  FileSpreadsheet,
  QrCode,
  X,
  Users,
  Calendar,
  Search,
} from 'lucide-react';
import { DEPARTMENT_LABELS, DEPARTMENT_VALUES, type Department } from '../lib/departments';
import { formatCurrency } from '../lib/currency';
import { DateRangePicker } from './DatePicker';

interface LiveOpsViewProps {
  propertyId: string;
  /** For showing a priced task's charge. */
  currency?: string;
  tasks: LiveOpsTask[];
  directory: DirectoryContact[];
  rooms?: Room[];
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

const DEPT_LABELS = DEPARTMENT_LABELS;

export const LiveOpsView: React.FC<LiveOpsViewProps> = ({
  propertyId,
  currency = 'INR',
  tasks,
  directory,
  rooms,
  onUpdateTask,
  onRejectTask,
  onAssignTask,
  onChangeDepartment,
  onAddTask,
  onRefresh,
  onNavigate,
}) => {
  const [filterCategory, setFilterCategory] = useState<'all' | Department>('all');
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | 'completed' | 'rejected'>('open');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [qrTask, setQrTask] = useState<LiveOpsTask | null>(null);
  const [rejectingTask, setRejectingTask] = useState<LiveOpsTask | null>(null);
  const [rejectNote, setRejectNote] = useState('');

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
  const [newCategory, setNewCategory] = useState<Department>('housekeeping');

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  function getLocalDateString(d?: Date | string): string {
    if (!d) return getLocalDateString(new Date());
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return getLocalDateString(new Date());
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const todayStr = getLocalDateString(new Date());
  const minutesBetween = (from: string, to: string) => {
    const m = Math.max(0, Math.round((+new Date(to) - +new Date(from)) / 60000));
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
  };
  const daysAgoStr = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return getLocalDateString(d); };

  const [dateFilterMode, setDateFilterMode] = useState<'today' | 'yesterday' | 'week' | 'custom' | 'all'>('today');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);

  const safeTasks = tasks ?? [];

  const filteredTasks = safeTasks.filter(t => {
    // 1. Category Filter
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;

    // 2. Date Filter
    if (dateFilterMode === 'all') return true;

    if (!t.createdAt) return false;
    const taskDateStr = getLocalDateString(t.createdAt);

    if (dateFilterMode === 'today') {
      return taskDateStr === todayStr;
    }
    if (dateFilterMode === 'yesterday') {
      return taskDateStr === daysAgoStr(1);
    }
    if (dateFilterMode === 'week') {
      return taskDateStr >= daysAgoStr(6) && taskDateStr <= todayStr;
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

  // Open work first, newest first within each; search across room, task and person.
  const q = search.trim().toLowerCase();
  const visibleTasks = filteredTasks
    .filter(t => statusFilter === 'all' ? true : statusFilter === 'open' ? t.status === 'pending' || t.status === 'in_progress' : t.status === statusFilter)
    .filter(t => !q || [t.title, t.roomNumber, t.assignedTo, DEPT_LABELS[t.category]].some(v => v?.toLowerCase().includes(q)))
    .sort((a, b) => {
      const open = (t: LiveOpsTask) => (t.status === 'pending' || t.status === 'in_progress' ? 0 : 1);
      return open(a) - open(b) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });

  const exportCsv = () => {
    const csv = Papa.unparse(visibleTasks.map(t => ({
      Requested: t.createdAt ? new Date(t.createdAt).toLocaleString('en-IN') : '',
      Started: t.startedAt ? new Date(t.startedAt).toLocaleString('en-IN') : '',
      'Finished / rejected': t.completedAt ? new Date(t.completedAt).toLocaleString('en-IN') : '',
      'Minutes to finish': t.status === 'completed' && t.createdAt && t.completedAt ? Math.max(0, Math.round((+new Date(t.completedAt) - +new Date(t.createdAt)) / 60000)) : '',
      Room: t.roomNumber,
      Task: t.title,
      Department: DEPT_LABELS[t.category],
      Priority: t.priority,
      'Assigned to': t.assignedTo ?? 'Unassigned',
      Status: t.status,
      'Rejection reason': t.rejectionNote ?? '',
      Price: t.price ?? '',
    })));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    Object.assign(document.createElement('a'), { href: url, download: `live_ops_${todayStr}.csv` }).click();
    URL.revokeObjectURL(url);
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

  const directoryByDept = (dept: DirectoryContact['department']) => (directory ?? []).filter(d => d.department === dept);

  return (
    <div id="live-ops-canvas" className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary text-on-primary rounded-lg">
            <Brush className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-on-surface">Live Ops</h1>
            <p className="text-xs text-on-surface-variant">Housekeeping &amp; Staff Operations</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Department contacts, their screens' QR codes and shifts live on the Departments tab. */}
          <button
            onClick={() => onNavigate('departments')}
            className="h-9 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface text-xs font-semibold hover:bg-surface-container-low transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Departments</span>
          </button>
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
            <h2 className="text-xs font-medium text-on-surface-variant">Active Tasks</h2>
            <p className="text-3xl font-semibold text-primary mt-1">{pendingCount}</p>
          </div>
          <div className="h-11 w-11 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-xs shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div
          id="stat-urgent"
          className="bg-error-container rounded-xl p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between"
        >
          <h2 className="text-xs font-medium text-on-error-container">Urgent</h2>
          <div className="flex justify-between items-end mt-1">
            <p className="text-2xl font-semibold text-on-error-container">{urgentCount}</p>
            <AlertTriangle className="w-5 h-5 text-on-error-container opacity-80" />
          </div>
        </div>

        <div
          id="stat-completed"
          className="bg-surface-container-low rounded-xl p-4 shadow-[0_4px_12px_rgba(0,0,0,0.03)] border border-outline-variant flex flex-col justify-between"
        >
          <h2 className="text-xs font-medium text-on-surface-variant">Completed</h2>
          <div className="flex justify-between items-end mt-1">
            <p className="text-2xl font-semibold text-primary">{completedCount}</p>
            <Check className="w-5 h-5 text-primary opacity-80" />
          </div>
        </div>
      </section>

      <div className="space-y-6">
        {/* Task List Section — main column */}
        <div className="space-y-4">
          {/* Controls Bar: Date Filter + Department Category Filter */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface-container-lowest p-3 rounded-xl border border-outline-variant shadow-2xs">
            {/* Date Range Selector */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-on-surface flex items-center gap-1">
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
                  onClick={() => setDateFilterMode('yesterday')}
                  className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                    dateFilterMode === 'yesterday' ? 'bg-surface-container-lowest text-primary shadow-xs' : 'text-on-surface-variant'
                  }`}
                >
                  Yesterday
                </button>
                <button
                  type="button"
                  onClick={() => setDateFilterMode('week')}
                  className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                    dateFilterMode === 'week' ? 'bg-surface-container-lowest text-primary shadow-xs' : 'text-on-surface-variant'
                  }`}
                >
                  Last 7 days
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
                  <DateRangePicker
                    start={startDate}
                    end={endDate}
                    onChange={(a, b) => { setStartDate(a); setEndDate(b); }}
                    allowSameDay
                    compact
                    className="h-8 px-2.5 gap-2 text-xs border border-outline-variant rounded-lg bg-surface-container-lowest text-on-surface focus:border-primary focus:outline-none flex items-center"
                  />
                </div>
              )}
            </div>

            {/* Department / Category Filter & Spreadsheet Button */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1 text-[11px] bg-surface-container-low p-1 rounded-lg border border-outline-variant">
                {(['all', ...DEPARTMENT_VALUES] as const).map(cat => (
                  <button
                    key={cat}
                    id={`filter-cat-${cat}`}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-2.5 py-1 rounded capitalize font-semibold transition-colors cursor-pointer ${
                      filterCategory === cat ? 'bg-surface-container-lowest text-primary shadow-xs' : 'text-on-surface-variant'
                    }`}
                  >
                    {cat === 'all' ? 'All' : DEPT_LABELS[cat]}
                  </button>
                ))}
              </div>

<button
                type="button"
                onClick={exportCsv}
                disabled={visibleTasks.length === 0}
                className="h-8 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface text-xs font-semibold hover:bg-surface-container-low disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search room, task, person" className="w-full h-9 pl-9 pr-3 rounded-full border border-outline-variant bg-surface-container-lowest text-sm focus:outline-none focus:border-on-surface" />
            </label>
            <div className="flex rounded-full bg-surface-container-low p-1 text-xs">
              {([['open', 'Open'], ['completed', 'Done'], ['rejected', 'Rejected'], ['all', 'All']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setStatusFilter(id)} className={`h-7 px-3 rounded-full font-medium ${statusFilter === id ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>{label}</button>
              ))}
            </div>
            <span className="text-xs text-on-surface-variant">{visibleTasks.length} {visibleTasks.length === 1 ? 'row' : 'rows'}</span>
          </div>

          {/* The work log as a spreadsheet: every request and task on one
              row each, with what the desk needs inline. Open ones can be
              moved to another department, given to someone (or back to the
              queue), started, finished or rejected; closed ones read as
              history. */}
          <div className="rounded-[20px] bg-surface-container-lowest border border-outline-variant overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead>
                  <tr className="text-left text-xs text-on-surface-variant border-b border-outline-variant bg-surface-container-low/60">
                    <th className="px-3 py-2.5 font-medium w-28">Requested</th>
                    <th className="px-3 py-2.5 font-medium w-24">Room</th>
                    <th className="px-3 py-2.5 font-medium">Task</th>
                    <th className="px-3 py-2.5 font-medium w-40">Department</th>
                    <th className="px-3 py-2.5 font-medium w-56">Assigned to</th>
                    <th className="px-3 py-2.5 font-medium w-28">Status</th>
                    <th className="px-3 py-2.5 font-medium w-44 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {visibleTasks.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-10 text-center text-on-surface-variant">Nothing here for these filters.</td></tr>
                  ) : visibleTasks.map(task => {
                    const isHigh = task.priority === 'high';
                    const isDone = task.status === 'completed';
                    const isRejected = task.status === 'rejected';
                    const closed = isDone || isRejected;
                    const candidates = directoryByDept(task.category);
                    return (
                      <tr key={task.id} id={`task-row-${task.id}`} className={`align-top transition-colors ${closed ? 'text-on-surface-variant' : 'hover:bg-surface-container-low/50'}`}>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {task.createdAt ? new Date(task.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—'}
                          {task.createdAt && <span className="block text-[11px] text-on-surface-variant">{new Date(task.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                          {task.completedAt && task.createdAt && (
                            <span className="block text-[11px] text-on-surface-variant" title={isRejected ? 'Rejected at' : 'Finished at'}>
                              {isRejected ? 'Rejected' : 'Done'} {new Date(task.completedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                              {isDone && ` · ${minutesBetween(task.createdAt, task.completedAt)}`}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-medium">{task.roomNumber}</td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-1.5">
                            {isHigh && !closed && <span className="size-2 rounded-full bg-error shrink-0" title="High priority" />}
                            <span className={`font-medium ${closed ? '' : 'text-on-surface'}`}>{task.title}</span>
                          </span>
                          {task.description && task.description !== 'Dispatched from Live Operations control center.' && <span className="block text-xs text-on-surface-variant mt-0.5 line-clamp-2">{task.description}</span>}
                          <span className="block text-[11px] text-on-surface-variant mt-0.5">Due {task.dueTime}{isHigh ? ' · high priority' : ''}</span>
                          {!!task.price && <span className="inline-flex mt-1 rounded-full bg-highlight text-on-highlight text-[11px] font-medium px-2 py-0.5">{formatCurrency(task.price, currency)} billed when done</span>}
                          {isRejected && task.rejectionNote && <span className="block text-xs text-error mt-1">Rejected: {task.rejectionNote}</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {closed ? DEPT_LABELS[task.category] : (
                            <select
                              value={task.category}
                              onChange={(e) => onChangeDepartment(task.id, e.target.value as LiveOpsTask['category'])}
                              aria-label="Move to another department"
                              className="w-full h-8 px-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-xs focus:border-primary focus:outline-none"
                            >
                              {(Object.keys(DEPT_LABELS) as LiveOpsTask['category'][]).map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {closed ? (task.assignedTo || '—') : (
                            <span className="flex items-center gap-1.5">
                              <select
                                value={task.assignedTo ?? ''}
                                onChange={(e) => onAssignTask(task.id, e.target.value || null)}
                                aria-label="Assign to"
                                className={`flex-1 min-w-0 h-8 px-2 rounded-lg border bg-surface-container-lowest text-xs focus:border-primary focus:outline-none ${task.assignedTo ? 'border-outline-variant' : 'border-warning/60'}`}
                              >
                                <option value="">Unassigned · {DEPT_LABELS[task.category]} queue</option>
                                {candidates.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                              </select>
                              {task.assignedTo && (
                                <button type="button" onClick={() => setQrTask(task)} title="Task QR for them to scan" aria-label="Task QR" className="size-8 shrink-0 rounded-lg border border-outline-variant hover:bg-surface-container-low flex items-center justify-center">
                                  <QrCode className="size-3.5" />
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex h-6 px-2.5 rounded-full text-xs font-medium items-center whitespace-nowrap ${
                            isDone ? 'bg-success/15 text-success' : isRejected ? 'bg-error/10 text-error' : task.status === 'in_progress' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'
                          }`}>
                            {isDone ? 'Done' : isRejected ? 'Rejected' : task.status === 'in_progress' ? 'In progress' : 'Waiting'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {!closed && (
                            <span className="flex items-center justify-end gap-1.5">
                              {task.status === 'pending' && (
                                <button onClick={() => { setRejectingTask(task); setRejectNote(''); }} title="Reject" aria-label="Reject" className="size-8 rounded-lg border border-error/50 text-error hover:bg-error/10 flex items-center justify-center">
                                  <X className="size-3.5" />
                                </button>
                              )}
                              <button onClick={() => handleAction(task)} className={`h-8 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 ${task.status === 'in_progress' ? 'bg-success text-on-success' : 'bg-primary text-on-primary'}`}>
                                {task.status === 'in_progress' ? <><Check className="size-3.5" /> Done</> : <><Play className="size-3.5" /> Start</>}
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      {qrTask && <TaskQrModal task={qrTask} onClose={() => setQrTask(null)} />}

      {rejectingTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant space-y-3">
            <h3 className="text-lg font-semibold text-on-surface">Reject this task?</h3>
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
                className="px-4 py-2 border border-outline-variant rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={!rejectNote.trim()}
                className="px-4 py-2 bg-error text-on-error rounded-lg text-xs font-semibold hover:brightness-95 disabled:opacity-50"
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
            <h3 className="text-lg font-semibold text-on-surface mb-4 pb-2 border-b border-outline-variant">
              Create Live Ops Assignment
            </h3>
            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-on-surface block mb-1">Target Room / Area</label>
                <select
                  value={newRoom}
                  onChange={(e) => setNewRoom(e.target.value)}
                  className="w-full h-10 px-3 border border-outline-variant rounded-lg focus:border-primary focus:outline-none bg-surface-container-lowest text-xs text-on-surface cursor-pointer"
                >
                  <option value="">General / Property-wide</option>
                  {(rooms ?? []).map(r => (
                    <option key={r.id} value={r.number}>
                      Room {r.number}{r.type ? ` (${r.type})` : ''}
                    </option>
                  ))}
                </select>
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
                    {DEPARTMENT_VALUES.map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  className="px-4 py-2 border border-outline-variant rounded-lg font-semibold text-on-surface-variant cursor-pointer hover:bg-surface-container-low"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary text-on-primary rounded-lg font-semibold hover:bg-primary-hover cursor-pointer shadow-xs"
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
