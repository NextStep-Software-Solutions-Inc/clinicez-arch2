import React, { useCallback, useMemo, useState } from 'react';
import { Linking, View, StyleSheet } from 'react-native';
import { Svg, Rect, G, Path } from 'react-native-svg';
import { resolveTenantContext } from '@shared/safe';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  SegmentedControl,
  SkeletonList,
  ThemedText,
} from '@ui';
import { theme } from '@constants/theme';
import { notify } from '@utils/feedback';
import { useBreakpoint } from '@utils/useBreakpoint';
import { buildCloudTvDisplayUrl } from '@utils/queueDisplayRoute';
import { useClinic } from '../../context/ClinicContext';
import { clinicService } from '../../services/clinicService';
import { getApiBaseUrl, getPortalBaseUrl } from '../../services/runtimeConfig';
import {
  computeJoinCodeExpiration,
  deriveJoinLinkFormBaseline,
  formatJoinCodeExpiration,
  formatReceptionCodeUrl,
  formatReceptionQrUrl,
  isJoinCodeActive,
  resolveEffectiveExpirationWindow,
  resolvePublicJoinSlugs,
} from '../settings/joinLinkUtils';
import { buildQrPathData, generateQrMatrix } from '../settings/qrGenerator';
import { openReceptionPlacardPdf } from '../settings/receptionPlacardPdf';
import type { OperationsSubTool } from './toolsCatalog';

export interface OperationsUtilitiesSectionProps {
  activeTool: OperationsSubTool;
  onSelectTool: (tool: OperationsSubTool) => void;
  canImportPatient: boolean;
  canViewSettings: boolean;
  onOpenShareImport: (initialToken?: string) => void;
  onOpenSettingsTab?: (tab: string) => void;
}

async function copyUrlToClipboard(url: string, label: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      notify.success(`${label} copied to clipboard.`);
      return true;
    }
    notify.info('Clipboard access unavailable. Please copy the link manually.');
    return false;
  } catch {
    notify.error(`Could not copy ${label.toLowerCase()}.`);
    return false;
  }
}

function openExternalUrl(url: string, errorMessage: string) {
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank');
  } else {
    Linking.openURL(url).catch(() => {
      notify.error(errorMessage);
    });
  }
}

