import { describe, it, expect } from 'bun:test';
import {
  isSelfAdminUser,
  getAdminUserActionRestriction,
  SELF_ACTION_MESSAGES,
} from '../src/lib/selfActionGuard';

describe('Admin User Self-Action Protections', () => {
  const currentAdmin = {
    userId: 'user_clerk_123',
    email: 'superadmin@clinicez.com',
  };

  it('detects self admin user by clerkUserId match', () => {
    const target = {
      clerkUserId: 'user_clerk_123',
      email: 'other@clinicez.com',
    };
    expect(isSelfAdminUser(target, currentAdmin)).toBe(true);
  });

  it('detects self admin user by email match case-insensitively', () => {
    const target = {
      clerkUserId: 'user_clerk_999',
      email: 'SuperAdmin@ClinicEZ.com',
    };
    expect(isSelfAdminUser(target, currentAdmin)).toBe(true);
  });

  it('allows actions on non-self admin accounts', () => {
    const target = {
      clerkUserId: 'user_clerk_other',
      email: 'nurse.admin@clinicez.com',
      status: 'Active',
    };
    const restriction = getAdminUserActionRestriction(target, currentAdmin);

    expect(restriction.isSelf).toBe(false);
    expect(restriction.canRevoke).toBe(true);
    expect(restriction.canSuspend).toBe(true);
    expect(restriction.canDelete).toBe(true);
  });

  it('restricts delete, suspend, and revoke on self admin account', () => {
    const target = {
      clerkUserId: 'user_clerk_123',
      email: 'superadmin@clinicez.com',
      status: 'Active',
    };
    const restriction = getAdminUserActionRestriction(target, currentAdmin);

    expect(restriction.isSelf).toBe(true);
    expect(restriction.canRevoke).toBe(false);
    expect(restriction.canSuspend).toBe(false);
    expect(restriction.canDelete).toBe(false);
    expect(restriction.deleteTooltip).toBe(SELF_ACTION_MESSAGES.adminDelete);
    expect(restriction.suspendTooltip).toBe(SELF_ACTION_MESSAGES.adminSuspend);
    expect(restriction.revokeTooltip).toBe(SELF_ACTION_MESSAGES.adminRevoke);
  });
});
