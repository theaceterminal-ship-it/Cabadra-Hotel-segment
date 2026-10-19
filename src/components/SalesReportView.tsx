import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { SalesReportData } from '../types';
import { fetchSalesReport } from '../lib/staffApi';
import { formatCurrency } from '../lib/currency';
import { TrendingUp, Calendar, Download, RefreshCw, DollarSign, UtensilsCrossed, Sparkles, CreditCard, Banknote, QrCode, BedDouble, CheckCircle2 } from 'lucide-react';

interface SalesReportViewProps {
  propertyId: string;
  propertyName: string;
  currency: string;
}

export function SalesReportView({ propertyId, propertyName, currency }: SalesReportViewProps) {
  const [report, setReport] = useState<SalesReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getLocalDateString = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = getLocalDateString(new Date());

  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  const applyPreset = (preset: 'today' | 'yesterday' | 'week' | 'month') => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === 'today') {
      setStartDate(getLocalDateString(now));
      setEndDate(getLocalDateString(now));
    } else if (preset === 'yesterday') {
      const y = new Date(now.getTime() - 86400000);
      setStartDate(getLocalDateString(y));
      setEndDate(getLocalDateString(y));
    } else if (preset === 'week') {
      const w = new Date(now.getTime() - 7 * 86400000);
      setStartDate(getLocalDateString(w));
      setEndDate(getLocalDateString(now));
    } else if (preset === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(getLocalDateString(m));
      setEndDate(getLocalDateString(now));
    }
  };

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSalesReport(propertyId, startDate, endDate);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [propertyId, startDate, endDate]);

  const handleExportCsv = () => {
    if (!report) return;
    const csvData = [
      { Metric: 'Report Period', Value: `${report.startDate} to ${report.endDate}` },
      { Metric: 'Total Gross Revenue', Value: `${report.totalSales} ${currency}` },
      { Metric: 'Room Night Revenue', Value: `${report.roomSales} ${currency}` },
      { Metric: 'Room Dining Revenue', Value: `${report.diningSales} ${currency}` },
      { Metric: 'Curated Experience Revenue', Value: `${report.experienceSales} ${currency}` },
      { Metric: 'Extra Services Revenue', Value: `${report.otherSales} ${currency}` },
      { Metric: 'Cash Settlement Total', Value: `${report.cashSales} ${currency}` },
      { Metric: 'Card Settlement Total', Value: `${report.cardSales} ${currency}` },
      { Metric: 'UPI Settlement Total', Value: `${report.upiSales} ${currency}` },
      { Metric: 'Total Check-ins Processed', Value: report.checkinsCount },
      { Metric: 'Total Completed Dining Orders', Value: report.completedOrdersCount },
    ];

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${propertyName.toLowerCase().replace(/\s+/g, '_')}_sales_report_${report.startDate}_to_${report.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-on-surface">Sales &amp; Revenue Reports</h1>
          </div>
          <p className="text-xs text-on-surface-variant mt-1">
            Itemized revenue reports, category breakdowns, and payment method settlement ledgers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!report}
            className="h-9 px-3.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Sales Ledger</span>
          </button>
          <button
            type="button"
            onClick={loadReport}
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

      {/* Date Range Preset Selector */}
      <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => applyPreset('today')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              datePreset === 'today' ? 'bg-primary text-on-primary shadow-2xs' : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => applyPreset('yesterday')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              datePreset === 'yesterday' ? 'bg-primary text-on-primary shadow-2xs' : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
            }`}
          >
            Yesterday
          </button>
          <button
            type="button"
            onClick={() => applyPreset('week')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              datePreset === 'week' ? 'bg-primary text-on-primary shadow-2xs' : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
            }`}
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => applyPreset('month')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              datePreset === 'month' ? 'bg-primary text-on-primary shadow-2xs' : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
            }`}
          >
            This Month
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4 text-on-surface-variant shrink-0" />
          <input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setDatePreset('custom'); }}
            className="h-9 px-3 text-xs border border-outline-variant rounded-xl bg-surface-container-low font-medium"
          />
          <span className="text-xs text-on-surface-variant font-bold">to</span>
          <input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setDatePreset('custom'); }}
            className="h-9 px-3 text-xs border border-outline-variant rounded-xl bg-surface-container-low font-medium"
          />
        </div>
      </div>

      {loading && !report ? (
        <div className="text-center py-12 text-xs text-on-surface-variant">
          Calculating sales ledger...
        </div>
      ) : report ? (
        <div className="space-y-6">
          {/* Main Total Sales Banner */}
          <div className="bg-gradient-to-r from-primary to-primary-hover text-on-primary p-6 rounded-3xl shadow-md flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider opacity-80 block">
                Total Net Sales ({report.startDate} to {report.endDate})
              </span>
              <h2 className="text-3xl sm:text-4xl font-black mt-1">
                {formatCurrency(report.totalSales, currency)}
              </h2>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-xs opacity-80 block">Check-ins</span>
                <span className="text-xl font-bold">{report.checkinsCount} Guests</span>
              </div>
              <div className="text-right">
                <span className="text-xs opacity-80 block">Dining Orders</span>
                <span className="text-xl font-bold">{report.completedOrdersCount} Served</span>
              </div>
            </div>
          </div>

          {/* Revenue Category Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="text-xs font-bold uppercase">Room Night Sales</span>
                <BedDouble className="w-5 h-5 text-primary" />
              </div>
              <p className="text-2xl font-black text-on-surface">
                {formatCurrency(report.roomSales, currency)}
              </p>
              <p className="text-[11px] text-on-surface-variant">
                {report.checkinsCount} guest stay{report.checkinsCount === 1 ? '' : 's'}
              </p>
            </div>

            <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="text-xs font-bold uppercase">Room Service Dining</span>
                <UtensilsCrossed className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-2xl font-black text-on-surface">
                {formatCurrency(report.diningSales, currency)}
              </p>
              <p className="text-[11px] text-on-surface-variant">
                {report.completedOrdersCount} kitchen order{report.completedOrdersCount === 1 ? '' : 's'}
              </p>
            </div>

            <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="text-xs font-bold uppercase">Curated Experiences</span>
                <Sparkles className="w-5 h-5 text-amber-500" />
              </div>
              <p className="text-2xl font-black text-on-surface">
                {formatCurrency(report.experienceSales, currency)}
              </p>
              <p className="text-[11px] text-on-surface-variant">
                Confirmed tours, spa &amp; activities
              </p>
            </div>

            <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="text-xs font-bold uppercase">Extra Services</span>
                <DollarSign className="w-5 h-5 text-indigo-500" />
              </div>
              <p className="text-2xl font-black text-on-surface">
                {formatCurrency(report.otherSales, currency)}
              </p>
              <p className="text-[11px] text-on-surface-variant">
                Laundry, transfers &amp; minibar
              </p>
            </div>
          </div>

          {/* Payment Settlement Methods */}
          <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant shadow-2xs space-y-4">
            <h3 className="text-sm font-bold text-on-surface">Settled Payment Method Ledger</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/60 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-on-surface-variant block">Cash Receipts</span>
                  <span className="text-xl font-extrabold text-on-surface">{formatCurrency(report.cashSales, currency)}</span>
                </div>
                <Banknote className="w-8 h-8 text-emerald-600 opacity-80" />
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/60 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-on-surface-variant block">Card Settlements</span>
                  <span className="text-xl font-extrabold text-on-surface">{formatCurrency(report.cardSales, currency)}</span>
                </div>
                <CreditCard className="w-8 h-8 text-blue-600 opacity-80" />
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/60 flex items-center justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-on-surface-variant block">UPI Payments</span>
                  <span className="text-xl font-extrabold text-on-surface">{formatCurrency(report.upiSales, currency)}</span>
                </div>
                <QrCode className="w-8 h-8 text-purple-600 opacity-80" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
