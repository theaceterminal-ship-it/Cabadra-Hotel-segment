import React, { useEffect, useState } from 'react';
import { Check, Copy, Link2, Pencil, Plus, QrCode, RefreshCw, UserPlus } from 'lucide-react';
import { AttendancePanel } from './AttendancePanel';
import {
  addDirectoryContact, cancelPendingInvite, deleteDirectoryContact, DirectoryContact, fetchAccessLink, fetchStaffDirectory, updateDirectoryContact,
  inviteStaff, PendingInvite, provisionAccessLink, revokeStaffAccess, sendStaffInviteEmail, StaffMember,
} from '../../lib/staffApi';
import { BadgeQrModal } from '../../components/BadgeQrModal';
import { Chip, DeleteButton, ErrorNote, Field, Modal, Panel, SectionHeader, btnPrimary, btnSecondary, iconBtn, inputCls } from './ui';
import { DEPARTMENTS, DEPARTMENT_LABELS } from '../../lib/departments';

export function StaffTab({ propertyId, staff, pendingInvites, onChanged }: {
  propertyId: string; staff: StaffMember[]; pendingInvites: PendingInvite[]; onChanged: () => void;
}) {
  return (
    <div className="space-y-4">
      <AccessLinkPanel propertyId={propertyId} />
      <TeamPanel propertyId={propertyId} staff={staff} pendingInvites={pendingInvites} onChanged={onChanged} />
      <ContactsPanel propertyId={propertyId} />
      <AttendancePanel propertyId={propertyId} />
    </div>
  );
}

/**
 * The main way reception gets in: one link, no login. Opening it signs the
 * browser into a dedicated shared reception account (see redeem-access-link).
 * Anyone with the link has reception access, so it's treated like a key.
 */
function AccessLinkPanel({ propertyId }: { propertyId: string }) {
  const [link, setLink] = useState<string | null | 'loading'>('loading');
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccessLink(propertyId).then(setLink).catch(() => setLink(null));
  }, [propertyId]);

  const linkUrl = link && link !== 'loading' ? `${window.location.origin}/access/${link}` : null;

  const handleGenerate = async (regenerate: boolean) => {
    setWorking(true);
    setError(null);
    try {
      setLink(await provisionAccessLink(propertyId, regenerate));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create access link.');
    } finally {
      setWorking(false);
    }
  };

  const handleCopy = () => {
    if (!linkUrl) return;
    navigator.clipboard.writeText(linkUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Panel>
      <SectionHeader
        title="Reception link"
        description="Bookmark it on the front-desk computer. It opens Reception without a login, so share it like a key."
      />
      {link === 'loading' ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : linkUrl ? (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 min-w-0 h-11 px-4 rounded-xl bg-surface-container flex items-center gap-2 text-sm text-on-surface">
              <Link2 className="size-4 text-on-surface-variant shrink-0" />
              <span className="truncate font-mono text-[13px]">{linkUrl}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCopy} className={btnPrimary}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy'}</button>
              <button onClick={() => handleGenerate(true)} disabled={working} className={btnSecondary}>
                <RefreshCw className="size-4" /> {working ? 'Changing…' : 'New link'}
              </button>
            </div>
          </div>
          <p className="text-xs text-on-surface-variant mt-3">A new link stops the old one working straight away.</p>
        </>
      ) : (
        <button onClick={() => handleGenerate(false)} disabled={working} className={btnPrimary}>{working ? 'Creating…' : 'Create reception link'}</button>
      )}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </Panel>
  );
}

