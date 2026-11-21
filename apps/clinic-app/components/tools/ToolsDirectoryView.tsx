import React, { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, Platform, PressableStateCallbackType } from 'react-native';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  ThemedText,
  type BadgeVariant,
} from '@ui';
import { theme } from '@constants/theme';
import { useBreakpoint } from '@utils/useBreakpoint';
import {
  filterToolsCatalog,
  type ClinicToolDefinition,
  type ToolCategoryKey,
} from './toolsCatalog';
import { FilterChip } from './ToolsUiHelpers';

export interface ToolsDirectoryViewProps {
  tools: readonly ClinicToolDefinition[];
  onOpenTool: (tool: ClinicToolDefinition) => void;
}

type CategoryFilter = 'all' | ToolCategoryKey;
type InteractionState = PressableStateCallbackType & { hovered?: boolean };

interface CategoryDisplayMeta {
  label: string;
  subtitle: string;
  badgeVariant: BadgeVariant;
  actionLabel: string;
  iconBg: string;
  iconBorder: string;
  iconColor: string;
}

const CATEGORY_META: Record<ToolCategoryKey, CategoryDisplayMeta> = {
  calculators: {
    label: 'Clinical Calculators',
    subtitle: 'BMI, heart risk, child growth, pregnancy due date, dosing, and kidney calculators.',
    badgeVariant: 'routine',
    actionLabel: 'Open calculator',
    iconBg: theme.colors.primarySubtle,
    iconBorder: theme.colors.primaryBorder,
    iconColor: theme.colors.primary,
  },
  lookups: {
    label: 'Medical & Reference Lookups',
    subtitle: 'Quick search for diagnosis codes, clinic service fees, and Philippine addresses.',
    badgeVariant: 'info',
    actionLabel: 'Open lookup',
    iconBg: theme.colors.infoBg,
    iconBorder: theme.colors.infoBorder,
    iconColor: theme.colors.infoText,
  },
  yakap: {
    label: 'PhilHealth Yakap',
    subtitle: 'PhilHealth number check, GAMOT medicine benefits, prescription codes, and assigned patient list.',
    badgeVariant: 'success',
    actionLabel: 'Open Yakap tool',
    iconBg: theme.colors.successBg,
    iconBorder: theme.colors.successBorder,
    iconColor: theme.colors.successText,
  },
  operations: {
    label: 'Front-Desk & Operations',
    subtitle: 'Patient QR check-in scanner, lobby TV queue links, and printable reception posters.',
    badgeVariant: 'purple',
    actionLabel: 'Open tool',
    iconBg: theme.colors.purpleBg,
    iconBorder: theme.colors.purpleBorder,
    iconColor: theme.colors.purpleText,
  },
};

const CATEGORY_DISPLAY_ORDER: readonly ToolCategoryKey[] = [
  'calculators',
  'lookups',
  'yakap',
  'operations',
];

