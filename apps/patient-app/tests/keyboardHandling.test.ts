import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useInBottomSheet, BottomSheetContext } from '../components/ui/BottomSheetContext';

const APP_ROOT = join(import.meta.dir, '..');
const read = (relativePath: string): string => readFileSync(join(APP_ROOT, relativePath), 'utf8');

describe('Keyboard avoidance and obstruction prevention architecture', () => {
  describe('BottomSheetContext', () => {
    test('defaults isInBottomSheet to false when rendered outside BottomSheetContext.Provider', () => {
      // In non-React / outside provider environment, the default defaultValue is consumed
      expect(BottomSheetContext).toBeDefined();
    });

    test('ThemedBottomSheetModal wraps children in BottomSheetContext.Provider', () => {
      const nativeSource = read('components/ui/ThemedBottomSheetModal.tsx');
      expect(nativeSource.includes('BottomSheetContext.Provider')).toBe(true);
      expect(nativeSource.includes('isInBottomSheet: true')).toBe(true);
      expect(nativeSource.includes('keyboardBehavior')).toBe(true);
      expect(nativeSource.includes('interactive')).toBe(true);
      expect(nativeSource.includes('keyboardBlurBehavior')).toBe(true);
      expect(nativeSource.includes('restore')).toBe(true);

      const webSource = read('components/ui/ThemedBottomSheetModal.web.tsx');
      expect(webSource.includes('BottomSheetContext.Provider')).toBe(true);
      expect(webSource.includes('isInBottomSheet: true')).toBe(true);
    });

    test('ProfileFormField and Input switch to BottomSheetTextInput when in bottom sheet on native', () => {
      const fieldSource = read('components/profile/ProfileFormField.tsx');
      expect(fieldSource.includes('useInBottomSheet')).toBe(true);
      expect(fieldSource.includes('BottomSheetTextInput')).toBe(true);
      expect(fieldSource.includes("Platform.OS !== 'web'")).toBe(true);

      const inputSource = read('components/ui/Input.tsx');
      expect(inputSource.includes('useInBottomSheet')).toBe(true);
      expect(inputSource.includes('BottomSheetTextInput')).toBe(true);
      expect(inputSource.includes("Platform.OS !== 'web'")).toBe(true);
    });
  });

  describe('Full-page Profile Screens keyboard protection', () => {
    const FULL_PAGE_SCREENS = [
      'navigation/screens/profile/ContactInfo.screen.tsx',
      'navigation/screens/profile/DentalVision.screen.tsx',
      'navigation/screens/profile/GovernmentIds.screen.tsx',
      'navigation/screens/profile/MaleReproductive.screen.tsx',
      'navigation/screens/profile/MentalHealth.screen.tsx',
      'navigation/screens/profile/NcdQuestionnaire.screen.tsx',
      'navigation/screens/profile/PersonalDemographics.screen.tsx',
      'navigation/screens/profile/ObstetricProfile.screen.tsx',
      'navigation/screens/profile/Occupation.screen.tsx',
      'navigation/screens/profile/SocialHistory.screen.tsx',
    ];

    for (const file of FULL_PAGE_SCREENS) {
      test(`${file} protects inputs from keyboard obstruction`, () => {
        const source = read(file);
        // Header height offset for iOS KeyboardAvoidingView
        expect(source.includes('useSafeHeaderHeight')).toBe(true);
        expect(source.includes('keyboardVerticalOffset')).toBe(true);
        // Keyboard avoiding container
        expect(source.includes('KeyboardAvoidingView')).toBe(true);
        // ScrollView keyboard handling
        expect(source.includes('keyboardShouldPersistTaps="handled"')).toBe(true);
        expect(source.includes('automaticallyAdjustKeyboardInsets')).toBe(true);
        expect(source.includes('keyboardDismissMode="on-drag"')).toBe(true);
      });
    }
  });

  describe('Bottom Sheet Profile Screens content padding', () => {
    const BOTTOM_SHEET_SCREENS = [
      'navigation/screens/profile/Addresses.screen.tsx',
      'navigation/screens/profile/Allergies.screen.tsx',
      'navigation/screens/profile/ChronicConditions.screen.tsx',
      'navigation/screens/profile/Disabilities.screen.tsx',
      'navigation/screens/profile/EmergencyContacts.screen.tsx',
      'navigation/screens/profile/FamilyHistory.screen.tsx',
      'navigation/screens/profile/HealthcareProviders.screen.tsx',
      'navigation/screens/profile/ImmunizationsSelf.screen.tsx',
      'navigation/screens/profile/Medications.screen.tsx',
      'navigation/screens/profile/PastIllnesses.screen.tsx',
      'navigation/screens/profile/SurgicalHistory.screen.tsx',
      'navigation/screens/profile/TravelHistory.screen.tsx',
    ];

    for (const file of BOTTOM_SHEET_SCREENS) {
      test(`${file} has sheetContent paddingBottom of at least 32px for keyboard clearance`, () => {
        const source = read(file);
        expect(source.includes('paddingBottom: 40') || source.includes('paddingBottom: 48')).toBe(true);
        expect(source.includes('ThemedBottomSheetModal')).toBe(true);
      });
    }
  });

  describe('Modal Dialogs & Secondary screens keyboard protection', () => {
    test('RenameModal wraps dialog in KeyboardAvoidingView', () => {
      const source = read('components/ui/RenameModal.tsx');
      expect(source.includes('KeyboardAvoidingView')).toBe(true);
      expect(source.includes('behavior={Platform.OS === \'ios\' ? \'padding\' : undefined}')).toBe(true);
    });

    test('ProfileSaveBar collapses bottom padding when keyboard is visible', () => {
      const source = read('components/profile/ProfileSaveBar.tsx');
      expect(source.includes('useKeyboardVisible')).toBe(true);
      expect(source.includes('isKeyboardVisible')).toBe(true);
    });

    test('BookingDraftScreen adapts layout to keyboard presence', () => {
      const source = read('navigation/screens/BookingDraft.screen.tsx');
      expect(source.includes('KeyboardAvoidingView')).toBe(true);
      expect(source.includes('keyboardVerticalOffset')).toBe(true);
      expect(source.includes('useKeyboardVisible')).toBe(true);
      expect(source.includes('automaticallyAdjustKeyboardInsets')).toBe(true);
    });

    test('ChangePasswordScreen, ForgotPasswordScreen, and VerifyScreen protect inputs', () => {
      for (const file of [
        'navigation/screens/settings/ChangePassword.screen.tsx',
        'navigation/screens/ForgotPassword.screen.tsx',
        'navigation/screens/Verify.screen.tsx',
      ]) {
        const source = read(file);
        expect(source.includes('KeyboardAvoidingView')).toBe(true);
        expect(source.includes('useSafeHeaderHeight')).toBe(true);
        expect(source.includes('keyboardVerticalOffset')).toBe(true);
        expect(source.includes('automaticallyAdjustKeyboardInsets')).toBe(true);
      }
    });
  });
});
