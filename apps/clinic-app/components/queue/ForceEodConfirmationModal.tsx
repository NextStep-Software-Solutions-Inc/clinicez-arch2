import React, { useState, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Modal from '../ui/Modal';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import { theme } from '../../constants/theme';
import { Alert, notify } from '../../utils/feedback';
import { openDocument } from '../../services/documentOpener';
import { clinicService, getManilaTodayStr, ReconcileEodResult } from '../../services/clinicService';

export interface ForceEodConfirmationModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (result: ReconcileEodResult) => void;
  activeTicketCount?: number;
  date?: string;
}

export function ForceEodConfirmationModal({
  visible,
  onClose,
  onSuccess,
  activeTicketCount = 0,
  date,
}: ForceEodConfirmationModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const handleClose = () => {
    if (submitting || inFlightRef.current) return;
    setErrorMessage(null);
    onClose();
  };

  const handleDownloadReport = async (reconciliationDate?: string) => {
    const targetDate = reconciliationDate || date || getManilaTodayStr();
    const pdfUrl = clinicService.getDailyEodPdfUrl(targetDate);
    const opened = await openDocument(pdfUrl);
    if (!opened) {
      notify.error('Could not download the Daily EOD Report PDF. Please try again.');
    }
  };

  const handleFailure = (msg: string) => {
    setErrorMessage(msg);
    notify.error(msg);
    Alert.alert('EOD Reconciliation Failed', msg, [
      {
        text: 'Close',
        style: 'cancel',
        onPress: () => {
          setErrorMessage(null);
          onClose();
        },
      },
      {
        text: 'Retry',
        onPress: () => handleConfirm(),
      },
    ]);
  };

  const handleConfirm = async () => {
    if (submitting || inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setErrorMessage(null);
    const targetDate = date || getManilaTodayStr();
    try {
      const [res, err] = await clinicService.reconcileEod(
        targetDate,
        reason.trim() || 'Manual Force EOD triggered from workstation'
      );
      if (err) {
        const errMsg = err?.message || 'Failed to reconcile end-of-day queue.';
        inFlightRef.current = false;
        setSubmitting(false);
        handleFailure(errMsg);
        return;
      }
      if (res) {
        const summaryMsg =
          res.summary || `Clinic day closed: ${res.reconciledCount} ticket(s) reconciled.`;
        const reportDate = res.reconciliationDate || targetDate;
        const dialogMessage = `${summaryMsg}\n\nReconciliation Date: ${reportDate}\nTickets Reconciled: ${res.reconciledCount}`;
        notify.success(summaryMsg);
        onSuccess?.(res);
        onClose();
        Alert.alert('End-of-Day Reconciliation Complete', dialogMessage, [
          {
            text: 'Close',
            style: 'cancel',
          },
          {
            text: 'Download Report',
            onPress: () => handleDownloadReport(reportDate),
          },
        ]);
        return;
      }
      onClose();
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to reconcile end-of-day queue.';
      inFlightRef.current = false;
      setSubmitting(false);
      handleFailure(errMsg);
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={handleClose}
      title="Close Clinic Day (Force EOD)"
      maxWidth={520}
      footer={
        <View style={styles.footerRow}>
          <Button
            title="Cancel"
            variant="outline"
            size="md"
            disabled={submitting}
            onPress={handleClose}
            style={styles.actionBtn}
          />
          <Button
            title={submitting ? 'Reconciling...' : 'Confirm & Close Day'}
            variant="danger"
            size="md"
            icon="clock"
            loading={submitting}
            disabled={submitting}
            onPress={handleConfirm}
            style={styles.actionBtn}
          />
        </View>
      }
    >
      <View style={styles.content}>
        {errorMessage ? (
          <View style={styles.warningBanner}>
            <Icon name="alertCircle" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
            <View style={styles.bannerText}>
              <ThemedText variant="bodyBold" style={styles.bannerTitle}>
                EOD Reconciliation Failed
              </ThemedText>
              <ThemedText variant="small" style={styles.bannerMessage}>
                {errorMessage}
              </ThemedText>
              <View style={styles.footerRow}>
                <Button
                  title="Close"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onPress={handleClose}
                />
                <Button
                  title="Retry"
                  variant="danger"
                  size="sm"
                  icon="refresh"
                  loading={submitting}
                  disabled={submitting}
                  onPress={handleConfirm}
                />
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.warningBanner}>
          <Icon name="alert" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
          <View style={styles.bannerText}>
            <ThemedText variant="bodyBold" style={styles.bannerTitle}>
              End-of-Day Queue Closure
            </ThemedText>
            <ThemedText variant="body" style={styles.bannerMessage}>
              Closing the clinic day will immediately transition all remaining active waiting tickets (Waiting, Triaged, and On Hold) to No-Show with a completion timestamp.
            </ThemedText>
          </View>
        </View>

        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              Active Waiting Tickets
            </ThemedText>
            <Badge
              label={`${activeTicketCount} Active Ticket${activeTicketCount === 1 ? '' : 's'}`}
              variant={activeTicketCount > 0 ? 'urgent' : 'neutral'}
            />
          </View>
          <View style={styles.detailRow}>
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              Action Taken
            </ThemedText>
            <Badge label="Transition to No-Show" variant="emergency" />
          </View>
          <View style={styles.detailRow}>
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              Audit Trail
            </ThemedText>
            <Badge label="EOD Reconciliation Audit" variant="primary" />
          </View>
        </View>

        <View style={styles.reassuranceCard}>
          <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.successText} />
          <ThemedText variant="small" color={theme.colors.successText} style={styles.reassuranceText}>
            Clinical Invariant: Consultations currently in progress (In Consultation) and Completed encounters will NOT be altered or invalidated.
          </ThemedText>
        </View>

        <Input
          label="Closure Reason or Note (Optional)"
          placeholder="e.g. Regular clinic closing hours, staff shift change..."
          value={reason}
          onChangeText={setReason}
          editable={!submitting}
        />
      </View>
    </Modal>
  );
}

export default ForceEodConfirmationModal;

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.md,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  bannerText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  bannerTitle: {
    color: theme.colors.emergencyText,
  },
  bannerMessage: {
    color: theme.colors.emergencyText,
  },
  detailsCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reassuranceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  reassuranceText: {
    flex: 1,
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  actionBtn: {
    minWidth: 120,
  },
});
