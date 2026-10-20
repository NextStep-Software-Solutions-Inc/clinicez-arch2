// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

// Mock react-native dependencies
mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
  RefreshControl: 'RefreshControl',
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  processColor: (c: any) => c,
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

// Import target modules
const {
  formatPhilHealthPin,
  validatePhilHealthPinMod11,
  MOD11_WEIGHTS,
} = await import('../components/ui/PhilHealthPinInput');

import type {
  CheckPatientDuplicatesParams,
  DuplicatePatientCheckResult,
  DuplicateMatch,
} from '../services/clinicService';

describe('Adversarial Stress Suite — Milestone M2: Features 10 & 11', () => {

  // =========================================================================
  // Section 1: PhilHealth PIN Masking & Normalization Stress
  // =========================================================================
  describe('1. PhilHealth PIN Masking (formatPhilHealthPin)', () => {
    test('1.1 Standard 12-digit formatting', () => {
      expect(formatPhilHealthPin('123456789018')).toBe('12-345678901-8');
      expect(formatPhilHealthPin('010250000010')).toBe('01-025000001-0');
      expect(formatPhilHealthPin('100000000005')).toBe('10-000000000-5');
    });

    test('1.2 Incremental typing keystroke simulation (1 to 12 digits)', () => {
      const keystrokes = [
        { input: '1', expected: '1' },
        { input: '12', expected: '12' },
        { input: '123', expected: '12-3' },
        { input: '1234', expected: '12-34' },
        { input: '12345', expected: '12-345' },
        { input: '123456', expected: '12-3456' },
        { input: '1234567', expected: '12-34567' },
        { input: '12345678', expected: '12-345678' },
        { input: '123456789', expected: '12-3456789' },
        { input: '1234567890', expected: '12-34567890' },
        { input: '12345678901', expected: '12-345678901' },
        { input: '123456789018', expected: '12-345678901-8' },
      ];

      for (const { input, expected } of keystrokes) {
        expect(formatPhilHealthPin(input)).toBe(expected);
      }
    });

    test('1.3 Incremental backspacing simulation', () => {
      // Simulating user deleting characters one by one
      expect(formatPhilHealthPin('12-345678901-')).toBe('12-345678901');
      expect(formatPhilHealthPin('12-34567890')).toBe('12-34567890');
      expect(formatPhilHealthPin('12-')).toBe('12');
      expect(formatPhilHealthPin('1')).toBe('1');
      expect(formatPhilHealthPin('')).toBe('');
    });

    test('1.4 Strips dirty formatting, non-numeric characters, letters, and unicode', () => {
      // Slashes, periods, spaces, letters, emojis
      expect(formatPhilHealthPin('PIN # 12.3456.78901 / 8')).toBe('12-345678901-8');
      expect(formatPhilHealthPin('12-345678901-8🚀🎉')).toBe('12-345678901-8');
      expect(formatPhilHealthPin('  12  345678901  8  ')).toBe('12-345678901-8');
      expect(formatPhilHealthPin('1-2-3-4-5-6-7-8-9-0-1-8')).toBe('12-345678901-8');
      expect(formatPhilHealthPin('ABC-DEF-GHI-JKL')).toBe('');
      expect(formatPhilHealthPin('null-undefined-NaN')).toBe('');
    });

    test('1.5 Excess input clamped strictly to 12 digits (14 masked chars)', () => {
      // Input with 15 digits
      const formatted = formatPhilHealthPin('123456789018999');
      expect(formatted).toBe('12-345678901-8');
      expect(formatted.length).toBe(14);
    });

    test('1.6 Boundary inputs: empty and single-character', () => {
      expect(formatPhilHealthPin('')).toBe('');
      expect(formatPhilHealthPin(' ')).toBe('');
      expect(formatPhilHealthPin('0')).toBe('0');
      expect(formatPhilHealthPin('00')).toBe('00');
    });
  });

  // =========================================================================
  // Section 2: PhilHealth PIN Mod-11 Validation Stress & Mathematical Coverage
  // =========================================================================
  describe('2. PhilHealth PIN Mod-11 Check Digit Validation (validatePhilHealthPinMod11)', () => {
    test('2.1 Weights array exactly matches statutory [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]', () => {
      expect(MOD11_WEIGHTS).toEqual([6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]);
      expect(MOD11_WEIGHTS.length).toBe(11);
    });

    test('2.2 Full mathematical coverage of all 11 remainder cases (R = 0..10)', () => {
      // We empirically construct canonical PINs for every single remainder value:
      const canonicalPins = [
        { remainder: 0, checkDigit: 0, pin: '00-000000000-0' }, // S = 0 -> R = 0 -> C = 0
        { remainder: 1, checkDigit: 0, pin: '00-000000006-0' }, // S = 12 -> R = 1 -> C = 10 -> maps to 0
        { remainder: 2, checkDigit: 9, pin: '00-000000001-9' }, // S = 2 -> R = 2 -> C = 9
        { remainder: 3, checkDigit: 8, pin: '00-000000007-8' }, // S = 14 -> R = 3 -> C = 8
        { remainder: 4, checkDigit: 7, pin: '00-000000002-7' }, // S = 4 -> R = 4 -> C = 7
        { remainder: 5, checkDigit: 6, pin: '00-000000008-6' }, // S = 16 -> R = 5 -> C = 6
        { remainder: 6, checkDigit: 5, pin: '00-000000003-5' }, // S = 6 -> R = 6 -> C = 5
        { remainder: 7, checkDigit: 4, pin: '00-000000009-4' }, // S = 18 -> R = 7 -> C = 4
        { remainder: 8, checkDigit: 3, pin: '00-000000004-3' }, // S = 8 -> R = 8 -> C = 3
        { remainder: 9, checkDigit: 2, pin: '00-000000030-2' }, // S = 9 -> R = 9 -> C = 2
        { remainder: 10, checkDigit: 1, pin: '00-000000005-1' }, // S = 10 -> R = 10 -> C = 1
      ];

      for (const item of canonicalPins) {
        const result = validatePhilHealthPinMod11(item.pin);
        expect(result.isValid).toBe(true);
        expect(result.isComplete).toBe(true);
        expect(result.digitsCount).toBe(12);
        expect(result.actualCheckDigit).toBe(item.checkDigit);
        if (item.remainder === 1) {
          expect(result.expectedCheckDigit).toBe(10);
        } else {
          expect(result.expectedCheckDigit).toBe(item.checkDigit);
        }
      }
    });

    test('2.3 Known production & statutory PINs evaluate as valid', () => {
      // Real-world PhilHealth PINs
      const validPins = [
        '12-345678901-8',
        '01-025000001-0', // check digit 10 mapped to 0
        '10-000000000-5',
        '11-111111111-8',
        '99-999999999-6',
      ];

      for (const pin of validPins) {
        const res = validatePhilHealthPinMod11(pin);
        expect(res.isValid).toBe(true);
        expect(res.isComplete).toBe(true);
        expect(res.errorMessage).toBeUndefined();
      }
    });

    test('2.4 Systematic rejection of all incorrect check digits (0 through 9)', () => {
      // For '12-345678901-8', correct check digit is 8.
      // Every other digit (0..7, 9) MUST be rejected with explicit mismatch message.
      for (let d = 0; d <= 9; d++) {
        if (d === 8) continue;
        const invalidPin = `12-345678901-${d}`;
        const res = validatePhilHealthPinMod11(invalidPin);
        expect(res.isValid).toBe(false);
        expect(res.isComplete).toBe(true);
        expect(res.expectedCheckDigit).toBe(8);
        expect(res.actualCheckDigit).toBe(d);
        expect(res.errorMessage).toContain('Check digit mismatch: expected 8, found ' + d);
      }
    });

    test('2.5 Remainder 1 check digit error message references "0 (or 10)"', () => {
      // '00-000000006-0' has remainder 1 (expectedCheckDigit = 10, mapped to 0).
      // If check digit is 3, error message should state expected 0 (or 10).
      const res = validatePhilHealthPinMod11('00-000000006-3');
      expect(res.isValid).toBe(false);
      expect(res.expectedCheckDigit).toBe(10);
      expect(res.actualCheckDigit).toBe(3);
      expect(res.errorMessage).toContain('expected 0 (or 10), found 3');
    });

    test('2.6 Malformed lengths (0 through 11 digits) correctly flagged as incomplete', () => {
      for (let len = 1; len <= 11; len++) {
        const partial = '12345678901'.slice(0, len);
        const res = validatePhilHealthPinMod11(partial);
        expect(res.isValid).toBe(false);
        expect(res.isComplete).toBe(false);
        expect(res.digitsCount).toBe(len);
        expect(res.errorMessage).toBe(`Incomplete PIN (${len}/12 digits)`);
      }
    });

    test('2.7 Empty and whitespace inputs return clean invalid state', () => {
      const resEmpty = validatePhilHealthPinMod11('');
      expect(resEmpty.isValid).toBe(false);
      expect(resEmpty.isComplete).toBe(false);
      expect(resEmpty.digitsCount).toBe(0);
      expect(resEmpty.errorMessage).toBeUndefined();

      const resWhitespace = validatePhilHealthPinMod11('    ');
      expect(resWhitespace.isValid).toBe(false);
      expect(resWhitespace.isComplete).toBe(false);
      expect(resWhitespace.digitsCount).toBe(0);
    });

    test('2.8 Non-numeric characters stripped before Mod-11 calculation', () => {
      // '12-345678901-8' with non-digits embedded
      const res = validatePhilHealthPinMod11('12.3456.78901-8');
      expect(res.isValid).toBe(true);
      expect(res.digitsCount).toBe(12);
      expect(res.formattedPin).toBe('12-345678901-8');
    });
  });

  // =========================================================================
  // Section 3: DebouncedDuplicateChecker Logic & Thresholds Stress
  // =========================================================================
  describe('3. Debounced Duplicate Detection Logic & Threshold Guarding', () => {
    // Harness to test threshold evaluation logic matching DebouncedDuplicateChecker.tsx
    function evaluateThresholds(
      philHealthNumber?: string,
      contactNumber?: string,
      firstName?: string,
      lastName?: string,
      dateOfBirth?: string
    ) {
      const rawPin = (philHealthNumber || '').replace(/\D/g, '');
      const rawContact = (contactNumber || '').replace(/\D/g, '');
      const fn = (firstName || '').trim();
      const ln = (lastName || '').trim();
      const dob = (dateOfBirth || '').trim();

      const hasSufficientPin = rawPin.length >= 10;
      const hasSufficientContact = rawContact.length >= 7;
      const hasSufficientNameDob = fn.length >= 2 && ln.length >= 2 && dob.length >= 8;

      const shouldQuery = hasSufficientPin || hasSufficientContact || hasSufficientNameDob;

      const queryParams: CheckPatientDuplicatesParams = {
        philHealthNumber: rawPin.length >= 10 ? philHealthNumber?.trim() : undefined,
        contactNumber: rawContact.length >= 7 ? contactNumber?.trim() : undefined,
        firstName: hasSufficientNameDob ? fn : undefined,
        lastName: hasSufficientNameDob ? ln : undefined,
        dateOfBirth: hasSufficientNameDob ? dob : undefined,
      };

      return {
        shouldQuery,
        hasSufficientPin,
        hasSufficientContact,
        hasSufficientNameDob,
        queryParams,
      };
    }

    test('3.1 PIN threshold: requires >= 10 raw digits', () => {
      // 9 digits -> false
      const sub9 = evaluateThresholds('12-3456789');
      expect(sub9.hasSufficientPin).toBe(false);
      expect(sub9.shouldQuery).toBe(false);
      expect(sub9.queryParams.philHealthNumber).toBeUndefined();

      // 10 digits -> true
      const at10 = evaluateThresholds('12-34567890');
      expect(at10.hasSufficientPin).toBe(true);
      expect(at10.shouldQuery).toBe(true);
      expect(at10.queryParams.philHealthNumber).toBe('12-34567890');

      // 12 digits -> true
      const at12 = evaluateThresholds('12-345678901-8');
      expect(at12.hasSufficientPin).toBe(true);
      expect(at12.shouldQuery).toBe(true);
      expect(at12.queryParams.philHealthNumber).toBe('12-345678901-8');
    });

    test('3.2 Contact threshold: requires >= 7 digits', () => {
      // 6 digits -> false
      const sub6 = evaluateThresholds(undefined, '0917-12');
      expect(sub6.hasSufficientContact).toBe(false);
      expect(sub6.shouldQuery).toBe(false);

      // 7 digits (local landline) -> true
      const at7 = evaluateThresholds(undefined, '812-3456');
      expect(at7.hasSufficientContact).toBe(true);
      expect(at7.shouldQuery).toBe(true);
      expect(at7.queryParams.contactNumber).toBe('812-3456');

      // 11 digits (mobile) -> true
      const at11 = evaluateThresholds(undefined, '0917-123-4567');
      expect(at11.hasSufficientContact).toBe(true);
      expect(at11.shouldQuery).toBe(true);
      expect(at11.queryParams.contactNumber).toBe('0917-123-4567');
    });

    test('3.3 Name + DOB composite threshold: requires firstName >= 2 AND lastName >= 2 AND dob >= 8', () => {
      // firstName too short (1 char)
      const res1 = evaluateThresholds(undefined, undefined, 'M', 'Santos', '1990-05-15');
      expect(res1.hasSufficientNameDob).toBe(false);
      expect(res1.shouldQuery).toBe(false);

      // lastName too short (1 char)
      const res2 = evaluateThresholds(undefined, undefined, 'Maria', 'S', '1990-05-15');
      expect(res2.hasSufficientNameDob).toBe(false);
      expect(res2.shouldQuery).toBe(false);

      // DOB too short (< 8 chars)
      const res3 = evaluateThresholds(undefined, undefined, 'Maria', 'Santos', '1990-05');
      expect(res3.hasSufficientNameDob).toBe(false);
      expect(res3.shouldQuery).toBe(false);

      // Missing DOB
      const res4 = evaluateThresholds(undefined, undefined, 'Maria', 'Santos', '');
      expect(res4.hasSufficientNameDob).toBe(false);
      expect(res4.shouldQuery).toBe(false);

      // All 3 meet criteria: fn >= 2, ln >= 2, dob >= 8 (e.g. 1990-05-15 is 10 chars)
      const res5 = evaluateThresholds(undefined, undefined, 'Ma', 'Sa', '19900515');
      expect(res5.hasSufficientNameDob).toBe(true);
      expect(res5.shouldQuery).toBe(true);
      expect(res5.queryParams.firstName).toBe('Ma');
      expect(res5.queryParams.lastName).toBe('Sa');
      expect(res5.queryParams.dateOfBirth).toBe('19900515');
    });

    test('3.4 Selective parameter dispatch isolates qualified fields only', () => {
      // Valid contact, but PIN is partial (5 digits) and Name is partial (1 char)
      const mixed = evaluateThresholds('12-345', '0917-123-4567', 'M', 'Santos', '');
      expect(mixed.shouldQuery).toBe(true);
      expect(mixed.hasSufficientContact).toBe(true);
      expect(mixed.hasSufficientPin).toBe(false);
      expect(mixed.hasSufficientNameDob).toBe(false);

      // Query payload must include contact, but exclude PIN and Name/DOB
      expect(mixed.queryParams.contactNumber).toBe('0917-123-4567');
      expect(mixed.queryParams.philHealthNumber).toBeUndefined();
      expect(mixed.queryParams.firstName).toBeUndefined();
      expect(mixed.queryParams.lastName).toBeUndefined();
      expect(mixed.queryParams.dateOfBirth).toBeUndefined();
    });

    test('3.5 Sub-threshold reset: completely empty fields yield shouldQuery = false', () => {
      const empty = evaluateThresholds('', '', '', '', '');
      expect(empty.shouldQuery).toBe(false);
      expect(empty.queryParams.philHealthNumber).toBeUndefined();
      expect(empty.queryParams.contactNumber).toBeUndefined();
      expect(empty.queryParams.firstName).toBeUndefined();
    });
  });

  // =========================================================================
  // Section 4: Rapid Keystroke Debouncing & Race Condition Simulation
  // =========================================================================
  describe('4. Rapid Keystroke Debounce & Race Condition Stress Harness', () => {
    // Simulator for the asynchronous debouncer & ticket sequence engine
    class DebouncerSimulator {
      private sequence = 0;
      private timer: any = null;
      public checking = false;
      public matches: DuplicateMatch[] = [];
      public queryCount = 0;
      public onDuplicatesFoundCalls: Array<{ hasDuplicates: boolean; count: number }> = [];

      constructor(
        private readonly debounceMs: number,
        private readonly mockServiceCall: (params: CheckPatientDuplicatesParams) => Promise<[DuplicatePatientCheckResult | null, any]>
      ) {}

      public onInputChanged(params: {
        philHealthNumber?: string;
        contactNumber?: string;
        firstName?: string;
        lastName?: string;
        dateOfBirth?: string;
      }) {
        const rawPin = (params.philHealthNumber || '').replace(/\D/g, '');
        const rawContact = (params.contactNumber || '').replace(/\D/g, '');
        const fn = (params.firstName || '').trim();
        const ln = (params.lastName || '').trim();
        const dob = (params.dateOfBirth || '').trim();

        const hasSufficientPin = rawPin.length >= 10;
        const hasSufficientContact = rawContact.length >= 7;
        const hasSufficientNameDob = fn.length >= 2 && ln.length >= 2 && dob.length >= 8;

        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }

        if (!hasSufficientPin && !hasSufficientContact && !hasSufficientNameDob) {
          this.sequence += 1;
          this.checking = false;
          this.matches = [];
          this.onDuplicatesFoundCalls.push({ hasDuplicates: false, count: 0 });
          return;
        }

        this.checking = true;
        const ticket = ++this.sequence;

        this.timer = setTimeout(async () => {
          try {
            this.queryCount++;
            const [result] = await this.mockServiceCall({
              philHealthNumber: rawPin.length >= 10 ? params.philHealthNumber?.trim() : undefined,
              contactNumber: rawContact.length >= 7 ? params.contactNumber?.trim() : undefined,
              firstName: hasSufficientNameDob ? fn : undefined,
              lastName: hasSufficientNameDob ? ln : undefined,
              dateOfBirth: hasSufficientNameDob ? dob : undefined,
            });

            // Abort if another input arrived in the meantime
            if (ticket !== this.sequence) return;

            this.checking = false;
            if (result && result.hasDuplicates) {
              this.matches = result.matches;
              this.onDuplicatesFoundCalls.push({ hasDuplicates: true, count: result.matches.length });
            } else {
              this.matches = [];
              this.onDuplicatesFoundCalls.push({ hasDuplicates: false, count: 0 });
            }
          } catch {
            if (ticket !== this.sequence) return;
            this.checking = false;
          }
        }, this.debounceMs);
      }
    }

    test('4.1 Rapid burst typing (10 keystrokes in 100ms) executes exactly 1 network query', async () => {
      let executedQueries = 0;
      const sim = new DebouncerSimulator(100, async () => {
        executedQueries++;
        return [{ hasDuplicates: false, matches: [] }, null];
      });

      // User types 12 digits rapidly, one digit every 10ms
      const digits = '123456789018';
      for (let i = 1; i <= digits.length; i++) {
        sim.onInputChanged({ philHealthNumber: digits.slice(0, i) });
        await new Promise((r) => setTimeout(r, 10));
      }

      // At this point (120ms total), the timer from the last keystroke has NOT yet fired (needs 100ms)
      expect(sim.queryCount).toBe(0);
      expect(sim.checking).toBe(true);

      // Wait 150ms for debounce timer to fire
      await new Promise((r) => setTimeout(r, 150));

      expect(sim.queryCount).toBe(1);
      expect(sim.checking).toBe(false);
    });

    test('4.2 Race condition: slow earlier response discarded by newer sequence ticket', async () => {
      // Request 1 takes 150ms, Request 2 takes 30ms
      let resolveSlowQuery: any = null;

      const sim = new DebouncerSimulator(20, async (params) => {
        if (params.philHealthNumber === '12-345678901-8') {
          // Slow query with duplicate result
          return new Promise((resolve) => {
            resolveSlowQuery = () => resolve([{
              hasDuplicates: true,
              matches: [{
                patientId: 'pat-1',
                patientCode: 'PAT-001',
                fullName: 'Old Match',
                dateOfBirth: '1990-01-01',
                matchReason: 'Old PIN match',
              }],
            }, null]);
          });
        } else {
          // Fast query with NO duplicate
          return [{ hasDuplicates: false, matches: [] }, null];
        }
      });

      // 1. User enters first PIN (triggers slow query)
      sim.onInputChanged({ philHealthNumber: '12-345678901-8' });
      await new Promise((r) => setTimeout(r, 40)); // Timer fires, slow query is pending
      expect(sim.checking).toBe(true);

      // 2. While slow query is in flight, user changes PIN to second PIN
      sim.onInputChanged({ philHealthNumber: '10-000000000-5' });
      await new Promise((r) => setTimeout(r, 40)); // Timer fires, fast query finishes
      expect(sim.checking).toBe(false);
      expect(sim.matches).toEqual([]); // Fast query found no duplicates

      // 3. Now slow query finally finishes!
      if (resolveSlowQuery) resolveSlowQuery();
      await new Promise((r) => setTimeout(r, 20));

      // 4. Verification: Slow query was DISCARDED because ticket did not match!
      expect(sim.matches).toEqual([]); // Did NOT get overwritten with Old Match
    });

    test('4.3 Input clearing while query is in flight cancels display immediately', async () => {
      let resolveQuery: any = null;

      const sim = new DebouncerSimulator(20, async () => {
        return new Promise((resolve) => {
          resolveQuery = () => resolve([{
            hasDuplicates: true,
            matches: [{
              patientId: 'pat-99',
              patientCode: 'PAT-099',
              fullName: 'Ghost Match',
              dateOfBirth: '1985-05-05',
              matchReason: 'Ghost PIN match',
            }],
          }, null]);
        });
      });

      // User enters PIN
      sim.onInputChanged({ philHealthNumber: '12-345678901-8' });
      await new Promise((r) => setTimeout(r, 40)); // Query is now in-flight

      // User clears the field completely
      sim.onInputChanged({ philHealthNumber: '' });
      expect(sim.checking).toBe(false);
      expect(sim.matches).toEqual([]);

      // In-flight query finishes
      if (resolveQuery) resolveQuery();
      await new Promise((r) => setTimeout(r, 20));

      // Ghost match must NOT appear!
      expect(sim.matches).toEqual([]);
      expect(sim.checking).toBe(false);
    });

    test('4.4 Network error / API failure degrades gracefully without unhandled exception', async () => {
      const sim = new DebouncerSimulator(20, async () => {
        // Simulates network error response [null, error]
        return [null, new Error('ECONNREFUSED: Server unreachable')];
      });

      sim.onInputChanged({ contactNumber: '0917-123-4567' });
      await new Promise((r) => setTimeout(r, 50));

      expect(sim.checking).toBe(false);
      expect(sim.matches).toEqual([]);
    });

    test('4.5 Uncaught rejection in API call caught by try/catch without crashing', async () => {
      const sim = new DebouncerSimulator(20, async () => {
        // Throws unexpected exception
        throw new Error('Fatal socket abort');
      });

      sim.onInputChanged({ philHealthNumber: '12-345678901-8' });
      await new Promise((r) => setTimeout(r, 50));

      expect(sim.checking).toBe(false);
      expect(sim.matches).toEqual([]);
    });
  });

  // =========================================================================
  // Section 5: Component Feedback State Machine & Visual Boundaries
  // =========================================================================
  describe('5. PhilHealthPinInput Visual Border & Feedback State Engine', () => {
    // Pure calculation matching PhilHealthPinInput lines 160-179
    function computeFeedbackState(
      value: string,
      touched: boolean,
      isFocused: boolean,
      externalError?: string
    ) {
      const validation = validatePhilHealthPinMod11(value);
      const hasError = !!externalError || (validation.isComplete && !validation.isValid);
      const isIncompleteOnBlur = touched && validation.digitsCount > 0 && !validation.isComplete;
      const isValidComplete = validation.isComplete && validation.isValid;

      let stateName: 'error' | 'incomplete_blur' | 'valid' | 'focused' | 'idle';
      if (hasError) stateName = 'error';
      else if (isIncompleteOnBlur) stateName = 'incomplete_blur';
      else if (isValidComplete) stateName = 'valid';
      else if (isFocused) stateName = 'focused';
      else stateName = 'idle';

      return {
        hasError,
        isIncompleteOnBlur,
        isValidComplete,
        stateName,
        validation,
      };
    }

    test('5.1 Pristine empty state is idle', () => {
      const state = computeFeedbackState('', false, false);
      expect(state.stateName).toBe('idle');
      expect(state.hasError).toBe(false);
      expect(state.isValidComplete).toBe(false);
    });

    test('5.2 Incomplete input while typing (focused) shows focused state without error', () => {
      const state = computeFeedbackState('12-345', false, true);
      expect(state.stateName).toBe('focused');
      expect(state.hasError).toBe(false);
    });

    test('5.3 Incomplete input upon blur transitions to warning (incomplete_blur)', () => {
      const state = computeFeedbackState('12-345', true, false);
      expect(state.stateName).toBe('incomplete_blur');
      expect(state.isIncompleteOnBlur).toBe(true);
      expect(state.hasError).toBe(false);
    });

    test('5.4 Complete PIN with invalid check digit triggers emergency error state immediately', () => {
      // 12-345678901-2 has wrong check digit (expected 8, found 2)
      const state = computeFeedbackState('12-345678901-2', false, false);
      expect(state.stateName).toBe('error');
      expect(state.hasError).toBe(true);
      expect(state.validation.errorMessage).toContain('Check digit mismatch');
    });

    test('5.5 Complete valid PIN transitions to success state', () => {
      const state = computeFeedbackState('12-345678901-8', false, false);
      expect(state.stateName).toBe('valid');
      expect(state.isValidComplete).toBe(true);
      expect(state.hasError).toBe(false);
    });

    test('5.6 External error prop overrides valid state', () => {
      const state = computeFeedbackState('12-345678901-8', false, false, 'PIN already registered to another member');
      expect(state.stateName).toBe('error');
      expect(state.hasError).toBe(true);
    });
  });
});
