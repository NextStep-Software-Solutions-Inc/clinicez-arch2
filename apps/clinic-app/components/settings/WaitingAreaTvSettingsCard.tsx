import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { SkeletonList } from '../ui/Skeleton';
import { ToggleSwitch } from './AddEditFieldModal';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { clinicService, ClinicSettingsRecord } from '../../services/clinicService';
import { getPortalBaseUrl, getApiBaseUrl } from '../../services/runtimeConfig';
import { resolveTenantContext } from '@shared/safe';
import { buildCloudTvDisplayUrl } from '../../utils/queueDisplayRoute';

export interface WaitingAreaTvSettingsCardProps {
  settings: ClinicSettingsRecord | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
  showSkeletons?: boolean;
}

export default function WaitingAreaTvSettingsCard({
  settings,
  onSettingsUpdated,
  showSkeletons = false,
}: WaitingAreaTvSettingsCardProps) {
  const [maskNames, setMaskNames] = useState<boolean>(true);
  const [, setSaving] = useState<boolean>(false);
  const [copiedLan, setCopiedLan] = useState<boolean>(false);
  const [copiedCloud, setCopiedCloud] = useState<boolean>(false);
  const [copiedCloudPin, setCopiedCloudPin] = useState<boolean>(false);
  const [savedPin, setSavedPin] = useState<string | null>(settings?.tvDisplayPin || null);
  const [pinInput, setPinInput] = useState<string>(settings?.tvDisplayPin || '');
  const [savingPin, setSavingPin] = useState<boolean>(false);

  useEffect(() => {
    if (settings) {
      setMaskNames(settings.tvDisplayMaskPatientNames ?? true);
      if (settings.tvDisplayPin !== undefined) {
        setSavedPin(settings.tvDisplayPin || null);
        setPinInput(settings.tvDisplayPin || '');
      }
    }
  }, [settings]);

  // 1. Local LAN Kiosk URL: runs on the clinic server / Edge Cell port 3000
  const localLanUrl = useMemo<string>(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/#/queue-display`;
    }
    const apiBase = getApiBaseUrl();
    if (apiBase) {
      try {
        const u = new URL(apiBase);
        return `http://${u.hostname}:3000/#/queue-display`;
      } catch {
        return '/#/queue-display';
      }
    }
    return '/#/queue-display';
  }, []);

  // 2. Public Cloud TV URL: routed via portal-web and portal-api (strictly NO UUIDs)
  const portalBase = useMemo(() => getPortalBaseUrl(), []);
  const ctx = useMemo(() => resolveTenantContext(), []);

  const activePin = savedPin ?? settings?.tvDisplayPin ?? null;
  const isPinConfigured = Boolean(activePin && activePin.trim().length > 0);

  const publicCloudTvUrl = useMemo<string>(() => {
    const effectiveSettings = settings ? { ...settings, tvDisplayPin: activePin } : { tvDisplayPin: activePin };
    return buildCloudTvDisplayUrl(portalBase, effectiveSettings, ctx, false);
  }, [portalBase, settings, activePin, ctx]);

  const publicCloudTvUrlWithPin = useMemo<string>(() => {
    const effectiveSettings = settings ? { ...settings, tvDisplayPin: activePin } : { tvDisplayPin: activePin };
    return buildCloudTvDisplayUrl(portalBase, effectiveSettings, ctx, true);
  }, [portalBase, settings, activePin, ctx]);

  const handleToggleMask = useCallback(
    async (val: boolean) => {
      setMaskNames(val);
      setSaving(true);
      try {
        const [updated, err] = await clinicService.updateSettings({
          tvDisplayMaskPatientNames: val,
        });
        if (err || !updated) {
          setMaskNames(!val);
          notify.error(err?.message || 'Could not update TV display privacy setting.');
          return;
        }
        notify.success(
          val
            ? 'Patient name masking enabled for waiting area TV.'
            : 'Patient name masking disabled (patient names will be shown unmasked).'
        );
        onSettingsUpdated?.(updated);
      } catch {
        setMaskNames(!val);
        notify.error('Failed to save TV display setting.');
      } finally {
        setSaving(false);
      }
    },
    [onSettingsUpdated]
  );

  const handleSavePin = useCallback(
    async (pinToSave: string | null) => {
      setSavingPin(true);
      try {
        const trimmed = pinToSave ? pinToSave.trim() : null;
        const [updated, err] = await clinicService.updateSettings({
          tvDisplayPin: trimmed,
          clearTvDisplayPin: !trimmed,
        });
        if (err) {
          notify.error(err.message || 'Could not save TV display passcode.');
          return;
        }
        const effectivePin = updated?.tvDisplayPin !== undefined ? updated.tvDisplayPin : trimmed;
        setSavedPin(effectivePin);
        setPinInput(effectivePin || '');
        notify.success(
          effectivePin
            ? `TV Display Passcode set to "${effectivePin}". Waiting area boards now require this PIN.`
            : 'TV Display Passcode cleared. Display board is now public without PIN.'
        );
        const resolvedSettings: ClinicSettingsRecord = {
          ...(settings || ({} as ClinicSettingsRecord)),
          ...(updated || {}),
          tvDisplayPin: effectivePin,
        };
        onSettingsUpdated?.(resolvedSettings);
      } catch {
        notify.error('Failed to update TV display passcode.');
      } finally {
        setSavingPin(false);
      }
    },
    [onSettingsUpdated, settings]
  );

  const handleGeneratePin = useCallback(() => {
    const randomPin = String(Math.floor(1000 + Math.random() * 9000));
    setPinInput(randomPin);
    void handleSavePin(randomPin);
  }, [handleSavePin]);

  const openUrl = useCallback((url: string) => {
    if (typeof window !== 'undefined' && window.open) {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {
        notify.error('Could not open TV display.');
      });
    }
  }, []);

  const copyToClipboard = useCallback(async (text: string, type: 'lan' | 'cloud' | 'cloudPin') => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        if (type === 'lan') {
          setCopiedLan(true);
          setTimeout(() => setCopiedLan(false), 2500);
        } else if (type === 'cloud') {
          setCopiedCloud(true);
          setTimeout(() => setCopiedCloud(false), 2500);
        } else {
          setCopiedCloudPin(true);
          setTimeout(() => setCopiedCloudPin(false), 2500);
        }
        notify.success('Display URL copied to clipboard!');
      } else {
        notify.info('Clipboard access unavailable. Please copy the URL manually.');
      }
    } catch {
      notify.error('Could not copy TV display URL to clipboard.');
    }
  }, []);

  return (
    <Card>
      <CardHeader
        title="Waiting Area Public TV Display Board"
        subtitle="Configure public queue television display, passcode locking, and patient privacy masking"
        rightAction={
          <Badge
            label={maskNames ? 'Privacy Masking Active' : 'Unmasked (Warning)'}
            variant={maskNames ? 'success' : 'warning'}
          />
        }
      />
      <CardContent>
        {showSkeletons ? (
          <SkeletonList rows={4} />
        ) : (
          <View style={styles.container}>
            {/* Privacy Masking Toggle Row */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <View style={styles.titleWithIcon}>
                  <Icon name="shield" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Mask Patient Names on TV Display
                  </ThemedText>
                </View>
                <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.toggleSubtitle}>
                  Philippine Data Privacy Act (RA 10173) compliance: When enabled, patient names on the waiting area TV display and public endpoints are masked (e.g., &quot;Cassandra A.&quot;). Staff and physicians inside clinic-app continue to see full names.
                </ThemedText>
              </View>
              <ToggleSwitch
                value={maskNames}
                onValueChange={handleToggleMask}
                accessibilityLabel="Toggle Patient Name Masking on TV Display"
              />
            </View>

            {/* TV Passcode / PIN Protection Card */}
            <View style={styles.pinCard}>
              <View style={styles.urlHeader}>
                <View style={styles.iconWrapPin}>
                  <Icon name="lock" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                </View>
                <View style={styles.urlInfo}>
                  <View style={styles.cardTitleBadgeRow}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      TV Display Board Passcode (PIN Protection)
                    </ThemedText>
                    <Badge
                      label={isPinConfigured ? 'PIN Protection Active' : 'Public Access (No PIN)'}
                      variant={isPinConfigured ? 'success' : 'neutral'}
                    />
                  </View>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.urlSubtitle}>
                    Prevents leaked or shared links from displaying patient queue tickets. When a PIN is configured, both LAN kiosks and Cloud TVs require the passcode to unlock and reveal live tickets.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.pinInputRow}>
                <View style={styles.pinInputContainer}>
                  <Input
                    label="TV Passcode / PIN"
                    value={pinInput}
                    onChangeText={setPinInput}
                    placeholder="Enter 4-6 digit passcode (e.g. 1234)"
                    maxLength={12}
                    keyboardType="numeric"
                    leftIcon="lock"
                    helperText={
                      isPinConfigured
                        ? `Currently active PIN: "${activePin}". Anyone without this PIN cannot see queue tickets.`
                        : 'No PIN is currently configured. Anyone with the URL can view the queue display.'
                    }
                  />
                </View>
                <View style={styles.pinActionButtons}>
                  <Button
                    title="Save Passcode"
                    variant="primary"
                    icon="check"
                    loading={savingPin}
                    disabled={savingPin || pinInput.trim() === (activePin || '')}
                    onPress={() => handleSavePin(pinInput)}
                  />
                  <Button
                    title="Generate 4-Digit PIN"
                    variant="secondary"
                    icon="refreshCw"
                    disabled={savingPin}
                    onPress={handleGeneratePin}
                  />
                  {isPinConfigured && (
                    <Button
                      title="Clear PIN"
                      variant="outline"
                      icon="x"
                      disabled={savingPin}
                      onPress={() => handleSavePin(null)}
                    />
                  )}
                </View>
              </View>

              {isPinConfigured && (
                <View style={styles.pinHelperBox}>
                  <View style={styles.pinHelperHeader}>
                    <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.success} />
                    <ThemedText variant="captionBold" color={theme.colors.success}>
                      Authorized Wall TV Setup Link Available
                    </ThemedText>
                  </View>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    Use the auto-authenticated URL below when setting up physical wall TVs or kiosks so clinic staff don&apos;t have to enter the passcode on the TV remote.
                  </ThemedText>
                  <View style={styles.urlBadge}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary} numberOfLines={1}>
                      {publicCloudTvUrlWithPin || 'Cloud display URL will appear once clinic and facility slugs are configured.'}
                    </ThemedText>
                  </View>
                  <View style={styles.actionRow}>
                    <Button
                      title={copiedCloudPin ? 'Copied with PIN' : 'Copy TV Setup Link with PIN'}
                      variant="primary"
                      icon="copy"
                      disabled={!publicCloudTvUrlWithPin}
                      onPress={() => publicCloudTvUrlWithPin && copyToClipboard(publicCloudTvUrlWithPin, 'cloudPin')}
                    />
                    <Button
                      title="Open with PIN"
                      variant="outline"
                      icon="maximize"
                      disabled={!publicCloudTvUrlWithPin}
                      onPress={() => publicCloudTvUrlWithPin && openUrl(publicCloudTvUrlWithPin)}
                    />
                  </View>
                </View>
              )}
            </View>

            {/* 1. Local LAN Kiosk URL Card */}
            <View style={styles.urlCard}>
              <View style={styles.urlHeader}>
                <View style={styles.iconWrapLan}>
                  <Icon name="monitor" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                </View>
                <View style={styles.urlInfo}>
                  <View style={styles.cardTitleBadgeRow}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Local LAN Kiosk Display URL
                    </ThemedText>
                    <Badge label="Offline-Ready (LAN)" variant="primary" />
                  </View>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.urlSubtitle}>
                    Recommended for waiting room smart TVs (LG webOS, Samsung Tizen, Android TV, HDMI kiosks) connected to the local clinic Wi-Fi. Works 100% offline during internet/ISP outages.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.urlBadge}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} numberOfLines={1}>
                  {localLanUrl}
                </ThemedText>
              </View>

              <View style={styles.actionRow}>
                <Button
                  title="Open LAN Display"
                  variant="primary"
                  icon="maximize"
                  onPress={() => openUrl(localLanUrl)}
                />
                <Button
                  title={copiedLan ? 'Copied' : 'Copy LAN Link'}
                  variant="outline"
                  icon="copy"
                  onPress={() => copyToClipboard(localLanUrl, 'lan')}
                />
              </View>
            </View>

            {/* 2. Public Cloud TV URL Card */}
            <View style={styles.urlCard}>
              <View style={styles.urlHeader}>
                <View style={styles.iconWrapCloud}>
                  <Icon name="cloud" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
                </View>
                <View style={styles.urlInfo}>
                  <View style={styles.cardTitleBadgeRow}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Public Cloud TV Board URL (Slugs Only)
                    </ThemedText>
                    <Badge label="Cloud Hosted" variant="neutral" />
                  </View>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.urlSubtitle}>
                    For external waiting areas, patient companions, or multi-branch lobby monitors accessing the cloud-hosted ClinicEZ control plane via public internet. Guarantees zero UUID exposure.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.urlBadge}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} numberOfLines={1}>
                  {publicCloudTvUrl || 'Cloud display URL will appear once clinic and facility slugs are configured.'}
                </ThemedText>
              </View>

              <View style={styles.actionRow}>
                <Button
                  title="Open Cloud Board"
                  variant="secondary"
                  icon="maximize"
                  disabled={!publicCloudTvUrl}
                  onPress={() => publicCloudTvUrl && openUrl(publicCloudTvUrl)}
                />
                <Button
                  title={copiedCloud ? 'Copied' : 'Copy Cloud Link'}
                  variant="outline"
                  icon="copy"
                  disabled={!publicCloudTvUrl}
                  onPress={() => publicCloudTvUrl && copyToClipboard(publicCloudTvUrl, 'cloud')}
                />
              </View>
            </View>
          </View>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  toggleInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  toggleSubtitle: {
    lineHeight: theme.spacing.lg,
  },
  pinCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  iconWrapPin: {
    width: theme.sizes.iconLg,
    height: theme.sizes.iconLg,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinInputRow: {
    gap: theme.spacing.sm,
  },
  pinInputContainer: {
    maxWidth: 420,
  },
  pinActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
  },
  pinHelperBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  pinHelperHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  urlCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  urlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  iconWrapLan: {
    width: theme.sizes.iconLg,
    height: theme.sizes.iconLg,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapCloud: {
    width: theme.sizes.iconLg,
    height: theme.sizes.iconLg,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urlInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  cardTitleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  urlSubtitle: {
    lineHeight: theme.spacing.md,
  },
  urlBadge: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
});
