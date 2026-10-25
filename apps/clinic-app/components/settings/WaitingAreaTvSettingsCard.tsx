import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { SkeletonList } from '../ui/Skeleton';
import { ToggleSwitch } from './AddEditFieldModal';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { clinicService, ClinicSettingsRecord } from '../../services/clinicService';
import { getPortalBaseUrl, getApiBaseUrl } from '../../services/runtimeConfig';
import { resolveTenantContext } from '@shared/safe';

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

  useEffect(() => {
    if (settings) {
      setMaskNames(settings.tvDisplayMaskPatientNames ?? true);
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

  // 2. Public Cloud TV URL: routed via portal-web and portal-api
  const publicCloudTvUrl = useMemo<string>(() => {
    const portalBase = getPortalBaseUrl();
    const ctx = resolveTenantContext();
    const tenantSlug = ctx.tenantSlug || settings?.tenantSlug || settings?.tenantId || 'clinic';
    const facilitySlug = ctx.facilitySlug || settings?.facilitySlug || 'main';
    return `${portalBase}/queue-display/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(facilitySlug)}`;
  }, [settings]);

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

  const openUrl = useCallback((url: string) => {
    if (typeof window !== 'undefined' && window.open) {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {
        notify.error('Could not open TV display.');
      });
    }
  }, []);

  const copyToClipboard = useCallback(async (text: string, isLan: boolean) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        if (isLan) {
          setCopiedLan(true);
          setTimeout(() => setCopiedLan(false), 2500);
        } else {
          setCopiedCloud(true);
          setTimeout(() => setCopiedCloud(false), 2500);
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
        subtitle="Configure public queue television display and patient privacy masking"
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
                  onPress={() => copyToClipboard(localLanUrl, true)}
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
                      Public Cloud TV Board URL
                    </ThemedText>
                    <Badge label="Cloud Hosted" variant="neutral" />
                  </View>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.urlSubtitle}>
                    For external waiting areas, patient companions, or multi-branch lobby monitors accessing the cloud-hosted ClinicEZ control plane via public internet.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.urlBadge}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} numberOfLines={1}>
                  {publicCloudTvUrl}
                </ThemedText>
              </View>

              <View style={styles.actionRow}>
                <Button
                  title="Open Cloud Board"
                  variant="secondary"
                  icon="maximize"
                  onPress={() => openUrl(publicCloudTvUrl)}
                />
                <Button
                  title={copiedCloud ? 'Copied' : 'Copy Cloud Link'}
                  variant="outline"
                  icon="copy"
                  onPress={() => copyToClipboard(publicCloudTvUrl, false)}
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
