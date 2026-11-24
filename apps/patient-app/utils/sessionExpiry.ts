/**
 * Pure session expiry and navigation access helpers shared by AuthContext,
 * useNavState, RootStackWeb, and unit tests.
 */

export interface SessionExpiryParams {
  isOnline: boolean;
  isClerkLoaded: boolean;
  isClerkSignedIn: boolean;
  isLocallyAuthenticated: boolean;
}

/**
 * Returns true only when the device is online, Clerk has finished loading,
 * no Clerk session is active, and the user has an established local PIN vault.
 * Remains false offline or while Clerk is still loading so cold-boot offline
 * PIN access is never misclassified as an expired session.
 */
export function computeIsSessionExpired({
  isOnline,
  isClerkLoaded,
  isClerkSignedIn,
  isLocallyAuthenticated,
}: SessionExpiryParams): boolean {
  return Boolean(isOnline && isClerkLoaded && !isClerkSignedIn && isLocallyAuthenticated);
}

export interface NavAccessParams {
  isAuthenticated: boolean;
  isInitialized: boolean;
  internalPatientId: string | null;
  hasPIN: boolean;
  isLocked: boolean;
  isLoading: boolean;
  onboardingComplete: boolean;
  onboardingLoading: boolean;
  isClerkLoaded: boolean;
  isClerkSignedIn: boolean;
  isReauthenticating: boolean;
}

export interface NavAccessState {
  isAppLoading: boolean;
  isOnboarding: boolean;
  isInAuthFlow: boolean;
  isSettingUpPIN: boolean;
  isLocked: boolean;
  isMainReady: boolean;
  isOnboardingWeb: boolean;
  isUnauthenticatedWeb: boolean;
  isSettingUpPINWeb: boolean;
  isMainReadyWeb: boolean;
}

export function resolveNavAccess(params: NavAccessParams): NavAccessState {
  const {
    isAuthenticated,
    isInitialized,
    internalPatientId,
    hasPIN,
    isLocked,
    isLoading,
    onboardingComplete,
    onboardingLoading,
    isClerkLoaded,
    isClerkSignedIn,
    isReauthenticating,
  } = params;

  let isAppLoading: boolean;
  if (isReauthenticating) {
    // Wait briefly only once Clerk signs back in while AuthContext verifies/switches account
    isAppLoading = isClerkSignedIn;
  } else if (isInitialized && internalPatientId && hasPIN) {
    isAppLoading = isLoading || onboardingLoading;
  } else if (isAuthenticated && !isInitialized) {
    isAppLoading = true;
  } else {
    isAppLoading = isLoading || onboardingLoading || !isClerkLoaded;
  }

  const isOnboarding = !isAppLoading && !isReauthenticating && !onboardingComplete;
  const isInAuthFlow =
    !isAppLoading &&
    ((isReauthenticating && !isClerkSignedIn) || (onboardingComplete && !isAuthenticated));
  const isSettingUpPIN =
    !isAppLoading && !isReauthenticating && onboardingComplete && isAuthenticated && isInitialized && !hasPIN;
  const locked =
    !isAppLoading &&
    !isReauthenticating &&
    onboardingComplete &&
    isAuthenticated &&
    isInitialized &&
    hasPIN &&
    isLocked;
  const isMainReady =
    !isAppLoading && !isReauthenticating && onboardingComplete && isAuthenticated && isInitialized && hasPIN;

  const isOnboardingWeb = !isAppLoading && !isAuthenticated && !isReauthenticating;
  const isUnauthenticatedWeb =
    !isAppLoading && (!isAuthenticated || (isReauthenticating && !isClerkSignedIn));
  const isSettingUpPINWeb =
    !isAppLoading && !isReauthenticating && isAuthenticated && isInitialized && !hasPIN;
  const isMainReadyWeb =
    !isAppLoading && !isReauthenticating && isAuthenticated && isInitialized && hasPIN;

  return {
    isAppLoading,
    isOnboarding,
    isInAuthFlow,
    isSettingUpPIN,
    isLocked: locked,
    isMainReady,
    isOnboardingWeb,
    isUnauthenticatedWeb,
    isSettingUpPINWeb,
    isMainReadyWeb,
  };
}
