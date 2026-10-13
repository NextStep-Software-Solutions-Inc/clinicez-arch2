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
import { getSetting } from '../../services/runtimeConfig';
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
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (settings) {
      setMaskNames(settings.tvDisplayMaskPatientNames ?? true);
    }
  }, [settings]);

  const tvDisplayUrl = useMemo<string>(() => {
    const portalBase = getSetting('EXPO_PUBLIC_PORTAL_URL') || 'https://portal.clinicez.ph';
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

  const handleOpenTv = useCallback(() => {
    if (typeof window !== 'undefined' && window.open) {
      window.open(tvDisplayUrl, '_blank');
    } else {
      Linking.openURL(tvDisplayUrl).catch(() => {
        notify.error('Could not open TV display.');
      });
    }
  }, [tvDisplayUrl]);

  const handleCopyUrl = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tvDisplayUrl);
        setCopied(true);
        notify.success('TV display URL copied to clipboard!');
        setTimeout(() => setCopied(false), 2500);
      } else {
        notify.info('Clipboard access unavailable. Please copy the URL manually.');
      }
    } catch {
      notify.error('Could not copy TV display URL to clipboard.');
    }
  }, [tvDisplayUrl]);

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
          <SkeletonList rows={3} />
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

            {/* TV Display Launch & URL Box */}
            <View style={styles.urlCard}>
              <View style={styles.urlHeader}>
                <View style={styles.iconWrap}>
                  <Icon name="ticket" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                </View>
                <View style={styles.urlInfo}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Public TV Board URL
                  </ThemedText>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.urlSubtitle}>
                    Open this URL on any smart TV (LG webOS, Samsung Tizen, Android TV, kiosk browser) in the waiting room.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.urlBadge}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} numberOfLines={1}>
                  {tvDisplayUrl}
                </ThemedText>
              </View>

              <View style={styles.actionRow}>
                <Button
                  title="Open TV Board"
                  variant="primary"
                  icon="maximize"
                  onPress={handleOpenTv}
                />
                <Button
                  title={copied ? 'Copied' : 'Copy Link'}
                  variant="outline"
                  icon="copy"
                  onPress={handleCopyUrl}
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
  iconWrap: {
    width: theme.sizes.iconLg,
    height: theme.sizes.iconLg,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urlInfo: {
    flex: 1,
    gap: theme.spacing.xs,
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
