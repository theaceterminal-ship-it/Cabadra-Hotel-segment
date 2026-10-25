import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import { fetchPublicBill } from '../lib/staffApi';
import { BillDocument } from '../components/BillDocument';
import { useSiteTheme } from '../hooks/useTheme';
import { usePageTitle } from './site/usePageTitle';
import type { Bill } from '../types';

/**
 * The guest's copy of their bill: `/bill/:token`, the private link the
 * front desk shares at check-out (public_get_invoice, 0079). No sign-in;
 * the unguessable token is the key, and it shows only what's on the bill.
 */
export default function BillPage() {
  useSiteTheme();
  const { token } = useParams<{ token: string }>();
  const [bill, setBill] = useState<Bill | null | undefined>(undefined);
  usePageTitle(bill?.number ? `Bill ${bill.number}` : 'Your bill');

  useEffect(() => {
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) { setBill(null); return; }
    fetchPublicBill(token).then(setBill).catch(() => setBill(null));
  }, [token]);

  if (bill === undefined) return <Centered>Loading your bill…</Centered>;
  if (bill === null) return <Centered>This bill link isn’t valid. Ask the hotel to send it again.</Centered>;

  return (
    <div className="min-h-screen bg-surface py-6 sm:py-10 px-3 print:p-0 print:bg-white">
      <div className="mx-auto max-w-[794px] flex justify-end gap-2 mb-4 print:hidden">
        <button onClick={() => window.print()} className="h-10 px-5 rounded-full bg-primary text-on-primary text-sm font-medium inline-flex items-center gap-2">
          <Download className="size-4" /> Save as PDF
        </button>
        <button onClick={() => window.print()} className="h-10 px-5 rounded-full bg-surface-container-lowest text-on-surface text-sm font-medium inline-flex items-center gap-2">
          <Printer className="size-4" /> Print
        </button>
      </div>
      <div className="mx-auto max-w-[794px] rounded-[28px] overflow-hidden shadow-[0_18px_50px_rgba(0,0,0,0.08)] print:rounded-none print:shadow-none">
        <BillDocument bill={bill} />
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-surface flex items-center justify-center p-6 text-sm text-on-surface-variant text-center">{children}</div>;
}
