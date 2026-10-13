import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import SegmentedControl from '../ui/SegmentedControl';
import ValidatedDateInput from '../ui/ValidatedDateInput';
import { SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { useClinic } from '../../context/ClinicContext';
import { clinicService, ClinicSettingsRecord } from '../../services/clinicService';
import { getSetting } from '../../services/runtimeConfig';
import { resolveTenantContext } from '@shared/safe';
import {
  generateRandomJoinCode,
  computeJoinCodeExpiration,
  isJoinCodeActive,
  formatReceptionQrUrl,
  formatJoinCodeExpiration,
  ExpirationWindow,
} from './joinLinkUtils';
import { buildReceptionPlacardHtml } from './receptionPlacardHtml';

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
  const { facilityName, letterhead, refresh: refreshClinic } = useClinic();

  // Settings state
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [joinCode, setJoinCode] = useState<string>('');
  const [expirationWindow, setExpirationWindow] = useState<ExpirationWindow>('never');
  const [customDate, setCustomDate] = useState<Date | null>(null);
  const [customDateStr, setCustomDateStr] = useState<string>('');

  // UI action states
  const [copied, setCopied] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [printing, setPrinting] = useState<boolean>(false);

  // Sync state from settings
  useEffect(() => {
    if (settings) {
      setIsEnabled(settings.isJoinEnabled ?? true);
      setJoinCode(settings.joinCode ?? '');
      if (settings.joinCodeExpiresAt) {
        const expDate = new Date(settings.joinCodeExpiresAt);
        setCustomDate(expDate);
        setCustomDateStr(expDate.toISOString().split('T')[0]);
        // Classify window
        const diffHours = (expDate.getTime() - Date.now()) / (3600 * 1000);
        if (diffHours > 20 && diffHours <= 26) setExpirationWindow('24h');
        else if (diffHours > 140 && diffHours <= 175) setExpirationWindow('7d');
        else if (diffHours > 650 && diffHours <= 750) setExpirationWindow('30d');
        else setExpirationWindow('custom');
      } else {
        setExpirationWindow('never');
        setCustomDate(null);
        setCustomDateStr('');
      }
    }
  }, [settings]);

  // Derive expiration
  const computedExpiresAt = useMemo<Date | null>(() => {
    return computeJoinCodeExpiration(expirationWindow, customDate ?? undefined);
  }, [expirationWindow, customDate]);

  // Derive active status
  const isActive = useMemo<boolean>(() => {
    return isJoinCodeActive(isEnabled, computedExpiresAt);
  }, [isEnabled, computedExpiresAt]);

  // Derive destination join URL
  const destinationUrl = useMemo<string>(() => {
    const portalBase = getSetting('EXPO_PUBLIC_PORTAL_URL') || 'https://portal.clinicez.ph';
    const ctx = resolveTenantContext();
    const tenantSlug = ctx.tenantSlug || settings?.tenantId || 'clinic';
    const facilitySlug = ctx.facilitySlug || 'main';
    return formatReceptionQrUrl(portalBase, tenantSlug, facilitySlug, joinCode);
  }, [settings, joinCode]);

  // Actions
  const handleGenerateCode = useCallback(() => {
    const newCode = generateRandomJoinCode(8);
    setJoinCode(newCode);
    notify.info(`Generated new Join Passcode: ${newCode}`);
  }, []);

  const handleExpirationChange = useCallback((val: string) => {
    const windowVal = val as ExpirationWindow;
    setExpirationWindow(windowVal);
    if (windowVal === 'custom' && !customDate) {
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
      setCustomDate(tomorrow);
      setCustomDateStr(tomorrow.toISOString().split('T')[0]);
    }
  }, [customDate]);

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
      const html = buildReceptionPlacardHtml({
        facilityName: facilityName || settings?.clinicName || 'ClinicEZ Facility',
        qrUrl: destinationUrl,
        joinCode: joinCode || undefined,
        expiresAtFormatted: formatJoinCodeExpiration(computedExpiresAt),
        letterhead,
      });

      let printed = false;
      try {
        const Print = await import('expo-print');
        if (Print?.printAsync) {
          await Print.printAsync({ html });
          printed = true;
        }
      } catch {
        // Fall back to web print dialog below
      }

      if (!printed && typeof window !== 'undefined' && typeof window.print === 'function') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (!/cancel|dismiss/i.test(msg)) {
        notify.error('Could not print reception placard.');
      }
    } finally {
      setPrinting(false);
    }
  }, [facilityName, settings, destinationUrl, joinCode, computedExpiresAt, letterhead]);

  const handleSaveSettings = useCallback(async () => {
    if (isEnabled && joinCode.trim().length > 0 && joinCode.trim().length < 4) {
      notify.error('Join code must be at least 4 alphanumeric characters.');
      return;
    }

    setSaving(true);
    const [updated, err] = await clinicService.updateSettings({
      isJoinEnabled: isEnabled,
      joinCode: joinCode.trim() ? joinCode.trim().toUpperCase() : null,
      joinCodeExpiresAt: computedExpiresAt ? computedExpiresAt.toISOString() : null,
      clearJoinCode: !joinCode.trim(),
    });
    setSaving(false);

    if (err) {
      notify.error(err.message || 'Could not update join link settings.');
      return;
    }

    if (updated) {
      onSettingsUpdated?.(updated);
      notify.success('Patient self-enlistment settings saved.');
      await refreshClinic();
    }
  }, [isEnabled, joinCode, computedExpiresAt, onSettingsUpdated, refreshClinic]);

  return (
    <Card>
      <CardHeader
        title="Patient Self-Enlistment & Join Link"
        subtitle="Manage public walk-in QR code placard, passcodes, and registration expiration"
        icon="link"
        rightAction={
          <Badge
            label={!isEnabled ? 'Disabled' : isActive ? 'Active' : 'Code Expired'}
            variant={!isEnabled ? 'neutral' : isActive ? 'success' : 'warning'}
            size="sm"
          />
        }
      />
      <CardContent>
        {showSkeletons ? (
          <SkeletonList rows={4} />
        ) : (
          <View style={styles.content}>
            {/* Master Toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextCol}>
                <ThemedText variant="bodyBold">Enable Patient Self-Enlistment</ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Allow walk-in patients to scan the reception placard or visit the web link to register themselves
                </ThemedText>
              </View>
              <Pressable
                onPress={() => setIsEnabled(!isEnabled)}
                accessibilityRole="switch"
                accessibilityState={{ checked: isEnabled }}
                accessibilityLabel="Enable Patient Self-Enlistment"
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
                  Patient self-enlistment is currently disabled. Walk-in patients scanning the QR code will be notified that online self-registration is unavailable.
                </ThemedText>
              </View>
            )}

            {/* Join Code Configuration */}
            <View style={[styles.section, !isEnabled && styles.dimmed]}>
              <ThemedText variant="smallBold" color={theme.colors.text}>
                Alphanumeric Join Passcode
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Protects your intake queue against web crawlers. Walk-in patients must supply this passcode.
              </ThemedText>

              <View style={styles.codeRow}>
                <Input
                  containerStyle={styles.codeInputContainer}
                  value={joinCode}
                  onChangeText={(val) => setJoinCode(val.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="e.g. CDO2026"
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
                  onPress={() => setJoinCode('')}
                  disabled={!isEnabled || !joinCode}
                />
              </View>
            </View>

            {/* Expiration Selection */}
            <View style={[styles.section, !isEnabled && styles.dimmed]}>
              <ThemedText variant="smallBold" color={theme.colors.text}>
                Passcode Expiration Window
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Configure automatic expiration for periodic security rotation
              </ThemedText>

              <SegmentedControl
                options={[
                  { value: '24h', label: '24 Hours' },
                  { value: '7d', label: '7 Days' },
                  { value: '30d', label: '30 Days' },
                  { value: 'never', label: 'Never' },
                  { value: 'custom', label: 'Custom Date' },
                ]}
                value={expirationWindow}
                onChange={handleExpirationChange}
              />

              {expirationWindow === 'custom' && (
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

            {/* URL Preview & Clipboard */}
            <View style={[styles.section, !isEnabled && styles.dimmed]}>
              <ThemedText variant="smallBold" color={theme.colors.text}>
                Public Registration Link Preview
              </ThemedText>
              <View style={styles.urlBox}>
                <ThemedText variant="caption" style={styles.urlText} numberOfLines={2}>
                  {destinationUrl}
                </ThemedText>
                <Button
                  title={copied ? 'Copied!' : 'Copy Link'}
                  icon={copied ? 'check' : 'clipboard'}
                  variant="secondary"
                  size="sm"
                  onPress={handleCopyUrl}
                />
              </View>
            </View>

            {/* Reception Placard Action */}
            <View style={styles.placardSection}>
              <View style={styles.placardTextCol}>
                <ThemedText variant="smallBold" color={theme.colors.text}>
                  Printable Reception QR Placard
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Generate a clean, high-resolution physical sign for your clinic front desk with facility branding, QR code, and instructions
                </ThemedText>
              </View>
              <Button
                title="Print Placard"
                icon="printer"
                variant="outline"
                size="md"
                onPress={handlePrintPlacard}
                loading={printing}
                disabled={!isEnabled}
              />
            </View>

            {/* Save Action */}
            <View style={styles.actionsEnd}>
              <Button
                title="Save Join Link Settings"
                icon="check"
                variant="primary"
                onPress={handleSaveSettings}
                loading={saving}
              />
            </View>
          </View>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.lg,
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
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  urlText: {
    flex: 1,
    fontFamily: 'monospace',
    color: theme.colors.primaryDark,
  },
  placardSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  placardTextCol: {
    flex: 1,
    minWidth: 200,
    gap: theme.spacing.xs,
  },
  actionsEnd: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.sm,
  },
});
