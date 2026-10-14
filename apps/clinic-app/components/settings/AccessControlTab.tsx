import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import { SkeletonList } from '../ui/Skeleton';
import ErrorState from '../ui/ErrorState';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { clinicService, ClinicRole } from '../../services/clinicService';
import { useAuth } from '../../context/AuthContext';
import { useStaff } from '../../context/StaffContext';
import RoleFormModal from './RoleFormModal';

interface AccessControlTabProps {
  roles: ClinicRole[];
  onRefreshRoles: () => Promise<void>;
  loading: boolean;
}

export default function AccessControlTab({ roles, onRefreshRoles, loading }: AccessControlTabProps) {
  const { user } = useAuth();
  const { current: currentStaff } = useStaff();
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<ClinicRole | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRole, setEditingRole] = useState<ClinicRole | null>(null);
  const [templateRole, setTemplateRole] = useState<ClinicRole | null>(null);
  const [deleteModalRole, setDeleteModalRole] = useState<ClinicRole | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    clinicService.getPermissions().then(([perms, err]) => {
      if (!err && perms) {
        setAvailablePermissions(perms);
      }
    });
  }, []);

  const activeRole = selectedRole || roles[0] || null;
  const isOwnCustomRole = Boolean(
    activeRole &&
      !activeRole.isSystem &&
      ((currentStaff?.clinicRoleId && currentStaff.clinicRoleId === activeRole.id) ||
        (user?.roleName && user.roleName === activeRole.name))
  );

  // Group permissions by prefix (e.g. appointments:, queue:, consultations:, billing:)
  const groupPermissions = (perms: string[]) => {
    const groups: Record<string, string[]> = {};
    for (const p of perms) {
      const prefix = p.includes(':') ? p.split(':')[0] : p.includes('.') ? p.split('.')[0] : 'General';
      const label = prefix.charAt(0).toUpperCase() + prefix.slice(1);
      if (!groups[label]) groups[label] = [];
      groups[label].push(p);
    }
    return groups;
  };

  const rolePermGroups = activeRole ? groupPermissions(activeRole.permissions) : {};

  const handleCreateRole = async (payload: { name: string; description?: string; permissions: string[] }) => {
    const [created, err] = await clinicService.createRole(payload);
    if (err || !created) {
      throw new Error(err?.message || 'Could not create role.');
    }
    notify.success(`Custom role "${created.name}" created successfully.`);
    await onRefreshRoles();
    setSelectedRole(created);
  };

  const handleUpdateRole = async (payload: { name: string; description?: string; permissions: string[] }) => {
    if (!editingRole) return;
    const [updated, err] = await clinicService.updateRole(editingRole.id, payload);
    if (err || !updated) {
      throw new Error(err?.message || 'Could not update role.');
    }
    notify.success(`Role "${updated.name}" updated successfully.`);
    await onRefreshRoles();
    setSelectedRole(updated);
  };

  const handleDeleteRole = async () => {
    if (!deleteModalRole) return;
    setDeleting(true);
    const [ok, err] = await clinicService.deleteRole(deleteModalRole.id);
    setDeleting(false);

    if (err) {
      notify.error(err.message || 'Failed to delete role.');
      return;
    }

    notify.success(`Custom role "${deleteModalRole.name}" deleted.`);
    setDeleteModalRole(null);
    if (activeRole?.id === deleteModalRole.id) {
      setSelectedRole(null);
    }
    await onRefreshRoles();
  };

  return (
    <View style={styles.container}>
      <Card>
        <CardHeader
          title="Role-Based Access Control (RBAC)"
          subtitle="Configure workstation permissions, create custom roles, and assign operational authority"
          rightAction={
            <View style={styles.headerActions}>
              <Button
                title="Create Custom Role"
                icon="plus"
                size="sm"
                onPress={() => {
                  setTemplateRole(null);
                  setShowCreateModal(true);
                }}
              />
              <Button title="Refresh" icon="refresh" variant="ghost" size="sm" onPress={onRefreshRoles} />
            </View>
          }
        />
        <CardContent>
          {loading ? (
            <SkeletonList rows={4} />
          ) : roles.length === 0 ? (
            <ErrorState title="No roles found" message="Default clinic roles are not seeded yet." onRetry={onRefreshRoles} />
          ) : (
            <View style={styles.layout}>
              {/* Left Column: Roles list */}
              <View style={styles.rolesColumn}>
                <View style={styles.colHeaderRow}>
                  <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.colHeader}>
                    Configured Roles ({roles.length})
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    {roles.filter((r) => !r.isSystem).length} custom
                  </ThemedText>
                </View>

                <View style={styles.roleList}>
                  {roles.map((r) => {
                    const isSelected = activeRole?.id === r.id;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => setSelectedRole(r)}
                        style={({ hovered }: any) => [
                          styles.roleCard,
                          isSelected && styles.roleCardActive,
                          hovered && !isSelected && styles.roleCardHover,
                        ]}
                      >
                        <View style={styles.roleCardTop}>
                          <ThemedText variant={isSelected ? 'bodyBold' : 'body'}>
                            {r.name}
                          </ThemedText>
                          <Badge
                            label={r.isSystem ? 'System' : 'Custom'}
                            variant={r.isSystem ? 'primary' : 'success'}
                            size="sm"
                          />
                        </View>
                        <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={2}>
                          {r.description || 'Standard facility role'}
                        </ThemedText>
                        <View style={styles.roleCardMeta}>
                          <ThemedText variant="caption" color={theme.colors.textSecondary}>
                            {r.permissions.length} permissions
                          </ThemedText>
                          {r.staffCount !== undefined ? (
                            <ThemedText variant="caption" color={theme.colors.textMuted}>
                              {r.staffCount} assigned
                            </ThemedText>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Right Column: Active Role Permissions */}
              <View style={styles.permsColumn}>
                {activeRole ? (
                  <View style={styles.activeRoleHeader}>
                    <View style={styles.activeRoleTitleRow}>
                      <View style={styles.activeRoleTitleText}>
                        <View style={styles.titleWithBadge}>
                          <ThemedText variant="title">{activeRole.name}</ThemedText>
                          <Badge
                            label={activeRole.isSystem ? 'Protected System Role' : 'Custom Role'}
                            variant={activeRole.isSystem ? 'primary' : 'success'}
                            size="sm"
                          />
                        </View>
                        <ThemedText variant="body" color={theme.colors.textSecondary}>
                          {activeRole.description || 'Custom facility role'}
                        </ThemedText>
                      </View>

                      {/* Role Actions */}
                      <View style={styles.roleActionBar}>
                        {activeRole.isSystem ? (
                          <Button
                            title="Clone as Custom Role"
                            icon="plus"
                            variant="outline"
                            size="sm"
                            onPress={() => {
                              setTemplateRole(activeRole);
                              setShowCreateModal(true);
                            }}
                          />
                        ) : (
                          <>
                            <Button
                              title="Edit Role"
                              icon="edit"
                              variant="outline"
                              size="sm"
                              disabled={isOwnCustomRole}
                              onPress={() => {
                                if (isOwnCustomRole) return;
                                setEditingRole(activeRole);
                              }}
                            />
                            <Button
                              title="Delete"
                              icon="trash"
                              variant="ghost"
                              size="sm"
                              disabled={isOwnCustomRole}
                              onPress={() => {
                                if (isOwnCustomRole) return;
                                setDeleteModalRole(activeRole);
                              }}
                            />
                          </>
                        )}
                      </View>
                    </View>

                    {activeRole.isSystem ? (
                      <View style={styles.systemNotice}>
                        <Icon name="shield" size={theme.sizes.iconSm} color={theme.colors.primary} />
                        <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
                          System roles are core to clinic standard operating procedures. Use "Clone as Custom Role" to create a modified version.
                        </ThemedText>
                      </View>
                    ) : isOwnCustomRole ? (
                      <View style={styles.systemNotice}>
                        <Icon name="shield" size={theme.sizes.iconSm} color={theme.colors.primary} />
                        <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
                          You are currently assigned to this custom role. You cannot modify or downgrade your own assigned clinic role.
                        </ThemedText>
                      </View>
                    ) : null}

                    {/* Permissions Summary Badge */}
                    <View style={styles.permCountBanner}>
                      <ThemedText variant="smallBold" color={theme.colors.text}>
                        Active Permissions:
                      </ThemedText>
                      <Badge
                        label={`${activeRole.permissions.length} of ${availablePermissions.length || 37} granted`}
                        variant="primary"
                        size="md"
                      />
                    </View>

                    {/* Permission Category Groups */}
                    <View style={styles.groupsContainer}>
                      {Object.entries(rolePermGroups).map(([groupName, perms]) => (
                        <View key={groupName} style={styles.permGroup}>
                          <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                            {groupName} ({perms.length})
                          </ThemedText>
                          <View style={styles.permChipRow}>
                            {perms.map((p) => (
                              <View key={p} style={styles.permChip}>
                                <Icon name="check" size={12} color={theme.colors.success} />
                                <ThemedText variant="caption" color={theme.colors.text}>
                                  {p}
                                </ThemedText>
                              </View>
                            ))}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          )}
        </CardContent>
      </Card>

      {/* Create Custom Role Modal */}
      {showCreateModal ? (
        <RoleFormModal
          visible
          mode="create"
          initialRole={
            templateRole
              ? {
                  ...templateRole,
                  name: `${templateRole.name} (Copy)`,
                }
              : null
          }
          availablePermissions={availablePermissions}
          onClose={() => {
            setShowCreateModal(false);
            setTemplateRole(null);
          }}
          onSave={handleCreateRole}
        />
      ) : null}

      {/* Edit Custom Role Modal */}
      {editingRole ? (
        <RoleFormModal
          visible
          mode="edit"
          initialRole={editingRole}
          availablePermissions={availablePermissions}
          onClose={() => setEditingRole(null)}
          onSave={handleUpdateRole}
        />
      ) : null}

      {/* Delete Confirmation Modal */}
      {deleteModalRole ? (
        <Modal
          visible
          onClose={() => setDeleteModalRole(null)}
          title="Delete Custom Role"
          subtitle={`Are you sure you want to delete "${deleteModalRole.name}"?`}
          maxWidth={480}
          footer={
            <View style={styles.modalFooter}>
              <Button title="Cancel" variant="ghost" onPress={() => setDeleteModalRole(null)} disabled={deleting} />
              <Button
                title="Delete Role"
                icon="trash"
                variant="danger"
                onPress={handleDeleteRole}
                loading={deleting}
                disabled={deleteModalRole.staffCount > 0}
              />
            </View>
          }
        >
          <View style={styles.deleteModalContent}>
            {deleteModalRole.staffCount > 0 ? (
              <View style={styles.warningBox}>
                <Icon name="alertCircle" size={theme.sizes.iconMd} color={theme.colors.emergency} />
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText variant="smallBold" color={theme.colors.emergency}>
                    Cannot delete this role
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    {deleteModalRole.staffCount} staff member(s) are currently assigned to this role. Please reassign them to another role before deleting.
                  </ThemedText>
                </View>
              </View>
            ) : (
              <ThemedText variant="body" color={theme.colors.textSecondary}>
                This action is permanent and will remove the custom role and its permission configuration from the clinic workstation.
              </ThemedText>
            )}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  layout: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    flexWrap: 'wrap',
  },
  rolesColumn: {
    flex: 1,
    minWidth: 280,
    gap: theme.spacing.sm,
  },
  permsColumn: {
    flex: 2,
    minWidth: 320,
    paddingLeft: theme.spacing.md,
    borderLeftWidth: theme.sizes.borderWidth,
    borderLeftColor: theme.colors.border,
  },
  colHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  colHeader: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roleList: {
    gap: theme.spacing.sm,
  },
  roleCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
  },
  roleCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  roleCardHover: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  roleCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
  },
  roleCardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  activeRoleHeader: {
    gap: theme.spacing.md,
  },
  activeRoleTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  activeRoleTitleText: {
    flex: 1,
    gap: 4,
    minWidth: 240,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  roleActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  systemNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primary,
  },
  permCountBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: 4,
  },
  groupsContainer: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  permGroup: {
    gap: theme.spacing.xs,
  },
  permChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  permChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  deleteModalContent: {
    paddingVertical: theme.spacing.sm,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.emergencySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergency,
    borderRadius: theme.radii.md,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
});
