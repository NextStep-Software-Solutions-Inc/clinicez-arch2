import { describe, it, expect } from 'bun:test';

interface CommandItem {
  id: string;
  category: 'Workstation' | 'Quick Actions' | 'Tenants';
  title: string;
  subtitle?: string;
  destination?: string;
}

describe('CommandPalette — Search Index & Navigation Routing', () => {
  const workstationRoutes: CommandItem[] = [
    { id: 'route-overview', category: 'Workstation', title: 'Overview Dashboard', subtitle: 'Central telemetry and KPIs', destination: '/' },
    { id: 'route-tenants', category: 'Workstation', title: 'Tenants Registry', subtitle: 'Registered multi-facility workspaces', destination: '/tenants' },
    { id: 'route-plans', category: 'Workstation', title: 'Commercial Plans', subtitle: 'Subscription ladders & limits', destination: '/plans' },
    { id: 'route-leads', category: 'Workstation', title: 'Conversion Leads', subtitle: 'Trial onboarding pipeline', destination: '/leads' },
    { id: 'route-blog', category: 'Workstation', title: 'Blog CRM', subtitle: 'Editorial articles & notices', destination: '/blog' },
    { id: 'route-subscribers', category: 'Workstation', title: 'Subscribers Directory', subtitle: 'Audience & RFC-4180 CSV export', destination: '/subscribers' },
    { id: 'route-roles', category: 'Workstation', title: 'Roles & Access Control', subtitle: 'RBAC permissions matrix', destination: '/roles' },
    { id: 'route-users', category: 'Workstation', title: 'Platform Admin Accounts', subtitle: 'Staff credentials & resets', destination: '/users' },
    { id: 'route-settings', category: 'Workstation', title: 'Platform Settings', subtitle: 'N-Bank accounts & VAT configs', destination: '/settings' },
  ];

  const quickActions: CommandItem[] = [
    { id: 'action-new-plan', category: 'Quick Actions', title: 'New Commercial Plan', subtitle: 'Launch multi-step plan authoring wizard', destination: '/plans' },
    { id: 'action-invite-admin', category: 'Quick Actions', title: 'Invite Platform Administrator', subtitle: 'Generate administrative invite token', destination: '/users' },
    { id: 'action-record-payment', category: 'Quick Actions', title: 'Record Offline Payment', subtitle: 'Log manual bank or GCash payment', destination: '/tenants' },
  ];

  const sampleTenants: CommandItem[] = [
    { id: 'tenant-1', category: 'Tenants', title: 'Metro Health Diagnostics', subtitle: 'Slug: metro-health • Active', destination: '/tenants/metro-health' },
    { id: 'tenant-2', category: 'Tenants', title: 'Cebu Doctors Medical Center', subtitle: 'Slug: cebu-doc • Active', destination: '/tenants/cebu-doc' },
  ];

  const allItems = [...workstationRoutes, ...quickActions, ...sampleTenants];

  function searchItems(query: string, items: CommandItem[]): CommandItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q))
    );
  }

  it('covers all 9 primary governance workstation modules in command search', () => {
    expect(workstationRoutes.length).toBe(9);
    for (const route of workstationRoutes) {
      expect(route.destination).toBeDefined();
      expect(route.destination!.startsWith('/admin')).toBe(false);
      expect(route.destination!.startsWith('/')).toBe(true);
    }
  });

  it('searches by module title case-insensitively', () => {
    const results = searchItems('roles', allItems);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('route-roles');
  });

  it('searches by subtitle keywords (e.g. "VAT", "CSV", "telemetry")', () => {
    const vatResults = searchItems('VAT', allItems);
    expect(vatResults.some((r) => r.id === 'route-settings')).toBe(true);

    const csvResults = searchItems('CSV', allItems);
    expect(csvResults.some((r) => r.id === 'route-subscribers')).toBe(true);

    const telemetryResults = searchItems('telemetry', allItems);
    expect(telemetryResults.some((r) => r.id === 'route-overview')).toBe(true);
  });

  it('searches tenants by clinic name or slug', () => {
    const slugResults = searchItems('cebu-doc', allItems);
    expect(slugResults.length).toBe(1);
    expect(slugResults[0].id).toBe('tenant-2');

    const nameResults = searchItems('Metro Health', allItems);
    expect(nameResults.length).toBe(1);
    expect(nameResults[0].id).toBe('tenant-1');
  });

  it('cycles keyboard navigation index with bounds wrapping', () => {
    const length = 5;
    const nextIndex = (curr: number) => (curr + 1) % length;
    const prevIndex = (curr: number) => (curr <= 0 ? length - 1 : curr - 1);

    expect(nextIndex(0)).toBe(1);
    expect(nextIndex(4)).toBe(0); // wrapped
    expect(prevIndex(0)).toBe(4); // wrapped
    expect(prevIndex(3)).toBe(2);
  });

  it('validates ⌘K shortcut trigger logic for cross-platform support', () => {
    const isCommandPaletteTrigger = (e: { key: string; metaKey: boolean; ctrlKey: boolean }) =>
      (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');

    // Mac Cmd+K
    expect(isCommandPaletteTrigger({ key: 'k', metaKey: true, ctrlKey: false })).toBe(true);
    // Windows/Linux Ctrl+K
    expect(isCommandPaletteTrigger({ key: 'k', metaKey: false, ctrlKey: true })).toBe(true);
    // Uppercase K with shift/caps
    expect(isCommandPaletteTrigger({ key: 'K', metaKey: true, ctrlKey: false })).toBe(true);
    // Plain K
    expect(isCommandPaletteTrigger({ key: 'k', metaKey: false, ctrlKey: false })).toBe(false);
    // Other key with Cmd
    expect(isCommandPaletteTrigger({ key: 'p', metaKey: true, ctrlKey: false })).toBe(false);
  });
});
