import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Pressable,
  Modal,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { format } from 'date-fns';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

// ─── Config ───────────────────────────────────────────────────────────────────
const ITEM_H = 46;
const VISIBLE = 5; // must be odd
const PAD = 2; // (VISIBLE - 1) / 2

// ─── Static option lists ──────────────────────────────────────────────────────
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const YEAR_START = 1920;
const YEAR_END = new Date().getFullYear() + 10;
const ALL_YEARS = Array.from({ length: YEAR_END - YEAR_START + 1 }, (_, i) => String(YEAR_START + i));
const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1)); // '1'..'12'
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')); // '00'..'59'
const AMPM_LIST = ['AM', 'PM'];

// ─── Types ────────────────────────────────────────────────────────────────────
type PickerMode = 'date' | 'time';

interface ProfileDatePickerProps {
  label: string;
  value: string | undefined | null;
  onChange: (value: string) => void;
  mode?: PickerMode;
  minimumDate?: Date;
  maximumDate?: Date;
  required?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseDate(v: string | undefined | null): Date {
  const d = v ? new Date(`${v}T00:00:00`) : new Date();
  return isNaN(d.getTime()) ? new Date() : d;
}

function parseTime(v: string | undefined | null): Date {
  const d = new Date();
  if (v) {
    const [h, m] = v.split(':').map(Number);
    d.setHours(h ?? 0, m ?? 0, 0, 0);
  }
  return d;
}

function numDaysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatDisplay(value: string | undefined | null, mode: PickerMode): string {
  if (!value) return 'Not set';
  const d = mode === 'date' ? parseDate(value) : parseTime(value);
  return mode === 'date' ? format(d, 'MMMM d, yyyy') : format(d, 'h:mm a');
}

// ─── WheelPicker ─────────────────────────────────────────────────────────────
interface WheelPickerProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  flex?: number;
}

function WheelPicker({ items, selectedIndex, onSelect, flex = 1 }: WheelPickerProps) {
  const { colors } = useAppTheme();
  const scrollRef = useRef<ScrollView>(null);

  const paddedData = [...Array(PAD).fill(''), ...items, ...Array(PAD).fill('')];

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
  }, [selectedIndex]);

  const onMomentumScrollEnd = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    onSelect(Math.max(0, Math.min(idx, items.length - 1)));
  };

  return (
    <View style={{ flex, height: ITEM_H * VISIBLE, overflow: 'hidden' }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, width: '100%' }}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
      >
        {paddedData.map((item, index) => {
          const isSelected = index - PAD === selectedIndex;
          return (
            <View key={String(index)} style={[styles.wheelItem, { height: ITEM_H }]}>
              {item !== '' && (
                <ThemedText
                  variant={isSelected ? 'bodyBold' : 'body'}
                  style={[
                    styles.wheelText,
                    { color: colors.text },
                    isSelected ? styles.wheelTextSelected : styles.wheelTextDim,
                  ]}
                  numberOfLines={1}
                >
                  {item}
                </ThemedText>
              )}
            </View>
          );
        })}
      </ScrollView>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'space-between' }]}>
        <View style={{ height: ITEM_H * PAD, backgroundColor: colors.surface, opacity: 0.72 }} />
        <View style={{ height: ITEM_H * PAD, backgroundColor: colors.surface, opacity: 0.72 }} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.selectionRail, { top: ITEM_H * PAD, height: ITEM_H, borderColor: colors.border }]}
      />
    </View>
  );
}

// ─── DatePickerWheels ─────────────────────────────────────────────────────────
function DatePickerWheels({ date, onChange }: { date: Date; onChange: (d: Date) => void }) {
  const month = date.getMonth();
  const year = date.getFullYear();
  const day = date.getDate() - 1;
  const yearIdx = Math.max(0, Math.min(year - YEAR_START, ALL_YEARS.length - 1));
  const numDays = numDaysInMonth(month, year);
  const DAYS = Array.from({ length: numDays }, (_, i) => String(i + 1));

  const commit = (m: number, dayIdx: number, yIdx: number) => {
    const y = YEAR_START + yIdx;
    const safeDay = Math.min(dayIdx, numDaysInMonth(m, y) - 1) + 1;
    onChange(new Date(y, m, safeDay));
  };

  return (
    <View style={styles.wheelsRow}>
      <WheelPicker items={MONTHS} selectedIndex={month} onSelect={(i) => commit(i, day, yearIdx)} flex={3} />
      <WheelPicker items={DAYS} selectedIndex={Math.min(day, numDays - 1)} onSelect={(i) => commit(month, i, yearIdx)} flex={2} />
      <WheelPicker items={ALL_YEARS} selectedIndex={yearIdx} onSelect={(i) => commit(month, day, i)} flex={2} />
    </View>
  );
}

