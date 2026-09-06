import React, { useState, useEffect } from 'react';
import { Property, AppView } from '../types';
import {
  fetchTicketSizeAnalytics,
  TicketSizeAnalytics,
  fetchPortfolioStats,
  PortfolioStats,
  fetchRevenueTrend,
  RevenueTrendPoint,
} from '../lib/staffApi';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  CreditCard,
  Receipt,
  ShoppingCart,
  Megaphone,
  AlertTriangle,
  ChevronDown,
  Building,
  FileText,
  CheckCircle2,
} from 'lucide-react';

interface OwnerOverviewProps {
  properties: Property[];
  onNavigate: (view: AppView) => void;
  onSelectProperty?: (propertyId: string) => void;
}

export const OwnerOverview: React.FC<OwnerOverviewProps> = ({
  properties,
  onNavigate,
  onSelectProperty,
}) => {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');
  const [selectedPropertyFilter, setSelectedPropertyFilter] = useState<string>('All Properties');
  const [activeChartMetric, setActiveChartMetric] = useState<'revenue' | 'orders'>('revenue');
  const [showReportModal, setShowReportModal] = useState(false);

  const primaryPropertyId = properties[0]?.id;
  const propertyIds = properties.map(p => p.id);

  // Live from Supabase's staff_ticket_size_analytics() — the direct proof
  // point for whether recommendations are actually moving ticket size, not
  // a mocked number. Scoped to the first property in the owner's portfolio;
  // a per-property selector is a natural next step once there's more than
  // one property with real order history to compare.
  const [ticketAnalytics, setTicketAnalytics] = useState<TicketSizeAnalytics | null>(null);
  useEffect(() => {
    if (!primaryPropertyId) return;
    fetchTicketSizeAnalytics(primaryPropertyId).then(setTicketAnalytics).catch(() => setTicketAnalytics(null));
  }, [primaryPropertyId]);

  // Portfolio-wide KPI totals — one aggregate query across every property
  // the owner is staff on, not per-property numbers stitched together
  // client-side.
  const [portfolioStats, setPortfolioStats] = useState<PortfolioStats | null>(null);
  useEffect(() => {
    if (propertyIds.length === 0) return;
    fetchPortfolioStats(propertyIds).then(setPortfolioStats).catch(() => setPortfolioStats(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyIds.join(',')]);

  const [revenueTrend, setRevenueTrend] = useState<RevenueTrendPoint[]>([]);
  useEffect(() => {
    if (!primaryPropertyId) return;
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    fetchRevenueTrend(primaryPropertyId, days).then(setRevenueTrend).catch(() => setRevenueTrend([]));
  }, [primaryPropertyId, timeRange]);

  return (
    <div id="owner-overview-canvas" className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E9ECEF]">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[#141d23]">Owner Overview</h1>
          <p className="text-sm text-[#4e463a] mt-1">Portfolio performance across all locations.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Property Dropdown Filter */}
          <div className="relative">
            <select
              id="select-property-filter"
              value={selectedPropertyFilter}
              onChange={(e) => setSelectedPropertyFilter(e.target.value)}
              className="h-11 px-4 pr-8 rounded-lg border border-[#E9ECEF] bg-white text-xs font-semibold text-[#141d23] shadow-2xs appearance-none cursor-pointer focus:outline-none focus:border-[#765a25]"
            >
              <option value="All Properties">All Properties ({properties.length})</option>
              {properties.map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[#7f7668] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Time Range Filter */}
          <div className="relative">
            <select
              id="select-timerange-filter"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="h-11 px-4 pr-8 rounded-lg border border-[#E9ECEF] bg-white text-xs font-semibold text-[#141d23] shadow-2xs appearance-none cursor-pointer focus:outline-none focus:border-[#765a25]"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
            <ChevronDown className="w-4 h-4 text-[#7f7668] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Quick jump to Properties grid */}
          <button
            id="btn-nav-properties-grid"
            onClick={() => onNavigate('properties')}
            className="h-11 px-4 rounded-lg bg-[#765a25] text-white text-xs font-semibold hover:bg-[#5c4210] transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <Building className="w-4 h-4" />
            <span>Manage Properties</span>
          </button>
        </div>
      </div>

      {/* 4 Metric KPI Cards — live from staff_portfolio_stats(), not fabricated.
          No "+N% vs last period" deltas: that needs a stored historical
          baseline this schema doesn't keep yet, so a plain number beats a
          made-up trend arrow. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        <div
          id="kpi-card-revenue"
          className="bg-white rounded-xl p-6 border border-[#E9ECEF] shadow-[0_4px_12px_rgba(0,0,0,0.02)] transition-transform hover:-translate-y-0.5"
        >
          <div className="flex justify-between items-start mb-3">
            <span className="text-xs font-semibold text-[#4e463a] uppercase tracking-wider">
              Total Revenue
            </span>
            <div className="p-2 bg-[#ecf5fe] rounded-lg text-[#765a25]">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl md:text-4xl font-bold text-[#141d23] tracking-tight">
            {portfolioStats ? `$${portfolioStats.totalRevenue.toLocaleString()}` : '—'}
          </div>
          <p className="mt-2 text-xs text-[#7f7668]">Across {properties.length} propert{properties.length === 1 ? 'y' : 'ies'}</p>
        </div>

        <div
          id="kpi-card-orders"
          className="bg-white rounded-xl p-6 border border-[#E9ECEF] shadow-[0_4px_12px_rgba(0,0,0,0.02)] transition-transform hover:-translate-y-0.5"
        >
          <div className="flex justify-between items-start mb-3">
            <span className="text-xs font-semibold text-[#4e463a] uppercase tracking-wider">
              Orders Today
            </span>
            <div className="p-2 bg-[#ecf5fe] rounded-lg text-[#765a25]">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl md:text-4xl font-bold text-[#141d23] tracking-tight">
            {portfolioStats ? portfolioStats.ordersToday.toLocaleString() : '—'}
          </div>
          <p className="mt-2 text-xs text-[#7f7668]">Room service, since midnight</p>
        </div>

        <div
          id="kpi-card-aov"
          className="bg-white rounded-xl p-6 border border-[#E9ECEF] shadow-[0_4px_12px_rgba(0,0,0,0.02)] transition-transform hover:-translate-y-0.5"
        >
          <div className="flex justify-between items-start mb-3">
            <span className="text-xs font-semibold text-[#4e463a] uppercase tracking-wider">
              Avg Order Value
            </span>
            <div className="p-2 bg-[#ecf5fe] rounded-lg text-[#765a25]">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl md:text-4xl font-bold text-[#141d23] tracking-tight">
            {portfolioStats ? `$${portfolioStats.avgOrderValue.toFixed(2)}` : '—'}
          </div>
          <p className="mt-2 text-xs text-[#7f7668]">All-time, all properties</p>
        </div>

        <div
          id="kpi-card-open-requests"
          className="bg-white rounded-xl p-6 border border-[#E9ECEF] shadow-[0_4px_12px_rgba(0,0,0,0.02)] transition-transform hover:-translate-y-0.5"
        >
          <div className="flex justify-between items-start mb-3">
            <span className="text-xs font-semibold text-[#4e463a] uppercase tracking-wider">
              Open Requests
            </span>
            <div className="p-2 bg-[#ecf5fe] rounded-lg text-[#765a25]">
              <Megaphone className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl md:text-4xl font-bold text-[#141d23] tracking-tight">
            {portfolioStats ? portfolioStats.openRequests : '—'}
          </div>
          <p className="mt-2 text-xs text-[#7f7668]">Unresolved guest requests</p>
        </div>
      </div>

      {/* Recommendation Engine Impact — live from Supabase, scoped to primaryPropertyId */}
      {ticketAnalytics && ticketAnalytics.ordersTotal > 0 && (
        <div
          id="recommendation-impact-card"
          className="bg-[#fff8ec] rounded-xl p-6 border border-[#f0dfb8] flex flex-col sm:flex-row sm:items-center gap-6 justify-between"
        >
          <div>
            <span className="text-xs font-semibold text-[#765a25] uppercase tracking-wider">
              Recommendation Engine Impact · {properties[0]?.name ?? ''}
            </span>
            <p className="text-xs text-[#7f7668] mt-1">
              Based on {ticketAnalytics.ordersTotal} live demo order{ticketAnalytics.ordersTotal === 1 ? '' : 's'} placed via Room Dining.
            </p>
          </div>
          <div className="flex items-center gap-8">
            <div>
              <div className="text-2xl font-bold text-[#2D6A4F]">
                ${ticketAnalytics.avgOrderValueWithRecommendation.toFixed(2)}
              </div>
              <div className="text-[11px] text-[#4e463a]">Avg order · with recommendation</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#141d23]">
                ${ticketAnalytics.avgOrderValueWithoutRecommendation.toFixed(2)}
              </div>
              <div className="text-[11px] text-[#4e463a]">Avg order · without</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Grid: Chart & Table on left (col-span-2) + Attention Required on right */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column (Spans 2 cols) */}
        <div className="xl:col-span-2 space-y-6">
          {/* Revenue Trends Interactive Chart */}
          <div 
            id="revenue-trends-card"
            className="bg-white rounded-xl p-6 border border-[#E9ECEF] shadow-[0_4px_12px_rgba(0,0,0,0.02)]"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="text-lg font-semibold text-[#141d23]">Revenue Trends</h3>
                <p className="text-xs text-[#4e463a]">Gross operating revenue daily breakdown</p>
              </div>

              <div className="flex items-center gap-2">
                {/* Metric toggle buttons */}
                <div className="flex bg-[#ecf5fe] p-1 rounded-lg border border-[#E9ECEF] text-xs">
                  <button
                    onClick={() => setActiveChartMetric('revenue')}
                    className={`px-3 py-1 rounded font-medium transition-colors ${
                      activeChartMetric === 'revenue' ? 'bg-white text-[#765a25] shadow-xs font-semibold' : 'text-[#4e463a]'
                    }`}
                  >
                    Revenue
                  </button>
                  <button
                    onClick={() => setActiveChartMetric('orders')}
                    className={`px-3 py-1 rounded font-medium transition-colors ${
                      activeChartMetric === 'orders' ? 'bg-white text-[#765a25] shadow-xs font-semibold' : 'text-[#4e463a]'
                    }`}
                  >
                    Orders
                  </button>
                </div>

                <button 
                  onClick={() => setShowReportModal(true)}
                  className="text-xs text-[#765a25] hover:underline font-semibold uppercase tracking-wider shrink-0 cursor-pointer ml-2"
                >
                  View Report
                </button>
              </div>
            </div>

            {/* Recharts Component — real data from staff_revenue_trend(), one row per day, zero-filled for days with no orders */}
            <div className="h-64 w-full">
              {revenueTrend.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-[#7f7668]">
                  No orders yet in this window.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#bd9b60" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#bd9b60" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f3f7" vertical={false} />
                    <XAxis dataKey="day" stroke="#7f7668" fontSize={12} tickLine={false} />
                    <YAxis
                      stroke="#7f7668"
                      fontSize={12}
                      tickLine={false}
                      tickFormatter={(val) => activeChartMetric === 'revenue' ? `$${val}` : val}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#E9ECEF', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(value: number) => [
                        activeChartMetric === 'revenue' ? `$${Number(value).toLocaleString()}` : `${value}`,
                        activeChartMetric === 'revenue' ? 'Revenue' : 'Orders'
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey={activeChartMetric}
                      stroke="#765a25"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#goldGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Property Performance Table */}
          <div 
            id="property-performance-table-card"
            className="bg-white rounded-xl border border-[#E9ECEF] shadow-[0_4px_12px_rgba(0,0,0,0.02)] overflow-hidden"
          >
            <div className="p-6 border-b border-[#E9ECEF] flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-[#141d23]">Property Performance</h3>
                <p className="text-xs text-[#4e463a]">Comparative operational yield across luxury units</p>
              </div>
              <button 
                onClick={() => onNavigate('properties')}
                className="text-xs text-[#765a25] font-semibold hover:underline"
              >
                All {properties.length} Propert{properties.length === 1 ? 'y' : 'ies'} &rarr;
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#ecf5fe] text-xs font-semibold text-[#4e463a] uppercase tracking-wider">
                    <th className="p-4">Property</th>
                    <th className="p-4 text-right">Revenue</th>
                    <th className="p-4 text-right">Orders</th>
                    <th className="p-4 text-right">Occupancy</th>
                    <th className="p-4 text-right">AOV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9ECEF] text-sm text-[#141d23]">
                  {properties.map((prop) => (
                    <tr 
                      key={prop.id}
                      id={`property-row-${prop.id}`}
                      onClick={() => {
                        if (onSelectProperty) onSelectProperty(prop.id);
                        onNavigate('reception');
                      }}
                      className="hover:bg-[#f6faff] transition-colors cursor-pointer group"
                    >
                      <td className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-[#E9ECEF] overflow-hidden shrink-0 border border-[#E9ECEF]">
                          <img 
                            src={prop.modelImage || prop.image} 
                            alt={prop.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>
                        <div>
                          <span className="font-semibold group-hover:text-[#765a25] transition-colors block">
                            {prop.name}
                          </span>
                          <span className="text-xs text-[#7f7668]">{prop.location}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right font-medium">{prop.totalRevenue}</td>
                      <td className="p-4 text-right font-medium">{prop.ordersToday.toLocaleString()}</td>
                      <td className="p-4 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                          prop.occupancy >= 85 ? 'bg-[#2D6A4F]/10 text-[#2D6A4F]' : 'bg-[#D4A373]/20 text-[#765a25]'
                        }`}>
                          {prop.occupancy}%
                        </span>
                      </td>
                      <td className="p-4 text-right font-medium">{prop.avgOrderValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Attention Required — real, from each property's open guest-request count (requestsCount, already fetched with the portfolio). No fabricated kitchen-SLA/maintenance alerts: this schema doesn't track ticket prep time or a maintenance-ticket age yet. */}
        <div className="space-y-6">
          <div
            id="attention-required-card"
            className="bg-white rounded-xl border border-[#E9ECEF] shadow-[0_4px_12px_rgba(0,0,0,0.02)] p-6"
          >
            <div className="flex items-center gap-2 mb-6 pb-2 border-b border-[#E9ECEF]">
              <AlertTriangle className="w-5 h-5 text-[#D4A373]" />
              <h3 className="text-lg font-semibold text-[#141d23]">Attention Required</h3>
              {(() => {
                const propertiesWithRequests = properties.filter(p => p.requestsCount > 0);
                return propertiesWithRequests.length > 0 ? (
                  <span className="ml-auto bg-[#ffdad6] text-[#93000a] text-xs font-bold px-2 py-0.5 rounded-full">
                    {propertiesWithRequests.length} Propert{propertiesWithRequests.length === 1 ? 'y' : 'ies'}
                  </span>
                ) : null;
              })()}
            </div>

            <div className="space-y-4">
              {properties.filter(p => p.requestsCount > 0).length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <CheckCircle2 className="w-8 h-8 text-[#2D6A4F]" />
                  <p className="text-xs font-semibold text-[#4e463a]">All caught up — no open requests.</p>
                </div>
              ) : (
                properties.filter(p => p.requestsCount > 0).map(p => (
                  <div
                    key={p.id}
                    id={`alert-requests-${p.id}`}
                    className="p-4 rounded-lg bg-[#ffdad6]/20 border border-[#ffdad6]"
                  >
                    <div className="flex gap-3">
                      <Megaphone className="w-5 h-5 text-[#BC4749] shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-[#141d23] uppercase tracking-wider">{p.name}</h4>
                        <p className="text-xs text-[#4e463a] mt-1 leading-relaxed">
                          {p.requestsCount} unresolved guest request{p.requestsCount === 1 ? '' : 's'}.
                        </p>
                        <button
                          onClick={() => { if (onSelectProperty) onSelectProperty(p.id); onNavigate('properties'); }}
                          className="mt-2 text-xs font-semibold text-[#765a25] uppercase tracking-wider hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <span>View Property</span> &rarr;
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Executive Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#E9ECEF]">
            <div className="flex items-center justify-between pb-4 border-b border-[#E9ECEF]">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#765a25]" />
                <h3 className="font-semibold text-lg text-[#141d23]">Portfolio Report</h3>
              </div>
              <button onClick={() => setShowReportModal(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">
                &times;
              </button>
            </div>
            <div className="py-4 space-y-3 text-xs text-[#4e463a]">
              <p className="leading-relaxed">
                Room-service revenue and occupancy across your {properties.length} propert{properties.length === 1 ? 'y' : 'ies'}, as of right now. This is room-dining F&amp;B revenue only — room-night/booking revenue isn't tracked in Cabadra yet.
              </p>
              <div className="bg-[#f6faff] p-3 rounded-lg border border-[#E9ECEF] space-y-2 font-mono">
                {properties.map(p => (
                  <div key={p.id} className="flex justify-between">
                    <span>{p.name}:</span>
                    <span className="font-bold text-[#141d23]">{p.totalRevenue} · {p.occupancy}% occupied</span>
                  </div>
                ))}
                <div className="border-t border-[#E9ECEF] pt-1 flex justify-between font-bold text-sm text-[#765a25]">
                  <span>Total F&amp;B Revenue:</span>
                  <span>{portfolioStats ? `$${portfolioStats.totalRevenue.toLocaleString()}` : '—'}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button 
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 bg-[#765a25] text-white rounded-lg text-xs font-semibold"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
