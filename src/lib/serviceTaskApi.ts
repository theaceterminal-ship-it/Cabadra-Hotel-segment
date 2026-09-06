/**
 * The other login-less capability surface, alongside guestApi.ts — but for
 * staff who don't have (or need) a Cabadra account: a housekeeping
 * attendant, a maintenance person, a driver. A task's QR encodes its
 * task_token; scanning it opens TaskScanPage, which uses exactly these
 * three calls. See service_task_resolve/start/complete (0025_task_qr.sql).
 */

import { supabase } from './supabaseClient';

export interface ServiceTask {
  id: string;
  title: string;
  description: string;
  roomLabel: string;
  priority: 'high' | 'standard';
  category: 'housekeeping' | 'maintenance' | 'amenities' | 'concierge';
  status: 'pending' | 'in_progress' | 'completed';
  assignedTo?: string;
  propertyName: string;
}

export async function resolveServiceTask(token: string): Promise<ServiceTask> {
  const { data, error } = await supabase.rpc('service_task_resolve', { p_token: token });
  if (error) throw new Error(error.message.includes('invalid') ? error.message : `Couldn't open this task: ${error.message}`);
  return data as ServiceTask;
}

/** Pending -> in_progress. Safe to call even if already started or done — the RPC just returns the current status instead of erroring, so a double-tap can't show a scary message. */
export async function startServiceTask(token: string): Promise<ServiceTask['status']> {
  const { data, error } = await supabase.rpc('service_task_start', { p_token: token });
  if (error) throw new Error(`Failed to start task: ${error.message}`);
  return (data as { status: ServiceTask['status'] }).status;
}

/** Pending or in_progress -> completed. Fires notify_task_completed on the way through, so Reception's notification bell lights up the moment this is tapped. */
export async function completeServiceTask(token: string): Promise<ServiceTask['status']> {
  const { data, error } = await supabase.rpc('service_task_complete', { p_token: token });
  if (error) throw new Error(`Failed to complete task: ${error.message}`);
  return (data as { status: ServiceTask['status'] }).status;
}
