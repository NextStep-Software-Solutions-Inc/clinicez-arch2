import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { SkeletonList } from '../ui/Skeleton';
import ErrorState from '../ui/ErrorState';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { theme } from '../../constants/theme';
import { clinicService, ClinicRole } from '../../services/clinicService';

interface AccessControlTabProps {
  roles: ClinicRole[];
  onRefreshRoles: () => Promise<void>;
  loading: boolean;
}

export default function AccessControlTab({ roles, onRefreshRoles, loading }: AccessControlTabProps) {
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const [permError, setPermError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<ClinicRole | null>(null);

  useEffect(() => {
    clinicService.getPermissions().then(([perms, err]) => {
      if (err) {
        setPermError(err.message);
      } else {
        setAvailablePermissions(perms || []);
      }
    });
  }, []);

  const activeRole = selectedRole || roles[0] || null;

  // Group permissions by prefix (e.g. appointments:, queue:, consultations:, billing:)
  const groupPermissions = (perms: string[]) => {
    const groups: Record<string, string[]> = {};
    for (const p of perms) {
      const prefix = p.includes(':') ? p.split(':')[0] : 'General';
      const label = prefix.charAt(0).toUpperCase() + prefix.slice(1);
      if (!groups[label]) groups[label] = [];
      groups[label].push(p);
    }
    return groups;
  };

  const rolePermGroups = activeRole ? groupPermissions(activeRole.permissions) : {};

  return (
    <View style={styles.container}>
      <Card>
        <CardHeader
          title="Role-Based Access Control (RBAC)"
          subtitle="Configured workstation permissions and operational authority by staff role"
          rightAction={<Button title="Refresh" icon="refresh" variant="ghost" size="sm" onPress={onRefreshRoles} />}
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
                <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.colHeader}>
                  System Roles ({roles.length})
                </ThemedText>
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
                            variant={r.isSystem ? 'primary' : 'neutral'}
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
                      <ThemedText variant="title">{activeRole.name}</ThemedText>
                      <Badge
                        label={`${activeRole.permissions.length} Enabled Permissions`}
                        variant="success"
                        size="md"
                      />
                    </View>
                    <ThemedText variant="body" color={theme.colors.textSecondary}>
                      {activeRole.description}
                    </ThemedText>

                    <View style={styles.groupsContainer}>
                      {Object.entries(rolePermGroups).map(([groupName, perms]) => (
                        <View key={groupName} style={styles.permGroup}>
                          <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                            {groupName}
                          </ThemedText>
                          <View style={styles.permChipRow}>
                            {perms.map((p) => (
                              <View key={p} style={styles.permChip}>
                                <Icon name="check" size={theme.sizes.iconSm} color={theme.colors.success} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
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
  colHeader: {
    marginBottom: theme.spacing.xs,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  groupsContainer: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
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
});
