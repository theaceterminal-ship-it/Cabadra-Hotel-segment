import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { GuestCrmEntry } from '../types';
import { fetchGuestCrmDirectory } from '../lib/staffApi';
import { formatCurrency } from '../lib/currency';
import { RoomFolioModal } from './RoomFolioModal';
import { Users, Search, Download, Filter, FileText, ExternalLink, RefreshCw, Star, Phone, Mail, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface GuestCrmViewProps {
  propertyId: string;
  propertyName: string;
  currency: string;
  upiId?: string;
  onRefreshRooms?: () => void;
}

export function GuestCrmView({ propertyId, propertyName, currency, upiId, onRefreshRooms }: GuestCrmViewProps) {
  const [entries, setEntries] = useState<GuestCrmEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [selectedDocUrl, setSelectedDocUrl] = useState<string | null>(null);
  const [selectedFolioResId, setSelectedFolioResId] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadDirectory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGuestCrmDirectory(
        propertyId,
        search,
        statusFilter,
        startDate || undefined,
        endDate || undefined
      );
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load guest CRM directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory();
  }, [propertyId, statusFilter, startDate, endDate]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadDirectory();
  };

  const handleExportCsv = () => {
    if (entries.length === 0) return;
    const csvData = entries.map(e => ({
      'Guest Name': e.guestName,
      'Room Number': e.roomNumber,
      'Room Category': e.roomType,
      'Phone': e.guestPhone,
      'Email': e.guestEmail,
      'Check-In': new Date(e.checkIn).toLocaleString(),
      'Check-Out': new Date(e.checkOut).toLocaleString(),
      'Status': e.status,
      'VIP': e.vip ? 'Yes' : 'No',
      'Total Spend': `${e.totalSpend} ${currency}`,
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${propertyName.toLowerCase().replace(/\s+/g, '_')}_guest_crm_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyLink = (token?: string) => {
    if (!token) return;
    const url = `${window.location.origin}/guest/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 3000);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Title Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-on-surface">Guest CRM &amp; Check-In Directory</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
              {entries.length} Records
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-1">
            Search guest history, check-in logs, contact info, uploaded ID documents, and stay spending.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={entries.length === 0}
            className="h-9 px-3.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export to CSV</span>
          </button>
          <button
            type="button"
            onClick={loadDirectory}
            disabled={loading}
            className="h-9 px-3.5 rounded-xl border border-outline-variant text-xs font-semibold text-on-surface hover:bg-surface-container-low flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-100 border border-red-300 text-red-800 rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant shadow-2xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search guest name, phone, email, or room #..."
              className="w-full h-10 pl-9 pr-3 text-xs border border-outline-variant rounded-xl focus:border-primary focus:outline-none bg-surface-container-lowest"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="h-10 px-3 text-xs border border-outline-variant rounded-xl bg-surface-container-low font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="checked_in">Checked In</option>
              <option value="checked_out">Checked Out</option>
              <option value="upcoming">Upcoming</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="h-10 px-3 text-xs border border-outline-variant rounded-xl bg-surface-container-low font-medium"
            />
            <span className="text-xs text-on-surface-variant">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="h-10 px-3 text-xs border border-outline-variant rounded-xl bg-surface-container-low font-medium"
            />

            <button
              type="submit"
              className="h-10 px-4 rounded-xl bg-surface-container-high border border-outline-variant text-xs font-bold hover:bg-surface-container-highest cursor-pointer"
            >
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Directory Table */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-2xs overflow-hidden">
        {loading && entries.length === 0 ? (
          <div className="text-center py-12 text-xs text-on-surface-variant">
            Loading guest directory...
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-8 h-8 text-on-surface-variant opacity-30 mx-auto mb-2" />
            <p className="text-xs font-bold text-on-surface">No guest records found</p>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              Try adjusting your search terms or date filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/60 text-on-surface-variant font-bold text-[11px] uppercase tracking-wider">
                  <th className="p-3.5 pl-5">Guest Name</th>
                  <th className="p-3.5">Room</th>
                  <th className="p-3.5">Contact Details</th>
                  <th className="p-3.5">Check-In / Out</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Total Spend</th>
                  <th className="p-3.5 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40">
                {entries.map(e => (
                  <tr key={e.reservationId} className="hover:bg-surface-container-low/50 transition-colors">
                    {/* Guest Name & VIP Badge */}
                    <td className="p-3.5 pl-5 font-bold text-on-surface">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{e.guestName}</span>
                        {e.vip && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold text-[9px]">
                            <Star className="w-2.5 h-2.5 fill-amber-500" /> VIP
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Room & Category */}
                    <td className="p-3.5 font-semibold text-on-surface">
                      <span className="text-xs font-extrabold block">Room {e.roomNumber}</span>
                      <span className="text-[10px] text-primary block mt-0.5">{e.roomType}</span>
                    </td>

                    {/* Contact Phone & Email */}
                    <td className="p-3.5 space-y-0.5 text-on-surface-variant text-[11px]">
                      {e.guestPhone && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-gray-400" />
                          <span>{e.guestPhone}</span>
                        </div>
                      )}
                      {e.guestEmail && (
                        <div className="flex items-center gap-1 truncate max-w-[180px]">
                          <Mail className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate">{e.guestEmail}</span>
                        </div>
                      )}
                    </td>

                    {/* Dates */}
                    <td className="p-3.5 space-y-0.5 text-[11px]">
                      <div className="text-on-surface font-semibold">
                        In: {new Date(e.checkIn).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-on-surface-variant">
                        Out: {new Date(e.checkOut).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </div>
                    </td>

                    {/* Status Pill */}
                    <td className="p-3.5">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold capitalize ${
                          e.status === 'checked_in'
                            ? 'bg-emerald-100 text-emerald-800'
                            : e.status === 'checked_out'
                            ? 'bg-blue-100 text-blue-800'
                            : e.status === 'upcoming'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {e.status.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Total Spend */}
                    <td className="p-3.5 font-extrabold text-primary text-sm">
                      {formatCurrency(e.totalSpend, currency)}
                    </td>

                    {/* Quick Actions */}
                    <td className="p-3.5 pr-5 text-right space-x-1.5">
                      {e.guestIdDocumentUrl && (
                        <button
                          type="button"
                          onClick={() => setSelectedDocUrl(e.guestIdDocumentUrl ?? null)}
                          className="px-2.5 py-1 rounded-lg border border-outline-variant text-[11px] font-bold text-on-surface hover:bg-surface-container-low cursor-pointer"
                          title="View Guest ID Photo"
                        >
                          ID Photo
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedFolioResId(e.reservationId)}
                        className="px-2.5 py-1 rounded-lg border border-primary text-primary text-[11px] font-bold hover:bg-highlight cursor-pointer"
                        title="View Guest Folio & Bill"
                      >
                        Folio
                      </button>

                      {e.guestToken && (
                        <button
                          type="button"
                          onClick={() => handleCopyLink(e.guestToken)}
                          className="px-2.5 py-1 rounded-lg bg-surface-container-high border border-outline-variant text-[11px] font-bold text-on-surface hover:bg-surface-container-highest cursor-pointer"
                          title="Copy Guest App Link"
                        >
                          {copiedToken === e.guestToken ? 'Copied ✓' : 'Copy Link'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Guest ID Photo Modal */}
      {selectedDocUrl && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150" onClick={() => setSelectedDocUrl(null)}>
          <div className="bg-surface-container-lowest rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-outline-variant space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-2 border-b border-outline-variant">
              <h3 className="text-sm font-bold text-on-surface">Guest ID Document / Passport</h3>
              <button type="button" onClick={() => setSelectedDocUrl(null)} className="text-gray-400 hover:text-gray-600 text-lg font-bold cursor-pointer">&times;</button>
            </div>
            <div className="max-h-[70vh] overflow-hidden rounded-xl border border-outline-variant bg-black">
              <img src={selectedDocUrl} alt="Guest ID Document" className="w-full h-full object-contain mx-auto" />
            </div>
            <div className="text-right">
              <button type="button" onClick={() => setSelectedDocUrl(null)} className="h-8 px-4 rounded-lg bg-primary text-on-primary text-xs font-bold">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Guest Folio Modal */}
      {selectedFolioResId && (
        <RoomFolioModal
          reservationId={selectedFolioResId}
          roomNumber={entries.find(e => e.reservationId === selectedFolioResId)?.roomNumber || '?'}
          guestName={entries.find(e => e.reservationId === selectedFolioResId)?.guestName}
          guestPhone={entries.find(e => e.reservationId === selectedFolioResId)?.guestPhone}
          guestEmail={entries.find(e => e.reservationId === selectedFolioResId)?.guestEmail}
          propertyName={propertyName}
          currency={currency}
          upiId={upiId}
          onClose={() => setSelectedFolioResId(null)}
          onCheckedOut={() => {
            setSelectedFolioResId(null);
            loadDirectory();
            if (onRefreshRooms) onRefreshRooms();
          }}
        />
      )}
    </div>
  );
}
