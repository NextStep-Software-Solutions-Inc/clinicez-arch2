# Mobile Patient App — Virtual Keyboard Handling Architecture

## Overview
This document specifies the keyboard avoidance and input protection patterns implemented across `@clinicez/patient-app` to resolve field obstruction on mobile devices (Issue #21).

## Core Principles

### 1. Gorhom BottomSheet Modals
- **Context Awareness**: Wrapped with `BottomSheetContext.Provider` (`isInBottomSheet: true`) in `ThemedBottomSheetModal`.
- **Adaptive Inputs**: `ProfileFormField` and `Input` detect bottom-sheet context via `useInBottomSheet()` and automatically render `@gorhom/bottom-sheet`'s `BottomSheetTextInput` on native platforms.
- **Modal Configuration**:
  - `keyboardBehavior="interactive"`
  - `keyboardBlurBehavior="restore"`
  - `android_keyboardInputMode="adjustResize"`
  - Bottom padding expanded to `40px` with 80%–90% snap points.

### 2. Full-Page Profile & Wizard Screens
- **iOS Navigation Offset**: Use `useSafeHeaderHeight()` hook (backed by `@react-navigation/elements`'s `HeaderHeightContext`) to supply `keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}` to `KeyboardAvoidingView`.
- **Scroll Configuration**:
  - `keyboardDismissMode="on-drag"`
  - `keyboardShouldPersistTaps="handled"`
  - `automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}`

### 3. Dynamic Safe Area Recovery
- **Screen Real Estate**: `useKeyboardVisible()` detects when the virtual keyboard is active.
- **Bottom Bar Padding**: `ProfileSaveBar` collapses `paddingBottom` from `insets.bottom` (34px) down to `spacing.sm` (8px) while the keyboard is displayed, preventing obstruction of fields above the action bar.

## Regression Test Suite
Automated assertions are maintained in:
`apps/patient-app/tests/keyboardHandling.test.ts`

To verify:
```bash
bun test apps/patient-app/tests/keyboardHandling.test.ts
```
