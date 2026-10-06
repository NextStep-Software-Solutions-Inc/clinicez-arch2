import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import ErrorState from '../ui/ErrorState';
import EmptyState from '../ui/EmptyState';
import { SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import { formatStaffName, staffInitials, useStaff } from '../../context/StaffContext';

// Prompt for a "working as" selection once per app session, not on every screen mount.
let hasPromptedThisSession = false;

export interface StaffPickerProps {
  /** Avatar only (phones). */
  compact?: boolean;
  /** Visual variant: pill in the header, or a full-width card in the sidebar footer. */
  variant?: 'pill' | 'card';
}

export default function StaffPicker({ compact = false, variant = 'pill' }: StaffPickerProps) {
  const { staff, current, select, loading, error, reload } = useStaff();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasPromptedThisSession && !loading && !current && staff.length > 0) {
      hasPromptedThisSession = true;
      setOpen(true);
    }
  }, [loading, current, staff.length]);

  const initials = current ? staffInitials(current) : '?';
  const name = current ? formatStaffName(current) : 'Select staff';
  const role = current ? current.specialty || current.roleName || current.role : 'Working as';

  const trigger = (
    <Pressable
      onPress={() => setOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={`Working as ${current ? name : 'nobody'}. Change staff`}
      style={({ pressed }) => [
        variant === 'card' ? styles.card : styles.pill,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.avatar, !current && styles.avatarEmpty]}>
        <ThemedText variant="captionBold" color={current ? theme.colors.onPrimary : theme.colors.textMuted}>
          {initials}
        </ThemedText>
      </View>
      {compact ? null : (
        <View style={styles.identity}>
          <ThemedText variant="smallBold" numberOfLines={1}>
            {name}
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
            {role}
          </ThemedText>
        </View>
      )}
      {compact ? null : <Icon name="chevronDown" size={theme.sizes.iconSm} color={theme.colors.textMuted} />}
    </Pressable>
  );

  return (
    <>
      {trigger}
      <Modal
        visible={open}
        onClose={() => setOpen(false)}
        title="Working as"
        subtitle="Choose who is using this workstation. Actions such as calling patients and signing documents are attributed to them."
        maxWidth={460}
        footer={
          current ? (
            <View style={styles.footer}>
              <Button
                title="Clear selection"
                variant="secondary"
                size="sm"
                onPress={() => {
                  select(null);
                  setOpen(false);
                }}
              />
            </View>
          ) : undefined
        }
      >
        {loading ? (
          <SkeletonList rows={3} />
        ) : error ? (
          <ErrorState compact title="Unable to load staff" message={error} onRetry={reload} />
        ) : staff.length === 0 ? (
          <EmptyState
            icon="patients"
            title="No active staff"
            description="Add doctors, nurses and front-desk staff under Settings to attribute actions to them."
          />
        ) : (
          <View style={styles.list}>
            {staff.map((member) => {
              const isCurrent = member.id === current?.id;
              return (
                <Pressable
                  key={member.id}
                  onPress={() => {
                    select(member.id);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    isCurrent && styles.rowCurrent,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isCurrent }}
                >
                  <View style={[styles.avatar, !isCurrent && styles.avatarMuted]}>
                    <ThemedText variant="captionBold" color={isCurrent ? theme.colors.onPrimary : theme.colors.primaryDark}>
                      {staffInitials(member)}
                    </ThemedText>
                  </View>
                  <View style={styles.identity}>
                    <ThemedText variant="bodyBold" numberOfLines={1}>
                      {formatStaffName(member)}
                    </ThemedText>
                    {member.specialty ? (
                      <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
                        {member.specialty}
                      </ThemedText>
                    ) : null}
                  </View>
                  <Badge label={member.roleName || member.role} variant={isCurrent ? 'primary' : 'neutral'} size="sm" />
                  {isCurrent ? <Icon name="check" size={theme.sizes.iconMd} color={theme.colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingLeft: theme.spacing.xs,
    paddingRight: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    maxWidth: 260,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  avatar: {
    width: theme.sizes.controlMd - theme.spacing.xs,
    height: theme.sizes.controlMd - theme.spacing.xs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmpty: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  avatarMuted: {
    backgroundColor: theme.colors.primaryLight,
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  list: {
    gap: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  rowCurrent: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
