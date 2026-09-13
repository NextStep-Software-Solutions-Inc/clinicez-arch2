import React from 'react';
import { View, StyleSheet, ScrollView, TextInput, Pressable } from 'react-native';
import ThemedText from '@ui/ThemedText';

export default function ConsultationsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Clinical Encounter</ThemedText>
        <ThemedText style={styles.title}>SOAP Consultation</ThemedText>
      </View>

      <View style={styles.patientCard}>
        <View style={styles.rowBetween}>
          <View>
            <ThemedText style={styles.patientName}>Maria Santos (42F)</ThemedText>
            <ThemedText style={styles.patientMeta}>MRN: CEZ-2026-0914 • PhilHealth Active</ThemedText>
          </View>
          <ThemedText style={styles.triageTag}>BP: 138/88 • HR: 76</ThemedText>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.label}>Subjective (Chief Complaint & History)</ThemedText>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Patient reports occasional morning headaches for 2 weeks..."
          placeholderTextColor="#9CA3AF"
          editable={false}
          value="Patient reports mild occasional headaches, no dizziness or nausea. Currently taking Amlodipine 5mg daily."
        />
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.label}>Objective (Physical Findings & Vitals)</ThemedText>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Vital signs, chest auscultation, physical exam..."
          placeholderTextColor="#9CA3AF"
          editable={false}
          value="Alert, conscious, ambulatory. Clear breath sounds, regular heart rhythm. No peripheral edema."
        />
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.label}>Assessment (Diagnosis ICD-10)</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Primary Diagnosis (e.g. I10 Essential Hypertension)"
          placeholderTextColor="#9CA3AF"
          editable={false}
          value="I10 - Essential (primary) hypertension, Stage 1"
        />
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.label}>Plan & Prescriptions</ThemedText>
        <TextInput
          style={styles.textArea}
          multiline
          placeholder="Treatment plan, labs requested, medications..."
          placeholderTextColor="#9CA3AF"
          editable={false}
          value="Continue Amlodipine 5mg OD. Request Fasting Blood Sugar, Lipid Profile, Creatinine. Return in 4 weeks."
        />
      </View>

      <Pressable style={styles.saveButton}>
        <ThemedText style={styles.saveButtonText}>Sign & Sync Encounter</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  subtitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#4B5563',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  patientCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E1B4B',
  },
  patientMeta: {
    fontSize: 12,
    color: '#4338CA',
    marginTop: 2,
  },
  triageTag: {
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: '#E0E7FF',
    color: '#3730A3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  section: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  textArea: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#0284C7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
