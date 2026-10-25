import React, { useState, useEffect } from 'react';

let deferredStaffPrompt: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredStaffPrompt = e;
  });
}

/**
 * Staff PWA Install Prompt component.
 * Provides native installation or clear step-by-step browser instructions.
 */
export function StaffPwaInstallPrompt(): JSX.Element {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showManualInstructions, setShowManualInstructions] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [promptEvent, setPromptEvent] = useState<any>(null);
  const [isSecure, setIsSecure] = useState(true);

  useEffect(() => {
    // 1. Check if running in standalone mode (installed)
    const standaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (standaloneMode) {
      setIsStandalone(true);
      setShowPrompt(false);
      return;
    }

    // 2. Check if dismissed during this session
    if (sessionStorage.getItem('staff_pwa_prompt_dismissed') === 'true') {
      setShowPrompt(false);
      return;
    }

    // 3. Check secure context (HTTPS requirement)
    if (typeof window !== 'undefined') {
      setIsSecure(window.isSecureContext);
    }

    // 4. Check for iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // 5. Check if native prompt captured
    if (deferredStaffPrompt) {
      setPromptEvent(deferredStaffPrompt);
    }

    // Show prompt banner
    setShowPrompt(true);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredStaffPrompt = e;
      setPromptEvent(e);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    const activePrompt = promptEvent || deferredStaffPrompt;
    if (activePrompt) {
      try {
        await activePrompt.prompt();
        const choiceResult = await activePrompt.userChoice;
        console.log('Staff PWA Install choice:', choiceResult?.outcome);
        deferredStaffPrompt = null;
        setPromptEvent(null);
        setShowPrompt(false);
        return;
      } catch (err) {
        console.warn('Native install prompt failed, falling back to manual instructions:', err);
      }
    }

    // Fallback if native prompt unavailable (iOS, HTTP, or desktop browser unsupported)
    setShowManualInstructions(true);
  };

  const handleDismiss = () => {
    sessionStorage.setItem('staff_pwa_prompt_dismissed', 'true');
    setShowPrompt(false);
    setShowManualInstructions(false);
  };

  if (isStandalone || !showPrompt) {
    return <></>;
  }

  // The website's card and ink pill buttons, on theme tokens so dark mode follows.
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md rounded-[28px] bg-surface-container-lowest text-on-surface shadow-[0_18px_50px_rgba(0,0,0,0.14)] p-4">
      <div className="flex items-start gap-3">
        <span className="size-11 shrink-0 rounded-full bg-primary text-on-primary flex items-center justify-center">
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18l-6-6h4V4h4v8h4l-6 6zM4 20h16" />
          </svg>
        </span>
        <div className="flex-1 min-w-0 pt-0.5">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Install the Cabadra staff app</h3>
          <p className="text-[13px] text-on-surface-variant mt-0.5">Opens straight to the front desk and keeps alerts coming.</p>
        </div>
        <button onClick={handleDismiss} aria-label="Close install prompt" className="size-8 shrink-0 rounded-full text-on-surface-variant hover:bg-surface-container-low flex items-center justify-center">
          <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {!isSecure && (
        <p className="mt-3 rounded-2xl bg-surface px-3 py-2 text-[12px] text-on-surface-variant">Installing needs a secure (https) connection.</p>
      )}

      {showManualInstructions ? (
        <div className="mt-3 rounded-[20px] bg-surface p-4 text-[13px] space-y-2">
          <p className="font-medium">To install it:</p>
          {isIos ? (
            <ol className="list-decimal list-inside space-y-1 text-on-surface-variant">
              <li>Tap <strong className="text-on-surface font-medium">Share</strong> in Safari’s toolbar.</li>
              <li>Tap <strong className="text-on-surface font-medium">Add to Home Screen</strong>.</li>
              <li>Tap <strong className="text-on-surface font-medium">Add</strong>.</li>
            </ol>
          ) : (
            <ol className="list-decimal list-inside space-y-1 text-on-surface-variant">
              <li>Open the browser menu (<strong className="text-on-surface font-medium">⋮</strong>).</li>
              <li>Tap <strong className="text-on-surface font-medium">Install app</strong> or <strong className="text-on-surface font-medium">Add to Home screen</strong>.</li>
              <li>Confirm.</li>
            </ol>
          )}
          <button onClick={handleDismiss} className="w-full mt-2 h-10 rounded-full bg-primary text-on-primary text-[13px] font-medium">Got it</button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button onClick={handleDismiss} className="h-9 px-4 rounded-full text-[13px] font-medium text-on-surface-variant hover:bg-surface-container-low">Not now</button>
          <button onClick={handleInstallClick} className="h-9 px-5 rounded-full bg-primary text-on-primary text-[13px] font-medium">Install</button>
        </div>
      )}
    </div>
  );
}
