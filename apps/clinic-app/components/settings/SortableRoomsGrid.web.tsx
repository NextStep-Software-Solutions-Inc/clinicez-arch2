import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Icon from '../ui/Icon';
import ThemedText from '../ui/ThemedText';
import { theme } from '../../constants/theme';
import { type ClinicRoom } from '../../services/clinicService';
import { type SortableRoomsGridProps } from './SortableRoomsGrid';

function SortableRoomCardItem({
  room,
  index,
  isFirst,
  isLast,
  isReordering,
  onMoveEarlier,
  onMoveLater,
  renderRoomCardContent,
}: {
  room: ClinicRoom;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isReordering: boolean;
  onMoveEarlier: (roomId: string) => void;
  onMoveLater: (roomId: string) => void;
  renderRoomCardContent: (
    room: ClinicRoom,
    index: number,
    dragControls: React.ReactNode,
  ) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: room.id,
    disabled: isReordering,
  });

  const slotStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 99 : 1,
    opacity: isDragging ? 0.82 : 1,
    position: 'relative',
    display: 'flex',
    flex: 1,
    minWidth: 260,
  };

  const dragHandleStyle: React.CSSProperties = {
    touchAction: 'none',
    cursor: isReordering ? 'not-allowed' : isDragging ? 'grabbing' : 'grab',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 3,
    paddingBottom: 3,
    borderRadius: theme.radii.sm,
    backgroundColor: isDragging ? theme.colors.primaryLight : theme.colors.surface,
    border: `1px solid ${isDragging ? theme.colors.primary : theme.colors.borderLight}`,
    userSelect: 'none',
    WebkitUserSelect: 'none',
  };

  const dragControls = (
    <View style={styles.controlsRow}>
      <div
        {...(!isReordering ? attributes : {})}
        {...(!isReordering ? listeners : {})}
        style={dragHandleStyle}
        aria-label={`Drag to reorder ${room.name}`}
        title={`Drag to reorder ${room.name}`}
        role="button"
        tabIndex={!isReordering ? 0 : -1}
      >
        <Icon
          name="gripVertical"
          size={14}
          color={isDragging ? theme.colors.primaryDark : theme.colors.textMuted}
        />
        <ThemedText
          variant="captionBold"
          color={isDragging ? theme.colors.primaryDark : theme.colors.textSecondary}
        >
          #{index + 1}
        </ThemedText>
      </div>
      <View style={styles.arrowPair}>
        <Pressable
          onPress={() => onMoveEarlier(room.id)}
          disabled={isFirst || isReordering}
          accessibilityRole="button"
          accessibilityLabel={`Move ${room.name} earlier`}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={[styles.arrowBtn, (isFirst || isReordering) && styles.arrowBtnDisabled]}
        >
          <Icon
            name="arrowUp"
            size={12}
            color={isFirst || isReordering ? theme.colors.textLight : theme.colors.textMuted}
          />
        </Pressable>
        <Pressable
          onPress={() => onMoveLater(room.id)}
          disabled={isLast || isReordering}
          accessibilityRole="button"
          accessibilityLabel={`Move ${room.name} later`}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={[styles.arrowBtn, (isLast || isReordering) && styles.arrowBtnDisabled]}
        >
          <Icon
            name="arrowDown"
            size={12}
            color={isLast || isReordering ? theme.colors.textLight : theme.colors.textMuted}
          />
        </Pressable>
      </View>
    </View>
  );

  return (
    <div ref={setNodeRef} style={slotStyle}>
      {renderRoomCardContent(room, index, dragControls)}
    </div>
  );
}

export default function SortableRoomsGrid({
  rooms,
  isReordering,
  onReorderEnd,
  onMoveEarlier,
  onMoveLater,
  renderRoomCardContent,
}: SortableRoomsGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || isReordering) return;

    const oldIndex = rooms.findIndex((r) => r.id === active.id);
    const newIndex = rooms.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(rooms, oldIndex, newIndex);
    try {
      await onReorderEnd(reordered.map((r) => r.id));
    } catch {
      // Handled by caller
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={rooms.map((r) => r.id)} strategy={rectSortingStrategy}>
        <View style={styles.roomGrid}>
          {rooms.map((room, index) => (
            <SortableRoomCardItem
              key={room.id}
              room={room}
              index={index}
              isFirst={index === 0}
              isLast={index === rooms.length - 1}
              isReordering={isReordering}
              onMoveEarlier={onMoveEarlier}
              onMoveLater={onMoveLater}
              renderRoomCardContent={renderRoomCardContent}
            />
          ))}
        </View>
      </SortableContext>
    </DndContext>
  );
}

const styles = StyleSheet.create({
  roomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  arrowPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  arrowBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.xs,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  arrowBtnDisabled: {
    opacity: 0.25,
    borderColor: theme.colors.transparent,
  },
});
