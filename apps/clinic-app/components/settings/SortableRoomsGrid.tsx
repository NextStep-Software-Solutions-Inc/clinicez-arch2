import React from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import Icon from '../ui/Icon';
import ThemedText from '../ui/ThemedText';
import { theme } from '../../constants/theme';
import { type ClinicRoom } from '../../services/clinicService';

export const ROOM_CARD_WIDTH = 284;
export const ROOM_CARD_HEIGHT = 196;

export interface SortableRoomsGridProps {
  rooms: ClinicRoom[];
  isReordering: boolean;
  onReorderEnd: (newOrderedIds: string[]) => Promise<void>;
  onMoveEarlier: (roomId: string) => void;
  onMoveLater: (roomId: string) => void;
  renderRoomCardContent: (
    room: ClinicRoom,
    index: number,
    dragControls: React.ReactNode,
  ) => React.ReactNode;
}

export default function SortableRoomsGrid({
  rooms,
  isReordering,
  onMoveEarlier,
  onMoveLater,
  renderRoomCardContent,
}: SortableRoomsGridProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      contentContainerStyle={styles.roomRow}
    >
      {rooms.map((room, index) => {
        const isFirst = index === 0;
        const isLast = index === rooms.length - 1;
        const dragControls = (
          <View style={styles.reorderHeaderPill}>
            <Icon name="gripVertical" size={14} color={theme.colors.textMuted} />
            <ThemedText variant="captionBold" color={theme.colors.textMuted}>
              #{index + 1}
            </ThemedText>
            <View style={styles.arrowPair}>
              <Pressable
                onPress={() => onMoveEarlier(room.id)}
                disabled={isFirst || isReordering}
                accessibilityRole="button"
                accessibilityLabel={`Move ${room.name} left`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[styles.arrowBtn, (isFirst || isReordering) && styles.arrowBtnDisabled]}
              >
                <Icon
                  name="arrowLeft"
                  size={12}
                  color={isFirst || isReordering ? theme.colors.textLight : theme.colors.textMuted}
                />
              </Pressable>
              <Pressable
                onPress={() => onMoveLater(room.id)}
                disabled={isLast || isReordering}
                accessibilityRole="button"
                accessibilityLabel={`Move ${room.name} right`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[styles.arrowBtn, (isLast || isReordering) && styles.arrowBtnDisabled]}
              >
                <Icon
                  name="arrowRight"
                  size={12}
                  color={isLast || isReordering ? theme.colors.textLight : theme.colors.textMuted}
                />
              </Pressable>
            </View>
          </View>
        );

        return (
          <View key={room.id} style={styles.cardSlot}>
            {renderRoomCardContent(room, index, dragControls)}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  roomRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  cardSlot: {
    width: ROOM_CARD_WIDTH,
    minWidth: ROOM_CARD_WIDTH,
    maxWidth: ROOM_CARD_WIDTH,
    height: ROOM_CARD_HEIGHT,
    flexShrink: 0,
  },
  reorderHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  arrowPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  arrowBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.xs,
  },
  arrowBtnDisabled: {
    opacity: 0.3,
  },
});