function TeamPanel({ propertyId, staff, pendingInvites, onChanged }: {
  propertyId: string; staff: StaffMember[]; pendingInvites: PendingInvite[]; onChanged: () => void;
}) {
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'receptionist'>('receptionist');
  const [submitting, setSubmitting] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // Set right after "no account found": offers a real invite email as the follow-up.
  const [noAccountFor, setNoAccountFor] = useState<{ email: string; role: 'owner' | 'receptionist' } | null>(null);

  const openInvite = () => {
    setEmail('');
    setRole('receptionist');
    setMessage(null);
    setNoAccountFor(null);
    setInviting(true);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setMessage(null);
    setNoAccountFor(null);
    try {
      const result = await inviteStaff(propertyId, email.trim(), role);
      if (result.success) {
        onChanged();
        setInviting(false);
      } else {
        setMessage({ type: 'error', text: result.message });
        setNoAccountFor({ email: email.trim(), role });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to grant access.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendInviteEmail = async () => {
    if (!noAccountFor) return;
    setSendingInvite(true);
    try {
      const result = await sendStaffInviteEmail(propertyId, noAccountFor.email, noAccountFor.role);
      if (result.success) {
        onChanged();
        setInviting(false);
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send invite email.' });
    } finally {
      setSendingInvite(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    setListError(null);
    try {
      await revokeStaffAccess(propertyId, userId);
      onChanged();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to remove access.');
    }
  };

  const handleCancelPending = async (inviteEmail: string) => {
    setListError(null);
    try {
      await cancelPendingInvite(propertyId, inviteEmail);
      onChanged();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to cancel invite.');
    }
  };

  return (
    <Panel>
      <SectionHeader
        title="Team accounts"
        description="People who sign in with their own email, if you'd rather not use the shared link."
        actions={<button onClick={openInvite} className={btnSecondary}><UserPlus className="size-4" /> Invite</button>}
      />
      {listError && <div className="mb-3"><ErrorNote>{listError}</ErrorNote></div>}
      {staff.length === 0 && pendingInvites.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No team accounts yet.</p>
      ) : (
        <div className="divide-y divide-outline-variant -my-1">
          {staff.map(s => (
            <div key={s.userId} className="flex items-center gap-3 py-2.5">
              <span className="size-9 shrink-0 rounded-full bg-surface-container flex items-center justify-center text-sm font-medium text-on-surface uppercase">
                {s.email.charAt(0)}
              </span>
              <p className="flex-1 min-w-0 text-sm text-on-surface truncate">{s.email}</p>
              <Chip>{s.role === 'owner' ? 'Owner' : 'Reception'}</Chip>
              <DeleteButton onDelete={() => handleRevoke(s.userId)} label="Remove access" />
            </div>
          ))}
          {pendingInvites.map(p => (
            <div key={p.email} className="flex items-center gap-3 py-2.5">
              <span className="size-9 shrink-0 rounded-full border border-dashed border-outline flex items-center justify-center text-on-surface-variant">
                <UserPlus className="size-4" />
              </span>
              <p className="flex-1 min-w-0 text-sm text-on-surface-variant truncate">{p.email}</p>
              <Chip tone="warn">Invited · {p.role === 'owner' ? 'Owner' : 'Reception'}</Chip>
              <DeleteButton onDelete={() => handleCancelPending(p.email)} label="Cancel invite" />
            </div>
          ))}
        </div>
      )}

      {inviting && (
        <Modal
          title="Invite someone"
          description="If they already have a Cabadra account, they get access straight away."
          onClose={() => setInviting(false)}
          onSubmit={handleInvite}
          footer={
            <>
              <button type="button" onClick={() => setInviting(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={submitting || !email.trim()} className={btnPrimary}>{submitting ? 'Checking…' : 'Give access'}</button>
            </>
          }
        >
          <Field label="Email"><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@example.com" className={inputCls} autoFocus /></Field>
          <Field label="Role">
            <select value={role} onChange={e => setRole(e.target.value as 'owner' | 'receptionist')} className={inputCls}>
              <option value="receptionist">Reception</option>
              <option value="owner">Owner</option>
            </select>
          </Field>
          {message && !noAccountFor && <ErrorNote>{message.text}</ErrorNote>}
          {noAccountFor && (
            <div className="rounded-2xl bg-surface-container p-4">
              <p className="text-sm text-on-surface">
                No account for <span className="font-medium">{noAccountFor.email}</span> yet. Send them an invite email instead?
              </p>
              <button type="button" onClick={handleSendInviteEmail} disabled={sendingInvite} className={`${btnPrimary} mt-3`}>
                {sendingInvite ? 'Sending…' : 'Send invite email'}
              </button>
            </div>
          )}
        </Modal>
      )}
    </Panel>
  );
}

const DEPT_LABELS = DEPARTMENT_LABELS;

/** Names and phone numbers per department for Live Ops tasks; not logins. Each has a badge QR for starting shifts. */
function ContactsPanel({ propertyId }: { propertyId: string }) {
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  // The person being edited; null while adding a new one.
  const [editing, setEditing] = useState<DirectoryContact | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', department: 'housekeeping' as DirectoryContact['department'], jobTitle: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badgeContact, setBadgeContact] = useState<DirectoryContact | null>(null);
  // The department being looked at, as in Reception's Departments.
  const [dept, setDept] = useState<DirectoryContact['department'] | null>(null);

  const reload = () => fetchStaffDirectory(propertyId).then(list => { setContacts(list); setDept(d => d ?? DEPARTMENTS.find(x => list.some(c => c.department === x.value))?.value ?? null); }).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [propertyId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const contact = { name: form.name.trim(), phone: form.phone.trim(), department: form.department, jobTitle: form.jobTitle };
      if (editing) await updateDirectoryContact(editing.id, contact);
      else await addDirectoryContact(propertyId, contact);
      setForm({ name: '', phone: '', department: form.department, jobTitle: '' });
      setEditing(null);
      setAdding(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contact.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deleteDirectoryContact(id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove contact.');
    }
  };

  return (
    <Panel>
      <SectionHeader
        title="Department staff"
        description="Who gets each department's tasks. They start a shift by scanning their badge, with no login."
        actions={<button onClick={() => { setEditing(null); setForm(f => ({ ...f, name: '', phone: '', jobTitle: '', department: dept ?? f.department })); setAdding(true); setError(null); }} className={btnSecondary}><Plus className="size-4" /> Add person</button>}
      />
      {!adding && error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}
      {loading ? null : (() => {
        const current = dept ?? (DEPARTMENTS.find(d => contacts.some(c => c.department === d.value))?.value ?? DEPARTMENTS[0].value);
        const inDept = contacts.filter(c => c.department === current);
        return (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 mb-3" role="tablist" aria-label="Departments">
              {DEPARTMENTS.map(d => {
                const n = contacts.filter(c => c.department === d.value).length;
                const on = d.value === current;
                return (
                  <button
                    key={d.value}
                    role="tab"
                    aria-selected={on}
                    onClick={() => setDept(d.value)}
                    className={`h-10 px-4 rounded-full text-sm font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${on ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface hover:bg-surface-container'}`}
                  >
                    {d.label}
                    {n > 0 && <span className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center ${on ? 'bg-surface-container-lowest text-on-surface' : 'bg-primary text-on-primary'}`}>{n}</span>}
                  </button>
                );
              })}
            </div>
            {inDept.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-3">No one in {DEPT_LABELS[current].toLowerCase()} yet. Use “Add person” to add them.</p>
            ) : (
              <div className="divide-y divide-outline-variant -my-1">
                {inDept.map(c => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <span className="size-9 shrink-0 rounded-full bg-surface-container-low flex items-center justify-center text-sm font-semibold text-on-surface">{c.name.charAt(0).toUpperCase()}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-on-surface truncate">{c.name}{c.jobTitle && <span className="text-on-surface-variant"> · {c.jobTitle}</span>}</p>
                      <p className="text-xs text-on-surface-variant">{c.phone}</p>
                    </div>
                    <button
                      onClick={() => { setEditing(c); setForm({ name: c.name, phone: c.phone, department: c.department, jobTitle: c.jobTitle ?? '' }); setError(null); setAdding(true); }}
                      className={iconBtn}
                      title="Edit"
                      aria-label={`Edit ${c.name}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button onClick={() => setBadgeContact(c)} className={iconBtn} title="Badge QR" aria-label={`Badge QR for ${c.name}`}>
                      <QrCode className="size-4" />
                    </button>
                    <DeleteButton onDelete={() => handleDelete(c.id)} label="Remove" />
                  </div>
                ))}
              </div>
            )}
          </>
        );
      })()}

      {adding && (
        <Modal
          title={editing ? `Edit ${editing.name}` : 'Add a person'}
          onClose={() => setAdding(false)}
          onSubmit={handleAdd}
          footer={
            <>
              <button type="button" onClick={() => setAdding(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={submitting || !form.name.trim() || !form.phone.trim()} className={btnPrimary}>{submitting ? 'Saving…' : editing ? 'Save' : 'Add'}</button>
            </>
          }
        >
          <Field label="Name"><input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Priya" className={inputCls} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><input required type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" className={inputCls} /></Field>
            <Field label="Department">
              <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value as DirectoryContact['department'] }))} className={inputCls}>
                {(Object.keys(DEPT_LABELS) as DirectoryContact['department'][]).map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Job title (optional)" hint="Shown on their welcome card when they start a shift.">
            <input value={form.jobTitle} onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))} maxLength={60} placeholder="Supervisor" className={inputCls} />
          </Field>
          <ErrorNote>{error}</ErrorNote>
        </Modal>
      )}

      {badgeContact && <BadgeQrModal contact={badgeContact} onClose={() => setBadgeContact(null)} onRegenerated={reload} />}
    </Panel>
  );
}
