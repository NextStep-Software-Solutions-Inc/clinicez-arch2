import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { Svg, Rect, G, Path } from 'react-native-svg';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import SegmentedControl from '../ui/SegmentedControl';
import ValidatedDateInput from '../ui/ValidatedDateInput';
import { Skeleton, SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { useClinic } from '../../context/ClinicContext';
import { clinicService, ClinicSettingsRecord } from '../../services/clinicService';
import { getPortalBaseUrl } from '../../services/runtimeConfig';
import { resolveTenantContext } from '@shared/safe';
import {
  generateRandomJoinCode,
  computeJoinCodeExpiration,
  isJoinCodeActive,
  formatReceptionCodeUrl,
  formatReceptionQrUrl,
  formatJoinCodeExpiration,
  resolvePublicJoinSlugs,
  resolveEffectiveExpirationWindow,
  deriveJoinLinkFormBaseline,
  isJoinLinkSettingsDirty,
  BLANK_PASSCODE_EXPIRATION_HELPER,
  ExpirationWindow,
} from './joinLinkUtils';
import { generateQrMatrix, buildQrPathData } from './qrGenerator';
import { openReceptionPlacardPdf } from './receptionPlacardPdf';

export interface JoinLinkSettingsCardProps {
  settings: ClinicSettingsRecord | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
  showSkeletons?: boolean;
}

export default function JoinLinkSettingsCard({
  settings,
  onSettingsUpdated,
  showSkeletons = false,
}: JoinLinkSettingsCardProps) {
  const { isDesktop } = useBreakpoint();
  const { facilityName, letterhead, loading: clinicLoading, refresh: refreshClinic, license, workspaceProfile } = useClinic();
  const isLoading = Boolean(showSkeletons || (clinicLoading && !settings));
  const resolvedFacilityName = (facilityName || settings?.clinicName || '').trim();

  const initialBaseline = deriveJoinLinkFormBaseline(settings);

  // Settings state & baseline
  const [baselineSettings, setBaselineSettings] = useState<ClinicSettingsRecord | null>(settings);
  const [isEnabled, setIsEnabled] = useState<boolean>(initialBaseline.isEnabled);
  const [joinCode, setJoinCode] = useState<string>(initialBaseline.joinCode);
  const [expirationWindow, setExpirationWindow] = useState<ExpirationWindow>(initialBaseline.expirationWindow);
  const [customDate, setCustomDate] = useState<Date | null>(initialBaseline.customDate);
  const [customDateStr, setCustomDateStr] = useState<string>(initialBaseline.customDateStr);

  // UI action states
  const [copied, setCopied] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [printing, setPrinting] = useState<boolean>(false);

  const hasPasscode = joinCode.trim().length > 0;
  const effectiveExpirationWindow = resolveEffectiveExpirationWindow(joinCode, expirationWindow);

  // Sync state from settings
  useEffect(() => {
    setBaselineSettings(settings);
    if (settings) {
      const nextBaseline = deriveJoinLinkFormBaseline(settings);
      setIsEnabled(nextBaseline.isEnabled);
      setJoinCode(nextBaseline.joinCode);
      setExpirationWindow(nextBaseline.expirationWindow);
      setCustomDate(nextBaseline.customDate);
      setCustomDateStr(nextBaseline.customDateStr);
    }
  }, [settings]);

  const isDirty = useMemo<boolean>(() => {
    return isJoinLinkSettingsDirty(
      {
        isEnabled,
        joinCode,
        effectiveExpirationWindow,
        customDateStr,
      },
      baselineSettings
    );
  }, [isEnabled, joinCode, effectiveExpirationWindow, customDateStr, baselineSettings]);

  // Derive expiration (strictly null when passcode is blank)
  const computedExpiresAt = useMemo<Date | null>(() => {
    if (!hasPasscode) return null;
    return computeJoinCodeExpiration(effectiveExpirationWindow, customDate ?? undefined);
  }, [hasPasscode, effectiveExpirationWindow, customDate]);

  // Derive active status
  const isActive = useMemo<boolean>(() => {
    return isJoinCodeActive(isEnabled, computedExpiresAt);
  }, [isEnabled, computedExpiresAt]);

  // Derive destination join URL without raw GUID leakage (Issue 168)
  const destinationUrl = useMemo<string>(() => {
    const portalBase = getPortalBaseUrl();
    if (joinCode && joinCode.trim()) {
      return formatReceptionCodeUrl(portalBase, joinCode.trim());
    }
    const ctx = resolveTenantContext();
    const { tenantSlug, facilitySlug } = resolvePublicJoinSlugs(ctx, settings, {
      tenantSlug: workspaceProfile?.tenantSlug || license?.tenantSlug,
      facilitySlug: license?.facilitySlug,
    });
    return formatReceptionQrUrl(portalBase, tenantSlug, facilitySlug);
  }, [settings, joinCode, workspaceProfile?.tenantSlug, license?.tenantSlug, license?.facilitySlug]);

  // Live QR Specimen Matrix
  const qrSpecimen = useMemo(() => {
    const matrix = generateQrMatrix(destinationUrl);
    return {
      totalSize: matrix.size + 4,
      pathData: buildQrPathData(matrix.modules),
    };
  }, [destinationUrl]);

  // Actions
  const handleJoinCodeChange = useCallback((val: string) => {
    const clean = val.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setJoinCode(clean);
    if (clean.trim() === '') {
      setExpirationWindow('never');
      setCustomDate(null);
      setCustomDateStr('');
    }
  }, []);

  const handleClearCode = useCallback(() => {
    setJoinCode('');
    setExpirationWindow('never');
    setCustomDate(null);
    setCustomDateStr('');
  }, []);

  const handleGenerateCode = useCallback(() => {
    const newCode = generateRandomJoinCode(8);
    setJoinCode(newCode);
    notify.info(`Generated new Join Passcode: ${newCode}`);
  }, []);

  const handleExpirationChange = useCallback(
    (val: string) => {
      if (!isEnabled || !joinCode.trim()) {
        setExpirationWindow('never');
        return;
      }
      const windowVal = val as ExpirationWindow;
      setExpirationWindow(windowVal);
      if (windowVal === 'custom' && !customDate) {
        const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
        setCustomDate(tomorrow);
        setCustomDateStr(tomorrow.toISOString().split('T')[0]);
      }
    },
    [isEnabled, joinCode, customDate]
  );

  const handleCopyUrl = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(destinationUrl);
        setCopied(true);
        notify.success('Join Link URL copied to clipboard!');
        setTimeout(() => setCopied(false), 2500);
      } else {
        notify.info('Clipboard access unavailable. Please copy the URL manually.');
      }
    } catch {
      notify.error('Could not copy link to clipboard.');
    }
  }, [destinationUrl]);

  const handlePrintPlacard = useCallback(async () => {
    setPrinting(true);
    try {
      const expiresAtFormatted = formatJoinCodeExpiration(computedExpiresAt);
      const placardData = {
        facilityName: resolvedFacilityName,
        qrUrl: destinationUrl,
        joinCode: joinCode.trim() || undefined,
        expiresAtFormatted,
        letterhead,
      };

      let pdfUrl: string | undefined;
      try {
        pdfUrl = clinicService.getReceptionPlacardPdfUrl({
          qrUrl: destinationUrl,
          joinCode: joinCode.trim() || undefined,
          expiresAt: expiresAtFormatted,
        });
      } catch {
        pdfUrl = undefined;
      }

      const opened = await openReceptionPlacardPdf(placardData, pdfUrl);
      if (!opened) {
        notify.error('Could not open QR poster PDF. Please check your popup blocker.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (!/cancel|dismiss/i.test(msg)) {
        notify.error('Could not generate QR poster PDF.');
      }
    } finally {
      setPrinting(false);
    }
  }, [resolvedFacilityName, destinationUrl, joinCode, computedExpiresAt, letterhead]);

  const handleSaveSettings = useCallback(async () => {
    const trimmedCode = joinCode.trim().toUpperCase();
    if (isEnabled && trimmedCode.length > 0 && trimmedCode.length < 4) {
      notify.error('Join passcode must be at least 4 characters.');
      return;
    }

    setSaving(true);
    const [updated, err] = await clinicService.updateSettings({
      isJoinEnabled: isEnabled,
      joinCode: trimmedCode ? trimmedCode : null,
      joinCodeExpiresAt: trimmedCode && computedExpiresAt ? computedExpiresAt.toISOString() : null,
      clearJoinCode: !trimmedCode,
      clearJoinCodeExpiresAt: Boolean(trimmedCode && !computedExpiresAt),
    });
    setSaving(false);

    if (err) {
      notify.error(err.message || 'Could not update QR check-in settings.');
      return;
    }

    if (updated) {
      setBaselineSettings(updated);
      const savedBaseline = deriveJoinLinkFormBaseline(updated);
      setIsEnabled(savedBaseline.isEnabled);
      setJoinCode(savedBaseline.joinCode);
      setExpirationWindow(savedBaseline.expirationWindow);
      setCustomDate(savedBaseline.customDate);
      setCustomDateStr(savedBaseline.customDateStr);
      onSettingsUpdated?.(updated);
      notify.success('Patient QR check-in settings saved.');
      await refreshClinic();
    }
  }, [isEnabled, joinCode, computedExpiresAt, onSettingsUpdated, refreshClinic]);

  const displayFacilityTitle = resolvedFacilityName || 'No clinic name set';

  return (
    <Card>
      <CardHeader
        title="Patient QR Check-In & Link"
        subtitle="Let walk-in patients scan a front-desk QR poster or open your link to register"
        icon="scan"
        rightAction={
          isLoading ? (
            <Skeleton width={72} height={theme.spacing.xl} radius={theme.radii.full} />
          ) : (
            <Badge
              label={!isEnabled ? 'Disabled' : isActive ? 'Active' : 'Code Expired'}
              variant={!isEnabled ? 'neutral' : isActive ? 'success' : 'warning'}
              size="sm"
            />
          )
        }
      />
      <CardContent>
        {isLoading ? (
          <SkeletonList rows={4} />
        ) : (
          <View style={[styles.splitLayout, isDesktop && styles.splitLayoutDesktop]}>
            {/* Visual QR Poster Column */}
            <View style={[styles.specimenColumn, isDesktop && styles.specimenColumnDesktop]}>
              <View style={[styles.specimenCard, !isEnabled && styles.dimmed]}>
                <View style={styles.specimenHeader}>
                  <View style={styles.specimenHeaderTitleRow}>
                    <Icon name="scan" size={theme.sizes.iconSm} color={theme.colors.primary} />
                    <ThemedText variant="captionBold" color={theme.colors.primary} style={styles.uppercaseLabel}>
                      QR Poster Preview
                    </ThemedText>
                  </View>
                  <Badge
                    label={hasPasscode ? 'Passcode Protected' : 'Open Walk-In Link'}
                    variant={hasPasscode ? 'primary' : 'neutral'}
                    size="sm"
                  />
                </View>

                <ThemedText variant="bodyBold" color={theme.colors.text} numberOfLines={1}>
                  {displayFacilityTitle}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Walk-In Patient Check-In
                </ThemedText>

                <View style={styles.qrFrame}>
                  <Svg
                    width={148}
                    height={148}
                    viewBox={`0 0 ${qrSpecimen.totalSize} ${qrSpecimen.totalSize}`}
                  >
                    <Rect
                      width={qrSpecimen.totalSize}
                      height={qrSpecimen.totalSize}
                      fill={theme.colors.surface}
                    />
                    <G transform="translate(2, 2)">
                      <Path d={qrSpecimen.pathData} fill={theme.colors.text} />
                    </G>
                  </Svg>
                </View>

                <View style={styles.passcodeSummaryPill}>
                  <Icon
                    name={hasPasscode ? 'key' : 'globe'}
                    size={theme.sizes.iconSm}
                    color={hasPasscode ? theme.colors.primary : theme.colors.textMuted}
                  />
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    {hasPasscode ? 'Passcode:' : 'Check-In:'}
                  </ThemedText>
                  <ThemedText
                    variant="captionBold"
                    color={hasPasscode ? theme.colors.primaryDark : theme.colors.text}
                  >
                    {hasPasscode ? joinCode.trim() : 'No Passcode Needed'}
                  </ThemedText>
                </View>

                {/* URL Preview & Clipboard */}
                <View style={styles.specimenUrlSection}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    Registration Link
                  </ThemedText>
                  <View style={styles.urlBox}>
                    <ThemedText variant="caption" style={styles.urlText} numberOfLines={2}>
                      {destinationUrl}
                    </ThemedText>
                    <Button
                      icon={copied ? 'check' : 'copy'}
                      iconOnly
                      variant={copied ? 'successOutline' : 'secondary'}
                      size="sm"
                      accessibilityLabel={copied ? 'Copied!' : 'Copy Link'}
                      tooltip={copied ? 'Copied!' : 'Copy Link'}
                      testID="copy-join-link-btn"
                      onPress={handleCopyUrl}
                    />
                  </View>
                </View>

                {/* Printable Poster Action */}
                <View style={styles.placardFooter}>
                  <View style={styles.placardTextCol}>
                    <ThemedText variant="captionBold" color={theme.colors.text}>
                      Front-Desk QR Poster
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      Print a sign for patients at reception
                    </ThemedText>
                  </View>
                  <Button
                    title="Print QR Poster"
                    icon="printer"
                    variant="outline"
                    size="sm"
                    onPress={handlePrintPlacard}
                    loading={printing}
                    disabled={!isEnabled}
                  />
                </View>
              </View>
            </View>

            {/* Controls Column */}
            <View style={[styles.controlsColumn, isDesktop && styles.controlsColumnDesktop]}>
              {/* Master Toggle */}
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextCol}>
                  <ThemedText variant="bodyBold">Allow Walk-In QR Check-In</ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    Let walk-in patients scan your reception QR poster or open the link to register themselves
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => setIsEnabled(!isEnabled)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: isEnabled }}
                  accessibilityLabel="Allow Walk-In QR Check-In"
                  style={styles.switchTarget}
                >
                  <View style={[styles.switchTrack, isEnabled ? styles.switchTrackActive : styles.switchTrackInactive]}>
                    <View style={[styles.switchThumb, isEnabled ? styles.switchThumbActive : styles.switchThumbInactive]} />
                  </View>
                </Pressable>
              </View>

              {/* When Disabled Notice */}
              {!isEnabled && (
                <View style={styles.disabledAlert}>
                  <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.infoText} />
                  <ThemedText variant="caption" color={theme.colors.infoText} style={styles.flexOne}>
                    Walk-in QR check-in is currently turned off. Patients scanning the QR code will be asked to register with front-desk staff.
                  </ThemedText>
                </View>
              )}

              {/* Join Code Configuration */}
              <View style={[styles.section, !isEnabled && styles.dimmed]}>
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  Join Passcode
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Optional letters and numbers patients enter before registering so only clinic visitors can sign up.
                </ThemedText>

                <View style={styles.codeRow}>
                  <Input
                    containerStyle={styles.codeInputContainer}
                    value={joinCode}
                    onChangeText={handleJoinCodeChange}
                    placeholder="Enter or generate passcode"
                    maxLength={16}
                    editable={isEnabled}
                  />
                  <Button
                    title="Generate New Code"
                    icon="refresh"
                    variant="secondary"
                    size="md"
                    onPress={handleGenerateCode}
                    disabled={!isEnabled}
                  />
                  <Button
                    title="Clear"
                    variant="ghost"
                    size="md"
                    onPress={handleClearCode}
                    disabled={!isEnabled || !joinCode}
                  />
                </View>
              </View>

              {/* Expiration Selection (Issue 160 guarded when passcode is blank) */}
              <View style={[styles.section, !isEnabled && styles.dimmed]}>
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  Passcode Expiration
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Choose when this passcode automatically expires
                </ThemedText>

                <View
                  pointerEvents={!isEnabled || !hasPasscode ? 'none' : 'auto'}
                  accessibilityState={{ disabled: !isEnabled || !hasPasscode }}
                  style={!hasPasscode ? styles.dimmed : undefined}
                >
                  <SegmentedControl
                    disabled={!isEnabled || !hasPasscode}
                    options={[
                      { value: '24h', label: '24 Hours' },
                      { value: '7d', label: '7 Days' },
                      { value: '30d', label: '30 Days' },
                      { value: 'never', label: 'Never' },
                      { value: 'custom', label: 'Custom Date' },
                    ]}
                    value={effectiveExpirationWindow}
                    onChange={handleExpirationChange}
                  />
                </View>

                {!hasPasscode ? (
                  <View style={styles.lockedHelperBanner}>
                    <Icon name="lock" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                    <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.flexOne}>
                      {BLANK_PASSCODE_EXPIRATION_HELPER}
                    </ThemedText>
                  </View>
                ) : null}

                {hasPasscode && effectiveExpirationWindow === 'custom' && (
                  <View style={styles.customDateRow}>
                    <ValidatedDateInput
                      label="Custom Expiration Date (YYYY-MM-DD)"
                      value={customDateStr}
                      onChangeText={(val: string) => {
                        setCustomDateStr(val);
                        if (val && val.length === 10) setCustomDate(new Date(`${val}T23:59:59Z`));
                      }}
                      boundaryMode="futureOrToday"
                    />
                  </View>
                )}

                {/* Status Alert */}
                <View style={[styles.statusBanner, isActive ? styles.statusActive : styles.statusWarning]}>
                  <Icon
                    name={isActive ? 'checkCircle' : 'alert'}
                    size={theme.sizes.iconSm}
                    color={isActive ? theme.colors.successText : theme.colors.warningText}
                  />
                  <ThemedText
                    variant="caption"
                    color={isActive ? theme.colors.successText : theme.colors.warningText}
                    style={styles.flexOne}
                  >
                    {formatJoinCodeExpiration(computedExpiresAt)}
                  </ThemedText>
                </View>
              </View>

              {/* Save Action — only rendered when modified or actively saving */}
              {isDirty || saving ? (
                <View style={styles.actionsEnd}>
                  <Button
                    title="Save QR & Link Settings"
                    icon="check"
                    variant="primary"
                    onPress={handleSaveSettings}
                    loading={saving}
                  />
                </View>
              ) : null}
            </View>
          </View>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  splitLayout: {
    flexDirection: 'column',
    gap: theme.spacing.xl,
  },
  splitLayoutDesktop: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing.xl,
  },
  specimenColumn: {
    width: '100%',
  },
  specimenColumnDesktop: {
    width: 340,
    flexShrink: 0,
  },
  controlsColumn: {
    flex: 1,
    gap: theme.spacing.lg,
  },
  controlsColumnDesktop: {
    minWidth: 320,
    justifyContent: 'space-between',
  },
  specimenCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  specimenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  specimenHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  uppercaseLabel: {
    textTransform: 'uppercase',
  },
  qrFrame: {
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    marginVertical: theme.spacing.xs,
  },
  passcodeSummaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    alignSelf: 'center',
  },
  specimenUrlSection: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  section: {
    gap: theme.spacing.xs,
  },
  dimmed: {
    opacity: 0.5,
  },
  flexOne: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    minHeight: theme.sizes.touchTarget,
  },
  toggleTextCol: {
    flex: 1,
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.md,
  },
  switchTarget: {
    minWidth: theme.sizes.touchTarget,
    minHeight: theme.sizes.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: theme.radii.full,
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackActive: {
    backgroundColor: theme.colors.primary,
  },
  switchTrackInactive: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surface,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  switchThumbInactive: {
    alignSelf: 'flex-start',
  },
  disabledAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.infoBg,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.infoBorder,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
  },
  codeInputContainer: {
    flex: 1,
    minWidth: 180,
  },
  lockedHelperBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    marginTop: theme.spacing.xs,
  },
  customDateRow: {
    marginTop: theme.spacing.sm,
    maxWidth: 300,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    marginTop: theme.spacing.xs,
  },
  statusActive: {
    backgroundColor: theme.colors.successBg,
  },
  statusWarning: {
    backgroundColor: theme.colors.warningBg,
  },
  urlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  urlText: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'monospace',
    color: theme.colors.primaryDark,
    ...(Platform.OS === 'web' ? ({ wordBreak: 'break-all' } as any) : {}),
  },
  placardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
  },
  placardTextCol: {
    flex: 1,
    minWidth: 160,
    gap: 2,
  },
  actionsEnd: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.sm,
  },
});
