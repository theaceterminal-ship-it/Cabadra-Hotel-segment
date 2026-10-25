import React from 'react';
import type { Bill } from '../types';
import { formatCurrency } from '../lib/currency';

const METHOD_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', bank: 'Bank transfer', other: 'Other' };

const fmtDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * A stay's bill, as one printable page: the hotel (with GSTIN when it
 * charges GST), the guest and stay, every line with its tax, the CGST/SGST
 * split by rate, payments, and the balance. The same component prints at the
 * desk and renders the guest's link (/bill/:token). Fixed ink-on-white
 * colours, not theme tokens, so it prints the same in dark mode.
 */
export function BillDocument({ bill, message }: { bill: Bill; message?: string }) {
  const c = (n: number) => formatCurrency(n, bill.currency);
  const showTax = bill.hotel.gstEnabled || bill.lines.some(l => l.taxAmount > 0);
  const title = bill.provisional ? 'Bill so far' : bill.hotel.gstEnabled ? 'Tax invoice' : 'Bill';

  return (
    <article className="bill-document mx-auto w-full max-w-[794px] bg-white text-[#111] p-8 sm:p-12 text-[13px] leading-relaxed">
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-[#e3e6df]">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.03em]">{bill.hotel.name}</h1>
          {bill.hotel.legalName && bill.hotel.legalName !== bill.hotel.name && <p className="text-[#60645e]">{bill.hotel.legalName}</p>}
          {bill.hotel.address && <p className="text-[#60645e] whitespace-pre-line">{bill.hotel.address}</p>}
          {(bill.hotel.phone || bill.hotel.email) && <p className="text-[#60645e]">{[bill.hotel.phone, bill.hotel.email].filter(Boolean).join(' · ')}</p>}
          {bill.hotel.gstin && <p className="mt-1 font-medium">GSTIN {bill.hotel.gstin}</p>}
        </div>
        <div className="sm:text-right">
          <p className="text-sm font-medium text-[#60645e]">{title}</p>
          <p className="text-[20px] font-semibold tracking-[-0.02em]">{bill.number ?? 'Not yet issued'}</p>
          {bill.issuedAt && <p className="text-[#60645e]">{fmtDate(bill.issuedAt)}</p>}
        </div>
      </header>

      <section className="grid sm:grid-cols-2 gap-6 py-6 border-b border-[#e3e6df]">
        <div>
          <p className="text-xs font-medium text-[#60645e]">Billed to</p>
          <p className="font-semibold mt-0.5">{bill.guest.name || 'Guest'}</p>
          {bill.guest.phone && <p className="text-[#60645e]">{bill.guest.phone}</p>}
          {bill.guest.email && <p className="text-[#60645e]">{bill.guest.email}</p>}
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-medium text-[#60645e]">Stay</p>
          <p className="font-semibold mt-0.5">Room {bill.stay.room}{bill.stay.roomType ? ` · ${bill.stay.roomType}` : ''}</p>
          <p className="text-[#60645e]">{fmtDate(bill.stay.checkIn)} – {fmtDate(bill.stay.checkOut)}</p>
          {bill.stay.nights > 0 && (
            <p className="text-[#60645e]">{bill.stay.nights} {bill.stay.nights === 1 ? 'night' : 'nights'}{bill.stay.ratePerNight ? ` at ${c(bill.stay.ratePerNight)}` : ''}</p>
          )}
        </div>
      </section>

      <table className="w-full mt-6 border-collapse">
        <thead>
          <tr className="text-left text-xs text-[#60645e] border-b border-[#e3e6df]">
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Description</th>
            {showTax && <th className="py-2 pr-3 font-medium text-right">GST</th>}
            <th className="py-2 font-medium text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.map((l, i) => (
            <tr key={i} className="border-b border-[#f0f2ee] align-top">
              <td className="py-2 pr-3 whitespace-nowrap text-[#60645e]">{fmtDate(l.date)}</td>
              <td className="py-2 pr-3">{l.description}</td>
              {showTax && <td className="py-2 pr-3 text-right whitespace-nowrap text-[#60645e]">{l.taxRate > 0 ? `${l.taxRate}%` : '—'}</td>}
              <td className="py-2 text-right whitespace-nowrap">{c(l.amount)}</td>
            </tr>
          ))}
          {bill.lines.length === 0 && (
            <tr><td colSpan={showTax ? 4 : 3} className="py-6 text-center text-[#60645e]">Nothing charged yet.</td></tr>
          )}
        </tbody>
      </table>

      <section className="mt-6 flex flex-col sm:flex-row gap-6 sm:justify-between">
        {bill.taxSummary.length > 0 ? (
          <table className="text-xs border-collapse self-start">
            <thead>
              <tr className="text-left text-[#60645e]">
                <th className="pr-4 pb-1 font-medium">GST rate</th>
                <th className="pr-4 pb-1 font-medium text-right">Taxable</th>
                <th className="pr-4 pb-1 font-medium text-right">CGST</th>
                <th className="pb-1 font-medium text-right">SGST</th>
              </tr>
            </thead>
            <tbody>
              {bill.taxSummary.map(t => (
                <tr key={t.rate}>
                  <td className="pr-4">{t.rate}%</td>
                  <td className="pr-4 text-right">{c(t.taxable)}</td>
                  <td className="pr-4 text-right">{c(t.cgst)}</td>
                  <td className="text-right">{c(t.sgst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <span />}

        <dl className="min-w-[240px] space-y-1">
          <Row label="Subtotal" value={c(bill.totals.subtotal)} />
          {bill.totals.tax > 0 && <Row label="GST" value={c(bill.totals.tax)} />}
          <Row label="Total" value={c(bill.totals.total)} strong />
          {bill.payments.map((p, i) => (
            <Row key={i} label={`${p.kind === 'refund' ? 'Refunded' : 'Paid'} · ${METHOD_LABEL[p.method] ?? p.method} · ${fmtDate(p.date)}`} value={`${p.kind === 'refund' ? '+' : '−'}${c(p.amount)}`} muted />
          ))}
          <Row label={bill.totals.balance < 0 ? 'Refund due' : 'Balance due'} value={c(Math.abs(bill.totals.balance))} strong border />
        </dl>
      </section>

      {message && <p className="mt-10 pt-6 border-t border-dashed border-[#c4c8c0] italic">{message}</p>}
      <footer className="mt-10 text-[11px] text-[#9a9e97] text-center">
        {bill.provisional ? 'This is the bill so far, not a final invoice.' : 'Thank you for staying with us.'} · Cabadra
      </footer>
    </article>
  );
}

function Row({ label, value, strong, muted, border }: { label: string; value: string; strong?: boolean; muted?: boolean; border?: boolean }) {
  return (
    <div className={`flex justify-between gap-6 ${border ? 'border-t border-[#111] pt-2 mt-2' : ''} ${strong ? 'font-semibold text-[15px]' : ''} ${muted ? 'text-[#60645e] text-xs' : ''}`}>
      <dt>{label}</dt>
      <dd className="whitespace-nowrap">{value}</dd>
    </div>
  );
}
