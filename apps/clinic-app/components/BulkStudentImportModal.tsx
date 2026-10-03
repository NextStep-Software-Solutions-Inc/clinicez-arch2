import React, { useState } from 'react';
import {
  Modal,
  View,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import ThemedText from './ui/ThemedText';
import { clinicService, RegisterPatientPayload } from '../services/clinicService';

interface BulkStudentImportModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (importedCount: number) => void;
}

const SAMPLE_CSV = `student_id,first_name,last_name,middle_name,gender,dob,contact_number,email,college,program,year_level
2026-10001,Juan,Dela Cruz,Santos,Male,2004-05-12,09171234567,jdelacruz@univ.edu.ph,College of Computer Studies,BS Computer Science,1st Year
2026-10002,Maria,Santos,Flores,Female,2004-08-20,09181234567,msantos@univ.edu.ph,College of Engineering,BS Civil Engineering,1st Year
2026-10003,Karl,Gonzales,Aquino,Male,2003-11-04,09191234567,kgonzales@univ.edu.ph,College of Business Administration,BS Accountancy,2nd Year
2026-10004,Angela,Reyes,Dizon,Female,2005-02-14,09201234567,areyes@univ.edu.ph,College of Nursing,BS Nursing,1st Year
2026-10005,Paolo,Bautista,Mercado,Male,2003-09-30,09211234567,pbautista@univ.edu.ph,College of Education,BSEd English,3rd Year`;