export default function ToolsDirectoryView({ tools, onOpenTool }: ToolsDirectoryViewProps) {
  const { isDesktop, isCompact } = useBreakpoint();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');

  const availableCategories = useMemo<ToolCategoryKey[]>(() => {
    return CATEGORY_DISPLAY_ORDER.filter((cat) => tools.some((t) => t.tab === cat));
  }, [tools]);

  const categoryCounts = useMemo<Record<CategoryFilter, number>>(() => {
    const counts: Record<CategoryFilter, number> = {
      all: tools.length,
      yakap: 0,
      calculators: 0,
      lookups: 0,
      operations: 0,
    };
    for (const tool of tools) {
      counts[tool.tab] = (counts[tool.tab] || 0) + 1;
    }
    return counts;
  }, [tools]);

  const filteredTools = useMemo(
    () => filterToolsCatalog(tools, { query: searchQuery, category: selectedCategory }),
    [tools, searchQuery, selectedCategory],
  );

  const groupedSections = useMemo(() => {
    const isGroupedMode = selectedCategory === 'all' && !searchQuery.trim();
    if (!isGroupedMode) return null;
    return availableCategories
      .map((cat) => ({
        key: cat,
        ...CATEGORY_META[cat],
        items: filteredTools.filter((t) => t.tab === cat),
      }))
      .filter((section) => section.items.length > 0);
  }, [availableCategories, filteredTools, searchQuery, selectedCategory]);

  const cardWidthStyle = isDesktop
    ? styles.toolCardDesktop
    : isCompact
      ? styles.toolCardMobile
      : styles.toolCardTablet;

  const renderToolCard = (tool: ClinicToolDefinition) => {
    const meta = CATEGORY_META[tool.tab];
    return (
      <Pressable
        key={tool.id}
        testID={`tool-directory-card-${tool.id}`}
        onPress={() => onOpenTool(tool)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${tool.title}`}
        style={(state: InteractionState) => [
          styles.toolCard,
          cardWidthStyle,
          state.hovered && styles.toolCardHover,
          state.pressed && styles.toolCardPressed,
        ]}
      >
        <View style={styles.toolCardTop}>
          <View
            style={[
              styles.toolIconTile,
              {
                backgroundColor: meta.iconBg,
                borderColor: meta.iconBorder,
              },
            ]}
          >
            <Icon name={tool.icon} size={theme.sizes.iconMd} color={meta.iconColor} />
          </View>
          <Badge label={tool.badgeLabel} variant={meta.badgeVariant} size="sm" />
        </View>

        <View style={styles.toolCardBody}>
          <ThemedText variant="bodyBold" numberOfLines={2}>
            {tool.title}
          </ThemedText>
          <ThemedText variant="small" color={theme.colors.textMuted} numberOfLines={3}>
            {tool.description}
          </ThemedText>
        </View>

        <View style={styles.toolCardFooter}>
          <ThemedText variant="captionBold" color={theme.colors.primary}>
            {meta.actionLabel}
          </ThemedText>
          <Icon name="arrowRight" size={theme.sizes.iconSm} color={theme.colors.primary} />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search & Category Filter Bar */}
      <Card>
        <View style={styles.searchBarRow}>
          <View style={styles.flexFill}>
            <Input
              leftIcon="search"
              placeholder="Search tools by name, condition, PhilHealth PIN, address, or QR..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
          </View>
          {searchQuery.trim().length > 0 ? (
            <Button
              title="Clear"
              variant="ghost"
              size="sm"
              icon="close"
              onPress={() => setSearchQuery('')}
            />
          ) : null}
        </View>

        <View style={styles.chipRow}>
          <FilterChip
            label={`All (${categoryCounts.all})`}
            active={selectedCategory === 'all'}
            onPress={() => setSelectedCategory('all')}
          />
          {availableCategories.map((cat) => (
            <FilterChip
              key={cat}
              label={`${CATEGORY_META[cat].label} (${categoryCounts[cat]})`}
              active={selectedCategory === cat}
              onPress={() => setSelectedCategory(cat)}
            />
          ))}
        </View>
      </Card>

      {/* Results */}
      {filteredTools.length === 0 ? (
        <Card>
          <EmptyState
            icon="search"
            title="No matching tools"
            description="Try a different keyword or clear the category filter to view all tools."
            actionTitle="Reset filters"
            onAction={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
          />
        </Card>
      ) : groupedSections ? (
        <View style={styles.sectionsStack}>
          {groupedSections.map((section) => (
            <View key={section.key} style={styles.sectionBlock}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderText}>
                  <ThemedText variant="h3">{section.label}</ThemedText>
                  <ThemedText variant="small" color={theme.colors.textMuted}>
                    {section.subtitle}
                  </ThemedText>
                </View>
                <Badge label={`${section.items.length} tools`} variant="neutral" size="sm" />
              </View>
              <View style={styles.cardsGrid}>{section.items.map(renderToolCard)}</View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <ThemedText variant="bodyBold">
              {selectedCategory === 'all'
                ? `Matching tools (${filteredTools.length})`
                : `${CATEGORY_META[selectedCategory].label} (${filteredTools.length})`}
            </ThemedText>
          </View>
          <View style={styles.cardsGrid}>{filteredTools.map(renderToolCard)}</View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  flexFill: {
    flex: 1,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  sectionsStack: {
    gap: theme.spacing.xl,
  },
  sectionBlock: {
    gap: theme.spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  sectionHeaderText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: theme.spacing.md,
  },
  toolCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    ...theme.shadows.sm,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease',
      } as any,
    }),
  },
  toolCardDesktop: {
    flexGrow: 0,
    flexShrink: 0,
    ...Platform.select({
      web: {
        width: `calc((100% - ${theme.spacing.md * 2}px) / 3)`,
      } as any,
      default: {
        flexBasis: '31%',
        minWidth: 260,
      },
    }),
  },
  toolCardTablet: {
    flexGrow: 0,
    flexShrink: 0,
    ...Platform.select({
      web: {
        width: `calc((100% - ${theme.spacing.md}px) / 2)`,
      } as any,
      default: {
        flexBasis: '48%',
        minWidth: 240,
      },
    }),
  },
  toolCardMobile: {
    width: '100%',
  },
  toolCardHover: {
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.brandSubtle,
  },
  toolCardPressed: {
    opacity: 0.92,
  },
  toolCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  toolIconTile: {
    width: theme.sizes.controlMd,
    height: theme.sizes.controlMd,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolCardBody: {
    gap: theme.spacing.xs,
    flex: 1,
  },
  toolCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
});
