import { useAuth } from 'contexts/AuthContext';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useOnboarding } from 'contexts/OnboardingContext';

/** True while either context is still hydrating from secure store */
export const useIsAppLoading = () => {
  const auth = useAuth();
  const onboarding = useOnboarding();
  const clerkAuth = useClerkAuth();

  // If already initialized with a verified patient vault and PIN, do not block offline on Clerk
  if (auth.isInitialized && auth.internalPatientId && auth.hasPIN) {
    return auth.isLoading || onboarding.isLoading;
  }

  // Keep LoadingScreen active (and ready to show calm reconnect UI) whenever signed in but bootstrap hasn't finished
  if (auth.isAuthenticated && !auth.isInitialized) {
    return true;
  }

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
  return onboarding.isComplete && auth.isAuthenticated && auth.isInitialized && !auth.hasPIN;
};

/** PIN is set and the app is currently locked */
export const useIsLocked = () => {
  const auth = useAuth();
  const onboarding = useOnboarding();
  const isAuthLoading = useIsAppLoading();
  if (isAuthLoading) return false;
  return (
    onboarding.isComplete &&
    auth.isAuthenticated &&
    auth.isInitialized &&
    auth.hasPIN &&
    auth.isLocked
  );
};

/** Fully authenticated with a PIN — show main app, with lock UI overlaid if needed */
export const useIsMainReady = () => {
  const auth = useAuth();
  const onboarding = useOnboarding();
  const isAuthLoading = useIsAppLoading();
  if (isAuthLoading) return false;
  return (
    onboarding.isComplete &&
    auth.isAuthenticated &&
    auth.isInitialized &&
    auth.hasPIN
  );
};

/** Fully authenticated, PIN set, and unlocked */
export const useIsUnlocked = () => {
  const auth = useAuth();
  const isMainReady = useIsMainReady();
  return isMainReady && !auth.isLocked;
};
