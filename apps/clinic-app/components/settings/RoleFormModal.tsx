import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import { ClinicRole } from '../../services/clinicService';

export interface RoleFormModalProps {
  visible: boolean;
  mode: 'create' | 'edit';
  initialRole?: ClinicRole | null;
  availablePermissions: string[];
  onClose: () => void;
  onSave: (payload: { name: string; description?: string; permissions: string[] }) => Promise<void>;
}

// Category metadata with user-friendly descriptions and ordering
const PERMISSION_CATEGORIES: {
  id: string;
  name: string;
  description: string;
  prefix: string;
  match?: (perm: string) => boolean;
}[] = [
  { id: 'appointments', name: 'Appointments', description: 'Schedule and manage patient calendar', prefix: 'appointments:' },
  { id: 'queue', name: 'Queue & Flow', description: 'Check-in, call numbers, and advance triage queue', prefix: 'queue:' },
  { id: 'triage', name: 'Triage & Vitals', description: 'Capture vital signs and triage assessments', prefix: 'triage:' },
  { id: 'consultations', name: 'Consultations & EMR', description: 'SOAP charting, orders, and signing medical encounters', prefix: 'consultations:' },
  { id: 'patients', name: 'Patients Directory', description: 'Master patient registry and profile records', prefix: 'patients:' },
  { id: 'documents', name: 'Medical Documents', description: 'Issue medical certificates and referral letters', prefix: 'documents:' },
  { id: 'records', name: 'Records & Scans', description: 'Clinical document uploads and attachment review', prefix: 'records:' },
  { id: 'billing', name: 'Billing & Cashier', description: 'Invoices, payments, Senior/PWD discounts, and voids', prefix: 'billing:' },
  { id: 'services', name: 'Services & Pricing', description: 'Catalog pricing and fee schedule configuration', prefix: 'services:' },
  { id: 'procedures', name: 'Procedures', description: 'Nursing procedure charting and execution', prefix: 'procedures:' },
  { id: 'laborders', name: 'Lab Orders', description: 'Diagnostic orders and laboratory results ingestion', prefix: 'laborders:' },
  { id: 'reports', name: 'Reports & Remittance', description: 'Daily collections and end-of-day summary reports', prefix: 'reports:' },
  { id: 'yakap', name: 'PhilHealth Yakap', description: 'Transmittal drafting, validation, and SOAP submission', prefix: 'yakap:' },
  { id: 'philhealth', name: 'PhilHealth Catalog', description: 'Import official PhilHealth libraries and kits', prefix: 'philhealth.' },
  { id: 'staff', name: 'Staff Roster', description: 'Staff accounts and credentials administration', prefix: 'staff:' },
  { id: 'roles', name: 'Access Control (RBAC)', description: 'Custom roles and permission assignment', prefix: 'roles:' },
  { id: 'settings', name: 'Facility Settings', description: 'Clinic operational hours, letterhead, and branding', prefix: 'settings:' },
];

