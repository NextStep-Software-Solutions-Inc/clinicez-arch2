import { useState, useEffect } from 'react';
import { Linking } from 'react-native';
import { isCurrentRouteQueueDisplay, isQueueDisplayPath } from '../utils/queueDisplayRoute';

/**
 * Reactive hook to detect if the client is currently requesting the unauthenticated TV display screen.
 */
export function useQueueDisplayRoute(): boolean {
  const [isQueueDisplay, setIsQueueDisplay] = useState<boolean>(isCurrentRouteQueueDisplay);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onLocationChange = () => {
      setIsQueueDisplay(isCurrentRouteQueueDisplay());
    };

    window.addEventListener('hashchange', onLocationChange);
    window.addEventListener('popstate', onLocationChange);

    return () => {
      window.removeEventListener('hashchange', onLocationChange);
      window.removeEventListener('popstate', onLocationChange);
    };
  }, []);

  useEffect(() => {
    const handleUrl = (urlStr: string | null) => {
      if (!urlStr) return;
      try {
        const u = new URL(urlStr);
        if (isQueueDisplayPath(u.pathname, u.hash)) {
          setIsQueueDisplay(true);
        }
      } catch {
        if (urlStr.includes('queue-display') || urlStr.includes('queue-tv')) {
          setIsQueueDisplay(true);
        }
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  return isQueueDisplay;
}
