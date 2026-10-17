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

  return (
    <div
      className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-[92%] max-w-md bg-white rounded-2xl shadow-2xl border border-emerald-100 p-4 transition-all duration-300 ease-in-out"
      id="staff-install-prompt"
    >
      <div className="flex items-start justify-between space-x-3">
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shadow-md">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18l-6-6h4V4h4v8h4l-6 6zM4 20h16" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-sm">Install Cabadra Staff App</h3>
            <p className="text-gray-600 text-xs mt-0.5">
              Install on your desktop or phone for quick access to hotel operations.
            </p>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors shrink-0"
          aria-label="Close install prompt"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {!isSecure && (
        <div className="mt-2.5 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
          ⚠️ Note: Automatic PWA install requires an <strong>HTTPS</strong> secure connection or <strong>localhost</strong>.
        </div>
      )}

      {showManualInstructions ? (
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-700 space-y-2 bg-emerald-50/50 p-3 rounded-xl">
          <p className="font-semibold text-emerald-950">To install on your device:</p>
          {isIos ? (
            <ol className="list-decimal list-inside space-y-1 text-gray-700 text-[11px]">
              <li>Tap the <strong>Share</strong> button in Safari's bottom toolbar.</li>
              <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
              <li>Tap <strong>Add</strong> in the top right corner.</li>
            </ol>
          ) : (
            <ol className="list-decimal list-inside space-y-1 text-gray-700 text-[11px]">
              <li>Tap the browser menu icon (<strong>⋮</strong> or <strong>Share</strong> or address bar install icon ⊕).</li>
              <li>Select <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>.</li>
              <li>Confirm when prompted by your device.</li>
            </ol>
          )}
          <button
            onClick={handleDismiss}
            className="w-full mt-2 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
          >
            Got it
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
          >
            Not now
          </button>
          <button
            onClick={handleInstallClick}
            className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg shadow hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Install App
          </button>
        </div>
      )}
    </div>
  );
}
