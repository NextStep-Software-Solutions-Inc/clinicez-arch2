// token-guard:ignore-file
import { describe, it, expect, mock } from 'bun:test';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const comp = (props: any) => props.children || null;
  comp.displayName = name;
  return comp;
};

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

describe('Milestone 4 Empirical Challenger: Tier 3 Boundary Timestamps & Action Matrix Stress', () => {
  describe('Boundary Timestamps Probing (1ms before, exact, 1ms after)', () => {
    it('resolves Invited and allows copy-invite 1ms before expiration', () => {
      const now = Date.now();
      const expiresAt = new Date(now + 1).toISOString();

      const badge = resolveStaffBadge({
        status: 'Invited',
        invitationExpiresAt: expiresAt,
        isActive: false,
      });
      expect(badge.label).toBe('Invited');

      const actions = getAvailableStaffActions({
        status: 'Invited',
        invitationToken: 'tok_boundary_1ms',
        invitationExpiresAt: expiresAt,
      });
      expect(actions).toContain('copy-invite');
      expect(actions).toContain('resend-invite');
      expect(actions).toContain('revoke-invite');
    });

    it('resolves Expired and blocks copy-invite 1ms after expiration', () => {
      const now = Date.now();
      const expiresAt = new Date(now - 1).toISOString();

      const badge = resolveStaffBadge({
        status: 'Invited',
        invitationExpiresAt: expiresAt,
        isActive: false,
      });
      expect(badge.label).toBe('Expired');
      expect(badge.variant).toBe('warning');

      const actions = getAvailableStaffActions({
        status: 'Invited',
        invitationToken: 'tok_boundary_past_1ms',
        invitationExpiresAt: expiresAt,
      });
      expect(actions).not.toContain('copy-invite');
      expect(actions).toContain('resend-invite');
      expect(actions).toContain('revoke-invite');
    });
  });

  describe('Action Matrix Strictness for all 5 Statuses', () => {
    const pastExpiry = new Date(Date.now() - 60000).toISOString();
    const futureExpiry = new Date(Date.now() + 60000).toISOString();

    it('Invited status: has copy-invite, resend-invite, revoke-invite', () => {
      const actions = getAvailableStaffActions({
        status: 'Invited',
        invitationToken: 'tok_valid',
        invitationExpiresAt: futureExpiry,
      });
      expect(actions).toEqual(['copy-invite', 'resend-invite', 'revoke-invite']);
    });

    it('Expired status: strictly excludes copy-invite, keeps resend and revoke', () => {
      const actions = getAvailableStaffActions({
        status: 'Invited',
        invitationToken: 'tok_expired',
        invitationExpiresAt: pastExpiry,
      });
      expect(actions).toEqual(['resend-invite', 'revoke-invite']);
      expect(actions).not.toContain('copy-invite');
    });

    it('Active status: has edit, reset-pwd, suspend-staff, revoke-invite', () => {
      const actions = getAvailableStaffActions({
        status: 'Active',
        isActive: true,
      });
      expect(actions).toEqual(['edit', 'reset-pwd', 'suspend-staff', 'revoke-invite']);
    });

    it('Suspended status: has reactivate-staff, revoke-invite, remove-staff', () => {
      const actions = getAvailableStaffActions({
        status: 'Suspended',
        isActive: false,
      });
      expect(actions).toEqual(['reactivate-staff', 'revoke-invite', 'remove-staff']);
    });

    it('Revoked status: has reinvite-staff and remove-staff', () => {
      const actions = getAvailableStaffActions({
        status: 'Revoked',
        isActive: false,
      });
      expect(actions).toEqual(['reinvite-staff', 'remove-staff']);
    });

    it('Self-account protection strips self-destructive actions', () => {
      const activeSelf = getAvailableStaffActions({ status: 'Active', isActive: true }, { isSelf: true });
      expect(activeSelf).not.toContain('suspend-staff');
      expect(activeSelf).toEqual(['edit', 'reset-pwd']);

      const invitedSelf = getAvailableStaffActions({ status: 'Invited', invitationToken: 't', invitationExpiresAt: futureExpiry }, { isSelf: true });
      expect(invitedSelf).not.toContain('revoke-invite');

      const suspendedSelf = getAvailableStaffActions({ status: 'Suspended', isActive: false }, { isSelf: true });
      expect(suspendedSelf).not.toContain('reactivate-staff');
      expect(suspendedSelf).toEqual([]);
    });
  });
});
