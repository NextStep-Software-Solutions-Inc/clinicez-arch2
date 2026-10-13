import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  StyleProp,
  ViewStyle,
} from 'react-native';
import ThemedText from './ThemedText';
import Button from './Button';
import Badge from './Badge';
import Icon from './Icon';
import Input from './Input';
import Modal from './Modal';
import { theme } from '../../constants/theme';
import { clinicService, ClinicServiceItem } from '../../services/clinicService';

export interface ServiceSelectProps {
  label?: string;
  required?: boolean;
  disabled?: boolean;
  selectedServices: string[];
  onChangeServices: (services: string[]) => void;
  availableServices?: ClinicServiceItem[];
  containerStyle?: StyleProp<ViewStyle>;
  error?: string;
  helperText?: string;
  testID?: string;
}

export default function ServiceSelect({
  label = 'Service type',
  required = false,
  disabled = false,
  selectedServices,
  onChangeServices,
  availableServices: propServices,
  containerStyle,
  error,
  helperText,
  testID = 'service-select',
}: ServiceSelectProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [catalogServices, setCatalogServices] = useState<ClinicServiceItem[]>(propServices || []);
  const [loadingServices, setLoadingServices] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [customServiceName, setCustomServiceName] = useState('');

  // Fetch catalog services if not passed as prop
  useEffect(() => {
    if (propServices && propServices.length > 0) {
      setCatalogServices(propServices);
      return;
    }
    let mounted = true;
    setLoadingServices(true);
    clinicService
      .getServices(undefined, true)
      .then(([items]) => {
        if (mounted && items) {
          setCatalogServices(items);
        }
      })
      .finally(() => {
        if (mounted) setLoadingServices(false);
      });
    return () => {
      mounted = false;
    };
  }, [propServices]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    cats.add('All');
    catalogServices.forEach((s) => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats);
  }, [catalogServices]);

  const filteredServices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return catalogServices.filter((s) => {
      const matchCat =
        selectedCategory === 'All' || s.category.toLowerCase() === selectedCategory.toLowerCase();
      const matchSearch =
        !query ||
        s.name.toLowerCase().includes(query) ||
        s.code.toLowerCase().includes(query) ||
        (s.description && s.description.toLowerCase().includes(query));
      return matchCat && matchSearch;
    });
  }, [catalogServices, searchQuery, selectedCategory]);

  const handleToggleService = (name: string) => {
    if (selectedServices.includes(name)) {
      onChangeServices(selectedServices.filter((s) => s !== name));
    } else {
      onChangeServices([...selectedServices, name]);
    }
  };

  const handleRemoveService = (name: string) => {
    if (disabled) return;
    onChangeServices(selectedServices.filter((s) => s !== name));
  };

  const handleAddCustom = () => {
    const trimmed = customServiceName.trim();
    if (!trimmed) return;
    if (!selectedServices.includes(trimmed)) {
      onChangeServices([...selectedServices, trimmed]);
    }
    setCustomServiceName('');
  };

  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      {label ? (
        <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.label}>
          {label}
          {required ? <ThemedText color={theme.colors.emergency}> *</ThemedText> : null}
        </ThemedText>
      ) : null}

      {/* Main trigger container displaying selected service pills */}
      <View
        style={[
          styles.selectorBox,
          error ? styles.selectorBoxError : null,
          disabled ? styles.selectorBoxDisabled : null,
        ]}
      >
        <View style={styles.chipsContainer}>
          {selectedServices.length === 0 ? (
            <ThemedText variant="body" color={theme.colors.textLight} style={styles.placeholder}>
              Select service(s) from catalog...
            </ThemedText>
          ) : (
            selectedServices.map((svc) => (
              <View key={svc} style={styles.serviceChip}>
                <ThemedText variant="captionBold" color={theme.colors.text}>
                  {svc}
                </ThemedText>
                {!disabled && (
                  <Pressable
                    onPress={() => handleRemoveService(svc)}
                    style={styles.chipRemoveBtn}
                    hitSlop={theme.spacing.xs}
                    accessibilityLabel={`Remove ${svc}`}
                  >
                    <Icon name="close" size={theme.sizes.iconXs} color={theme.colors.textMuted} />
                  </Pressable>
                )}
              </View>
            ))
          )}
        </View>

        {!disabled && (
          <Pressable
            style={styles.openPickerBtn}
            onPress={() => setModalVisible(true)}
            testID={`${testID}-open-btn`}
          >
            <Icon name="plus" size={theme.sizes.iconSm} color={theme.colors.primary} />
            <ThemedText variant="captionBold" color={theme.colors.primary}>
              Browse
            </ThemedText>
          </Pressable>
        )}
      </View>

      {error ? (
        <View style={styles.feedbackRow}>
          <Icon name="alertCircle" size={theme.fontSizes.xs} color={theme.colors.emergency} />
          <ThemedText variant="caption" color={theme.colors.emergency}>
            {error}
          </ThemedText>
        </View>
      ) : helperText ? (
        <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.feedback}>
          {helperText}
        </ThemedText>
      ) : null}

      {/* Service Selection Modal */}
      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Select Services"
        subtitle="Choose one or more items from the official clinic service catalog"
        maxWidth={540}
        footer={
          <View style={styles.modalFooter}>
            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.footerCount}>
              {selectedServices.length} selected
            </ThemedText>
            <Button
              title="Done"
              variant="primary"
              size="sm"
              onPress={() => setModalVisible(false)}
            />
          </View>
        }
      >
        <View style={styles.modalContent}>
          {/* Search bar */}
          <Input
            placeholder="Search catalog service name or code..."
            leftIcon="search"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          {/* Category Chips */}
          <View style={styles.catRow}>
            {categories.map((cat) => {
              const isSel = selectedCategory === cat;
              return (
                <Pressable
                  key={cat}
                  style={[styles.catChip, isSel && styles.catChipSelected]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <ThemedText
                    variant="captionBold"
                    color={isSel ? theme.colors.onPrimary : theme.colors.text}
                  >
                    {cat}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Service items list */}
          <ScrollView style={styles.serviceListScroll} nestedScrollEnabled>
            <View style={styles.listWrap}>
              {loadingServices ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Loading service catalog...
                </ThemedText>
              ) : filteredServices.length === 0 ? (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  No matching services found in catalog.
                </ThemedText>
              ) : (
                filteredServices.map((item) => {
                  const isChecked = selectedServices.includes(item.name);
                  return (
                    <Pressable
                      key={item.id}
                      style={[styles.serviceOptionRow, isChecked && styles.serviceOptionRowChecked]}
                      onPress={() => handleToggleService(item.name)}
                    >
                      <View style={styles.checkboxIcon}>
                        <Icon
                          name={isChecked ? 'checkCircle' : 'dot'}
                          size={theme.sizes.iconSm}
                          color={isChecked ? theme.colors.primary : theme.colors.textLight}
                        />
                      </View>

                      <View style={styles.optionInfo}>
                        <View style={styles.optionTitleRow}>
                          <ThemedText variant="bodyBold">{item.name}</ThemedText>
                          <Badge label={item.category} variant="neutral" size="sm" />
                          {item.isPhilHealthFormulary && (
                            <Badge label="PhilHealth" variant="success" size="sm" />
                          )}
                        </View>
                        {item.description ? (
                          <ThemedText variant="caption" color={theme.colors.textMuted}>
                            {item.description}
                          </ThemedText>
                        ) : null}
                      </View>

                      <View style={styles.optionPrice}>
                        <ThemedText variant="captionBold" color={theme.colors.primary}>
                          ₱{item.standardPrice.toLocaleString()}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          </ScrollView>

          {/* Add custom service option */}
          <View style={styles.customAddSection}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Or add custom service:
            </ThemedText>
            <View style={styles.customAddRow}>
              <View style={styles.flex1}>
                <Input
                  placeholder="e.g. Specialty Pediatric Assessment"
                  value={customServiceName}
                  onChangeText={setCustomServiceName}
                />
              </View>
              <Button
                title="Add"
                size="sm"
                variant="outline"
                disabled={!customServiceName.trim()}
                onPress={handleAddCustom}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.xs,
  },
  label: {
    marginBottom: 2,
  },
  selectorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.sizes.controlMd,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    borderRadius: theme.radii.md,
    gap: theme.spacing.sm,
  },
  selectorBoxError: {
    borderColor: theme.colors.emergency,
    backgroundColor: theme.colors.emergencySubtle,
  },
  selectorBoxDisabled: {
    opacity: 0.6,
    backgroundColor: theme.colors.surfaceMuted,
  },
  chipsContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    alignItems: 'center',
  },
  placeholder: {
    paddingVertical: theme.spacing.xs,
  },
  serviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: theme.colors.primarySubtle,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
  },
  chipRemoveBtn: {
    padding: 2,
  },
  openPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginLeft: 2,
  },
  feedback: {
    marginLeft: 2,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  footerCount: {
    flex: 1,
  },
  modalContent: {
    gap: theme.spacing.md,
  },
  catRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  catChip: {
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surfaceMuted,
  },
  catChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  serviceListScroll: {
    maxHeight: 260,
  },
  listWrap: {
    gap: theme.spacing.xs,
  },
  serviceOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
  },
  serviceOptionRowChecked: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  checkboxIcon: {
    width: 20,
    alignItems: 'center',
  },
  optionInfo: {
    flex: 1,
    gap: 2,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  optionPrice: {
    alignItems: 'flex-end',
  },
  customAddSection: {
    paddingTop: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  customAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  flex1: {
    flex: 1,
  },
});
