// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress, testID }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  Switch: createMockComponent('Switch'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Image: createMockComponent('Image'),
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  Alert: { alert: () => {} },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  NativeEventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeAllListeners() {}
  },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
  },
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
  Polyline: 'Polyline',
  Polygon: 'Polygon',
}));

mock.module('@expo/vector-icons', () => ({
  Feather: 'Feather',
  Ionicons: 'Ionicons',
  MaterialIcons: 'MaterialIcons',
}));

describe('Billing Zero-Balance Settlement & Patient Registry Search Suite', () => {
  const billingScreenPath = path.resolve(__dirname, '../navigation/screens/Billing.screen.tsx');
  const billingContent = fs.readFileSync(billingScreenPath, 'utf8');

  describe('Suite 1: Zero-Balance Settlement & PhilHealth Claim Validation', () => {
    test('1.1 Settle button disabled condition permits amountToCollect === 0 when balanceDue === 0', () => {
      // Must not have simple amountToCollect <= 0 which unconditionally disables 0-balance settlement
      expect(billingContent).not.toMatch(/disabled=\{[^}]*amountToCollect <= 0\s*\|\|/);
      // Must specifically guard against amountToCollect <= 0 when balanceDue > 0
      expect(billingContent).toContain('(amountToCollect <= 0 && balanceDue > 0)');
    });

    test('1.2 PhilHealth settlement requires reference number before enabling settle button', () => {
      expect(billingContent).toContain("(paymentMethod === 'PhilHealthKonsulta' && balanceDue === 0 && !referenceNumber.trim())");
      expect(billingContent).toContain('Enter the PhilHealth transaction or claim number above to enable settlement.');
    });

    test('1.3 Settle button title adjusts dynamically for PhilHealth zero-balance clearance', () => {
      expect(billingContent).toContain("paymentMethod === 'PhilHealthKonsulta'");
      expect(billingContent).toContain('Settle & Issue PhilHealth Clearance · ₱0.00');
    });

    test('1.4 handleSettlePayment permits ₱0.00 collection and validates PhilHealth reference number', () => {
      expect(billingContent).toContain('if (amountToCollect <= 0 && balanceDue > 0)');
      expect(billingContent).toContain("if (paymentMethod === 'PhilHealthKonsulta' && !referenceNumber.trim())");
      expect(billingContent).toContain('Enter a valid PhilHealth claim or transaction reference number to settle this account.');
    });

    test('1.5 recordPayment is dispatched for ₱0.00 settlements when balanceDue === 0', () => {
      expect(billingContent).toContain('if (amountToCollect > 0 || balanceDue === 0)');
      expect(billingContent).toContain('Settled (₱0.00 / 100% discount /');
    });

    test('1.6 Auto-completes linked queue item on ₱0.00 settlement', () => {
      expect(billingContent).toContain('(!isPartialPayment || amountToCollect >= balanceDue || balanceDue === 0) && selectedPatient?.queueItemId');
    });

    test('1.7 handleDiscountTypeChange auto-sets payment method to PhilHealth when 100% PhilHealth discount is chosen', () => {
      expect(billingContent).toContain("setPaymentMethod('PhilHealthKonsulta')");
    });
  });

  describe('Suite 2: Patient Registry Search UX Improvements', () => {
    test('2.1 Provides debounced automatic search on query input (350ms)', () => {
      expect(billingContent).toContain('term.length < 2');
      expect(billingContent).toContain('handleSearchRegistry');
      expect(billingContent).toContain('setTimeout');
      expect(billingContent).toContain('350');
    });

    test('2.2 Provides clear button to reset registry search query and results', () => {
      expect(billingContent).toContain('handleClearRegistrySearch');
      expect(billingContent).toContain("title=\"Clear\"");
    });

    test('2.3 Constrains registry search results inside scrollable container (maxHeight: 280)', () => {
      expect(billingContent).toContain('registryResultsScroll');
      expect(billingContent).toContain('maxHeight: 280');
    });

    test('2.4 Displays rich billing context badges on patient search results (Open SOA, Paid, PhilHealth, Queue)', () => {
      // Open SOA badge with balance
      expect(billingContent).toContain('Open SOA · ${formatPeso(openInv.balanceDue ?? openInv.netAmount)}');
      // Paid Today badge
      expect(billingContent).toContain('Paid Today');
      // PhilHealth badge
      expect(billingContent).toContain('patient.philHealthNumber && <Badge label="PhilHealth"');
      // Queue number badge
      expect(billingContent).toContain('inQueue?.queueNumber && <Badge label={`Queue #${inQueue.queueNumber}`}');
    });

    test('2.5 Makes the entire search result row pressable for fast 1-tap patient selection', () => {
      expect(billingContent).toContain('<Pressable');
      expect(billingContent).toContain('styles.registryResultItemPressed');
      expect(billingContent).toContain('handleSelectRegistryPatient(patient)');
    });

    test('2.6 Renders compact Active Billing Patient Banner upon selection to bring bill items into view', () => {
      expect(billingContent).toContain('activePatientCard');
      expect(billingContent).toContain('isRegistrySearchExpanded');
      expect(billingContent).toContain("title={isRegistrySearchExpanded ? 'Hide Search' : 'Change Patient'}");
      expect(billingContent).toContain('setIsRegistrySearchExpanded((prev) => !prev)');
    });
  });

  describe('Suite 3: Design Token Strict Integrity', () => {
    test('3.1 Billing.screen.tsx strictly contains 0 raw hex color values', () => {
      const hexRegex = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;
      const matches = billingContent.match(hexRegex) || [];
      expect(matches).toEqual([]);
    });
  });
});
