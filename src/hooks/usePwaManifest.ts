import { useEffect } from 'react';

export type PwaApp = 'guest' | 'staff' | 'kitchen' | 'owner';

const APPS: Record<PwaApp, { manifest: string; icon: string; title: string }> = {
  guest: { manifest: '/manifest.json', icon: '/icons/guest-192.png', title: 'Cabadra Guest' },
  staff: { manifest: '/manifest-staff.json', icon: '/icons/staff-192.png', title: 'Cabadra Staff' },
  kitchen: { manifest: '/manifest-kitchen.json', icon: '/icons/kitchen-192.png', title: 'Kitchen' },
  owner: { manifest: '/manifest-owner.json', icon: '/icons/owner-192.png', title: 'Cabadra Owner' },
};

function tag<T extends HTMLElement>(selector: string, create: () => T): T {
  return (document.head.querySelector(selector) as T | null) ?? document.head.appendChild(create());
}

/**
 * Points the page at this app's own manifest and home-screen icon, so the
 * guest app, the staff app, the kitchen screen and the owner dashboard
 * install as four separate apps, each opening only its own pages (each
 * manifest's scope is its own path). index.html does the same before React
 * loads; this keeps it right when the app moves between them without a
 * full page load.
 */
export function usePwaManifest(app: PwaApp) {
  useEffect(() => {
    const a = APPS[app];
    tag<HTMLLinkElement>('link[rel="manifest"]', () => Object.assign(document.createElement('link'), { rel: 'manifest' })).href = a.manifest;
    tag<HTMLLinkElement>('link[rel="apple-touch-icon"]', () => Object.assign(document.createElement('link'), { rel: 'apple-touch-icon' })).href = a.icon;
    tag<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]', () => Object.assign(document.createElement('meta'), { name: 'apple-mobile-web-app-title' })).content = a.title;
    tag<HTMLMetaElement>('meta[name="apple-mobile-web-app-capable"]', () => Object.assign(document.createElement('meta'), { name: 'apple-mobile-web-app-capable' })).content = 'yes';
  }, [app]);
}
