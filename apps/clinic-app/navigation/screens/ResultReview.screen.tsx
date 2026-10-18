import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  SegmentedControl,
  SkeletonList,
  ThemedText,
} from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { PERMISSIONS } from '@constants/permissions';
import { notify } from '@utils/feedback';
import { formatDateTime } from '@utils/formatDateTime';
import { usePermission } from '../../context/AuthContext';
import { openDocument } from '../../services/documentOpener';
import {
  clinicService,
  type LabResultReviewItem,
  type LabResultReviewScope,
  type LabResultVerificationState,
} from '../../services/clinicService';
import {
  belongsInReviewFilter,
  canReviewResult,
  formatFileSize,
  REVIEW_SCOPE_OPTIONS,
  REVIEW_STATE_OPTIONS,
  resultOriginName,
  validateReviewDecision,
} from '../../services/labResultReview';
import { ResultProvenanceBadges } from '../../components/interop/InteropBadges';

const STATE_OPTIONS = [...REVIEW_STATE_OPTIONS];
const SCOPE_OPTIONS = [...REVIEW_SCOPE_OPTIONS];

export default function ResultReviewScreen() {
  const canRead = usePermission(PERMISSIONS.labOrdersRead);
  const canReview = usePermission(PERMISSIONS.labResultsReview);

  const [stateFilter, setStateFilter] = useState<LabResultVerificationState>('Unverified');
  const [scope, setScope] = useState<LabResultReviewScope>('mine');
  const [items, setItems] = useState<LabResultReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<LabResultReviewItem | null>(null);
  const [remarks, setRemarks] = useState('');
  const [remarksError, setRemarksError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'accept' | 'reject' | null>(null);
  const [openingFile, setOpeningFile] = useState(false);

  // Ignore responses from superseded requests when the filters change quickly.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    const [data, err] = await clinicService.getLabResultReviewQueue(stateFilter, scope);
    if (current !== requestId.current) return;
    if (err) {
      setLoadError(err.message || 'Unable to load lab results for review.');
      return;
    }
    setLoadError(null);
    setItems(data ?? []);
  }, [stateFilter, scope]);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load, canRead]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openDetail = (item: LabResultReviewItem) => {
    setSelected(item);
    setRemarks('');
    setRemarksError(null);
  };

  const closeDetail = () => {
    if (submitting) return;
    setSelected(null);
  };

  const viewFile = async (item: LabResultReviewItem) => {
    setOpeningFile(true);
    try {
      const opened = await openDocument(clinicService.getLabResultFileUrl(item.id), item.contentType ?? undefined);
      if (!opened) notify.error('Could not open the result file.');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Could not open the result file.');
    } finally {
      setOpeningFile(false);
    }
  };

  const submitReview = async (accepted: boolean) => {
    if (!selected || submitting) return;
    const check = validateReviewDecision(accepted, remarks);
    if (!check.ok) {
      setRemarksError(check.error);
      return;
    }
    setRemarksError(null);
    setSubmitting(accepted ? 'accept' : 'reject');
    const [updated, err] = await clinicService.reviewLabResult(selected.id, {
      accepted,
      ...(check.remarks ? { remarks: check.remarks } : {}),
    });
    setSubmitting(null);

    if (err || !updated) {
      // 400/409: already reviewed or verified by the Clinic EZ lab. Refresh so the list reflects the server.
      notify.error(err?.message || 'The review could not be saved.');
      if (err && (err.status === 400 || err.status === 409)) {
        setSelected(null);
        void load();
      }
      return;
    }

    setItems((prev) =>
      belongsInReviewFilter(updated, stateFilter)
        ? prev.map((i) => (i.id === updated.id ? updated : i))
        : prev.filter((i) => i.id !== updated.id)
    );
    setSelected(null);
    notify.success(accepted ? `Result for ${updated.patientName} accepted.` : `Result for ${updated.patientName} rejected.`);
  };

  const renderList = () => {
    if (!canRead) {
      return (
        <EmptyState
          icon="lock"
          title="Not available for your role"
          description="Reviewing lab results needs the lab orders read permission."
        />
      );
    }
    if (loading && !refreshing) {
      return <SkeletonList rows={4} rowHeight={theme.sizes.controlLg + theme.spacing.lg} />;
    }
    if (loadError) {
      return (
        <ErrorState
          title="Unable to load lab results"
          message={loadError}
          onRetry={() => {
            setLoading(true);
            load().finally(() => setLoading(false));
          }}
        />
      );
    }
    if (items.length === 0) {
      return (
        <EmptyState
          icon="lab"
          title={stateFilter === 'Unverified' ? 'Nothing waiting for review' : `No ${stateFilter.toLowerCase()} results`}
          description={scope === 'mine' ? 'Switch to "All" to see results for other doctors\' patients.' : undefined}
        />
      );
    }

    return (
      <View style={styles.list}>
        {items.map((item) => {
          const tests = item.testNames.length > 0 ? item.testNames.join(', ') : 'No tests listed';
          return (
            <Card key={item.id} style={styles.row}>
              <View style={styles.rowMain}>
                <View style={styles.rowTitle}>
                  <ThemedText variant="bodyBold">{item.patientName}</ThemedText>
                  {item.hasPanicAlert ? <Badge label="Panic value" variant="emergency" size="sm" icon="emergency" /> : null}
                </View>
                <ResultProvenanceBadges source={item.source} verificationState={item.verificationState} />
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  {item.orderNumber} · {tests}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {resultOriginName(item)} · Submitted {formatDateTime(item.submittedAtUtc)}
                </ThemedText>
              </View>
              <Button
                title={canReviewResult(item) ? 'Review' : 'View'}
                size="sm"
                variant={canReviewResult(item) ? 'primary' : 'outline'}
                icon="eye"
                onPress={() => openDetail(item)}
              />
            </Card>
          );
        })}
      </View>
    );
  };

  const actionable = selected ? canReviewResult(selected) : false;

  return (
    <ResponsiveLayout headerTitle="Result review" headerSubtitle="Lab results awaiting doctor verification">
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        <View style={styles.filters}>
          <SegmentedControl options={STATE_OPTIONS} value={stateFilter} onChange={setStateFilter} />
          <SegmentedControl options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        </View>
        {renderList()}
      </ScrollView>

      <Modal
        visible={selected !== null}
        onClose={closeDetail}
        title={selected ? selected.patientName : 'Lab result'}
        subtitle={selected ? `Order ${selected.orderNumber}` : undefined}
        footer={
          selected ? (
            <View style={styles.footer}>
              <Button title="Close" variant="secondary" onPress={closeDetail} disabled={submitting !== null} />
              {actionable && canReview ? (
                <>
                  <Button
                    title="Reject"
                    variant="danger"
                    icon="close"
                    loading={submitting === 'reject'}
                    disabled={submitting === 'accept'}
                    onPress={() => submitReview(false)}
                  />
                  <Button
                    title="Accept"
                    variant="success"
                    icon="check"
                    loading={submitting === 'accept'}
                    disabled={submitting === 'reject'}
                    onPress={() => submitReview(true)}
                  />
                </>
              ) : null}
            </View>
          ) : undefined
        }
      >
        {selected ? (
          <>
            <ResultProvenanceBadges source={selected.source} verificationState={selected.verificationState} />
            {selected.hasPanicAlert ? (
              <Badge label="Panic value flagged on this result" variant="emergency" icon="emergency" />
            ) : null}

            <View style={styles.detailGroup}>
              <DetailRow label="Tests" value={selected.testNames.join(', ') || '--'} />
              <DetailRow label="Source" value={resultOriginName(selected)} />
              <DetailRow label="Ordered by" value={selected.orderedByDoctorName || '--'} />
              <DetailRow label="Submitted" value={formatDateTime(selected.submittedAtUtc)} />
              {selected.verifiedByName ? (
                <DetailRow
                  label="Reviewed by"
                  value={`${selected.verifiedByName}${selected.verifiedAtUtc ? ` · ${formatDateTime(selected.verifiedAtUtc)}` : ''}`}
                />
              ) : null}
              {selected.remarks ? <DetailRow label="Remarks" value={selected.remarks} /> : null}
            </View>

            {selected.fileName ? (
              <View style={styles.fileRow}>
                <View style={styles.rowMain}>
                  <ThemedText variant="bodyBold" numberOfLines={1}>
                    {selected.fileName}
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    {[selected.contentType, formatFileSize(selected.fileSizeBytes)].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
                <Button
                  title="View file"
                  icon="file"
                  variant="outline"
                  size="sm"
                  loading={openingFile}
                  onPress={() => viewFile(selected)}
                />
              </View>
            ) : (
              <ThemedText variant="small" color={theme.colors.textMuted}>
                No file is attached to this result.
              </ThemedText>
            )}

            {actionable && canReview ? (
              <Input
                label="Remarks"
                placeholder="Required when rejecting; optional when accepting"
                value={remarks}
                onChangeText={(value) => {
                  setRemarks(value);
                  if (remarksError) setRemarksError(null);
                }}
                multiline
                editable={submitting === null}
                error={remarksError ?? undefined}
              />
            ) : null}
            {actionable && !canReview ? (
              <ThemedText variant="small" color={theme.colors.textSecondary}>
                You can view this result, but accepting or rejecting it needs the lab result review permission.
              </ThemedText>
            ) : null}
            {!actionable ? (
              <ThemedText variant="small" color={theme.colors.textSecondary}>
                {selected.source === 'ClinicEzLab'
                  ? 'Results from the Clinic EZ lab are verified automatically.'
                  : 'This result has already been reviewed.'}
              </ThemedText>
            ) : null}
          </>
        ) : null}
      </Modal>
    </ResponsiveLayout>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.detailLabel}>
        {label}
      </ThemedText>
      <ThemedText variant="body" style={styles.detailValue}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surfaceMuted,
  },
  content: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  list: {
    gap: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  rowMain: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  rowTitle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  detailGroup: {
    gap: theme.spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  detailLabel: {
    width: theme.sizes.sidebarCollapsedWidth + theme.spacing.lg,
  },
  detailValue: {
    flex: 1,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
  },
});
