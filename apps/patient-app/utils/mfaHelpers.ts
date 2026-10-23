export type SecondFactorStrategy = 'totp' | 'phone_code' | 'email_code' | 'backup_code';

export type SecondFactorIconName = 'shield' | 'phone' | 'mail' | 'key';

export interface SecondFactorDescriptor {
  strategy: string;
  safeIdentifier?: string;
  phoneNumberId?: string;
  emailAddressId?: string;
  primary?: boolean;
  default?: boolean;
}

export interface SecondFactorOption {
  strategy: SecondFactorStrategy;
  safeIdentifier?: string;
  phoneNumberId?: string;
  emailAddressId?: string;
  label: string;
  icon: SecondFactorIconName;
}

export interface MfaSignInLike {
  status?: string | null;
  supportedSecondFactors?: SecondFactorDescriptor[] | null;
  mfa?: {
    sendPhoneCode?: () => Promise<{ error?: { message?: string } | null } | void>;
    sendEmailCode?: () => Promise<{ error?: { message?: string } | null } | void>;
  };
  prepareSecondFactor?: (params: {
    strategy: 'phone_code' | 'email_code';
    phoneNumberId?: string;
    emailAddressId?: string;
  }) => Promise<unknown>;
}

const STRATEGY_LABELS: Record<SecondFactorStrategy, string> = {
  totp: 'Authenticator App',
  phone_code: 'SMS Code',
  email_code: 'Email Code',
  backup_code: 'Backup Code',
};

const STRATEGY_ICONS: Record<SecondFactorStrategy, SecondFactorIconName> = {
  totp: 'shield',
  phone_code: 'phone',
  email_code: 'mail',
  backup_code: 'key',
};

const DEFAULT_PRIORITY: SecondFactorStrategy[] = [
  'totp',
  'phone_code',
  'email_code',
  'backup_code',
];

const CLIENT_TRUST_PRIORITY: SecondFactorStrategy[] = [
  'email_code',
  'totp',
  'phone_code',
  'backup_code',
];

function isSupportedStrategy(strategy: string): strategy is SecondFactorStrategy {
  return (
    strategy === 'totp' ||
    strategy === 'phone_code' ||
    strategy === 'email_code' ||
    strategy === 'backup_code'
  );
}

function findBestFactorForStrategy(
  factors: SecondFactorDescriptor[] | null | undefined,
  strategy: SecondFactorStrategy,
): SecondFactorDescriptor | undefined {
  if (!factors || factors.length === 0) return undefined;
  const matches = factors.filter((f) => f && f.strategy === strategy);
  if (matches.length === 0) return undefined;
  return (
    matches.find((f) => f.default === true) ??
    matches.find((f) => f.primary === true) ??
    matches[0]
  );
}

export function isSignInSecondFactorRequired(status: string | null | undefined): boolean {
  return status === 'needs_second_factor' || status === 'needs_client_trust';
}

export function getAvailableSecondFactorStrategies(
  signIn: MfaSignInLike | null | undefined,
): SecondFactorOption[] {
  const rawFactors = signIn?.supportedSecondFactors ?? [];
  const strategiesPresent = new Set<SecondFactorStrategy>();

  for (const factor of rawFactors) {
    if (factor && isSupportedStrategy(factor.strategy)) {
      strategiesPresent.add(factor.strategy);
    }
  }

  const priority =
    signIn?.status === 'needs_client_trust' ? CLIENT_TRUST_PRIORITY : DEFAULT_PRIORITY;
  const ordered = priority
    .filter((strategy) => strategiesPresent.has(strategy))
    .map((strategy) => {
      const best = findBestFactorForStrategy(rawFactors, strategy);
      return {
        strategy,
        safeIdentifier: best?.safeIdentifier,
        phoneNumberId: best?.phoneNumberId,
        emailAddressId: best?.emailAddressId,
        label: STRATEGY_LABELS[strategy],
        icon: STRATEGY_ICONS[strategy],
      };
    });

  if (ordered.length > 0) {
    return ordered;
  }

  if (isSignInSecondFactorRequired(signIn?.status)) {
    const fallback: SecondFactorStrategy =
      signIn?.status === 'needs_client_trust' ? 'email_code' : 'totp';
    return [
      {
        strategy: fallback,
        label: STRATEGY_LABELS[fallback],
        icon: STRATEGY_ICONS[fallback],
      },
    ];
  }

  return [];
}

