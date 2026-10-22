import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { ToggleSwitch } from './AddEditFieldModal';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { clinicService, ClinicSettingsRecord } from '../../services/clinicService';

export interface BotProtectionSettingsCardProps {
  settings: ClinicSettingsRecord | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
}

export default function BotProtectionSettingsCard({
  settings,
  onSettingsUpdated,
}: BotProtectionSettingsCardProps) {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [siteKey, setSiteKey] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [editingKey, setEditingKey] = useState<boolean>(false);

  const isOverridden = Boolean(settings?.isTurnstileOverriddenByEnv);
  const envOverrideValue = settings?.turnstileEnvOverrideValue;

  useEffect(() => {
    if (settings) {
      setEnabled(Boolean(settings.turnstileEnabled));
      setSiteKey(settings.turnstileSiteKey ?? '');
    }
  }, [settings]);

  const handleToggle = async (newValue: boolean) => {
    if (isOverridden) {
      notify.info('This setting is locked by the server environment configuration (TURNSTILE_ENABLED).');
      return;
    }

    setSaving(true);
    try {
      const [updated, error] = await clinicService.updateSettings({
        turnstileEnabled: newValue,
      });
      if (error || !updated) {
        notify.error(error?.message || 'Failed to update bot protection settings.');
        setEnabled(Boolean(settings?.turnstileEnabled));
      } else {
        setEnabled(Boolean(updated.turnstileEnabled));
        onSettingsUpdated?.(updated);
        notify.success(
          newValue
            ? 'Bot challenge protection enabled for clinic workstation.'
            : 'Bot challenge protection disabled (offline-friendly mode).'
        );
      }
    } catch (err: any) {
      notify.error(err?.message || 'Failed to update bot protection settings.');
      setEnabled(Boolean(settings?.turnstileEnabled));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSiteKey = async () => {
    setSaving(true);
    try {
      const [updated, error] = await clinicService.updateSettings({
        turnstileSiteKey: siteKey.trim() || undefined,
      });
      if (error || !updated) {
        notify.error(error?.message || 'Failed to update Turnstile Site Key.');
      } else {
        onSettingsUpdated?.(updated);
        setEditingKey(false);
        notify.success('Turnstile Site Key updated.');
      }
    } catch (err: any) {
      notify.error(err?.message || 'Failed to update Turnstile Site Key.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Bot Challenge Protection (Turnstile)"
        subtitle="Protects workstation logins and public forms from automated bot attacks and credential stuffing."
        rightAction={
          isOverridden ? (
            <Badge
              label={
                envOverrideValue
                  ? 'Enforced by Environment'
                  : 'Disabled by Environment'
              }
              variant={envOverrideValue ? 'warning' : 'neutral'}
            />
          ) : (
            <Badge
              label={enabled ? 'Enabled' : 'Disabled (Offline-Safe)'}
              variant={enabled ? 'success' : 'neutral'}
            />
          )
        }
      />
      <CardContent>
        {isOverridden ? (
          <View style={styles.overrideBanner}>
            <Icon name="lock" size={18} color={theme.colors.warningText} />
            <View style={styles.overrideTextContainer}>
              <ThemedText variant="bodyBold" color={theme.colors.warningText} style={styles.overrideTitle}>
                Controlled by Server Environment Variable
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.warningText}>
                {envOverrideValue
                  ? 'TURNSTILE_ENABLED is explicitly enabled in the container/host environment. Bot protection is active for all entry points and clinic-level overrides are locked.'
                  : 'TURNSTILE_ENABLED is explicitly disabled in the container/host environment. This deployment operates in 100% offline-ready mode.'}
              </ThemedText>
            </View>
          </View>
        ) : null}

        <View style={styles.row}>
          <View style={styles.labelCol}>
            <ThemedText variant="bodyLarge" style={styles.rowTitle}>
              Enforce Bot Challenge on Workstation Sign-In
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              When enabled, staff must complete a Cloudflare Turnstile challenge before signing in.
              Keep disabled for offline LAN or air-gapped clinic deployments.
            </ThemedText>
          </View>
          <View style={styles.toggleCol}>
            <ToggleSwitch
              value={enabled}
              onValueChange={handleToggle}
              accessibilityLabel="Toggle Turnstile Bot Challenge Protection"
            />
          </View>
        </View>

        {!isOverridden ? (
          <View style={styles.siteKeySection}>
            <View style={styles.siteKeyHeader}>
              <View>
                <ThemedText variant="body" style={styles.siteKeyTitle}>
                  Cloudflare Site Key
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {siteKey
                    ? `Configured: ${siteKey.slice(0, 10)}...`
                    : 'Using default system / Cloudflare test key'}
                </ThemedText>
              </View>
              <Button
                title={editingKey ? 'Cancel' : siteKey ? 'Change Key' : 'Add Custom Key'}
                variant="ghost"
                size="sm"
                onPress={() => setEditingKey((v) => !v)}
              />
            </View>

            {editingKey ? (
              <View style={styles.siteKeyForm}>
                <Input
                  label="Turnstile Site Key"
                  value={siteKey}
                  onChangeText={setSiteKey}
                  placeholder="0x4AAAAAA..."
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Button
                  title="Save Key"
                  size="sm"
                  loading={saving}
                  onPress={handleSaveSiteKey}
                />
              </View>
            ) : null}
          </View>
        ) : null}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  overrideBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  overrideTextContainer: {
    flex: 1,
  },
  overrideTitle: {
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  labelCol: {
    flex: 1,
    paddingRight: theme.spacing.md,
  },
  rowTitle: {
    fontWeight: '600',
    marginBottom: 2,
  },
  toggleCol: {
    alignItems: 'flex-end',
  },
  siteKeySection: {
    paddingTop: theme.spacing.md,
  },
  siteKeyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  siteKeyTitle: {
    fontWeight: '600',
  },
  siteKeyForm: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
});
