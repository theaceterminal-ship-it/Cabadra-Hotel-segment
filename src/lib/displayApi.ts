/**
 * The department-display capability surface — a third login-less flow
 * alongside guestApi.ts (one stay) and serviceTaskApi.ts (one task): a
 * shared tablet scoped to one department's whole queue, with its own
 * revocable token. A badge scan on top of that claims the display for a
 * named staff member, so actions attribute to a person, not just the
 * device. See department_display_resolve/_task_start/_task_complete/
 * _task_reject (0046, 0048) and department_display_scan_badge (0047).
 */

import { supabase } from './supabaseClient';

export interface DisplayTask {
  id: string;
  title: string;
  description: string;
  roomLabel: string;
  priority: 'high' | 'standard';
  status: 'pending' | 'in_progress';
  assignedTo?: string;
  dueLabel?: string;
}

export interface DepartmentDisplay {
  propertyName: string;
  department: 'housekeeping' | 'maintenance' | 'amenities' | 'concierge';
  label: string;
  tasks: DisplayTask[];
}

export async function resolveDisplay(token: string): Promise<DepartmentDisplay> {
  const { data, error } = await supabase.rpc('department_display_resolve', { p_token: token });
  if (error) throw new Error(error.message);
  return data as DepartmentDisplay;
}

export interface BadgeScanResult {
  action: 'claimed' | 'released' | 'handover';
  staffName: string;
  shiftName?: string;
}

/** Whoever's badge was just scanned — claims the display, releases it if it's their own already-active claim, or hands it over from whoever else was on. */
export async function scanBadge(displayToken: string, badgeToken: string): Promise<BadgeScanResult> {
  const { data, error } = await supabase.rpc('department_display_scan_badge', {
    p_display_token: displayToken,
    p_badge_token: badgeToken,
  });
  if (error) throw new Error(error.message);
  return data as BadgeScanResult;
}

/** Pending -> in_progress. Refuses if the task isn't actually on this display's property + department. */
export async function startDisplayTask(displayToken: string, taskId: string): Promise<DisplayTask['status']> {
  const { data, error } = await supabase.rpc('department_display_task_start', { p_token: displayToken, p_task_id: taskId });
  if (error) throw new Error(error.message);
  return (data as { status: DisplayTask['status'] }).status;
}

/** Pending or in_progress -> completed, posting the folio charge if the task is priced (task_complete_core, 0046). */
export async function completeDisplayTask(displayToken: string, taskId: string): Promise<'completed'> {
  const { data, error } = await supabase.rpc('department_display_task_complete', { p_token: displayToken, p_task_id: taskId });
  if (error) throw new Error(error.message);
  return (data as { status: 'completed' }).status;
}

/** Pending only, a reason is required — mirrors staff_reject_task's guard. */
export async function rejectDisplayTask(displayToken: string, taskId: string, note: string): Promise<'rejected'> {
  const { data, error } = await supabase.rpc('department_display_task_reject', {
    p_token: displayToken,
    p_task_id: taskId,
    p_note: note,
  });
  if (error) throw new Error(error.message);
  return (data as { status: 'rejected' }).status;
}
