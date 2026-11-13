import React, { useState, useMemo, useCallback, useEffect, useSyncExternalStore } from 'react';
import { View, StyleSheet, Pressable, ScrollView, TextInput, Platform, ActivityIndicator } from 'react-native';
import Modal from '../ui/Modal';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import { useStaff, formatStaffName, staffInitials } from '../../context/StaffContext';
import { useClinic } from '../../context/ClinicContext';
import { clinicService, type ClinicPatient } from '../../services/clinicService';
import { getActiveThemeState, subscribeActiveTheme, theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';

export interface NewConversationModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateConversation: (params: {
    scope: 'Direct' | 'StaffContext' | 'Facility';
    title: string;
    participantStaffIds?: string[];
    participants?: Array<{
      participantType: string;
      participantId: string;
      displayName: string;
      role?: string;
    }>;
    patientId?: string;
    department?: string;
  }) => Promise<void>;
}

function getActiveThemeSnapshot(): string {
  const s = getActiveThemeState();
  return `${s.brandColorHex}|${s.clinicBrandColorHex}|${s.userBrandColorHex ?? ''}|${s.scheme}`;
}

export default function NewConversationModal({
  visible,
  onClose,
  onCreateConversation,
}: NewConversationModalProps) {
  const themeSnapshot = useSyncExternalStore(
    subscribeActiveTheme,
    getActiveThemeSnapshot,
    getActiveThemeSnapshot,
  );
  const resolvedCommsColors = useMemo(() => getActiveThemeState().resolvedColors, [themeSnapshot]);
  const styles = useMemo(() => createStyles(), [themeSnapshot]);

  const { staff, current } = useStaff();
  const clinic = useClinic();
  const rooms = clinic?.rooms || [];
  const [activeTab, setActiveTab] = useState<'Direct' | 'StaffContext' | 'Facility'>('Direct');

  // Dynamic Departments from Clinic Settings
  const availableDepartments = useMemo(() => {
    const configured = (rooms || [])
      .filter((r) => r.isActive && r.name && r.name.trim().length > 0)
      .map((r) => r.name.trim());
    if (configured.length > 0) {
      return Array.from(new Set(configured));
    }
    return [
      'Emergency & Triage',
      'Nursing Station',
      'Consultation',
      'Pediatrics',
      'Internal Medicine',
      'Laboratory',
      'Pharmacy',
      'General Clinic',
    ];
  }, [rooms]);

  // Form State
  const [title, setTitle] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');

  // Patient Autocomplete State
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<ClinicPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<ClinicPatient | null>(null);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize department
  useEffect(() => {
    if (availableDepartments.length > 0 && !selectedDepartment) {
      setSelectedDepartment(availableDepartments[0]);
    }
  }, [availableDepartments, selectedDepartment]);

  // Debounced Patient Autocomplete Search
  useEffect(() => {
    if (activeTab !== 'StaffContext') return;
    const term = patientSearch.trim();
    if (term.length < 2) {
      setPatientResults([]);
      setIsSearchingPatients(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingPatients(true);
      try {
        const [data, err] = await clinicService.getPatients(term);
        if (err) {
          setPatientResults([]);
        } else {
          setPatientResults((data || []).slice(0, 6));
        }
      } catch {
        setPatientResults([]);
      } finally {
        setIsSearchingPatients(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [patientSearch, activeTab]);

  // Filter staff: exclude current user, apply search
  const availableStaff = useMemo(() => {
    return staff.filter((s) => {
      if (current?.id && s.id === current.id) return false;
      if (!staffSearchQuery.trim()) return true;
      const q = staffSearchQuery.toLowerCase();
      const name = formatStaffName(s).toLowerCase();
      const role = (s.role || '').toLowerCase();
      return name.includes(q) || role.includes(q);
    });
  }, [staff, current?.id, staffSearchQuery]);

  const handleReset = useCallback(() => {
    setTitle('');
    setSelectedStaffId(null);
    setStaffSearchQuery('');
    setPatientSearch('');
    setPatientResults([]);
    setSelectedPatient(null);
    setIsSearchingPatients(false);
    setSelectedDepartment(availableDepartments[0] || 'General Clinic');
    setValidationError(null);
    setIsSubmitting(false);
  }, [availableDepartments]);

  const handleClose = useCallback(() => {
    handleReset();
    onClose();
  }, [handleReset, onClose]);

  const handleTabChange = (tab: 'Direct' | 'StaffContext' | 'Facility') => {
    setActiveTab(tab);
    setValidationError(null);
    if (tab === 'Facility') {
      const dept = selectedDepartment || availableDepartments[0] || 'General Clinic';
      setTitle(`${dept} Channel`);
    } else if (tab === 'Direct') {
      setTitle('');
    } else if (tab === 'StaffContext') {
      if (selectedPatient) {
        setTitle(`Care Team: ${selectedPatient.fullName}`);
      } else {
        setTitle('');
      }
    }
  };

  const handleSelectStaff = (staffMemberId: string) => {
    setSelectedStaffId(staffMemberId);
    setValidationError(null);
  };

  const handleSelectDepartment = (dept: string) => {
    setSelectedDepartment(dept);
    setTitle(`${dept} Channel`);
  };

  const handleSelectPatient = (patient: ClinicPatient) => {
    setSelectedPatient(patient);
    setPatientSearch('');
    setPatientResults([]);
    setValidationError(null);
    setTitle(`Care Team: ${patient.fullName}`);
  };

  const handleClearPatient = () => {
    setSelectedPatient(null);
    setPatientSearch('');
    setPatientResults([]);
    if (activeTab === 'StaffContext') {
      setTitle('');
    }
  };

  const handleSubmit = async () => {
    // 1. Title validation
    if (!title || !title.trim()) {
      setValidationError('Conversation title cannot be empty.');
      return;
    }

    // 2. Direct message validation
    if (activeTab === 'Direct') {
      if (!selectedStaffId) {
        setValidationError('Please select at least one staff member.');
        return;
      }
    }

    // 3. Care team validation
    if (activeTab === 'StaffContext') {
      if (!selectedPatient) {
        setValidationError('Please select a patient from the autocomplete list.');
        return;
      }
    }

    setValidationError(null);
    setIsSubmitting(true);
    try {
      const found = selectedStaffId ? staff.find((s) => s.id === selectedStaffId) : null;
      const recipientName = found ? formatStaffName(found) : 'Staff Member';
      const creatorName = current ? formatStaffName(current) : 'Staff Member';

      const directParticipants = activeTab === 'Direct' && selectedStaffId
        ? [
            ...(current?.id
              ? [
                  {
                    participantType: 'Staff',
                    participantId: current.id,
                    displayName: creatorName,
                    role: 'Owner',
                  },
                ]
              : []),
            {
              participantType: 'Staff',
              participantId: selectedStaffId,
              displayName: recipientName,
              role: 'Member',
            },
          ]
        : undefined;

      await onCreateConversation({
        scope: activeTab,
        title: title.trim(),
        participantStaffIds: selectedStaffId ? [selectedStaffId] : undefined,
        participants: directParticipants,
        patientId: selectedPatient?.id,
        department: activeTab === 'Facility' ? selectedDepartment : undefined,
      });
      handleClose();
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to create conversation.';
      setValidationError(errMsg);
      notify.error(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={handleClose}
      title="Start New Conversation"
      subtitle="Connect with clinic colleagues, care teams, or facility channels."
      maxWidth={580}
      footer={
        <View style={styles.footerRow}>
          <Button
            title="Cancel"
            variant="outline"
            onPress={handleClose}
            disabled={isSubmitting}
            style={styles.footerBtn}
          />
          <Button
            title={isSubmitting ? 'Creating...' : 'Start Conversation'}
            variant="primary"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
            style={styles.footerBtn}
          />
        </View>
      }
    >
      <View style={styles.modalBody}>
        {/* Type Selector Tabs */}
        <View style={styles.typeSelectorRow}>
          <Pressable
            style={[
              styles.typeTab,
              activeTab === 'Direct' && styles.typeTabActive,
            ]}
            onPress={() => handleTabChange('Direct')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'Direct' }}
            accessibilityLabel="Direct Message conversation type"
          >
            <Icon
              name="patient"
              size={theme.sizes.iconSm}
              color={activeTab === 'Direct' ? theme.colors.primaryDark : theme.colors.textMuted}
            />
            <ThemedText
              variant="smallBold"
              color={activeTab === 'Direct' ? theme.colors.primaryDark : theme.colors.textSecondary}
            >
              Direct Message
            </ThemedText>
          </Pressable>

          <Pressable
            style={[
              styles.typeTab,
              activeTab === 'StaffContext' && styles.typeTabActive,
            ]}
            onPress={() => handleTabChange('StaffContext')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'StaffContext' }}
            accessibilityLabel="Care Team conversation type"
          >
            <Icon
              name="users"
              size={theme.sizes.iconSm}
              color={activeTab === 'StaffContext' ? theme.colors.primaryDark : theme.colors.textMuted}
            />
            <ThemedText
              variant="smallBold"
              color={activeTab === 'StaffContext' ? theme.colors.primaryDark : theme.colors.textSecondary}
            >
              Care Team
            </ThemedText>
          </Pressable>

          <Pressable
            style={[
              styles.typeTab,
              activeTab === 'Facility' && styles.typeTabActive,
            ]}
            onPress={() => handleTabChange('Facility')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'Facility' }}
            accessibilityLabel="Facility Channel conversation type"
          >
            <Icon
              name="clinic"
              size={theme.sizes.iconSm}
              color={activeTab === 'Facility' ? theme.colors.primaryDark : theme.colors.textMuted}
            />
            <ThemedText
              variant="smallBold"
              color={activeTab === 'Facility' ? theme.colors.primaryDark : theme.colors.textSecondary}
            >
              Facility Channel
            </ThemedText>
          </Pressable>
        </View>

        {/* Validation Error Banner */}
        {validationError ? (
          <View style={styles.errorBanner}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
            <ThemedText variant="smallBold" color={theme.colors.emergency}>
              {validationError}
            </ThemedText>
          </View>
        ) : null}

        {/* Title Input */}
        <View style={styles.formGroup}>
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Conversation Title
          </ThemedText>
          <View style={styles.inputContainer}>
            <TextInput
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                setValidationError(null);
              }}
              placeholder={
                activeTab === 'Direct'
                  ? 'Colleague name or optional custom title'
                  : activeTab === 'StaffContext'
                  ? 'Select patient below to auto-populate'
                  : 'Enter channel title or select department below'
              }
              placeholderTextColor={resolvedCommsColors.textMuted}
              style={styles.textInput}
            />
          </View>
        </View>

        {/* Tab-Specific Content */}
        {activeTab === 'Direct' && (
          <View style={styles.formGroup}>
            <ThemedText variant="smallBold" color={theme.colors.text}>
              Select Colleague
            </ThemedText>
            <View style={styles.searchRow}>
              <Icon name="search" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
              <TextInput
                value={staffSearchQuery}
                onChangeText={setStaffSearchQuery}
                placeholder="Search staff by name or role..."
                placeholderTextColor={resolvedCommsColors.textMuted}
                style={styles.searchInput}
              />
            </View>

            <ScrollView style={styles.staffList} nestedScrollEnabled>
              {availableStaff.length === 0 ? (
                <View style={styles.emptyStaff}>
                  <ThemedText variant="small" color={theme.colors.textMuted}>
                    No staff colleagues found.
                  </ThemedText>
                </View>
              ) : (
                availableStaff.map((s) => {
                  const isSelected = selectedStaffId === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => handleSelectStaff(s.id)}
                      style={[
                        styles.staffCard,
                        isSelected && styles.staffCardSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Select ${formatStaffName(s)}, ${s.role}`}
                    >
                      <View style={styles.staffAvatar}>
                        <ThemedText variant="captionBold" color={theme.colors.primary}>
                          {staffInitials(s)}
                        </ThemedText>
                      </View>
                      <View style={styles.staffInfo}>
                        <ThemedText variant="bodyBold" color={theme.colors.text}>
                          {formatStaffName(s)}
                        </ThemedText>
                        <View style={styles.roleBadge}>
                          <ThemedText variant="caption" color={theme.colors.textSecondary}>
                            {s.role}
                          </ThemedText>
                        </View>
                      </View>
                      {isSelected ? (
                        <View style={styles.selectedCheck}>
                          <Icon name="check" size={theme.sizes.iconSm} color={theme.colors.primary} />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}

        {/* Tab 2: Care Team with Patient Autocomplete */}
        {activeTab === 'StaffContext' && (
          <View style={styles.formGroup}>
            <ThemedText variant="smallBold" color={theme.colors.text}>
              Patient Context & Encounter
            </ThemedText>

            {selectedPatient ? (
              <View style={styles.selectedPatientCard}>
                <View style={styles.patientAvatar}>
                  <Icon name="patient" size={theme.sizes.iconSm} color={theme.colors.primary} />
                </View>
                <View style={styles.selectedPatientInfo}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    {selectedPatient.fullName}
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    {selectedPatient.patientCode || selectedPatient.id} • {selectedPatient.age} yo {selectedPatient.sex}
                  </ThemedText>
                </View>
                <Button
                  variant="secondary"
                  size="xs"
                  icon="close"
                  iconOnly
                  onPress={handleClearPatient}
                  accessibilityLabel="Clear selected patient"
                  style={styles.clearPatientBtn}
                />
              </View>
            ) : (
              <View>
                <View style={styles.inputContainer}>
                  <Icon name="search" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                  <TextInput
                    value={patientSearch}
                    onChangeText={setPatientSearch}
                    placeholder="Search patient by name or code (min. 2 characters)..."
                    placeholderTextColor={resolvedCommsColors.textMuted}
                    style={styles.textInputWithIcon}
                  />
                  {isSearchingPatients ? (
                    <ActivityIndicator size="small" color={resolvedCommsColors.primary} />
                  ) : patientSearch.length > 0 ? (
                    <Pressable
                      onPress={() => setPatientSearch('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>

                {/* Autocomplete Results Dropdown */}
                {patientSearch.trim().length >= 2 && (
                  <View style={styles.autocompleteDropdown}>
                    {patientResults.length === 0 && !isSearchingPatients ? (
                      <View style={styles.emptyResultsRow}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          No matching patients found.
                        </ThemedText>
                      </View>
                    ) : (
                      patientResults.map((p) => (
                        <Pressable
                          key={p.id}
                          onPress={() => handleSelectPatient(p)}
                          style={styles.autocompleteRow}
                          accessibilityRole="button"
                          accessibilityLabel={`Select patient ${p.fullName}`}
                        >
                          <View style={styles.smallPatientIcon}>
                            <Icon name="patient" size={14} color={theme.colors.primary} />
                          </View>
                          <View style={styles.autocompleteTextGroup}>
                            <ThemedText variant="smallBold" color={theme.colors.text}>
                              {p.fullName}
                            </ThemedText>
                            <ThemedText variant="caption" color={theme.colors.textSecondary}>
                              {p.patientCode || p.id} • {p.age} yo {p.sex}
                            </ThemedText>
                          </View>
                          <Icon name="arrowRight" size={14} color={theme.colors.textMuted} />
                        </Pressable>
                      ))
                    )}
                  </View>
                )}
              </View>
            )}

            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Attaches longitudinal patient records and allows quick linking to patient charts.
            </ThemedText>
          </View>
        )}

        {/* Tab 3: Facility Channel with Dynamic Clinic Departments */}
        {activeTab === 'Facility' && (
          <View style={styles.formGroup}>
            <ThemedText variant="smallBold" color={theme.colors.text}>
              Clinic Department
            </ThemedText>
            <View style={styles.deptChipsWrap}>
              {availableDepartments.map((dept) => {
                const isSelected = selectedDepartment === dept;
                return (
                  <Pressable
                    key={dept}
                    onPress={() => handleSelectDepartment(dept)}
                    style={[
                      styles.deptChip,
                      isSelected && styles.deptChipSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <ThemedText
                      variant="smallBold"
                      color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                    >
                      {dept}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Channels dynamically synced from clinic stations & rooms in Settings.
            </ThemedText>
          </View>
        )}
      </View>
    </Modal>
  );
}

function createStyles() {
  return StyleSheet.create({
    modalBody: {
      gap: theme.spacing.sm,
    },
    typeSelectorRow: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surfaceSubtle,
      borderRadius: theme.radii.md,
      padding: 3,
      gap: 4,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.borderLight,
    },
    typeTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 36,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: theme.radii.sm,
      gap: 6,
      backgroundColor: theme.colors.transparent,
      borderWidth: 1,
      borderColor: theme.colors.transparent,
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
    },
    typeTabActive: {
      backgroundColor: theme.colors.primaryLight,
      borderColor: theme.colors.primaryBorder,
      ...theme.shadows.brandSubtle,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.emergencySubtle,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radii.sm,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.emergencyBorder,
    },
    formGroup: {
      gap: 4,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.sm,
      minHeight: 38,
      gap: theme.spacing.xs,
    },
    textInput: {
      flex: 1,
      color: theme.colors.text,
      paddingVertical: 6,
      ...theme.typography.body,
    },
    textInputWithIcon: {
      flex: 1,
      color: theme.colors.text,
      paddingVertical: 6,
      ...theme.typography.body,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surfaceSubtle,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.borderLight,
      borderRadius: theme.radii.full,
      paddingHorizontal: theme.spacing.sm,
      minHeight: 34,
      gap: theme.spacing.xs,
    },
    searchInput: {
      flex: 1,
      color: theme.colors.text,
      paddingVertical: 4,
      ...theme.typography.small,
    },
    staffList: {
      maxHeight: 180,
      marginTop: 4,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
    },
    emptyStaff: {
      padding: theme.spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    staffCard: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 40,
      padding: 8,
      borderBottomWidth: theme.sizes.borderWidth,
      borderBottomColor: theme.colors.borderLight,
      gap: theme.spacing.xs,
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
    },
    staffCardSelected: {
      backgroundColor: theme.colors.primarySubtle,
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.primary,
    },
    staffAvatar: {
      width: 30,
      height: 30,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.primarySubtle,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.primaryBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    staffInfo: {
      flex: 1,
      gap: 1,
    },
    roleBadge: {
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.surfaceSubtle,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.borderLight,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: theme.radii.xs,
    },
    selectedCheck: {
      paddingHorizontal: theme.spacing.xs,
    },
    selectedPatientCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.primarySubtle,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.primaryBorder,
      borderRadius: theme.radii.md,
      padding: theme.spacing.sm,
      gap: theme.spacing.sm,
    },
    patientAvatar: {
      width: 32,
      height: 32,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.surface,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.primaryBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectedPatientInfo: {
      flex: 1,
      gap: 1,
    },
    clearPatientBtn: {
      borderRadius: theme.radii.full,
    },
    autocompleteDropdown: {
      marginTop: 4,
      maxHeight: 180,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      ...theme.shadows.sm,
    },
    autocompleteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 8,
      borderBottomWidth: theme.sizes.borderWidth,
      borderBottomColor: theme.colors.borderLight,
      gap: theme.spacing.xs,
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
    },
    smallPatientIcon: {
      width: 24,
      height: 24,
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.primarySubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    autocompleteTextGroup: {
      flex: 1,
    },
    emptyResultsRow: {
      padding: theme.spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deptChipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 2,
    },
    deptChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      minHeight: 28,
      justifyContent: 'center',
      borderRadius: theme.radii.full,
      backgroundColor: theme.colors.surfaceSubtle,
      borderWidth: theme.sizes.borderWidth,
      borderColor: theme.colors.border,
    },
    deptChipSelected: {
      backgroundColor: theme.colors.primaryLight,
      borderColor: theme.colors.primaryBorder,
      borderWidth: 1.5,
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.xs,
    },
    footerBtn: {
      minWidth: 100,
      minHeight: 38,
    },
  });
}
