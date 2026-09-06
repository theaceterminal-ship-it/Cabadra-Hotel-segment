import React from 'react';

/** Shown instead of a page's real content when .env.local hasn't been filled in yet — see src/lib/supabaseClient.ts. */
export function SupabaseSetupNeeded() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f6faff] p-6">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-lg font-bold text-[#141d23]">Supabase isn't connected yet</h1>
        <p className="text-sm text-[#4e463a]">
          Copy <code className="text-xs bg-[#ecf5fe] px-1 py-0.5 rounded">.env.example</code> to{' '}
          <code className="text-xs bg-[#ecf5fe] px-1 py-0.5 rounded">.env.local</code> and fill in your
          project's URL and anon key from Project Settings &gt; API, then restart <code className="text-xs bg-[#ecf5fe] px-1 py-0.5 rounded">npm run dev</code>.
        </p>
        <p className="text-xs text-[#7f7668]">
          You'll also need to run the SQL in <code className="bg-[#ecf5fe] px-1 py-0.5 rounded">supabase/migrations/0001_init.sql</code> and{' '}
          <code className="bg-[#ecf5fe] px-1 py-0.5 rounded">supabase/seed.sql</code> in the Supabase SQL Editor first.
        </p>
      </div>
    </div>
  );
}
