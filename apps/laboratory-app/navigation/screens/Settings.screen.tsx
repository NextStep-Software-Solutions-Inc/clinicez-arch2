import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
} from 'react-native';
import ThemedText from '@ui/ThemedText';
import { useFacilityLicense } from '../../components/FacilityActivationGate';
import {
  laboratoryService,
  LabStaffMember,
  LabStaffRole,
} from '../../services/laboratoryService';

export default function SettingsScreen() {
  const { license, openActivationModal, refreshLicense } = useFacilityLicense();
  const [staff, setStaff] = useState<LabStaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Staff creation modal state
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newTitle, setNewTitle] = useState('RMT');
  const [newRole, setNewRole] = useState<LabStaffRole>('MedicalTechnologist');
  const [newPrc, setNewPrc] = useState('');
  const [newSpecialty, setNewSpecialty] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  const loadStaff = useCallback(async () => {
    const [res] = await laboratoryService.getStaff();
    if (res && res.length > 0) {
      setStaff(res);
    } else {
      // Default initial seeds if freshly initialized
      setStaff([
        {
          id: 'lab-st-1',
          tenantId: 'tenant-default',
          laboratoryId: 'lab-default',
          firstName: 'Manuel',
          lastName: 'Castro',
          title: 'Dr.',
          role: 'Pathologist',
          prcLicenseNumber: 'PRC-0081294',
          ptrNumber: 'PTR-9988112',
          specialty: 'Clinical & Anatomic Pathology',
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'lab-st-2',
          tenantId: 'tenant-default',
          laboratoryId: 'lab-default',
          firstName: 'Camille',
          lastName: 'Mendoza',
          title: 'RMT',
          role: 'MedicalTechnologist',
          prcLicenseNumber: 'PRC-0182334',
          specialty: 'Clinical Chemistry & Hematology',
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadStaff().finally(() => setLoading(false));
  }, [loadStaff]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadStaff(), refreshLicense()]);
    setRefreshing(false);
  }, [loadStaff, refreshLicense]);

  const handleAddStaff = async () => {
    if (!newFirstName.trim() || !newLastName.trim()) {
      setStaffError('First and last name are required.');
      return;
    }

    setAddingStaff(true);
    setStaffError(null);

    const [created, err] = await laboratoryService.createStaff({
      firstName: newFirstName.trim(),
      lastName: newLastName.trim(),
      title: newTitle.trim() || undefined,
      role: newRole,
      prcLicenseNumber: newPrc.trim() || undefined,
      specialty: newSpecialty.trim() || undefined,
      email: newEmail.trim() || undefined,
    });

    setAddingStaff(false);

    if (err) {
      setStaffError(err.message || 'Failed to add lab staff member. License quota may be reached.');
      return;
    }

    if (created) {
      setStaff((prev) => [...prev, created]);
      setShowAddStaffModal(false);
      setNewFirstName('');
      setNewLastName('');
      setNewPrc('');
      setNewSpecialty('');
      setNewEmail('');
      await refreshLicense();
    }
  };

  const handleDeactivateStaff = async (staffId: string) => {
    const [, err] = await laboratoryService.deactivateStaff(staffId);
    if (!err) {
      setStaff((prev) => prev.filter((s) => s.id !== staffId));
      await refreshLicense();
    }
  };

  const activeStaffCount = staff.filter((s) => s.isActive).length;
  const maxStaffLimit = license?.limits?.maxStaff ?? 5;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0D9488']} />}
    >
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>LIS Configuration</ThemedText>
        <ThemedText style={styles.title}>Laboratory & Licenses</ThemedText>
      </View>

      {/* Facility License & Hard Limits Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <ThemedText style={styles.cardTitle}>Diagnostic Facility License</ThemedText>
          <Pressable style={styles.licenseActionBtn} onPress={openActivationModal}>
            <ThemedText style={styles.licenseActionBtnText}>🔑 Update / Renew Key</ThemedText>
          </Pressable>
        </View>

        <View style={styles.licenseBannerRow}>
          <View style={styles.licenseTierBadge}>
            <ThemedText style={styles.licenseTierText}>{license?.planTier ?? 'Community'} Tier</ThemedText>
          </View>
          <ThemedText style={[styles.licenseStatusText, { color: license?.status === 'Active' ? '#0D9488' : '#DC2626' }]}>
            ● {license?.status === 'Active' ? 'Cryptographically Verified (ECDSA P-256)' : (license?.status ?? 'Unverified')}
          </ThemedText>
        </View>

        <View style={styles.row}>
          <ThemedText style={styles.label}>Laboratory Name</ThemedText>
          <ThemedText style={styles.value}>{license?.laboratoryName ?? 'St. Jude Clinical Laboratory'}</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Staff Quota Allocation</ThemedText>
          <ThemedText style={[styles.value, { color: '#0D9488', fontWeight: '700' }]}>
            {activeStaffCount} / {maxStaffLimit} active seats used
          </ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Max Connected Analyzers</ThemedText>
          <ThemedText style={styles.value}>{license?.limits?.maxAnalyzers ?? 1} Analyzers</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Offline Edge Operation</ThemedText>
          <ThemedText style={[styles.value, { color: '#16A34A' }]}>
            {license?.limits?.isOfflineCapable ? 'Enabled (Full Autonomous LIS)' : 'Standard'}
          </ThemedText>
        </View>
        {license?.expiresAtUtc && (
          <View style={styles.row}>
            <ThemedText style={styles.label}>License Expiration</ThemedText>
            <ThemedText style={styles.value}>{new Date(license.expiresAtUtc).toLocaleDateString()}</ThemedText>
          </View>
        )}
      </View>

      {/* Staff & Healthcare Providers Roster Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View>
            <ThemedText style={styles.cardTitle}>Autonomous Laboratory Staff</ThemedText>
            <ThemedText style={{ fontSize: 12, color: '#6B7280' }}>
              Quota: {activeStaffCount} of {maxStaffLimit} seats used
            </ThemedText>
          </View>
          <Pressable
            style={[styles.addStaffBtn, activeStaffCount >= maxStaffLimit && { backgroundColor: '#9CA3AF' }]}
            onPress={() => {
              if (activeStaffCount >= maxStaffLimit) {
                alert(`Staff quota limit of ${maxStaffLimit} reached for the ${license?.planTier ?? 'Community'} tier. Please upgrade license key.`);
                return;
              }
              setStaffError(null);
              setShowAddStaffModal(true);
            }}
          >
            <ThemedText style={styles.addStaffBtnText}>+ Add Staff</ThemedText>
          </Pressable>
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator color="#0D9488" style={{ padding: 12 }} />
        ) : (
          <View style={{ gap: 10, marginTop: 4 }}>
            {staff.map((s) => (
              <View key={s.id} style={styles.staffItem}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ThemedText style={styles.staffName}>
                      {s.title ? `${s.title} ` : ''}{s.firstName} {s.lastName}
                    </ThemedText>
                    <View style={[styles.roleBadge, s.role === 'Pathologist' && { backgroundColor: '#CCFBF1' }]}>
                      <ThemedText style={[styles.roleBadgeText, s.role === 'Pathologist' && { color: '#0F766E' }]}>
                        {s.role}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.specialtyText}>{s.specialty ?? 'General Laboratory'}</ThemedText>
                  {s.prcLicenseNumber && (
                    <ThemedText style={styles.licenseText}>
                      PRC: {s.prcLicenseNumber} {s.ptrNumber ? `• PTR: ${s.ptrNumber}` : ''}
                    </ThemedText>
                  )}
                </View>
                <Pressable style={styles.deactivateBtn} onPress={() => handleDeactivateStaff(s.id)}>
                  <ThemedText style={styles.deactivateBtnText}>Deactivate</ThemedText>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Laboratory Profile & Interfaces */}
      <View style={styles.card}>
        <ThemedText style={styles.cardTitle}>Laboratory Profile & Interfaces</ThemedText>
        <View style={styles.row}>
          <ThemedText style={styles.label}>License to Operate (LTO)</ThemedText>
          <ThemedText style={styles.value}>DOH-LIS-2026-4412</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Category</ThemedText>
          <ThemedText style={styles.value}>Secondary Clinical Laboratory</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>ASTM / HL7 Protocol</ThemedText>
          <ThemedText style={[styles.value, { color: '#16A34A', fontWeight: '700' }]}>Connected (Port 5001)</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Local Storage</ThemedText>
          <ThemedText style={styles.value}>PostgreSQL Edge Database</ThemedText>
        </View>
      </View>

      {/* Add Staff Modal */}
      <Modal
        visible={showAddStaffModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddStaffModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <ThemedText style={styles.modalHeaderTitle}>Add Laboratory Staff</ThemedText>
            <ThemedText style={styles.modalHeaderSub}>
              Autonomous Edge Roster • Seats: {activeStaffCount}/{maxStaffLimit}
            </ThemedText>

            {staffError && (
              <View style={styles.modalErrorBanner}>
                <ThemedText style={styles.modalErrorBannerText}>{staffError}</ThemedText>
              </View>
            )}

            <View style={{ gap: 8 }}>
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.fieldLabel}>Title (Dr., RMT, etc.)</ThemedText>
                  <TextInput
                    style={styles.fieldInput}
                    value={newTitle}
                    onChangeText={setNewTitle}
                    placeholder="Dr. / RMT"
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <ThemedText style={styles.fieldLabel}>Role</ThemedText>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {(
                      [
                        'Pathologist',
                        'MedicalTechnologist',
                        'LaboratoryTechnician',
                        'Phlebotomist',
                        'LaboratoryAide',
                      ] as const
                    ).map((r) => (
                      <Pressable
                        key={r}
                        style={[
                          styles.roleSelectChip,
                          newRole === r && styles.roleSelectChipActive,
                        ]}
                        onPress={() => setNewRole(r)}
                      >
                        <ThemedText
                          style={[
                            styles.roleSelectChipText,
                            newRole === r && styles.roleSelectChipTextActive,
                          ]}
                        >
                          {r === 'MedicalTechnologist' ? 'MedTech' : r === 'LaboratoryTechnician' ? 'Lab Tech' : r}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.fieldLabel}>First Name *</ThemedText>
                  <TextInput
                    style={styles.fieldInput}
                    value={newFirstName}
                    onChangeText={setNewFirstName}
                    placeholder="Maria"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.fieldLabel}>Last Name *</ThemedText>
                  <TextInput
                    style={styles.fieldInput}
                    value={newLastName}
                    onChangeText={setNewLastName}
                    placeholder="Santos"
                  />
                </View>
              </View>

              <View>
                <ThemedText style={styles.fieldLabel}>PRC License Number</ThemedText>
                <TextInput
                  style={styles.fieldInput}
                  value={newPrc}
                  onChangeText={setNewPrc}
                  placeholder="PRC-0099881"
                />
              </View>

              <View>
                <ThemedText style={styles.fieldLabel}>Specialty / Section</ThemedText>
                <TextInput
                  style={styles.fieldInput}
                  value={newSpecialty}
                  onChangeText={setNewSpecialty}
                  placeholder="Hematology & Coagulation"
                />
              </View>
            </View>

            <View style={styles.modalActionsRow}>
              <Pressable
                style={styles.cancelModalBtn}
                onPress={() => setShowAddStaffModal(false)}
                disabled={addingStaff}
              >
                <ThemedText style={styles.cancelModalBtnText}>Cancel</ThemedText>
              </Pressable>

              <Pressable
                style={[styles.saveStaffBtn, addingStaff && { opacity: 0.6 }]}
                onPress={handleAddStaff}
                disabled={addingStaff}
              >
                {addingStaff ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <ThemedText style={styles.saveStaffBtnText}>Register Staff</ThemedText>
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    color: '#6B7280',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  licenseActionBtn: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  licenseActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D9488',
  },
  licenseBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  licenseTierBadge: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  licenseTierText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  licenseStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addStaffBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  addStaffBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  staffItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
  },
  staffName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  roleBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563',
  },
  specialtyText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  licenseText: {
    fontSize: 11,
    color: '#0D9488',
    fontWeight: '600',
    marginTop: 2,
  },
  deactivateBtn: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  deactivateBtnText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111827',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    maxWidth: 500,
    width: '100%',
    gap: 12,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalHeaderSub: {
    fontSize: 12,
    color: '#64748B',
  },
  modalErrorBanner: {
    backgroundColor: '#FEE2E2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  modalErrorBannerText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '600',
  },
  roleSelectChip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F8FAFC',
  },
  roleSelectChipActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  roleSelectChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  roleSelectChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelModalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelModalBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  saveStaffBtn: {
    backgroundColor: '#0D9488',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  saveStaffBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
