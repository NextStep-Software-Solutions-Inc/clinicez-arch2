import React from 'react';
import { View, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import { IconSlot } from '../ui/Icon';
import Badge, { type BadgeVariant } from '../ui/Badge';
import Button from '../ui/Button';
import { useBreakpoint } from '../../utils/useBreakpoint';
import type { ClinicAuditEntryDto, ClinicAuditEntryDetailDto } from '../../services/clinicService';

export interface AuditInspectionDrawerProps {
  entry: ClinicAuditEntryDto | null;
  detail: ClinicAuditEntryDetailDto | null;
  loadingDetail?: boolean;
  onClose: () => void;
}

export function AuditInspectionDrawer({
  entry,
  detail,
  loadingDetail = false,
  onClose,
}: AuditInspectionDrawerProps) {
  const { isDesktop } = useBreakpoint();

  if (!entry) return null;

  const severityVariant: BadgeVariant =
    entry.severity === 'Emergency'
      ? 'emergency'
      : entry.severity === 'Urgent'
        ? 'urgent'
        : 'routine';

  const outcomeVariant: BadgeVariant =
    entry.outcome === 'Success'
      ? 'success'
      : entry.outcome === 'Failure'
        ? 'emergency'
        : 'warning';

  const content = (
    <View style={styles.drawerCard}>
      {/* Drawer Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <ThemedText style={styles.headerSubtitle}>Forensic Entry Inspection</ThemedText>
          <ThemedText style={styles.headerTitle} numberOfLines={1}>
            {entry.action}
          </ThemedText>
          <View style={styles.badgesRow}>
            <Badge variant={severityVariant} label={entry.severity === 'Emergency' ? 'STAT' : entry.severity} size="sm" />
            <Badge variant={outcomeVariant} label={entry.outcome} size="sm" />
            <Badge variant="neutral" label={entry.category} size="sm" />
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close inspection drawer"
          onPress={onClose}
          style={styles.closeButton}
        >
          <IconSlot value="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Description Banner */}
        <View style={styles.descriptionCard}>
          <ThemedText style={styles.descriptionLabel}>Action Summary</ThemedText>
          <ThemedText style={styles.descriptionText}>{entry.description}</ThemedText>
        </View>

        {/* Section 1: Event Identity & Timing */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionHeader}>Event Identity & Timing</ThemedText>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaKey}>Event ID</ThemedText>
            <ThemedText style={styles.metaValueCode}>{entry.id}</ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaKey}>UTC Timestamp</ThemedText>
            <ThemedText style={styles.metaValueCode}>{entry.timestamp}</ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaKey}>Local Recorded</ThemedText>
            <ThemedText style={styles.metaValue}>{new Date(entry.timestamp).toLocaleString()}</ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaKey}>Action Verb</ThemedText>
            <ThemedText style={styles.metaValueCode}>{entry.action}</ThemedText>
          </View>
        </View>

        {/* Section 2: Actor & Forensic Network Identity */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionHeader}>Actor & Forensic Network Identity</ThemedText>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaKey}>Actor Name</ThemedText>
            <ThemedText style={styles.metaValueBold}>{entry.actorName}</ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaKey}>Role</ThemedText>
            <ThemedText style={styles.metaValue}>{entry.actorRole}</ThemedText>
          </View>
          {entry.actorStaffId ? (
            <View style={styles.metaRow}>
              <ThemedText style={styles.metaKey}>Staff ID</ThemedText>
              <ThemedText style={styles.metaValueCode}>{entry.actorStaffId}</ThemedText>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaKey}>Client IP Address</ThemedText>
            <ThemedText style={styles.metaValueCode}>
              {entry.clientIpAddress || 'Internal / Service'}
            </ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaKey}>User Agent</ThemedText>
            <ThemedText style={styles.metaValueSubtle}>
              {entry.userAgent || 'Clinic EZ Workstation'}
            </ThemedText>
          </View>
        </View>

        {/* Section 3: Target Correlation & Multi-Tenancy */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionHeader}>Target Correlation & Multi-Tenancy</ThemedText>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaKey}>Target Type</ThemedText>
            <ThemedText style={styles.metaValueBold}>{entry.targetEntityType}</ThemedText>
          </View>
          {entry.targetEntityId ? (
            <View style={styles.metaRow}>
              <ThemedText style={styles.metaKey}>Target Entity ID</ThemedText>
              <ThemedText style={styles.metaValueCode}>{entry.targetEntityId}</ThemedText>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaKey}>Clinic ID</ThemedText>
            <ThemedText style={styles.metaValueCode}>{entry.clinicId}</ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaKey}>Tenant ID</ThemedText>
            <ThemedText style={styles.metaValueCode}>{entry.tenantId}</ThemedText>
          </View>
        </View>

        {/* Section 4: Patient Privacy Protection (RA 10173 Compliance) */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText style={styles.sectionHeader}>Patient Privacy Protection</ThemedText>
            <Badge variant="routine" label="DPA RA 10173 Compliant" size="xs" />
          </View>
          <View style={styles.privacyBanner}>
            <IconSlot value="shield" size={theme.sizes.iconSm} color={theme.colors.routine} />
            <ThemedText style={styles.privacyBannerText}>
              Direct PHI is cryptographically segregated. Only masked identifiers and structural metadata are stored.
            </ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaKey}>Masked Name</ThemedText>
            <ThemedText style={styles.metaValueBold}>
              {entry.patientNameMasked || '— (Non-patient event)'}
            </ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText style={styles.metaKey}>PhilHealth PIN</ThemedText>
            <ThemedText style={styles.metaValueCode}>
              {entry.patientPinMasked || '—'}
            </ThemedText>
          </View>
          {entry.patientId ? (
            <View style={styles.metaRow}>
              <ThemedText style={styles.metaKey}>Patient Internal ID</ThemedText>
              <ThemedText style={styles.metaValueCode}>{entry.patientId}</ThemedText>
            </View>
          ) : null}
        </View>

        {/* Section 5: Cryptographic Forensic Checksums (SHA-256) */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionHeader}>Cryptographic Forensic Checksums (SHA-256)</ThemedText>
          <ThemedText style={styles.checksumsIntro}>
            SHA-256 cryptographic digests verify medical narrative integrity without persisting unredacted clinical prose.
          </ThemedText>
          {loadingDetail ? (
            <ThemedText style={styles.loadingText}>Fetching cryptographic digests...</ThemedText>
          ) : detail?.proseChecksums && Object.keys(detail.proseChecksums).length > 0 ? (
            <View style={styles.checksumsList}>
              {Object.entries(detail.proseChecksums).map(([field, hash]) => (
                <View key={field} style={styles.checksumItem}>
                  <ThemedText style={styles.checksumField}>{field}</ThemedText>
                  <ThemedText style={styles.checksumHash} selectable numberOfLines={1}>
                    {hash}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.noChecksumsCard}>
              <ThemedText style={styles.noChecksumsText}>
                No free-text clinical prose hashes attached to this transaction.
              </ThemedText>
            </View>
          )}
        </View>

        {/* Section 6: Sanitized Metadata & Diff Viewer */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionHeader}>Sanitized Metadata & Diff Viewer</ThemedText>
          <View style={styles.codeBlockContainer}>
            <ThemedText style={styles.codeBlockText} selectable>
              {formatMetadataJson(entry.metadataJson)}
            </ThemedText>
          </View>
        </View>
      </ScrollView>

      {/* Drawer Footer */}
      <View style={styles.footer}>
        <Button
          title="Close Inspection"
          variant="secondary"
          size="md"
          icon="close"
          onPress={onClose}
        />
      </View>
    </View>
  );

  if (isDesktop) {
    return (
      <View style={styles.desktopOverlay}>
        <Pressable style={styles.desktopBackdrop} onPress={onClose} accessibilityLabel="Dismiss inspection drawer" />
        <View style={styles.desktopDrawerContainer}>
          {content}
        </View>
      </View>
    );
  }

  return (
    <Modal
      visible={Boolean(entry)}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {content}
      </View>
    </Modal>
  );
}

function formatMetadataJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw || '{}';
  }
}

const styles = StyleSheet.create({
  desktopOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    zIndex: 1000,
  },
  desktopBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
  },
  desktopDrawerContainer: {
    width: 480,
    height: '100%',
    backgroundColor: theme.colors.surface,
    borderLeftWidth: theme.sizes.borderWidth,
    borderLeftColor: theme.colors.border,
    ...theme.shadows.lg,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  drawerCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceMuted,
  },
  headerTitleGroup: {
    flex: 1,
    gap: theme.spacing.xs,
    marginRight: theme.spacing.md,
  },
  headerSubtitle: {
    color: theme.colors.textMuted,
    ...theme.typography.captionBold,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: theme.colors.text,
    ...theme.typography.title,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  closeButton: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  descriptionCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.xs,
  },
  descriptionLabel: {
    color: theme.colors.textMuted,
    ...theme.typography.captionBold,
  },
  descriptionText: {
    color: theme.colors.text,
    ...theme.typography.body,
  },
  section: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeader: {
    color: theme.colors.text,
    ...theme.typography.h3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  metaKey: {
    color: theme.colors.textMuted,
    ...theme.typography.small,
  },
  metaValue: {
    color: theme.colors.text,
    ...theme.typography.small,
  },
  metaValueBold: {
    color: theme.colors.text,
    ...theme.typography.smallBold,
  },
  metaValueCode: {
    color: theme.colors.textSecondary,
    ...theme.typography.code,
  },
  metaValueSubtle: {
    color: theme.colors.textSecondary,
    ...theme.typography.caption,
    maxWidth: 240,
    textAlign: 'right',
  },
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.routineBg,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.routineBorder,
  },
  privacyBannerText: {
    flex: 1,
    color: theme.colors.routineText,
    ...theme.typography.caption,
  },
  checksumsIntro: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
  },
  checksumsList: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  checksumItem: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.xs,
  },
  checksumField: {
    color: theme.colors.textSecondary,
    ...theme.typography.captionBold,
  },
  checksumHash: {
    color: theme.colors.primaryDark,
    ...theme.typography.code,
  },
  loadingText: {
    color: theme.colors.textMuted,
    ...theme.typography.small,
    fontStyle: 'italic',
  },
  noChecksumsCard: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.sm,
  },
  noChecksumsText: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
  },
  codeBlockContainer: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  codeBlockText: {
    color: theme.colors.text,
    ...theme.typography.code,
  },
  footer: {
    padding: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'flex-end',
  },
});
export default AuditInspectionDrawer;
