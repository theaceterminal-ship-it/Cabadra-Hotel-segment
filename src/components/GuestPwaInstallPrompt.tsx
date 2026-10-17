import React, { useState, useEffect } from 'react';

/**
 * Guest PWA Install Prompt component.
 * Shows a banner inviting the guest to install the app for a more convenient experience.
 * Only shows on mobile devices and if the app isn't already installed.
 */
export function GuestPwaInstallPrompt(): JSX.Element {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);

  useEffect(() => {
    // Check if web app manifest is supported
    if (!('manifest' in document)) {
      setIsInstallable(false);
      return;
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowPrompt(false);
      return;
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as Event);
      setIsInstallable(true);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User responded to install prompt: ${outcome}`);
      setDeferredPrompt(null);
      setIsInstallable(false);
      setShowPrompt(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 transform -x-1/2 z-50 max-w-md bg-white rounded-lg shadow-xl border p-4 opacity-0 transition-opacity duration-500 ease-in-out lg:bottom-6" id="guest-install-prompt" style={{ display: showPrompt ? 'block' : 'none' }}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-b from-indigo-600 to-purple-600 flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path className="stroke-2" strokeLinecap="round" strokeLinejoin="round" d="M13 20h10a2 2 0 002-2V10a2 2 0 00-2-2H10a2 2 0 00-2 2v4a2 2 0 002 2zM8 5l.952 2.236L13 6l-.905 2.236L8 11V5zM12 7v5l3 3"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-surface text-sm">Install Cabadra Guest App</h3>
          <p className="text-on-surface-variant text-xs">Get the app for a more convenient way to use Cabadra as a guest</p>
        </div>
        <button
          onClick={handleInstallClick}
          className="ml-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
          aria-label="Install app"
        >
          Install
        </button>
      </div>
    </div>
  );
}