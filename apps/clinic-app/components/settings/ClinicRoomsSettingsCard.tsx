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
import SortableRoomsGrid from './SortableRoomsGrid';

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
  const [allRooms, setAllRooms] = useState<ClinicRoom[]>(() =>
    Array.isArray(contextRooms) ? contextRooms : [],
  );
  const [loading, setLoading] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  // Add / Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<ClinicRoom | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [roomType, setRoomType] = useState<ClinicRoomType>('Consultation');
  const [description, setDescription] = useState('');
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

  const sortedRooms = [...allRooms].sort(
    (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
  );

  const handleReorderRooms = async (newOrderedIds: string[]) => {
    if (isReordering) return;
    const previousRooms = [...allRooms];

    const byId = new Map(allRooms.map((r) => [r.id, r]));
    const optimisticRooms: ClinicRoom[] = [];
    newOrderedIds.forEach((id, idx) => {
      const found = byId.get(id);
      if (found) {
        optimisticRooms.push({
          ...found,
          displayOrder: idx + 1,
        });
      }
    });
    setAllRooms(optimisticRooms);
    setIsReordering(true);

    try {
      const [, err] = await clinicService.reorderRooms(newOrderedIds);
      if (err) {
        setAllRooms(previousRooms);
        notify.error(err.message || 'Unable to save room order.');
        return;
      }
      await Promise.all([loadAllRooms(), refreshRooms?.()]);
      notify.success('Room order updated.');
    } catch (e) {
      setAllRooms(previousRooms);
      notify.error(e instanceof Error ? e.message : 'Unable to save room order.');
    } finally {
      setIsReordering(false);
    }
  };

  const handleMoveEarlier = (roomId: string) => {
    const idx = sortedRooms.findIndex((r) => r.id === roomId);
    if (idx <= 0 || isReordering) return;
    const ids = sortedRooms.map((r) => r.id);
    const [moved] = ids.splice(idx, 1);
    ids.splice(idx - 1, 0, moved);
    void handleReorderRooms(ids);
  };

  const handleMoveLater = (roomId: string) => {
    const idx = sortedRooms.findIndex((r) => r.id === roomId);
    if (idx < 0 || idx >= sortedRooms.length - 1 || isReordering) return;
    const ids = sortedRooms.map((r) => r.id);
    const [moved] = ids.splice(idx, 1);
    ids.splice(idx + 1, 0, moved);
    void handleReorderRooms(ids);
  };

  const openAddModal = () => {
    setEditingRoom(null);
    setName('');
    setCode('');
    setRoomType('Consultation');
    setDescription('');
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
      if (editingRoom) {
        const [, err] = await clinicService.updateRoom(editingRoom.id, {
          name: trimmedName,
          code: code.trim() || undefined,
          type: roomType,
          description: description.trim() || undefined,
          displayOrder: editingRoom.displayOrder,
          isActive,
        });
        if (err) {
          setFormError(err.message || 'Unable to update room.');
          return;
        }
        notify.success(`Updated "${trimmedName}".`);
      } else {
        const nextOrder =
          sortedRooms.length > 0
            ? Math.max(...sortedRooms.map((r) => r.displayOrder ?? 0)) + 1
            : 1;

        const [, err] = await clinicService.createRoom({
          name: trimmedName,
          code: code.trim() || undefined,
          type: roomType,
          description: description.trim() || undefined,
          displayOrder: nextOrder,
        });
        if (err) {
          setFormError(err.message || 'Unable to create room.');
          return;
        }
        notify.success(`Created "${trimmedName}".`);
      }

      setModalOpen(false);
      await Promise.all([loadAllRooms(), refreshRooms?.()]);
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
      await Promise.all([loadAllRooms(), refreshRooms?.()]);
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
          subtitle="Configure consultation rooms, triage stations, and treatment/procedure rooms. Drag the # handle on any card to reorder how stations appear across Consultations, Check-In, and TV Display."
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
            {sortedRooms.length === 0 && !loading ? (
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
              <SortableRoomsGrid
                rooms={sortedRooms}
                isReordering={isReordering}
                onReorderEnd={handleReorderRooms}
                onMoveEarlier={handleMoveEarlier}
                onMoveLater={handleMoveLater}
                renderRoomCardContent={(room, _index, dragControls) => {
                  const meta = getRoomTypeMeta(room.type);
                  return (
                    <View
                      style={[
                        styles.roomCard,
                        !room.isActive && styles.roomCardInactive,
                      ]}
                    >
                      <View style={styles.roomTopBlock}>
                        <View style={styles.roomHeader}>
                          <View style={styles.roomIconBadge}>
                            <Icon
                              name={meta.icon}
                              size={theme.sizes.iconMd}
                              color={theme.colors.primaryDark}
                            />
                          </View>
                          <View style={styles.roomTitleCol}>
                            <ThemedText variant="bodyBold" numberOfLines={1}>
                              {room.name}
                            </ThemedText>
                            <View style={styles.roomSubTitleRow}>
                              {room.code ? (
                                <Badge label={room.code} variant="outline" size="sm" />
                              ) : null}
                              <ThemedText variant="caption" color={theme.colors.textSecondary} numberOfLines={1}>
                                {(room.assignedStaffCount ?? 0) > 0
                                  ? `${room.assignedStaffCount} staff assigned`
                                  : 'No fixed staff'}
                              </ThemedText>
                            </View>
                          </View>
                          {dragControls}
                        </View>

                        <View style={styles.roomMetaRow}>
                          <Badge
                            label={meta.label}
                            variant={meta.badgeVariant}
                            size="sm"
                          />
                          {!room.isActive ? (
                            <Badge label="Inactive" variant="neutral" size="sm" />
                          ) : null}
                        </View>

                        <View style={styles.roomDescriptionBox}>
                          <ThemedText
                            variant="small"
                            color={room.description ? theme.colors.textSecondary : theme.colors.textMuted}
                            numberOfLines={2}
                          >
                            {room.description || 'No description'}
                          </ThemedText>
                        </View>
                      </View>

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
                }}
              />
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

          {editingRoom ? (
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
          ) : null}
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
  roomCard: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.md,
    justifyContent: 'space-between',
  },
  roomCardInactive: {
    opacity: 0.65,
  },
  roomTopBlock: {
    gap: theme.spacing.xs,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  roomIconBadge: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  roomTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  roomSubTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  roomMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  roomDescriptionBox: {
    height: 36,
    justifyContent: 'center',
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
