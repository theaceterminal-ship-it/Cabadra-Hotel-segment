import { useEffect } from 'react';

const DEFAULT_TITLE = document.title;

/** Sets the browser tab title for a public page and restores the default when it unmounts. */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · Cabadra` : DEFAULT_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}
