import React, { useState } from 'react';
import Papa from 'papaparse';
import { LiveOpsTask } from '../types';
import { Download, X, Search, Filter, FileSpreadsheet, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { DEPARTMENTS } from '../lib/departments';

interface LiveOpsSpreadsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: LiveOpsTask[];
  propertyName: string;
}

export function LiveOpsSpreadsheetModal({ isOpen, onClose, tasks, propertyName }: LiveOpsSpreadsheetModalProps) {
  if (!isOpen) return null;

  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredTasks = (tasks ?? []).filter(t => {
    if (departmentFilter !== 'all' && t.category !== departmentFilter) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      (t.roomNumber && t.roomNumber.toLowerCase().includes(q)) ||
      (t.assignedTo && t.assignedTo.toLowerCase().includes(q)) ||
      (t.category && t.category.toLowerCase().includes(q))
    );
  });

  const handleExportCsv = () => {
    if (filteredTasks.length === 0) return;
    const csvData = filteredTasks.map(t => ({
      'Task ID': t.id,
      'Room Number': t.roomNumber || 'N/A',
      'Department': t.category,
      'Task Title': t.title,
      'Assigned Staff': t.assignedTo || 'Unassigned',
      'Priority': t.priority,
      'Status': t.status,
      'Created At': new Date(t.createdAt).toLocaleString(),
      'Rejection Reason': t.rejectionNote || 'N/A',
      'Price': t.price ? `$${t.price}` : 'Unpriced',
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${propertyName.toLowerCase().replace(/\s+/g, '_')}_live_ops_spreadsheet_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[80] animate-in fade-in duration-150" onClick={onClose}>
      <div className="bg-surface-container-lowest rounded-2xl max-w-6xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-outline-variant overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-on-surface">Live Ops Work History Spreadsheet</h2>
              <p className="text-[11px] text-on-surface-variant">Excel-style data grid of department tasks, assignments, and audit trails.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredTasks.length === 0}
              className="h-9 px-3.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl font-bold cursor-pointer px-2"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="p-4 border-b border-outline-variant/60 bg-surface-container-lowest flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search room #, staff name, or task..."
              className="w-full h-9 pl-9 pr-3 text-xs border border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container-lowest"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              className="h-9 px-3 text-xs border border-outline-variant rounded-xl bg-surface-container-low font-medium"
            >
              <option value="all">All Departments</option>
              {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-9 px-3 text-xs border border-outline-variant rounded-xl bg-surface-container-low font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </select>

            <span className="text-xs font-bold text-on-surface-variant px-2">
              Showing {filteredTasks.length} rows
            </span>
          </div>
        </div>

        {/* Spreadsheet Data Grid */}
        <div className="flex-1 overflow-auto p-0">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-16 text-xs text-on-surface-variant">
              No tasks match the filter options.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-surface-container-low z-10 shadow-2xs">
                <tr className="border-b border-outline-variant/60 text-on-surface-variant font-bold text-[11px] uppercase tracking-wider">
                  <th className="p-3 pl-5 border-r border-outline-variant/40">Room</th>
                  <th className="p-3 border-r border-outline-variant/40">Department</th>
                  <th className="p-3 border-r border-outline-variant/40">Task Title</th>
                  <th className="p-3 border-r border-outline-variant/40">Assigned Staff</th>
                  <th className="p-3 border-r border-outline-variant/40">Priority</th>
                  <th className="p-3 border-r border-outline-variant/40">Status</th>
                  <th className="p-3 border-r border-outline-variant/40">Created At</th>
                  <th className="p-3 pr-5">Rejection / Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40 font-mono text-[11px]">
                {filteredTasks.map((t, idx) => (
                  <tr key={t.id} className={idx % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container-low/30'}>
                    <td className="p-2.5 pl-5 border-r border-outline-variant/30 font-extrabold text-on-surface">
                      {t.roomNumber || 'N/A'}
                    </td>
                    <td className="p-2.5 border-r border-outline-variant/30 font-bold capitalize text-primary">
                      {t.category}
                    </td>
                    <td className="p-2.5 border-r border-outline-variant/30 font-sans font-semibold text-on-surface max-w-xs truncate">
                      {t.title}
                    </td>
                    <td className="p-2.5 border-r border-outline-variant/30 font-sans text-on-surface-variant">
                      {t.assignedTo || <span className="text-gray-400 italic">Unassigned</span>}
                    </td>
                    <td className="p-2.5 border-r border-outline-variant/30 font-bold">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase ${t.priority === 'high' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="p-2.5 border-r border-outline-variant/30 font-bold">
                      <span className={`px-2 py-0.5 rounded text-[10px] capitalize ${
                        t.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : t.status === 'in_progress'
                          ? 'bg-amber-100 text-amber-800'
                          : t.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-2.5 border-r border-outline-variant/30 text-on-surface-variant">
                      {new Date(t.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-2.5 pr-5 text-on-surface-variant font-sans">
                      {t.rejectionNote ? (
                        <span className="text-error font-semibold">Declined: "{t.rejectionNote}"</span>
                      ) : t.price ? (
                        <span className="text-success font-bold">${t.price}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
