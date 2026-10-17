import React, { useState, useEffect } from 'react';

// Global holder for beforeinstallprompt event in case it fires before component mounts
let deferredStaffPrompt: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredStaffPrompt = e;
  });
}

/**
 * Staff PWA Install Prompt component.
 * Shows a banner inviting staff to install the app for a more convenient experience.
 * Only shows if the app isn't already installed in standalone mode.
 */
export function StaffPwaInstallPrompt(): JSX.Element {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [promptEvent, setPromptEvent] = useState<any>(null);

  useEffect(() => {
    // 1. Check if already running as standalone app (installed)
    const standaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (standaloneMode) {
      setIsStandalone(true);
      setShowPrompt(false);
      return;
    }

    // 2. Check if user dismissed prompt previously during this session
    if (sessionStorage.getItem('staff_pwa_prompt_dismissed') === 'true') {
      setShowPrompt(false);
      return;
    }

    // 3. Check for iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    if (isIosDevice) {
      // iOS Safari doesn't support beforeinstallprompt event
      setShowPrompt(true);
      return;
    }

    // 4. Handle Chromium / Desktop / Android install prompt
    if (deferredStaffPrompt) {
      setPromptEvent(deferredStaffPrompt);
      setShowPrompt(true);
    }

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
      activePrompt.prompt();
      const { outcome } = await activePrompt.userChoice;
      console.log(`User responded to staff install prompt: ${outcome}`);
      deferredStaffPrompt = null;
      setPromptEvent(null);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('staff_pwa_prompt_dismissed', 'true');
    setShowPrompt(false);
  };

  if (isStandalone || !showPrompt) {
    return <></>;
  }

  return (
    <div
      className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-[92%] max-w-md bg-white rounded-xl shadow-2xl border border-emerald-100 p-4 transition-all duration-300 ease-in-out"
      id="staff-install-prompt"
    >
      <div className="flex items-start justify-between space-x-3">
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shadow-md">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18l-6-6h4V4h4v8h4l-6 6zM4 20h16" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm">Install Cabadra Staff App</h3>
            <p className="text-gray-600 text-xs mt-0.5">
              {isIos
                ? 'Tap the Share button and select "Add to Home Screen" to install.'
                : 'Install on your desktop or device for seamless operations management.'}
            </p>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors"
          aria-label="Dismiss install prompt"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {!isIos && (promptEvent || deferredStaffPrompt) && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 rounded-lg transition-colors"
          >
            Not now
          </button>
          <button
            onClick={handleInstallClick}
            className="px-4 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg shadow-sm hover:bg-emerald-700 transition-colors"
          >
            Install App
          </button>
        </div>
      )}
    </div>
  );
}
