/**
 * Route detection utility for the unauthenticated public waiting area TV display kiosk.
 * Matches both path-based (/queue-display) and hash-based (#/queue-display) routes.
 */
export function isQueueDisplayPath(pathname?: string | null, hash?: string | null): boolean {
  const p = (pathname || '').toLowerCase();
  const h = (hash || '').toLowerCase();

  return (
    p === '/queue-display' ||
    p.startsWith('/queue-display/') ||
    p === '/queue-tv' ||
    p.startsWith('/queue-tv/') ||
    h === '#/queue-display' ||
    h.startsWith('#/queue-display') ||
    h === '#queue-display' ||
    h.startsWith('#queue-display') ||
    h === '#/queue-tv' ||
    h.startsWith('#/queue-tv')
  );
}

export function isCurrentRouteQueueDisplay(): boolean {
  if (typeof window !== 'undefined' && window.location) {
    return isQueueDisplayPath(window.location.pathname, window.location.hash);
  }
  return false;
}
