import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { AddPropertyFlow, type AddPropertyStage } from '../components/AddPropertyFlow';
import type { Organization } from '../lib/setupPayment';

interface OwnerOnboardingProps {
  organization: Organization | null;
  onOrganizationSaved: (org: Organization) => void;
  onCreated: (propertyId: string) => Promise<void>;
  email?: string;
  onSignOut: () => void;
}

const STEPS: { id: AddPropertyStage; label: string }[] = [
  { id: 'business', label: 'Your business' },
  { id: 'property', label: 'Your property' },
  { id: 'payment', label: 'Payment' },
];

const COPY: Record<AddPropertyStage, { title: string; body: string }> = {
  business: { title: 'Welcome to Cabadra', body: 'First, a few details about your business. You’ll only do this once.' },
  property: { title: 'Add your first property', body: 'Each property has a one-time setup fee. You can add more properties later.' },
  payment: { title: 'Complete the payment', body: 'Finish in the Razorpay window. Your dashboard opens as soon as it’s confirmed.' },
};

/**
 * What a signed-in owner with no properties sees at /owner: business
 * details, then the first property and its setup fee. Same photo frame as
 * the website and sign-in page, so sign-up → onboarding feels like one
 * place.
 */
export default function OwnerOnboarding({ organization, onOrganizationSaved, onCreated, email, onSignOut }: OwnerOnboardingProps) {
  const [stage, setStage] = useState<AddPropertyStage>(organization ? 'property' : 'business');
  const stageIndex = STEPS.findIndex(s => s.id === stage);

  return (
    <div className="min-h-screen w-full bg-[#eef0ec] p-2 sm:p-4 font-sans antialiased text-[#111]">
      <div
        className="relative min-h-[calc(100svh-1rem)] sm:min-h-[calc(100svh-2rem)] overflow-hidden rounded-[28px] sm:rounded-[40px] bg-cover bg-center flex flex-col"
        style={{
          backgroundImage:
            "url('/landing/hero.jpg'), linear-gradient(180deg, #e9ecea 0%, #c9d3cc 38%, #6f8a6a 72%, #8fa64e 100%)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(242,244,242,0.6)_0%,rgba(242,244,242,0.2)_40%,rgba(0,0,0,0.15)_100%)]" />

        <header className="relative z-10 flex items-center justify-between px-5 sm:px-10 pt-5 sm:pt-8">
          <Link to="/" className="text-[26px] sm:text-[30px] font-semibold tracking-[-0.03em]">
            Cabadra
          </Link>
          <button
            onClick={onSignOut}
            className="h-10 px-4 inline-flex items-center rounded-full border border-black/15 bg-white/50 backdrop-blur text-sm font-medium hover:bg-white/80 transition-colors"
          >
            Sign out
          </button>
        </header>

        <div className="relative z-10 flex-1 flex items-start sm:items-center justify-center px-3 sm:px-4 py-8 sm:py-12">
          <div className="w-full max-w-[520px] rounded-[32px] bg-surface-container-lowest text-on-surface p-6 sm:p-9 shadow-[0_10px_50px_rgba(0,0,0,0.15)]">
            <ol className="flex items-center gap-2 mb-7">
              {STEPS.map((step, i) => {
                const done = i < stageIndex;
                const current = i === stageIndex;
                return (
                  <li key={step.id} className="flex items-center gap-2 min-w-0 flex-1 last:flex-none">
                    <span
                      className={`size-7 shrink-0 rounded-full flex items-center justify-center text-xs font-medium ${
                        done || current ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      {done ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <span className={`hidden sm:block text-[13px] truncate ${current ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}>
                      {step.label}
                    </span>
                    {i < STEPS.length - 1 && <span className="flex-1 h-px bg-outline-variant min-w-3" />}
                  </li>
                );
              })}
            </ol>

            <h1 className="text-2xl sm:text-[28px] font-semibold tracking-[-0.02em]">{COPY[stage].title}</h1>
            <p className="mt-1.5 text-sm text-on-surface-variant">{COPY[stage].body}</p>

            <div className="mt-6">
              <AddPropertyFlow
                organization={organization}
                onOrganizationSaved={onOrganizationSaved}
                onCreated={onCreated}
                email={email}
                onStageChange={setStage}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
