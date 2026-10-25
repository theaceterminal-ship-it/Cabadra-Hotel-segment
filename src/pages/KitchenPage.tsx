import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bell, BellOff, ChefHat } from 'lucide-react';
import { KitchenKDS } from '../components/KitchenKDS';
import { fetchKitchenOrders, rejectKitchenOrder, setKitchenOrderStatus, toKdsOrder } from '../lib/kitchenApi';
import { useSiteTheme } from '../hooks/useTheme';
import { usePwaManifest } from '../hooks/usePwaManifest';
import { usePageTitle } from './site/usePageTitle';
import type { KdsOrder } from '../types';

const POLL_MS = 5000;

/** A short two-note chime from the Web Audio API: no sound file to load or cache. */
function chime(ctx: AudioContext) {
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    const t = ctx.currentTime + i * 0.18;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

/**
 * The kitchen's own screen: `/kitchen/:token`, opened once on the kitchen's
 * tablet from the link reception copies (Reception > Kitchen). No login;
 * the token is the key, and resetting it at reception switches this screen
 * off. Shows the food orders and lets the kitchen start, finish or reject
 * them. Checks for new orders every few seconds, can chime when one
 * arrives (browsers only allow sound after a tap, hence the switch), and
 * keeps the screen from sleeping while it's open.
 */
export default function KitchenPage() {
  useSiteTheme();
  usePwaManifest('kitchen');
  const { token: urlToken } = useParams<{ token?: string }>();
  // The installed kitchen app opens at /kitchen (its start page) without the
  // token, so the device remembers the last link it was opened with.
  const token = urlToken ?? (() => { try { return localStorage.getItem('cabadra_kitchen_token') ?? ''; } catch { return ''; } })();
  useEffect(() => {
    if (urlToken) try { localStorage.setItem('cabadra_kitchen_token', urlToken); } catch { /* private mode: it just won't be remembered */ }
  }, [urlToken]);
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [propertyName, setPropertyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const skew = useRef(0);
  usePageTitle(propertyName ? `Kitchen · ${propertyName}` : 'Kitchen');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const snap = await fetchKitchenOrders(token);
      skew.current = new Date(snap.serverTime).getTime() - Date.now();
      setPropertyName(snap.propertyName);
      setOrders(prev => snap.orders.map(o => toKdsOrder(o, skew.current, prev.find(p => p.id === o.id))));
      const fresh = snap.orders.filter(o => o.status === 'new' && seen.current && !seen.current.has(o.id));
      if (fresh.length && audio.current) chime(audio.current);
      seen.current = new Set(snap.orders.map(o => o.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Can’t reach the hotel right now.');
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Keep a kitchen tablet awake while the screen is open (where supported).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock && document.visibilityState === 'visible') lock = await nav.wakeLock.request('screen');
      } catch { /* not allowed (battery saver, old browser): the screen may dim, nothing else breaks */ }
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => { document.removeEventListener('visibilitychange', request); lock?.release().catch(() => {}); };
  }, []);

  const toggleSound = () => {
    if (!sound) {
      audio.current = audio.current ?? new AudioContext();
      audio.current.resume();
      chime(audio.current);
    }
    setSound(s => !s);
    if (sound) audio.current = null;
  };

  const update = async (order: KdsOrder) => {
    const before = orders.find(o => o.id === order.id);
    setOrders(prev => prev.map(o => (o.id === order.id ? order : o)));
    if (before && before.status !== order.status && (order.status === 'preparing' || order.status === 'ready')) {
      try { await setKitchenOrderStatus(token, order.id, order.status); } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t update that order.'); }
      load();
    }
  };

  const reject = async (orderId: string, note: string) => {
    setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status: 'rejected', rejectionNote: note } : o)));
    try { await rejectKitchenOrder(token, orderId, note); } catch (err) { setError(err instanceof Error ? err.message : 'Couldn’t reject that order.'); }
    load();
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-3">
          <span className="size-14 rounded-full bg-surface-container-lowest flex items-center justify-center mx-auto"><ChefHat className="size-6" /></span>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Open the kitchen link once</h1>
          <p className="text-sm text-on-surface-variant">Reception copies it from Reception → Kitchen. Open it on this device and it’s remembered.</p>
        </div>
      </div>
    );
  }

  if (loaded && error && !propertyName) {
    return (
      <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-3">
          <span className="size-14 rounded-full bg-surface-container-lowest flex items-center justify-center mx-auto"><ChefHat className="size-6" /></span>
          <h1 className="text-xl font-semibold tracking-[-0.02em]">This kitchen screen isn’t switched on</h1>
          <p className="text-sm text-on-surface-variant">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-surface">
      {error && <p className="bg-error text-on-error text-sm px-4 py-2 text-center">{error} Retrying…</p>}
      <KitchenKDS
        orders={orders}
        subtitle={propertyName}
        onUpdateOrder={update}
        onRejectOrder={reject}
        onUnready={o => update({ ...o, status: 'preparing' })}
        headerExtra={
          <button onClick={toggleSound} className={`h-10 px-4 rounded-full text-sm font-medium inline-flex items-center gap-2 ${sound ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface'}`}>
            {sound ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            <span className="hidden sm:inline">{sound ? 'Sound on' : 'Turn on sound'}</span>
          </button>
        }
      />
    </div>
  );
}
