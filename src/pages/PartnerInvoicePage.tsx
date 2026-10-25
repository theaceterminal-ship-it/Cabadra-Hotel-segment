import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from './site/usePageTitle';
import { PartnerAuthCard } from '../components/partners/PartnerAuthCard';
import { PartnerInvoice, fetchPartnerInvoice, stateName } from '../lib/partnersApi';

const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

/** Rupees in words, for the invoice total ("Two thousand three hundred fifty-eight rupees and eighty-two paise"). */
function inWords(amount: number): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? `-${ones[n % 10]}` : ''}`);
  const three = (n: number) => [n >= 100 ? `${ones[Math.floor(n / 100)]} hundred` : '', two(n % 100)].filter(Boolean).join(' ');
  const words = (n: number): string => {
    if (n === 0) return 'zero';
    const parts: string[] = [];
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) parts.push(`${words(crore)} crore`);
    if (lakh) parts.push(`${two(lakh)} lakh`);
    if (thousand) parts.push(`${two(thousand)} thousand`);
    if (n) parts.push(three(n));
    return parts.join(' ');
  };
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  const text = `${words(rupees)} rupees${paise ? ` and ${two(paise)} paise` : ''} only`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A partner payment's invoice (0085), laid out to print or save as PDF: a
 * tax invoice with the CGST/SGST or IGST split once Cabadra's GSTIN is set,
 * a receipt before that. Open to the business that paid (signed in, or by
 * its link while it has no account) and to platform admins.
 */
export default function PartnerInvoicePage() {
  const { invoiceId = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t');
  const { loading, session } = useAuth();
  const [inv, setInv] = useState<PartnerInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  usePageTitle(inv ? `Invoice ${inv.number}` : 'Invoice');

  useEffect(() => {
    if (loading) return;
    fetchPartnerInvoice(invoiceId, token).then(i => { setInv(i); setError(null); }).catch(err => setError(err.message));
  }, [invoiceId, token, loading, session?.user.id]);

  if (loading || (!inv && !error)) return <div className="min-h-screen bg-[#eef0ec] flex items-center justify-center"><Loader2 className="size-6 animate-spin text-[#111]/40" /></div>;
  if (error) {
    return (
      <div className="min-h-screen bg-[#eef0ec] px-5 py-16">
        {session ? <p className="text-center text-[15px]">This invoice isn’t on your account.</p> : <PartnerAuthCard note="Sign in to see your invoice." />}
      </div>
    );
  }
  const i = inv!;
  const interstate = i.igst > 0;
  const title = i.tax_invoice ? 'Tax invoice' : 'Receipt';

  return (
    <div className="min-h-screen bg-[#eef0ec] print:bg-white text-[#111] font-sans antialiased py-8 px-4 print:p-0">
      <div className="mx-auto max-w-3xl mb-4 flex items-center justify-between print:hidden">
        <Link to={token ? `/partner/${token}` : '/partner'} className="h-10 px-4 inline-flex items-center gap-1.5 rounded-full bg-white text-sm font-medium"><ArrowLeft className="size-4" /> Partner page</Link>
        <button onClick={() => window.print()} className="h-10 px-5 inline-flex items-center gap-1.5 rounded-full bg-[#111] text-white text-sm font-medium"><Printer className="size-4" /> Print or save PDF</button>
      </div>
      <article className="mx-auto max-w-3xl bg-white rounded-[24px] print:rounded-none p-8 sm:p-12 text-[14px] leading-relaxed">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-[26px] font-semibold tracking-[-0.03em]">Cabadra</p>
            <p className="mt-2 font-medium">{i.seller.name}</p>
            <p className="text-[#111]/65 whitespace-pre-line">{i.seller.address}</p>
            {i.seller.gstin && <p className="mt-1">GSTIN <span className="font-mono">{i.seller.gstin}</span></p>}
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold uppercase tracking-wide">{title}</p>
            <p className="mt-2">No. <span className="font-mono font-medium">{i.number}</span></p>
            <p>Date {date(i.issued_on)}</p>
            {i.tax_invoice && <p className="text-[#111]/65">Place of supply: {stateName(i.buyer.stateCode ?? i.seller.stateCode) ?? '—'}{i.buyer.stateCode || i.seller.stateCode ? ` (${i.buyer.stateCode ?? i.seller.stateCode})` : ''}</p>}
          </div>
        </header>

        <section className="mt-8 rounded-2xl bg-[#f4f5f2] print:bg-transparent print:border print:border-black/15 p-5">
          <p className="text-xs uppercase tracking-wide text-[#111]/50">Billed to</p>
          <p className="mt-1 font-medium">{i.buyer.name}{i.buyer.tradeName && i.buyer.tradeName !== i.buyer.name ? ` (${i.buyer.tradeName})` : ''}</p>
          {i.buyer.address && <p className="text-[#111]/65 whitespace-pre-line">{i.buyer.address}</p>}
          {i.buyer.gstin && <p>GSTIN <span className="font-mono">{i.buyer.gstin}</span></p>}
          {i.buyer.email && <p className="text-[#111]/65">{i.buyer.email}</p>}
        </section>

        <table className="mt-8 w-full border-collapse">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[#111]/50 border-b border-black/10">
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 font-medium">SAC</th>
              <th className="py-2 font-medium text-right">{i.tax_invoice ? 'Taxable value' : 'Amount'}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-black/10 align-top">
              <td className="py-3 pr-4">{i.description}</td>
              <td className="py-3 pr-4 font-mono">{i.sac_code}</td>
              <td className="py-3 text-right">{money(i.taxable)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 ml-auto max-w-xs space-y-1.5">
          {i.tax_invoice && (interstate ? (
            <Row label={`IGST @ ${i.gst_rate}%`} value={money(i.igst)} />
          ) : (
            <>
              <Row label={`CGST @ ${i.gst_rate / 2}%`} value={money(i.cgst)} />
              <Row label={`SGST @ ${i.gst_rate / 2}%`} value={money(i.sgst)} />
            </>
          ))}
          <div className="pt-2 border-t border-black/15"><Row label="Total" value={money(i.total)} strong /></div>
        </div>
        <p className="mt-3 text-right text-[13px] text-[#111]/60">{inWords(i.total)}</p>

        <footer className="mt-10 pt-5 border-t border-black/10 text-[13px] text-[#111]/55 space-y-1">
          <p>Paid in full · {i.buyer.payment}</p>
          {!i.tax_invoice && <p>Not a tax invoice: no GST was charged on this payment.</p>}
          <p>This is a computer-generated document and needs no signature. Cabadra is a product of {i.seller.name}. info@churmuri.com</p>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <p className={`flex justify-between gap-6 ${strong ? 'text-base font-semibold' : ''}`}><span>{label}</span><span>{value}</span></p>;
}