export function BulkStudentImportModal({
  visible,
  onClose,
  onSuccess,
}: BulkStudentImportModalProps) {
  const [csvText, setCsvText] = useState('');
  const [step, setStep] = useState<'input' | 'preview' | 'success'>('input');
  const [parsedPatients, setParsedPatients] = useState<RegisterPatientPayload[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const resetState = () => {
    setCsvText('');
    setStep('input');
    setParsedPatients([]);
    setParseErrors([]);
    setIsImporting(false);
    setImportedCount(0);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleLoadSample = () => {
    setCsvText(SAMPLE_CSV);
  };

  const parseCsvContent = () => {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      Alert.alert('Invalid CSV', 'Please enter at least a header row and one student data row.');
      return;
    }

    const rawHeaders = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[\s-]/g, '_'));
    const rows = lines.slice(1);

    const patients: RegisterPatientPayload[] = [];
    const errors: string[] = [];

    rows.forEach((row, idx) => {
      // Split preserving values
      const cols = row.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const rowNum = idx + 2;

      const record: Record<string, string> = {};
      rawHeaders.forEach((header, hIdx) => {
        if (cols[hIdx] !== undefined) {
          record[header] = cols[hIdx];
        }
      });

      const firstName = record['first_name'] || record['firstname'] || record['fname'] || '';
      const lastName = record['last_name'] || record['lastname'] || record['lname'] || '';
      const middleName = record['middle_name'] || record['middlename'] || record['mname'] || '';
      const studentId = record['student_id'] || record['id_number'] || record['studentid'] || record['id'] || '';
      const gender = (record['gender']?.toLowerCase().startsWith('f') ? 'Female' : 'Male') as 'Male' | 'Female';
      const dob = record['dob'] || record['date_of_birth'] || record['birthdate'] || '2005-01-01';
      const contactNumber = record['contact_number'] || record['contact'] || record['phone'] || '09000000000';
      const email = record['email'] || undefined;
      const college = record['college'] || record['department'] || undefined;
      const program = record['program'] || record['course'] || undefined;
      const yearLevel = record['year_level'] || record['year'] || '1st Year';

      if (!firstName || !lastName) {
        errors.push(`Row ${rowNum}: Missing required First Name or Last Name.`);
        return;
      }

      patients.push({
        firstName,
        lastName,
        middleName: middleName || undefined,
        gender,
        dateOfBirth: dob,
        civilStatus: 'Single',
        contactNumber,
        email,
        verificationStatus: 'Verified',
        customFields: {
          classification: 'Student',
          student_id: studentId || `TEMP-${Date.now().toString().slice(-5)}-${idx}`,
          college,
          program,
          year_level: yearLevel,
        },
      });
    });

    if (patients.length === 0) {
      Alert.alert('No Valid Records', 'Could not parse any valid student records. Please check the CSV headers.');
      return;
    }

    setParsedPatients(patients);
    setParseErrors(errors);
    setStep('preview');
  };

  const handleExecuteImport = async () => {
    if (parsedPatients.length === 0) return;

    setIsImporting(true);
    const [result, err] = await clinicService.bulkRegisterPatients(parsedPatients);
    setIsImporting(false);

    if (err) {
      Alert.alert('Import Failed', err.message || 'Server error occurred during bulk registration.');
      return;
    }

    const count = result?.successCount ?? parsedPatients.length;
    setImportedCount(count);
    setStep('success');
    if (onSuccess) {
      onSuccess(count);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <ThemedText style={styles.headerTitle}>
                {step === 'input' && '📥 Bulk Import Student Masterlist'}
                {step === 'preview' && '🔍 Preview Registrar Cohort'}
                {step === 'success' && '✅ Import Complete'}
              </ThemedText>
              <ThemedText style={styles.headerSubtitle}>
                {step === 'input' && 'Paste CSV data from the Registrar SIS to register students in bulk.'}
                {step === 'preview' && `Review ${parsedPatients.length} parsed student record(s) before importing.`}
                {step === 'success' && 'The student cohort has been recorded in the Master Patient Index.'}
              </ThemedText>
            </View>
            <Pressable onPress={handleClose} style={styles.closeBtn}>
              <ThemedText style={styles.closeBtnText}>✕</ThemedText>
            </Pressable>
          </View>

          {/* Step 1: Input CSV */}
          {step === 'input' && (
            <ScrollView style={styles.body} contentContainerStyle={{ gap: 14 }}>
              <View style={styles.formatInfoBox}>
                <ThemedText style={styles.formatInfoTitle}>Supported CSV Columns:</ThemedText>
                <ThemedText style={styles.formatInfoText}>
                  student_id, first_name, last_name, middle_name, gender, dob, contact_number, email, college, program, year_level
                </ThemedText>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                <Pressable style={styles.sampleBtn} onPress={handleLoadSample}>
                  <ThemedText style={styles.sampleBtnText}>📋 Load Sample CSV Template</ThemedText>
                </Pressable>
              </View>

              <View>
                <ThemedText style={styles.fieldLabel}>Paste CSV Content:</ThemedText>
                <TextInput
                  style={styles.csvTextArea}
                  multiline
                  numberOfLines={10}
                  placeholder="Paste student rows here with comma separators..."
                  placeholderTextColor="#9CA3AF"
                  value={csvText}
                  onChangeText={setCsvText}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.actionRow}>
                <Pressable style={styles.cancelBtn} onPress={handleClose}>
                  <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, !csvText.trim() && { opacity: 0.5 }]}
                  onPress={parseCsvContent}
                  disabled={!csvText.trim()}
                >
                  <ThemedText style={styles.primaryBtnText}>Parse & Preview →</ThemedText>
                </Pressable>
              </View>
            </ScrollView>
          )}

          {/* Step 2: Preview & Validation */}
          {step === 'preview' && (
            <ScrollView style={styles.body} contentContainerStyle={{ gap: 14 }}>
              <View style={styles.summaryBar}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.summaryTitle}>
                    Ready to Import: {parsedPatients.length} Student(s)
                  </ThemedText>
                  {parseErrors.length > 0 && (
                    <ThemedText style={styles.summaryWarn}>
                      ⚠️ {parseErrors.length} row(s) skipped due to missing required fields.
                    </ThemedText>
                  )}
                </View>
              </View>

              <ThemedText style={styles.fieldLabel}>Cohort Preview:</ThemedText>
              <View style={styles.previewContainer}>
                {parsedPatients.map((p, idx) => (
                  <View key={idx} style={styles.previewRow}>
                    <View style={styles.previewIdxBadge}>
                      <ThemedText style={styles.previewIdxText}>#{idx + 1}</ThemedText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <ThemedText style={styles.studentName}>
                          {p.lastName}, {p.firstName} {p.middleName ? `${p.middleName[0]}.` : ''}
                        </ThemedText>
                        <ThemedText style={styles.studentIdBadge}>
                          {p.customFields?.['student_id'] ?? 'N/A'}
                        </ThemedText>
                      </View>
                      <ThemedText style={styles.studentMeta}>
                        {p.customFields?.['college'] || 'General'} • {p.customFields?.['program'] || 'No Program'} • {p.customFields?.['year_level'] || '1st Year'}
                      </ThemedText>
                      <ThemedText style={styles.studentContact}>
                        📞 {p.contactNumber} • ✉️ {p.email || 'No email'}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => setStep('input')}
                  disabled={isImporting}
                >
                  <ThemedText style={styles.cancelBtnText}>← Back to CSV</ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, isImporting && { opacity: 0.6 }]}
                  onPress={handleExecuteImport}
                  disabled={isImporting}
                >
                  {isImporting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <ThemedText style={styles.primaryBtnText}>
                      ✓ Bulk Register {parsedPatients.length} Student(s)
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          )}

          {/* Step 3: Success Screen */}
          {step === 'success' && (
            <View style={styles.successBody}>
              <View style={styles.successIconCircle}>
                <ThemedText style={{ fontSize: 36 }}>🎓</ThemedText>
              </View>
              <ThemedText style={styles.successHeading}>Import Completed!</ThemedText>
              <ThemedText style={styles.successSubheading}>
                Successfully pre-registered {importedCount} students into the clinic database.
                Students are now searchable in the Master Patient Index and ready for annual check-ups.
              </ThemedText>

              <Pressable style={styles.doneBtn} onPress={handleClose}>
                <ThemedText style={styles.doneBtnText}>Close & Refresh Registry</ThemedText>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 680,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: '600',
  },
  body: {
    padding: 18,
  },
  formatInfoBox: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    padding: 12,
  },
  formatInfoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
    marginBottom: 4,
  },
  formatInfoText: {
    fontSize: 11,
    color: '#0284C7',
    fontFamily: 'monospace',
  },
  sampleBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  sampleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  csvTextArea: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#1E293B',
    backgroundColor: '#FFFFFF',
    minHeight: 180,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
    marginBottom: 10,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  primaryBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    padding: 12,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065F46',
  },
  summaryWarn: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  previewContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    maxHeight: 280,
    overflow: 'hidden',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  previewIdxBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewIdxText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  studentName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  studentIdBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284C7',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  studentMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  studentContact: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  successBody: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#065F46',
  },
  successSubheading: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    maxWidth: 440,
    lineHeight: 18,
  },
  doneBtn: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 16,
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
