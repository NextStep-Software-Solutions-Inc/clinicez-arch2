import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { theme } from '@constants/theme';
import { Modal, Input, Button, Icon, ThemedText } from '@ui';
import { Alert } from '@utils/feedback';
import { clinicService, RegisterPatientPayload } from '../services/clinicService';

interface BulkStudentImportModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (importedCount: number) => void;
}

const CSV_COLUMNS =
  'student_id,first_name,last_name,middle_name,gender,dob,contact_number,email,college,program,year_level';

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

  const handleInsertColumns = () => {
    setCsvText((current) => (current.trim() ? current : `${CSV_COLUMNS}\n`));
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
      const genderRaw = (record['gender'] || record['sex'] || '').toLowerCase();
      const gender = (genderRaw.startsWith('f') ? 'Female' : 'Male') as 'Male' | 'Female';
      const dob = record['dob'] || record['date_of_birth'] || record['birthdate'] || '';
      const contactNumber = record['contact_number'] || record['contact'] || record['phone'] || '';
      const email = record['email'] || undefined;
      const college = record['college'] || record['department'] || undefined;
      const program = record['program'] || record['course'] || undefined;
      const yearLevel = record['year_level'] || record['year'] || undefined;

      if (!firstName || !lastName) {
        errors.push(`Row ${rowNum}: Missing required first name or last name.`);
        return;
      }
      if (!genderRaw) {
        errors.push(`Row ${rowNum}: Missing gender.`);
        return;
      }
      if (!dob || !contactNumber) {
        errors.push(`Row ${rowNum}: Missing date of birth or contact number.`);
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
          student_id: studentId || undefined,
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

  const title =
    step === 'input' ? 'Import student list' : step === 'preview' ? 'Review students' : 'Import complete';
  const subtitle =
    step === 'input'
      ? 'Paste CSV data exported from the registrar to register students in bulk.'
      : step === 'preview'
        ? `Review ${parsedPatients.length} parsed student record(s) before importing.`
        : 'The students have been added to the patient registry.';

  const footer =
    step === 'input' ? (
      <View style={styles.footer}>
        <Button title="Cancel" variant="ghost" onPress={handleClose} />
        <Button title="Parse and preview" onPress={parseCsvContent} disabled={!csvText.trim()} />
      </View>
    ) : step === 'preview' ? (
      <View style={styles.footer}>
        <Button title="Back to CSV" variant="ghost" onPress={() => setStep('input')} disabled={isImporting} />
        <Button
          title={`Register ${parsedPatients.length} student(s)`}
          onPress={handleExecuteImport}
          loading={isImporting}
          disabled={isImporting}
        />
      </View>
    ) : (
      <View style={styles.footer}>
        <Button title="Close" variant="success" onPress={handleClose} />
      </View>
    );

  return (
    <Modal
      visible={visible}
      onClose={handleClose}
      title={title}
      subtitle={subtitle}
      maxWidth={680}
      maxHeight="90%"
      footer={footer}
    >
      {/* Step 1: Input CSV */}
      {step === 'input' && (
        <>
          <View style={styles.formatInfoBox}>
            <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
              Supported CSV columns
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.primary} style={styles.mono}>
              {CSV_COLUMNS.split(',').join(', ')}
            </ThemedText>
          </View>

          <View style={styles.rightRow}>
            <Button title="Insert column headers" variant="outline" size="sm" onPress={handleInsertColumns} />
          </View>

          <Input
            label="CSV content"
            multiline
            numberOfLines={10}
            placeholder="Paste student rows here, separated by commas."
            value={csvText}
            onChangeText={setCsvText}
            textAlignVertical="top"
            inputStyle={styles.csvInput}
          />
        </>
      )}

      {/* Step 2: Preview and validation */}
      {step === 'preview' && (
        <>
          <View style={styles.summaryBar}>
            <ThemedText variant="bodyBold" color={theme.colors.successText}>
              Ready to import: {parsedPatients.length} student(s)
            </ThemedText>
            {parseErrors.length > 0 && (
              <ThemedText variant="caption" color={theme.colors.warningText}>
                {parseErrors.length} row(s) skipped due to missing required fields.
              </ThemedText>
            )}
          </View>

          <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
            Preview
          </ThemedText>
          <ScrollView style={styles.previewContainer} nestedScrollEnabled>
            {parsedPatients.map((p, idx) => (
              <View key={idx} style={styles.previewRow}>
                <View style={styles.previewIdx}>
                  <ThemedText variant="captionBold" color={theme.colors.textMuted}>
                    {idx + 1}
                  </ThemedText>
                </View>
                <View style={styles.previewBody}>
                  <View style={styles.nameRow}>
                    <ThemedText variant="smallBold">
                      {p.lastName}, {p.firstName} {p.middleName ? `${p.middleName[0]}.` : ''}
                    </ThemedText>
                    <ThemedText variant="captionBold" color={theme.colors.primary} style={styles.studentIdPill}>
                      {p.customFields?.['student_id'] ?? 'N/A'}
                    </ThemedText>
                  </View>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    {p.customFields?.['college'] || 'General'} · {p.customFields?.['program'] || 'No program'} ·{' '}
                    {p.customFields?.['year_level'] || '—'}
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    {p.contactNumber} · {p.email || 'No email'}
                  </ThemedText>
                </View>
              </View>
            ))}
          </ScrollView>
        </>
      )}

      {/* Step 3: Success */}
      {step === 'success' && (
        <View style={styles.successBody}>
          <View style={styles.successIconCircle}>
            <Icon name="checkCircle" size={theme.sizes.iconLg} color={theme.colors.successText} />
          </View>
          <ThemedText variant="h2" color={theme.colors.successText}>
            {importedCount} student(s) registered
          </ThemedText>
          <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.successText}>
            Students are now searchable in the patient registry.
          </ThemedText>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rightRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  formatInfoBox: {
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  mono: {
    fontFamily: theme.fonts.mono['400'],
  },
  csvInput: {
    fontFamily: theme.fonts.mono['400'],
    fontSize: theme.fontSizes.xs,
    minHeight: 180,
  },
  summaryBar: {
    backgroundColor: theme.colors.successBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.successBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  previewContainer: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    maxHeight: 280,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    gap: theme.spacing.md,
  },
  previewIdx: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewBody: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  studentIdPill: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radii.xs,
    overflow: 'hidden',
  },
  successBody: {
    paddingVertical: theme.spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  successIconCircle: {
    width: theme.sizes.controlLg + theme.spacing['2xl'],
    height: theme.sizes.controlLg + theme.spacing['2xl'],
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    textAlign: 'center',
    maxWidth: 440,
  },
});
