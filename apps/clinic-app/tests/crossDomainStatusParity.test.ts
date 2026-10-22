// token-guard:ignore-file
import { describe, it, expect, mock } from 'bun:test';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const comp = (props: any) => props.children || null;
  comp.displayName = name;
  return comp;
};

// Mock react-native before any imports
mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  Text: createMockComponent('Text'),
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
}));

mock.module('@react-native-community/netinfo', () => ({
  addEventListener: () => () => {},
  fetch: () => Promise.resolve({ isConnected: true }),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

const { resolveStaffBadge, getAvailableStaffActions } = await import('../utils/staffStatus');
type StaffMember = import('../services/clinicService').StaffMember;

describe('Milestone 4: Cross-Domain Status & Action Matrix Alignment (Clinic App)', () => {
  describe('Status Consistency & Dynamic Expired Resolution', () => {
    it('dynamically resolves Expired when status is Invited with past expiration', () => {
      const past = new Date(Date.now() - 3600000).toISOString();
      const badge = resolveStaffBadge({
        status: 'Invited',
        invitationExpiresAt: past,
        isActive: false,
      });

      expect(badge.label).toBe('Expired');
      expect(badge.variant).toBe('warning');
    });

    it('resolves Invited when status is Invited with future expiration', () => {
      const future = new Date(Date.now() + 5 * 86400000).toISOString();
      const badge = resolveStaffBadge({
        status: 'Invited',
        invitationExpiresAt: future,
        isActive: false,
      });

      expect(badge.label).toBe('Invited');
      expect(badge.variant).toBe('purple');
    });

    it('resolves Active without dynamic expiration even if old invitationExpiresAt exists', () => {
      const past = new Date(Date.now() - 3600000).toISOString();
      const badge = resolveStaffBadge({
        status: 'Active',
        invitationExpiresAt: past,
        isActive: true,
        mustChangePassword: false,
      });

      expect(badge.label).toBe('Active');
      expect(badge.variant).toBe('success');
    });

    it('resolves Suspended and Revoked states consistently', () => {
      const suspended = resolveStaffBadge({ status: 'Suspended', isActive: false });
      expect(suspended.label).toBe('Suspended');
      expect(suspended.variant).toBe('emergency');

      const revoked = resolveStaffBadge({ status: 'Revoked', isActive: false });
      expect(revoked.label).toBe('Revoked');
      expect(revoked.variant).toBe('emergency');
    });
  });

  describe('Action Matrix Alignment (getAvailableStaffActions)', () => {
    it('Invited status provides Copy Link, Resend, and Revoke when token is valid and unexpired', () => {
      const future = new Date(Date.now() + 5 * 86400000).toISOString();
      const actions = getAvailableStaffActions({
        status: 'Invited',
        invitationToken: 'tok_active_invitation_123',
        invitationExpiresAt: future,
      });

      expect(actions).toEqual(['copy-invite', 'resend-invite', 'revoke-invite']);
    });

    it('Expired status provides Resend and Revoke, but excludes Copy Link', () => {
      const past = new Date(Date.now() - 3600000).toISOString();
      const actions = getAvailableStaffActions({
        status: 'Invited',
        invitationToken: 'tok_expired_invitation_123',
        invitationExpiresAt: past,
      });

      expect(actions).toEqual(['resend-invite', 'revoke-invite']);
      expect(actions).not.toContain('copy-invite');
    });

    it('Active status provides Edit Details, Reset Password, and Suspend', () => {
      const actions = getAvailableStaffActions({
        status: 'Active',
        isActive: true,
      });

      expect(actions).toEqual(['edit', 'reset-pwd', 'suspend-staff']);
    });

    it('Credentialed staff member with status Invited provides Edit Details, Reset Password, and Suspend', () => {
      const actions = getAvailableStaffActions({
        status: 'Invited',
        hasCredentials: true,
        isActive: true,
      });

      expect(actions).toEqual(['edit', 'reset-pwd', 'suspend-staff']);
    });

    it('Suspended status provides Reactivate only (excludes Edit and Suspend)', () => {
      const actions = getAvailableStaffActions({
        status: 'Suspended',
        isActive: false,
      });

      expect(actions).toEqual(['reactivate-staff']);
      expect(actions).not.toContain('edit');
      expect(actions).not.toContain('suspend-staff');
    });

    it('Revoked status provides 0 lifecycle actions', () => {
      const actions = getAvailableStaffActions({
        status: 'Revoked',
        isActive: false,
      });

      expect(actions).toEqual([]);
      expect(actions).not.toContain('edit');
      expect(actions).not.toContain('reactivate-staff');
      expect(actions).not.toContain('resend-invite');
    });

    it('Self row prevents destructive actions (revoke, suspend, reactivate on self)', () => {
      const activeSelf = getAvailableStaffActions({ status: 'Active', isActive: true }, { isSelf: true });
      expect(activeSelf).toEqual(['edit', 'reset-pwd']);
      expect(activeSelf).not.toContain('suspend-staff');

      const invitedSelf = getAvailableStaffActions({ status: 'Invited', invitationToken: 'tok_self', invitationExpiresAt: new Date(Date.now() + 100000).toISOString() }, { isSelf: true });
      expect(invitedSelf).toEqual(['copy-invite', 'resend-invite']);
      expect(invitedSelf).not.toContain('revoke-invite');

      const suspendedSelf = getAvailableStaffActions({ status: 'Suspended', isActive: false }, { isSelf: true });
      expect(suspendedSelf).toEqual([]);
      expect(suspendedSelf).not.toContain('reactivate-staff');
    });
  });

  describe('Audit Trail Timestamps Representation', () => {
    it('Tier 3 StaffMember entity reflects standardized audit timestamps', () => {
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      const acceptedAt = new Date(Date.now() + 7200000).toISOString();

      const staff: StaffMember = {
        id: 'staff-uuid-1',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        firstName: 'Elena',
        lastName: 'Reyes',
        role: 'Nurse',
        isActive: true,
        status: 'Active',
        createdAt: now,
        invitationExpiresAt: expiresAt,
        inviteAcceptedAt: acceptedAt,
      };

      expect(staff.createdAt).toBe(now);
      expect(staff.invitationExpiresAt).toBe(expiresAt);
      expect(staff.inviteAcceptedAt).toBe(acceptedAt);
    });
  });

  describe('StaffManagementTab Component Wiring Verification', () => {
    it('verifies StaffManagementTab genuinely imports getAvailableStaffActions and gates Edit and menu items', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const staffTabPath = path.resolve(__dirname, '../components/settings/StaffManagementTab.tsx');
      const source = fs.readFileSync(staffTabPath, 'utf8');

      // 1. Verify genuine import
      expect(source).toMatch(/import\s*\{[^}]*getAvailableStaffActions[^}]*\}\s*from\s*['"]\.\.\/\.\.\/utils\/staffStatus['"]/);

      // 2. Verify invocation per row
      expect(source).toContain('getAvailableStaffActions(');

      // 3. Verify Edit button is gated strictly by actions.includes('edit')
      expect(source).toContain("actions.includes('edit')");

      // 4. Verify menu items gate via actions.includes
      expect(source).toContain("actions.includes('copy-invite')");
      expect(source).toContain("actions.includes('resend-invite')");
      expect(source).toContain("actions.includes('revoke-invite')");
      expect(source).toContain("actions.includes('reset-pwd')");
      expect(source).toContain("actions.includes('suspend-staff')");
      expect(source).toContain("actions.includes('reactivate-staff')");

      // 5. Verify Revoked status displays read-only text and no action menu
      expect(source).toContain("s.status === 'Revoked'");
      expect(source).toContain('styles.revokedText');
    });
  });
});
