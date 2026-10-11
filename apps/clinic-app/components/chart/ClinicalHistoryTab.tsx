import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { theme } from '@constants/theme';
import { ThemedText, Button, Input, Icon, EmptyState, ErrorState, SkeletonList, Modal, Badge } from '@ui';
import { Alert } from '@utils/feedback';
import { usePhilHealthCatalog } from '@utils/usePhilHealthCatalog';
import {
  clinicService,
  ClinicPatient,
  PatientSurgicalHistory,
  UpsertPatientSurgicalHistoryPayload,
} from '../../services/clinicService';

interface ClinicalHistoryTabProps {
  patient: ClinicPatient;
  initialSurgicalHistories?: PatientSurgicalHistory[];
  onRefreshChart?: () => void;
}

export default function ClinicalHistoryTab({
  patient,
  initialSurgicalHistories,
  onRefreshChart,
}: ClinicalHistoryTabProps) {
  const [surgicalHistories, setSurgicalHistories] = useState<PatientSurgicalHistory[]>(
    initialSurgicalHistories || []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State for Add / Edit Surgical Procedure
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PatientSurgicalHistory | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form Fields
  const [procedureName, setProcedureName] = useState('');
  const [surgeryDate, setSurgeryDate] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [findings, setFindings] = useState('');
  const [complications, setComplications] = useState('');
  const [remarks, setRemarks] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Catalog for past medical conditions (lib_mdiseases)
  const { items: diseaseCatalog, loading: catalogLoading } = usePhilHealthCatalog('lib_mdiseases');

  const fetchSurgicalHistories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, err] = await clinicService.getSurgicalHistories(patient.id);
      if (data) {
        setSurgicalHistories(data);
      } else if (err) {
        setError(err.message || 'Unable to load surgical procedures.');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to fetch surgical procedures.');
    } finally {
      setLoading(false);
    }
  }, [patient.id]);

  useEffect(() => {
    if (!initialSurgicalHistories || initialSurgicalHistories.length === 0) {
      fetchSurgicalHistories();
    } else {
      setSurgicalHistories(initialSurgicalHistories);
    }
  }, [fetchSurgicalHistories, initialSurgicalHistories]);

  const openAddModal = () => {
    setEditingItem(null);
    setProcedureName('');
    setSurgeryDate(new Date().toISOString().split('T')[0]);
    setHospitalName('');
    setFindings('');
    setComplications('');
    setRemarks('');
    setFormError(null);
    setModalVisible(true);
  };

  const openEditModal = (item: PatientSurgicalHistory) => {
    setEditingItem(item);
    setProcedureName(item.procedureName);
    setSurgeryDate(item.surgeryDate ? item.surgeryDate.split('T')[0] : '');
    setHospitalName(item.hospitalName || '');
    setFindings(item.findings || '');
    setComplications(item.complications || '');
    setRemarks(item.remarks || '');
    setFormError(null);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!procedureName.trim()) {
      setFormError('Procedure name is required.');
      return;
    }
    if (!surgeryDate.trim()) {
      setFormError('Surgery date is required (YYYY-MM-DD).');
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload: UpsertPatientSurgicalHistoryPayload = {
      procedureName: procedureName.trim(),
      surgeryDate: surgeryDate.trim(),
      hospitalName: hospitalName.trim() || undefined,
      findings: findings.trim() || undefined,
      complications: complications.trim() || undefined,
      remarks: remarks.trim() || undefined,
    };

    try {
      if (editingItem) {
        const [updated, err] = await clinicService.updateSurgicalHistory(
          patient.id,
          editingItem.id,
          payload
        );
        if (err) {
          setFormError(err.message || 'Failed to update surgical procedure.');
          setSaving(false);
          return;
        }
        if (updated) {
          setSurgicalHistories((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
        }
      } else {
        const [created, err] = await clinicService.addSurgicalHistory(patient.id, payload);
        if (err) {
          setFormError(err.message || 'Failed to record surgical procedure.');
          setSaving(false);
          return;
        }
        if (created) {
          setSurgicalHistories((prev) => [created, ...prev]);
        }
      }

      setModalVisible(false);
      onRefreshChart?.();
    } catch (e: any) {
      setFormError(e.message || 'An unexpected error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: PatientSurgicalHistory) => {
    Alert.alert(
      'Delete Surgical Procedure',
      `Are you sure you want to remove "${item.procedureName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item.id);
            try {
              const [, err] = await clinicService.deleteSurgicalHistory(patient.id, item.id);
              if (err) {
                Alert.alert('Error', err.message || 'Failed to delete procedure.');
              } else {
                setSurgicalHistories((prev) => prev.filter((p) => p.id !== item.id));
                onRefreshChart?.();
              }
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Unexpected error deleting procedure.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  // Chronic conditions chips parsing from patient profile
  const knownConditions = (patient.chronicConditions || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* SECTION 1: Chronic & Past Medical Conditions */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.iconTitleRow}>
            <Icon name="activity" size={theme.sizes.iconMd} color={theme.colors.primary} />
            <ThemedText variant="h3">Documented Medical Conditions</ThemedText>
          </View>
          <Badge
            label={`${knownConditions.length} Documented`}
            variant={knownConditions.length > 0 ? 'primary' : 'outline'}
          />
        </View>

        <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.sectionDescription}>
          Conditions and non-communicable diseases referenced against PhilHealth statutory library (lib_mdiseases).
        </ThemedText>

        {knownConditions.length > 0 ? (
          <View style={styles.chipsWrap}>
            {knownConditions.map((condition, idx) => (
              <View key={idx} style={styles.conditionChip}>
                <Icon name="check" size={theme.fontSizes.sm} color={theme.colors.primary} />
                <ThemedText variant="smallBold" color={theme.colors.primary}>
                  {condition}
                </ThemedText>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyNoticeStrip}>
            <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
            <ThemedText variant="small" color={theme.colors.textMuted}>
              No chronic conditions recorded for this patient.
            </ThemedText>
          </View>
        )}
      </View>

      {/* SECTION 2: Relational Surgical Procedure History */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.iconTitleRow}>
            <Icon name="file" size={theme.sizes.iconMd} color={theme.colors.primary} />
            <ThemedText variant="h3">Surgical Procedures History</ThemedText>
          </View>
          <Button
            title="Add Procedure"
            variant="primary"
            size="sm"
            icon="plus"
            onPress={openAddModal}
          />
        </View>

        <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.sectionDescription}>
          Structured surgical history. Relational entities enforce multi-tenant isolation and eliminate disconnected modal state.
        </ThemedText>

        {loading ? (
          <SkeletonList rows={3} />
        ) : error ? (
          <ErrorState
            title="Unable to load surgical history"
            message={error}
            onRetry={fetchSurgicalHistories}
          />
        ) : surgicalHistories.length === 0 ? (
          <View style={styles.statutoryEmptyBanner}>
            <View style={styles.statutoryBannerHeader}>
              <Icon name="shield" size={theme.sizes.iconMd} color={theme.colors.infoText} />
              <ThemedText variant="bodyBold" color={theme.colors.infoText}>
                No Past Surgical Procedures Documented
              </ThemedText>
            </View>
            <ThemedText variant="small" color={theme.colors.textSecondary} style={{ marginTop: theme.spacing.xs }}>
              Statutory declaration active: Yakap eKAS / eSER transmittal will automatically populate the required
              PhilHealth fallback <ThemedText variant="code" color={theme.colors.textSecondary}>pSurgDesc=&quot;None&quot; pSurgDate=&quot;1900-01-01&quot;</ThemedText>.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.proceduresList}>
            {surgicalHistories.map((item) => (
              <View key={item.id} style={styles.procedureCard}>
                <View style={styles.procedureHeader}>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      {item.procedureName}
                    </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      Date: {item.surgeryDate ? item.surgeryDate.split('T')[0] : '—'}
                      {item.hospitalName ? ` • Facility: ${item.hospitalName}` : ''}
                    </ThemedText>
                  </View>
                  <View style={styles.cardActions}>
                    <Pressable
                      style={styles.actionIconBtn}
                      onPress={() => openEditModal(item)}
                      accessibilityLabel="Edit procedure"
                    >
                      <Icon name="edit" size={theme.sizes.iconSm} color={theme.colors.primary} />
                    </Pressable>
                    <Pressable
                      style={styles.actionIconBtn}
                      onPress={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      accessibilityLabel="Delete procedure"
                    >
                      {deletingId === item.id ? (
                        <ActivityIndicator size="small" color={theme.colors.emergency} />
                      ) : (
                        <Icon name="trash" size={theme.sizes.iconSm} color={theme.colors.emergency} />
                      )}
                    </Pressable>
                  </View>
                </View>

                {item.findings ? (
                  <View style={styles.detailRow}>
                    <ThemedText variant="captionBold" color={theme.colors.textMuted}>Findings: </ThemedText>
                    <ThemedText variant="small" color={theme.colors.text}>{item.findings}</ThemedText>
                  </View>
                ) : null}

                {item.complications ? (
                  <View style={styles.detailRow}>
                    <ThemedText variant="captionBold" color={theme.colors.emergencyText}>Complications: </ThemedText>
                    <ThemedText variant="small" color={theme.colors.emergencyText}>{item.complications}</ThemedText>
                  </View>
                ) : null}

                {item.remarks ? (
                  <View style={styles.detailRow}>
                    <ThemedText variant="captionBold" color={theme.colors.textMuted}>Remarks: </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>{item.remarks}</ThemedText>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Modal for Add / Edit Surgical Procedure */}
      <Modal
        visible={modalVisible}
        onClose={() => !saving && setModalVisible(false)}
        title={editingItem ? 'Edit Surgical Procedure' : 'Record Surgical Procedure'}
      >
        <ScrollView contentContainerStyle={styles.modalFormContent}>
          {formError ? (
            <View style={styles.formErrorBanner}>
              <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
              <ThemedText variant="small" color={theme.colors.emergencyText}>
                {formError}
              </ThemedText>
            </View>
          ) : null}

          <Input
            label="Procedure Name *"
            placeholder="e.g. Appendectomy, Cesarean Section"
            value={procedureName}
            onChangeText={setProcedureName}
          />

          <Input
            label="Surgery Date (YYYY-MM-DD) *"
            placeholder="YYYY-MM-DD"
            value={surgeryDate}
            onChangeText={setSurgeryDate}
          />

          <Input
            label="Hospital / Surgical Facility"
            placeholder="e.g. Philippine General Hospital"
            value={hospitalName}
            onChangeText={setHospitalName}
          />

          <Input
            label="Intraoperative Findings"
            placeholder="e.g. Suppurative appendicitis with localized peritonitis"
            value={findings}
            onChangeText={setFindings}
          />

          <Input
            label="Complications (if any)"
            placeholder="e.g. None or Surgical site wound infection"
            value={complications}
            onChangeText={setComplications}
          />

          <Input
            label="Remarks / Notes"
            placeholder="e.g. Elective procedure, full recovery"
            value={remarks}
            onChangeText={setRemarks}
          />

          <View style={styles.modalFooter}>
            <Button
              title="Cancel"
              variant="outline"
              size="md"
              disabled={saving}
              onPress={() => setModalVisible(false)}
            />
            <Button
              title={saving ? 'Saving…' : editingItem ? 'Save Changes' : 'Record Procedure'}
              variant="primary"
              size="md"
              loading={saving}
              disabled={saving}
              onPress={handleSave}
            />
          </View>
        </ScrollView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  sectionDescription: {
    marginBottom: theme.spacing.xs,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  conditionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryBorder,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
  },
  emptyNoticeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
  },
  statutoryEmptyBanner: {
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.infoBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  statutoryBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  proceduresList: {
    gap: theme.spacing.sm,
  },
  procedureCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderLight,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  procedureHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardActions: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  actionIconBtn: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  modalFormContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  formErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
});
