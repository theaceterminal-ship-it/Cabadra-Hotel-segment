import React, { useState, useEffect } from 'react';
import { StaffExperienceBooking } from '../types';
import { fetchStaffExperienceBookings, confirmExperienceBooking, cancelExperienceBooking } from '../lib/staffApi';
import { formatCurrency } from '../lib/currency';
import { Calendar, Clock, Users, CheckCircle2, XCircle, Sparkles, RefreshCw, MessageSquare } from 'lucide-react';

interface ReservedExperiencesViewProps {
  propertyId: string;
  currency: string;
}

export function ReservedExperiencesView({ propertyId, currency }: ReservedExperiencesViewProps) {
  const [bookings, setBookings] = useState<StaffExperienceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'confirmed' | 'all'>('pending');

  // Scheduling Modal State
  const [schedulingBooking, setSchedulingBooking] = useState<StaffExperienceBooking | null>(null);
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [scheduleTimeSlot, setScheduleTimeSlot] = useState('16:30');
  const [scheduledTime, setScheduledTime] = useState('');
  const [chargeFolio, setChargeFolio] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const updateFormattedTime = (dateStr: string, timeStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);
      const d = new Date(year, month - 1, day, hours, minutes);
      const today = new Date();
      const isToday = d.toDateString() === today.toDateString();
      const isTomorrow = new Date(today.getTime() + 86400000).toDateString() === d.toDateString();

      const timeFormatted = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const dayPrefix = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });

      setScheduledTime(`${dayPrefix} at ${timeFormatted}`);
    } catch {
      setScheduledTime(`${dateStr} ${timeStr}`);
    }
  };

  const openScheduler = (b: StaffExperienceBooking) => {
    setSchedulingBooking(b);
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = '16:30';
    setScheduleDate(dateStr);
    setScheduleTimeSlot(timeStr);
    updateFormattedTime(dateStr, timeStr);
    setChargeFolio(true);
  };

  // Cancellation State
  const [cancellingBooking, setCancellingBooking] = useState<StaffExperienceBooking | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const loadBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStaffExperienceBookings(propertyId);
      setBookings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load experience bookings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
    const interval = setInterval(loadBookings, 15000);
    return () => clearInterval(interval);
  }, [propertyId]);

  const pendingBookings = bookings.filter(b => b.status === 'pending' || b.status === 'requested');
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  const otherBookings = bookings.filter(b => b.status === 'completed' || b.status === 'cancelled');

  const filteredBookings =
    activeTab === 'pending'
      ? pendingBookings
      : activeTab === 'confirmed'
      ? confirmedBookings
      : bookings;

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingBooking || !scheduledTime.trim()) return;
    setSubmitting(true);
    try {
      await confirmExperienceBooking(propertyId, schedulingBooking.id, scheduledTime.trim(), chargeFolio);
      setSchedulingBooking(null);
      setScheduledTime('');
      loadBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule booking.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingBooking) return;
    setSubmitting(true);
    try {
      await cancelExperienceBooking(propertyId, cancellingBooking.id, cancelReason);
      setCancellingBooking(null);
      setCancelReason('');
      loadBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel booking.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-on-surface">Reserved Experiences</h1>
            {pendingBookings.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-primary text-on-primary text-xs font-semibold animate-pulse">
                {pendingBookings.length} Pending
              </span>
            )}
          </div>
          <p className="text-xs text-on-surface-variant mt-1">
            Review guest experience requests, set scheduled time slots, and confirm bookings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadBookings}
            disabled={loading}
            className="h-9 px-3 rounded-xl border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container-low flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-error/10 border border-error/30 text-error rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-outline-variant pb-2">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'pending'
              ? 'bg-primary text-on-primary shadow-2xs'
              : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
          }`}
        >
          Pending ({pendingBookings.length})
        </button>
        <button
          onClick={() => setActiveTab('confirmed')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'confirmed'
              ? 'bg-primary text-on-primary shadow-2xs'
              : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
          }`}
        >
          Scheduled / Confirmed ({confirmedBookings.length})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'bg-primary text-on-primary shadow-2xs'
              : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
          }`}
        >
          All History ({bookings.length})
        </button>
      </div>

      {/* Bookings Grid */}
      {loading && bookings.length === 0 ? (
        <div className="text-center py-12 text-xs text-on-surface-variant">
          Loading experience reservations...
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="text-center py-12 bg-surface-container-lowest rounded-2xl border border-outline-variant">
          <Sparkles className="w-8 h-8 text-on-surface-variant opacity-30 mx-auto mb-2" />
          <p className="text-xs font-semibold text-on-surface">No reservations in this tab</p>
          <p className="text-[11px] text-on-surface-variant mt-0.5">
            When guests reserve curated experiences from their room app, requests appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBookings.map(b => (
            <div
              key={b.id}
              className={`p-4 rounded-2xl border text-xs flex flex-col justify-between space-y-3 transition-all ${
                b.status === 'pending' || b.status === 'requested'
                  ? 'border-primary/40 bg-highlight shadow-sm'
                  : b.status === 'confirmed'
                  ? 'border-success/30 bg-success/5'
                  : 'border-outline-variant bg-surface-container-lowest'
              }`}
            >
              <div className="space-y-2">
                {/* Guest & Room Badge */}
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full bg-primary text-on-primary text-[10px] font-semibold tracking-wide">
                    Room {b.roomNumber}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                      b.status === 'pending' || b.status === 'requested'
                        ? 'bg-warning/15 text-warning'
                        : b.status === 'confirmed'
                        ? 'bg-success/15 text-success'
                        : b.status === 'completed'
                        ? 'bg-surface-container-high text-on-surface'
                        : 'bg-error/10 text-error'
                    }`}
                  >
                    {b.status}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-on-surface">{b.experienceName}</h3>
                  <p className="text-[11px] text-on-surface-variant font-semibold">Guest: {b.guestName}</p>
                </div>

                {/* Details Pills */}
                <div className="space-y-1 pt-1 border-t border-outline-variant/60 text-[11px]">
                  <div className="flex items-center gap-1.5 text-on-surface">
                    <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>Party Size: <strong>{b.guestCount} guests</strong> ({b.unitLabel || 'per person'})</span>
                  </div>

                  {b.preferredTime && (
                    <div className="flex items-center gap-1.5 text-on-surface">
                      <Clock className="w-3.5 h-3.5 text-warning shrink-0" />
                      <span>Preferred Time: <strong>{b.preferredTime}</strong></span>
                    </div>
                  )}

                  {b.scheduledTime && (
                    <div className="flex items-center gap-1.5 text-success font-semibold">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span>Confirmed Slot: {b.scheduledTime}</span>
                    </div>
                  )}

                  {b.notes && (
                    <div className="flex items-start gap-1.5 text-on-surface-variant bg-surface-container-low p-2 rounded-lg mt-1">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 text-on-surface-variant" />
                      <p className="italic">"{b.notes}"</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Total & Actions */}
              <div className="pt-3 border-t border-outline-variant flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] text-on-surface-variant block uppercase font-semibold">Total Amount</span>
                  <span className="text-sm font-semibold text-primary">
                    {formatCurrency(b.totalPrice, currency)}
                  </span>
                </div>

                {(b.status === 'pending' || b.status === 'requested') && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCancellingBooking(b)}
                      className="px-2.5 py-1.5 rounded-lg border border-outline-variant text-error text-[11px] font-semibold hover:bg-error/10 transition-colors cursor-pointer"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => openScheduler(b)}
                      className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-[11px] font-semibold hover:bg-primary-hover transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Confirm &amp; Schedule
                    </button>
                  </div>
                )}

                {b.status === 'confirmed' && (
                  <button
                    type="button"
                    onClick={() => openScheduler(b)}
                    className="px-2.5 py-1.5 rounded-lg border border-outline-variant text-xs font-semibold hover:bg-surface-container-low cursor-pointer"
                  >
                    Reschedule
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm & Schedule Modal with Date & Time Picker */}
      {schedulingBooking && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <form onSubmit={handleConfirmSubmit} className="bg-surface-container-lowest rounded-2xl max-w-md w-full p-6 shadow-2xl border border-outline-variant space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-base font-semibold text-on-surface flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <span>Confirm &amp; Schedule Experience</span>
              </h3>
              <button
                type="button"
                onClick={() => setSchedulingBooking(null)}
                className="text-on-surface-variant hover:text-on-surface text-lg font-semibold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-3 bg-surface-container-low rounded-xl text-xs space-y-1">
              <p className="font-semibold text-on-surface">{schedulingBooking.experienceName}</p>
              <p className="text-on-surface-variant">
                Room {schedulingBooking.roomNumber} · {schedulingBooking.guestName} ({schedulingBooking.guestCount} guests)
              </p>
              <p className="text-primary font-semibold">Total: {formatCurrency(schedulingBooking.totalPrice, currency)}</p>
            </div>

            {/* Date & Time Picker Scheduler */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-on-surface block mb-1">
                  Select Scheduled Date *
                </label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={e => {
                    setScheduleDate(e.target.value);
                    updateFormattedTime(e.target.value, scheduleTimeSlot);
                  }}
                  className="w-full h-10 px-3 text-xs border border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container-lowest font-medium"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-on-surface block mb-1">
                  Select Time Slot *
                </label>
                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {['09:00', '11:00', '14:00', '16:30', '18:30', '20:00'].map(slot => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => {
                        setScheduleTimeSlot(slot);
                        updateFormattedTime(scheduleDate, slot);
                      }}
                      className={`h-8 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        scheduleTimeSlot === slot
                          ? 'bg-primary text-on-primary border-primary'
                          : 'bg-surface-container-low border-outline-variant text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
                <input
                  type="time"
                  value={scheduleTimeSlot}
                  onChange={e => {
                    setScheduleTimeSlot(e.target.value);
                    updateFormattedTime(scheduleDate, e.target.value);
                  }}
                  className="w-full h-9 px-3 text-xs border border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container-lowest font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-on-surface block mb-1">
                  Confirmed Slot Label (Sent to Guest) *
                </label>
                <input
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  placeholder="e.g. Today at 4:30 PM"
                  className="w-full h-10 px-3 text-xs border border-outline-variant rounded-xl font-semibold text-primary focus:border-primary focus:outline-none bg-surface-container-lowest"
                  required
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={chargeFolio}
                onChange={e => setChargeFolio(e.target.checked)}
                className="accent-primary w-4 h-4"
              />
              <span>Post charge of {formatCurrency(schedulingBooking.totalPrice, currency)} to Room Folio</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSchedulingBooking(null)}
                className="flex-1 h-9 rounded-xl border border-outline-variant text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 h-9 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover disabled:opacity-50 shadow-2xs"
              >
                {submitting ? 'Confirming…' : 'Confirm & Schedule'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cancellation Modal */}
      {cancellingBooking && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <form onSubmit={handleCancelSubmit} className="bg-surface-container-lowest rounded-2xl max-w-md w-full p-6 shadow-2xl border border-outline-variant space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-base font-semibold text-on-surface">Decline Experience Request</h3>
              <button
                type="button"
                onClick={() => setCancellingBooking(null)}
                className="text-on-surface-variant hover:text-on-surface text-lg font-semibold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-on-surface-variant">
              Decline reservation request for <strong>{cancellingBooking.experienceName}</strong> (Room {cancellingBooking.roomNumber})?
            </p>

            <div>
              <label className="text-xs font-semibold text-on-surface block mb-1">Reason (Optional)</label>
              <input
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. Fully booked for chosen slot, bad weather..."
                className="w-full h-10 px-3 text-xs border border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container-lowest"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancellingBooking(null)}
                className="flex-1 h-9 rounded-xl border border-outline-variant text-xs font-semibold text-on-surface-variant"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 h-9 rounded-xl bg-error text-on-error text-xs font-semibold hover:brightness-95 disabled:opacity-50 shadow-2xs"
              >
                {submitting ? 'Declining…' : 'Decline Request'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
