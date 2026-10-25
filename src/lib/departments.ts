/**
 * The teams a task or guest request can go to — the one list every screen
 * uses (Live Ops, department screens, badges, shift cover, services).
 * Must match the check constraints in 0075_service_teams_and_request_forms.sql.
 * Front desk requests are worked from Reception's own dashboard.
 */
export const DEPARTMENTS = [
  { value: 'front_desk', label: 'Front desk' },
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'concierge', label: 'Concierge' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'spa', label: 'Spa & wellness' },
  { value: 'transport', label: 'Transport' },
  { value: 'kitchen', label: 'Kitchen' },
] as const;

export type Department = (typeof DEPARTMENTS)[number]['value'];

export const DEPARTMENT_VALUES: Department[] = DEPARTMENTS.map(d => d.value);

export const DEPARTMENT_LABELS = Object.fromEntries(DEPARTMENTS.map(d => [d.value, d.label])) as Record<Department, string>;

/** Label for a team, tolerating a value from before 0075. */
export const departmentLabel = (d: string) => DEPARTMENT_LABELS[d as Department] ?? d;

/** A button the guest taps in a service's request form. Price 0 = free. */
export interface ServiceChoice {
  id: string;
  label: string;
  price: number;
}

/**
 * The request form an owner builds for a service (service_categories.form).
 * Route-picker services (transport) use the transfer routes instead of choices.
 */
export interface ServiceForm {
  choices?: ServiceChoice[];
  /** Guests may pick several choices (otherwise exactly one). */
  multiple?: boolean;
  /** Ask how many of each choice (e.g. laundry pieces). */
  quantity?: boolean;
  /** Ask for a preferred time. */
  askTime?: boolean;
  /** Offer a note box (default on). */
  note?: boolean;
}
