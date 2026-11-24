import { useAuth } from 'contexts/AuthContext';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useOnboarding } from 'contexts/OnboardingContext';
import { resolveNavAccess } from 'utils/sessionExpiry';

function useResolvedNavAccess() {
  const auth = useAuth();
  const onboarding = useOnboarding();
  const clerkAuth = useClerkAuth();

  return resolveNavAccess({
    isAuthenticated: auth.isAuthenticated,
    isInitialized: auth.isInitialized,
    internalPatientId: auth.internalPatientId,
    hasPIN: auth.hasPIN,
    isLocked: auth.isLocked,
    isLoading: auth.isLoading,
    onboardingComplete: onboarding.isComplete,
    onboardingLoading: onboarding.isLoading,
    isClerkLoaded: Boolean(clerkAuth.isLoaded),
    isClerkSignedIn: auth.isClerkSignedIn,
    isReauthenticating: auth.isReauthenticating,
  });
}

/** True while either context is still hydrating from secure store */
export const useIsAppLoading = () => useResolvedNavAccess().isAppLoading;

/** First open: show Welcome → Onboard */
export const useIsOnboarding = () => useResolvedNavAccess().isOnboarding;

/** Onboarding done, not yet signed in */
export const useIsInAuthFlow = () => useResolvedNavAccess().isInAuthFlow;

/** Signed in but no PIN set yet (first time after account creation/login) */
export const useIsSettingUpPIN = () => useResolvedNavAccess().isSettingUpPIN;

/** PIN is set and the app is currently locked */
export const useIsLocked = () => useResolvedNavAccess().isLocked;

/** Fully authenticated with a PIN — show main app, with lock UI overlaid if needed */
export const useIsMainReady = () => useResolvedNavAccess().isMainReady;

/** Fully authenticated, PIN set, and unlocked */
export const useIsUnlocked = () => {
  const auth = useAuth();
  const isMainReady = useIsMainReady();
  return isMainReady && !auth.isLocked;
};
