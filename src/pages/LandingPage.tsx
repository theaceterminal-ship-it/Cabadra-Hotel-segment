import React from 'react';
import { Link } from 'react-router-dom';

/**
 * `/` — just a chooser between the two staff pages. There's deliberately no
 * link to the guest page here: a guest never types a URL, they scan the QR
 * code / open the link their hotel gives them at check-in, which lands
 * directly on /guest/:token.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f6faff] p-6">
      <div className="max-w-sm w-full text-center space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#765a25]">Cabadra</h1>
          <p className="text-sm text-[#4e463a] mt-1">Hotel operations &amp; guest experience</p>
        </div>
        <div className="space-y-3">
          <Link
            to="/owner"
            className="block w-full h-11 leading-[44px] bg-[#765a25] text-white rounded-xl font-bold text-sm hover:bg-[#5c4210] transition-colors"
          >
            Owner sign in
          </Link>
          <Link
            to="/reception"
            className="block w-full h-11 leading-[44px] bg-white border border-[#E9ECEF] text-[#141d23] rounded-xl font-bold text-sm hover:bg-[#ecf5fe] transition-colors"
          >
            Reception sign in
          </Link>
        </div>
        <p className="text-[11px] text-[#7f7668]">
          Guests don't sign in here — use the link from your check-in QR code.
        </p>
      </div>
    </div>
  );
}