export function resolveDefaultSecondFactorStrategy(
  signIn: MfaSignInLike | null | undefined,
): SecondFactorStrategy {
  const available = getAvailableSecondFactorStrategies(signIn);
  if (available.length > 0) {
    return available[0].strategy;
  }
  return signIn?.status === 'needs_client_trust' ? 'email_code' : 'totp';
}

export function getSecondFactorSafeIdentifier(
  signIn: MfaSignInLike | null | undefined,
  strategy: SecondFactorStrategy,
): string | null {
  const match = findBestFactorForStrategy(signIn?.supportedSecondFactors, strategy);
  return match?.safeIdentifier ?? null;
}

export function getSecondFactorStrategyMeta(
  strategy: SecondFactorStrategy,
  safeIdentifier?: string | null,
): {
  title: string;
  subtitle: string;
  fieldLabel: string;
  icon: SecondFactorIconName;
  label: string;
} {
  switch (strategy) {
    case 'totp':
      return {
        title: 'Two-factor authentication',
        subtitle:
          'Enter the 6-digit code from your authenticator app to complete sign in.',
        fieldLabel: 'Authenticator code',
        icon: 'shield',
        label: STRATEGY_LABELS.totp,
      };
    case 'phone_code':
      return {
        title: 'Check your phone',
        subtitle: `Enter the 6-digit SMS code sent${safeIdentifier ? ` to ${safeIdentifier}` : ' to your phone'} to continue.`,
        fieldLabel: '6-digit SMS code',
        icon: 'phone',
        label: STRATEGY_LABELS.phone_code,
      };
    case 'email_code':
      return {
        title: 'Check your email',
        subtitle: `We sent a verification code${safeIdentifier ? ` to ${safeIdentifier}` : ' to your email'}. Enter it below to continue.`,
        fieldLabel: 'Verification code',
        icon: 'mail',
        label: STRATEGY_LABELS.email_code,
      };
    case 'backup_code':
      return {
        title: 'Enter backup code',
        subtitle:
          'Enter one of your single-use recovery backup codes to complete sign in.',
        fieldLabel: 'Recovery backup code',
        icon: 'key',
        label: STRATEGY_LABELS.backup_code,
      };
  }
}

export async function prepareSecondFactorIfNeeded(
  signIn: MfaSignInLike | null | undefined,
  strategy: SecondFactorStrategy,
): Promise<{ error: { message?: string } | null }> {
  if (!signIn) {
    return { error: null };
  }

  try {
    const bestFactor = findBestFactorForStrategy(signIn.supportedSecondFactors, strategy);

    if (strategy === 'phone_code') {
      if (signIn.mfa?.sendPhoneCode) {
        const res = await signIn.mfa.sendPhoneCode();
        return { error: (res && 'error' in res ? res.error : null) ?? null };
      }
      if (signIn.prepareSecondFactor) {
        await signIn.prepareSecondFactor({
          strategy: 'phone_code',
          ...(bestFactor?.phoneNumberId ? { phoneNumberId: bestFactor.phoneNumberId } : {}),
        });
        return { error: null };
      }
    } else if (strategy === 'email_code') {
      if (signIn.mfa?.sendEmailCode) {
        const res = await signIn.mfa.sendEmailCode();
        return { error: (res && 'error' in res ? res.error : null) ?? null };
      }
      if (signIn.prepareSecondFactor) {
        await signIn.prepareSecondFactor({
          strategy: 'email_code',
          ...(bestFactor?.emailAddressId ? { emailAddressId: bestFactor.emailAddressId } : {}),
        });
        return { error: null };
      }
    }

    return { error: null };
  } catch (err: any) {
    const message =
      err?.errors?.[0]?.longMessage ||
      err?.errors?.[0]?.message ||
      err?.message ||
      'Failed to send verification code.';
    return { error: { message } };
  }
}