export default function OperationsUtilitiesSection({
  activeTool,
  onSelectTool,
  canImportPatient,
  canViewSettings,
  onOpenShareImport,
  onOpenSettingsTab,
}: OperationsUtilitiesSectionProps) {
  const { isCompact } = useBreakpoint();
  const { facilityName, letterhead, settings, license, workspaceProfile, loading: clinicLoading } = useClinic();
  const rowStyle = isCompact ? styles.inputCol : styles.inputRow;

  const subToolOptions = useMemo(() => {
    const opts: Array<{ value: OperationsSubTool; label: string; icon: 'scan' | 'tv' | 'qrCode' }> = [];
    if (canImportPatient) {
      opts.push({ value: 'share-import', label: 'Scan Share QR', icon: 'scan' });
    }
    opts.push({ value: 'waiting-tv', label: 'Waiting TV', icon: 'tv' });
    opts.push({ value: 'reception-placard', label: 'Check-In QR', icon: 'qrCode' });
    return opts;
  }, [canImportPatient]);

  // ── 1. Scan Patient Share QR Quick-Handoff State ──────────────────────────
  const [quickShareToken, setQuickShareToken] = useState('');

  // ── 2. Waiting Area TV URLs ───────────────────────────────────────────────
  const localLanTvUrl = useMemo<string>(() => {
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

  const portalBase = useMemo(() => getPortalBaseUrl(), []);
  const tenantCtx = useMemo(() => resolveTenantContext(), []);

  const cloudTvUrl = useMemo<string>(() => {
    return buildCloudTvDisplayUrl(portalBase, settings, tenantCtx, false);
  }, [portalBase, settings, tenantCtx]);

  // ── 3. Reception QR Check-In Placard State ────────────────────────────────
  const [printingPlacard, setPrintingPlacard] = useState(false);

  const joinBaseline = useMemo(() => deriveJoinLinkFormBaseline(settings), [settings]);
  const hasPasscode = joinBaseline.joinCode.trim().length > 0;
  const effectiveExpWindow = resolveEffectiveExpirationWindow(
    joinBaseline.joinCode,
    joinBaseline.expirationWindow,
  );
  const computedExpiresAt = useMemo<Date | null>(() => {
    if (!hasPasscode) return null;
    return computeJoinCodeExpiration(effectiveExpWindow, joinBaseline.customDate ?? undefined);
  }, [hasPasscode, effectiveExpWindow, joinBaseline.customDate]);

  const joinLinkActive = useMemo(
    () => isJoinCodeActive(joinBaseline.isEnabled, computedExpiresAt),
    [joinBaseline.isEnabled, computedExpiresAt],
  );

  const resolvedFacilityName = (facilityName || settings?.clinicName || 'Clinic EZ').trim();

  const destinationJoinUrl = useMemo<string>(() => {
    if (joinBaseline.joinCode.trim()) {
      return formatReceptionCodeUrl(portalBase, joinBaseline.joinCode.trim());
    }
    const { tenantSlug, facilitySlug } = resolvePublicJoinSlugs(tenantCtx, settings, {
      tenantSlug: workspaceProfile?.tenantSlug || license?.tenantSlug,
      facilitySlug: license?.facilitySlug,
    });
    return formatReceptionQrUrl(portalBase, tenantSlug, facilitySlug);
  }, [
    joinBaseline.joinCode,
    portalBase,
    tenantCtx,
    settings,
    workspaceProfile?.tenantSlug,
    license?.tenantSlug,
    license?.facilitySlug,
  ]);

  const qrSpecimen = useMemo(() => {
    const matrix = generateQrMatrix(destinationJoinUrl || portalBase || '/');
    const pathData = buildQrPathData(matrix.modules);
    return {
      totalSize: matrix.size + 4,
      pathData,
    };
  }, [destinationJoinUrl, portalBase]);

  const handlePrintPlacard = useCallback(async () => {
    setPrintingPlacard(true);
    try {
      const expiresAtFormatted = formatJoinCodeExpiration(computedExpiresAt);
      const placardData = {
        facilityName: resolvedFacilityName,
        qrUrl: destinationJoinUrl,
        joinCode: joinBaseline.joinCode.trim() || undefined,
        expiresAtFormatted,
        letterhead,
      };

      let pdfUrl: string | undefined;
      try {
        pdfUrl = clinicService.getReceptionPlacardPdfUrl({
          qrUrl: destinationJoinUrl,
          joinCode: joinBaseline.joinCode.trim() || undefined,
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
      setPrintingPlacard(false);
    }
  }, [resolvedFacilityName, destinationJoinUrl, joinBaseline.joinCode, computedExpiresAt, letterhead]);

  // ── Renderers ─────────────────────────────────────────────────────────────

  const renderShareImport = () => {
    if (!canImportPatient) {
      return (
        <Card>
          <EmptyState
            icon="lock"
            title="Access restricted"
            description="Ask a clinic administrator to enable patient registration access for your account."
          />
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader
          title="Scan Patient Share QR / One-Time Code"
          subtitle="Import a visiting patient’s profile using their QR code or 6-character share code."
          icon="scan"
        />

        <View style={rowStyle}>
          <View style={styles.flexFill}>
            <Input
              label="Optional share code or link"
              placeholder="Paste a share code or leave blank to scan with the camera..."
              value={quickShareToken}
              onChangeText={setQuickShareToken}
              autoCapitalize="none"
            />
          </View>
          <Button
            title="Open Patient QR Scanner"
            icon="scan"
            variant="primary"
            onPress={() => {
              const trimmed = quickShareToken.trim();
              onOpenShareImport(trimmed || undefined);
            }}
          />
        </View>

        <View style={styles.infoPanel}>
          <ThemedText variant="smallBold">How Patient Check-In Import Works</ThemedText>
          <ThemedText variant="small" color={theme.colors.textSecondary}>
            1. Ask the patient to open their Share QR or 6-character code in the ClinicEZ Patient App.
          </ThemedText>
          <ThemedText variant="small" color={theme.colors.textSecondary}>
            2. Scan with the camera or enter the code on the next screen — you can also add them to today&apos;s queue.
          </ThemedText>
        </View>
      </Card>
    );
  };

  const renderWaitingTv = () => {
    const maskNames = settings?.tvDisplayMaskPatientNames ?? true;
    const showPhysician = settings?.tvDisplayShowPhysicianName ?? true;
    const hasPin = Boolean(settings?.tvDisplayPin && settings.tvDisplayPin.trim().length > 0);

    return (
      <Card>
        <CardHeader
          title="Waiting Room TV Queue Display"
          subtitle="Open the waiting-room TV screen (no login required) on a lobby monitor or smart TV."
          icon="tv"
          rightAction={
            canViewSettings && onOpenSettingsTab ? (
              <Button
                title="TV Settings"
                size="sm"
                variant="outline"
                icon="settings"
                onPress={() => onOpenSettingsTab('general')}
              />
            ) : undefined
          }
        />

        {clinicLoading && !settings ? (
          <SkeletonList rows={3} rowHeight={theme.sizes.controlMd} />
        ) : (
          <View style={styles.stackMd}>
            <View style={styles.badgeRow}>
              <Badge
                label={maskNames ? 'Patient Names Masked' : 'Full Names Shown'}
                variant={maskNames ? 'success' : 'warning'}
                size="sm"
              />
              <Badge
                label={hasPin ? 'TV PIN Enabled' : 'No TV PIN'}
                variant={hasPin ? 'info' : 'neutral'}
                size="sm"
              />
              <Badge
                label={showPhysician ? 'Clinician Names Shown' : 'Room / Station Only'}
                variant="neutral"
                size="sm"
              />
            </View>

            <View style={isCompact ? styles.tvLinksCol : styles.tvLinksRow}>
              {/* Local Wi-Fi Display */}
              <View style={[styles.linkCard, !isCompact && styles.flexFill]}>
                <View style={styles.linkHeader}>
                  <View style={styles.flexFill}>
                    <ThemedText variant="bodyBold">Clinic Wi-Fi / Local TV Link</ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Best for TVs connected to the same local clinic Wi-Fi.
                    </ThemedText>
                  </View>
                  <Badge label="Recommended" variant="routine" size="sm" />
                </View>
                <View style={styles.urlBox}>
                  <ThemedText variant="caption" style={styles.urlText} numberOfLines={2}>
                    {localLanTvUrl}
                  </ThemedText>
                </View>
                <View style={styles.actionsRow}>
                  <Button
                    title="Open Local TV"
                    icon="externalLink"
                    variant="primary"
                    size="sm"
                    onPress={() => openExternalUrl(localLanTvUrl, 'Could not open Local Waiting Room TV display.')}
                  />
                  <Button
                    title="Copy Link"
                    icon="copy"
                    variant="outline"
                    size="sm"
                    onPress={() => void copyUrlToClipboard(localLanTvUrl, 'Local TV Display link')}
                  />
                </View>
              </View>

              {/* Cloud Smart TV Display */}
              <View style={[styles.linkCard, !isCompact && styles.flexFill]}>
                <View style={styles.linkHeader}>
                  <View style={styles.flexFill}>
                    <ThemedText variant="bodyBold">Cloud Smart TV Link</ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Open on any internet-connected smart TV using your clinic&apos;s web address.
                    </ThemedText>
                  </View>
                </View>
                {cloudTvUrl ? (
                  <>
                    <View style={styles.urlBox}>
                      <ThemedText variant="caption" style={styles.urlText} numberOfLines={2}>
                        {cloudTvUrl}
                      </ThemedText>
                    </View>
                    <View style={styles.actionsRow}>
                      <Button
                        title="Open Cloud TV"
                        icon="externalLink"
                        variant="outline"
                        size="sm"
                        onPress={() => openExternalUrl(cloudTvUrl, 'Could not open Cloud TV display.')}
                      />
                      <Button
                        title="Copy Link"
                        icon="copy"
                        variant="secondary"
                        size="sm"
                        onPress={() => void copyUrlToClipboard(cloudTvUrl, 'Cloud TV Display link')}
                      />
                    </View>
                  </>
                ) : (
                  <EmptyState
                    icon="tv"
                    title="Cloud TV link not set up yet"
                    description="Set up your clinic web address in Settings to enable the Cloud Smart TV link."
                  />
                )}
              </View>
            </View>
          </View>
        )}
      </Card>
    );
  };

  const renderReceptionPlacard = () => (
    <Card>
      <CardHeader
        title="Front-Desk Check-In QR Poster"
        subtitle="Share the walk-in check-in link or print a fresh front-desk QR poster for patients."
        icon="qrCode"
        rightAction={
          <Badge
            label={!joinBaseline.isEnabled ? 'Disabled' : joinLinkActive ? 'Active' : 'Code Expired'}
            variant={!joinBaseline.isEnabled ? 'neutral' : joinLinkActive ? 'success' : 'warning'}
            size="sm"
          />
        }
      />

      {clinicLoading && !settings ? (
        <SkeletonList rows={4} rowHeight={theme.sizes.controlMd} />
      ) : (
        <View style={isCompact ? styles.placardCol : styles.placardRow}>
          <View style={styles.qrPreviewBox}>
            <View style={styles.qrFrame}>
              <Svg
                width={156}
                height={156}
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
            <ThemedText variant="smallBold" numberOfLines={1}>
              {resolvedFacilityName}
            </ThemedText>
            <Badge
              label={hasPasscode ? `Passcode: ${joinBaseline.joinCode.trim()}` : 'Open Check-In (No Passcode)'}
              variant={hasPasscode ? 'primary' : 'neutral'}
              size="sm"
            />
          </View>

          <View style={styles.placardDetails}>
            <View style={styles.stackSm}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Patient Registration Link
              </ThemedText>
              <View style={styles.urlBox}>
                <ThemedText variant="caption" style={styles.urlText} numberOfLines={3}>
                  {destinationJoinUrl}
                </ThemedText>
              </View>
            </View>

            {!joinBaseline.isEnabled ? (
              <ThemedText variant="small" color={theme.colors.warningText}>
                Walk-in QR check-in is currently disabled in Clinic Settings. An administrator can re-enable it under Settings → General.
              </ThemedText>
            ) : null}

            <View style={styles.actionsRow}>
              <Button
                title="Print QR Poster PDF"
                icon="printer"
                variant="primary"
                loading={printingPlacard}
                disabled={!joinBaseline.isEnabled}
                onPress={handlePrintPlacard}
              />
              <Button
                title="Copy Join Link"
                icon="copy"
                variant="outline"
                onPress={() => void copyUrlToClipboard(destinationJoinUrl, 'Patient Join Link')}
              />
              {canViewSettings && onOpenSettingsTab ? (
                <Button
                  title="Manage in Settings"
                  icon="settings"
                  variant="ghost"
                  onPress={() => onOpenSettingsTab('general')}
                />
              ) : null}
            </View>
          </View>
        </View>
      )}
    </Card>
  );

  return (
    <View style={styles.container}>
      <SegmentedControl
        options={subToolOptions}
        value={activeTool}
        onChange={onSelectTool}
      />

      {activeTool === 'share-import' ? renderShareImport() : null}
      {activeTool === 'waiting-tv' ? renderWaitingTv() : null}
      {activeTool === 'reception-placard' ? renderReceptionPlacard() : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  flexFill: {
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-end',
  },
  inputCol: {
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  stackMd: {
    gap: theme.spacing.md,
  },
  stackSm: {
    gap: theme.spacing.xs,
  },
  infoPanel: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  tvLinksRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing.md,
  },
  tvLinksCol: {
    flexDirection: 'column',
    gap: theme.spacing.md,
  },
  linkCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  linkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  urlBox: {
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  urlText: {
    color: theme.colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  placardRow: {
    flexDirection: 'row',
    gap: theme.spacing.xl,
    alignItems: 'flex-start',
  },
  placardCol: {
    flexDirection: 'column',
    gap: theme.spacing.lg,
  },
  qrPreviewBox: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
  qrFrame: {
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  placardDetails: {
    flex: 1,
    gap: theme.spacing.md,
  },
});
