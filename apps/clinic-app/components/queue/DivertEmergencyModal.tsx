import React, { useState } from 'react';
import { View, StyleSheet, TextInput, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import Modal from '../ui/Modal';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import {
  clinicService,
  type PatientQueueItem,
} from '../../services/clinicService';

export interface DivertEmergencyModalProps {
  visible: boolean;
  ticket: PatientQueueItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

const COMMON_TRANSPORT_MODES = [
  'City / Red Cross Ambulance',
  'Private Ambulance',
  'Clinic Transport Vehicle',
  'Private Emergency Vehicle',
];

export default function DivertEmergencyModal({
  visible,
  ticket,
  onClose,
  onSuccess,
}: DivertEmergencyModalProps) {
  const [destinationHospital, setDestinationHospital] = useState('');
  const [transportMode, setTransportMode] = useState('City / Red Cross Ambulance');
  const [paramedicOrEscortName, setParamedicOrEscortName] = useState('');
  const [clinicalHandoverSummary, setClinicalHandoverSummary] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!ticket) return null;

  const isValid =
    destinationHospital.trim().length > 0 &&
    transportMode.trim().length > 0 &&
    paramedicOrEscortName.trim().length > 0 &&
    clinicalHandoverSummary.trim().length > 0;

  const handleConfirm = async () => {
    if (!isValid || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const [res, err] = await clinicService.divertEmergencyPatient(ticket.id, {
        destinationHospital: destinationHospital.trim(),
        transportMode: transportMode.trim(),
        paramedicOrEscortName: paramedicOrEscortName.trim(),
        clinicalHandoverSummary: clinicalHandoverSummary.trim(),
      });

      if (err) {
        setErrorMessage(typeof err === 'string' ? err : (err as any)?.message || 'Failed to divert emergency patient.');
        return;
      }

      onSuccess();
      onClose();
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to record emergency diversion.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Transfer & Divert to Emergency Facility"
      maxWidth={560}
    >
      <ScrollView contentContainerStyle={styles.container}>
        {/* Acuity Alert Strip */}
        <View style={styles.alertStrip}>
          <Icon name="alert" size={20} color={theme.colors.emergency} />
          <View style={styles.alertTextContainer}>
            <ThemedText variant="captionBold" color={theme.colors.emergencyText}>
              AUDITED EMERGENCY DIVERSION (IMMEDIATE ER TRANSFER)
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.emergencyText}>
              This action immediately removes the patient from the clinic queue display and shields the ticket from EOD No-Show.
            </ThemedText>
          </View>
        </View>

        {/* Patient Identification Card */}
        <View style={styles.patientCard}>
          <View style={styles.patientInfoCol}>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Patient & Ticket
            </ThemedText>
            <ThemedText variant="title" color={theme.colors.text}>
              {ticket.patientName}
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Ticket: {ticket.queueNumber} • Priority: {ticket.priority}
            </ThemedText>
          </View>
          <Badge label="Emergency Acuity" variant="emergency" size="sm" icon="alert" />
        </View>

        {errorMessage ? (
          <View style={styles.errorStrip}>
            <Icon name="alertCircle" size={16} color={theme.colors.emergency} />
            <ThemedText variant="caption" color={theme.colors.emergencyText}>
              {errorMessage}
            </ThemedText>
          </View>
        ) : null}

        {/* Form Fields */}
        <View style={styles.fieldGroup}>
          <ThemedText variant="captionBold" color={theme.colors.text}>
            Destination Hospital / Emergency Room *
          </ThemedText>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Philippine General Hospital (PGH) - Emergency Dept."
            placeholderTextColor={theme.colors.textMuted}
            value={destinationHospital}
            onChangeText={setDestinationHospital}
            testID="divert-destination-hospital"
          />
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText variant="captionBold" color={theme.colors.text}>
            Transport Mode / Dispatch Unit *
          </ThemedText>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. City / Red Cross Ambulance"
            placeholderTextColor={theme.colors.textMuted}
            value={transportMode}
            onChangeText={setTransportMode}
            testID="divert-transport-mode"
          />
          <View style={styles.presetsRow}>
            {COMMON_TRANSPORT_MODES.map((mode) => (
              <Button
                key={mode}
                title={mode}
                variant={transportMode === mode ? 'primary' : 'outline'}
                size="sm"
                onPress={() => setTransportMode(mode)}
              />
            ))}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText variant="captionBold" color={theme.colors.text}>
            Paramedic, Nurse Escort, or Driver Name *
          </ThemedText>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Paramedic Juan Reyes / EMT Unit 4"
            placeholderTextColor={theme.colors.textMuted}
            value={paramedicOrEscortName}
            onChangeText={setParamedicOrEscortName}
            testID="divert-paramedic-name"
          />
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText variant="captionBold" color={theme.colors.text}>
            Clinical Handover Summary & Acuity Notes *
          </ThemedText>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            placeholder="Describe clinical handover: chief presentation, unstable vitals, medications given on-site, and receiving physician/unit..."
            placeholderTextColor={theme.colors.textMuted}
            value={clinicalHandoverSummary}
            onChangeText={setClinicalHandoverSummary}
            multiline
            numberOfLines={4}
            testID="divert-handover-summary"
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <Button
            title="Cancel"
            variant="ghost"
            size="md"
            disabled={isSubmitting}
            onPress={onClose}
          />
          <Button
            title="Confirm Emergency ER Diversion"
            variant="danger"
            size="md"
            icon="alert"
            testID="confirm-divert-button"
            disabled={!isValid || isSubmitting}
            loading={isSubmitting}
            onPress={handleConfirm}
          />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  alertStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.emergencyBg,
    borderWidth: 1,
    borderColor: theme.colors.emergencyBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  alertTextContainer: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  patientCard: {
    backgroundColor: theme.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  patientInfoCol: {
    flex: 1,
    minWidth: 200,
    gap: theme.spacing.xs,
  },
  errorStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.emergencyBg,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: theme.fontSizes.sm,
  },
  multilineInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
});
