import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import Icon from '../../ui/Icon';
import Select, { type SelectOption } from '../../ui/Select';
import { Card, CardContent, CardHeader } from '../../ui/Card';
import { SkeletonList } from '../../ui/Skeleton';
import ThemedText from '../../ui/ThemedText';
import { theme } from '../../../constants/theme';
import { useAuth } from '../../../context/AuthContext';
import { clinicService, type ClinicSettingsRecord } from '../../../services/clinicService';
import { notify } from '../../../utils/feedback';

export const IDLE_LOCK_OPTIONS: readonly SelectOption[] = [
  { value: '5', label: '5 minutes', description: 'Recommended for shared reception or triage desks', badge: 'Strict' },
  { value: '10', label: '10 minutes', description: 'Balanced privacy for busy clinical stations' },
  { value: '15', label: '15 minutes', description: 'Recommended default for clinic exam rooms', badge: 'Recommended' },
  { value: '30', label: '30 minutes', description: 'Relaxed timer for dedicated doctor workstations' },
  { value: '60', label: '60 minutes', description: 'Extended window for solo private offices' },
  { value: '120', label: '2 hours', description: 'Maximum automatic lock interval' },
  { value: '0', label: 'Off (Manual lock only)', description: 'Disables automatic locking; staff can still lock manually' },
];

export const MAX_LOCKED_HOURS_OPTIONS: readonly SelectOption[] = [
  { value: '1', label: '1 hour', description: 'Require full password sign-in after 1 hour locked' },
  { value: '2', label: '2 hours', description: 'Require full password sign-in after 2 hours locked' },
  { value: '4', label: '4 hours', description: 'Half-shift maximum locked duration' },
  { value: '8', label: '8 hours', description: 'One full clinic shift before password is required', badge: 'Recommended' },
  { value: '12', label: '12 hours', description: 'Extended shift maximum locked duration' },
  { value: '24', label: '24 hours', description: 'Full day maximum locked duration' },
];

export interface WorkstationSessionPolicyCardProps {
  settings: ClinicSettingsRecord | null;
  showSkeletons?: boolean;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
}

/**
 * Clinic administrator controls for workstation inactivity lock, hard shift-end expiry,
 * and staff 6-digit Quick-Unlock PIN eligibility.
 */
