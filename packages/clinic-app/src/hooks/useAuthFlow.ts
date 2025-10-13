/**
 * Custom Authentication Hook
 * Encapsulates auth logic and reduces component complexity
 * Follows the Custom Hook Pattern for reusability
 */

import { useState, useCallback } from "react";
import { useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { AuthFlowManager, type AuthFlowResult } from "@utils/auth-flow-manager";
import { handleAuthError, type AuthErrorResult } from "@utils/auth-error-handler";
import { determinePostAuthRoute } from "@utils/post-auth-navigation";

export interface UseAuthFlowProps {
  preferPasswordless?: boolean;
  onSuccess?: () => void;
  onError?: (error: AuthErrorResult) => void;
}

export interface UseAuthFlowReturn {
  // State
  isLoading: boolean;
  authError: AuthErrorResult | null;
  needsPassword: boolean;
  userEmail: string;

  // Actions
  signInWithEmail: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  clearError: () => void;
  setUserEmail: (email: string) => void;

  // Utilities
  getCurrentFlowState: () => AuthFlowResult | null;
}

/**
 * Custom hook for managing authentication flow
 * Eliminates complex component logic and provides clean interface
 */
export const useAuthFlow = ({
  preferPasswordless = true,
  onSuccess,
  onError
}: UseAuthFlowProps = {}): UseAuthFlowReturn => {

  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  // Local state
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<AuthErrorResult | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [currentFlowResult, setCurrentFlowResult] = useState<AuthFlowResult | null>(null);

  // Clear error helper
  const clearError = useCallback(() => {
    setAuthError(null);
  }, []);

  // Handle successful authentication
  const handleAuthSuccess = useCallback(async (sessionId: string) => {
    if (!setActive) return;

    try {
      await setActive({ session: sessionId });
      const nextRoute = await determinePostAuthRoute();
      router.replace(nextRoute);
      onSuccess?.();
    } catch (error) {
      const errorResult = handleAuthError(error);
      setAuthError(errorResult);
      onError?.(errorResult);
    }
  }, [setActive, onSuccess, onError, router]);

  // Handle flow navigation
  const handleFlowNavigation = useCallback(async (flowResult: AuthFlowResult) => {
    setCurrentFlowResult(flowResult);

    if (flowResult.error) {
      setAuthError(flowResult.error);
      onError?.(flowResult.error);
      return;
    }

    switch (flowResult.state) {
      case "email_verification_required":
        if (flowResult.action === "email_code" && flowResult.metadata?.emailAddressId) {
          try {
            await signIn?.prepareFirstFactor({
              strategy: "email_code",
              emailAddressId: flowResult.metadata.emailAddressId as string,
            });
            if (flowResult.route) {
              router.push(flowResult.route);
            }
          } catch (error) {
            const errorResult = handleAuthError(error);
            setAuthError(errorResult);
            onError?.(errorResult);
          }
        }
        break;

      case "password_required":
        setNeedsPassword(true);
        break;

      case "complete": {
        const nextRoute = flowResult.route === "/(main)/(tabs)" || !flowResult.route
          ? await determinePostAuthRoute()
          : flowResult.route;
        router.replace(nextRoute);
        break;
      }
    }
  }, [signIn, router, onError]);

  // Sign in with email only
  const signInWithEmail = useCallback(async (email: string) => {
    if (!isLoaded || !signIn || isLoading) return;

    setIsLoading(true);
    setAuthError(null);
    setUserEmail(email);

    try {
      const signInAttempt = await signIn.create({
        identifier: email,
      });

      const flowResult = AuthFlowManager.determineAuthFlow(signInAttempt, preferPasswordless);

      if (flowResult.state === "complete" && signInAttempt.createdSessionId) {
        await handleAuthSuccess(signInAttempt.createdSessionId);
      } else {
        await handleFlowNavigation(flowResult);
      }
    } catch (error) {
      const errorResult = handleAuthError(error);
      setAuthError(errorResult);
      onError?.(errorResult);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, signIn, isLoading, preferPasswordless, handleAuthSuccess, handleFlowNavigation, onError]);

  // Sign in with email and password
  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!isLoaded || !signIn || isLoading) return;

    // Validate input
    const validationError = AuthFlowManager.validateFlowInput("password_required", { password });
    if (validationError) {
      setAuthError(validationError);
      onError?.(validationError);
      return;
    }

    setIsLoading(true);
    setAuthError(null);
    setUserEmail(email);

    try {
      const signInAttempt = await signIn.create({
        identifier: email,
        password: password,
      });

      const flowResult = AuthFlowManager.handlePasswordFlow(signInAttempt);

      if (flowResult.state === "complete" && signInAttempt.createdSessionId) {
        await handleAuthSuccess(signInAttempt.createdSessionId);
      } else {
        await handleFlowNavigation(flowResult);
      }
    } catch (error) {
      const errorResult = handleAuthError(error);
      setAuthError(errorResult);
      onError?.(errorResult);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, signIn, isLoading, handleAuthSuccess, handleFlowNavigation, onError]);

  // Verify code (email or SMS)
  const verifyCode = useCallback(async (code: string) => {
    if (!isLoaded || !signIn || isLoading) return;

    // Validate input
    const validationError = AuthFlowManager.validateFlowInput("email_verification_required", { code });
    if (validationError) {
      setAuthError(validationError);
      onError?.(validationError);
      return;
    }

    setIsLoading(true);
    setAuthError(null);

    try {
      const completeSignIn = await signIn.attemptFirstFactor({
        strategy: "email_code",
        code: code,
      });

      if (completeSignIn.status === "complete" && completeSignIn.createdSessionId && setActive) {
        await setActive({ session: completeSignIn.createdSessionId });

        const nextRoute = await determinePostAuthRoute();
        router.replace(nextRoute);
        onSuccess?.();
      } else {
        const errorResult: AuthErrorResult = {
          hasError: true,
          errorMessage: "Verification incomplete. Please try again.",
          errorCode: "verification_incomplete",
        };
        setAuthError(errorResult);
        onError?.(errorResult);
      }
    } catch (error) {
      const errorResult = handleAuthError(error);
      setAuthError(errorResult);
      onError?.(errorResult);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, signIn, isLoading, setActive, router, onSuccess, onError]);

  // Get current flow state
  const getCurrentFlowState = useCallback(() => {
    return currentFlowResult;
  }, [currentFlowResult]);

  return {
    // State
    isLoading,
    authError,
    needsPassword,
    userEmail,

    // Actions
    signInWithEmail,
    signInWithPassword,
    verifyCode,
    clearError,
    setUserEmail,

    // Utilities
    getCurrentFlowState,
  };
};