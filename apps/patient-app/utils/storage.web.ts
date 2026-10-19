const memoryFallback = new Map<string, string>();

export const storage = {
  getItemAsync: async (key: string): Promise<string | null> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return memoryFallback.get(key) ?? null;
    } catch {
      return memoryFallback.get(key) ?? null;
    }
  },
  setItemAsync: async (key: string, value: string): Promise<void> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
      memoryFallback.set(key, value);
    } catch {
      memoryFallback.set(key, value);
    }
  },
  deleteItemAsync: async (key: string): Promise<void> => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
      memoryFallback.delete(key);
    } catch {
      memoryFallback.delete(key);
    }
  },
};
