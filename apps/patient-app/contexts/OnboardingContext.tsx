import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storage as SecureStore } from '../utils/storage';

const ONBOARDING_KEY = 'onboarding_complete';

interface OnboardingContextType {
  isComplete: boolean;
  isLoading: boolean;
  complete: () => Promise<void>;
  reset: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const OnboardingProvider = ({ children }: { children: ReactNode }) => {
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(ONBOARDING_KEY).then((value) => {
      setIsComplete(value === 'true');
      setIsLoading(false);
    });
  }, []);

  const complete = async () => {
    await SecureStore.setItemAsync(ONBOARDING_KEY, 'true');
    setIsComplete(true);
  };

  const reset = async () => {
    await SecureStore.deleteItemAsync(ONBOARDING_KEY);
    setIsComplete(false);
  };

  return (
    <OnboardingContext.Provider value={{ isComplete, isLoading, complete, reset }}>
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};
