import React, { memo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type { LogPatientVitalsRequestDto } from '../../services/api/homeApi';

export interface LogVitalsModalProps {
  visible: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: LogPatientVitalsRequestDto) => Promise<void>;
}

function LogVitalsModalComponent({
  visible,
  isSubmitting,
  onClose,
  onSubmit,
}: LogVitalsModalProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();

  const [heartRate, setHeartRate] = useState('');
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [glucose, setGlucose] = useState('');
  const [sleepHours, setSleepHours] = useState('');
  const [sleepMinutes, setSleepMinutes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSave = async () => {
    setValidationError(null);
    const hr = heartRate.trim() ? Number.parseInt(heartRate.trim(), 10) : null;
    const sys = systolic.trim() ? Number.parseInt(systolic.trim(), 10) : null;
    const dia = diastolic.trim() ? Number.parseInt(diastolic.trim(), 10) : null;
    const glu = glucose.trim() ? Number.parseFloat(glucose.trim()) : null;
    const sh = sleepHours.trim() ? Number.parseInt(sleepHours.trim(), 10) : 0;
    const sm = sleepMinutes.trim() ? Number.parseInt(sleepMinutes.trim(), 10) : 0;
    const totalSleep =
      sleepHours.trim() || sleepMinutes.trim() ? Math.max(0, sh * 60 + sm) : null;

    if (hr == null && sys == null && dia == null && glu == null && totalSleep == null) {
      setValidationError('Enter at least one vital sign reading to save.');
      return;
    }

    if ((sys != null && dia == null) || (sys == null && dia != null)) {
      setValidationError('Enter both Systolic and Diastolic values for Blood Pressure.');
      return;
    }

    await onSubmit({
      heartRateBpm: hr && !Number.isNaN(hr) ? hr : null,
      systolicBp: sys && !Number.isNaN(sys) ? sys : null,
      diastolicBp: dia && !Number.isNaN(dia) ? dia : null,
      fastingBloodGlucoseMgDl: glu && !Number.isNaN(glu) ? glu : null,
      sleepDurationMinutes: totalSleep && !Number.isNaN(totalSleep) ? totalSleep : null,
      deepSleepMinutes:
        totalSleep && !Number.isNaN(totalSleep) ? Math.round(totalSleep * 0.28) : null,
      source: Platform.OS === 'ios' ? 'Apple Health' : 'Manual Log',
    });

    setHeartRate('');
    setSystolic('');
    setDiastolic('');
    setGlucose('');
    setSleepHours('');
    setSleepMinutes('');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, { backgroundColor: colors.backdropScrim }]}
      >
        <Pressable style={styles.dismissArea} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            elevation.floatingBanner,
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radii.xxl,
              borderTopRightRadius: radii.xxl,
              padding: spacing.lg,
              gap: spacing.base,
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            <View style={{ gap: spacing.xxs }}>
              <Text style={[typography.headlineSm, { color: colors.navyText }]}>
                Log Vital Telemetry
              </Text>
              <Text style={[typography.bodySm, { color: colors.mutedText }]}>
                Record today&apos;s readings directly to your health record
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close vitals modal"
              hitSlop={8}
              style={[
                styles.closeBtn,
                {
                  backgroundColor: colors.surfaceTint,
                  borderRadius: radii.full,
                },
              ]}
            >
              <AppIcon name="close" size={18} color={colors.navyText} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.md }}
          >
            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.labelMd, { color: colors.navyText }]}>
                Resting Heart Rate (bpm)
              </Text>
              <TextInput
                value={heartRate}
                onChangeText={setHeartRate}
                placeholder="e.g. 72"
                placeholderTextColor={colors.subtleText}
                keyboardType="number-pad"
                style={[
                  typography.bodyMd,
                  styles.input,
                  {
                    color: colors.navyText,
                    backgroundColor: colors.surfaceTint,
                    borderColor: colors.border,
                    borderRadius: radii.sm,
                    paddingHorizontal: spacing.md,
                  },
                ]}
              />
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.labelMd, { color: colors.navyText }]}>
                Blood Pressure (Systolic / Diastolic mmHg)
              </Text>
              <View style={[styles.twoCol, { gap: spacing.sm }]}>
                <TextInput
                  value={systolic}
                  onChangeText={setSystolic}
                  placeholder="Systolic (118)"
                  placeholderTextColor={colors.subtleText}
                  keyboardType="number-pad"
                  style={[
                    typography.bodyMd,
                    styles.input,
                    styles.flexInput,
                    {
                      color: colors.navyText,
                      backgroundColor: colors.surfaceTint,
                      borderColor: colors.border,
                      borderRadius: radii.sm,
                      paddingHorizontal: spacing.md,
                    },
                  ]}
                />
                <TextInput
                  value={diastolic}
                  onChangeText={setDiastolic}
                  placeholder="Diastolic (76)"
                  placeholderTextColor={colors.subtleText}
                  keyboardType="number-pad"
                  style={[
                    typography.bodyMd,
                    styles.input,
                    styles.flexInput,
                    {
                      color: colors.navyText,
                      backgroundColor: colors.surfaceTint,
                      borderColor: colors.border,
                      borderRadius: radii.sm,
                      paddingHorizontal: spacing.md,
                    },
                  ]}
                />
              </View>
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.labelMd, { color: colors.navyText }]}>
                Fasting Blood Glucose (mg/dL)
              </Text>
              <TextInput
                value={glucose}
                onChangeText={setGlucose}
                placeholder="e.g. 94"
                placeholderTextColor={colors.subtleText}
                keyboardType="decimal-pad"
                style={[
                  typography.bodyMd,
                  styles.input,
                  {
                    color: colors.navyText,
                    backgroundColor: colors.surfaceTint,
                    borderColor: colors.border,
                    borderRadius: radii.sm,
                    paddingHorizontal: spacing.md,
                  },
                ]}
              />
            </View>

            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.labelMd, { color: colors.navyText }]}>
                Sleep Duration (Hours & Minutes)
              </Text>
              <View style={[styles.twoCol, { gap: spacing.sm }]}>
                <TextInput
                  value={sleepHours}
                  onChangeText={setSleepHours}
                  placeholder="Hours (7)"
                  placeholderTextColor={colors.subtleText}
                  keyboardType="number-pad"
                  style={[
                    typography.bodyMd,
                    styles.input,
                    styles.flexInput,
                    {
                      color: colors.navyText,
                      backgroundColor: colors.surfaceTint,
                      borderColor: colors.border,
                      borderRadius: radii.sm,
                      paddingHorizontal: spacing.md,
                    },
                  ]}
                />
                <TextInput
                  value={sleepMinutes}
                  onChangeText={setSleepMinutes}
                  placeholder="Minutes (45)"
                  placeholderTextColor={colors.subtleText}
                  keyboardType="number-pad"
                  style={[
                    typography.bodyMd,
                    styles.input,
                    styles.flexInput,
                    {
                      color: colors.navyText,
                      backgroundColor: colors.surfaceTint,
                      borderColor: colors.border,
                      borderRadius: radii.sm,
                      paddingHorizontal: spacing.md,
                    },
                  ]}
                />
              </View>
            </View>

            {validationError ? (
              <Text style={[typography.bodySm, { color: colors.roseAccent }]}>
                {validationError}
              </Text>
            ) : null}

            <Pressable
              onPress={handleSave}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Save Vital Readings"
              style={({ pressed }) => [
                styles.saveBtn,
                {
                  backgroundColor: colors.primary,
                  borderRadius: radii.full,
                  marginTop: spacing.xs,
                  opacity: isSubmitting ? 0.65 : pressed ? 0.88 : 1,
                },
              ]}
            >
              <Text style={[typography.labelLg, { color: colors.onPrimary }]}>
                {isSubmitting ? 'Saving Readings...' : 'Save Readings'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    maxHeight: '88%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoCol: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
  },
  flexInput: {
    flex: 1,
  },
  saveBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const LogVitalsModal = memo(LogVitalsModalComponent);
export default LogVitalsModal;
