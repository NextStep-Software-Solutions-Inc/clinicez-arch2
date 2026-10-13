import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import Icon from '../ui/Icon';
import ThemedText from '../ui/ThemedText';
import { theme } from '../../constants/theme';
import { ClinicCustomFieldDefinition } from '../../services/clinicService';

export type ReorderControlsMode = 'both' | 'dnd' | 'arrows';

export interface SortableCustomFieldsListProps {
  fields: ClinicCustomFieldDefinition[];
  sortedFields: ClinicCustomFieldDefinition[];
  isReordering: boolean;
  canDrag: boolean;
  reorderMode: ReorderControlsMode;
  onReorderEnd: (newOrderedIds: string[]) => Promise<void>;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  renderFieldContent: (field: ClinicCustomFieldDefinition) => React.ReactNode;
}

export function SortableFieldRow({
  field,
  index,
  globalIndex,
  isFirst,
  isLast,
  isReordering,
  canDrag,
  reorderMode,
  onMoveUp,
  onMoveDown,
  renderFieldContent,
}: {
  field: ClinicCustomFieldDefinition;
  index: number;
  globalIndex: number;
  isFirst: boolean;
  isLast: boolean;
  isReordering: boolean;
  canDrag: boolean;
  reorderMode: ReorderControlsMode;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  renderFieldContent: (field: ClinicCustomFieldDefinition) => React.ReactNode;
}) {
  const showDragHandle = reorderMode !== 'arrows';
  const showArrows = reorderMode !== 'dnd';

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: field.id,
    disabled: !canDrag || !showDragHandle || isReordering,
  });

  const rowStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 99 : 1,
    opacity: isDragging ? 0.75 : 1,
    position: 'relative',
  };

  const dragHandleStyle: React.CSSProperties = {
    touchAction: 'none',
    cursor: canDrag ? (isDragging ? 'grabbing' : 'grab') : 'not-allowed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xs,
    borderRadius: theme.radii.xs,
    opacity: canDrag ? (isReordering ? 0.4 : 1) : 0.35,
    userSelect: 'none',
    WebkitUserSelect: 'none',
  };

  return (
    <div ref={setNodeRef} style={rowStyle}>
      <View style={[styles.fieldItem, isDragging && styles.fieldItemDragging]}>
        {/* Reorder Column: Drag Handle + Sequence # + Subtle Up/Down Controls */}
        <View style={styles.reorderControlsCol}>
          {showDragHandle && (
            <div
              {...(canDrag && !isReordering ? attributes : {})}
              {...(canDrag && !isReordering ? listeners : {})}
              style={dragHandleStyle}
              aria-label={`Drag to reorder ${field.label}`}
              title={
                canDrag
                  ? `Drag to reorder ${field.label}`
                  : "Drag-and-drop is available in 'All' category view"
              }
              role="button"
              tabIndex={canDrag && !isReordering ? 0 : -1}
            >
              <Icon
                name="gripVertical"
                size={theme.sizes.iconSm}
                color={
                  isDragging
                    ? theme.colors.primary
                    : canDrag
                    ? theme.colors.textMuted
                    : theme.colors.textLight
                }
              />
            </div>
          )}

          <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sequenceIndexText}>
            #{globalIndex >= 0 ? globalIndex + 1 : index + 1}
          </ThemedText>

          {showArrows && (
            <View style={styles.reorderButtonPair}>
              <Pressable
                onPress={() => onMoveUp(field.id)}
                disabled={isFirst || isReordering}
                accessibilityRole="button"
                accessibilityLabel={`Move "${field.label}" up`}
                hitSlop={{ top: 9, bottom: 9, left: 9, right: 9 }}
                style={[
                  styles.subtleArrowBtn,
                  (isFirst || isReordering) && styles.subtleArrowBtnDisabled,
                ]}
              >
                <Icon
                  name="arrowUp"
                  size={14}
                  color={isFirst || isReordering ? theme.colors.textLight : theme.colors.textMuted}
                />
              </Pressable>
              <Pressable
                onPress={() => onMoveDown(field.id)}
                disabled={isLast || isReordering}
                accessibilityRole="button"
                accessibilityLabel={`Move "${field.label}" down`}
                hitSlop={{ top: 9, bottom: 9, left: 9, right: 9 }}
                style={[
                  styles.subtleArrowBtn,
                  (isLast || isReordering) && styles.subtleArrowBtnDisabled,
                ]}
              >
                <Icon
                  name="arrowDown"
                  size={14}
                  color={isLast || isReordering ? theme.colors.textLight : theme.colors.textMuted}
                />
              </Pressable>
            </View>
          )}
        </View>

        {/* Content & Action buttons */}
        {renderFieldContent(field)}
      </View>
    </div>
  );
}

export default function SortableCustomFieldsList({
  fields,
  sortedFields,
  isReordering,
  canDrag,
  reorderMode,
  onReorderEnd,
  onMoveUp,
  onMoveDown,
  renderFieldContent,
}: SortableCustomFieldsListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !canDrag || isReordering) return;

    const oldIndex = sortedFields.findIndex((f) => f.id === active.id);
    const newIndex = sortedFields.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(sortedFields, oldIndex, newIndex);
    try {
      await onReorderEnd(reordered.map((f) => f.id));
    } catch {}
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
        <View style={styles.fieldList}>
          {fields.map((field, index) => {
            const globalIndex = sortedFields.findIndex((f) => f.id === field.id);
            return (
              <SortableFieldRow
                key={field.id}
                field={field}
                index={index}
                globalIndex={globalIndex}
                isFirst={index <= 0}
                isLast={index >= fields.length - 1}
                isReordering={isReordering}
                canDrag={canDrag}
                reorderMode={reorderMode}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                renderFieldContent={renderFieldContent}
              />
            );
          })}
        </View>
      </SortableContext>
    </DndContext>
  );
}

const styles = StyleSheet.create({
  fieldList: {
    gap: theme.spacing.sm,
  },
  fieldItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  fieldItemDragging: {
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.md,
    ...theme.shadows.md,
  },
  reorderControlsCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    minWidth: 48,
  },
  sequenceIndexText: {
    textAlign: 'center',
  },
  reorderButtonPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  subtleArrowBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.transparent,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  subtleArrowBtnDisabled: {
    opacity: 0.25,
    borderColor: theme.colors.transparent,
  },
});
