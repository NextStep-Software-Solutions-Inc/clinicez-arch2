import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import { laboratoryService, SpecimenContainerType } from '../../services/laboratoryService';

const COMMON_TESTS = [
  { code: 'CBC', name: 'Complete Blood Count (CBC)', container: 'Purple_EDTA' },
  { code: 'URINE', name: 'Routine Urinalysis', container: 'Urine_Cup' },
  { code: 'STOOL', name: 'Routine Fecalysis', container: 'Stool_Vial' },
  { code: 'FBS', name: 'Fasting Blood Sugar (FBS)', container: 'Yellow_SST' },
  { code: 'LIPID', name: 'Lipid Profile', container: 'Yellow_SST' },
  { code: 'CREAT', name: 'Serum Creatinine', container: 'Yellow_SST' },
  { code: 'HBA1C', name: 'Hemoglobin A1c', container: 'Purple_EDTA' },
] as const;

export default function WalkInIntakeScreen() {
  const navigation = useNavigation<any>();

  // Demographics
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState<'Male' | 'Female'>('Male');
  const [philHealthPin, setPhilHealthPin] = useState('');
  const [contactNumber, setContactNumber] = useState('');

  // Diagnostic tests
  const [selectedTests, setSelectedTests] = useState<string[]>(['CBC']);
  const [urgency, setUrgency] = useState<'Routine' | 'STAT' | 'Urgent'>('Routine');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [orderingSource, setOrderingSource] = useState('Walk-in Outpatient (Ambulatory)');

  // Accessioning
  const [phlebName, setPhlebName] = useState('MedTech On-Duty');
  const [containerType, setContainerType] = useState<SpecimenContainerType>('Purple_EDTA');
  const [customBarcode, setCustomBarcode] = useState(`ACC-${Date.now().toString().slice(-6)}`);
  const [submitting, setSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<{
    accessionNumber: string;
    patientName: string;
    tests: string[];
    timestamp: string;
  } | null>(null);

  const toggleTest = (code: string) => {
    if (selectedTests.includes(code)) {
      if (selectedTests.length > 1) {
        setSelectedTests(selectedTests.filter((t) => t !== code));
      }
    } else {
      setSelectedTests([...selectedTests, code]);
      const matched = COMMON_TESTS.find((t) => t.code === code);
      if (matched) {
        setContainerType(matched.container as SpecimenContainerType);
      }
    }
  };

  const handleReset = () => {
    setPatientName('');
    setPatientAge('');
    setPatientGender('Male');
    setPhilHealthPin('');
    setContactNumber('');
    setSelectedTests(['CBC']);
    setUrgency('Routine');
    setClinicalNotes('');
    setCustomBarcode(`ACC-${Date.now().toString().slice(-6)}`);
    setSuccessResult(null);
  };

  const handleIntakeAndAccession = async () => {
    if (!patientName.trim()) {
      Alert.alert('Validation Error', 'Patient full name is required.');
      return;
    }
    if (!patientAge.trim() || isNaN(Number(patientAge))) {
      Alert.alert('Validation Error', 'Valid patient age is required.');
      return;
    }
    if (selectedTests.length === 0) {
      Alert.alert('Validation Error', 'Please select at least one diagnostic test.');
      return;
    }

    setSubmitting(true);
    // Simulate accession creation / submission to LIS
    setTimeout(() => {
      setSubmitting(false);
      setSuccessResult({
        accessionNumber: customBarcode,
        patientName: patientName.trim(),
        tests: selectedTests.map((t) => COMMON_TESTS.find((c) => c.code === t)?.name || t),
        timestamp: new Date().toLocaleString(),
      });
    }, 400);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Ambulatory Lab Intake</ThemedText>
        <ThemedText style={styles.title}>Walk-In Patient Intake & Accession</ThemedText>
        <ThemedText style={styles.help}>
          Accession specimens and intake walk-in outpatient requests directly for laboratory processing.
        </ThemedText>
      </View>

      {/* Success Notification Banner */}
      {successResult ? (
        <View style={styles.successBanner} testID="walkin-intake-success-banner">
          <ThemedText style={styles.successTitle}>Specimen Accessioned Successfully</ThemedText>
          <ThemedText style={styles.successDetail}>
            Accession Number: <ThemedText style={styles.bold}>{successResult.accessionNumber}</ThemedText>
          </ThemedText>
          <ThemedText style={styles.successDetail}>
            Patient: <ThemedText style={styles.bold}>{successResult.patientName}</ThemedText>
          </ThemedText>
          <ThemedText style={styles.successDetail}>
            Tests: {successResult.tests.join(', ')}
          </ThemedText>
          <ThemedText style={styles.successDetail}>
            Time: {successResult.timestamp}
          </ThemedText>

          <View style={styles.successActions}>
            <Pressable style={styles.newIntakeBtn} onPress={handleReset}>
              <ThemedText style={styles.newIntakeBtnText}>New Walk-In Intake</ThemedText>
            </Pressable>
            <Pressable
              style={styles.viewSpecimenBtn}
              onPress={() => navigation?.navigate?.('Specimen')}
            >
              <ThemedText style={styles.viewSpecimenBtnText}>Go to Sample Tracking</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Section 1: Demographics */}
      <View style={styles.sectionCard}>
        <ThemedText style={styles.sectionHeader}>1. Patient Demographics</ThemedText>
        <View style={styles.fieldRow}>
          <View style={styles.fieldColFlex}>
            <ThemedText style={styles.label}>Patient Full Name *</ThemedText>
            <TextInput
              testID="patient-name-input"
              style={styles.textInput}
              placeholder="e.g. Maria Santos"
              placeholderTextColor="#9CA3AF"
              value={patientName}
              onChangeText={setPatientName}
            />
          </View>
          <View style={styles.fieldColSm}>
            <ThemedText style={styles.label}>Age *</ThemedText>
            <TextInput
              testID="patient-age-input"
              style={styles.textInput}
              placeholder="35"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              value={patientAge}
              onChangeText={setPatientAge}
            />
          </View>
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.fieldColFlex}>
            <ThemedText style={styles.label}>Gender</ThemedText>
            <View style={styles.chipRow}>
              {(['Male', 'Female'] as const).map((g) => (
                <Pressable
                  key={g}
                  style={[styles.chip, patientGender === g && styles.chipActive]}
                  onPress={() => setPatientGender(g)}
                >
                  <ThemedText style={[styles.chipText, patientGender === g && styles.chipTextActive]}>
                    {g}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.fieldColFlex}>
            <ThemedText style={styles.label}>PhilHealth PIN (Optional)</ThemedText>
            <TextInput
              style={styles.textInput}
              placeholder="12-345678901-2"
              placeholderTextColor="#9CA3AF"
              value={philHealthPin}
              onChangeText={setPhilHealthPin}
            />
          </View>
        </View>
      </View>

      {/* Section 2: Requested Diagnostic Tests */}
      <View style={styles.sectionCard}>
        <ThemedText style={styles.sectionHeader}>2. Requested Tests & Urgency</ThemedText>
        <ThemedText style={styles.label}>Select Diagnostic Panels / Tests *</ThemedText>
        <View style={styles.testChipsWrap}>
          {COMMON_TESTS.map((test) => {
            const isSelected = selectedTests.includes(test.code);
            return (
              <Pressable
                key={test.code}
                style={[styles.testChip, isSelected && styles.testChipActive]}
                onPress={() => toggleTest(test.code)}
              >
                <ThemedText style={[styles.testChipText, isSelected && styles.testChipTextActive]}>
                  {test.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.fieldColFlex}>
            <ThemedText style={styles.label}>Urgency Level</ThemedText>
            <View style={styles.chipRow}>
              {(['Routine', 'Urgent', 'STAT'] as const).map((u) => (
                <Pressable
                  key={u}
                  style={[styles.chip, urgency === u && (u === 'STAT' ? styles.chipStatActive : styles.chipActive)]}
                  onPress={() => setUrgency(u)}
                >
                  <ThemedText
                    style={[
                      styles.chipText,
                      urgency === u && (u === 'STAT' ? styles.chipStatTextActive : styles.chipTextActive),
                    ]}
                  >
                    {u}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.fieldColFlex}>
            <ThemedText style={styles.label}>Requisition Source</ThemedText>
            <TextInput
              style={styles.textInput}
              value={orderingSource}
              onChangeText={setOrderingSource}
              placeholder="Source / Clinician"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        <View style={{ marginTop: 8 }}>
          <ThemedText style={styles.label}>Clinical Indication / Symptoms</ThemedText>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={clinicalNotes}
            onChangeText={setClinicalNotes}
            placeholder="e.g. Annual physical exam, fever x 3 days, routine check-up..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={2}
          />
        </View>
      </View>

      {/* Section 3: Specimen Accessioning */}
      <View style={styles.sectionCard}>
        <ThemedText style={styles.sectionHeader}>3. Specimen Collection & Barcoding</ThemedText>
        <View style={styles.fieldRow}>
          <View style={styles.fieldColFlex}>
            <ThemedText style={styles.label}>Primary Container Type</ThemedText>
            <TextInput
              style={styles.textInput}
              value={containerType}
              onChangeText={(val) => setContainerType(val as SpecimenContainerType)}
              placeholder="e.g. Purple_EDTA, Yellow_SST"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <View style={styles.fieldColFlex}>
            <ThemedText style={styles.label}>Accession Barcode Number</ThemedText>
            <TextInput
              testID="accession-barcode-input"
              style={styles.textInput}
              value={customBarcode}
              onChangeText={setCustomBarcode}
              placeholder="ACC-XXXXXX"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        <View style={{ marginTop: 8 }}>
          <ThemedText style={styles.label}>Phlebotomist / MedTech Accessioner</ThemedText>
          <TextInput
            style={styles.textInput}
            value={phlebName}
            onChangeText={setPhlebName}
            placeholder="Clinician / MedTech Name"
            placeholderTextColor="#9CA3AF"
          />
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <Pressable style={styles.resetBtn} onPress={handleReset} disabled={submitting}>
          <ThemedText style={styles.resetBtnText}>Clear Form</ThemedText>
        </Pressable>
        <Pressable
          testID="submit-walkin-intake-btn"
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleIntakeAndAccession}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <ThemedText style={styles.submitBtnText}>Intake & Accession Specimen</ThemedText>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  header: {
    gap: 4,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D6963',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  help: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    gap: 10,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D6963',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 6,
    marginBottom: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  fieldColFlex: {
    flex: 1,
    gap: 4,
  },
  fieldColSm: {
    width: 70,
    gap: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    minHeight: 52,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  chipActive: {
    backgroundColor: '#0D6963',
    borderColor: '#0D6963',
  },
  chipStatActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  chipStatTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  testChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  testChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
  },
  testChipActive: {
    backgroundColor: '#E6F4F1',
    borderColor: '#0D6963',
  },
  testChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  testChipTextActive: {
    color: '#0A524D',
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
  },
  resetBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  submitBtn: {
    backgroundColor: '#0D6963',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  successBanner: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 4,
  },
  successTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 4,
  },
  successDetail: {
    fontSize: 12,
    color: '#047857',
  },
  bold: {
    fontWeight: '700',
  },
  successActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  newIntakeBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  newIntakeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  viewSpecimenBtn: {
    backgroundColor: '#0D6963',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  viewSpecimenBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
