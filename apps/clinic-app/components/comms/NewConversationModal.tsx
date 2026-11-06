import React, { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet, Pressable, ScrollView, TextInput } from 'react-native';
import Modal from '../ui/Modal';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import Button from '../ui/Button';
import { useStaff, formatStaffName, staffInitials } from '../../context/StaffContext';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';

export interface NewConversationModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateConversation: (params: {
    scope: 'Direct' | 'StaffContext' | 'Facility';
    title: string;
    participantStaffIds?: string[];
    patientId?: string;
    department?: string;
  }) => Promise<void>;
}

const DEPARTMENTS = [
  'Emergency & Triage',
  'Nursing Station',
  'Pediatrics',
  'Internal Medicine',
  'Laboratory',
  'Pharmacy',
  'General Clinic',
];

export default function NewConversationModal({
  visible,
  onClose,
  onCreateConversation,
}: NewConversationModalProps) {
  const { staff, current } = useStaff();
  const [activeTab, setActiveTab] = useState<'Direct' | 'StaffContext' | 'Facility'>('Direct');

  // Form State
  const [title, setTitle] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [patientId, setPatientId] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('Emergency & Triage');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setPatientId('');
    setSelectedDepartment('Emergency & Triage');
    setValidationError(null);
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    handleReset();
    onClose();
  }, [handleReset, onClose]);

  const handleTabChange = (tab: 'Direct' | 'StaffContext' | 'Facility') => {
    setActiveTab(tab);
    setValidationError(null);
    if (tab === 'Facility') {
      setTitle(`${selectedDepartment} Channel`);
    } else if (tab === 'Direct') {
      if (selectedStaffId) {
        const found = staff.find((s) => s.id === selectedStaffId);
        if (found) setTitle(`Chat with ${formatStaffName(found)}`);
      } else {
        setTitle('');
      }
    } else if (tab === 'StaffContext') {
      setTitle(patientId.trim() ? `Care Team: ${patientId.trim()}` : '');
    }
  };

  const handleSelectStaff = (staffMemberId: string) => {
    setSelectedStaffId(staffMemberId);
    setValidationError(null);
    const found = staff.find((s) => s.id === staffMemberId);
    if (found) {
      setTitle(`Chat with ${formatStaffName(found)}`);
    }
  };

  const handleSelectDepartment = (dept: string) => {
    setSelectedDepartment(dept);
    setTitle(`${dept} Channel`);
  };

  const handlePatientIdChange = (text: string) => {
    setPatientId(text);
    setValidationError(null);
    if (text.trim()) {
      setTitle(`Care Team: ${text.trim()}`);
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
      if (!patientId || !patientId.trim()) {
        setValidationError('Please select a patient for the care team.');
        return;
      }
    }

    setValidationError(null);
    setIsSubmitting(true);
    try {
      await onCreateConversation({
        scope: activeTab,
        title: title.trim(),
        participantStaffIds: selectedStaffId ? [selectedStaffId] : undefined,
        patientId: patientId.trim() || undefined,
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
              color={activeTab === 'Direct' ? theme.colors.primary : theme.colors.textMuted}
            />
            <ThemedText
              variant="smallBold"
              color={activeTab === 'Direct' ? theme.colors.primary : theme.colors.textSecondary}
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
              color={activeTab === 'StaffContext' ? theme.colors.primary : theme.colors.textMuted}
            />
            <ThemedText
              variant="smallBold"
              color={activeTab === 'StaffContext' ? theme.colors.primary : theme.colors.textSecondary}
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
              color={activeTab === 'Facility' ? theme.colors.primary : theme.colors.textMuted}
            />
            <ThemedText
              variant="smallBold"
              color={activeTab === 'Facility' ? theme.colors.primary : theme.colors.textSecondary}
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
                  ? 'Select staff colleague or enter custom title'
                  : activeTab === 'StaffContext'
                  ? 'e.g. Care Team: Juan Dela Cruz'
                  : 'e.g. Nursing Station'
              }
              placeholderTextColor={theme.colors.textMuted}
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
                placeholderTextColor={theme.colors.textMuted}
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

        {activeTab === 'StaffContext' && (
          <View style={styles.formGroup}>
            <ThemedText variant="smallBold" color={theme.colors.text}>
              Patient Context & Encounter
            </ThemedText>
            <View style={styles.inputContainer}>
              <Icon name="patient" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
              <TextInput
                value={patientId}
                onChangeText={handlePatientIdChange}
                placeholder="Enter patient name or ID (e.g. Juan Dela Cruz, P-10492)"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.textInputWithIcon}
              />
            </View>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Attaches longitudinal patient records and allows quick linking to patient charts.
            </ThemedText>
          </View>
        )}

        {activeTab === 'Facility' && (
          <View style={styles.formGroup}>
            <ThemedText variant="smallBold" color={theme.colors.text}>
              Clinic Department
            </ThemedText>
            <View style={styles.deptChipsWrap}>
              {DEPARTMENTS.map((dept) => {
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
                  >
                    <ThemedText
                      variant="small"
                      color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
                    >
                      {dept}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBody: {
    gap: theme.spacing.md,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  typeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.transparent,
  },
  typeTabActive: {
    backgroundColor: theme.colors.surface,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.emergencySubtle,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
  },
  formGroup: {
    gap: theme.spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.sizes.controlMd,
    gap: theme.spacing.xs,
  },
  textInput: {
    flex: 1,
    color: theme.colors.text,
    paddingVertical: theme.spacing.sm,
  },
  textInputWithIcon: {
    flex: 1,
    color: theme.colors.text,
    paddingVertical: theme.spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.sizes.controlSm,
    gap: theme.spacing.xs,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    paddingVertical: theme.spacing.xs,
  },
  staffList: {
    maxHeight: 200,
    marginTop: theme.spacing.xs,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
  },
  emptyStaff: {
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    gap: theme.spacing.sm,
  },
  staffCardSelected: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  staffAvatar: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffInfo: {
    flex: 1,
    gap: 2,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surfaceSubtle,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 1,
    borderRadius: theme.radii.xs,
  },
  selectedCheck: {
    paddingHorizontal: theme.spacing.xs,
  },
  deptChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  deptChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  deptChipSelected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.primary,
    borderWidth: theme.sizes.borderWidth,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  footerBtn: {
    minWidth: 110,
  },
});
