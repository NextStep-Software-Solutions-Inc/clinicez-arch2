import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import { Card, CardHeader, CardContent } from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import Icon, { type IconName } from '../ui/Icon';
import { notify } from '../../utils/feedback';
import {
  clinicService,
  type ClinicRoom,
  type ClinicRoomType,
} from '../../services/clinicService';
import { useClinic } from '../../context/ClinicContext';
import { theme } from '../../constants/theme';
import { Chip, FieldGroup, FormError } from './common';

const ROOM_TYPES: {
  type: ClinicRoomType;
  label: string;
  badgeVariant: 'primary' | 'info' | 'warning';
  icon: IconName;
  helper: string;
}[] = [
  {
    type: 'Consultation',
    label: 'Consultation Room',
    badgeVariant: 'primary',
    icon: 'consultations',
    helper: 'Doctor examination & consultation room (e.g., Room 1, Room 2, Dental Suite).',
  },
  {
    type: 'Triage',
    label: 'Triage Station',
    badgeVariant: 'info',
    icon: 'heartPulse',
    helper: 'Nurse intake & vital signs assessment station before doctor consultation.',
  },
  {
    type: 'Treatment',
    label: 'Treatment / Procedure Room',
    badgeVariant: 'warning',
    icon: 'syringe',
    helper: 'Destination for nurse-executed procedures (nebulization, ECG, wound care, injections).',
  },
];

function getRoomTypeMeta(roomType: ClinicRoomType) {
  return ROOM_TYPES.find((r) => r.type === roomType) ?? ROOM_TYPES[0];
}

