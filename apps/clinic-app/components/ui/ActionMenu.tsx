import React, { useState, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  ViewStyle,
  LayoutRectangle,
} from 'react-native';
import ThemedText from './ThemedText';
import Icon, { IconName } from './Icon';
import { theme } from '../../constants/theme';

export interface ActionMenuItem {
  id: string;
  label: string;
  icon?: IconName;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  hint?: string;
  dividerBefore?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  align?: 'left' | 'right';
  triggerAriaLabel?: string;
  disabled?: boolean;
  customTrigger?: (props: { open: () => void; isOpen: boolean }) => React.ReactNode;
}

interface MenuCoords {
  top: number;
  right?: number;
  left?: number;
}

export default function ActionMenu({
  items,
  align = 'right',
  triggerAriaLabel = 'More actions',
  disabled = false,
  customTrigger,
}: ActionMenuProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const triggerRef = useRef<View>(null);

  const calculatePosition = useCallback((x: number, y: number, width: number, height: number) => {
    const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
    const estimatedMenuHeight = items.length * 40 + 16;
    const shouldOpenUp = y + height + estimatedMenuHeight > windowHeight - 16;

    const top = shouldOpenUp
      ? Math.max(16, y - estimatedMenuHeight)
      : Math.min(windowHeight - estimatedMenuHeight - 16, y + height + 4);

    if (align === 'left') {
      const left = Math.max(12, Math.min(x, windowWidth - 220));
      setCoords({ top, left });
    } else {
      const right = Math.max(12, windowWidth - (x + width));
      setCoords({ top, right });
    }
  }, [align, items.length]);

  const handleOpen = () => {
    if (disabled) return;

    if (triggerRef.current) {
      const triggerEl = triggerRef.current as any;
      if (typeof triggerEl.measureInWindow === 'function') {
        triggerEl.measureInWindow((x: number, y: number, width: number, height: number) => {
          calculatePosition(x, y, width, height);
          setVisible(true);
        });
        return;
      }
      if (typeof triggerEl.getBoundingClientRect === 'function') {
        const rect = triggerEl.getBoundingClientRect();
        calculatePosition(rect.left, rect.top, rect.width, rect.height);
        setVisible(true);
        return;
      }
    }

    setCoords(null);
    setVisible(true);
  };

  const handleClose = () => {
    setVisible(false);
  };

  return (
    <View collapsable={false}>
      <View ref={triggerRef} collapsable={false}>
        {customTrigger ? (
          customTrigger({ open: handleOpen, isOpen: visible })
        ) : (
          <Pressable
            onPress={handleOpen}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={triggerAriaLabel}
            hitSlop={theme.spacing.xs}
            style={({ pressed, hovered }: any) => [
              styles.triggerBtn,
              (hovered || pressed || visible) && styles.triggerBtnHovered,
              disabled && styles.triggerBtnDisabled,
            ]}
          >
            <Icon
              name="kebab"
              size={theme.sizes.iconMd}
              color={visible ? theme.colors.primary : theme.colors.textMuted}
            />
          </Pressable>
        )}
      </View>

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={handleClose}
      >
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          accessibilityLabel="Close actions menu"
          accessibilityRole="button"
        >
          <View
            style={[
              styles.menuCard,
              coords ? {
                top: coords.top,
                ...(coords.right != null ? { right: coords.right } : {}),
                ...(coords.left != null ? { left: coords.left } : {}),
              } : styles.fallbackCenter,
            ]}
            onStartShouldSetResponder={() => true}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {items.map((item) => (
              <React.Fragment key={item.id}>
                {item.dividerBefore ? <View style={styles.divider} /> : null}
                <Pressable
                  onPress={() => {
                    handleClose();
                    item.onPress();
                  }}
                  disabled={item.disabled}
                  accessibilityRole="menuitem"
                  accessibilityLabel={item.label}
                  style={({ pressed, hovered }: any) => [
                    styles.menuItem,
                    (hovered || pressed) && !item.disabled && styles.menuItemHovered,
                    item.disabled && styles.menuItemDisabled,
                  ]}
                >
                  {item.icon ? (
                    <View style={styles.itemIconSlot}>
                      <Icon
                        name={item.icon}
                        size={theme.sizes.iconSm}
                        color={
                          item.destructive
                            ? theme.colors.emergency
                            : item.disabled
                            ? theme.colors.textLight
                            : theme.colors.textMuted
                        }
                      />
                    </View>
                  ) : null}

                  <View style={styles.itemContentCol}>
                    <ThemedText
                      variant="small"
                      color={
                        item.destructive
                          ? theme.colors.emergency
                          : item.disabled
                          ? theme.colors.textLight
                          : theme.colors.text
                      }
                      style={styles.itemLabel}
                    >
                      {item.label}
                    </ThemedText>
                    {item.hint ? (
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {item.hint}
                      </ThemedText>
                    ) : null}
                  </View>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  triggerBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  triggerBtnHovered: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderDark,
  },
  triggerBtnDisabled: {
    opacity: 0.5,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuCard: {
    position: 'absolute',
    minWidth: 200,
    maxWidth: 280,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.xs,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  fallbackCenter: {
    top: '30%',
    alignSelf: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginVertical: theme.spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  menuItemHovered: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  menuItemDisabled: {
    opacity: 0.45,
  },
  itemIconSlot: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContentCol: {
    flex: 1,
  },
  itemLabel: {
    fontWeight: '500',
  },
});
