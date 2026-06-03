import { useAuth } from 'contexts/AuthContext';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useOnboarding } from 'contexts/OnboardingContext';

/** True while either context is still hydrating from secure store */
export const useIsAppLoading = () => {
  const auth = useAuth();
  const onboarding = useOnboarding();
  const clerkAuth = useClerkAuth();
  return auth.isLoading || onboarding.isLoading || !clerkAuth.isLoaded;
};

/** First open: show Welcome → Onboard */
export const useIsOnboarding = () => {
  const onboarding = useOnboarding();
  const isAuthLoading = useIsAppLoading();
  if (isAuthLoading) return false;
  return !onboarding.isComplete;
};

/** Onboarding done, not yet signed in */
export const useIsInAuthFlow = () => {
  const auth = useAuth();
  const onboarding = useOnboarding();
  const isAuthLoading = useIsAppLoading();
  if (isAuthLoading) return false;
  return onboarding.isComplete && !auth.isAuthenticated;
};

/** Signed in but no PIN set yet (first time after account creation/login) */
export const useIsSettingUpPIN = () => {
  const auth = useAuth();
  const onboarding = useOnboarding();
  const isAuthLoading = useIsAppLoading();
  if (isAuthLoading) return false;
  return onboarding.isComplete && auth.isAuthenticated && !auth.hasPIN;
};

/** PIN is set and the app is currently locked */
export const useIsLocked = () => {
  const auth = useAuth();
  const onboarding = useOnboarding();
  const isAuthLoading = useIsAppLoading();
  if (isAuthLoading) return false;
  return onboarding.isComplete && auth.isAuthenticated && auth.hasPIN && auth.isLocked;
};

/** Fully authenticated, PIN set, and unlocked — show main app */
export const useIsUnlocked = () => {
  const auth = useAuth();
  const onboarding = useOnboarding();
  const isAuthLoading = useIsAppLoading();
  if (isAuthLoading) return false;
  return onboarding.isComplete && auth.isAuthenticated && auth.hasPIN && !auth.isLocked;
};