export default function WorkstationSessionPolicyCard({
  settings,
  showSkeletons = false,
  onSettingsUpdated,
}: WorkstationSessionPolicyCardProps) {
  const { updateSessionPolicy } = useAuth();

  const savedIdleMinutes = settings?.idleLockMinutes ?? 15;
  const savedMaxHours = settings?.maxLockedSessionHours ?? 8;
  const savedAllowPin = settings?.allowStaffPinUnlock ?? true;

  const [idleMinutes, setIdleMinutes] = useState<number>(savedIdleMinutes);
  const [maxHours, setMaxHours] = useState<number>(savedMaxHours);
  const [allowPin, setAllowPin] = useState<boolean>(savedAllowPin);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIdleMinutes(settings?.idleLockMinutes ?? 15);
    setMaxHours(settings?.maxLockedSessionHours ?? 8);
    setAllowPin(settings?.allowStaffPinUnlock ?? true);
  }, [settings?.idleLockMinutes, settings?.maxLockedSessionHours, settings?.allowStaffPinUnlock]);

  const idleOptions = useMemo<SelectOption[]>(() => {
    if (IDLE_LOCK_OPTIONS.some((o) => Number(o.value) === idleMinutes)) {
      return [...IDLE_LOCK_OPTIONS];
    }
    return [
      ...IDLE_LOCK_OPTIONS,
      { value: String(idleMinutes), label: `${idleMinutes} minutes`, description: 'Custom configured interval' },
    ];
  }, [idleMinutes]);

  const maxHourOptions = useMemo<SelectOption[]>(() => {
    if (MAX_LOCKED_HOURS_OPTIONS.some((o) => Number(o.value) === maxHours)) {
      return [...MAX_LOCKED_HOURS_OPTIONS];
    }
    return [
      ...MAX_LOCKED_HOURS_OPTIONS,
      { value: String(maxHours), label: `${maxHours} hours`, description: 'Custom configured shift expiry' },
    ];
  }, [maxHours]);

  const isDirty =
    settings !== null &&
    (idleMinutes !== savedIdleMinutes || maxHours !== savedMaxHours || allowPin !== savedAllowPin);

  const handleSave = async () => {
    setSaving(true);
    const [updated, err] = await clinicService.updateSettings({
      idleLockMinutes: idleMinutes,
      maxLockedSessionHours: maxHours,
      allowStaffPinUnlock: allowPin,
    });
    setSaving(false);

    if (err || !updated) {
      notify.error(err?.message || 'Failed to save workstation session policy.');
      return;
    }

    updateSessionPolicy?.({
      idleLockMinutes: updated.idleLockMinutes ?? idleMinutes,
      maxLockedSessionHours: updated.maxLockedSessionHours ?? maxHours,
      allowStaffPinUnlock: updated.allowStaffPinUnlock ?? allowPin,
    });
    onSettingsUpdated?.(updated);
    notify.success('Workstation session security policy updated.');
  };

  return (
    <Card testID="workstation-session-policy-card">
      <CardHeader
        icon="lock"
        title="Workstation Inactivity Lock & Quick-Unlock"
        subtitle="Protect unattended clinic screens without forcing staff to re-type full passwords on every brief step-away"
        rightAction={
          <Badge
            label={idleMinutes > 0 ? `Locks at ${idleMinutes}m` : 'Auto-lock off'}
            variant={idleMinutes > 0 ? 'primary' : 'neutral'}
            size="sm"
          />
        }
      />
      <CardContent style={styles.body}>
        {showSkeletons ? (
          <SkeletonList rows={3} />
        ) : (
          <>
            <View style={styles.grid}>
              <Select
                containerStyle={styles.fieldCol}
                label="Lock workstation after inactivity"
                value={String(idleMinutes)}
                options={idleOptions}
                onSelect={(val) => {
                  const parsed = Number(val);
                  if (Number.isFinite(parsed) && parsed >= 0) {
                    setIdleMinutes(parsed);
                  }
                }}
                allowCustom={false}
                icon="clock"
                modalTitle="Inactivity Auto-Lock Delay"
                modalSubtitle="Staff see a 60-second countdown warning before patient screens lock."
                helperText="A 60-second 'Still there?' warning appears before locking."
              />

              <Select
                containerStyle={styles.fieldCol}
                label="Require full password after locked for"
                value={String(maxHours)}
                options={maxHourOptions}
                onSelect={(val) => {
                  const parsed = Number(val);
                  if (Number.isFinite(parsed) && parsed >= 1) {
                    setMaxHours(parsed);
                  }
                }}
                allowCustom={false}
                icon="shield"
                modalTitle="Hard Sign-Out Threshold"
                modalSubtitle="Abandoned or overnight locked workstations require Email + Password once this window passes."
                helperText="After this period, quick-unlock expires and full sign-in is required."
              />
            </View>

            <View style={styles.pinPolicyBox}>
              <View style={styles.pinPolicyInfo}>
                <View style={styles.pinTitleRow}>
                  <Icon name="key" size={theme.sizes.iconSm} color={theme.colors.primary} />
                  <ThemedText variant="smallBold" color={theme.colors.text}>
                    Allow 6-digit staff Quick-Unlock PIN
                  </ThemedText>
                  <Badge
                    label={allowPin ? 'Enabled' : 'Password only'}
                    variant={allowPin ? 'success' : 'neutral'}
                    size="xs"
                  />
                </View>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  When enabled, staff can configure a personal 6-digit PIN in My Profile → Security to unlock within {maxHours} hour{maxHours === 1 ? '' : 's'}. Five incorrect attempts revoke the session and require a password.
                </ThemedText>
              </View>

              <Button
                title={allowPin ? 'Enabled' : 'Disabled'}
                variant={allowPin ? 'primary' : 'outline'}
                size="sm"
                icon={allowPin ? 'check' : 'lock'}
                onPress={() => setAllowPin((v) => !v)}
                testID="workstation-policy-pin-toggle"
              />
            </View>

            {isDirty ? (
              <View style={styles.actionsRow}>
                <Button
                  title="Save Session Policy"
                  icon="save"
                  size="sm"
                  loading={saving}
                  onPress={() => void handleSave()}
                  testID="workstation-policy-save"
                />
              </View>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: theme.spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  fieldCol: {
    flex: 1,
    minWidth: 240,
  },
  pinPolicyBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  pinPolicyInfo: {
    flex: 1,
    minWidth: 240,
    gap: theme.spacing.xs,
  },
  pinTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
