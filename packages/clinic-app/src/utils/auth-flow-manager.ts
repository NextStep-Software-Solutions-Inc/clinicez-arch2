/**
 * Authentication Flow Management Utilities
 * Reduces complex if-else chains and provides a more maintainable approach
 * Follows Strategy Pattern and State Machine principles
 */

import { SignInResource, SignUpResource } from "@clerk/types";
import { type AuthErrorResult } from "./auth-error-handler";

// Authentication Flow States
export type AuthFlowState =
  | "idle"
  | "email_verification_required"
  | "password_required"
  | "password_creation_required"
  | "two_factor_required"
  | "complete"
  | "error";

// Authentication Action Types
export type AuthAction =
  | "email_code"
  | "password"
  | "two_factor"
  | "complete_profile"
  | "reset_password";

// Navigation Routes
export type AuthRoute =
  | "/(auth)/sign-in"
  | "/(auth)/verify"
  | "/(auth)/reset-password"
  | "/(main)/complete-profile"
  | "/(main)/(tabs)";

// Authentication Flow Result
export interface AuthFlowResult {
  state: AuthFlowState;
  action?: AuthAction;
  route?: AuthRoute;
  error?: AuthErrorResult;
  requiresUserInput?: boolean;
  metadata?: Record<string, unknown>;
}

// Sign-in Attempt Analysis
export interface SignInAnalysis {
  hasEmailCode: boolean;
  hasPassword: boolean;
  hasTwoFactor: boolean;
  emailAddressId?: string;
  phoneNumberId?: string;
}

/**
 * Analyzes a sign-in attempt and determines the next flow step
 * Eliminates complex nested if-else statements
 */
export class AuthFlowManager {

  /**
   * Analyzes supported first factors from a sign-in attempt
   */
  private static analyzeSignInAttempt(signIn: SignInResource): SignInAnalysis {
    const supportedFactors = signIn.supportedFirstFactors || [];

    const emailCodeFactor = supportedFactors.find(
      factor => factor.strategy === "email_code"
    );

    const passwordFactor = supportedFactors.find(
      factor => factor.strategy === "password"
    );

    const twoFactorFactor = supportedFactors.find(
      factor => factor.strategy === "phone_code"
    );

    return {
      hasEmailCode: !!emailCodeFactor,
      hasPassword: !!passwordFactor,
      hasTwoFactor: !!twoFactorFactor,
      emailAddressId: emailCodeFactor?.emailAddressId,
      phoneNumberId: twoFactorFactor?.phoneNumberId,
    };
  }

  /**
   * Determines the next step in the authentication flow
   * Replaces complex if-else chains with a clear state machine approach
   */
  static determineAuthFlow(
    signIn: SignInResource,
    preferPasswordless: boolean = true
  ): AuthFlowResult {

    // Handle completed sign-in
    if (signIn.status === "complete") {
      return {
        state: "complete",
        route: "/(main)/(tabs)",
        requiresUserInput: false,
      };
    }

    // Handle cases requiring first factor
    if (signIn.status === "needs_first_factor") {
      const analysis = this.analyzeSignInAttempt(signIn);

      // Define flow strategies based on available factors
      const flowStrategies = [
        // Strategy 1: Email code only
        {
          condition: analysis.hasEmailCode && !analysis.hasPassword,
          result: {
            state: "email_verification_required" as AuthFlowState,
            action: "email_code" as AuthAction,
            route: "/(auth)/verify" as AuthRoute,
            requiresUserInput: false,
            metadata: { emailAddressId: analysis.emailAddressId }
          }
        },
        // Strategy 2: Password only
        {
          condition: !analysis.hasEmailCode && analysis.hasPassword,
          result: {
            state: "password_required" as AuthFlowState,
            requiresUserInput: true,
          }
        },
        // Strategy 3: Both available - prefer passwordless
        {
          condition: analysis.hasEmailCode && analysis.hasPassword && preferPasswordless,
          result: {
            state: "email_verification_required" as AuthFlowState,
            action: "email_code" as AuthAction,
            route: "/(auth)/verify" as AuthRoute,
            requiresUserInput: false,
            metadata: { emailAddressId: analysis.emailAddressId }
          }
        },
        // Strategy 4: Both available - prefer password
        {
          condition: analysis.hasEmailCode && analysis.hasPassword && !preferPasswordless,
          result: {
            state: "password_required" as AuthFlowState,
            requiresUserInput: true,
          }
        }
      ];

      // Execute first matching strategy
      const matchedStrategy = flowStrategies.find(strategy => strategy.condition);
      if (matchedStrategy) {
        return matchedStrategy.result;
      }

      // No supported factors
      return {
        state: "error",
        error: {
          hasError: true,
          errorMessage: "No supported authentication methods available for this account.",
          errorCode: "no_supported_factors",
        }
      };
    }

    // Handle second factor requirement
    if (signIn.status === "needs_second_factor") {
      return {
        state: "two_factor_required",
        action: "two_factor",
        requiresUserInput: true,
        error: {
          hasError: true,
          errorMessage: "Two-factor authentication is required but not yet implemented.",
          errorCode: "needs_second_factor",
        }
      };
    }

    // Unexpected status
    return {
      state: "error",
      error: {
        hasError: true,
        errorMessage: "Unable to proceed with sign-in. Please try again.",
        errorCode: "unexpected_status",
      }
    };
  }

  /**
   * Determines post-verification flow (after successful email/SMS verification)
   */
  static determinePostVerificationFlow(isFirstTimeUser: boolean): AuthFlowResult {
    if (isFirstTimeUser) {
      return {
        state: "complete",
        route: "/(main)/complete-profile",
        requiresUserInput: false,
      };
    }

    return {
      state: "complete",
      route: "/(main)/(tabs)",
      requiresUserInput: false,
    };
  }

  /**
   * Handles password flow completion
   */
  static handlePasswordFlow(signIn: SignInResource): AuthFlowResult {
    if (signIn.status === "complete") {
      return {
        state: "complete",
        route: "/(main)/(tabs)",
        requiresUserInput: false,
      };
    }

    if (signIn.status === "needs_first_factor") {
      const analysis = this.analyzeSignInAttempt(signIn);

      if (analysis.hasEmailCode) {
        return {
          state: "email_verification_required",
          action: "email_code",
          route: "/(auth)/verify",
          requiresUserInput: false,
          metadata: { emailAddressId: analysis.emailAddressId }
        };
      }
    }

    return {
      state: "error",
      error: {
        hasError: true,
        errorMessage: "Sign-in incomplete. Please try again.",
        errorCode: "signin_incomplete",
      }
    };
  }

  /**
   * Validates required input based on current flow state
   */
  static validateFlowInput(state: AuthFlowState, input: Record<string, string>): AuthErrorResult | null {
    switch (state) {
      case "password_required":
        if (!input.password || input.password.trim() === "") {
          return {
            hasError: true,
            errorMessage: "Password is required.",
            errorCode: "password_required",
          };
        }
        break;

      case "email_verification_required":
        if (!input.code || input.code.length !== 6) {
          return {
            hasError: true,
            errorMessage: "Please enter a valid 6-digit verification code.",
            errorCode: "invalid_verification_code",
          };
        }
        break;
    }

    return null;
  }
}