export function ClinicRoomsSettingsCard() {
  const { rooms: contextRooms = [], refreshRooms } = useClinic();
  const [allRooms, setAllRooms] = useState<ClinicRoom[]>(() => Array.isArray(contextRooms) ? contextRooms : []);
  const [loading, setLoading] = useState(false);

  // Add / Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<ClinicRoom | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [roomType, setRoomType] = useState<ClinicRoomType>('Consultation');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation state
  const [deletingRoom, setDeletingRoom] = useState<ClinicRoom | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAllRooms = useCallback(async () => {
    setLoading(true);
    try {
      const [list] = await clinicService.getRooms(false);
      if (Array.isArray(list)) {
        setAllRooms(list);
      } else {
        setAllRooms(Array.isArray(contextRooms) ? contextRooms : []);
      }
    } catch {
      setAllRooms(Array.isArray(contextRooms) ? contextRooms : []);
    } finally {
      setLoading(false);
    }
  }, [contextRooms]);

  useEffect(() => {
    loadAllRooms();
  }, [loadAllRooms]);

  const openAddModal = () => {
    setEditingRoom(null);
    setName('');
    setCode('');
    setRoomType('Consultation');
    setDescription('');
    setSortOrder(String((allRooms.length + 1) * 10));
    setIsActive(true);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (room: ClinicRoom) => {
    setEditingRoom(room);
    setName(room.name);
    setCode(room.code ?? '');
    setRoomType(room.type);
    setDescription(room.description ?? '');
    setSortOrder(String(room.displayOrder ?? 10));
    setIsActive(room.isActive);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveRoom = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Room or station name is required.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const parsedOrder = Number.parseInt(sortOrder, 10);
      const orderValue = Number.isFinite(parsedOrder) ? parsedOrder : 10;

      if (editingRoom) {
        const [, err] = await clinicService.updateRoom(editingRoom.id, {
          name: trimmedName,
          code: code.trim() || undefined,
          type: roomType,
          description: description.trim() || undefined,
          displayOrder: orderValue,
          isActive,
        });
        if (err) {
          setFormError(err.message || 'Unable to update room.');
          return;
        }
        notify.success(`Updated "${trimmedName}".`);
      } else {
        const [, err] = await clinicService.createRoom({
          name: trimmedName,
          code: code.trim() || undefined,
          type: roomType,
          description: description.trim() || undefined,
          displayOrder: orderValue,
        });
        if (err) {
          setFormError(err.message || 'Unable to create room.');
          return;
        }
        notify.success(`Created "${trimmedName}".`);
      }

      setModalOpen(false);
      await Promise.all([loadAllRooms(), refreshRooms()]);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Unable to save room.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingRoom) return;
    setDeleting(true);
    try {
      const [, err] = await clinicService.deleteRoom(deletingRoom.id);
      if (err) {
        notify.error(err.message || 'Unable to delete room.');
        return;
      }
      notify.success(`Removed "${deletingRoom.name}".`);
      setDeletingRoom(null);
      await Promise.all([loadAllRooms(), refreshRooms()]);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Unable to delete room.');
    } finally {
      setDeleting(false);
    }
  };

  const selectedTypeMeta = getRoomTypeMeta(roomType);

  return (
    <>
      <Card>
        <CardHeader
          title="Clinic Rooms & Stations"
          subtitle="Configure consultation rooms, triage stations, and treatment/procedure rooms used across Queue, Check-In, Staff Assignments, and TV Display"
          rightAction={
            <Button
              title="Add Room / Station"
              icon="plus"
              size="sm"
              onPress={openAddModal}
            />
          }
        />
        <CardContent>
          <View style={styles.container}>
            {allRooms.length === 0 && !loading ? (
              <View style={styles.emptyBox}>
                <Icon name="clinic" size={theme.sizes.iconLg} color={theme.colors.textMuted} />
                <ThemedText variant="bodyBold" color={theme.colors.textSecondary}>
                  No rooms or stations configured
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textMuted}>
                  Add Consultation Rooms, a Triage Station, or a Treatment Room to organize patient flow.
                </ThemedText>
              </View>
            ) : (
              <View style={styles.roomGrid}>
                {allRooms.map((room) => {
                  const meta = getRoomTypeMeta(room.type);
                  return (
                    <View
                      key={room.id}
                      style={[
                        styles.roomCard,
                        !room.isActive && styles.roomCardInactive,
                      ]}
                    >
                      <View style={styles.roomHeader}>
                        <View style={styles.roomIconBadge}>
                          <Icon
                            name={meta.icon}
                            size={theme.sizes.iconMd}
                            color={theme.colors.primaryDark}
                          />
                        </View>
                        <View style={styles.roomTitleCol}>
                          <View style={styles.roomTitleRow}>
                            <ThemedText variant="bodyBold">{room.name}</ThemedText>
                            {room.code ? (
                              <Badge label={room.code} variant="outline" size="sm" />
                            ) : null}
                            {!room.isActive ? (
                              <Badge label="Inactive" variant="neutral" size="sm" />
                            ) : null}
                          </View>
                          <View style={styles.roomMetaRow}>
                            <Badge
                              label={meta.label}
                              variant={meta.badgeVariant}
                              size="sm"
                            />
                            <ThemedText variant="caption" color={theme.colors.textSecondary}>
                              {room.assignedStaffCount > 0
                                ? `${room.assignedStaffCount} staff assigned`
                                : 'No fixed staff'}
                            </ThemedText>
                          </View>
                        </View>
                      </View>

                      {room.description ? (
                        <ThemedText
                          variant="small"
                          color={theme.colors.textSecondary}
                          numberOfLines={2}
                        >
                          {room.description}
                        </ThemedText>
                      ) : null}

                      <View style={styles.roomActions}>
                        <Button
                          title="Edit"
                          icon="edit"
                          size="sm"
                          variant="outline"
                          onPress={() => openEditModal(room)}
                        />
                        <Pressable
                          onPress={() => setDeletingRoom(room)}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${room.name}`}
                          style={({ pressed }) => [
                            styles.deleteButton,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Icon
                            name="trash"
                            size={theme.sizes.iconSm}
                            color={theme.colors.emergencyText}
                          />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </CardContent>
      </Card>

      {/* Add / Edit Room Modal */}
      <Modal
        visible={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editingRoom ? `Edit ${editingRoom.name}` : 'Add Clinic Room / Station'}
        subtitle="Rooms appear as filter tabs in Consultations and can be assigned to Doctors and Nurses"
        maxWidth={520}
        footer={
          <>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setModalOpen(false)}
              disabled={saving}
            />
            <Button
              title={editingRoom ? 'Save Changes' : 'Create Room'}
              icon={editingRoom ? 'save' : 'plus'}
              onPress={handleSaveRoom}
              loading={saving}
            />
          </>
        }
      >
        <View style={styles.modalBody}>
          {formError ? <FormError message={formError} /> : null}

          <View style={styles.formRow}>
            <View style={styles.flexWide}>
              <Input
                label="Room / Station Name *"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Room 3, Dental Suite, Pedia Room"
              />
            </View>
            <View style={styles.flexNarrow}>
              <Input
                label="Short Code"
                value={code}
                onChangeText={setCode}
                placeholder="e.g. RM-3"
              />
            </View>
          </View>

          <FieldGroup label="Station Purpose / Type">
            <View style={styles.chipRow}>
              {ROOM_TYPES.map((rt) => (
                <Chip
                  key={rt.type}
                  label={rt.label}
                  active={roomType === rt.type}
                  onPress={() => setRoomType(rt.type)}
                />
              ))}
            </View>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              {selectedTypeMeta.helper}
            </ThemedText>
          </FieldGroup>

          <Input
            label="Description (Optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Ground floor consultation room with ultrasound"
          />

          <View style={styles.formRow}>
            <View style={styles.flexNarrow}>
              <Input
                label="Display Order"
                value={sortOrder}
                onChangeText={setSortOrder}
                keyboardType="numeric"
                placeholder="10"
              />
            </View>
            {editingRoom ? (
              <View style={styles.flexWide}>
                <FieldGroup label="Status">
                  <View style={styles.chipRow}>
                    <Chip
                      label="Active"
                      active={isActive}
                      onPress={() => setIsActive(true)}
                    />
                    <Chip
                      label="Inactive"
                      active={!isActive}
                      onPress={() => setIsActive(false)}
                    />
                  </View>
                </FieldGroup>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Delete Room Confirmation Modal */}
      <Modal
        visible={!!deletingRoom}
        onClose={() => !deleting && setDeletingRoom(null)}
        title="Remove Room / Station?"
        subtitle={
          deletingRoom
            ? `Are you sure you want to remove "${deletingRoom.name}"? Any staff assigned to this room will be set to Unassigned / Floating.`
            : ''
        }
        maxWidth={440}
        footer={
          <>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setDeletingRoom(null)}
              disabled={deleting}
            />
            <Button
              title="Remove Room"
              variant="danger"
              icon="trash"
              onPress={handleConfirmDelete}
              loading={deleting}
            />
          </>
        }
      >
        <View style={styles.modalBody}>
          <ThemedText variant="small" color={theme.colors.textSecondary}>
            Historical consultations and queue records will remain intact.
          </ThemedText>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  roomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  roomCard: {
    flex: 1,
    minWidth: 260,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  roomCardInactive: {
    opacity: 0.65,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  roomIconBadge: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomTitleCol: {
    flex: 1,
    gap: 4,
  },
  roomTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  roomMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  roomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
  deleteButton: {
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.emergencySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
  },
  pressed: {
    opacity: 0.75,
  },
  modalBody: {
    gap: theme.spacing.md,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  flexWide: {
    flex: 2,
    minWidth: 200,
  },
  flexNarrow: {
    flex: 1,
    minWidth: 120,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
});
