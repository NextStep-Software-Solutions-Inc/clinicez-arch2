
import { createContext, useContext, useState, ReactNode } from 'react';

interface OnboardingContextType {
    isComplete: boolean
    complete: () => void
}

const OnboardingContext = createContext<OnboardingContextType| undefined>(undefined);

export const OnboardingProvider = ({children}: { children: ReactNode }) => {
  const [isComplete, setIsComplete] = useState(false);

  const complete = () => setIsComplete(true);

  return (
    <OnboardingContext.Provider value={{ isComplete, complete }}>
      {children}
    </OnboardingContext.Provider>
  );
};


export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};