// ─── TimePickerWheels ─────────────────────────────────────────────────────────
function TimePickerWheels({ date, onChange }: { date: Date; onChange: (d: Date) => void }) {
  const h24 = date.getHours();
  const isPM = h24 >= 12;
  const hourIdx = h24 % 12 === 0 ? 11 : (h24 % 12) - 1;
  const minuteIdx = date.getMinutes();

  const commit = (hIdx: number, mIdx: number, pm: boolean) => {
    const h24new = ((hIdx + 1) % 12) + (pm ? 12 : 0);
    const d = new Date(date);
    d.setHours(h24new, mIdx, 0, 0);
    onChange(d);
  };

  return (
    <View style={styles.wheelsRow}>
      <WheelPicker items={HOURS_12} selectedIndex={hourIdx} onSelect={(i) => commit(i, minuteIdx, isPM)} flex={2} />
      <WheelPicker items={MINUTES} selectedIndex={minuteIdx} onSelect={(i) => commit(hourIdx, i, isPM)} flex={2} />
      <WheelPicker items={AMPM_LIST} selectedIndex={isPM ? 1 : 0} onSelect={(i) => commit(hourIdx, minuteIdx, i === 1)} flex={2} />
    </View>
  );
}

// ─── ProfileDatePicker ────────────────────────────────────────────────────────
export default function ProfileDatePicker({
  label,
  value,
  onChange,
  mode = 'date',
  required = false,
}: ProfileDatePickerProps) {
  const { colors, radii, sizes } = useAppTheme();
  const [show, setShow] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(() =>
    mode === 'date' ? parseDate(value) : parseTime(value)
  );

  const handleOpen = () => {
    setTempDate(mode === 'date' ? parseDate(value) : parseTime(value));
    setShow(true);
  };

  const handleDone = () => {
    onChange(mode === 'date' ? format(tempDate, 'yyyy-MM-dd') : format(tempDate, 'HH:mm'));
    setShow(false);
  };

  const handleCancel = () => setShow(false);

  return (
    <View style={styles.container}>
      <ThemedText variant="smallBold" style={[styles.label, { color: colors.text }]}>
        {label}
        {required && <ThemedText variant="smallBold" color="emergency"> *</ThemedText>}
      </ThemedText>
      <Pressable
        onPress={handleOpen}
        style={({ pressed, hovered }: any) => [
          styles.trigger,
          {
            borderColor: colors.border,
            backgroundColor: colors.surface,
            borderRadius: radii.md,
          },
          hovered && { backgroundColor: colors.surfaceSubtle },
          pressed && { opacity: 0.7 },
        ]}
      >
        <ThemedText
          variant="body"
          style={{ color: colors.text, opacity: value ? 1 : 0.5 }}
        >
          {formatDisplay(value, mode)}
        </ThemedText>
        <AppIcon
          name={mode === 'date' ? 'calendar' : 'clock'}
          size={sizes.iconSm}
          color="textMuted"
        />
      </Pressable>

      {show && (
        <Modal visible transparent animationType="slide" onRequestClose={handleCancel} statusBarTranslucent>
          <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleCancel} />

            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderTopLeftRadius: radii.xl,
                  borderTopRightRadius: radii.xl,
                },
              ]}
            >
              <View style={[styles.toolbar, { borderBottomColor: colors.borderLight }]}>
                <Pressable onPress={handleCancel} style={styles.toolbarBtn} hitSlop={8}>
                  <ThemedText variant="body" color="emergency">
                    Cancel
                  </ThemedText>
                </Pressable>
                <ThemedText variant="bodyBold" style={{ color: colors.text }}>
                  {label}
                </ThemedText>
                <Pressable onPress={handleDone} style={[styles.toolbarBtn, styles.toolbarBtnRight]} hitSlop={8}>
                  <ThemedText variant="bodyBold" color="primary">
                    Done
                  </ThemedText>
                </Pressable>
              </View>
              <View style={styles.pickersContainer}>
                {mode === 'date' ? (
                  <DatePickerWheels date={tempDate} onChange={setTempDate} />
                ) : (
                  <TimePickerWheels date={tempDate} onChange={setTempDate} />
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  label: {
    marginBottom: 5,
    opacity: 0.65,
  },
  trigger: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 32,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  toolbarBtnRight: {
    alignItems: 'flex-end',
  },
  pickersContainer: {
    paddingVertical: 8,
  },
  wheelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  wheelItem: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  wheelText: {
    textAlign: 'center',
  },
  wheelTextSelected: {
    opacity: 1,
  },
  wheelTextDim: {
    opacity: 0.35,
  },
  selectionRail: {
    position: 'absolute',
    left: 8,
    right: 8,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
  },
});