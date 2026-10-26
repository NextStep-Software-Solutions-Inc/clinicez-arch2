import { useEffect, useRef, useState, useCallback } from 'react';
import { Image, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { differenceInSeconds, format, parseISO } from 'date-fns';
import ThemedText from '../../../components/ui/ThemedText';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import { AppIcon } from '../../../components/ui/Icon';
import Screen from '../../../components/layout/Screen';
import EntityCoverHeader from '../../../components/ui/EntityCoverHeader';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import AppointmentStatusBadge from '../../../components/appointments/AppointmentStatusBadge';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { db } from '../../../db/index';
import { getAppointmentDetail } from '../../../services/appointments/appointmentsService';
import type { AppointmentItem, AttachedDocument, AffiliatedClinic, ProviderSnapshot } from '../../../services/appointments/types';
import { dialog } from '../../../utils/dialog';

type Props = StaticScreenProps<{ appointmentId: string }>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Overdue';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <ThemedText variant="small" color="textMuted" style={styles.infoLabel}>
        {label}
      </ThemedText>
      <ThemedText variant="smallBold" style={styles.infoValue}>
        {value}
      </ThemedText>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PaymentCountdown({ dueAt }: { dueAt: string }) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    try {
      return Math.max(0, differenceInSeconds(parseISO(dueAt), new Date()));
    } catch {
      return 0;
    }
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft(() => {
        try {
          return Math.max(0, differenceInSeconds(parseISO(dueAt), new Date()));
        } catch {
          return 0;
        }
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [dueAt]);

  const isOverdue = secondsLeft <= 0;

  return (
    <View style={styles.countdownRow}>
      <AppIcon name={isOverdue ? 'warning' : 'clock'} size={14} color={isOverdue ? 'emergency' : 'warning'} />
      <ThemedText
        variant="smallBold"
        color={isOverdue ? 'emergencyText' : 'warningText'}
      >
        {isOverdue
          ? 'Payment overdue - appointment may be canceled'
          : `Pay within: ${formatCountdown(secondsLeft)}`}
      </ThemedText>
    </View>
  );
}

function DocumentRow({ doc }: { doc: AttachedDocument }) {
  const { colors, radii, spacing, sizes } = useAppTheme();
  const uploadedLabel = (() => {
    try {
      return format(parseISO(doc.uploadedAt), 'MMM d, yyyy');
    } catch {
      return '';
    }
  })();

  return (
    <View style={[styles.docRow, { borderColor: colors.border, paddingVertical: spacing.sm }]}>
      <View
        style={[
          styles.docIconBox,
          {
            backgroundColor: colors.primaryLight,
            borderRadius: radii.md,
            width: sizes.controlMd,
            height: sizes.controlMd,
          },
        ]}
      >
        <AppIcon name="document" size={sizes.iconMd} color="primary" />
      </View>
      <View style={styles.flex}>
        <ThemedText variant="bodyBold" numberOfLines={1}>
          {doc.name}
        </ThemedText>
        <ThemedText variant="caption" color="textMuted">
          {uploadedLabel} · {formatFileSize(doc.sizeBytes)}
        </ThemedText>
      </View>
    </View>
  );
}

function StarRating({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <View style={styles.starRow}>
      {Array.from({ length: 5 }, (_, i) => (
        <AppIcon
          key={i}
          name="star"
          size={14}
          color={i < filled ? 'warning' : 'textLight'}
        />
      ))}
      <ThemedText variant="captionBold" color="textSecondary" style={{ marginLeft: 4 }}>
        {rating.toFixed(1)}
      </ThemedText>
    </View>
  );
}

function ProviderSection({
  provider,
  onViewProfile,
}: {
  provider: ProviderSnapshot;
  onViewProfile: () => void;
}) {
  const { colors, radii, spacing, sizes } = useAppTheme();
  const isPending = provider.id === 'local-pending';
  const initials = provider.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Card padding="lg" style={{ gap: spacing.md }}>
      <ThemedText variant="captionBold" color="textMuted" style={styles.sectionTitle}>
        HEALTHCARE PROVIDER
      </ThemedText>
      <View style={[styles.providerRow, { gap: spacing.md }]}>
        {provider.avatarUrl ? (
          <Image
            source={{ uri: provider.avatarUrl }}
            style={[styles.providerAvatar, { borderRadius: radii.full }]}
            accessibilityRole="image"
            accessibilityLabel={provider.name}
          />
        ) : (
          <View
            style={[
              styles.providerAvatar,
              {
                borderRadius: radii.full,
                backgroundColor: colors.primaryLight,
              },
            ]}
          >
            <ThemedText variant="h3" color="primaryText">
              {isPending ? '?' : initials}
            </ThemedText>
          </View>
        )}
        <View style={[styles.flex, { gap: 2 }]}>
          <ThemedText variant="bodyBold">{provider.name}</ThemedText>
          {provider.specialty ? (
            <ThemedText variant="small" color="textSecondary">
              {provider.specialty}
            </ThemedText>
          ) : null}
          {!isPending && provider.credentials.length > 0 ? (
            <View style={[styles.credRow, { gap: spacing.xs, marginTop: 4 }]}>
              {provider.credentials.map((c) => (
                <Badge key={c} label={c} tone="primary" size="sm" />
              ))}
            </View>
          ) : null}
        </View>
      </View>
      <Button
        label={isPending ? 'ABOUT ASSIGNMENT' : 'VIEW FULL PROFILE'}
        variant="outline"
        size="sm"
        onPress={onViewProfile}
      />
    </Card>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AppointmentDetailScreen({ route }: Props) {
  const { colors, spacing, radii } = useAppTheme();
  const navigation = useNavigation<any>();
  const { appointmentId } = route.params;

  const [item, setItem] = useState<AppointmentItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPaidLocally, setIsPaidLocally] = useState(false);

  const loadAppointment = useCallback(async () => {
    try {
      const detail = await getAppointmentDetail(appointmentId, db);
      setItem(detail);
    } catch {
      dialog.alert('Error', 'Unable to load appointment details.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }, [appointmentId, navigation]);

  useEffect(() => {
    let mounted = true;
    loadAppointment().finally(() => {
      if (mounted) setIsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [loadAppointment]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAppointment();
    setIsRefreshing(false);
  }, [loadAppointment]);

  const effectivePaid = isPaidLocally || item?.paymentStatus === 'paid';

  const handlePayNow = () => {
    if (!item) return;
    const amount = item.invoiceAmount ?? 0;
    if (amount === 0) {
      setIsPaidLocally(true);
      dialog.alert('Payment Confirmed', "This appointment is free of charge. You're all set!");
    } else {
      dialog.alert(
        'Online Payment Coming Soon',
        `Secure online payment for ${item.currency ?? 'PHP'} ${amount.toFixed(
          2
        )} is being set up. Please pay at the clinic on your appointment day.`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleGetDirections = () => {
    if (!item) return;
    const address = encodeURIComponent(item.clinic.address);
    if (Platform.OS === 'web') {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${address}`);
    } else {
      const url = Platform.OS === 'ios' ? `maps:?q=${address}` : `geo:0,0?q=${address}`;
      Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${address}`));
    }
  };

  const handleViewProfile = () => {
    if (!item) return;
    if (item.provider.id === 'local-pending') {
      dialog.alert(
        'Provider Not Yet Assigned',
        `${item.clinic.name} will assign a healthcare provider once your appointment request has been reviewed and confirmed. You will be notified when a provider is assigned.`,
        [{ text: 'OK' }]
      );
      return;
    }
    navigation.navigate('Main', {
      screen: 'ProviderProfileScreen',
      params: { providerData: item.provider },
    });
  };

  const handleReschedule = () => {
    if (!item) return;
    navigation.navigate('Main', {
      screen: 'RescheduleScreen',
      params: {
        appointmentId: item.id,
        clinicId: item.clinic.id,
        currentScheduledAt: item.scheduledAt,
      },
    });
  };

  const handleCancel = () => {
    dialog.alert('Cancel Appointment', 'Are you sure you want to cancel this appointment?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Appointment',
        style: 'destructive',
        onPress: () => dialog.alert('Coming soon', 'Cancellation requires the backend API.'),
      },
    ]);
  };

  if (isLoading || !item) {
    return (
      <Screen width="form" contentContainerStyle={{ gap: 16 }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </Screen>
    );
  }

  let dateLabel = '';
  let timeLabel = '';
  try {
    const d = parseISO(item.scheduledAt);
    dateLabel = format(d, 'EEEE, MMMM d, yyyy');
    timeLabel = format(d, 'h:mm a');
  } catch {
    dateLabel = item.scheduledAt.slice(0, 10);
  }

  const patientDocs = item.attachedDocuments.filter((d) => d.uploadedBy === 'patient');
  const clinicDocs = item.attachedDocuments.filter((d) => d.uploadedBy === 'clinic');
  const isFinalStatus =
    item.status === 'canceled' || item.status === 'completed' || item.status === 'no_show';

  return (
    <Screen
      width="form"
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      contentContainerStyle={{ gap: spacing.lg }}
    >
      {/* Clinic Hero Header */}
      <Card padding="none" style={styles.heroCard}>
        <EntityCoverHeader
          name={item.clinic.name}
          logoUrl={item.clinic.logoUrl}
          coverImageUrl={item.clinic.coverImageUrl}
        />
        <View style={[styles.heroInfo, { padding: spacing.lg, gap: spacing.xs }]}>
          <ThemedText variant="h2">{item.clinic.name}</ThemedText>
          <ThemedText variant="body" color="textSecondary">
            {item.clinic.address}
          </ThemedText>
          {item.clinic.phoneNumber ? (
            <ThemedText variant="small" color="textMuted">
              {item.clinic.phoneNumber}
            </ThemedText>
          ) : null}
          <Button
            label="Get Directions"
            variant="outline"
            size="sm"
            icon="location"
            style={{ marginTop: spacing.xs }}
            onPress={handleGetDirections}
          />
        </View>
      </Card>

      {/* Appointment Summary */}
      <Card padding="lg" style={{ gap: spacing.sm }}>
        <ThemedText variant="captionBold" color="textMuted" style={styles.sectionTitle}>
          APPOINTMENT
        </ThemedText>
        <ThemedText variant="body" color="textSecondary">
          {dateLabel}
        </ThemedText>
        <ThemedText variant="display">{timeLabel}</ThemedText>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <InfoRow label="Service" value={item.serviceType} />
        <InfoRow label="Duration" value={`${item.durationMinutes} minutes`} />
        <InfoRow label="Appointment ID" value={item.id} />
        <View style={styles.statusRow}>
          <ThemedText variant="small" color="textMuted">
            Status
          </ThemedText>
          <AppointmentStatusBadge status={item.status} size="sm" />
        </View>
        {item.cachedAt ? (
          <ThemedText variant="caption" color="textMuted">
            Last synced {format(parseISO(item.cachedAt), 'MMM d, yyyy h:mm a')}
          </ThemedText>
        ) : null}
      </Card>

      {/* Visit Details (patient-entered) */}
      {(item.subject || item.chiefComplaint || item.notes) && (
        <Card padding="lg" style={{ gap: spacing.sm }}>
          <ThemedText variant="captionBold" color="textMuted" style={styles.sectionTitle}>
            VISIT DETAILS
          </ThemedText>
          {item.subject ? (
            <View style={{ gap: 2 }}>
              <ThemedText variant="captionBold" color="textMuted">
                SUBJECT
              </ThemedText>
              <ThemedText variant="body">{item.subject}</ThemedText>
            </View>
          ) : null}
          {item.chiefComplaint ? (
            <View style={{ gap: 4 }}>
              <ThemedText variant="captionBold" color="textMuted">
                CHIEF COMPLAINT
              </ThemedText>
              <View
                style={[
                  styles.complaintBox,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceSubtle,
                    borderRadius: radii.md,
                    padding: spacing.md,
                  },
                ]}
              >
                <ThemedText variant="body">{item.chiefComplaint}</ThemedText>
              </View>
            </View>
          ) : null}
          {item.notes ? (
            <View style={{ gap: 2 }}>
              <ThemedText variant="captionBold" color="textMuted">
                ADDITIONAL NOTES
              </ThemedText>
              <ThemedText variant="body" color="textSecondary">
                {item.notes}
              </ThemedText>
            </View>
          ) : null}
        </Card>
      )}

      {/* Clinical Visit Summary & Care Plan (Sealed by Doctor) */}
      {(item.status === 'completed' ||
        item.clinicalAssessment ||
        item.doctorPlan ||
        item.prescriptionsSummary) && (
        <Card
          padding="lg"
          style={{
            borderColor: colors.successBorder,
            borderWidth: 1.5,
            gap: spacing.md,
          }}
        >
          <View style={styles.clinicalHeaderRow}>
            <ThemedText variant="captionBold" color="successText" style={styles.sectionTitle}>
              CLINICAL VISIT SUMMARY
            </ThemedText>
            <Badge label="SEALED RECORD" tone="success" size="sm" icon="check" />
          </View>

          {item.clinicalAssessment ? (
            <View style={{ gap: 4 }}>
              <ThemedText variant="captionBold" color="textMuted">
                DOCTOR ASSESSMENT & DIAGNOSES
              </ThemedText>
              <View
                style={[
                  styles.complaintBox,
                  {
                    borderColor: colors.successBorder,
                    backgroundColor: colors.successBg,
                    borderRadius: radii.md,
                    padding: spacing.md,
                  },
                ]}
              >
                <ThemedText variant="bodyBold" color="text">
                  {item.clinicalAssessment}
                </ThemedText>
              </View>
            </View>
          ) : null}

          {item.doctorPlan ? (
            <View style={{ gap: 4 }}>
              <ThemedText variant="captionBold" color="textMuted">
                PHYSICIAN CARE PLAN & INSTRUCTIONS
              </ThemedText>
              <View
                style={[
                  styles.complaintBox,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceSubtle,
                    borderRadius: radii.md,
                    padding: spacing.md,
                  },
                ]}
              >
                <ThemedText variant="body" color="text">
                  {item.doctorPlan}
                </ThemedText>
              </View>
            </View>
          ) : null}

          {item.prescriptionsSummary ? (
            <View style={{ gap: 4 }}>
              <ThemedText variant="captionBold" color="textMuted">
                PRESCRIPTIONS ISSUED (RX)
              </ThemedText>
              <View
                style={[
                  styles.complaintBox,
                  {
                    borderColor: colors.purpleBorder,
                    backgroundColor: colors.purpleBg,
                    borderRadius: radii.md,
                    padding: spacing.md,
                  },
                ]}
              >
                <View style={styles.metaRow}>
                  <AppIcon name="pill" size={16} color="purple" />
                  <ThemedText variant="body" color="text">
                    {item.prescriptionsSummary}
                  </ThemedText>
                </View>
              </View>
            </View>
          ) : null}

          {item.prescriptionPublicVerificationUrl ? (
            <Button
              label="Verify Electronic Prescription (Rx)"
              variant="outline"
              size="md"
              icon="externalLink"
              fullWidth
              onPress={() => {
                if (item.prescriptionPublicVerificationUrl) {
                  Linking.openURL(item.prescriptionPublicVerificationUrl).catch(() => {});
                }
              }}
            />
          ) : null}
        </Card>
      )}

      {/* Healthcare Provider */}
      <ProviderSection provider={item.provider} onViewProfile={handleViewProfile} />

      {/* Payment / Invoice */}
      {item.invoiceAmount !== null && item.invoiceAmount !== undefined && (
        <Card
          padding="lg"
          style={{
            borderColor: effectivePaid ? colors.successBorder : colors.warningBorder,
            backgroundColor: effectivePaid ? colors.successBg : colors.warningBg,
            gap: spacing.md,
          }}
        >
          <ThemedText variant="captionBold" color="textMuted" style={styles.sectionTitle}>
            PAYMENT
          </ThemedText>
          <View style={styles.invoiceRow}>
            <ThemedText variant="body" color="text">
              {item.serviceType}
            </ThemedText>
            <ThemedText variant="h2">
              {item.invoiceAmount === 0 ? 'Free' : `${item.currency ?? 'PHP'} ${item.invoiceAmount.toFixed(2)}`}
            </ThemedText>
          </View>
          <View style={[styles.paymentStatusRow, { gap: spacing.md }]}>
            <Badge
              label={effectivePaid ? 'Paid' : item.paymentStatus === 'waived' ? 'Waived' : 'Payment Required'}
              tone={effectivePaid ? 'success' : item.paymentStatus === 'waived' ? 'info' : 'warning'}
              size="md"
            />
            {!effectivePaid && item.paymentStatus !== 'waived' && item.paymentDueAt ? (
              <ThemedText variant="small" color="textSecondary">
                Due: {format(parseISO(item.paymentDueAt), 'MMM d, h:mm a')}
              </ThemedText>
            ) : null}
          </View>
          {!effectivePaid && item.paymentStatus !== 'waived' && item.paymentDueAt && (
            <PaymentCountdown dueAt={item.paymentDueAt} />
          )}
          {!effectivePaid && item.paymentStatus !== 'waived' && (
            <Button
              label={
                item.invoiceAmount === 0
                  ? 'Confirm Free Appointment'
                  : `Pay ${item.currency ?? 'PHP'} ${item.invoiceAmount.toFixed(2)} Now`
              }
              variant="primary"
              size="lg"
              fullWidth
              onPress={handlePayNow}
            />
          )}
        </Card>
      )}

      {/* Documents & Files */}
      <Card padding="lg" style={{ gap: spacing.md }}>
        <ThemedText variant="captionBold" color="textMuted" style={styles.sectionTitle}>
          DOCUMENTS & FILES
        </ThemedText>
        <ThemedText variant="smallBold" color="textSecondary">
          Shared by You
        </ThemedText>
        {patientDocs.length > 0 ? (
          patientDocs.map((d) => <DocumentRow key={d.id} doc={d} />)
        ) : (
          <ThemedText variant="small" color="textMuted" style={styles.italic}>
            No files attached yet.
          </ThemedText>
        )}
        <ThemedText variant="smallBold" color="textSecondary" style={{ marginTop: spacing.sm }}>
          From Clinic
        </ThemedText>
        {clinicDocs.length > 0 ? (
          clinicDocs.map((d) => <DocumentRow key={d.id} doc={d} />)
        ) : (
          <ThemedText variant="small" color="textMuted" style={styles.italic}>
            The clinic hasn't shared any files.
          </ThemedText>
        )}
        <Button
          label="Attach a File"
          variant="outline"
          size="sm"
          icon="plus"
          onPress={() => navigation.navigate('Main', { screen: 'AttachFilesScreen' })}
        />
      </Card>

      {/* Teleconsultation Waiting Room Entry */}
      {!isFinalStatus && (
        <Card padding="md" style={{ gap: spacing.sm, borderColor: colors.primary, borderWidth: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppIcon name="camera" size={20} color="primary" />
            <ThemedText variant="bodyBold">Virtual Teleconsultation</ThemedText>
          </View>
          <ThemedText variant="small" color="textSecondary">
            Join the virtual waiting room for camera self-preview, payment verification, and physician admission.
          </ThemedText>
          <Button
            label="Enter Teleconsult Waiting Room"
            variant="primary"
            size="lg"
            icon="camera"
            fullWidth
            onPress={() =>
              navigation.navigate('Main', {
                screen: 'TeleconsultWaitingRoomScreen',
                params: {
                  appointmentId: item.id,
                  patientName: 'Me',
                  clinicianName: item.provider.name,
                  scheduledTime: `${dateLabel} ${timeLabel}`,
                  paymentPolicy: item.invoiceAmount === 0 ? 'Exempt' : 'Prepaid',
                  paymentStatus: effectivePaid ? 'Paid' : (item.invoiceAmount === 0 ? 'Exempt' : 'Unpaid'),
                  isYakapExempt: false,
                },
              })
            }
          />
        </Card>
      )}

      {/* Sticky Bottom Actions */}
      {!isFinalStatus && (
        <View style={[styles.actionBar, { gap: spacing.md, paddingVertical: spacing.md }]}>
          <Button
            label="Reschedule"
            variant="outline"
            size="lg"
            style={styles.flex}
            onPress={handleReschedule}
          />
          <Button
            label="Cancel Appointment"
            variant="danger"
            size="lg"
            style={styles.flex}
            onPress={handleCancel}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  heroCard: {
    overflow: 'hidden',
  },
  heroInfo: {},
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  infoLabel: {
    flex: 0.42,
  },
  infoValue: {
    flex: 0.58,
    textAlign: 'right',
  },
  complaintBox: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  providerAvatar: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  credRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  docIconBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clinicalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  italic: {
    fontStyle: 'italic',
  },
  actionBar: {
    flexDirection: 'row',
  },
});
