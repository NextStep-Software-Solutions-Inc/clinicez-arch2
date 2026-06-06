import { forwardRef, useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import  {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import type { SelectOption } from './ProfileSelectModal';

interface ProfileBottomSheetSelectProps {
  title: string;
  options: SelectOption[];
  selected: string | undefined | null;
  onSelect: (value: string) => void;
}

export type ProfileBottomSheetSelectRef = BottomSheetModal;

const ProfileBottomSheetSelect = forwardRef<BottomSheetModal, ProfileBottomSheetSelectProps>(
  ({ title, options, selected, onSelect }, ref) => {
    const { colors } = useTheme();
    const [query, setQuery] = useState('');
    const snapPoints = ['50%', '85%'];

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
      ),
      [],
    );

    const filtered = query.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
      : options;

    const handleSelect = (value: string) => {
      onSelect(value);
      if (ref && 'current' in ref) ref.current?.dismiss();
    };

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetView style={styles.header}>
          <ThemedText style={[styles.title, { color: colors.text }]}>{title}</ThemedText>
        </BottomSheetView>
        <BottomSheetView style={[styles.searchContainer, { borderColor: colors.border }]}>
          <BottomSheetTextInput
            placeholder="Search…"
            placeholderTextColor={colors.text}
            value={query}
            onChangeText={setQuery}
            style={[
              styles.searchInput,
              { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
            ]}
          />
        </BottomSheetView>
        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => {
            const isSelected = item.value === selected;
            return (
              <Pressable
                onPress={() => handleSelect(item.value)}
                style={({ pressed }) => [
                  styles.option,
                  { borderBottomColor: colors.border },
                  pressed && { opacity: 0.6 },
                  isSelected && { backgroundColor: colors.primary },
                ]}
              >
                <ThemedText
                  style={[
                    styles.optionText,
                    { color: isSelected ? colors.primary : colors.text },
                    isSelected && { fontWeight: '600' },
                  ]}
                >
                  {item.label}
                </ThemedText>
                {isSelected && (
                  <ThemedText style={{ color: colors.primary, fontSize: 16 }}>✓</ThemedText>
                )}
              </Pressable>
            );
          }}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      </BottomSheetModal>
    );
  },
);

ProfileBottomSheetSelect.displayName = 'ProfileBottomSheetSelect';

export default ProfileBottomSheetSelect;

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: 15,
  },
  listContent: {
    paddingBottom: 40,
  },
});
