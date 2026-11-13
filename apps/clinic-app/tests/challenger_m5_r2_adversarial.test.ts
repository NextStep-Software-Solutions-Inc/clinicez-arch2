/**
 * Milestone 5 Iteration 2 Challenger Adversarial Empirical Re-Verification Test Suite
 *
 * Validates the resolution of Challenger 1 findings:
 * 1. Prepayment gating adapter logic (`mapToCommsPaymentStatus`) across complete combinatorial truth table.
 * 2. Touch target compliance (>= 44px minHeight and minWidth) for `btnTeleconsult` and `policySwitchBtn` in `AppointmentInspectionModal.tsx`.
 * 3. Token linter and host guard conformance.
 */

import { describe, test, expect } from 'bun:test';
import * as path from 'path';
import { theme } from '../constants/theme';

const rootDir = path.resolve(import.meta.dir, '../../..');
const appDir = path.resolve(import.meta.dir, '..');
const transpiler = new Bun.Transpiler({ loader: 'ts' });

describe('Milestone 5 Iteration 2 Challenger Adversarial Re-Verification', () => {
  // ===========================================================================
  // Dimension 1: Combinatorial Prepayment Gating Truth Table
  // ===========================================================================
  describe('Dimension 1: Combinatorial Prepayment Gating Truth Table', () => {
    test('1.1: mapToCommsPaymentStatus parsed directly from TeleconsultWaitingRoomModal.tsx', async () => {
      const modalCode = await Bun.file(path.join(appDir, 'components/teleconsult/TeleconsultWaitingRoomModal.tsx')).text();

      // Extract the exact function implementation from source to test it dynamically
      const funcMatch = modalCode.match(/export function mapToCommsPaymentStatus\([\s\S]*?\n\}/);
      expect(funcMatch).not.toBeNull();

      // Transpile TypeScript types out
      const jsCode = transpiler.transformSync(funcMatch![0]);
      const funcBody = jsCode.replace('export function mapToCommsPaymentStatus', 'function mapToCommsPaymentStatus');
      const mapToCommsPaymentStatus = new Function(`${funcBody}; return mapToCommsPaymentStatus;`)();

      // Status 'Paid' always maps to 'Paid' regardless of policy
      expect(mapToCommsPaymentStatus('Paid', 'Prepaid')).toBe('Paid');
      expect(mapToCommsPaymentStatus('Paid', 'Postpaid')).toBe('Paid');
      expect(mapToCommsPaymentStatus('Paid', 'Exempt')).toBe('Paid');
      expect(mapToCommsPaymentStatus('Paid', null)).toBe('Paid');
      expect(mapToCommsPaymentStatus('Paid', undefined)).toBe('Paid');

      // Status 'Overridden' always maps to 'Overridden'
      expect(mapToCommsPaymentStatus('Overridden', 'Prepaid')).toBe('Overridden');
      expect(mapToCommsPaymentStatus('Overridden', 'Postpaid')).toBe('Overridden');
      expect(mapToCommsPaymentStatus('Overridden', 'Exempt')).toBe('Overridden');
      expect(mapToCommsPaymentStatus('Overridden', null)).toBe('Overridden');

      // Status 'Exempt' or policy 'Exempt' maps to 'Exempt'
      expect(mapToCommsPaymentStatus('Exempt', 'Prepaid')).toBe('Exempt');
      expect(mapToCommsPaymentStatus('Exempt', 'Postpaid')).toBe('Exempt');
      expect(mapToCommsPaymentStatus('Exempt', 'Exempt')).toBe('Exempt');
      expect(mapToCommsPaymentStatus('Pending', 'Exempt')).toBe('Exempt');
      expect(mapToCommsPaymentStatus(null, 'Exempt')).toBe('Exempt');
      expect(mapToCommsPaymentStatus(undefined, 'Exempt')).toBe('Exempt');

      // Status 'Pending' maps to 'Unpaid' for non-exempt policies
      expect(mapToCommsPaymentStatus('Pending', 'Prepaid')).toBe('Unpaid');
      expect(mapToCommsPaymentStatus('Pending', 'Postpaid')).toBe('Unpaid');
      expect(mapToCommsPaymentStatus('Pending', null)).toBe('Unpaid');
      expect(mapToCommsPaymentStatus('Pending', undefined)).toBe('Unpaid');

      // Missing or unknown status maps to 'Unpaid' for non-exempt policies
      expect(mapToCommsPaymentStatus(null, 'Prepaid')).toBe('Unpaid');
      expect(mapToCommsPaymentStatus(undefined, 'Prepaid')).toBe('Unpaid');
      expect(mapToCommsPaymentStatus('', 'Prepaid')).toBe('Unpaid');
      expect(mapToCommsPaymentStatus('UNKNOWN_STATUS', 'Prepaid')).toBe('Unpaid');
    });

    test('1.2: End-to-end CallWaitingRoom isPrepaidBlocked evaluation matrix', async () => {
      const modalCode = await Bun.file(path.join(appDir, 'components/teleconsult/TeleconsultWaitingRoomModal.tsx')).text();
      const funcMatch = modalCode.match(/export function mapToCommsPaymentStatus\([\s\S]*?\n\}/);
      const jsCode = transpiler.transformSync(funcMatch![0]);
      const funcBody = jsCode.replace('export function mapToCommsPaymentStatus', 'function mapToCommsPaymentStatus');
      const mapToCommsPaymentStatus = new Function(`${funcBody}; return mapToCommsPaymentStatus;`)();

      // Replicate the comms-sdk CallWaitingRoom gating logic
      const evaluateBlock = (status: string | null | undefined, policy: string | null | undefined, isYakapExempt: boolean) => {
        const mappedStatus = mapToCommsPaymentStatus(status, policy);
        const effectivePolicy = policy || 'Prepaid';
        return effectivePolicy === 'Prepaid' && mappedStatus === 'Unpaid' && !isYakapExempt;
      };

      // 1. Prepaid + Pending + not YakapExempt -> MUST BE BLOCKED
      expect(evaluateBlock('Pending', 'Prepaid', false)).toBe(true);

      // 2. Prepaid + null/undefined status + not YakapExempt -> MUST BE BLOCKED
      expect(evaluateBlock(null, 'Prepaid', false)).toBe(true);
      expect(evaluateBlock(undefined, 'Prepaid', false)).toBe(true);

      // 3. Prepaid + Paid + not YakapExempt -> MUST NOT BE BLOCKED
      expect(evaluateBlock('Paid', 'Prepaid', false)).toBe(false);

      // 4. Prepaid + Overridden + not YakapExempt -> MUST NOT BE BLOCKED
      expect(evaluateBlock('Overridden', 'Prepaid', false)).toBe(false);

      // 5. Prepaid + Exempt status + not YakapExempt -> MUST NOT BE BLOCKED
      expect(evaluateBlock('Exempt', 'Prepaid', false)).toBe(false);

      // 6. Prepaid + Pending + YakapExempt -> MUST NOT BE BLOCKED
      expect(evaluateBlock('Pending', 'Prepaid', true)).toBe(false);

      // 7. Postpaid + Pending + not YakapExempt -> MUST NOT BE BLOCKED
      expect(evaluateBlock('Pending', 'Postpaid', false)).toBe(false);

      // 8. Exempt + Pending + not YakapExempt -> MUST NOT BE BLOCKED
      expect(evaluateBlock('Pending', 'Exempt', false)).toBe(false);
    });

    test('1.3: TeleconsultWaitingRoomModal wires mappedPaymentStatus to CallWaitingRoom and initialPaymentState', async () => {
      const modalCode = await Bun.file(path.join(appDir, 'components/teleconsult/TeleconsultWaitingRoomModal.tsx')).text();

      // Check initialPaymentState status mapping
      expect(modalCode).toContain('status: mapToCommsPaymentStatus(');

      // Check CallWaitingRoom prop mapping
      expect(modalCode).toContain('const mappedPaymentStatus = mapToCommsPaymentStatus(');
      expect(modalCode).toContain('paymentStatus={mappedPaymentStatus}');
    });
  });

  // ===========================================================================
  // Dimension 2: Touch Target Compliance in AppointmentInspectionModal
  // ===========================================================================
  describe('Dimension 2: Touch Target Compliance in AppointmentInspectionModal', () => {
    test('2.1: theme.sizes.touchTarget equals 44px', () => {
      expect(theme.sizes.touchTarget).toBe(44);
    });

    test('2.2: styles.btn enforces >= 44x44px touch target', async () => {
      const code = await Bun.file(path.join(appDir, 'components/calendar/AppointmentInspectionModal.tsx')).text();
      const match = code.match(/btn:\s*\{[\s\S]*?\n\s*\},/);
      expect(match).not.toBeNull();
      const styleBlock = match![0];

      expect(styleBlock).toContain('minHeight: theme.sizes.touchTarget');
      expect(styleBlock).toContain('minWidth: theme.sizes.touchTarget');
    });

    test('2.3: styles.btnTeleconsult enforces >= 44x44px touch target', async () => {
      const code = await Bun.file(path.join(appDir, 'components/calendar/AppointmentInspectionModal.tsx')).text();
      const match = code.match(/btnTeleconsult:\s*\{[\s\S]*?\n\s*\},/);
      expect(match).not.toBeNull();
      const styleBlock = match![0];

      expect(styleBlock).toContain('minHeight: theme.sizes.touchTarget');
      expect(styleBlock).toContain('minWidth: theme.sizes.touchTarget');
    });

    test('2.4: styles.policySwitchBtn enforces >= 44x44px touch target', async () => {
      const code = await Bun.file(path.join(appDir, 'components/calendar/AppointmentInspectionModal.tsx')).text();
      const match = code.match(/policySwitchBtn:\s*\{[\s\S]*?\n\s*\},/);
      expect(match).not.toBeNull();
      const styleBlock = match![0];

      expect(styleBlock).toContain('minHeight: theme.sizes.touchTarget');
      expect(styleBlock).toContain('minWidth: theme.sizes.touchTarget');
    });

    test('2.5: btn-drawer-teleconsult references both styles.btn and styles.btnTeleconsult', async () => {
      const code = await Bun.file(path.join(appDir, 'components/calendar/AppointmentInspectionModal.tsx')).text();
      expect(code).toContain('data-testid="btn-drawer-teleconsult"');
      expect(code).toContain('styles.btn');
      expect(code).toContain('styles.btnTeleconsult');
    });
  });

  // ===========================================================================
  // Dimension 3: Repository Token and Host Guard Integrity
  // ===========================================================================
  describe('Dimension 3: Repository Guardrail Conformance', () => {
    test('3.1: Zero hardcoded color literals in TeleconsultWaitingRoomModal and AppointmentInspectionModal', async () => {
      const modalCode = await Bun.file(path.join(appDir, 'components/teleconsult/TeleconsultWaitingRoomModal.tsx')).text();
      const inspectionCode = await Bun.file(path.join(appDir, 'components/calendar/AppointmentInspectionModal.tsx')).text();

      const hexRegex = /#([0-9a-fA-F]{3,8})\b/;
      const rgbRegex = /rgba?\s*\(/;

      expect(hexRegex.test(modalCode)).toBe(false);
      expect(rgbRegex.test(modalCode)).toBe(false);
      expect(hexRegex.test(inspectionCode)).toBe(false);
      expect(rgbRegex.test(inspectionCode)).toBe(false);
    });

    test('3.2: Zero hardcoded URLs or localhost in TeleconsultWaitingRoomModal and AppointmentInspectionModal', async () => {
      const modalCode = await Bun.file(path.join(appDir, 'components/teleconsult/TeleconsultWaitingRoomModal.tsx')).text();
      const inspectionCode = await Bun.file(path.join(appDir, 'components/calendar/AppointmentInspectionModal.tsx')).text();

      const urlRegex = /https?:\/\/(?!www\.w3\.org)/;
      const localhostRegex = /localhost|127\.0\.0\.1|0\.0\.0\.0/;

      expect(urlRegex.test(modalCode)).toBe(false);
      expect(localhostRegex.test(modalCode)).toBe(false);
      expect(urlRegex.test(inspectionCode)).toBe(false);
      expect(localhostRegex.test(inspectionCode)).toBe(false);
    });
  });
});
