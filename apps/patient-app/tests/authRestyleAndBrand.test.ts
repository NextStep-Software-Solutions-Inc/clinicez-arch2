import { describe, expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
      expect(source.includes('username')).toBe(true);
      expect(source.includes('signUp.create')).toBe(true);
      expect(source.includes('username: username.trim().toLowerCase()')).toBe(true);
      expect(source.includes('complete-requirements')).toBe(true);
      expect(source.includes('signUp.update')).toBe(true);
      expect(source.includes('form_username_exists')).toBe(true);
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
});
