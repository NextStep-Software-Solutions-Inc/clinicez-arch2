import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import { StaffMember, ClinicRoom } from '../../services/clinicService';

export interface QueueRoutingSelectorProps {
  selectedDoctorId: string;
  onSelectDoctor: (doctorId: string) => void;
  selectedRoomId: string;
  onSelectRoom: (roomId: string) => void;
  activeDoctors: StaffMember[];
  activeRooms: ClinicRoom[];
  formatStaffName: (staff: StaffMember) => string;
  doctorLabel?: string;
  roomLabel?: string;
  anyDoctorLabel?: string;
  autoRoomLabel?: string;
  disabled?: boolean;
}

export const QueueRoutingSelector: React.FC<QueueRoutingSelectorProps> = ({
  selectedDoctorId,
  onSelectDoctor,
  selectedRoomId,
  onSelectRoom,
  activeDoctors,
  activeRooms,
  formatStaffName,
  doctorLabel = 'Attending Doctor (Optional)',
  roomLabel = 'Room / Station (Optional)',
  anyDoctorLabel = 'Any Available Doctor',
  autoRoomLabel = 'Auto / Unassigned',
  disabled = false,
}) => {
  const handleDoctorClick = (docId: string) => {
    if (disabled) return;
    onSelectDoctor(docId);
    if (!docId) {
      // Reverted to Any Available Doctor -> reset room to Auto / Unassigned
      onSelectRoom('');
      return;
    }

    // Default the room to the primary room of the doctor selected
    const doc = activeDoctors.find((d) => d.id === docId);
    const docRooms = doc?.assignedRoomIds ?? (doc?.assignedRoomId ? [doc.assignedRoomId] : []);
    if (docRooms.length > 0) {
      onSelectRoom(docRooms[0]);
    }
  };

  return (
    <View style={styles.container}>
      {/* Attending Doctor Section */}
      <View style={styles.section}>
        <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
          {doctorLabel}
        </ThemedText>
        <View style={styles.chipGrid}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={anyDoctorLabel}
            onPress={() => handleDoctorClick('')}
            disabled={disabled}
            style={[
              styles.chip,
              !selectedDoctorId && styles.chipSelected,
            ]}
          >
            <ThemedText
              variant="smallBold"
              color={!selectedDoctorId ? theme.colors.textInverted : theme.colors.text}
            >
              {anyDoctorLabel}
            </ThemedText>
          </Pressable>

          {activeDoctors.map((doc) => {
            const isSelected = selectedDoctorId === doc.id;
            const docRooms =
              doc.assignedRoomNames && doc.assignedRoomNames.length > 0
                ? doc.assignedRoomNames.join(', ')
                : doc.assignedRoomName || '';
            const docLabel = `${formatStaffName(doc)}${docRooms ? ` · ${docRooms}` : ''}`;

            return (
              <Pressable
                key={doc.id}
                accessibilityRole="button"
                accessibilityLabel={docLabel}
                onPress={() => handleDoctorClick(doc.id)}
                disabled={disabled}
                style={[
                  styles.chip,
                  isSelected && styles.chipSelected,
                ]}
              >
                <ThemedText
                  variant="smallBold"
                  color={isSelected ? theme.colors.textInverted : theme.colors.text}
                >
                  {docLabel}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Room / Station Section */}
      {activeRooms.length > 0 && (
        <View style={styles.section}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            {roomLabel}
          </ThemedText>
          <View style={styles.chipGrid}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={autoRoomLabel}
              onPress={() => !disabled && onSelectRoom('')}
              disabled={disabled}
              style={[
                styles.chip,
                !selectedRoomId && styles.chipSelected,
              ]}
            >
              <ThemedText
                variant="smallBold"
                color={!selectedRoomId ? theme.colors.textInverted : theme.colors.text}
              >
                {autoRoomLabel}
              </ThemedText>
            </Pressable>

            {activeRooms.map((room) => {
              const isSelected = selectedRoomId === room.id;
              const selectedDoctor = activeDoctors.find((d) => d.id === selectedDoctorId);
              const selectedDocRooms =
                selectedDoctor?.assignedRoomIds ??
                (selectedDoctor?.assignedRoomId ? [selectedDoctor.assignedRoomId] : []);
              const isDocPrimaryRoom =
                selectedDocRooms.length > 0 && selectedDocRooms[0] === room.id;
              const isDocRoom = selectedDocRooms.includes(room.id);
              const roomDisplay = isDocPrimaryRoom
                ? `${room.name} (Primary)`
                : isDocRoom
                ? `${room.name} (Doctor's Room)`
                : room.name;

              return (
                <Pressable
                  key={room.id}
                  accessibilityRole="button"
                  accessibilityLabel={roomDisplay}
                  onPress={() => !disabled && onSelectRoom(room.id)}
                  disabled={disabled}
                  style={[
                    styles.chip,
                    isSelected && styles.chipSelected,
                  ]}
                >
                  <ThemedText
                    variant="smallBold"
                    color={isSelected ? theme.colors.textInverted : theme.colors.text}
                  >
                    {roomDisplay}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.sm,
  },
  section: {
    gap: theme.spacing.xs,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    minHeight: 44, // WCAG Touch Target Compliance
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
});

export default QueueRoutingSelector;
