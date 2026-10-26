import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { communicationsService } from '../services/comms/communicationsService';

interface PrivacyContextType {
  /** When true, message bubbles and sensitive text are blurred until tapped or held. */
  privacyBlurEnabled: boolean;
  togglePrivacyBlur: () => void;
  setPrivacyBlurEnabled: (enabled: boolean) => void;

  /** When true, conversations hidden via 'Hide My Copy' are displayed in the inbox with a hidden badge. */
  showHiddenConversations: boolean;
  toggleShowHiddenConversations: () => void;
  setShowHiddenConversations: (show: boolean) => void;

  /** Local set of hidden conversation IDs. */
  hiddenConversationIds: Set<string>;
  hideConversation: (conversationId: string, getToken: () => Promise<string | null>) => Promise<boolean>;
  unhideConversation: (conversationId: string) => Promise<boolean>;
}

const PrivacyContext = createContext<PrivacyContextType | null>(null);

const STORAGE_KEYS = {
  PRIVACY_BLUR: 'clinicez_privacy_blur_mode',
  SHOW_HIDDEN: 'clinicez_show_hidden_convos',
  HIDDEN_IDS: 'clinicez_hidden_convo_ids',
};

async function getStoredBool(key: string, defaultVal: boolean): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const val = localStorage.getItem(key);
      return val !== null ? val === 'true' : defaultVal;
    }
    const val = await SecureStore.getItemAsync(key);
    return val !== null ? val === 'true' : defaultVal;
  } catch {
    return defaultVal;
  }
}

async function setStoredBool(key: string, val: boolean): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, String(val));
    } else {
      await SecureStore.setItemAsync(key, String(val));
    }
  } catch {
    // Non-fatal
  }
}

async function getStoredHiddenIds(): Promise<Set<string>> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') {
      raw = localStorage.getItem(STORAGE_KEYS.HIDDEN_IDS);
    } else {
      raw = await SecureStore.getItemAsync(STORAGE_KEYS.HIDDEN_IDS);
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // Non-fatal
  }
  return new Set<string>();
}

async function saveStoredHiddenIds(ids: Set<string>): Promise<void> {
  try {
    const raw = JSON.stringify(Array.from(ids));
    if (Platform.OS === 'web') {
      localStorage.setItem(STORAGE_KEYS.HIDDEN_IDS, raw);
    } else {
      await SecureStore.setItemAsync(STORAGE_KEYS.HIDDEN_IDS, raw);
    }
  } catch {
    // Non-fatal
  }
}

export const PrivacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [privacyBlurEnabled, setPrivacyBlurState] = useState<boolean>(false);
  const [showHiddenConversations, setShowHiddenState] = useState<boolean>(false);
  const [hiddenConversationIds, setHiddenConversationIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    getStoredBool(STORAGE_KEYS.PRIVACY_BLUR, false).then(setPrivacyBlurState);
    getStoredBool(STORAGE_KEYS.SHOW_HIDDEN, false).then(setShowHiddenState);
    getStoredHiddenIds().then(setHiddenConversationIds);
  }, []);

  const setPrivacyBlurEnabled = useCallback((enabled: boolean) => {
    setPrivacyBlurState(enabled);
    setStoredBool(STORAGE_KEYS.PRIVACY_BLUR, enabled);
  }, []);

  const togglePrivacyBlur = useCallback(() => {
    setPrivacyBlurState((prev) => {
      const next = !prev;
      setStoredBool(STORAGE_KEYS.PRIVACY_BLUR, next);
      return next;
    });
  }, []);

  const setShowHiddenConversations = useCallback((show: boolean) => {
    setShowHiddenState(show);
    setStoredBool(STORAGE_KEYS.SHOW_HIDDEN, show);
  }, []);

  const toggleShowHiddenConversations = useCallback(() => {
    setShowHiddenState((prev) => {
      const next = !prev;
      setStoredBool(STORAGE_KEYS.SHOW_HIDDEN, next);
      return next;
    });
  }, []);

  const hideConversation = useCallback(
    async (conversationId: string, getToken: () => Promise<string | null>): Promise<boolean> => {
      try {
        await communicationsService.hideConversationCopy(getToken, conversationId);
      } catch (err) {
        // If API fails or is offline, still update local hidden list
        console.warn('Backend hide conversation copy failed, applying locally:', err);
      }

      setHiddenConversationIds((prev) => {
        const next = new Set(prev);
        next.add(conversationId);
        saveStoredHiddenIds(next);
        return next;
      });
      return true;
    },
    [],
  );

  const unhideConversation = useCallback(async (conversationId: string): Promise<boolean> => {
    setHiddenConversationIds((prev) => {
      const next = new Set(prev);
      next.delete(conversationId);
      saveStoredHiddenIds(next);
      return next;
    });
    return true;
  }, []);

  return (
    <PrivacyContext.Provider
      value={{
        privacyBlurEnabled,
        togglePrivacyBlur,
        setPrivacyBlurEnabled,
        showHiddenConversations,
        toggleShowHiddenConversations,
        setShowHiddenConversations,
        hiddenConversationIds,
        hideConversation,
        unhideConversation,
      }}
    >
      {children}
    </PrivacyContext.Provider>
  );
};

export function usePrivacy(): PrivacyContextType {
  const ctx = useContext(PrivacyContext);
  if (!ctx) {
    throw new Error('usePrivacy must be used within a PrivacyProvider');
  }
  return ctx;
}
