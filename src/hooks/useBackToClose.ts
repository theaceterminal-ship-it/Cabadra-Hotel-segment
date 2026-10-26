import { useEffect, useRef } from 'react';

/**
 * Android's back button (and the browser's) for in-app screens and sheets.
 *
 * The guest app is one page: the food menu, a dish sheet, the chat are
 * state, not URLs, so back used to leave the app entirely. Every open
 * screen or sheet registers here as a layer; while any layer is open there
 * is exactly one extra history entry (the guard). Back pops the guard, and
 * we close the topmost layer instead of leaving, then put the guard back if
 * something is still open.
 *
 * The guard is synced once after each change rather than per layer, so a
 * sheet closing while another opens in the same tap (cart → "Complete your
 * order") doesn't push and pop history out of order.
 */

interface Layer { close: () => void }

const stack: Layer[] = [];
let guarded = false;
let ignorePops = 0;
let scheduled = false;
let listening = false;

function sync() {
  scheduled = false;
  const want = stack.length > 0;
  if (want && !guarded) {
    window.history.pushState({ ...window.history.state, cabadraLayer: true }, '');
    guarded = true;
  } else if (!want && guarded) {
    // Everything was closed in the app: take our guard entry back off.
    guarded = false;
    ignorePops += 1;
    window.history.back();
  }
}

function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(sync, 0);
}

function onPopState() {
  if (ignorePops > 0) {
    ignorePops -= 1;
    return;
  }
  if (!guarded) return;
  // Back was pressed: the browser already removed the guard.
  guarded = false;
  const top = stack.pop();
  top?.close();
  scheduleSync();
}

/** While `open`, the back button runs `close` instead of leaving the page. Innermost (last opened) closes first. */
export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    if (!listening) {
      window.addEventListener('popstate', onPopState);
      listening = true;
    }
    const layer: Layer = { close: () => closeRef.current() };
    stack.push(layer);
    scheduleSync();
    return () => {
      const i = stack.indexOf(layer);
      if (i >= 0) stack.splice(i, 1);
      scheduleSync();
    };
  }, [open]);
}
