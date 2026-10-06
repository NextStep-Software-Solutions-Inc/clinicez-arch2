import { useEffect, useState } from 'react';
import { initWebDatabase } from './index.web';

export function useDatabaseMigrations() {
  const [state, setState] = useState<{ success: boolean; error: Error | null }>({
    success: false,
    error: null,
  });

  useEffect(() => {
    initWebDatabase()
      .then(() => {
        setState({ success: true, error: null });
      })
      .catch((err) => {
        console.error('[WebDB] Migration failed:', err);
        setState({ success: false, error: err instanceof Error ? err : new Error(String(err)) });
      });
  }, []);

  return state;
}
