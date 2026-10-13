import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
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

export function SortableFieldRowNative({
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

  return (
    <View style={styles.fieldItem}>
      {/* Reorder Column: Drag Handle + Sequence # + Subtle Up/Down Controls */}
      <View style={styles.reorderControlsCol}>
        {showDragHandle && (
          <View
            style={[styles.gripHandle, !canDrag && styles.gripHandleDisabled]}
            accessibilityRole="none"
            accessibilityLabel={`Drag handle for ${field.label}`}
          >
            <Icon
              name="gripVertical"
              size={theme.sizes.iconSm}
              color={canDrag ? theme.colors.textMuted : theme.colors.textLight}
            />
          </View>
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
  );
}

export default function SortableCustomFieldsList({
  fields,
  sortedFields,
  isReordering,
  canDrag,
  reorderMode,
  onMoveUp,
  onMoveDown,
  renderFieldContent,
}: SortableCustomFieldsListProps) {
  return (
    <View style={styles.fieldList}>
      {fields.map((field, index) => {
        const globalIndex = sortedFields.findIndex((f) => f.id === field.id);
        return (
          <SortableFieldRowNative
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
  reorderControlsCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    minWidth: 48,
  },
  sequenceIndexText: {
    textAlign: 'center',
  },
  gripHandle: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gripHandleDisabled: {
    opacity: 0.35,
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
