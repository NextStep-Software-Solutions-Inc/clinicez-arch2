import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert, Modal, ActivityIndicator } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { laboratoryService, LabRequisitionItem, AnalyteCatalogSpec } from '../../services/laboratoryService';

interface AnalyteRow {
  code: string;
  name: string;
  panel: string;
  value: string;
  unit: string;
  ref: string;
}

export default function ResultsScreen() {
  const [orders, setOrders] = useState<LabRequisitionItem[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<LabRequisitionItem | null>(null);
  const [catalog, setCatalog] = useState<AnalyteCatalogSpec[]>([]);
  const [rows, setRows] = useState<AnalyteRow[]>([
    { code: 'HGB', name: 'Hemoglobin', panel: 'CBC', value: '14.2', unit: 'g/dL', ref: 'M: 13.5-17.5 • F: 12.0-15.5' },
    { code: 'WBC', name: 'White Blood Cells', panel: 'CBC', value: '7.8', unit: 'x10^3/uL', ref: '4.5 - 10.0' },
    { code: 'PLT', name: 'Platelets', panel: 'CBC', value: '250', unit: 'x10^3/uL', ref: '150 - 450' },
    { code: 'FBS', name: 'Fasting Blood Sugar', panel: 'Chemistry', value: '92.0', unit: 'mg/dL', ref: '70.0 - 99.0' },
    { code: 'CREA', name: 'Serum Creatinine', panel: 'Chemistry', value: '0.9', unit: 'mg/dL', ref: 'M: 0.7-1.3 • F: 0.6-1.1' },
  ]);

  // Sign-off modal state
  const [signModalVisible, setSignModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pathologistName, setPathologistName] = useState('Dr. Roberto Gomez, MD, FPSP');
  const [pathologistPrc, setPathologistPrc] = useState('PRC-0089123');
  const [medTechName, setMedTechName] = useState('Carlos Mendoza, RMT');
  const [medTechPrc, setMedTechPrc] = useState('PRC-0045678');
  const [impression, setImpression] = useState('Analyte levels within normal physiological limits for age and gender.');

  useEffect(() => {
    laboratoryService.getWorklist().then(([data]) => {
      if (data && data.length > 0) {
        setOrders(data);
        setSelectedOrder(data[0]);
      }
    });
    laboratoryService.getCatalog().then(([cat]) => {
      if (cat && cat.length > 0) {
        setCatalog(cat);
      }
    });
  }, []);

  const handleUpdateValue = (index: number, val: string) => {
    setRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], value: val };
      return next;
    });
  };

  const handleSaveObservations = async () => {
    if (!selectedOrder) return;
    setSubmitting(true);
    const [updated, err] = await laboratoryService.recordResults(
      selectedOrder.id,
      medTechName,
      rows.map(r => ({
        panelName: r.panel,
        analyteCode: r.code,
        analyteName: r.name,
        value: r.value,
        unit: r.unit,
      }))
    );
    setSubmitting(false);

    if (err) {
      Alert.alert('Error', err.message);
    } else {
      Alert.alert('Saved', 'Analyte observations recorded and reference intervals applied.');
      if (updated) setSelectedOrder(updated);
    }
  };

  const handleSignAndRelease = async () => {
    if (!selectedOrder) {
      Alert.alert('Error', 'Please select a requisition first.');
      return;
    }
    if (!pathologistName.trim() || !pathologistPrc.trim()) {
      Alert.alert('Validation Error', 'Pathologist Name and PRC License are required for statutory release.');
      return;
    }

    setSubmitting(true);
    // 1. First record/update the results
    await laboratoryService.recordResults(
      selectedOrder.id,
      medTechName,
      rows.map(r => ({
        panelName: r.panel,
        analyteCode: r.code,
        analyteName: r.name,
        value: r.value,
        unit: r.unit,
      }))
    );

    // 2. Verify and Sign Report -> Triggers RabbitMQ event bus broadcast to Clinic EMR
    const [finalOrder, err] = await laboratoryService.verifyAndSignReport(selectedOrder.id, {
      pathologistName,
      pathologistPrcLicense: pathologistPrc,
      medicalTechnologistName: medTechName,
      medicalTechnologistPrcLicense: medTechPrc,
      pathologistImpression: impression,
    });
    setSubmitting(false);
    setSignModalVisible(false);

    if (err) {
      Alert.alert('Release Error', err.message);
    } else {
      Alert.alert(
        'Diagnostic Report Released! 🎉',
        `Accession ${selectedOrder.accessionNumber} verified by ${pathologistName} (${pathologistPrc}). Broadcasted to Clinic EMR and Patient App via RabbitMQ!`
      );
      if (finalOrder) setSelectedOrder(finalOrder);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Verification & Validation</ThemedText>
        <ThemedText style={styles.title}>Results Entry & Sign-Off</ThemedText>
      </View>

      {/* Order Selector Banner */}
      <View style={styles.patientBanner}>
        <ThemedText style={styles.patientName}>
          {selectedOrder ? `${selectedOrder.patientName} (${selectedOrder.accessionNumber})` : 'Select Active Worklist Order'}
        </ThemedText>
        <ThemedText style={styles.patientMeta}>
          Facility: {selectedOrder?.orderingFacilityName || 'Metro Health Outpatient'} • Urgency: {selectedOrder?.urgency || 'Routine'}
        </ThemedText>
        <ThemedText style={styles.patientSubMeta}>
          Status: {selectedOrder?.status || 'Pending'} • Doctor: {selectedOrder?.orderingDoctorName || 'Dr. Cruz'}
        </ThemedText>
      </View>

      {/* Analyte Results Entry Table */}
      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <ThemedText style={[styles.colHeader, { flex: 2 }]}>Analyte Parameter</ThemedText>
          <ThemedText style={[styles.colHeader, { flex: 1.2, textAlign: 'center' }]}>Observed Value</ThemedText>
          <ThemedText style={[styles.colHeader, { flex: 1.5, textAlign: 'right' }]}>Reference Range</ThemedText>
        </View>

        {rows.map((row, idx) => (
          <View key={row.code} style={[styles.tableRow, idx > 0 && styles.borderTop]}>
            <View style={{ flex: 2 }}>
              <ThemedText style={styles.paramName}>{row.name}</ThemedText>
              <ThemedText style={styles.paramUnit}>{row.unit} • {row.panel}</ThemedText>
            </View>
            <View style={{ flex: 1.2, alignItems: 'center' }}>
              <TextInput
                style={styles.valueInput}
                value={row.value}
                onChangeText={(val) => handleUpdateValue(idx, val)}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
              <ThemedText style={styles.paramRef}>{row.ref}</ThemedText>
            </View>
          </View>
        ))}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <Pressable
          style={styles.saveBtn}
          onPress={handleSaveObservations}
          disabled={submitting}
        >
          <ThemedText style={styles.saveBtnText}>Save Observations</ThemedText>
        </Pressable>

        <Pressable
          style={styles.verifyButton}
          onPress={() => setSignModalVisible(true)}
          disabled={submitting}
        >
          <ThemedText style={styles.verifyButtonText}>✍️ Pathologist PRC Sign & Release</ThemedText>
        </Pressable>
      </View>

      {/* Pathologist Sign-Off Modal */}
      <Modal visible={signModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Pathologist PRC Statutory Sign-Off</ThemedText>
            <ThemedText style={styles.modalSub}>
              Digital verification under Philippine DOH-PRC statutory standards. Finalizing will release the diagnostic report across RabbitMQ to Clinic EMR.
            </ThemedText>

            <View style={styles.modalForm}>
              <View>
                <ThemedText style={styles.inputLabel}>Pathologist Full Name *</ThemedText>
                <TextInput
                  style={styles.input}
                  value={pathologistName}
                  onChangeText={setPathologistName}
                />
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Pathologist PRC License Number *</ThemedText>
                <TextInput
                  style={styles.input}
                  value={pathologistPrc}
                  onChangeText={setPathologistPrc}
                />
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Medical Technologist Name *</ThemedText>
                <TextInput
                  style={styles.input}
                  value={medTechName}
                  onChangeText={setMedTechName}
                />
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>MedTech PRC License Number *</ThemedText>
                <TextInput
                  style={styles.input}
                  value={medTechPrc}
                  onChangeText={setMedTechPrc}
                />
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Pathologist Clinical Impression</ThemedText>
                <TextInput
                  style={[styles.input, { minHeight: 60 }]}
                  multiline
                  value={impression}
                  onChangeText={setImpression}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelModalBtn}
                onPress={() => setSignModalVisible(false)}
                disabled={submitting}
              >
                <ThemedText style={styles.cancelModalText}>Cancel</ThemedText>
              </Pressable>

              <Pressable
                style={styles.confirmReleaseBtn}
                onPress={handleSignAndRelease}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.confirmReleaseText}>Sign & Broadcast Event</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  patientBanner: {
    backgroundColor: '#F5F3FF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    gap: 4,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4C1D95',
  },
  patientMeta: {
    fontSize: 13,
    color: '#6D28D9',
  },
  patientSubMeta: {
    fontSize: 12,
    color: '#7C3AED',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  colHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  paramName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  paramUnit: {
    fontSize: 11,
    color: '#6B7280',
  },
  valueInput: {
    width: 70,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    textAlign: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  paramRef: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 14,
  },
  verifyButton: {
    flex: 2,
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 520,
    gap: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  modalSub: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  modalForm: {
    gap: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelModalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  cancelModalText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 13,
  },
  confirmReleaseBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#7C3AED',
  },
  confirmReleaseText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
