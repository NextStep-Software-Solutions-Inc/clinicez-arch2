import { describe, expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  isSignInSecondFactorRequired,
  getAvailableSecondFactorStrategies,
  resolveDefaultSecondFactorStrategy,
  getSecondFactorSafeIdentifier,
  getSecondFactorStrategyMeta,
  prepareSecondFactorIfNeeded,
} from '../utils/mfaHelpers';

const APP_ROOT = join(import.meta.dir, '..');
const REPO_ROOT = join(APP_ROOT, '..', '..');

const readApp = (rel: string): string => readFileSync(join(APP_ROOT, rel), 'utf8');
const readRepo = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

describe('Patient App & Portal Web Auth Restyling and Brand Verification', () => {
  describe('Brand Assets and ClinicEzLogo', () => {
    test('brand SVG assets exist in patient-app public directory', () => {
      expect(existsSync(join(APP_ROOT, 'public/clinic-ez_logo.svg'))).toBe(true);
      expect(existsSync(join(APP_ROOT, 'public/clinic-ez_mark.svg'))).toBe(true);
    });

    test('ClinicEzLogo component is correctly implemented with design tokens and variants', () => {
      const source = readApp('components/ui/ClinicEzLogo.tsx');
      expect(source.includes('ClinicEzMark')).toBe(true);
      expect(source.includes('ClinicEzLogoProps')).toBe(true);
      expect(source.includes('variant?: ClinicEzMarkProps[\'variant\']')).toBe(true);
      expect(source.includes('showWordmark?: boolean')).toBe(true);
      expect(source.includes('subtitle?: string')).toBe(true);
      expect(source.includes('ThemedText')).toBe(true);
    });

    test('Welcome screen web renders ClinicEzLogo', () => {
      const source = readApp('navigation/screens/Welcome.screen.web.tsx');
      expect(source.includes('ClinicEzLogo')).toBe(true);
      expect(source.includes('Patient Portal')).toBe(true);
    });
  });

  describe('GoogleSignInButton Implementation', () => {
    test('GoogleSignInButton contains token guard ignore for trademark colors and authentic Google G icon', () => {
      const source = readApp('components/ui/GoogleSignInButton.tsx');
      expect(source.includes('token-guard:ignore-file')).toBe(true);
      expect(source.includes('GoogleSignInButtonProps')).toBe(true);
      expect(source.includes('Continue with Google')).toBe(true);
      expect(source.includes('#4285F4')).toBe(true);
      expect(source.includes('#34A853')).toBe(true);
      expect(source.includes('#FBBC05')).toBe(true);
      expect(source.includes('#EA4335')).toBe(true);
    });
  });

  describe('Patient Login Screen (Mobile & Web)', () => {
    test('Mobile Login screen contains ClinicEzLogo, GoogleSignInButton, dual identifier, and password toggle', () => {
      const source = readApp('navigation/screens/Login.screen.tsx');
      expect(source.includes('ClinicEzLogo')).toBe(true);
      expect(source.includes('GoogleSignInButton')).toBe(true);
      expect(source.includes('Email or Username')).toBe(true);
      expect(source.includes('showPassword')).toBe(true);
      expect(source.includes('useSSO')).toBe(true);
      expect(source.includes('signIn.password')).toBe(true);
      expect(source.includes('oauth_google')).toBe(true);
    });

    test('Web Login screen contains ClinicEzLogo, GoogleSignInButton, dual identifier, and password toggle', () => {
      const source = readApp('navigation/screens/Login.screen.web.tsx');
      expect(source.includes('ClinicEzLogo')).toBe(true);
      expect(source.includes('GoogleSignInButton')).toBe(true);
      expect(source.includes('Email or Username')).toBe(true);
      expect(source.includes('showPassword')).toBe(true);
      expect(source.includes('useSSO')).toBe(true);
      expect(source.includes('signIn.password')).toBe(true);
      expect(source.includes('oauth_google')).toBe(true);
    });
  });

  describe('Patient Signup Screen (Mobile & Web)', () => {
    test('Mobile Signup screen collects username and passes it to Clerk signUp.password()', () => {
      const source = readApp('navigation/screens/Signup.screen.tsx');
      expect(source.includes('ClinicEzLogo')).toBe(true);
      expect(source.includes('GoogleSignInButton')).toBe(true);
      expect(source.includes('username')).toBe(true);
      expect(source.includes('signUp.password')).toBe(true);
      expect(source.includes('username: username.trim().toLowerCase()')).toBe(true);
      expect(source.includes('showPassword')).toBe(true);
      expect(source.includes('useSSO')).toBe(true);
    });

    test('Web Signup screen collects username and passes it to Clerk signUp.password()', () => {
      const source = readApp('navigation/screens/Signup.screen.web.tsx');
      expect(source.includes('ClinicEzLogo')).toBe(true);
      expect(source.includes('GoogleSignInButton')).toBe(true);
      expect(source.includes('username')).toBe(true);
      expect(source.includes('signUp.password')).toBe(true);
      expect(source.includes('username: username.trim().toLowerCase()')).toBe(true);
      expect(source.includes('showPassword')).toBe(true);
      expect(source.includes('useSSO')).toBe(true);
    });
  });

  describe('Patient Verify Screen Missing Requirements Recovery (Mobile & Web)', () => {
    test('Mobile Verify screen handles missing_requirements and calls signUp.update() with username', () => {
      const source = readApp('navigation/screens/Verify.screen.tsx');
      expect(source.includes('missing_requirements')).toBe(true);
      expect(source.includes('signUp!.update')).toBe(true);
      expect(source.includes('isMissingRequirements')).toBe(true);
      expect(source.includes('Choose username')).toBe(true);
    });

    test('Web Verify screen handles missing_requirements and calls signUp.update() with username', () => {
      const source = readApp('navigation/screens/Verify.screen.web.tsx');
      expect(source.includes('missing_requirements')).toBe(true);
      expect(source.includes('signUp!.update')).toBe(true);
      expect(source.includes('isMissingRequirements')).toBe(true);
      expect(source.includes('Choose your username')).toBe(true);
    });
  });

  describe('Portal Web Clerk Username Enforce & Logo Alignment', () => {
    test('Portal CustomSignUpForm enforces username validation and complete-requirements step', () => {
      const source = readRepo('apps/portal-web/src/app/sign-up/_components/CustomSignUpForm.tsx');
      const flowSource = readRepo('apps/portal-web/src/app/sign-up/_lib/signUpFlow.ts');
      expect(source.includes('username')).toBe(true);
      expect(source.includes('signUp.create')).toBe(true);
      expect(source.includes('username: username.trim().toLowerCase()')).toBe(true);
      expect(source.includes('complete-requirements')).toBe(true);
      expect(source.includes('signUp.update')).toBe(true);
      expect(flowSource.includes('form_username_exists') || source.includes('form_username_exists')).toBe(true);
    });

    test('Portal CustomSignInForm supports Email or Username identifier', () => {
      const source = readRepo('apps/portal-web/src/app/sign-in/_components/CustomSignInForm.tsx');
      expect(source.includes('Email or Username')).toBe(true);
      expect(source.includes('handleGoogleSignIn')).toBe(true);
    });

    test('Portal Sign In and Sign Up pages render ClinicEzLogo brand component', () => {
      const signInPage = readRepo('apps/portal-web/src/app/sign-in/[[...sign-in]]/page.tsx');
      expect(signInPage.includes('ClinicEzLogo')).toBe(true);
      expect(signInPage.includes('<Stethoscope')).toBe(false);

      const signUpPage = readRepo('apps/portal-web/src/app/sign-up/[[...sign-up]]/page.tsx');
      expect(signUpPage.includes('ClinicEzLogo')).toBe(true);
      expect(signUpPage.includes('<Stethoscope')).toBe(false);
    });
  });

  describe('Multi-Factor Authentication (MFA) Helpers & Cross-Platform Flows', () => {
    test('isSignInSecondFactorRequired detects needs_second_factor and needs_client_trust', () => {
      expect(isSignInSecondFactorRequired('needs_second_factor')).toBe(true);
      expect(isSignInSecondFactorRequired('needs_client_trust')).toBe(true);
      expect(isSignInSecondFactorRequired('complete')).toBe(false);
      expect(isSignInSecondFactorRequired('needs_first_factor')).toBe(false);
      expect(isSignInSecondFactorRequired(null)).toBe(false);
      expect(isSignInSecondFactorRequired(undefined)).toBe(false);
      expect(isSignInSecondFactorRequired('')).toBe(false);
    });

    test('getAvailableSecondFactorStrategies orders strategies and preserves safeIdentifier', () => {
      const factors = getAvailableSecondFactorStrategies({
        status: 'needs_second_factor',
        supportedSecondFactors: [
          { strategy: 'backup_code' },
          { strategy: 'phone_code', safeIdentifier: '+63 ••• 4567' },
          { strategy: 'totp' },
          { strategy: 'email_code', safeIdentifier: 'p•••@clinicez.com' },
          { strategy: 'unknown_strategy' },
          { strategy: 'totp' },
        ],
      });

      expect(factors.map((f) => f.strategy)).toEqual([
        'totp',
        'phone_code',
        'email_code',
        'backup_code',
      ]);
      expect(factors[1].safeIdentifier).toBe('+63 ••• 4567');
      expect(factors[2].safeIdentifier).toBe('p•••@clinicez.com');
    });

    test('resolveDefaultSecondFactorStrategy prioritizes totp for standard MFA and email_code for client trust', () => {
      expect(
        resolveDefaultSecondFactorStrategy({
          status: 'needs_second_factor',
          supportedSecondFactors: [
            { strategy: 'backup_code' },
            { strategy: 'phone_code' },
            { strategy: 'totp' },
          ],
        }),
      ).toBe('totp');

      expect(
        resolveDefaultSecondFactorStrategy({
          status: 'needs_client_trust',
          supportedSecondFactors: [
            { strategy: 'totp' },
            { strategy: 'email_code' },
          ],
        }),
      ).toBe('email_code');

      expect(
        resolveDefaultSecondFactorStrategy({
          status: 'needs_second_factor',
          supportedSecondFactors: [],
        }),
      ).toBe('totp');

      expect(
        resolveDefaultSecondFactorStrategy({
          status: 'needs_client_trust',
          supportedSecondFactors: null,
        }),
      ).toBe('email_code');
    });

    test('prepareSecondFactorIfNeeded invokes sendPhoneCode, sendEmailCode, or prepareSecondFactor as needed', async () => {
      let phoneSent = 0;
      let emailSent = 0;
      let preparedParams: {
        strategy: 'phone_code' | 'email_code';
        phoneNumberId?: string;
        emailAddressId?: string;
      } | null = null;

      const mockSignIn = {
        mfa: {
          sendPhoneCode: async () => {
            phoneSent += 1;
            return { error: null };
          },
          sendEmailCode: async () => {
            emailSent += 1;
            return { error: null };
          },
        },
      };

      await prepareSecondFactorIfNeeded(mockSignIn, 'totp');
      await prepareSecondFactorIfNeeded(mockSignIn, 'backup_code');
      expect(phoneSent).toBe(0);
      expect(emailSent).toBe(0);

      await prepareSecondFactorIfNeeded(mockSignIn, 'phone_code');
      expect(phoneSent).toBe(1);

      await prepareSecondFactorIfNeeded(mockSignIn, 'email_code');
      expect(emailSent).toBe(1);

      const fallbackSignIn = {
        supportedSecondFactors: [
          { strategy: 'phone_code', phoneNumberId: 'phn_secondary', safeIdentifier: '+63 ••• 1111' },
          {
            strategy: 'phone_code',
            phoneNumberId: 'phn_default',
            safeIdentifier: '+63 ••• 2222',
            default: true,
          },
          {
            strategy: 'email_code',
            emailAddressId: 'idn_primary_email',
            safeIdentifier: 'd•••@clinicez.com',
            primary: true,
          },
        ],
        prepareSecondFactor: async (params: {
          strategy: 'phone_code' | 'email_code';
          phoneNumberId?: string;
          emailAddressId?: string;
        }) => {
          preparedParams = params;
        },
      };
      await prepareSecondFactorIfNeeded(fallbackSignIn, 'phone_code');
      expect(preparedParams).toEqual({
        strategy: 'phone_code',
        phoneNumberId: 'phn_default',
      });

      await prepareSecondFactorIfNeeded(fallbackSignIn, 'email_code');
      expect(preparedParams).toEqual({
        strategy: 'email_code',
        emailAddressId: 'idn_primary_email',
      });

      const throwingSignIn = {
        prepareSecondFactor: async () => {
          throw { errors: [{ longMessage: 'Rate limit exceeded for SMS' }] };
        },
      };
      const caughtResult = await prepareSecondFactorIfNeeded(throwingSignIn, 'phone_code');
      expect(caughtResult.error?.message).toBe('Rate limit exceeded for SMS');

      const nullResult = await prepareSecondFactorIfNeeded(null, 'email_code');
      expect(nullResult.error).toBeNull();
    });

    test('getSecondFactorSafeIdentifier and getAvailableSecondFactorStrategies prefer default and primary factors', () => {
      const signInObj = {
        status: 'needs_second_factor',
        supportedSecondFactors: [
          { strategy: 'phone_code', phoneNumberId: 'phn_1', safeIdentifier: '+63 ••• 0001' },
          {
            strategy: 'phone_code',
            phoneNumberId: 'phn_2',
            safeIdentifier: '+63 ••• 9999',
            default: true,
          },
          { strategy: 'email_code', emailAddressId: 'eml_1', safeIdentifier: 'a•••@clinicez.com' },
          {
            strategy: 'email_code',
            emailAddressId: 'eml_2',
            safeIdentifier: 'u•••@clinicez.com',
            primary: true,
          },
        ],
      };

      expect(getSecondFactorSafeIdentifier(signInObj, 'phone_code')).toBe('+63 ••• 9999');
      expect(getSecondFactorSafeIdentifier(signInObj, 'email_code')).toBe('u•••@clinicez.com');
      expect(getSecondFactorSafeIdentifier(signInObj, 'totp')).toBeNull();

      const strategies = getAvailableSecondFactorStrategies(signInObj);
      expect(strategies.find((s) => s.strategy === 'phone_code')?.phoneNumberId).toBe('phn_2');
      expect(strategies.find((s) => s.strategy === 'email_code')?.emailAddressId).toBe('eml_2');

      expect(getSecondFactorStrategyMeta('totp').icon).toBe('shield');
      expect(getSecondFactorStrategyMeta('phone_code', '+63 ••• 9999').subtitle).toContain('+63 ••• 9999');
      expect(getSecondFactorStrategyMeta('email_code', 'u•••@clinicez.com').icon).toBe('mail');
      expect(getSecondFactorStrategyMeta('backup_code').icon).toBe('key');
    });

    test('Portal CustomSignInForm, CustomSignUpForm, and SSO callbacks support MFA strategies and cross-flow routing', () => {
      const source = readRepo('apps/portal-web/src/app/sign-in/_components/CustomSignInForm.tsx');
      expect(source.includes('needs_second_factor')).toBe(true);
      expect(source.includes('needs_client_trust')).toBe(true);
      expect(source.includes('prepareSecondFactor')).toBe(true);
      expect(source.includes('attemptSecondFactor')).toBe(true);
      expect(source.includes('"totp"')).toBe(true);
      expect(source.includes('"phone_code"')).toBe(true);
      expect(source.includes('"email_code"')).toBe(true);
      expect(source.includes('"backup_code"')).toBe(true);
      expect(source.includes('Use another verification method')).toBe(true);
      expect(source.includes('autoEnteredSignInIdRef')).toBe(true);

      const signUpForm = readRepo('apps/portal-web/src/app/sign-up/_components/CustomSignUpForm.tsx');
      expect(signUpForm.includes('needs_second_factor')).toBe(true);
      expect(signUpForm.includes('needs_client_trust')).toBe(true);

      const signInSso = readRepo('apps/portal-web/src/app/sign-in/sso-callback/page.tsx');
      expect(signInSso.includes('secondFactorUrl="/sign-in"')).toBe(true);

      const signUpSso = readRepo('apps/portal-web/src/app/sign-up/sso-callback/page.tsx');
      expect(signUpSso.includes('secondFactorUrl="/sign-in"')).toBe(true);
    });

    test('Patient Login, Signup, & ForgotPassword screens (Mobile & Web) transition to Verify on MFA requirements', () => {
      for (const relPath of [
        'navigation/screens/Login.screen.tsx',
        'navigation/screens/Login.screen.web.tsx',
        'navigation/screens/Signup.screen.tsx',
        'navigation/screens/Signup.screen.web.tsx',
        'navigation/screens/ForgotPassword.screen.tsx',
        'navigation/screens/ForgotPassword.screen.web.tsx',
      ]) {
        const source = readApp(relPath);
        expect(source.includes('isSignInSecondFactorRequired')).toBe(true);
        expect(source.includes('resolveDefaultSecondFactorStrategy')).toBe(true);
        expect(source.includes('prepareSecondFactorIfNeeded')).toBe(true);
      }
    });

    test('Patient Verify screens (Mobile & Web) verify all 4 MFA strategies, prioritize isMFAFlow over missing_requirements, and support strategy switching', () => {
      for (const relPath of [
        'navigation/screens/Verify.screen.tsx',
        'navigation/screens/Verify.screen.web.tsx',
      ]) {
        const source = readApp(relPath);
        expect(source.includes('isSignInSecondFactorRequired')).toBe(true);
        expect(source.includes('needs_second_factor')).toBe(true);
        expect(source.includes('needs_client_trust')).toBe(true);
        expect(source.includes('!isMFAFlow && signUp?.status === \'missing_requirements\'')).toBe(true);
        expect(source.includes('verifyTOTP')).toBe(true);
        expect(source.includes('verifyPhoneCode')).toBe(true);
        expect(source.includes('verifyEmailCode')).toBe(true);
        expect(source.includes('verifyBackupCode')).toBe(true);
        expect(source.includes('sendPhoneCode')).toBe(true);
        expect(source.includes('sendEmailCode')).toBe(true);
        expect(source.includes('USE ANOTHER VERIFICATION METHOD')).toBe(true);
      }
    });
  });
});