export default function RoleFormModal({
  visible,
  mode,
  initialRole,
  availablePermissions,
  onClose,
  onSave,
}: RoleFormModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(initialRole?.name ?? '');
      setDescription(initialRole?.description ?? '');
      setSelectedPermissions(new Set(initialRole?.permissions ?? []));
      setError(null);
    }
  }, [visible, initialRole]);

  const togglePermission = (perm: string) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) {
        next.delete(perm);
      } else {
        next.add(perm);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPermissions(new Set(availablePermissions));
  };

  const clearAll = () => {
    setSelectedPermissions(new Set());
  };

  const toggleCategory = (categoryPerms: string[]) => {
    const allSelected = categoryPerms.every((p) => selectedPermissions.has(p));
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      for (const p of categoryPerms) {
        if (allSelected) {
          next.delete(p);
        } else {
          next.add(p);
        }
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Role name is required.');
      return;
    }

    if (selectedPermissions.size === 0) {
      setError('Please select at least one permission for this role.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        name: trimmedName,
        description: description.trim() || undefined,
        permissions: Array.from(selectedPermissions),
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save role.');
    } finally {
      setSaving(false);
    }
  };

  // Group the available permissions into category buckets
  const groupedCategories = PERMISSION_CATEGORIES.map((cat) => {
    const perms = availablePermissions.filter((p) =>
      cat.match ? cat.match(p) : p.startsWith(cat.prefix)
    );
    const selectedCount = perms.filter((p) => selectedPermissions.has(p)).length;
    return {
      ...cat,
      permissions: perms,
      selectedCount,
      allSelected: perms.length > 0 && selectedCount === perms.length,
    };
  }).filter((cat) => cat.permissions.length > 0);

  // Catch any remaining permissions not in the standard categories
  const mappedPerms = new Set(groupedCategories.flatMap((c) => c.permissions));
  const uncategorized = availablePermissions.filter((p) => !mappedPerms.has(p));
  if (uncategorized.length > 0) {
    const selectedCount = uncategorized.filter((p) => selectedPermissions.has(p)).length;
    groupedCategories.push({
      id: 'other',
      name: 'Other Permissions',
      description: 'System actions and operations',
      prefix: '',
      permissions: uncategorized,
      selectedCount,
      allSelected: selectedCount === uncategorized.length,
    });
  }

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={mode === 'create' ? 'Create Custom Role' : 'Edit Custom Role'}
      subtitle="Define operational authority and assign workstation permissions"
      maxWidth={680}
      footer={
        <View style={styles.footer}>
          <Button title="Cancel" variant="ghost" onPress={onClose} disabled={saving} />
          <Button
            title={mode === 'create' ? 'Create Role' : 'Save Changes'}
            icon="check"
            onPress={handleSubmit}
            loading={saving}
          />
        </View>
      }
    >
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {error ? (
          <View style={styles.errorBox}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
            <ThemedText variant="smallBold" color={theme.colors.emergency} style={styles.errorText}>
              {error}
            </ThemedText>
          </View>
        ) : null}

        <Input
          label="Role Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Laboratory Technician or Clinic Auditor"
          autoFocus
        />

        <Input
          label="Description (Optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Responsible for specimen tracking and diagnostic report review"
        />

        {/* Global Toolbar & Counter */}
        <View style={styles.toolbar}>
          <View style={styles.counterRow}>
            <ThemedText variant="smallBold">
              Permissions Selection:
            </ThemedText>
            <Badge
              label={`${selectedPermissions.size} of ${availablePermissions.length} selected`}
              variant={selectedPermissions.size > 0 ? 'primary' : 'neutral'}
              size="sm"
            />
          </View>

          <View style={styles.quickActions}>
            <Button
              title="Select All"
              variant="outline"
              size="sm"
              onPress={selectAll}
            />
            <Button
              title="Clear All"
              variant="ghost"
              size="sm"
              onPress={clearAll}
            />
          </View>
        </View>

        {/* Categories Matrix */}
        <View style={styles.categoriesContainer}>
          {groupedCategories.map((cat) => (
            <View key={cat.id} style={styles.categoryCard}>
              <View style={styles.categoryHeader}>
                <View style={styles.categoryHeaderText}>
                  <ThemedText variant="smallBold" color={theme.colors.text}>
                    {cat.name}
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    {cat.description}
                  </ThemedText>
                </View>

                <Pressable
                  style={styles.categoryToggleBtn}
                  onPress={() => toggleCategory(cat.permissions)}
                >
                  <Badge
                    label={cat.allSelected ? 'Deselect All' : cat.selectedCount > 0 ? `${cat.selectedCount}/${cat.permissions.length}` : 'Select All'}
                    variant={cat.allSelected ? 'success' : cat.selectedCount > 0 ? 'primary' : 'neutral'}
                    size="sm"
                  />
                </Pressable>
              </View>

              <View style={styles.chipsGrid}>
                {cat.permissions.map((perm) => {
                  const isChecked = selectedPermissions.has(perm);
                  return (
                    <Pressable
                      key={perm}
                      onPress={() => togglePermission(perm)}
                      style={[
                        styles.permItem,
                        isChecked && styles.permItemActive,
                      ]}
                    >
                      <View style={[styles.checkbox, isChecked && styles.checkboxActive]}>
                        {isChecked ? (
                          <Icon name="check" size={12} color={theme.colors.surface} />
                        ) : null}
                      </View>
                      <ThemedText
                        variant="caption"
                        color={isChecked ? theme.colors.primaryDark : theme.colors.text}
                        style={styles.permLabel}
                      >
                        {perm}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    maxHeight: 520,
  },
  bodyContent: {
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergency,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
  },
  errorText: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  quickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  categoriesContainer: {
    gap: theme.spacing.sm,
  },
  categoryCard: {
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: 4,
  },
  categoryHeaderText: {
    flex: 1,
  },
  categoryToggleBtn: {
    padding: 2,
  },
  chipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  permItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  permItemActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  checkboxActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  permLabel: {
    fontFamily: theme.fonts.mono['500'],
    fontSize: 11,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
});
